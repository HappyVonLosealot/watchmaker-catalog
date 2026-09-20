const WIKIDATA_QUERY_ENDPOINT = "https://query.wikidata.org/sparql";
const DEFAULT_BATCH_SIZE = 180;
const DEFAULT_RETRIES = 4;
const DISNEY_PROVIDER_ID = 337;
const ENTITY_ID = /^entity-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEGACY_ID = /^[A-Za-z0-9_-]{6,32}$/;
const REGION = /^[A-Z]{2}$/;
const LANGUAGE = /^[a-z]{2}-[A-Z]{2}$/;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleMatches(candidateName, item) {
  const normalizedCandidate = normalizeTitle(candidateName);
  if (!normalizedCandidate) return false;
  return [item.title, item.originalTitle]
    .map(normalizeTitle)
    .filter(Boolean)
    .includes(normalizedCandidate);
}

function candidateValueIsValid(candidate, mediaType) {
  if (candidate.kind === "browse") return ENTITY_ID.test(candidate.value);
  if (candidate.kind === "movie") return mediaType === "movie" && LEGACY_ID.test(candidate.value);
  if (candidate.kind === "series") return mediaType === "tv" && LEGACY_ID.test(candidate.value);
  return false;
}

function candidateScore(candidate, item) {
  if (!candidateValueIsValid(candidate, item.mediaType)) return Number.NEGATIVE_INFINITY;
  const rank = String(candidate.rank || "");
  if (rank.endsWith("DeprecatedRank")) return Number.NEGATIVE_INFINITY;

  // P1810 marks what a particular external ID represents. A non-matching name
  // commonly means a sing-along, short, trailer or other variant, so precision
  // is safer than opening the wrong Disney title.
  if (candidate.name && !titleMatches(candidate.name, item)) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = candidate.kind === "browse" ? 300 : 200;
  if (rank.endsWith("PreferredRank")) score += 30;
  if (candidate.name) score += 60;
  else score += 40;
  return score;
}

export function selectDisneyCandidate(candidates, item) {
  return [...candidates]
    .map((candidate, index) => ({ candidate, index, score: candidateScore(candidate, item) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]
    ?.candidate ?? null;
}

export function disneyLocale(language, region) {
  if (!LANGUAGE.test(language) || !REGION.test(region)) {
    throw new Error("Disney links require a valid catalogue language and region.");
  }
  return `${language.slice(0, 2).toLocaleLowerCase("en-US")}-${region.toLocaleLowerCase("en-US")}`;
}

export function tmdbWatchUrl(mediaType, tmdbId, region) {
  if (!['movie', 'tv'].includes(mediaType) || !Number.isSafeInteger(tmdbId) || !REGION.test(region)) {
    throw new Error("TMDb handoff requires a valid title and catalogue region.");
  }
  return `https://www.themoviedb.org/${mediaType}/${tmdbId}/watch?locale=${region}`;
}

export function disneyCandidateUrl(candidate, { mediaType, region, language }) {
  if (!candidate || !candidateValueIsValid(candidate, mediaType)) return null;
  const locale = disneyLocale(language, region);
  if (candidate.kind === "browse") {
    return `https://www.disneyplus.com/${locale}/browse/${candidate.value}`;
  }
  const section = candidate.kind === "movie" ? "movies" : "series";
  return `https://www.disneyplus.com/${locale}/${section}/wd/${candidate.value}`;
}

export function isSafePublishedDisneyUrl(url, { mediaType, tmdbId, region, language }) {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) return false;

    if (parsed.hostname === "www.disneyplus.com") {
      if (parsed.search) return false;
      const locale = disneyLocale(language, region);
      const escapedLocale = locale.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const entityPath = new RegExp(
        `^/${escapedLocale}/browse/entity-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/?$`,
        "i",
      );
      const legacySection = mediaType === "movie" ? "movies" : "series";
      const legacyPath = new RegExp(
        `^/${escapedLocale}/${legacySection}/wd/[A-Za-z0-9_-]{6,32}/?$`,
      );
      return entityPath.test(parsed.pathname) || legacyPath.test(parsed.pathname);
    }

    if (parsed.hostname === "www.themoviedb.org") {
      if (parsed.pathname !== `/${mediaType}/${tmdbId}/watch`) return false;
      if (parsed.searchParams.size !== 1 || parsed.searchParams.get("locale") !== region) return false;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function queryFor(mediaType, ids) {
  const tmdbProperty = mediaType === "movie" ? "P4947" : "P4983";
  const legacyProperty = mediaType === "movie" ? "P7595" : "P7596";
  const legacyKind = mediaType === "movie" ? "movie" : "series";
  const values = ids.map((id) => `"${id}"`).join(" ");

  return `
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX ps: <http://www.wikidata.org/prop/statement/>
PREFIX pq: <http://www.wikidata.org/prop/qualifier/>
SELECT ?tmdb ?kind ?value ?name WHERE {
  VALUES ?tmdb { ${values} }
  ?item wdt:${tmdbProperty} ?tmdb .
  {
    ?item p:P13902 ?statement .
    ?statement ps:P13902 ?value .
    BIND("browse" AS ?kind)
  }
  UNION
  {
    ?item p:${legacyProperty} ?statement .
    ?statement ps:${legacyProperty} ?value .
    BIND("${legacyKind}" AS ?kind)
  }
  OPTIONAL { ?statement pq:P1810 ?name . }
}`.trim();
}

function bindingValue(binding, key) {
  const value = binding?.[key]?.value;
  return typeof value === "string" ? value : "";
}

function parseRows(payload) {
  const rows = Array.isArray(payload?.results?.bindings) ? payload.results.bindings : [];
  return rows.map((binding) => ({
    tmdbId: bindingValue(binding, "tmdb"),
    candidate: {
      kind: bindingValue(binding, "kind"),
      value: bindingValue(binding, "value"),
      name: bindingValue(binding, "name"),
      rank: bindingValue(binding, "rank"),
    },
  }));
}

export function createDisneyLinkResolver({
  fetchImpl = globalThis.fetch,
  sleep = delay,
  endpoint = WIKIDATA_QUERY_ENDPOINT,
  batchSize = DEFAULT_BATCH_SIZE,
  retries = DEFAULT_RETRIES,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("This Node version does not provide fetch.");
  const cache = new Map();

  async function queryBatch(mediaType, ids) {
    let lastError;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45_000);
      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            Accept: "application/sparql-results+json",
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "User-Agent": "Watchmaker/1.0 (https://github.com/HappyVonLosealot/watchmaker-catalog)",
          },
          body: new URLSearchParams({ query: queryFor(mediaType, ids) }).toString(),
          signal: controller.signal,
        });
        if (!response.ok) {
          const error = new Error(`Wikidata request failed with status ${response.status}.`);
          error.retryable = response.status === 429 || response.status >= 500;
          throw error;
        }
        return parseRows(await response.json());
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (lastError.retryable === false || attempt === retries - 1) throw lastError;
        await sleep(Math.min(1_000 * 2 ** attempt, 12_000));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError ?? new Error("Wikidata request failed.");
  }

  async function attach(items, { mediaType, region, language }) {
    const warnings = [];
    let failedTitleCount = 0;
    let lastFailure = null;
    const missingIds = [...new Set(
      items
        .map((item) => item.tmdbId)
        .filter((id) => Number.isSafeInteger(id) && !cache.has(`${mediaType}:${id}`)),
    )];

    for (const batch of chunks(missingIds, Math.max(1, Math.min(batchSize, 300)))) {
      const grouped = new Map(batch.map((id) => [String(id), []]));
      try {
        for (const row of await queryBatch(mediaType, batch)) {
          if (grouped.has(row.tmdbId)) grouped.get(row.tmdbId).push(row.candidate);
        }
      } catch (error) {
        failedTitleCount += batch.length;
        lastFailure = error;
      }
      for (const id of batch) cache.set(`${mediaType}:${id}`, grouped.get(String(id)) || []);
    }

    if (failedTitleCount > 0) {
      warnings.push(
        `Could not refresh ${failedTitleCount} Disney+ title links from Wikidata; ` +
          `TMDb title handoffs were used instead ` +
          `(${lastFailure instanceof Error ? lastFailure.message : lastFailure}).`,
      );
    }

    let directCount = 0;
    const linkedItems = items.map((item) => {
      const candidate = selectDisneyCandidate(cache.get(`${mediaType}:${item.tmdbId}`) || [], item);
      const directUrl = disneyCandidateUrl(candidate, { mediaType, region, language });
      const url = directUrl || tmdbWatchUrl(mediaType, item.tmdbId, region);
      if (directUrl) directCount += 1;
      return {
        ...item,
        providerLinks: item.providerLinks.map((link) =>
          link.providerId === DISNEY_PROVIDER_ID ? { ...link, url } : link,
        ),
      };
    });

    return {
      items: linkedItems,
      directCount,
      fallbackCount: linkedItems.length - directCount,
      warnings,
    };
  }

  return { attach };
}
