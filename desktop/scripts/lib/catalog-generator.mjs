import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const API_ROOT = "https://api.themoviedb.org/3";
export const FEED_SCHEMA_VERSION = 2;
export const TMDB_ATTRIBUTION =
  "This product uses the TMDB API but is not endorsed or certified by TMDB.";
export const AVAILABILITY_ATTRIBUTION =
  "Streaming availability data is powered by JustWatch through TMDB.";

const DEFAULT_REGIONS = [
  "US", "GB", "CA", "AU", "NZ", "TR", "DE", "FR",
  "ES", "IT", "NL", "IN", "JP", "KR", "BR", "MX",
];
const DEFAULT_LANGUAGES = ["en-US"];
const DEFAULT_REQUEST_CONCURRENCY = 4;
const DEFAULT_RETRIES = 5;
const EARLIEST_RELEASE_DATE = "1870-01-01";

// IDs are deliberately stable logical IDs. TMDb may expose more than one direct
// provider ID for a service (for example, an ad-supported tier). Watchmaker folds
// those direct tiers into one service without including third-party channel add-ons.
export const SERVICE_DEFINITIONS = [
  {
    key: "netflix",
    id: 8,
    name: "Netflix",
    matches: [/^netflix$/i, /^netflix basic with ads$/i, /^netflix standard with ads$/i],
  },
  {
    key: "prime-video",
    id: 9,
    name: "Amazon Prime Video",
    matches: [/^(?:amazon )?prime video$/i, /^(?:amazon )?prime video with ads$/i],
  },
  {
    key: "max",
    id: 1899,
    name: "Max",
    matches: [/^max$/i, /^hbo max$/i, /^max with ads$/i, /^hbo max with ads$/i],
  },
  {
    key: "disney-plus",
    id: 337,
    name: "Disney+",
    matches: [/^disney plus$/i, /^disney\+$/i, /^disney plus with ads$/i],
  },
];

export const DROPOUT_PROVIDER = {
  id: -101,
  name: "Dropout",
  logoPath: null,
  kind: "dropout",
};

function csv(value, fallback) {
  const source = value?.trim() ? value : fallback.join(",");
  return source.split(",").map((part) => part.trim()).filter(Boolean);
}

function integer(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}

export function configurationFromEnvironment(environment = process.env) {
  const regions = csv(environment.WATCHMAKER_REGIONS, DEFAULT_REGIONS)
    .map((value) => value.toUpperCase())
    .filter((value) => /^[A-Z]{2}$/.test(value));
  const languages = csv(environment.WATCHMAKER_LANGUAGES, DEFAULT_LANGUAGES)
    .filter((value) => /^[a-z]{2}-[A-Z]{2}$/.test(value));
  const configuredPageLimit = Number.parseInt(environment.WATCHMAKER_PAGE_LIMIT || "0", 10);

  if (!environment.TMDB_READ_TOKEN?.trim()) {
    throw new Error("TMDB_READ_TOKEN is required by the publisher feed generator.");
  }
  if (regions.length === 0) {
    throw new Error("WATCHMAKER_REGIONS must include at least one two-letter region.");
  }
  if (languages.length === 0) {
    throw new Error("WATCHMAKER_LANGUAGES must include at least one locale such as en-US.");
  }

  return {
    token: environment.TMDB_READ_TOKEN.trim(),
    outputRoot: path.resolve(environment.WATCHMAKER_FEED_DIR || "catalog-dist/v1"),
    regions: [...new Set(regions)],
    languages: [...new Set(languages)],
    pageLimit:
      Number.isFinite(configuredPageLimit) && configuredPageLimit > 0
        ? Math.min(configuredPageLimit, 500)
        : 500,
    exhaustive: !(Number.isFinite(configuredPageLimit) && configuredPageLimit > 0),
    concurrency: integer(environment.WATCHMAKER_REQUEST_CONCURRENCY, DEFAULT_REQUEST_CONCURRENCY, {
      min: 1,
      max: 8,
    }),
    retries: integer(environment.WATCHMAKER_REQUEST_RETRIES, DEFAULT_RETRIES, {
      min: 1,
      max: 8,
    }),
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(response, attempt) {
  const retryAfter = Number.parseFloat(response.headers.get("retry-after") || "");
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(retryAfter * 1000, 60_000);
  }
  return Math.min(750 * 2 ** attempt + Math.floor(Math.random() * 250), 15_000);
}

export function createTmdbClient({
  token,
  retries = DEFAULT_RETRIES,
  fetchImpl = globalThis.fetch,
  sleep = delay,
}) {
  if (!token?.trim()) throw new Error("A TMDb publisher token is required.");
  if (typeof fetchImpl !== "function") throw new Error("This Node version does not provide fetch.");

  return async function tmdbGet(endpoint, params = {}) {
    const url = new URL(API_ROOT + endpoint);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    let lastError;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      try {
        const response = await fetchImpl(url, {
          headers: {
            Authorization: "Bearer " + token,
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        if (response.ok) return response.json();
        const body = await response.json().catch(() => null);
        const message =
          body?.status_message ||
          `TMDb request failed with status ${response.status} for ${endpoint}`;
        lastError = new Error(message);
        const retryable = response.status === 429 || response.status >= 500;
        lastError.retryable = retryable;
        if (!retryable || attempt === retries - 1) throw lastError;
        await sleep(retryDelay(response, attempt));
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (lastError.retryable === false || attempt === retries - 1) throw lastError;
        await sleep(Math.min(750 * 2 ** attempt, 15_000));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError ?? new Error("TMDb request failed.");
  };
}

export async function mapWithConcurrency(values, concurrency, worker) {
  const results = new Array(values.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function serviceForName(providerName) {
  return SERVICE_DEFINITIONS.find((service) =>
    service.matches.some((pattern) => pattern.test(providerName.trim())),
  );
}

export async function fetchLogicalProviders(tmdbGet, region, language) {
  const [movies, television] = await Promise.all(
    ["movie", "tv"].map((mediaType) =>
      tmdbGet("/watch/providers/" + mediaType, { watch_region: region, language }),
    ),
  );
  const groups = new Map();

  for (const [mediaType, entries] of [
    ["movie", movies.results || []],
    ["tv", television.results || []],
  ]) {
    for (const entry of entries) {
      const definition = serviceForName(entry.provider_name || "");
      if (!definition) continue;
      const existing = groups.get(definition.key) || {
        provider: {
          id: definition.id,
          name: definition.name,
          logoPath: entry.logo_path || null,
          kind: "watch",
        },
        sourceIds: { movie: new Set(), tv: new Set() },
      };
      existing.sourceIds[mediaType].add(entry.provider_id);
      if (!existing.provider.logoPath && entry.logo_path) {
        existing.provider.logoPath = entry.logo_path;
      }
      groups.set(definition.key, existing);
    }
  }

  groups.set("dropout", {
    provider: { ...DROPOUT_PROVIDER },
    sourceIds: { movie: new Set(), tv: new Set() },
  });

  return [...groups.values()]
    .map((group) => ({
      provider: group.provider,
      sourceIds: {
        movie: [...group.sourceIds.movie].sort((a, b) => a - b),
        tv: [...group.sourceIds.tv].sort((a, b) => a - b),
      },
    }))
    .sort((left, right) => left.provider.name.localeCompare(right.provider.name));
}

export async function fetchGenres(tmdbGet, language) {
  const [movies, television] = await Promise.all(
    ["movie", "tv"].map((mediaType) =>
      tmdbGet("/genre/" + mediaType + "/list", { language }),
    ),
  );
  return {
    movie: Object.fromEntries((movies.genres || []).map((genre) => [genre.id, genre.name])),
    tv: Object.fromEntries((television.genres || []).map((genre) => [genre.id, genre.name])),
  };
}

export function createDropoutNetworkResolver(tmdbGet) {
  let networkId = null;
  return async function resolveDropoutNetworkId(language) {
    if (networkId) return networkId;
    const search = await tmdbGet("/search/tv", {
      query: "Game Changer",
      language,
      include_adult: false,
      page: 1,
    });
    const candidates = (search.results || []).filter((result) => {
      const names = [result.name, result.original_name]
        .filter(Boolean)
        .map((name) => name.toLocaleLowerCase());
      return names.includes("game changer");
    });
    const candidate =
      candidates.find((result) => String(result.first_air_date || "").startsWith("2019")) ||
      candidates[0];
    if (!candidate) throw new Error("Could not resolve the Dropout catalogue anchor.");
    const details = await tmdbGet("/tv/" + candidate.id, { language });
    const network = (details.networks || []).find((entry) =>
      entry.name.toLocaleLowerCase().includes("dropout"),
    );
    if (!network) throw new Error("TMDb did not return the Dropout network.");
    networkId = network.id;
    return networkId;
  };
}

function dateToEpochDay(value) {
  return Math.floor(Date.parse(value + "T00:00:00Z") / 86_400_000);
}

function epochDayToDate(value) {
  return new Date(value * 86_400_000).toISOString().slice(0, 10);
}

function futureReleaseDate() {
  return `${new Date().getUTCFullYear() + 5}-12-31`;
}

function releaseDateKeys(mediaType) {
  return mediaType === "movie"
    ? ["primary_release_date.gte", "primary_release_date.lte"]
    : ["first_air_date.gte", "first_air_date.lte"];
}

async function fetchPages({
  tmdbGet,
  endpoint,
  params,
  first,
  pageLimit,
  concurrency,
}) {
  const totalPages = Math.min(first.total_pages || 0, pageLimit, 500);
  if (totalPages <= 1) return first.results || [];
  const pageNumbers = Array.from({ length: totalPages - 1 }, (_, index) => index + 2);
  const responses = await mapWithConcurrency(pageNumbers, concurrency, (page) =>
    tmdbGet(endpoint, { ...params, page }),
  );
  return [first.results || [], ...responses.map((response) => response.results || [])].flat();
}

async function fetchDateRange({
  tmdbGet,
  endpoint,
  baseParams,
  mediaType,
  startDate,
  endDate,
  pageLimit,
  concurrency,
  warnings,
}) {
  const [fromKey, toKey] = releaseDateKeys(mediaType);
  const params = { ...baseParams, [fromKey]: startDate, [toKey]: endDate };
  const first = await tmdbGet(endpoint, { ...params, page: 1 });
  const totalPages = first.total_pages || 0;
  if (totalPages <= pageLimit || pageLimit < 500) {
    return fetchPages({ tmdbGet, endpoint, params, first, pageLimit, concurrency });
  }

  const startDay = dateToEpochDay(startDate);
  const endDay = dateToEpochDay(endDate);
  if (startDay >= endDay) {
    warnings.push(
      `${endpoint} returned more than 10,000 titles for ${startDate}; TMDb exposes at most 500 pages.`,
    );
    return fetchPages({ tmdbGet, endpoint, params, first, pageLimit, concurrency });
  }

  const midpoint = Math.floor((startDay + endDay) / 2);
  const left = await fetchDateRange({
    tmdbGet,
    endpoint,
    baseParams,
    mediaType,
    startDate,
    endDate: epochDayToDate(midpoint),
    pageLimit,
    concurrency,
    warnings,
  });
  const right = await fetchDateRange({
    tmdbGet,
    endpoint,
    baseParams,
    mediaType,
    startDate: epochDayToDate(midpoint + 1),
    endDate,
    pageLimit,
    concurrency,
    warnings,
  });
  return [...left, ...right];
}

export async function fetchCompleteDiscover({
  tmdbGet,
  mediaType,
  params,
  pageLimit = 500,
  exhaustive = true,
  concurrency = DEFAULT_REQUEST_CONCURRENCY,
  warnings = [],
}) {
  const endpoint = "/discover/" + mediaType;
  const first = await tmdbGet(endpoint, { ...params, page: 1 });
  if (!exhaustive || (first.total_pages || 0) <= pageLimit) {
    return fetchPages({ tmdbGet, endpoint, params, first, pageLimit, concurrency });
  }

  // TMDb caps discover results at 500 pages. Keep that unfiltered window so
  // titles without dates are not silently discarded, then bisect dated ranges
  // until every range is below the cap and de-duplicate the overlap by ID.
  const unfiltered = await fetchPages({
    tmdbGet,
    endpoint,
    params,
    first,
    pageLimit,
    concurrency,
  });
  const dated = await fetchDateRange({
    tmdbGet,
    endpoint,
    baseParams: params,
    mediaType,
    startDate: EARLIEST_RELEASE_DATE,
    endDate: futureReleaseDate(),
    pageLimit,
    concurrency,
    warnings,
  });
  const unique = new Map();
  for (const result of [...unfiltered, ...dated]) unique.set(result.id, result);
  return [...unique.values()];
}

function safeImagePath(value) {
  return typeof value === "string" && /^\/[A-Za-z0-9._/-]+$/.test(value) ? value : null;
}

export function mapResult(result, mediaType, provider, genres, generatedAt) {
  const title = result.title || result.name || result.original_title || result.original_name || "Untitled";
  const genreIds = Array.isArray(result.genre_ids)
    ? result.genre_ids.filter(Number.isSafeInteger)
    : [];
  return {
    key: mediaType + ":" + result.id,
    tmdbId: result.id,
    mediaType,
    title,
    originalTitle: result.original_title || result.original_name || title,
    overview: typeof result.overview === "string" ? result.overview : "",
    posterPath: safeImagePath(result.poster_path),
    backdropPath: safeImagePath(result.backdrop_path),
    releaseDate: result.release_date || result.first_air_date || "",
    genreIds,
    genreNames: genreIds.map((id) => genres[mediaType][id]).filter(Boolean),
    voteAverage: Number.isFinite(result.vote_average) ? result.vote_average : 0,
    voteCount: Number.isSafeInteger(result.vote_count) ? result.vote_count : 0,
    popularity: Number.isFinite(result.popularity) ? result.popularity : 0,
    providerLinks: [{ providerId: provider.id, providerName: provider.name }],
    syncedAt: generatedAt,
  };
}

export function mergeLocalizedItems(primaryItems, fallbackItems) {
  const fallbackByKey = new Map(fallbackItems.map((item) => [item.key, item]));
  const merged = primaryItems.map((item) => {
    const fallback = fallbackByKey.get(item.key);
    fallbackByKey.delete(item.key);
    if (!fallback) return item;

    return {
      ...item,
      title:
        item.title.trim() && item.title !== "Untitled"
          ? item.title
          : fallback.title,
      originalTitle: item.originalTitle.trim() ? item.originalTitle : fallback.originalTitle,
      overview: item.overview.trim() ? item.overview : fallback.overview,
      posterPath: item.posterPath ?? fallback.posterPath,
      backdropPath: item.backdropPath ?? fallback.backdropPath,
      releaseDate: item.releaseDate || fallback.releaseDate,
      genreIds: item.genreIds.length ? item.genreIds : fallback.genreIds,
      genreNames: item.genreNames.length ? item.genreNames : fallback.genreNames,
    };
  });

  // Discover normally returns the same IDs for every language. Including a
  // fallback-only entry prevents a temporary localization gap from silently
  // removing an otherwise available subscription title.
  return [...merged, ...fallbackByKey.values()].sort(
    (left, right) => right.popularity - left.popularity || left.title.localeCompare(right.title),
  );
}

export async function fetchCatalogSlice({
  tmdbGet,
  region,
  language,
  providerGroup,
  mediaType,
  genres,
  generatedAt,
  resolveDropoutNetworkId,
  pageLimit,
  exhaustive,
  concurrency,
  warnings,
}) {
  const { provider, sourceIds } = providerGroup;
  if (provider.kind === "dropout" && mediaType === "movie") return [];
  if (provider.kind !== "dropout" && sourceIds[mediaType].length === 0) return [];

  const params = provider.kind === "dropout"
    ? {
        language,
        sort_by: "popularity.desc",
        include_adult: false,
        with_networks: await resolveDropoutNetworkId(language),
      }
    : {
        language,
        sort_by: "popularity.desc",
        include_adult: false,
        watch_region: region,
        with_watch_providers: sourceIds[mediaType].join("|"),
        // This is the release invariant that keeps rentals and purchases out.
        with_watch_monetization_types: "flatrate",
      };

  const results = await fetchCompleteDiscover({
    tmdbGet,
    mediaType,
    params,
    pageLimit,
    exhaustive,
    concurrency,
    warnings,
  });
  const unique = new Map();
  for (const result of results) {
    unique.set(result.id, mapResult(result, mediaType, provider, genres, generatedAt));
  }
  return [...unique.values()].sort(
    (left, right) => right.popularity - left.popularity || left.title.localeCompare(right.title),
  );
}

async function writeJson(root, relativePath, value) {
  const destination = path.join(root, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(value) + "\n", "utf8");
}

export async function generateCatalogFeed(configuration, dependencies = {}) {
  const tmdbGet = dependencies.tmdbGet || createTmdbClient(configuration);
  const logger = dependencies.logger || console;
  const generatedAt = dependencies.generatedAt || Date.now();
  const buildingRoot = configuration.outputRoot + `.building-${process.pid}`;
  const warnings = [];
  const statistics = { regions: 0, locales: 0, slices: 0, titles: 0, withPosters: 0 };

  await rm(buildingRoot, { recursive: true, force: true });
  await mkdir(buildingRoot, { recursive: true });
  const resolveDropoutNetworkId = createDropoutNetworkResolver(tmdbGet);
  const manifestRegions = [];
  const fallbackLanguage = configuration.languages.includes("en-US") ? "en-US" : null;
  const generationLanguages = fallbackLanguage
    ? [fallbackLanguage, ...configuration.languages.filter((language) => language !== fallbackLanguage)]
    : configuration.languages;

  try {
    for (const region of configuration.regions) {
      statistics.regions += 1;
      manifestRegions.push({ code: region, languages: configuration.languages });
      const fallbackSlices = new Map();
      for (const language of generationLanguages) {
        statistics.locales += 1;
        logger.log(`Generating ${region}/${language}`);
        const [providerGroups, genres] = await Promise.all([
          fetchLogicalProviders(tmdbGet, region, language),
          fetchGenres(tmdbGet, language),
        ]);
        const providers = providerGroups.map((group) => group.provider);
        await writeJson(buildingRoot, `${region}/${language}/providers.json`, {
          schemaVersion: FEED_SCHEMA_VERSION,
          generatedAt,
          region,
          language,
          providers,
        });

        for (const providerGroup of providerGroups) {
          for (const mediaType of ["movie", "tv"]) {
            let items = await fetchCatalogSlice({
              tmdbGet,
              region,
              language,
              providerGroup,
              mediaType,
              genres,
              generatedAt,
              resolveDropoutNetworkId,
              pageLimit: configuration.pageLimit,
              exhaustive: configuration.exhaustive,
              concurrency: configuration.concurrency,
              warnings,
            });
            const sliceKey = `${providerGroup.provider.id}:${mediaType}`;
            if (language === fallbackLanguage) {
              fallbackSlices.set(sliceKey, items);
            } else if (fallbackLanguage) {
              items = mergeLocalizedItems(items, fallbackSlices.get(sliceKey) ?? []);
            }
            statistics.slices += 1;
            statistics.titles += items.length;
            statistics.withPosters += items.filter((item) => item.posterPath).length;
            await writeJson(
              buildingRoot,
              `${region}/${language}/${providerGroup.provider.id}/${mediaType}.json`,
              {
                schemaVersion: FEED_SCHEMA_VERSION,
                generatedAt,
                region,
                language,
                provider: providerGroup.provider,
                mediaType,
                itemCount: items.length,
                items,
              },
            );
          }
        }
      }
    }

    await writeJson(buildingRoot, "manifest.json", {
      schemaVersion: FEED_SCHEMA_VERSION,
      generatedAt,
      regions: manifestRegions,
      exhaustive: configuration.exhaustive,
      monetizationTypes: ["flatrate"],
      statistics,
      warnings,
      attribution: [TMDB_ATTRIBUTION, AVAILABILITY_ATTRIBUTION],
    });

    await rm(configuration.outputRoot, { recursive: true, force: true });
    await mkdir(path.dirname(configuration.outputRoot), { recursive: true });
    await rename(buildingRoot, configuration.outputRoot);
    await writeFile(path.join(path.dirname(configuration.outputRoot), ".nojekyll"), "", "utf8");
    return { generatedAt, statistics, warnings };
  } catch (error) {
    await rm(buildingRoot, { recursive: true, force: true });
    throw error;
  }
}
