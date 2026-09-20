import { describe, expect, it } from "vitest";
import type { CatalogItem, CustomSite, ProviderLink } from "../types";
import {
  isAllowedExternalUrl,
  isSafeCustomUrl,
  providerSearchUrl,
  resolveCustomSiteUrl,
  resolveProviderUrl,
  validateCustomSite,
} from "./providerLinks";

const item = {
  key: "movie:1",
  tmdbId: 1,
  mediaType: "movie",
  title: "A Film & Friends",
  originalTitle: "A Film & Friends",
  overview: "",
  posterPath: null,
  backdropPath: null,
  releaseDate: "2026-01-01",
  genreIds: [],
  genreNames: [],
  voteAverage: 0,
  voteCount: 0,
  popularity: 0,
  providerLinks: [],
  syncedAt: 1,
} satisfies CatalogItem;

describe("external provider handoff", () => {
  it.each([
    ["Netflix", "https://www.netflix.com/search?q=A%20Film%20%26%20Friends"],
    ["Amazon Prime Video", "https://www.primevideo.com/search/ref=atv_nb_sr?phrase=A%20Film%20%26%20Friends"],
    ["Max", "https://play.max.com/search?q=A%20Film%20%26%20Friends"],
    ["Dropout", "https://watch.dropout.tv/search?q=A%20Film%20%26%20Friends"],
  ])("builds an encoded HTTPS search for %s", (provider, expected) => {
    expect(providerSearchUrl(provider, item.title)).toBe(expected);
  });

  it("opens Disney+'s valid signed-in browse screen instead of its dead query route", () => {
    expect(providerSearchUrl("Disney Plus", item.title)).toBe(
      "https://www.disneyplus.com/browse/home",
    );
  });

  it("rejects unsafe supplied links and uses the provider search instead", () => {
    const link: ProviderLink = {
      providerId: 8,
      providerName: "Netflix",
      url: "http://attacker.invalid/steal",
    };
    expect(resolveProviderUrl(item, link)).toBe(providerSearchUrl("Netflix", item.title));
    expect(isAllowedExternalUrl(link.url!)).toBe(false);
  });

  it("allows only the explicit HTTPS host list", () => {
    expect(isAllowedExternalUrl("https://www.dropout.tv/search?q=test")).toBe(true);
    expect(isAllowedExternalUrl("https://watch.dropout.tv/search?q=test")).toBe(true);
    expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("https://www.netflix.com.attacker.invalid/title/1")).toBe(false);
  });

  it("builds a title search for a locally added HTTPS site", () => {
    const site: CustomSite = {
      id: "custom-1",
      name: "Example Stream",
      homeUrl: "https://watch.example.com",
      searchUrlTemplate: "https://watch.example.com/find?title={query}",
    };
    expect(validateCustomSite(site)).toBeNull();
    expect(resolveCustomSiteUrl(site, item.title)).toBe(
      "https://watch.example.com/find?title=A%20Film%20%26%20Friends",
    );
  });

  it("blocks insecure custom sites and invalid search templates", () => {
    expect(isSafeCustomUrl("http://watch.example.com")).toBe(false);
    expect(isSafeCustomUrl("https://name:password@watch.example.com")).toBe(false);
    expect(validateCustomSite({
      name: "Unsafe",
      homeUrl: "https://watch.example.com",
      searchUrlTemplate: "https://watch.example.com/search",
    })).toContain("{query}");
  });
});
