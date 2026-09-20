import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../types";
import { rankHotlineItems } from "./hotline";

function item(
  id: number,
  mediaType: CatalogItem["mediaType"],
  providerId: number,
  popularity: number,
  trendingRank?: number,
  releaseDate = "2026-01-01",
): CatalogItem {
  return {
    key: `${mediaType}:${id}`,
    tmdbId: id,
    mediaType,
    title: `Title ${id}`,
    originalTitle: `Title ${id}`,
    overview: "",
    posterPath: null,
    backdropPath: null,
    releaseDate,
    genreIds: [],
    genreNames: [],
    voteAverage: 7,
    voteCount: 10,
    popularity,
    trendingRank,
    providerLinks: [{ providerId, providerName: `Provider ${providerId}` }],
    syncedAt: 1,
  };
}

describe("Hotline ranking", () => {
  it("keeps only the requested provider and media type", () => {
    const catalog = [item(1, "movie", 8, 10), item(2, "tv", 8, 20), item(3, "movie", 9, 30)];
    expect(rankHotlineItems(catalog, 8, "movie").map((entry) => entry.tmdbId)).toEqual([1]);
  });

  it("prioritizes weekly trend rank and uses popularity as the fallback", () => {
    const catalog = [
      item(1, "movie", 8, 1_000),
      item(2, "movie", 8, 10, 8),
      item(3, "movie", 8, 1, 2),
      item(4, "movie", 8, 500),
    ];
    expect(rankHotlineItems(catalog, 8, "movie").map((entry) => entry.tmdbId))
      .toEqual([3, 2, 1, 4]);
  });

  it("excludes titles that have not been released yet", () => {
    const now = Date.parse("2026-09-20T12:00:00Z");
    const catalog = [
      item(1, "tv", 337, 10, 1, "2026-09-21"),
      item(2, "tv", 337, 5, 2, "2026-09-20"),
    ];
    expect(rankHotlineItems(catalog, 337, "tv", 20, now).map((entry) => entry.tmdbId))
      .toEqual([2]);
  });
});
