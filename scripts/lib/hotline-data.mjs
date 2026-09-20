const IMAGE_PATH = /^\/[A-Za-z0-9._/-]+$/;
const DEFAULT_TRENDING_PAGES = 20;
const DEFAULT_EPISODES_PER_SHOW = 5;

export const DROPOUT_HOTLINE_SHOWS = [
  { tmdbId: 89180, title: "Dimension 20" },
  { tmdbId: 129412, title: "Game Changer" },
  { tmdbId: 204031, title: "Make Some Noise" },
  { tmdbId: 250251, title: "Smartypants" },
];

function safeImagePath(value) {
  return typeof value === "string" && IMAGE_PATH.test(value) ? value : null;
}

function airedBy(value, generatedAt) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T23:59:59Z`);
  return Number.isFinite(timestamp) && timestamp <= generatedAt;
}

async function mapWithConcurrency(values, concurrency, worker) {
  const output = new Array(values.length);
  let next = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), values.length) },
    async () => {
      while (next < values.length) {
        const index = next;
        next += 1;
        output[index] = await worker(values[index], index);
      }
    },
  );
  await Promise.all(runners);
  return output;
}

export async function fetchWeeklyTrendingRanks(
  tmdbGet,
  { pageLimit = DEFAULT_TRENDING_PAGES, concurrency = 4 } = {},
) {
  const ranks = { movie: new Map(), tv: new Map() };

  for (const mediaType of ["movie", "tv"]) {
    const endpoint = `/trending/${mediaType}/week`;
    const first = await tmdbGet(endpoint, { page: 1, language: "en-US" });
    const pages = Math.max(1, Math.min(first.total_pages || 1, pageLimit));
    const remaining = await mapWithConcurrency(
      Array.from({ length: pages - 1 }, (_, index) => index + 2),
      concurrency,
      (page) => tmdbGet(endpoint, { page, language: "en-US" }),
    );
    const results = [first, ...remaining].flatMap((response) => response.results || []);
    let rank = 1;
    for (const result of results) {
      if (Number.isSafeInteger(result?.id) && !ranks[mediaType].has(result.id)) {
        ranks[mediaType].set(result.id, rank);
        rank += 1;
      }
    }
  }

  return ranks;
}

export function attachTrendingRanks(items, mediaType, ranks) {
  const mediaRanks = ranks?.[mediaType];
  return items.map((item) => {
    const trendingRank = mediaRanks instanceof Map ? mediaRanks.get(item.tmdbId) : undefined;
    if (!Number.isSafeInteger(trendingRank) || trendingRank < 1) return item;
    return { ...item, trendingRank };
  });
}

function latestSeasonNumber(details, generatedAt) {
  const lastEpisodeSeason = details?.last_episode_to_air?.season_number;
  if (Number.isSafeInteger(lastEpisodeSeason) && lastEpisodeSeason >= 0) {
    return lastEpisodeSeason;
  }

  return (details?.seasons || [])
    .filter((season) =>
      Number.isSafeInteger(season?.season_number) &&
      season.season_number >= 0 &&
      airedBy(season.air_date, generatedAt),
    )
    .sort((left, right) => right.season_number - left.season_number)[0]?.season_number ?? null;
}

function episodeSearchUrl(seriesTitle, episodeName) {
  return `https://watch.dropout.tv/search?q=${encodeURIComponent(`${seriesTitle} ${episodeName}`)}`;
}

async function episodesForShow({
  tmdbGet,
  catalogItem,
  favorite,
  language,
  generatedAt,
  episodeLimit,
}) {
  const details = await tmdbGet(`/tv/${favorite.tmdbId}`, { language });
  const seasonNumber = latestSeasonNumber(details, generatedAt);
  if (!Number.isSafeInteger(seasonNumber)) return [];

  const season = await tmdbGet(`/tv/${favorite.tmdbId}/season/${seasonNumber}`, { language });
  return (season.episodes || [])
    .filter((episode) =>
      Number.isSafeInteger(episode?.id) &&
      Number.isSafeInteger(episode?.episode_number) &&
      airedBy(episode.air_date, generatedAt),
    )
    .sort((left, right) =>
      String(right.air_date).localeCompare(String(left.air_date)) ||
      right.episode_number - left.episode_number,
    )
    .slice(0, episodeLimit)
    .map((episode) => {
      const episodeName = typeof episode.name === "string" && episode.name.trim()
        ? episode.name.trim()
        : `Episode ${episode.episode_number}`;
      const seriesTitle = catalogItem?.title || details?.name || favorite.title;
      return {
        key: `dropout:${favorite.tmdbId}:${episode.id}`,
        seriesTmdbId: favorite.tmdbId,
        seriesTitle,
        episodeTmdbId: episode.id,
        episodeName,
        seasonNumber,
        episodeNumber: episode.episode_number,
        overview: typeof episode.overview === "string" ? episode.overview : "",
        airDate: episode.air_date,
        stillPath: safeImagePath(episode.still_path),
        seriesPosterPath: safeImagePath(catalogItem?.posterPath || details?.poster_path),
        seriesBackdropPath: safeImagePath(catalogItem?.backdropPath || details?.backdrop_path),
        url: episodeSearchUrl(seriesTitle, episodeName),
      };
    });
}

export async function fetchDropoutHotlineEpisodes({
  tmdbGet,
  catalogItems,
  language,
  generatedAt,
  episodeLimit = DEFAULT_EPISODES_PER_SHOW,
}) {
  const catalogById = new Map(catalogItems.map((item) => [item.tmdbId, item]));
  const settled = await Promise.allSettled(
    DROPOUT_HOTLINE_SHOWS.map((favorite) =>
      episodesForShow({
        tmdbGet,
        catalogItem: catalogById.get(favorite.tmdbId),
        favorite,
        language,
        generatedAt,
        episodeLimit,
      }),
    ),
  );

  const warnings = [];
  const episodes = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      episodes.push(...result.value);
    } else {
      warnings.push(
        `Could not refresh ${DROPOUT_HOTLINE_SHOWS[index].title} episodes ` +
          `(${result.reason instanceof Error ? result.reason.message : result.reason}).`,
      );
    }
  });

  episodes.sort((left, right) =>
    right.airDate.localeCompare(left.airDate) ||
    DROPOUT_HOTLINE_SHOWS.findIndex((show) => show.tmdbId === left.seriesTmdbId) -
      DROPOUT_HOTLINE_SHOWS.findIndex((show) => show.tmdbId === right.seriesTmdbId),
  );
  return { episodes, warnings };
}

export function mergeLocalizedEpisodes(primary, fallback) {
  const fallbackByKey = new Map(fallback.map((episode) => [episode.key, episode]));
  const primaryKeys = new Set(primary.map((episode) => episode.key));
  const merged = primary.map((episode) => {
    const fallbackEpisode = fallbackByKey.get(episode.key);
    if (!fallbackEpisode) return episode;
    return {
      ...episode,
      seriesTitle: episode.seriesTitle.trim() ? episode.seriesTitle : fallbackEpisode.seriesTitle,
      episodeName: episode.episodeName.trim() ? episode.episodeName : fallbackEpisode.episodeName,
      overview: episode.overview.trim() ? episode.overview : fallbackEpisode.overview,
      stillPath: episode.stillPath ?? fallbackEpisode.stillPath,
      seriesPosterPath: episode.seriesPosterPath ?? fallbackEpisode.seriesPosterPath,
      seriesBackdropPath: episode.seriesBackdropPath ?? fallbackEpisode.seriesBackdropPath,
      // Dropout's catalogue uses the original English episode names. Keep the
      // English query even when the visible metadata has a localized title.
      url: fallbackEpisode.url,
    };
  });
  merged.push(...fallback.filter((episode) => !primaryKeys.has(episode.key)));
  return merged.sort((left, right) => right.airDate.localeCompare(left.airDate));
}
