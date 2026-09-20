import assert from "node:assert/strict";
import test from "node:test";
import {
  attachTrendingRanks,
  fetchDropoutHotlineEpisodes,
  fetchWeeklyTrendingRanks,
  mergeLocalizedEpisodes,
} from "./hotline-data.mjs";

test("weekly trend ranks preserve TMDb order and ignore duplicate IDs", async () => {
  const calls = [];
  const tmdbGet = async (endpoint, params) => {
    calls.push([endpoint, params.page]);
    if (params.page === 1) {
      return { total_pages: 2, results: [{ id: 10 }, { id: 20 }] };
    }
    return { results: [{ id: 20 }, { id: 30 }] };
  };

  const ranks = await fetchWeeklyTrendingRanks(tmdbGet, { pageLimit: 2, concurrency: 2 });

  assert.deepEqual([...ranks.movie], [[10, 1], [20, 2], [30, 3]]);
  assert.deepEqual([...ranks.tv], [[10, 1], [20, 2], [30, 3]]);
  assert.deepEqual(calls, [
    ["/trending/movie/week", 1],
    ["/trending/movie/week", 2],
    ["/trending/tv/week", 1],
    ["/trending/tv/week", 2],
  ]);
});

test("trend ranks are attached only to titles present in the weekly list", () => {
  const ranked = attachTrendingRanks(
    [{ tmdbId: 1, title: "Ranked" }, { tmdbId: 2, title: "Fallback" }],
    "movie",
    { movie: new Map([[1, 7]]), tv: new Map() },
  );

  assert.equal(ranked[0].trendingRank, 7);
  assert.equal("trendingRank" in ranked[1], false);
});

test("Dropout Hotline publishes only aired episodes from each latest season", async () => {
  const generatedAt = Date.parse("2026-09-20T12:00:00Z");
  const tmdbGet = async (endpoint) => {
    const match = endpoint.match(/^\/tv\/(\d+)(?:\/season\/(\d+))?$/);
    assert.ok(match, `Unexpected endpoint: ${endpoint}`);
    if (!match[2]) {
      return {
        name: "Localized show",
        poster_path: "/series.jpg",
        backdrop_path: "/series-backdrop.jpg",
        last_episode_to_air: { season_number: 3 },
      };
    }
    return {
      episodes: [
        {
          id: Number(match[1]) * 10 + 1,
          episode_number: 1,
          name: "Already Here",
          overview: "An aired episode.",
          air_date: "2026-09-10",
          still_path: "/still.jpg",
        },
        {
          id: Number(match[1]) * 10 + 2,
          episode_number: 2,
          name: "Not Yet",
          overview: "A future episode.",
          air_date: "2026-10-01",
          still_path: "/future.jpg",
        },
      ],
    };
  };

  const result = await fetchDropoutHotlineEpisodes({
    tmdbGet,
    catalogItems: [{ tmdbId: 89180, title: "Dimension 20", posterPath: "/catalog.jpg" }],
    language: "en-US",
    generatedAt,
    episodeLimit: 5,
  });

  assert.equal(result.warnings.length, 0);
  assert.equal(result.episodes.length, 4);
  assert.ok(result.episodes.every((episode) => episode.episodeName === "Already Here"));
  assert.ok(result.episodes.every((episode) => episode.seasonNumber === 3));
  assert.ok(result.episodes.every((episode) => episode.url.startsWith("https://watch.dropout.tv/search?q=")));
  assert.match(result.episodes[0].url, /Dimension%2020%20Already%20Here/);
});

test("localized Dropout episodes inherit missing text and artwork from English", () => {
  const fallback = [{
    key: "dropout:89180:1",
    seriesTitle: "Dimension 20",
    episodeName: "The Finale",
    overview: "English description",
    stillPath: "/still.jpg",
    seriesPosterPath: "/poster.jpg",
    seriesBackdropPath: "/backdrop.jpg",
    airDate: "2026-09-01",
    url: "https://watch.dropout.tv/search?q=Dimension%2020%20The%20Finale",
  }];
  const primary = [{
    ...fallback[0],
    episodeName: "Final",
    overview: "",
    stillPath: null,
    seriesPosterPath: null,
    url: "https://watch.dropout.tv/search?q=localized",
  }];

  assert.deepEqual(mergeLocalizedEpisodes(primary, fallback), [{
    ...primary[0],
    overview: "English description",
    stillPath: "/still.jpg",
    seriesPosterPath: "/poster.jpg",
    url: "https://watch.dropout.tv/search?q=Dimension%2020%20The%20Finale",
  }]);
});
