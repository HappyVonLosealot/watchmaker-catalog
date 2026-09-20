import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { FEED_SCHEMA_VERSION } from "./lib/catalog-generator.mjs";

const root = path.resolve(process.argv[2] || process.env.WATCHMAKER_FEED_DIR || "catalog-dist/v1");
const imagePathPattern = /^\/[A-Za-z0-9._/-]+$/;
const localePattern = /^[a-z]{2}-[A-Z]{2}$/;
const regionPattern = /^[A-Z]{2}$/;
const errors = [];
const warnings = [];
let fileCount = 0;
let sliceCount = 0;
let titleCount = 0;
let posterCount = 0;

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

function validateItem(item, mediaType, provider, location, seen) {
  titleCount += 1;
  if (!Number.isSafeInteger(item?.tmdbId)) fail(location, "tmdbId must be a safe integer");
  if (item?.mediaType !== mediaType) fail(location, `expected mediaType ${mediaType}`);
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
  if (!Array.isArray(item?.providerLinks) || item.providerLinks.length !== 1) {
    fail(location, "a provider slice item must contain exactly one provider link");
  } else {
    const link = item.providerLinks[0];
    if (link.providerId !== provider.id || link.providerName !== provider.name) {
      fail(location, "provider link does not match the containing slice");
    }
    if ("url" in link && link.url !== undefined) {
      fail(location, "generated provider links must not contain unverified URLs");
    }
  }
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
          validateItem(item, mediaType, provider, `${slicePath}#${index}`, seen),
        );
      }
    }
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
      `(${posterCount.toLocaleString()} with posters).`,
  );
}
