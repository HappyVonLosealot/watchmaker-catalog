import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { FEED_SCHEMA_VERSION } from "./lib/catalog-generator.mjs";
import { isSafePublishedDisneyUrl } from "./lib/disney-links.mjs";

const root = path.resolve(process.argv[2] || process.env.WATCHMAKER_FEED_DIR || "catalog-dist/v1");
const imagePathPattern = /^\/[A-Za-z0-9._/-]+$/;
const localePattern = /^[a-z]{2}-[A-Z]{2}$/;
const regionPattern = /^[A-Z]{2}$/;
const semanticVectorPattern = /^[A-Za-z0-9+/]{512}$/;
const airDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const dropoutFavoriteIds = new Set([89180, 129412, 204031, 250251]);
const errors = [];
const warnings = [];
let fileCount = 0;
let sliceCount = 0;
let titleCount = 0;
let posterCount = 0;
let semanticVectorCount = 0;
let vibeScoreCount = 0;
let contentFormatCount = 0;
let directDisneyLinkCount = 0;
let disneyHandoffCount = 0;
let trendingRankCount = 0;
let hotlineEpisodeCount = 0;

function fail(location, message) {
  errors.push(`${location}: ${message}`);
}

async function json(relativePath) {
  const absolutePath = path.join(root, relativePath);
  fileCount += 1;
  try {
    const text = await readFile(absolutePath, "utf8");
    if (/TMDB_READ_TOKEN|api[_-]?key|bearer\s+[A-Za-z0-9._-]{20,}/i.test(text)) {
      fail(relativePath, "contains text that resembles a publisher credential");
    }
    return JSON.parse(text);
  } catch (error) {
    fail(relativePath, error instanceof Error ? error.message : "could not be read");
    return null;
  }
}

function validateProvider(provider, location) {
  if (!Number.isSafeInteger(provider?.id)) fail(location, "provider id must be a safe integer");
  if (typeof provider?.name !== "string" || !provider.name.trim()) {
    fail(location, "provider name is missing");
  }
  if (provider?.logoPath !== null && !imagePathPattern.test(provider?.logoPath || "")) {
    fail(location, "provider logo path is unsafe");
  }
}

function validateItem(item, mediaType, provider, region, language, location, seen) {
  titleCount += 1;
  if (!Number.isSafeInteger(item?.tmdbId)) fail(location, "tmdbId must be a safe integer");
  if (item?.mediaType !== mediaType) fail(location, `expected mediaType ${mediaType}`);
  const expectedFormats = mediaType === "movie" ? ["movie"] : ["series", "miniseries"];
  if (!expectedFormats.includes(item?.contentFormat)) {
    fail(location, `contentFormat must match ${mediaType}`);
  } else {
    contentFormatCount += 1;
  }
  if (item?.key !== `${mediaType}:${item?.tmdbId}`) fail(location, "key does not match media type and id");
  if (seen.has(item?.key)) fail(location, "duplicate title key in provider slice");
  seen.add(item?.key);
  if (typeof item?.title !== "string" || !item.title.trim()) fail(location, "title is missing");
  if (typeof item?.overview !== "string") fail(location, "overview must be a string");
  if (!Array.isArray(item?.genreIds) || !item.genreIds.every(Number.isSafeInteger)) {
    fail(location, "genreIds must contain integers");
  }
  if (!Array.isArray(item?.genreNames) || !item.genreNames.every((name) => typeof name === "string")) {
    fail(location, "genreNames must contain strings");
  }
  if (item?.posterPath !== null && !imagePathPattern.test(item?.posterPath || "")) {
    fail(location, "poster path is unsafe");
  }
  if (item?.posterPath) posterCount += 1;
  if (item?.backdropPath !== null && !imagePathPattern.test(item?.backdropPath || "")) {
    fail(location, "backdrop path is unsafe");
  }
  if (!Number.isFinite(item?.voteAverage) || item.voteAverage < 0 || item.voteAverage > 10) {
    fail(location, "voteAverage must be between 0 and 10");
  }
  if (!Number.isSafeInteger(item?.voteCount) || item.voteCount < 0) {
    fail(location, "voteCount must be a non-negative integer");
  }
  if (item?.trendingRank !== undefined) {
    if (!Number.isSafeInteger(item.trendingRank) || item.trendingRank < 1) {
      fail(location, "trendingRank must be a positive safe integer");
    } else {
      trendingRankCount += 1;
    }
  }
  if (!Array.isArray(item?.providerLinks) || item.providerLinks.length !== 1) {
    fail(location, "a provider slice item must contain exactly one provider link");
  } else {
    const link = item.providerLinks[0];
    if (link.providerId !== provider.id || link.providerName !== provider.name) {
      fail(location, "provider link does not match the containing slice");
    }
    if (provider.id === 337) {
      if (!isSafePublishedDisneyUrl(link.url, {
        mediaType,
        tmdbId: item.tmdbId,
        region,
        language,
      })) {
        fail(location, "Disney+ link is not an approved exact-title URL or TMDb title handoff");
      } else if (new URL(link.url).hostname === "www.disneyplus.com") {
        directDisneyLinkCount += 1;
      } else {
        disneyHandoffCount += 1;
      }
    } else if ("url" in link && link.url !== undefined) {
      fail(location, "generated provider links must not contain unverified URLs");
    }
  }
  if (typeof item?.semanticVector !== "string" || !semanticVectorPattern.test(item.semanticVector)) {
    fail(location, "semanticVector must be a 384-byte int8 base64 fingerprint");
  } else {
    semanticVectorCount += 1;
  }
  const vibeScores = item?.vibeScores;
  const signedVibeAxes = ["cozyStressful", "funnyGrim", "slowFast", "lightDevastating"];
  const signedScoresAreValid = signedVibeAxes.every(
    (axis) => Number.isFinite(vibeScores?.[axis]) && vibeScores[axis] >= -1 && vibeScores[axis] <= 1,
  );
  if (
    !signedScoresAreValid ||
    !Number.isFinite(vibeScores?.productionPolish) ||
    vibeScores.productionPolish < 0 ||
    vibeScores.productionPolish > 1
  ) {
    fail(location, "vibeScores must contain finite precomputed scores in range");
  } else {
    vibeScoreCount += 1;
  }
}

function isSafeDropoutSearchUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
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

function validateHotline(hotline, region, language, location) {
  if (hotline?.schemaVersion !== FEED_SCHEMA_VERSION) {
    fail(location, `expected schema version ${FEED_SCHEMA_VERSION}`);
  }
  if (hotline?.region !== region || hotline?.language !== language) {
    fail(location, "region or language metadata does not match its path");
  }
  if (!Number.isFinite(hotline?.generatedAt) || !Number.isFinite(hotline?.ranking?.refreshedAt)) {
    fail(location, "generation or trend refresh timestamp is invalid");
  }
  if (hotline?.ranking?.source !== "tmdb-weekly-trending-then-popularity") {
    fail(location, "ranking source is invalid");
  }
  if (hotline?.dropout?.providerId !== -101) fail(location, "Dropout provider id is invalid");
  if (!Array.isArray(hotline?.dropout?.favorites)) {
    fail(location, "Dropout favorites must be an array");
  } else {
    const favorites = new Set();
    for (const favorite of hotline.dropout.favorites) {
      if (
        !Number.isSafeInteger(favorite?.tmdbId) ||
        !dropoutFavoriteIds.has(favorite.tmdbId) ||
        typeof favorite?.title !== "string" ||
        !favorite.title.trim() ||
        favorites.has(favorite.tmdbId)
      ) {
        fail(location, "Dropout favorites contain an invalid or duplicate show");
      }
      favorites.add(favorite?.tmdbId);
    }
    if (favorites.size !== dropoutFavoriteIds.size) {
      fail(location, "Dropout favorites do not contain all four configured shows");
    }
  }
  if (!Array.isArray(hotline?.dropout?.episodes)) {
    fail(location, "Dropout episodes must be an array");
    return;
  }
  if (hotline.dropout.episodes.length > 100) fail(location, "too many Dropout episodes");
  const keys = new Set();
  hotline.dropout.episodes.forEach((episode, index) => {
    const episodeLocation = `${location}#dropout.episodes.${index}`;
    hotlineEpisodeCount += 1;
    if (
      !Number.isSafeInteger(episode?.seriesTmdbId) ||
      !dropoutFavoriteIds.has(episode.seriesTmdbId) ||
      !Number.isSafeInteger(episode?.episodeTmdbId) ||
      episode?.key !== `dropout:${episode?.seriesTmdbId}:${episode?.episodeTmdbId}`
    ) {
      fail(episodeLocation, "episode identity is invalid");
    }
    if (keys.has(episode?.key)) fail(episodeLocation, "duplicate episode key");
    keys.add(episode?.key);
    if (typeof episode?.seriesTitle !== "string" || !episode.seriesTitle.trim()) {
      fail(episodeLocation, "series title is missing");
    }
    if (typeof episode?.episodeName !== "string" || !episode.episodeName.trim()) {
      fail(episodeLocation, "episode name is missing");
    }
    if (typeof episode?.overview !== "string") fail(episodeLocation, "overview must be a string");
    if (!Number.isSafeInteger(episode?.seasonNumber) || episode.seasonNumber < 0) {
      fail(episodeLocation, "season number is invalid");
    }
    if (!Number.isSafeInteger(episode?.episodeNumber) || episode.episodeNumber < 0) {
      fail(episodeLocation, "episode number is invalid");
    }
    if (!airDatePattern.test(episode?.airDate || "")) fail(episodeLocation, "air date is invalid");
    for (const field of ["stillPath", "seriesPosterPath", "seriesBackdropPath"]) {
      if (episode?.[field] !== null && !imagePathPattern.test(episode?.[field] || "")) {
        fail(episodeLocation, `${field} is unsafe`);
      }
    }
    if (!isSafeDropoutSearchUrl(episode?.url)) fail(episodeLocation, "Dropout search URL is unsafe");
  });
}

const rootInfo = await stat(root).catch(() => null);
if (!rootInfo?.isDirectory()) {
  throw new Error(`Catalogue feed directory does not exist: ${root}`);
}

const manifest = await json("manifest.json");
if (!manifest) throw new Error("Catalogue feed manifest could not be parsed.");
if (manifest.schemaVersion !== FEED_SCHEMA_VERSION) {
  fail("manifest.json", `expected schema version ${FEED_SCHEMA_VERSION}`);
}
if (!Array.isArray(manifest.monetizationTypes) ||
    manifest.monetizationTypes.length !== 1 ||
    manifest.monetizationTypes[0] !== "flatrate") {
  fail("manifest.json", "monetizationTypes must be exactly [\"flatrate\"]");
}
if (!Array.isArray(manifest.regions) || manifest.regions.length === 0) {
  fail("manifest.json", "regions list is empty");
}
if (
  manifest.semanticMatching?.dimensions !== 384 ||
  manifest.semanticMatching?.format !== "int8-base64-v1" ||
  manifest.semanticMatching?.generatedAheadOfTime !== true
) {
  fail("manifest.json", "semantic matching metadata is missing or invalid");
}

for (const regionEntry of manifest.regions || []) {
  const region = regionEntry?.code;
  if (!regionPattern.test(region || "")) {
    fail("manifest.json", `invalid region ${String(region)}`);
    continue;
  }
  for (const language of regionEntry.languages || []) {
    if (!localePattern.test(language)) {
      fail("manifest.json", `invalid language ${String(language)} for ${region}`);
      continue;
    }
    const providerPath = `${region}/${language}/providers.json`;
    const providerResponse = await json(providerPath);
    if (!providerResponse) continue;
    if (providerResponse.schemaVersion !== FEED_SCHEMA_VERSION) {
      fail(providerPath, `expected schema version ${FEED_SCHEMA_VERSION}`);
    }
    if (providerResponse.region !== region || providerResponse.language !== language) {
      fail(providerPath, "region or language metadata does not match its path");
    }
    if (!Array.isArray(providerResponse.providers)) {
      fail(providerPath, "providers must be an array");
      continue;
    }
    const ids = new Set();
    for (const provider of providerResponse.providers) {
      validateProvider(provider, providerPath);
      if (ids.has(provider.id)) fail(providerPath, `duplicate provider id ${provider.id}`);
      ids.add(provider.id);
      for (const mediaType of ["movie", "tv"]) {
        const slicePath = `${region}/${language}/${provider.id}/${mediaType}.json`;
        const slice = await json(slicePath);
        if (!slice) continue;
        sliceCount += 1;
        if (slice.schemaVersion !== FEED_SCHEMA_VERSION) {
          fail(slicePath, `expected schema version ${FEED_SCHEMA_VERSION}`);
        }
        if (slice.region !== region || slice.language !== language || slice.mediaType !== mediaType) {
          fail(slicePath, "slice metadata does not match its path");
        }
        if (slice.provider?.id !== provider.id || slice.provider?.name !== provider.name) {
          fail(slicePath, "slice provider does not match providers.json");
        }
        if (!Array.isArray(slice.items)) {
          fail(slicePath, "items must be an array");
          continue;
        }
        if (slice.itemCount !== slice.items.length) fail(slicePath, "itemCount is incorrect");
        const seen = new Set();
        slice.items.forEach((item, index) =>
          validateItem(item, mediaType, provider, region, language, `${slicePath}#${index}`, seen),
        );
      }
    }
    const hotlinePath = `${region}/${language}/hotline.json`;
    const hotline = await json(hotlinePath);
    if (hotline) validateHotline(hotline, region, language, hotlinePath);
  }
}

// Flag files that are outside the manifest tree; they often indicate a stale
// provider or region that would otherwise remain publicly accessible.
const topLevel = await readdir(root, { withFileTypes: true });
const expectedRegions = new Set((manifest.regions || []).map((entry) => entry.code));
for (const entry of topLevel) {
  if (entry.name === "manifest.json") continue;
  if (!entry.isDirectory() || !expectedRegions.has(entry.name)) {
    warnings.push(`Unexpected top-level feed entry: ${entry.name}`);
  }
}

if (manifest.statistics) {
  if (manifest.statistics.slices !== sliceCount) {
    fail("manifest.json", `statistics.slices says ${manifest.statistics.slices}, validated ${sliceCount}`);
  }
  if (manifest.statistics.titles !== titleCount) {
    fail("manifest.json", `statistics.titles says ${manifest.statistics.titles}, validated ${titleCount}`);
  }
  if (manifest.statistics.withPosters !== posterCount) {
    fail("manifest.json", `statistics.withPosters says ${manifest.statistics.withPosters}, validated ${posterCount}`);
  }
  if (manifest.statistics.withSemanticVectors !== semanticVectorCount) {
    fail(
      "manifest.json",
      `statistics.withSemanticVectors says ${manifest.statistics.withSemanticVectors}, ` +
        `validated ${semanticVectorCount}`,
    );
  }
  if (manifest.statistics.withVibeScores !== vibeScoreCount) {
    fail(
      "manifest.json",
      `statistics.withVibeScores says ${manifest.statistics.withVibeScores}, ` +
        `validated ${vibeScoreCount}`,
    );
  }
  if (manifest.statistics.withContentFormats !== contentFormatCount) {
    fail(
      "manifest.json",
      `statistics.withContentFormats says ${manifest.statistics.withContentFormats}, ` +
        `validated ${contentFormatCount}`,
    );
  }
  if (manifest.statistics.withDirectDisneyLinks !== directDisneyLinkCount) {
    fail(
      "manifest.json",
      `statistics.withDirectDisneyLinks says ${manifest.statistics.withDirectDisneyLinks}, ` +
        `validated ${directDisneyLinkCount}`,
    );
  }
  if (manifest.statistics.withDisneyHandoffs !== disneyHandoffCount) {
    fail(
      "manifest.json",
      `statistics.withDisneyHandoffs says ${manifest.statistics.withDisneyHandoffs}, ` +
        `validated ${disneyHandoffCount}`,
    );
  }
  if (manifest.statistics.withTrendingRanks !== trendingRankCount) {
    fail(
      "manifest.json",
      `statistics.withTrendingRanks says ${manifest.statistics.withTrendingRanks}, ` +
        `validated ${trendingRankCount}`,
    );
  }
  if (manifest.statistics.hotlineEpisodes !== hotlineEpisodeCount) {
    fail(
      "manifest.json",
      `statistics.hotlineEpisodes says ${manifest.statistics.hotlineEpisodes}, ` +
        `validated ${hotlineEpisodeCount}`,
    );
  }
}

if (warnings.length > 0) warnings.forEach((warning) => console.warn("Warning: " + warning));
if (errors.length > 0) {
  errors.forEach((error) => console.error("Error: " + error));
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${fileCount.toLocaleString()} feed files, ` +
      `${sliceCount.toLocaleString()} catalogue slices and ` +
      `${titleCount.toLocaleString()} provider-title records ` +
      `(${posterCount.toLocaleString()} with posters, ` +
      `${semanticVectorCount.toLocaleString()} with semantic fingerprints, ` +
      `${trendingRankCount.toLocaleString()} with weekly trend ranks, ` +
      `${hotlineEpisodeCount.toLocaleString()} Hotline episodes, ` +
      `${directDisneyLinkCount.toLocaleString()} direct Disney+ links).`,
  );
}
