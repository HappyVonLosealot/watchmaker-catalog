export const SEMANTIC_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
export const SEMANTIC_VECTOR_DIMENSIONS = 384;
export const SEMANTIC_VECTOR_FORMAT = "int8-base64-v1";

const DEFAULT_BATCH_SIZE = 96;

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

  async function attach(items) {
    const documents = items.map(semanticDocument);
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

    return items.map((item, index) => ({
      ...item,
      semanticVector: cache.get(documents[index]),
    }));
  }

  return {
    attach,
    format: SEMANTIC_VECTOR_FORMAT,
    dimensions: SEMANTIC_VECTOR_DIMENSIONS,
    model,
  };
}
