import { afterEach, describe, expect, it, vi } from "vitest";
import {
  catalogSliceFeedPath,
  fetchProviderCatalog,
  fetchProviders,
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
  providerLinks: [{ providerId: 8, providerName: "Netflix" }],
  syncedAt: 1,
};

afterEach(() => vi.unstubAllGlobals());

describe("publisher-managed catalogue feed", () => {
  it("constructs strict region, language, provider, and media paths", () => {
    expect(providerFeedPath("TR", "en-US")).toBe("TR/en-US/providers.json");
    expect(catalogSliceFeedPath({ region: "TR", language: "en-US" }, 8, "tv"))
      .toBe("TR/en-US/8/tv.json");
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
});
