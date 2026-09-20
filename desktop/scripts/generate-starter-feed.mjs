import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("public/catalog/v1");
const generatedAt = Date.UTC(2026, 8, 16);
const regions = [
  "US", "GB", "CA", "AU", "NZ", "TR", "DE", "FR",
  "ES", "IT", "NL", "IN", "JP", "KR", "BR", "MX",
];
const providers = [
  { id: 8, name: "Netflix", logoPath: null, kind: "watch" },
  { id: 9, name: "Amazon Prime Video", logoPath: null, kind: "watch" },
  { id: 1899, name: "Max", logoPath: null, kind: "watch" },
  { id: 337, name: "Disney+", logoPath: null, kind: "watch" },
  { id: -101, name: "Dropout", logoPath: null, kind: "dropout" },
];

const entries = [
  [8, "tv", "Stranger Things", "Friends in a small town confront secret experiments, a missing child and a parallel world.", ["Drama", "Horror", "Sci-Fi"], "2016-07-15", 8.6],
  [8, "tv", "Blue Eye Samurai", "A relentless swordmaster crosses Edo-period Japan on a secret quest for revenge.", ["Action", "Animation", "Drama"], "2023-11-03", 8.5],
  [8, "tv", "Our Planet II", "Animals migrate across a changing planet along ancient routes shaped by survival.", ["Documentary", "Nature"], "2023-06-14", 8.5],
  [8, "movie", "Glass Onion", "A detective joins an island gathering where a staged murder mystery becomes real.", ["Comedy", "Crime", "Mystery"], "2022-11-23", 7.1],
  [8, "movie", "Nimona", "A shape-shifting teenager helps a framed knight challenge a fearful kingdom.", ["Adventure", "Animation", "Comedy", "Fantasy"], "2023-06-23", 7.9],
  [9, "tv", "Fallout", "A sheltered vault dweller enters a radioactive wasteland of rival survivors.", ["Action", "Adventure", "Drama", "Sci-Fi"], "2024-04-10", 8.2],
  [9, "tv", "The Boys", "A vigilante crew tries to expose celebrity superheroes hiding lethal corruption.", ["Action", "Comedy", "Drama", "Sci-Fi"], "2019-07-25", 8.4],
  [9, "tv", "Fleabag", "A sharp Londoner narrates grief, family chaos, a funeral and a wedding.", ["Comedy", "Drama"], "2016-07-21", 8.7],
  [9, "movie", "Sound of Metal", "A touring drummer faces sudden hearing loss and reconsiders his identity.", ["Drama", "Music"], "2020-11-20", 7.7],
  [1899, "tv", "The Last of Us", "A smuggler escorts a teenager across an America shaped by fungal infection.", ["Drama", "Horror", "Sci-Fi"], "2023-01-15", 8.7],
  [1899, "tv", "Succession", "A media dynasty turns boardrooms, weddings and a funeral into a fight for control.", ["Comedy", "Drama"], "2018-06-03", 8.8],
  [1899, "tv", "The Jinx", "Filmmakers revisit disappearances linked to a wealthy heir.", ["Crime", "Documentary", "Mystery"], "2015-02-08", 8.0],
  [1899, "movie", "Dune: Part Two", "A young exile joins desert fighters and faces a war spreading across the stars.", ["Action", "Adventure", "Drama", "Sci-Fi"], "2024-02-27", 8.5],
  [337, "tv", "Andor", "An ordinary thief is drawn into a dangerous rebellion against an empire.", ["Action", "Drama", "Sci-Fi", "Thriller"], "2022-09-21", 8.4],
  [337, "tv", "Bluey", "An energetic blue heeler turns family routines into playful adventures.", ["Animation", "Comedy", "Family"], "2018-10-01", 8.6],
  [337, "movie", "Encanto", "A child without a magical gift may be the one who can heal her family.", ["Animation", "Comedy", "Family", "Fantasy", "Music"], "2021-11-24", 7.6],
  [337, "movie", "Free Solo", "A climber prepares to scale El Capitan without ropes.", ["Adventure", "Documentary", "Sport"], "2018-09-28", 8.2],
  [-101, "tv", "Game Changer", "Comedians enter a game without knowing the rules.", ["Comedy", "Game Show"], "2019-09-20", 8.7],
  [-101, "tv", "Make Some Noise", "Performers turn impossible sound prompts into chaotic improvisation.", ["Comedy", "Game Show", "Improv"], "2022-06-13", 8.8],
  [-101, "tv", "Dimension 20", "Comedians build adventurous tabletop worlds from fantasy and improvised chaos.", ["Actual Play", "Comedy", "Fantasy"], "2018-09-26", 9.1],
];

const genreIds = new Map();
let nextGenreId = 1000;
for (const entry of entries) {
  for (const genre of entry[4]) {
    if (!genreIds.has(genre)) genreIds.set(genre, nextGenreId++);
  }
}

function toItem(entry, index) {
  const [providerId, mediaType, title, overview, genres, releaseDate, rating] = entry;
  const provider = providers.find((candidate) => candidate.id === providerId);
  const tmdbId = -(index + 1);
  return {
    key: mediaType + ":" + tmdbId,
    tmdbId,
    mediaType,
    title,
    originalTitle: title,
    overview,
    posterPath: null,
    backdropPath: null,
    releaseDate,
    genreIds: genres.map((genre) => genreIds.get(genre)),
    genreNames: genres,
    voteAverage: rating,
    voteCount: 10000 - index * 127,
    popularity: 100 - index,
    providerLinks: [{ providerId, providerName: provider.name }],
    syncedAt: generatedAt,
  };
}

async function writeJson(relativePath, data) {
  const destination = path.join(root, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(data), "utf8");
}

await rm(root, { recursive: true, force: true });
for (const region of regions) {
  for (const language of ["en-US", "tr-TR"]) {
    await writeJson(region + "/" + language + "/providers.json", {
      schemaVersion: 2,
      starter: true,
      generatedAt,
      region,
      language,
      providers,
    });
    for (const provider of providers) {
      for (const mediaType of ["movie", "tv"]) {
        const items = entries
          .map(toItem)
          .filter(
            (item) =>
              item.mediaType === mediaType &&
              item.providerLinks[0].providerId === provider.id,
          );
        await writeJson(
          region + "/" + language + "/" + provider.id + "/" + mediaType + ".json",
          {
            schemaVersion: 2,
            starter: true,
            generatedAt,
            region,
            language,
            provider,
            mediaType,
            itemCount: items.length,
            items,
          },
        );
      }
    }
  }
}
await writeJson("manifest.json", {
  schemaVersion: 2,
  starter: true,
  generatedAt,
  regions: regions.map((code) => ({ code, languages: ["en-US", "tr-TR"] })),
  exhaustive: false,
  monetizationTypes: ["flatrate"],
  statistics: {
    regions: regions.length,
    locales: regions.length * 2,
    slices: regions.length * 2 * providers.length * 2,
    titles: regions.length * 2 * entries.length,
    withPosters: 0,
  },
  warnings: ["Development-only starter catalogue; not a production availability feed."],
  attribution: [
    "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    "Streaming availability data is powered by JustWatch through TMDb.",
  ],
});
console.log("Bundled Watchmaker starter feed generated.");
