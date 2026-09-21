export const SEMANTIC_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
export const SEMANTIC_VECTOR_DIMENSIONS = 384;
export const SEMANTIC_VECTOR_FORMAT = "int8-base64-v1";

const DEFAULT_BATCH_SIZE = 96;

export const VIBE_AXIS_PROTOTYPES = {
  cozyStressful: {
    low:
      "A warm, gentle and comforting story with a safe, soothing, cozy atmosphere and kind relationships.",
    high:
      "A tense, anxious and stressful story driven by danger, pressure, suspense, dread and difficult choices.",
  },
  funnyGrim: {
    low:
      "A funny, playful and witty comedy full of jokes, absurd situations, cheerful banter and comic relief.",
    high:
      "A grim, bleak and severe story with brutality, despair, cruelty, darkness and disturbing consequences.",
  },
  slowFast: {
    low:
      "A patient, quiet and contemplative slow-burn story that develops gradually and values atmosphere over action.",
    high:
      "A fast-paced, energetic and relentless story packed with action, momentum, chases, urgency and rapid twists.",
  },
  lightDevastating: {
    low:
      "A light-hearted, uplifting and hopeful story that feels easy, cheerful, sweet and emotionally reassuring.",
    high:
      "An emotionally devastating and heartbreaking story about grief, loss, tragedy, trauma and painful consequences.",
  },
};

export function semanticDocument(item) {
  const overview = item.overview?.trim() || item.title;
  const genres = item.genreNames?.filter(Boolean).join(", ") || "Uncategorised";
  return `Story: ${overview}\nTitle: ${item.title}\nCategories: ${genres}`;
}

export function quantizeSemanticVector(values) {
  if (!Array.isArray(values) || values.length !== SEMANTIC_VECTOR_DIMENSIONS) {
    throw new Error(
      `Semantic model returned ${values?.length ?? "no"} dimensions; ` +
        `expected ${SEMANTIC_VECTOR_DIMENSIONS}.`,
    );
  }

  const bytes = new Uint8Array(SEMANTIC_VECTOR_DIMENSIONS);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!Number.isFinite(value)) throw new Error("Semantic model returned a non-finite value.");
    const quantized = Math.max(-127, Math.min(127, Math.round(value * 127)));
    bytes[index] = quantized & 0xff;
  }
  return Buffer.from(bytes).toString("base64");
}

function decodeSemanticVector(encoded) {
  const values = new Int8Array(Buffer.from(encoded, "base64"));
  if (values.length !== SEMANTIC_VECTOR_DIMENSIONS) {
    throw new Error("Semantic fingerprint has an unexpected number of dimensions.");
  }
  let squaredLength = 0;
  for (const value of values) squaredLength += value * value;
  return { values, length: Math.sqrt(squaredLength) };
}

function cosineSimilarity(left, right) {
  if (left.length === 0 || right.length === 0) return 0;
  let dotProduct = 0;
  for (let index = 0; index < SEMANTIC_VECTOR_DIMENSIONS; index += 1) {
    dotProduct += left.values[index] * right.values[index];
  }
  return Math.max(-1, Math.min(1, dotProduct / (left.length * right.length)));
}

function rounded(value, digits = 4) {
  return Number(value.toFixed(digits));
}

export function estimateProductionPolish(item) {
  const rating = Math.max(0, Math.min(1, Number(item.voteAverage || 0) / 10));
  const ratingConfidence = Math.max(0, Math.min(1, Math.log10(Number(item.voteCount || 0) + 1) / 4));
  const popularity = Math.max(0, Math.min(1, Math.log10(Number(item.popularity || 0) + 1) / 3));
  const artwork = (item.posterPath ? 0.5 : 0) + (item.backdropPath ? 0.5 : 0);
  return rounded(
    Math.max(0, Math.min(1, rating * 0.28 + ratingConfidence * 0.3 + popularity * 0.27 + artwork * 0.15)),
  );
}

function safeBatchSize(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.max(8, Math.min(parsed, 256)) : DEFAULT_BATCH_SIZE;
}

export async function createSemanticEncoder(options = {}) {
  const batchSize = safeBatchSize(options.batchSize);
  const model = options.model ?? SEMANTIC_MODEL;
  const cache = new Map();
  let extractor = options.extractor;

  async function getExtractor() {
    if (extractor) return extractor;
    const transformers = await import("@huggingface/transformers");
    transformers.env.allowLocalModels = false;
    transformers.env.cacheDir =
      process.env.WATCHMAKER_MODEL_CACHE?.trim() || ".cache/transformers";
    extractor = await transformers.pipeline("feature-extraction", model, { dtype: "q8" });
    return extractor;
  }

  async function encodeDocuments(documents) {
    const missing = [...new Set(documents.filter((document) => !cache.has(document)))];
    const featureExtractor = missing.length > 0 ? await getExtractor() : null;

    for (let start = 0; start < missing.length; start += batchSize) {
      const batch = missing.slice(start, start + batchSize);
      const output = await featureExtractor(batch, { pooling: "mean", normalize: true });
      const rows = output.tolist();
      if (!Array.isArray(rows) || rows.length !== batch.length) {
        throw new Error("Semantic model returned an unexpected batch shape.");
      }
      batch.forEach((document, index) => {
        cache.set(document, quantizeSemanticVector(rows[index]));
      });
    }

    return documents.map((document) => cache.get(document));
  }

  async function attach(items) {
    const documents = items.map(semanticDocument);
    const vectors = await encodeDocuments(documents);

    return items.map((item, index) => ({
      ...item,
      semanticVector: vectors[index],
    }));
  }

  async function attachVibes(items) {
    const withVectors = items.every((item) => item.semanticVector)
      ? items
      : await attach(items);
    const axisEntries = Object.entries(VIBE_AXIS_PROTOTYPES);
    const prototypeDocuments = axisEntries.flatMap(([, prototypes]) => [
      prototypes.low,
      prototypes.high,
    ]);
    const prototypeVectors = (await encodeDocuments(prototypeDocuments)).map(decodeSemanticVector);

    return withVectors.map((item) => {
      const itemVector = decodeSemanticVector(item.semanticVector);
      const vibeScores = {};
      axisEntries.forEach(([axis], index) => {
        const lowSimilarity = cosineSimilarity(itemVector, prototypeVectors[index * 2]);
        const highSimilarity = cosineSimilarity(itemVector, prototypeVectors[index * 2 + 1]);
        vibeScores[axis] = rounded(Math.tanh((highSimilarity - lowSimilarity) * 5));
      });
      vibeScores.productionPolish = estimateProductionPolish(item);
      return { ...item, vibeScores };
    });
  }

  return {
    attach,
    attachVibes,
    format: SEMANTIC_VECTOR_FORMAT,
    dimensions: SEMANTIC_VECTOR_DIMENSIONS,
    model,
  };
}
