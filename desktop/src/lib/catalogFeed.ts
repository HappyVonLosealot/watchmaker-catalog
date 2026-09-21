import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type {
  AppSettings,
  CatalogItem,
  HotlineEpisode,
  HotlineFeed,
  MediaType,
  Provider,
} from "../types";

export const POSTER_ROOT = "https://image.tmdb.org/t/p/w500";
export const BACKDROP_ROOT = "https://image.tmdb.org/t/p/w1280";
export const STILL_ROOT = "https://image.tmdb.org/t/p/w780";
export const PROVIDER_LOGO_ROOT = "https://image.tmdb.org/t/p/w92";
const IMAGE_PATH = /^\/[A-Za-z0-9._/-]+$/;
const SEMANTIC_VECTOR = /^[A-Za-z0-9+/]{512}$/;
const DISNEY_ENTITY_PATH = /^\/[a-z]{2}-[a-z]{2}\/browse\/entity-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i;
const DISNEY_LEGACY_PATH = /^\/[a-z]{2}-[a-z]{2}\/(movies|series)\/wd\/[A-Za-z0-9_-]{6,32}\/?$/;
const MAX_SLICE_ITEMS = 100_000;
const MAX_HOTLINE_EPISODES = 100;
const DROPOUT_FAVORITE_IDS = new Set([89180, 129412, 204031, 250251]);

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

interface HotlineResponse extends HotlineFeed {
  schemaVersion: number;
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

export function hotlineFeedPath(region: string, language: string): string {
  const safeRegion = cleanSegment(region, /^[A-Z]{2}$/, "catalogue region");
  const safeLanguage = cleanSegment(language, /^[a-z]{2}-[A-Z]{2}$/, "catalogue language");
  return `${safeRegion}/${safeLanguage}/hotline.json`;
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

function isSafePublishedDisneyLink(
  url: unknown,
  item: CatalogItem,
  region: string,
  language: string,
): boolean {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) return false;
    const locale = `${language.slice(0, 2).toLocaleLowerCase("en-US")}-${region.toLocaleLowerCase("en-US")}`;

    if (parsed.hostname === "www.disneyplus.com") {
      if (parsed.search || !parsed.pathname.toLocaleLowerCase("en-US").startsWith(`/${locale}/`)) {
        return false;
      }
      if (DISNEY_ENTITY_PATH.test(parsed.pathname)) return true;
      const legacy = parsed.pathname.match(DISNEY_LEGACY_PATH);
      return legacy?.[1] === (item.mediaType === "movie" ? "movies" : "series");
    }

    if (parsed.hostname === "www.themoviedb.org") {
      return (
        parsed.pathname === `/${item.mediaType}/${item.tmdbId}/watch` &&
        [...parsed.searchParams.keys()].length === 1 &&
        parsed.searchParams.get("locale") === region
      );
    }
    return false;
  } catch {
    return false;
  }
}

function assertItem(
  item: CatalogItem,
  provider: Provider,
  mediaType: MediaType,
  region: string,
  language: string,
): void {
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
    (item.trendingRank !== undefined &&
      (!Number.isSafeInteger(item.trendingRank) || item.trendingRank < 1)) ||
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
  if (item.semanticVector !== undefined && !SEMANTIC_VECTOR.test(item.semanticVector)) {
    throw new Error("The catalogue feed returned an invalid semantic fingerprint.");
  }
  if (
    item.contentFormat !== undefined &&
    (item.mediaType === "movie"
      ? item.contentFormat !== "movie"
      : !["series", "miniseries"].includes(item.contentFormat))
  ) {
    throw new Error("The catalogue feed returned an invalid content format.");
  }
  if (item.vibeScores !== undefined) {
    const signedScores = [
      item.vibeScores.cozyStressful,
      item.vibeScores.funnyGrim,
      item.vibeScores.slowFast,
      item.vibeScores.lightDevastating,
    ];
    if (
      !signedScores.every((score) => Number.isFinite(score) && score >= -1 && score <= 1) ||
      !Number.isFinite(item.vibeScores.productionPolish) ||
      item.vibeScores.productionPolish < 0 ||
      item.vibeScores.productionPolish > 1
    ) {
      throw new Error("The catalogue feed returned invalid vibe scores.");
    }
  }
  if (
    item.providerLinks.length !== 1 ||
    item.providerLinks[0].providerId !== provider.id ||
    item.providerLinks[0].providerName !== provider.name
  ) {
    throw new Error("The catalogue feed returned a title under the wrong service.");
  }
  const linkUrl = item.providerLinks[0].url;
  if (
    linkUrl !== undefined &&
    (provider.id !== 337 || !isSafePublishedDisneyLink(linkUrl, item, region, language))
  ) {
    throw new Error("The catalogue feed returned an unsafe provider link.");
  }
}

function isSafeDropoutEpisodeUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "watch.dropout.tv" &&
      parsed.pathname === "/search" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.hash &&
      [...parsed.searchParams.keys()].length === 1 &&
      Boolean(parsed.searchParams.get("q")?.trim())
    );
  } catch {
    return false;
  }
}

function assertHotlineEpisode(episode: HotlineEpisode): void {
  if (
    !Number.isSafeInteger(episode.seriesTmdbId) ||
    !DROPOUT_FAVORITE_IDS.has(episode.seriesTmdbId) ||
    !Number.isSafeInteger(episode.episodeTmdbId) ||
    episode.key !== `dropout:${episode.seriesTmdbId}:${episode.episodeTmdbId}` ||
    typeof episode.seriesTitle !== "string" ||
    !episode.seriesTitle.trim() ||
    typeof episode.episodeName !== "string" ||
    !episode.episodeName.trim() ||
    typeof episode.overview !== "string" ||
    !Number.isSafeInteger(episode.seasonNumber) ||
    episode.seasonNumber < 0 ||
    !Number.isSafeInteger(episode.episodeNumber) ||
    episode.episodeNumber < 0 ||
    typeof episode.airDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(episode.airDate) ||
    !isSafeDropoutEpisodeUrl(episode.url)
  ) {
    throw new Error("The Hotline feed returned an invalid Dropout episode.");
  }
  for (const imagePath of [
    episode.stillPath,
    episode.seriesPosterPath,
    episode.seriesBackdropPath,
  ]) {
    if (imagePath !== null && !IMAGE_PATH.test(imagePath)) {
      throw new Error("The Hotline feed returned an unsafe episode artwork path.");
    }
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
  response.items.forEach((item) =>
    assertItem(item, response.provider, mediaType, settings.region, settings.language),
  );
  return response.items.map((item) => ({
    ...item,
    providerLinks: item.providerLinks?.length
      ? item.providerLinks
      : [{ providerId: response.provider.id, providerName: response.provider.name }],
  }));
}

export async function fetchHotlineFeed(
  settings: Pick<AppSettings, "region" | "language">,
  signal?: AbortSignal,
  root?: string,
): Promise<HotlineFeed> {
  const response = await feedGet<HotlineResponse>(
    hotlineFeedPath(settings.region, settings.language),
    signal,
    root,
  );
  if (
    response.region !== settings.region ||
    response.language !== settings.language ||
    !Number.isFinite(response.generatedAt) ||
    response.ranking?.source !== "tmdb-weekly-trending-then-popularity" ||
    !Number.isFinite(response.ranking?.refreshedAt) ||
    response.dropout?.providerId !== -101 ||
    !Array.isArray(response.dropout?.favorites) ||
    !Array.isArray(response.dropout?.episodes)
  ) {
    throw new Error("The Hotline feed returned mismatched or invalid metadata.");
  }
  const favoriteIds = new Set<number>();
  for (const favorite of response.dropout.favorites) {
    if (
      !Number.isSafeInteger(favorite?.tmdbId) ||
      !DROPOUT_FAVORITE_IDS.has(favorite.tmdbId) ||
      typeof favorite?.title !== "string" ||
      !favorite.title.trim() ||
      favoriteIds.has(favorite.tmdbId)
    ) {
      throw new Error("The Hotline feed returned an invalid Dropout favorite.");
    }
    favoriteIds.add(favorite.tmdbId);
  }
  if (favoriteIds.size !== DROPOUT_FAVORITE_IDS.size) {
    throw new Error("The Hotline feed is missing a Dropout favorite.");
  }
  if (response.dropout.episodes.length > MAX_HOTLINE_EPISODES) {
    throw new Error("The Hotline feed returned too many Dropout episodes.");
  }
  const episodeKeys = new Set<string>();
  response.dropout.episodes.forEach((episode) => {
    assertHotlineEpisode(episode);
    if (episodeKeys.has(episode.key)) {
      throw new Error("The Hotline feed returned a duplicate Dropout episode.");
    }
    episodeKeys.add(episode.key);
  });
  return response;
}
