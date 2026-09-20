import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../types";
import { filterCatalog, sortCatalog } from "./filtering";

const items: CatalogItem[] = [
  {
    key: "movie:1",
    tmdbId: 1,
    mediaType: "movie",
    title: "Glass Moon",
    originalTitle: "Glass Moon",
    overview: "A strange lunar comedy.",
    posterPath: null,
    backdropPath: null,
    releaseDate: "2024-01-01",
    genreIds: [35, 878],
    genreNames: ["Comedy", "Science Fiction"],
    voteAverage: 7,
    voteCount: 100,
    popularity: 10,
    providerLinks: [{ providerId: 8, providerName: "Netflix" }],
    syncedAt: 1,
  },
  {
    key: "tv:2",
    tmdbId: 2,
    mediaType: "tv",
    title: "Deep Water",
    originalTitle: "Deep Water",
    overview: "A wedding documentary series with undead guests.",
    posterPath: null,
    backdropPath: null,
    releaseDate: "2023-01-01",
    genreIds: [99],
    genreNames: ["Documentary"],
    voteAverage: 8,
    voteCount: 200,
    popularity: 20,
    providerLinks: [{ providerId: 9, providerName: "Prime Video" }],
    syncedAt: 1,
  },
];

describe("filterCatalog", () => {
  const defaults = {
    query: "",
    searchMode: "name" as const,
    selectedGenreIds: [],
    mediaType: "all" as const,
    providerId: "all" as const,
    sortBy: "popularity" as const,
  };

  it("searches names only in name mode", () => {
    expect(filterCatalog(items, { ...defaults, query: "glass" })).toHaveLength(1);
    expect(filterCatalog(items, { ...defaults, query: "wedding" })).toHaveLength(0);
  });

  it("searches descriptions only in concept mode", () => {
    expect(filterCatalog(items, { ...defaults, searchMode: "concept", query: "wedding" })[0].key).toBe("tv:2");
    expect(filterCatalog(items, { ...defaults, searchMode: "concept", query: "Deep Water" })).toHaveLength(0);
    expect(filterCatalog(items, { ...defaults, searchMode: "concept", query: "wedding undead" })[0].key).toBe("tv:2");
    expect(filterCatalog(items, { ...defaults, searchMode: "concept", query: '"undead guests"' })[0].key).toBe("tv:2");
    expect(filterCatalog(items, { ...defaults, searchMode: "concept", query: "wedding moon" })).toHaveLength(0);
  });

  it("requires every selected tag instead of matching either tag", () => {
    expect(filterCatalog(items, { ...defaults, searchMode: "tags", selectedGenreIds: [35] }).map((item) => item.key)).toEqual(["movie:1"]);
    expect(filterCatalog(items, { ...defaults, searchMode: "tags", selectedGenreIds: [35, 878] }).map((item) => item.key)).toEqual(["movie:1"]);
    expect(filterCatalog(items, { ...defaults, searchMode: "tags", selectedGenreIds: [35, 99] })).toHaveLength(0);
  });

  it("combines service and media filters", () => {
    expect(filterCatalog(items, { ...defaults, mediaType: "movie", providerId: 8 }).map((item) => item.key)).toEqual(["movie:1"]);
    expect(filterCatalog(items, { ...defaults, mediaType: "tv", providerId: 8 })).toHaveLength(0);
  });

  it("sorts by weighted rating or release date", () => {
    expect(sortCatalog(items, "rating").map((item) => item.key)).toEqual(["tv:2", "movie:1"]);
    expect(sortCatalog(items, "release-newest").map((item) => item.key)).toEqual(["movie:1", "tv:2"]);
    expect(sortCatalog(items, "release-oldest").map((item) => item.key)).toEqual(["tv:2", "movie:1"]);
  });
});
