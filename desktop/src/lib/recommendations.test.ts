import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../types";
import { rankTasteMatches, recommendationReason, tasteScore } from "./recommendations";

function item(
  key: string,
  genreIds: number[],
  overview = "",
  mediaType: "movie" | "tv" = "movie",
  details: Partial<Pick<CatalogItem, "title" | "genreNames" | "semanticVector">> = {},
): CatalogItem {
  return {
    key,
    tmdbId: Number(key.split(":")[1]),
    mediaType,
    title: details.title ?? key,
    originalTitle: key,
    overview,
    posterPath: null,
    backdropPath: null,
    releaseDate: "2024-01-01",
    genreIds,
    genreNames: details.genreNames ?? genreIds.map(String),
    voteAverage: 8,
    voteCount: 1000,
    popularity: 50,
    providerLinks: [{ providerId: 1, providerName: "Service" }],
    syncedAt: 1,
    semanticVector: details.semanticVector,
  };
}

function semanticVector(first: number, second = 0): string {
  const bytes = new Uint8Array(384);
  bytes[0] = first & 0xff;
  bytes[1] = second & 0xff;
  return btoa(String.fromCharCode(...bytes));
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

  it("uses whole-synopsis meaning and format guardrails instead of one shared word", () => {
    const seed = item(
      "tv:66732",
      [10759, 9648, 10765],
      "When a young boy vanishes, a small town uncovers secret experiments and supernatural forces.",
      "tv",
      {
        title: "Stranger Things",
        genreNames: ["Action & Adventure", "Mystery", "Sci-Fi & Fantasy"],
        semanticVector: semanticVector(127),
      },
    );
    const dark = item(
      "tv:70523",
      [80, 18, 10765, 9648],
      "A missing child sends four families into a mystery spanning generations.",
      "tv",
      {
        title: "Dark",
        genreNames: ["Crime", "Drama", "Sci-Fi & Fantasy", "Mystery"],
        semanticVector: semanticVector(124, 18),
      },
    );
    const encanto = item(
      "movie:568124",
      [16, 35, 10751, 14],
      "A magical family in Colombia depends on the one child without a gift.",
      "movie",
      {
        title: "Encanto",
        genreNames: ["Animation", "Comedy", "Family", "Fantasy"],
        semanticVector: semanticVector(48, 112),
      },
    );

    const ranked = rankTasteMatches([encanto, dark], [seed]);
    expect(ranked[0]?.title).toBe("Dark");
    expect(ranked.map((entry) => entry.title)).not.toContain("Encanto");
    expect(recommendationReason(dark, [seed])).toMatch(/overall story, setting and tone/i);
  });

  it("keeps a genuine animated franchise match despite the animation guardrail", () => {
    const seed = item("tv:1", [9648], "A supernatural mystery in Hawkins.", "tv", {
      title: "Stranger Things",
      genreNames: ["Mystery", "Sci-Fi & Fantasy"],
      semanticVector: semanticVector(127),
    });
    const sequel = item("tv:2", [16, 9648], "Hawkins faces fresh mysteries in 1985.", "tv", {
      title: "Stranger Things: Tales from '85",
      genreNames: ["Animation", "Mystery", "Sci-Fi & Fantasy"],
      semanticVector: semanticVector(125, 12),
    });
    const unrelatedAnimation = item("tv:3", [16], "A cheerful animated family adventure.", "tv", {
      title: "Happy House",
      genreNames: ["Animation", "Comedy", "Family"],
      semanticVector: semanticVector(90, 75),
    });

    expect(rankTasteMatches([unrelatedAnimation, sequel], [seed])[0]?.title).toBe(
      "Stranger Things: Tales from '85",
    );
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
