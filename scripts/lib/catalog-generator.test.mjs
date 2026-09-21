import assert from "node:assert/strict";
import test from "node:test";
import { fetchCatalogSlice } from "./catalog-generator.mjs";

test("classifies TV miniseries with TMDb's discover type filter", async () => {
  const calls = [];
  const tmdbGet = async (endpoint, params) => {
    calls.push({ endpoint, params });
    return {
      total_pages: 1,
      results: params.with_type === 2
        ? [{ id: 2, name: "A Limited Story", genre_ids: [] }]
        : [
            { id: 1, name: "An Ongoing Story", genre_ids: [] },
            { id: 2, name: "A Limited Story", genre_ids: [] },
          ],
    };
  };
  const items = await fetchCatalogSlice({
    tmdbGet,
    region: "US",
    language: "en-US",
    providerGroup: {
      provider: { id: 8, name: "Netflix", logoPath: null, kind: "watch" },
      sourceIds: { movie: [8], tv: [8] },
    },
    mediaType: "tv",
    genres: { movie: {}, tv: {} },
    generatedAt: 1,
    resolveDropoutNetworkId: async () => 0,
    pageLimit: 500,
    exhaustive: true,
    concurrency: 4,
    warnings: [],
  });

  assert.equal(items.find((item) => item.tmdbId === 1)?.contentFormat, "series");
  assert.equal(items.find((item) => item.tmdbId === 2)?.contentFormat, "miniseries");
  assert.ok(calls.some(({ params }) => params.with_type === 2));
});

test("always labels films as movies", async () => {
  const items = await fetchCatalogSlice({
    tmdbGet: async () => ({
      total_pages: 1,
      results: [{ id: 7, title: "A Film", genre_ids: [] }],
    }),
    region: "US",
    language: "en-US",
    providerGroup: {
      provider: { id: 8, name: "Netflix", logoPath: null, kind: "watch" },
      sourceIds: { movie: [8], tv: [8] },
    },
    mediaType: "movie",
    genres: { movie: {}, tv: {} },
    generatedAt: 1,
    resolveDropoutNetworkId: async () => 0,
    pageLimit: 500,
    exhaustive: true,
    concurrency: 4,
    warnings: [],
  });

  assert.equal(items[0].contentFormat, "movie");
});
