import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../types";
import { rankTasteMatches, recommendationReason, tasteScore } from "./recommendations";

function item(
  key: string,
  genreIds: number[],
  overview = "",
  mediaType: "movie" | "tv" = "movie",
): CatalogItem {
  return {
    key,
    tmdbId: Number(key.split(":")[1]),
    mediaType,
    title: key,
    originalTitle: key,
    overview,
    posterPath: null,
    backdropPath: null,
    releaseDate: "2024-01-01",
    genreIds,
    genreNames: genreIds.map(String),
    voteAverage: 8,
    voteCount: 1000,
    popularity: 50,
    providerLinks: [{ providerId: 1, providerName: "Service" }],
    syncedAt: 1,
  };
}

describe("Tastemaker", () => {
  it("ranks shared-genre titles above unrelated titles", () => {
    const seed = item("movie:1", [35, 14]);
    const close = item("movie:2", [35, 14]);
    const distant = item("movie:3", [99]);
    expect(tasteScore(close, [seed])).toBeGreaterThan(tasteScore(distant, [seed]));
  });

  it("prioritizes synopsis likeness over an exact genre match", () => {
    const seed = item(
      "movie:1",
      [27, 35],
      "A reluctant survivor protects her sister during a zombie outbreak in a quarantined city.",
    );
    const storyMatch = item(
      "movie:2",
      [10749],
      "Two sisters fall in love while surviving the undead outbreak that has sealed their city.",
    );
    const tagMatch = item(
      "movie:3",
      [27, 35],
      "A comedian inherits a remote theatre and fights to save its final stage production.",
    );

    expect(tasteScore(storyMatch, [seed])).toBeGreaterThan(tasteScore(tagMatch, [seed]));
    expect(rankTasteMatches([storyMatch, tagMatch], [seed])[0]?.key).toBe(storyMatch.key);
  });

  it("understands closely related synopsis words such as zombie and undead", () => {
    const seed = item("movie:1", [27], "A zombie horde traps survivors inside a hospital.");
    const related = item("movie:2", [10749], "A romance begins while the undead surround a hospital.");
    const unrelated = item("movie:3", [27], "A haunted painting torments an isolated collector.");

    expect(tasteScore(related, [seed])).toBeGreaterThan(tasteScore(unrelated, [seed]));
  });

  it("never recommends a seed or a locally disliked title", () => {
    const seed = item("movie:1", [35]);
    const disliked = item("movie:2", [35]);
    const good = item("movie:3", [35]);
    const ranked = rankTasteMatches(
      [seed, disliked, good],
      [seed],
      new Map([[disliked.key, "disliked"]]),
    );
    expect(ranked.map((entry) => entry.key)).toEqual([good.key]);
  });

  it("explains a recommendation using shared description ideas", () => {
    const seed = item("movie:1", [27], "Survivors flee a zombie outbreak across the city.");
    const match = item("movie:2", [10749], "A couple crosses the city while escaping the undead.");

    expect(recommendationReason(match, [seed])).toMatch(/description shares/i);
    expect(recommendationReason(match, [seed])).toMatch(/zombies and the undead/i);
  });

  it("ranks a large local catalogue without changing the description-first order", () => {
    const seed = item(
      "movie:1",
      [27],
      "A survivor searches a quarantined city for her sister during a zombie outbreak.",
    );
    const catalog = Array.from({ length: 5_000 }, (_, index) => (
      index === 4_999
        ? item(
            `movie:${index + 2}`,
            [10749],
            "A woman searches the quarantined city for her sister as the undead outbreak spreads.",
          )
        : item(
            `movie:${index + 2}`,
            [27],
            `A chef enters cooking contest number ${index} to save a neighbourhood restaurant.`,
          )
    ));

    expect(rankTasteMatches(catalog, [seed])[0]?.key).toBe("movie:5001");
  });
});
