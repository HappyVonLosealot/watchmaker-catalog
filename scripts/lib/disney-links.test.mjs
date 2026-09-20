import assert from "node:assert/strict";
import test from "node:test";
import {
  createDisneyLinkResolver,
  disneyCandidateUrl,
  disneyLocale,
  isSafePublishedDisneyUrl,
  selectDisneyCandidate,
  tmdbWatchUrl,
} from "./disney-links.mjs";

const NORMAL_RANK = "http://wikiba.se/ontology#NormalRank";

function item({ tmdbId, mediaType, title, originalTitle = title }) {
  return {
    key: `${mediaType}:${tmdbId}`,
    tmdbId,
    mediaType,
    title,
    originalTitle,
    providerLinks: [{ providerId: 337, providerName: "Disney+" }],
  };
}

function binding(tmdbId, kind, value, name = "") {
  const result = {
    tmdb: { type: "literal", value: String(tmdbId) },
    kind: { type: "literal", value: kind },
    value: { type: "literal", value },
    rank: { type: "uri", value: NORMAL_RANK },
  };
  if (name) result.name = { type: "literal", value: name };
  return result;
}

test("builds a Disney locale from the catalogue language and viewing region", () => {
  assert.equal(disneyLocale("tr-TR", "TR"), "tr-tr");
  assert.equal(disneyLocale("en-US", "TR"), "en-tr");
});

test("prefers the primary Encanto page over a named sing-along variant", () => {
  const encanto = item({ tmdbId: 568124, mediaType: "movie", title: "Encanto" });
  const primary = {
    kind: "browse",
    value: "entity-328b0ec7-6e50-4ead-aa7f-c8bb92e6f08a",
    name: "",
    rank: NORMAL_RANK,
  };
  const singAlong = {
    kind: "browse",
    value: "entity-15149446-6018-4a4c-908b-0433b530c8e4",
    name: "Encanto Sing-Along",
    rank: NORMAL_RANK,
  };

  assert.deepEqual(selectDisneyCandidate([singAlong, primary], encanto), primary);
  assert.equal(
    disneyCandidateUrl(primary, { mediaType: "movie", region: "TR", language: "tr-TR" }),
    "https://www.disneyplus.com/tr-tr/browse/entity-328b0ec7-6e50-4ead-aa7f-c8bb92e6f08a",
  );
});

test("resolves exact Disney pages ahead of time and falls back to a title-specific handoff", async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    calls.push(init);
    return new Response(JSON.stringify({
      results: {
        bindings: [
          binding(
            568124,
            "browse",
            "entity-328b0ec7-6e50-4ead-aa7f-c8bb92e6f08a",
          ),
        ],
      },
    }), { status: 200, headers: { "Content-Type": "application/sparql-results+json" } });
  };
  const resolver = createDisneyLinkResolver({ fetchImpl, sleep: async () => {}, retries: 1 });
  const titles = [
    item({ tmdbId: 568124, mediaType: "movie", title: "Encanto" }),
    item({ tmdbId: 999, mediaType: "movie", title: "Unmapped Film" }),
  ];

  const first = await resolver.attach(titles, {
    mediaType: "movie",
    region: "TR",
    language: "en-US",
  });
  const second = await resolver.attach(titles, {
    mediaType: "movie",
    region: "TR",
    language: "tr-TR",
  });

  assert.equal(calls.length, 1, "Wikidata IDs should be reused across catalogue languages");
  assert.match(String(calls[0].body), /P4947/);
  assert.equal(
    first.items[0].providerLinks[0].url,
    "https://www.disneyplus.com/en-tr/browse/entity-328b0ec7-6e50-4ead-aa7f-c8bb92e6f08a",
  );
  assert.equal(
    first.items[1].providerLinks[0].url,
    "https://www.themoviedb.org/movie/999/watch?locale=TR",
  );
  assert.equal(
    second.items[0].providerLinks[0].url,
    "https://www.disneyplus.com/tr-tr/browse/entity-328b0ec7-6e50-4ead-aa7f-c8bb92e6f08a",
  );
  assert.equal(first.directCount, 1);
  assert.equal(first.fallbackCount, 1);
});

test("accepts only exact safe Disney or matching TMDb handoff URLs", () => {
  const context = {
    mediaType: "tv",
    tmdbId: 1433,
    region: "TR",
    language: "tr-TR",
  };
  assert.equal(isSafePublishedDisneyUrl(
    "https://www.disneyplus.com/tr-tr/browse/entity-5b4ab988-e3a7-4750-a11a-9aa3d65f8cfe",
    context,
  ), true);
  assert.equal(isSafePublishedDisneyUrl(tmdbWatchUrl("tv", 1433, "TR"), context), true);
  assert.equal(isSafePublishedDisneyUrl(
    "https://www.themoviedb.org/tv/999/watch?locale=TR",
    context,
  ), false);
  assert.equal(isSafePublishedDisneyUrl(
    "https://www.disneyplus.com.attacker.invalid/tr-tr/browse/entity-5b4ab988-e3a7-4750-a11a-9aa3d65f8cfe",
    context,
  ), false);
});

