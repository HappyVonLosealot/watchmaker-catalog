import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env, pipeline } from "@huggingface/transformers";

const MODEL_ID = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modelRoot = path.resolve(desktopRoot, process.argv[2] ?? "dist/local-model");

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = `${modelRoot}${path.sep}`;

const extractor = await pipeline("feature-extraction", MODEL_ID, { dtype: "q8" });
const output = await extractor(
  [
    "A funny movie about the ordinary daily life of cats.",
    "A playful comedy following house cats through their everyday adventures.",
    "A stand-up comedian performs topical jokes for a live audience.",
  ],
  { pooling: "mean", normalize: true },
);
const vectors = output.tolist();

function cosine(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

assert.equal(vectors.length, 3);
assert.equal(vectors[0].length, 384);
const catSimilarity = cosine(vectors[0], vectors[1]);
const standupSimilarity = cosine(vectors[0], vectors[2]);
assert.ok(
  catSimilarity > standupSimilarity + 0.12,
  `Expected cat story (${catSimilarity}) to outrank stand-up (${standupSimilarity}).`,
);

console.log(
  `Local semantic model verified: cat story ${catSimilarity.toFixed(3)}, ` +
    `stand-up ${standupSimilarity.toFixed(3)}.`,
);
