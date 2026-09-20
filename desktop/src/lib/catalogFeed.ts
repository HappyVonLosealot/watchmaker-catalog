import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { AppSettings, CatalogItem, MediaType, Provider } from "../types";

export const POSTER_ROOT = "https://image.tmdb.org/t/p/w500";
export const BACKDROP_ROOT = "https://image.tmdb.org/t/p/w1280";
export const PROVIDER_LOGO_ROOT = "https://image.tmdb.org/t/p/w92";
const IMAGE_PATH = /^\/[A-Za-z0-9._/-]+$/;
const MAX_SLICE_ITEMS = 100_000;

const BUNDLED_FEED_ROOT = "/catalog/v1";
const configuredFeedRoot = import.meta.env.VITE_WATCHMAKER_CATALOG_URL?.trim();

export const CATALOG_FEED_ROOT = configuredFeedRoot
  ? configuredFeedRoot.replace(/\/+$/, "")
  : BUNDLED_FEED_ROOT;

interface ProvidersResponse {
  generatedAt: number;
  region: string;
  language: string;
  providers: Provider[];
}

interface CatalogSliceResponse {
  generatedAt: number;
  region: string;
  language: string;
  provider: Provider;
  mediaType: MediaType;
  items: CatalogItem[];
}

export class CatalogFeedError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CatalogFeedError";
    this.status = status;
  }
}

function cleanSegment(value: string, pattern: RegExp, label: string): string {
  if (!pattern.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}

export function providerFeedPath(region: string, language: string): string {
  const safeRegion = cleanSegment(region, /^[A-Z]{2}$/, "catalogue region");
  const safeLanguage = cleanSegment(language, /^[a-z]{2}-[A-Z]{2}$/, "catalogue language");
  return `${safeRegion}/${safeLanguage}/providers.json`;
}

export function catalogSliceFeedPath(
  settings: Pick<AppSettings, "region" | "language">,
  providerId: number,
  mediaType: MediaType,
): string {
  const safeRegion = cleanSegment(settings.region, /^[A-Z]{2}$/, "catalogue region");
  const safeLanguage = cleanSegment(settings.language, /^[a-z]{2}-[A-Z]{2}$/, "catalogue language");
  if (!Number.isSafeInteger(providerId)) throw new Error("Invalid provider ID.");
  return `${safeRegion}/${safeLanguage}/${providerId}/${mediaType}.json`;
}

function feedUrl(path: string, root = CATALOG_FEED_ROOT): string {
  const normalizedRoot = root.replace(/\/+$/, "");
  if (/^https:\/\//i.test(normalizedRoot)) return `${normalizedRoot}/${path}`;
  return `${normalizedRoot.startsWith("/") ? normalizedRoot : `/${normalizedRoot}`}/${path}`;
}

async function feedGet<T>(path: string, signal?: AbortSignal, root?: string): Promise<T> {
  const url = feedUrl(path, root);
  const request = {
    headers: { Accept: "application/json" },
    cache: "no-cache",
    credentials: "omit",
    signal,
  } satisfies RequestInit;
  const useNativeClient =
    /^https:\/\//i.test(url) &&
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in window;
  const response = useNativeClient
    ? await tauriFetch(url, { ...request, maxRedirections: 0 })
    : await fetch(url, request);

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new CatalogFeedError(
      detail?.message ?? `Catalogue feed request failed with status ${response.status}`,
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

function assertProvider(provider: Provider): void {
  if (!Number.isSafeInteger(provider.id) || !provider.name?.trim()) {
    throw new Error("The catalogue feed returned an invalid service entry.");
  }
  if (provider.logoPath !== null && !IMAGE_PATH.test(provider.logoPath)) {
    throw new Error("The catalogue feed returned an unsafe service logo path.");
  }
}

function assertItem(item: CatalogItem, provider: Provider, mediaType: MediaType): void {
  const expectedKey = `${mediaType}:${item.tmdbId}`;
  if (
    !Number.isSafeInteger(item.tmdbId) ||
    item.key !== expectedKey ||
    item.mediaType !== mediaType ||
    typeof item.title !== "string" ||
    !item.title.trim() ||
    typeof item.originalTitle !== "string" ||
    typeof item.overview !== "string" ||
    typeof item.releaseDate !== "string" ||
    !Array.isArray(item.genreIds) ||
    !item.genreIds.every(Number.isSafeInteger) ||
    !Array.isArray(item.genreNames) ||
    !item.genreNames.every((name) => typeof name === "string") ||
    !Number.isFinite(item.voteAverage) ||
    item.voteAverage < 0 ||
    item.voteAverage > 10 ||
    !Number.isSafeInteger(item.voteCount) ||
    item.voteCount < 0 ||
    !Number.isFinite(item.popularity) ||
    !Number.isFinite(item.syncedAt) ||
    !Array.isArray(item.providerLinks)
  ) {
    throw new Error("The catalogue feed returned an invalid title entry.");
  }
  if (item.posterPath !== null && !IMAGE_PATH.test(item.posterPath)) {
    throw new Error("The catalogue feed returned an unsafe poster path.");
  }
  if (item.backdropPath !== null && !IMAGE_PATH.test(item.backdropPath)) {
    throw new Error("The catalogue feed returned an unsafe backdrop path.");
  }
  if (
    item.providerLinks.length !== 1 ||
    item.providerLinks[0].providerId !== provider.id ||
    item.providerLinks[0].providerName !== provider.name
  ) {
    throw new Error("The catalogue feed returned a title under the wrong service.");
  }
}

export async function fetchProviders(
  region: string,
  language: string,
  signal?: AbortSignal,
  root?: string,
): Promise<Provider[]> {
  const response = await feedGet<ProvidersResponse>(
    providerFeedPath(region, language),
    signal,
    root,
  );
  if (!Array.isArray(response.providers)) {
    throw new Error("The catalogue feed did not return a service list.");
  }
  if (response.region !== region || response.language !== language) {
    throw new Error("The catalogue feed returned services for the wrong region or language.");
  }
  response.providers.forEach(assertProvider);
  return response.providers;
}

export async function fetchProviderCatalog(
  settings: Pick<AppSettings, "region" | "language">,
  provider: Provider,
  mediaType: MediaType,
  signal?: AbortSignal,
  root?: string,
): Promise<CatalogItem[]> {
  const response = await feedGet<CatalogSliceResponse>(
    catalogSliceFeedPath(settings, provider.id, mediaType),
    signal,
    root,
  );
  if (!Array.isArray(response.items)) {
    throw new Error("The catalogue feed returned an invalid title list.");
  }
  if (response.items.length > MAX_SLICE_ITEMS) {
    throw new Error("The catalogue feed returned an unexpectedly large title list.");
  }
  if (
    response.region !== settings.region ||
    response.language !== settings.language ||
    response.mediaType !== mediaType ||
    response.provider.id !== provider.id
  ) {
    throw new Error("The catalogue feed returned a mismatched title slice.");
  }
  assertProvider(response.provider);
  response.items.forEach((item) => assertItem(item, response.provider, mediaType));
  return response.items.map((item) => ({
    ...item,
    providerLinks: item.providerLinks?.length
      ? item.providerLinks
      : [{ providerId: response.provider.id, providerName: response.provider.name }],
  }));
}
