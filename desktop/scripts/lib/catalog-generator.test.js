import { describe, expect, it, vi } from "vitest";
import {
  createTmdbClient,
  fetchCatalogSlice,
  fetchCompleteDiscover,
  fetchLogicalProviders,
  mapResult,
  mergeLocalizedItems,
} from "./catalog-generator.mjs";

describe("publisher catalogue generator", () => {
  it("groups direct service tiers without adding Amazon or Max channels", async () => {
    const responses = {
      "/watch/providers/movie": {
        results: [
          { provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.jpg" },
          { provider_id: 1796, provider_name: "Netflix basic with Ads", logo_path: "/ads.jpg" },
          { provider_id: 9, provider_name: "Amazon Prime Video", logo_path: "/prime.jpg" },
          { provider_id: 119, provider_name: "Amazon Prime Video with HBO Max", logo_path: "/channel.jpg" },
          { provider_id: 337, provider_name: "Disney Plus", logo_path: "/disney.jpg" },
        ],
      },
      "/watch/providers/tv": {
        results: [
          { provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.jpg" },
          { provider_id: 1899, provider_name: "HBO Max", logo_path: "/max.jpg" },
        ],
      },
    };
    const groups = await fetchLogicalProviders(
      async (endpoint) => responses[endpoint],
      "US",
      "en-US",
    );

    const netflix = groups.find((group) => group.provider.name === "Netflix");
    const prime = groups.find((group) => group.provider.name === "Amazon Prime Video");
    expect(netflix.sourceIds.movie).toEqual([8, 1796]);
    expect(prime.sourceIds.movie).toEqual([9]);
    expect(groups.map((group) => group.provider.name)).toEqual([
      "Amazon Prime Video",
      "Disney+",
      "Dropout",
      "Max",
      "Netflix",
    ]);
  });

  it("retries throttled TMDb requests without exposing the token in the URL", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ "retry-after": "0" }),
        json: async () => ({ status_message: "Slow down" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ results: [] }),
      });
    const tmdbGet = createTmdbClient({
      token: "publisher-secret",
      retries: 2,
      fetchImpl,
      sleep: async () => {},
    });

    await expect(tmdbGet("/discover/movie", { page: 1 })).resolves.toEqual({ results: [] });
    const requestedUrl = fetchImpl.mock.calls[0][0];
    expect(requestedUrl.toString()).not.toContain("publisher-secret");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer publisher-secret");
  });

  it("adds date partitions when a provider catalogue exceeds TMDb's page ceiling", async () => {
    const calls = [];
    const tmdbGet = async (_endpoint, params) => {
      calls.push(params);
      const hasDateRange = "primary_release_date.gte" in params;
      if (hasDateRange) {
        return {
          total_pages: 1,
          results: [{ id: 2, title: "Dated", genre_ids: [] }],
        };
      }
      return {
        total_pages: 501,
        results: params.page === 1 ? [{ id: 1, title: "Undated", genre_ids: [] }] : [],
      };
    };
    const results = await fetchCompleteDiscover({
      tmdbGet,
      mediaType: "movie",
      params: { with_watch_providers: "8", with_watch_monetization_types: "flatrate" },
      pageLimit: 500,
      exhaustive: true,
      concurrency: 8,
    });

    expect(results.map((result) => result.id).sort()).toEqual([1, 2]);
    expect(calls.some((params) => "primary_release_date.gte" in params)).toBe(true);
  });

  it("requests subscription offers only and merges logical tier IDs with OR", async () => {
    let discoverParams;
    const tmdbGet = async (endpoint, params) => {
      if (endpoint === "/discover/movie") discoverParams = params;
      return {
        total_pages: 1,
        results: [{
          id: 42,
          title: "Included",
          overview: "Description",
          genre_ids: [28],
          poster_path: "/poster.jpg",
          backdrop_path: "/backdrop.jpg",
          release_date: "2024-01-01",
          vote_average: 8,
          vote_count: 100,
          popularity: 20,
        }],
      };
    };
    const providerGroup = {
      provider: { id: 8, name: "Netflix", logoPath: null, kind: "watch" },
      sourceIds: { movie: [8, 1796], tv: [8] },
    };
    const items = await fetchCatalogSlice({
      tmdbGet,
      region: "US",
      language: "en-US",
      providerGroup,
      mediaType: "movie",
      genres: { movie: { 28: "Action" }, tv: {} },
      generatedAt: 123,
      resolveDropoutNetworkId: async () => 0,
      pageLimit: 500,
      exhaustive: true,
      concurrency: 4,
      warnings: [],
    });

    expect(discoverParams.with_watch_providers).toBe("8|1796");
    expect(discoverParams.with_watch_monetization_types).toBe("flatrate");
    expect(discoverParams).not.toHaveProperty("rent");
    expect(discoverParams).not.toHaveProperty("buy");
    expect(items[0].posterPath).toBe("/poster.jpg");
  });

  it("drops unsafe artwork paths from publisher data", () => {
    const item = mapResult(
      {
        id: 7,
        title: "Artwork",
        genre_ids: [],
        poster_path: "https://lookalike.invalid/poster.jpg",
        backdrop_path: "/safe-backdrop.jpg",
      },
      "movie",
      { id: 8, name: "Netflix" },
      { movie: {}, tv: {} },
      1,
    );
    expect(item.posterPath).toBeNull();
    expect(item.backdropPath).toBe("/safe-backdrop.jpg");
  });

  it("fills missing localized descriptions and artwork without replacing translated text", () => {
    const base = {
      key: "movie:7",
      tmdbId: 7,
      mediaType: "movie",
      originalTitle: "Original",
      releaseDate: "2026-01-01",
      genreIds: [18],
      genreNames: ["Dram"],
      voteAverage: 8,
      voteCount: 100,
      popularity: 20,
      providerLinks: [{ providerId: 8, providerName: "Netflix" }],
      syncedAt: 1,
    };
    const localized = {
      ...base,
      title: "Yerelleştirilmiş Başlık",
      overview: "",
      posterPath: null,
      backdropPath: "/turkish-backdrop.jpg",
    };
    const english = {
      ...base,
      title: "English Title",
      overview: "An English fallback synopsis.",
      posterPath: "/english-poster.jpg",
      backdropPath: "/english-backdrop.jpg",
      genreNames: ["Drama"],
    };

    expect(mergeLocalizedItems([localized], [english])).toEqual([{
      ...localized,
      overview: "An English fallback synopsis.",
      posterPath: "/english-poster.jpg",
    }]);
  });
});
