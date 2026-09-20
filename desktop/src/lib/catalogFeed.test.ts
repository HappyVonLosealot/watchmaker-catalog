import { afterEach, describe, expect, it, vi } from "vitest";
import {
  catalogSliceFeedPath,
  fetchHotlineFeed,
  fetchProviderCatalog,
  fetchProviders,
  hotlineFeedPath,
  providerFeedPath,
} from "./catalogFeed";
import type { CatalogItem, Provider } from "../types";

const provider: Provider = {
  id: 8,
  name: "Netflix",
  logoPath: "/netflix.png",
  kind: "watch",
};

const item: CatalogItem = {
  key: "tv:1",
  tmdbId: 1,
  mediaType: "tv",
  title: "Example",
  originalTitle: "Example",
  overview: "A catalogue example.",
  posterPath: "/poster.jpg",
  backdropPath: "/backdrop.jpg",
  releaseDate: "2026-01-01",
  genreIds: [18],
  genreNames: ["Drama"],
  voteAverage: 8,
  voteCount: 100,
  popularity: 12,
  trendingRank: 3,
  providerLinks: [{ providerId: 8, providerName: "Netflix" }],
  syncedAt: 1,
};

afterEach(() => vi.unstubAllGlobals());

describe("publisher-managed catalogue feed", () => {
  it("constructs strict region, language, provider, and media paths", () => {
    expect(providerFeedPath("TR", "en-US")).toBe("TR/en-US/providers.json");
    expect(catalogSliceFeedPath({ region: "TR", language: "en-US" }, 8, "tv"))
      .toBe("TR/en-US/8/tv.json");
    expect(hotlineFeedPath("TR", "en-US")).toBe("TR/en-US/hotline.json");
    expect(() => providerFeedPath("turkey", "en-US")).toThrow("Invalid catalogue region");
  });

  it("loads services without sending an API token", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      generatedAt: 1,
      region: "TR",
      language: "en-US",
      providers: [provider],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", request);

    await expect(fetchProviders("TR", "en-US", undefined, "https://catalog.example/v1"))
      .resolves.toEqual([provider]);

    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://catalog.example/v1/TR/en-US/providers.json");
    expect(init.headers).toEqual({ Accept: "application/json" });
    expect(init.cache).toBe("no-cache");
    expect(init.credentials).toBe("omit");
    expect(JSON.stringify(init.headers).toLocaleLowerCase()).not.toContain("authorization");
  });

  it("loads a complete title slice with its poster metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      generatedAt: 1,
      region: "TR",
      language: "en-US",
      provider,
      mediaType: "tv",
      items: [item],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const results = await fetchProviderCatalog(
      { region: "TR", language: "en-US" },
      provider,
      "tv",
      undefined,
      "https://catalog.example/v1",
    );
    expect(results).toEqual([item]);
    expect(results[0].posterPath).toBe("/poster.jpg");
    expect(results[0].backdropPath).toBe("/backdrop.jpg");
  });

  it("accepts exact Disney+ links and title-specific TMDb handoffs", async () => {
    const disneyProvider: Provider = {
      id: 337,
      name: "Disney+",
      logoPath: "/disney.png",
      kind: "watch",
    };
    const direct = {
      ...item,
      key: "tv:1433",
      tmdbId: 1433,
      title: "American Dad!",
      providerLinks: [{
        providerId: 337,
        providerName: "Disney+",
        url: "https://www.disneyplus.com/en-tr/browse/entity-5b4ab988-e3a7-4750-a11a-9aa3d65f8cfe",
      }],
    };
    const handoff = {
      ...direct,
      key: "tv:2",
      tmdbId: 2,
      providerLinks: [{
        providerId: 337,
        providerName: "Disney+",
        url: "https://www.themoviedb.org/tv/2/watch?locale=TR",
      }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      generatedAt: 1,
      region: "TR",
      language: "en-US",
      provider: disneyProvider,
      mediaType: "tv",
      items: [direct, handoff],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(fetchProviderCatalog(
      { region: "TR", language: "en-US" },
      disneyProvider,
      "tv",
      undefined,
      "https://catalog.example/v1",
    )).resolves.toHaveLength(2);
  });

  it("rejects a Disney+ link for the wrong locale or title", async () => {
    const disneyProvider: Provider = {
      id: 337,
      name: "Disney+",
      logoPath: null,
      kind: "watch",
    };
    const unsafe = {
      ...item,
      providerLinks: [{
        providerId: 337,
        providerName: "Disney+",
        url: "https://www.themoviedb.org/tv/999/watch?locale=TR",
      }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      generatedAt: 1,
      region: "TR",
      language: "en-US",
      provider: disneyProvider,
      mediaType: "tv",
      items: [unsafe],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(fetchProviderCatalog(
      { region: "TR", language: "en-US" },
      disneyProvider,
      "tv",
      undefined,
      "https://catalog.example/v1",
    )).rejects.toThrow("unsafe provider link");
  });

  it("rejects a slice that tries to inject an external artwork URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      generatedAt: 1,
      region: "TR",
      language: "en-US",
      provider,
      mediaType: "tv",
      items: [{ ...item, posterPath: "https://lookalike.invalid/poster.jpg" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(fetchProviderCatalog(
      { region: "TR", language: "en-US" },
      provider,
      "tv",
      undefined,
      "https://catalog.example/v1",
    )).rejects.toThrow("unsafe poster path");
  });

  it("rejects a malformed semantic fingerprint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      generatedAt: 1,
      region: "TR",
      language: "en-US",
      provider,
      mediaType: "tv",
      items: [{ ...item, semanticVector: "not-a-vector" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(fetchProviderCatalog(
      { region: "TR", language: "en-US" },
      provider,
      "tv",
      undefined,
      "https://catalog.example/v1",
    )).rejects.toThrow("invalid semantic fingerprint");
  });

  it("rejects service metadata for the wrong region", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      generatedAt: 1,
      region: "US",
      language: "en-US",
      providers: [provider],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(fetchProviders("TR", "en-US", undefined, "https://catalog.example/v1"))
      .rejects.toThrow("wrong region or language");
  });

  it("loads and validates the Dropout Hotline episode feed", async () => {
    const hotline = {
      schemaVersion: 2,
      generatedAt: 100,
      region: "TR",
      language: "en-US",
      ranking: { source: "tmdb-weekly-trending-then-popularity", refreshedAt: 100 },
      dropout: {
        providerId: -101,
        favorites: [
          { tmdbId: 89180, title: "Dimension 20" },
          { tmdbId: 129412, title: "Game Changer" },
          { tmdbId: 204031, title: "Make Some Noise" },
          { tmdbId: 250251, title: "Smartypants" },
        ],
        episodes: [{
          key: "dropout:89180:44",
          seriesTmdbId: 89180,
          seriesTitle: "Dimension 20",
          episodeTmdbId: 44,
          episodeName: "A New Quest",
          seasonNumber: 3,
          episodeNumber: 1,
          overview: "The party meets.",
          airDate: "2026-09-01",
          stillPath: "/still.jpg",
          seriesPosterPath: "/poster.jpg",
          seriesBackdropPath: null,
          url: "https://watch.dropout.tv/search?q=Dimension%2020%20A%20New%20Quest",
        }],
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(hotline), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    const result = await fetchHotlineFeed(
      { region: "TR", language: "en-US" },
      undefined,
      "https://catalog.example/v1",
    );
    expect(result.dropout.episodes[0].episodeName).toBe("A New Quest");
  });

  it("rejects a Hotline episode that points outside Dropout", async () => {
    const unsafe = {
      schemaVersion: 2,
      generatedAt: 100,
      region: "TR",
      language: "en-US",
      ranking: { source: "tmdb-weekly-trending-then-popularity", refreshedAt: 100 },
      dropout: {
        providerId: -101,
        favorites: [
          { tmdbId: 89180, title: "Dimension 20" },
          { tmdbId: 129412, title: "Game Changer" },
          { tmdbId: 204031, title: "Make Some Noise" },
          { tmdbId: 250251, title: "Smartypants" },
        ],
        episodes: [{
          key: "dropout:89180:44",
          seriesTmdbId: 89180,
          seriesTitle: "Dimension 20",
          episodeTmdbId: 44,
          episodeName: "A New Quest",
          seasonNumber: 3,
          episodeNumber: 1,
          overview: "",
          airDate: "2026-09-01",
          stillPath: null,
          seriesPosterPath: null,
          seriesBackdropPath: null,
          url: "https://malicious.example/search?q=Dimension%2020",
        }],
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(unsafe), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(fetchHotlineFeed(
      { region: "TR", language: "en-US" },
      undefined,
      "https://catalog.example/v1",
    )).rejects.toThrow("invalid Dropout episode");
  });
});
