import { describe, expect, it } from "vitest";
import type { CatalogItem, VibeScores } from "../types";
import { buildSmartCollections } from "./collections";

function item(id: number, title: string, vibeScores: VibeScores, popularity = 20): CatalogItem {
  return {
    key: `movie:${id}`,
    tmdbId: id,
    mediaType: "movie",
    contentFormat: "movie",
    title,
    originalTitle: title,
    overview: "A story.",
    posterPath: "/poster.jpg",
    backdropPath: "/backdrop.jpg",
    releaseDate: "2024-01-01",
    genreIds: [],
    genreNames: [],
    voteAverage: 8,
    voteCount: 500,
    popularity,
    vibeScores,
    providerLinks: [{ providerId: 8, providerName: "Netflix" }],
    syncedAt: 1,
  };
}

const base: VibeScores = {
  cozyStressful: 0,
  funnyGrim: 0,
  slowFast: 0,
  lightDevastating: 0,
  productionPolish: 0.65,
};

describe("Smart Collections", () => {
  it("rebuilds mood-led shelves from the current catalogue", () => {
    const comfort = item(1, "Comfort", {
      ...base,
      cozyStressful: -0.8,
      lightDevastating: -0.8,
    });
    const bleak = item(2, "Bleak", {
      ...base,
      funnyGrim: 0.8,
      lightDevastating: 0.9,
    });
    const fast = item(3, "Fast", {
      ...base,
      slowFast: 0.9,
      cozyStressful: 0.8,
    });
    const collections = buildSmartCollections([comfort, bleak, fast]);

    expect(collections.find((entry) => entry.id === "comfort")?.items).toContain(comfort);
    expect(collections.find((entry) => entry.id === "bleak")?.items).toContain(bleak);
    expect(collections.find((entry) => entry.id === "full-throttle")?.items).toContain(fast);
  });
});
