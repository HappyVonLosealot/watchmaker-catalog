import { describe, expect, it } from "vitest";
import type { CatalogItem, ContentFormat, VibeScores } from "../types";
import { recommendFromPrompt } from "./promptRecommendations";

const neutralVibe: VibeScores = {
  cozyStressful: 0,
  funnyGrim: 0,
  slowFast: 0,
  lightDevastating: 0,
  productionPolish: 0.6,
};

function semanticVector(first: number, second = 0): string {
  const bytes = new Uint8Array(384);
  bytes[0] = first & 0xff;
  bytes[1] = second & 0xff;
  return btoa(String.fromCharCode(...bytes));
}

function item(
  id: number,
  title: string,
  overview: string,
  genreNames: string[] = [],
  format: ContentFormat = "movie",
  details: Partial<Pick<CatalogItem, "semanticVector" | "vibeScores">> = {},
): CatalogItem {
  return {
    key: `${format === "movie" ? "movie" : "tv"}:${id}`,
    tmdbId: id,
    mediaType: format === "movie" ? "movie" : "tv",
    contentFormat: format,
    title,
    originalTitle: title,
    overview,
    posterPath: "/poster.jpg",
    backdropPath: "/backdrop.jpg",
    releaseDate: "2024-01-01",
    genreIds: genreNames.map((_, index) => index + 1),
    genreNames,
    voteAverage: 8,
    voteCount: 1000,
    popularity: 40,
    providerLinks: [{ providerId: 8, providerName: "Netflix" }],
    syncedAt: 1,
    vibeScores: details.vibeScores ?? neutralVibe,
    semanticVector: details.semanticVector,
  };
}

describe("Tell Me Whatcu' Want", () => {
  it("prioritizes full-description keyword coverage over a loose genre tag", () => {
    const storyMatch = item(
      1,
      "Undead Hearts",
      "Two lovers protect each other while zombies overrun their isolated city.",
      ["Drama"],
    );
    const tagOnly = item(
      2,
      "Date Night",
      "A restaurant owner prepares for an important food critic.",
      ["Romance", "Horror"],
    );

    const result = recommendFromPrompt([tagOnly, storyMatch], "A zombie romance");

    expect(result.matches[0]?.item).toBe(storyMatch);
    expect(result.matches[0]?.matchedKeywords).toEqual(expect.arrayContaining([
      "zombies / undead",
      "romance",
    ]));
  });

  it("keeps the subject above incidental words in the cat-life prompt", () => {
    const cats = item(
      1,
      "Whisker Days",
      "A playful comedy following house cats through their everyday adventures.",
      ["Comedy"],
      "movie",
      { semanticVector: semanticVector(127) },
    );
    const standup = item(
      2,
      "The Daily Stand-Up",
      "A funny comedian performs topical jokes for a live audience each day.",
      ["Comedy"],
      "movie",
      { semanticVector: semanticVector(0, 127) },
    );
    const promptVector = new Float32Array(384);
    promptVector[0] = 1;

    const result = recommendFromPrompt(
      [standup, cats],
      "A funny movie about the daily life of cats",
      new Map(),
      Date.now(),
      promptVector,
    );

    expect(result.semantic).toBe(true);
    expect(result.coreIdeas).toEqual(["cats"]);
    expect(result.moodIdeas).toEqual(["funny"]);
    expect(result.matches.map((match) => match.item)).toEqual([cats]);
  });

  it("understands a simple exclusion such as no romance", () => {
    const romantic = item(
      1,
      "Coupled Up",
      "A funny group of friends navigates romance and dating.",
      ["Comedy", "Romance"],
    );
    const allowed = item(
      2,
      "Bad Decisions",
      "A funny group of friends causes chaos during a road trip.",
      ["Comedy"],
    );

    const result = recommendFromPrompt(
      [romantic, allowed],
      "Something funny with friends but no romance",
    );

    expect(result.excludedKeywords).toContain("romance");
    expect(result.matches.map((match) => match.item)).toEqual([allowed]);
  });

  it("uses an explicit format as an exact requirement", () => {
    const film = item(1, "Cozy Film", "A warm and gentle magical story.", [], "movie");
    const mini = item(2, "Cozy Mini", "A warm and gentle magical story.", [], "miniseries");

    const result = recommendFromPrompt([film, mini], "A cozy magical mini series");

    expect(result.format).toBe("miniseries");
    expect(result.matches.map((match) => match.item)).toEqual([mini]);
  });

  it("uses precomputed vibe scores when a mood is not literally written in the synopsis", () => {
    const cozy = item(1, "Soft Night", "Neighbours spend an evening together.", [], "movie", {
      vibeScores: { ...neutralVibe, cozyStressful: -0.95, lightDevastating: -0.7 },
    });
    const tense = item(2, "Hard Night", "Neighbours spend an evening together.", [], "movie", {
      vibeScores: { ...neutralVibe, cozyStressful: 0.9, lightDevastating: 0.5 },
    });

    const result = recommendFromPrompt([tense, cozy], "Something cozy");

    expect(result.matches[0]?.item).toBe(cozy);
  });

  it("recognizes a referenced catalogue title and does not recommend the seed itself", () => {
    const seed = item(1, "Stranger Things", "A supernatural mystery in a small town.", [], "series", {
      semanticVector: semanticVector(127),
    });
    const close = item(2, "Dark", "Families uncover a supernatural mystery across generations.", [], "series", {
      semanticVector: semanticVector(124, 18),
    });
    const distant = item(3, "Kitchen Laughs", "Chefs trade jokes during dinner service.", ["Comedy"], "series", {
      semanticVector: semanticVector(10, 126),
    });

    const result = recommendFromPrompt(
      [seed, distant, close],
      "Something like Stranger Things",
    );

    expect(result.referencedTitles).toEqual(["Stranger Things"]);
    expect(result.matches[0]?.item).toBe(close);
    expect(result.matches.map((match) => match.item)).not.toContain(seed);
  });

  it("ignores filler-only prompts instead of pretending to understand them", () => {
    const result = recommendFromPrompt(
      [item(1, "Anything", "A story.")],
      "I want something good to watch please",
    );

    expect(result.meaningful).toBe(false);
    expect(result.matches).toEqual([]);
  });

  it("never returns a locally disliked title", () => {
    const disliked = item(1, "Funny One", "Friends make jokes on a trip.", ["Comedy"]);
    const allowed = item(2, "Funny Two", "Friends make jokes at work.", ["Comedy"]);
    const result = recommendFromPrompt(
      [disliked, allowed],
      "Funny friends",
      new Map([[disliked.key, "disliked"]]),
    );

    expect(result.matches.map((match) => match.item)).toEqual([allowed]);
  });

  it("keeps description-first matching practical across a large local catalogue", () => {
    const catalog = Array.from({ length: 5_000 }, (_, index) =>
      index === 4_999
        ? item(
            index + 1,
            "The Last Bus",
            "A funny group of friends escapes zombies on a broken-down bus.",
            ["Comedy"],
          )
        : item(
            index + 1,
            `Cooking Hour ${index}`,
            `A chef prepares recipe number ${index} for a restaurant contest.`,
            ["Reality"],
          ),
    );

    const result = recommendFromPrompt(catalog, "Funny friends surviving zombies");

    expect(result.matches[0]?.item.title).toBe("The Last Bus");
  });
});
