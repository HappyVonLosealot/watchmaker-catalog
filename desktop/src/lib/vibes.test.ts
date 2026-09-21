import { describe, expect, it } from "vitest";
import type { CatalogItem, VibeScores } from "../types";
import {
  DEFAULT_VIBE_PREFERENCES,
  rankVibeMatches,
  vibePreferenceSummary,
  type VibePreferences,
} from "./vibes";

function item(
  id: number,
  title: string,
  format: CatalogItem["contentFormat"],
  vibeScores: VibeScores,
): CatalogItem {
  return {
    key: `${format === "movie" ? "movie" : "tv"}:${id}`,
    tmdbId: id,
    mediaType: format === "movie" ? "movie" : "tv",
    contentFormat: format,
    title,
    originalTitle: title,
    overview: "A story.",
    posterPath: "/poster.jpg",
    backdropPath: "/backdrop.jpg",
    releaseDate: "2024-01-01",
    genreIds: [],
    genreNames: [],
    voteAverage: 8,
    voteCount: 1000,
    popularity: 50,
    vibeScores,
    providerLinks: [{ providerId: 8, providerName: "Netflix" }],
    syncedAt: 1,
  };
}

const neutral: VibeScores = {
  cozyStressful: 0,
  funnyGrim: 0,
  slowFast: 0,
  lightDevastating: 0,
  productionPolish: 0.5,
};

function preferences(overrides: Partial<VibePreferences>): VibePreferences {
  return { ...DEFAULT_VIBE_PREFERENCES, ...overrides };
}

describe("What's The Vibe", () => {
  it("treats the selected format as an exact requirement", () => {
    const movie = item(1, "Movie", "movie", neutral);
    const mini = item(2, "Mini", "miniseries", neutral);
    const series = item(3, "Series", "series", neutral);

    expect(rankVibeMatches([movie, series, mini], preferences({ format: "miniseries" })))
      .toEqual([mini]);
  });

  it("ranks the requested story vibe above a conflicting one", () => {
    const cozy = item(1, "Cozy", "movie", { ...neutral, cozyStressful: -0.9 });
    const tense = item(2, "Tense", "movie", { ...neutral, cozyStressful: 0.9 });

    expect(rankVibeMatches([tense, cozy], preferences({ cozyStressful: -1 }))[0]).toBe(cozy);
  });

  it("makes Anything Goes remove the production constraint instead of rewarding rough work", () => {
    const rough = item(1, "A Rough", "movie", { ...neutral, productionPolish: 0.1 });
    const polished = item(2, "Z Polished", "movie", { ...neutral, productionPolish: 0.95 });

    expect(rankVibeMatches([rough, polished], preferences({ production: 0 }))[0]).toBe(polished);
    expect(rankVibeMatches([polished, rough], preferences({ production: 1 }))[0]).toBe(rough);
  });

  it("excludes locally disliked titles", () => {
    const disliked = item(1, "Disliked", "movie", neutral);
    const allowed = item(2, "Allowed", "movie", neutral);
    const signals = new Map([[disliked.key, "disliked" as const]]);

    expect(rankVibeMatches([disliked, allowed], preferences({ funnyGrim: 0 }), signals))
      .toEqual([allowed]);
  });

  it("labels the three-point tone dial clearly", () => {
    expect(vibePreferenceSummary(preferences({ funnyGrim: -1 }))).toBe("funny");
    expect(vibePreferenceSummary(preferences({ funnyGrim: 0 }))).toBe("serious");
    expect(vibePreferenceSummary(preferences({ funnyGrim: 1 }))).toBe("grim");
  });
});
