import assert from "node:assert/strict";
import test from "node:test";
import {
  createSemanticEncoder,
  quantizeSemanticVector,
  semanticDocument,
  SEMANTIC_VECTOR_DIMENSIONS,
} from "./semantic-vectors.mjs";

function vector(first = 0) {
  return Array.from({ length: SEMANTIC_VECTOR_DIMENSIONS }, (_, index) =>
    index === 0 ? first : 0,
  );
}

test("quantizes a normalized vector into a compact signed int8 payload", () => {
  const encoded = quantizeSemanticVector(vector(-1));
  const decoded = new Int8Array(Buffer.from(encoded, "base64"));

  assert.equal(Buffer.from(encoded, "base64").byteLength, SEMANTIC_VECTOR_DIMENSIONS);
  assert.equal(decoded[0], -127);
  assert.equal(decoded[1], 0);
});

test("semantic documents put the full story ahead of title and categories", () => {
  const document = semanticDocument({
    title: "Example",
    overview: "A complete plot description.",
    genreNames: ["Mystery", "Drama"],
  });

  assert.match(document, /^Story: A complete plot description\./);
  assert.match(document, /Title: Example/);
  assert.match(document, /Categories: Mystery, Drama$/);
});

test("the encoder batches uncached descriptions and reuses their fingerprints", async () => {
  const calls = [];
  const extractor = async (documents, options) => {
    calls.push({ documents, options });
    return { tolist: () => documents.map(() => vector(1)) };
  };
  const encoder = await createSemanticEncoder({ extractor, batchSize: 8 });
  const item = {
    title: "A Show",
    overview: "Friends uncover a supernatural mystery in their small town.",
    genreNames: ["Mystery"],
  };

  const first = await encoder.attach([item, item]);
  const second = await encoder.attach([item]);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].documents.length, 1);
  assert.deepEqual(calls[0].options, { pooling: "mean", normalize: true });
  assert.equal(first[0].semanticVector, first[1].semanticVector);
  assert.equal(second[0].semanticVector, first[0].semanticVector);
});
