import type { CatalogItem, ContentFormat, TasteSignal } from "../types";
import { generalRatingScore } from "./filtering";
import { rankTasteMatches } from "./recommendations";
import { contentFormatFor, vibeScoresFor } from "./vibes";

interface ConceptDefinition {
  key: string;
  label: string;
  terms: string[];
}

interface PromptFeature {
  key: string;
  label: string;
  terms: string[];
}

interface TextField {
  normalized: string;
  tokens: Set<string>;
}

interface CatalogDocument {
  item: CatalogItem;
  title: TextField;
  overview: TextField;
  genres: TextField;
}

interface VibeTarget {
  axis: "cozyStressful" | "funnyGrim" | "slowFast" | "lightDevastating" | "productionPolish";
  value: number;
}

interface PromptIntent {
  positive: PromptFeature[];
  negative: PromptFeature[];
  primary: PromptFeature[];
  modifiers: PromptFeature[];
  format: ContentFormat | null;
  seeds: CatalogItem[];
  vibeTargets: VibeTarget[];
}

export interface PromptMatch {
  item: CatalogItem;
  score: number;
  reason: string;
  matchedKeywords: string[];
  semanticSimilarity: number | null;
}

export interface PromptRecommendationResult {
  matches: PromptMatch[];
  wantedKeywords: string[];
  coreIdeas: string[];
  moodIdeas: string[];
  excludedKeywords: string[];
  referencedTitles: string[];
  format: ContentFormat | null;
  meaningful: boolean;
  semantic: boolean;
}

const SEMANTIC_VECTOR_BYTES = 384;
const SEMANTIC_VECTOR_PATTERN = /^[A-Za-z0-9+/]{512}$/;
const MINIMUM_BEST_SEMANTIC_MATCH = 0.34;
const MINIMUM_SEMANTIC_MATCH = 0.28;
const SEMANTIC_RESULT_BAND = 0.22;

const STOP_WORDS = new Set([
  "a", "about", "all", "also", "an", "and", "any", "anything", "are", "as", "at",
  "be", "but", "by", "can", "could", "do", "does", "for", "from", "give", "has", "have",
  "daily", "day", "everyday", "good", "great", "i", "id", "if", "im", "in", "is", "it", "its", "just", "kind", "life", "like",
  "me", "maybe", "more", "nice",
  "movie", "of", "on", "or", "ordinary", "please", "really", "recommend", "show", "some", "something",
  "similar", "than", "that", "the", "then", "thing", "this", "to", "too", "very", "want", "watch",
  "where", "which", "who", "with", "would",
  // Turkish filler words for prompts and localized descriptions.
  "ama", "bana", "ben", "bir", "biraz", "bu", "da", "daha", "de", "film", "gibi", "icin",
  "ile", "istiyorum", "izlemek", "lütfen", "mi", "olan", "olsun", "sey", "ve", "veya",
]);

const NEGATORS = new Set(["avoid", "except", "excluding", "no", "not", "without", "olmasin", "olmadan"]);
const NEGATION_FILLERS = new Set(["any", "anything", "much", "too", "very"]);
const FORMAT_WORDS = new Set(["film", "films", "movie", "movies", "miniseries", "series"]);

const CONCEPTS: ConceptDefinition[] = [
  { key: "cats", label: "cats", terms: ["cat", "cats", "feline", "felines", "kitten", "kittens", "kitty", "kitties", "kedi", "kediler"] },
  { key: "zombies", label: "zombies / undead", terms: ["zombie", "zombies", "undead", "walker", "walkers", "zombi"] },
  { key: "comedy", label: "funny", terms: ["comedy", "comic", "comedic", "funny", "funnier", "hilarious", "joke", "jokes", "absurd", "komedi", "komik"] },
  { key: "horror", label: "horror", terms: ["horror", "scary", "scarier", "creepy", "terrifying", "frightening", "haunted", "korku", "korkunc"] },
  { key: "romance", label: "romance", terms: ["romance", "romantic", "relationship", "dating", "love", "lover", "romantik", "ask"] },
  { key: "cozy", label: "cozy", terms: ["cozy", "comfort", "comforting", "gentle", "soft", "warm", "wholesome", "sicak", "huzurlu"] },
  { key: "stressful", label: "tense", terms: ["anxious", "danger", "dread", "stressful", "suspense", "tense", "tension", "gerilim", "gergin"] },
  { key: "grim", label: "grim / bleak", terms: ["bleak", "brutal", "dark", "darker", "disturbing", "grim", "grimmer", "harsh", "karanlik"] },
  { key: "serious", label: "serious", terms: ["serious", "sober", "somber", "ciddi"] },
  { key: "slow", label: "slow burn", terms: ["contemplative", "meditative", "patient", "quiet", "slow", "slower", "slowburn", "yavas"] },
  { key: "fast", label: "fast paced", terms: ["actionpacked", "energetic", "fast", "faster", "fastpaced", "relentless", "rapid", "hizli"] },
  { key: "light", label: "light-hearted", terms: ["cheerful", "easygoing", "feelgood", "hopeful", "light", "lighthearted", "uplifting", "neseli"] },
  { key: "devastating", label: "devastating", terms: ["devastating", "grief", "heartbreaking", "loss", "sad", "sadder", "tragedy", "tragic", "trauma", "uzucu"] },
  { key: "friends", label: "group of friends", terms: ["besties", "friend", "friends", "friendship", "group", "crew", "arkadas", "arkadaslar"] },
  { key: "family", label: "family", terms: ["family", "families", "parent", "parents", "sibling", "siblings", "aile"] },
  { key: "found-family", label: "found family", terms: ["foundfamily", "chosenfamily"] },
  { key: "wedding", label: "wedding / marriage", terms: ["bride", "groom", "marriage", "married", "wedding", "dugun", "evlilik"] },
  { key: "funeral", label: "funeral / mourning", terms: ["burial", "coffin", "funeral", "mourning", "cenaze", "yas"] },
  { key: "mystery", label: "mystery", terms: ["clue", "detective", "investigation", "mystery", "secret", "gizem", "gizemli"] },
  { key: "crime", label: "crime", terms: ["criminal", "crime", "gangster", "mafia", "murder", "police", "suc"] },
  { key: "heist", label: "heist / robbery", terms: ["heist", "robbery", "steal", "thief", "thieves", "soygun"] },
  { key: "action", label: "action", terms: ["action", "battle", "chase", "combat", "fight", "mission", "aksiyon"] },
  { key: "survival", label: "survival", terms: ["escape", "survival", "survive", "survivor", "hayatta"] },
  { key: "revenge", label: "revenge", terms: ["revenge", "vengeance", "intikam"] },
  { key: "space", label: "space", terms: ["astronaut", "cosmos", "galaxy", "planet", "space", "spaceship", "uzay"] },
  { key: "aliens", label: "aliens", terms: ["alien", "aliens", "extraterrestrial", "ufo", "uzayli"] },
  { key: "magic", label: "magic", terms: ["magic", "magical", "sorcery", "spell", "witch", "wizard", "buyu", "sihir"] },
  { key: "fantasy", label: "fantasy", terms: ["dragon", "fairy", "fantasy", "kingdom", "mythical", "fantastik"] },
  { key: "scifi", label: "science fiction", terms: ["android", "cyberpunk", "future", "robot", "scifi", "sciencefiction", "yapayzeka"] },
  { key: "apocalypse", label: "apocalypse", terms: ["apocalypse", "apocalyptic", "collapse", "endofworld", "kiyamet"] },
  { key: "time-loop", label: "time loop / travel", terms: ["timeloop", "timetravel", "timewarp", "zamanyolculugu"] },
  { key: "teen", label: "teenagers", terms: ["adolescent", "teen", "teenage", "teenager", "teenagers", "genc", "gencler"] },
  { key: "school", label: "school", terms: ["campus", "college", "highschool", "school", "student", "university", "okul"] },
  { key: "workplace", label: "workplace", terms: ["boss", "coworker", "office", "workplace", "isyer"] },
  { key: "food", label: "food / cooking", terms: ["bake", "chef", "cook", "cooking", "food", "kitchen", "restaurant", "yemek"] },
  { key: "sports", label: "sports", terms: ["athlete", "championship", "football", "game", "sport", "sports", "team", "spor"] },
  { key: "music", label: "music", terms: ["band", "concert", "music", "musical", "singer", "song", "muzik"] },
  { key: "animation", label: "animation", terms: ["animated", "animation", "anime", "cartoon", "animasyon"] },
  { key: "documentary", label: "documentary", terms: ["documentary", "docuseries", "truecrime", "belgesel"] },
  { key: "historical", label: "historical", terms: ["historical", "history", "period", "tarih", "tarihi"] },
  { key: "polished", label: "high-quality production", terms: ["bigbudget", "cinematic", "expensive", "highquality", "polished", "prestige"] },
];

const GENERIC_TITLES = new Set(["anything", "dark", "evil", "family", "friends", "home", "life", "love", "movie", "series", "something"]);
const VIBE_FEATURE_KEYS = new Set([
  "concept:cozy",
  "concept:stressful",
  "concept:comedy",
  "concept:serious",
  "concept:grim",
  "concept:slow",
  "concept:fast",
  "concept:light",
  "concept:devastating",
  "concept:polished",
]);

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(word: string): string {
  if (word.length > 6 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 6 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 5 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 5 && (word.endsWith("lar") || word.endsWith("ler"))) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function words(value: string): string[] {
  return normalize(value).match(/[\p{L}\p{N}]+/gu) ?? [];
}

function textField(value: string): TextField {
  const normalized = normalize(value);
  return {
    normalized: ` ${normalized} `,
    tokens: new Set(words(normalized).flatMap((word) => [word, stem(word)])),
  };
}

const termConcept = new Map<string, ConceptDefinition>();
for (const concept of CONCEPTS) {
  for (const term of concept.terms) {
    termConcept.set(normalize(term).replace(/\s/g, ""), concept);
    termConcept.set(stem(normalize(term).replace(/\s/g, "")), concept);
  }
}

function featureFor(word: string): PromptFeature {
  const normalizedWord = normalize(word).replace(/\s/g, "");
  const concept = termConcept.get(normalizedWord) ?? termConcept.get(stem(normalizedWord));
  if (concept) return { key: `concept:${concept.key}`, label: concept.label, terms: concept.terms };
  return { key: `term:${stem(normalizedWord)}`, label: normalizedWord, terms: [normalizedWord] };
}

function formatFromPrompt(prompt: string): ContentFormat | null {
  const normalized = ` ${normalize(prompt)} `;
  if (/\b(mini ?series|limited series|mini dizi)\b/.test(normalized)) return "miniseries";
  if (/\b(movie|movies|film|films)\b/.test(normalized)) return "movie";
  if (/\b(series|tv series|dizi)\b/.test(normalized)) return "series";
  return null;
}

function detectReferencedTitles(catalog: CatalogItem[], prompt: string): CatalogItem[] {
  const normalizedPrompt = normalize(prompt);
  const matches = catalog
    .map((item) => {
      const title = normalize(item.title);
      const paddedPrompt = ` ${normalizedPrompt} `;
      const matchAt = paddedPrompt.indexOf(` ${title} `);
      const prefix = matchAt >= 0
        ? paddedPrompt.slice(Math.max(0, matchAt - 28), matchAt).trim()
        : "";
      const explicitlyReferenced =
        matchAt === 0 ||
        /(?:like|similar to|vibe of|vibe as|based on)$/.test(prefix);
      return { item, title, matchAt, explicitlyReferenced };
    })
    .filter(({ title, matchAt, explicitlyReferenced }) =>
      title.length >= 7 &&
      !GENERIC_TITLES.has(title) &&
      matchAt >= 0 &&
      explicitlyReferenced,
    )
    .sort((left, right) => right.title.length - left.title.length);
  const seen = new Set<string>();
  const seeds: CatalogItem[] = [];
  for (const match of matches) {
    if (seen.has(match.item.key)) continue;
    seen.add(match.item.key);
    seeds.push(match.item);
    if (seeds.length === 2) break;
  }
  return seeds;
}

function promptFeatures(prompt: string, seeds: CatalogItem[]): {
  positive: PromptFeature[];
  negative: PromptFeature[];
} {
  const positive = new Map<string, PromptFeature>();
  const negative = new Map<string, PromptFeature>();
  const seedWords = new Set(seeds.flatMap((seed) => words(seed.title).map(stem)));
  let negationBudget = 0;
  let negationChain = false;

  for (const rawWord of words(prompt)) {
    const word = stem(rawWord);
    if (rawWord === "but" || rawWord === "ama") {
      negationBudget = 0;
      negationChain = false;
      continue;
    }
    if (rawWord === "or" && negationChain) {
      negationBudget = 1;
      continue;
    }
    if (NEGATORS.has(rawWord) || NEGATORS.has(word)) {
      negationBudget = 1;
      negationChain = true;
      continue;
    }
    if (NEGATION_FILLERS.has(rawWord)) continue;
    if (STOP_WORDS.has(rawWord) || STOP_WORDS.has(word) || FORMAT_WORDS.has(rawWord)) continue;
    if (seedWords.has(word)) continue;

    const feature = featureFor(word);
    if (negationBudget > 0) {
      negative.set(feature.key, feature);
      positive.delete(feature.key);
      negationBudget -= 1;
      negationChain = true;
    } else if (!negative.has(feature.key)) {
      positive.set(feature.key, feature);
      negationChain = false;
    }
  }
  return { positive: [...positive.values()], negative: [...negative.values()] };
}

function vibeTargets(features: PromptFeature[]): VibeTarget[] {
  const keys = new Set(features.map((feature) => feature.key));
  const targets: VibeTarget[] = [];
  if (keys.has("concept:cozy")) targets.push({ axis: "cozyStressful", value: -0.9 });
  if (keys.has("concept:stressful") || keys.has("concept:horror")) {
    targets.push({ axis: "cozyStressful", value: 0.75 });
  }
  if (keys.has("concept:comedy")) targets.push({ axis: "funnyGrim", value: -0.9 });
  if (keys.has("concept:serious")) targets.push({ axis: "funnyGrim", value: 0 });
  if (keys.has("concept:grim")) targets.push({ axis: "funnyGrim", value: 0.85 });
  if (keys.has("concept:slow")) targets.push({ axis: "slowFast", value: -0.85 });
  if (keys.has("concept:fast") || keys.has("concept:action")) {
    targets.push({ axis: "slowFast", value: 0.8 });
  }
  if (keys.has("concept:light")) targets.push({ axis: "lightDevastating", value: -0.85 });
  if (keys.has("concept:devastating")) {
    targets.push({ axis: "lightDevastating", value: 0.85 });
  }
  if (keys.has("concept:polished")) targets.push({ axis: "productionPolish", value: 0.9 });
  return targets;
}

function parsePrompt(catalog: CatalogItem[], prompt: string): PromptIntent {
  const seeds = detectReferencedTitles(catalog, prompt);
  const features = promptFeatures(prompt, seeds);
  const primary = features.positive.filter((feature) => !VIBE_FEATURE_KEYS.has(feature.key));
  const modifiers = features.positive.filter((feature) => VIBE_FEATURE_KEYS.has(feature.key));
  return {
    ...features,
    primary,
    modifiers,
    format: formatFromPrompt(prompt),
    seeds,
    vibeTargets: vibeTargets(features.positive),
  };
}

function featureMatchesField(feature: PromptFeature, field: TextField): boolean {
  return feature.terms.some((term) => {
    const normalizedTerm = normalize(term);
    if (normalizedTerm.includes(" ")) return field.normalized.includes(` ${normalizedTerm} `);
    return field.tokens.has(normalizedTerm) || field.tokens.has(stem(normalizedTerm));
  });
}

function matchWeight(feature: PromptFeature, document: CatalogDocument): number {
  if (featureMatchesField(feature, document.overview)) return 1;
  if (featureMatchesField(feature, document.title)) return 0.78;
  if (featureMatchesField(feature, document.genres)) return 0.48;
  return 0;
}

function documentFor(item: CatalogItem): CatalogDocument {
  return {
    item,
    title: textField(`${item.title} ${item.originalTitle}`),
    overview: textField(item.overview),
    genres: textField(item.genreNames.join(" ")),
  };
}

function isReleased(item: CatalogItem, now: number): boolean {
  if (!item.releaseDate) return true;
  const timestamp = Date.parse(`${item.releaseDate}T00:00:00Z`);
  return Number.isNaN(timestamp) || timestamp <= now;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

interface DecodedSemanticVector {
  values: Int8Array;
  length: number;
}

const semanticVectorCache = new Map<string, DecodedSemanticVector | null>();

function decodeSemanticVector(encoded: string | undefined): DecodedSemanticVector | null {
  if (!encoded || !SEMANTIC_VECTOR_PATTERN.test(encoded)) return null;
  const cached = semanticVectorCache.get(encoded);
  if (cached !== undefined) return cached;

  try {
    const binary = atob(encoded);
    if (binary.length !== SEMANTIC_VECTOR_BYTES) return null;
    const unsigned = new Uint8Array(SEMANTIC_VECTOR_BYTES);
    for (let index = 0; index < binary.length; index += 1) {
      unsigned[index] = binary.charCodeAt(index);
    }
    const values = new Int8Array(unsigned.buffer);
    let squaredLength = 0;
    for (const value of values) squaredLength += value * value;
    const decoded = squaredLength > 0 ? { values, length: Math.sqrt(squaredLength) } : null;
    semanticVectorCache.set(encoded, decoded);
    return decoded;
  } catch {
    semanticVectorCache.set(encoded, null);
    return null;
  }
}

function promptSemanticSimilarity(
  item: CatalogItem,
  promptVector: ArrayLike<number> | undefined,
): number | null {
  const itemVector = decodeSemanticVector(item.semanticVector);
  if (!itemVector || !promptVector || promptVector.length !== SEMANTIC_VECTOR_BYTES) return null;
  let promptSquaredLength = 0;
  let dotProduct = 0;
  for (let index = 0; index < SEMANTIC_VECTOR_BYTES; index += 1) {
    const promptValue = Number(promptVector[index]);
    if (!Number.isFinite(promptValue)) return null;
    promptSquaredLength += promptValue * promptValue;
    dotProduct += promptValue * itemVector.values[index];
  }
  if (promptSquaredLength === 0) return null;
  return Math.min(
    Math.max(dotProduct / (Math.sqrt(promptSquaredLength) * itemVector.length), -1),
    1,
  );
}

function vibeMatch(item: CatalogItem, targets: VibeTarget[]): number {
  if (targets.length === 0) return 0;
  const scores = vibeScoresFor(item);
  return targets.reduce((total, target) => {
    const actual = scores[target.axis];
    const maximumDistance = target.axis === "productionPolish" ? 1 : 2;
    return total + clamp(1 - Math.abs(actual - target.value) / maximumDistance);
  }, 0) / targets.length;
}

function formatLabel(format: ContentFormat): string {
  if (format === "miniseries") return "mini series";
  return format;
}

function matchReason(
  keywords: string[],
  seedTitles: string[],
  format: ContentFormat | null,
  semantic: boolean,
): string {
  if (semantic && seedTitles.length === 0) {
    const detail = keywords.length > 0 ? ` Strongest cues: ${keywords.join(" · ")}.` : "";
    return `Whole-prompt match: its synopsis is close to your requested story and mood.${detail}`;
  }
  const parts: string[] = [];
  if (seedTitles.length > 0) parts.push(`story likeness to ${seedTitles.join(" + ")}`);
  if (keywords.length > 0) parts.push(keywords.join(" · "));
  if (format && keywords.length === 0) parts.push(formatLabel(format));
  return `Prompt match: ${parts.join("; ") || "your requested mood"}`;
}

export function recommendFromPrompt(
  catalog: CatalogItem[],
  prompt: string,
  signals: Map<string, TasteSignal["value"]> = new Map(),
  now = Date.now(),
  promptVector?: ArrayLike<number>,
): PromptRecommendationResult {
  const intent = parsePrompt(catalog, prompt);
  const meaningful =
    intent.positive.length > 0 ||
    intent.negative.length > 0 ||
    intent.format !== null ||
    intent.seeds.length > 0;
  if (!meaningful) {
    return {
      matches: [],
      wantedKeywords: [],
      coreIdeas: [],
      moodIdeas: [],
      excludedKeywords: [],
      referencedTitles: [],
      format: null,
      meaningful: false,
      semantic: Boolean(promptVector),
    };
  }

  const seedKeys = new Set(intent.seeds.map((seed) => seed.key));
  const documents = catalog
    .filter((item) => !seedKeys.has(item.key))
    .filter((item) => signals.get(item.key) !== "disliked")
    .filter((item) => isReleased(item, now))
    .filter((item) => intent.format === null || contentFormatFor(item) === intent.format)
    .map(documentFor)
    .filter((document) =>
      !intent.negative.some((feature) => matchWeight(feature, document) > 0),
    );

  const documentFrequency = new Map<string, number>();
  for (const feature of intent.positive) {
    documentFrequency.set(
      feature.key,
      documents.filter((document) => matchWeight(feature, document) > 0).length,
    );
  }
  const idf = new Map(intent.positive.map((feature) => [
    feature.key,
    Math.log((documents.length + 1) / ((documentFrequency.get(feature.key) ?? 0) + 1)) + 1,
  ]));
  const totalKeywordWeight = Math.max(
    intent.positive.reduce((total, feature) => total + (idf.get(feature.key) ?? 1), 0),
    1,
  );

  const seedRanking = intent.seeds.length > 0
    ? rankTasteMatches(catalog, intent.seeds, signals)
    : [];
  const seedRank = new Map(seedRanking.map((item, index) => [item.key, index]));
  const seedTitles = intent.seeds.map((seed) => seed.title);
  const hasNonVibeKeywords = intent.positive.some(
    (feature) => !VIBE_FEATURE_KEYS.has(feature.key),
  );

  const matches = documents
    .map((document): PromptMatch | null => {
      const keywordMatches = intent.positive
        .map((feature) => ({
          feature,
          fieldWeight: matchWeight(feature, document),
          idf: idf.get(feature.key) ?? 1,
        }))
        .filter((entry) => entry.fieldWeight > 0);
      const primaryKeywordMatches = keywordMatches.filter((entry) =>
        intent.primary.some((feature) => feature.key === entry.feature.key),
      );
      const matchedKeywordWeight = keywordMatches.reduce((total, entry) => total + entry.idf, 0);
      const lexicalStrength = keywordMatches.reduce(
        (total, entry) => total + entry.idf * entry.fieldWeight,
        0,
      ) / totalKeywordWeight;
      const coverage = matchedKeywordWeight / totalKeywordWeight;
      const lexicalScore = coverage * 0.68 + lexicalStrength * 0.32;
      const rankedAt = seedRank.get(document.item.key);
      const seedScore = rankedAt === undefined ? 0 : 1 / (1 + rankedAt / 55);
      const localVibeScore = vibeMatch(document.item, intent.vibeTargets);
      const semanticSimilarity = promptSemanticSimilarity(document.item, promptVector);
      const hasSemanticMatch = semanticSimilarity !== null && semanticSimilarity > 0.05;
      const hasRelevantMatch = promptVector
        ? hasSemanticMatch || rankedAt !== undefined
        : primaryKeywordMatches.length > 0 ||
          rankedAt !== undefined ||
          (!hasNonVibeKeywords && intent.vibeTargets.length > 0) ||
          (intent.positive.length === 0 && intent.seeds.length === 0);
      if (!hasRelevantMatch) return null;

      let weightedScore = 0;
      let scoreWeight = 0;
      if (promptVector && semanticSimilarity !== null) {
        const semanticWeight = intent.seeds.length > 0 ? 0.22 : 0.78;
        weightedScore += clamp((semanticSimilarity - 0.05) / 0.75) * semanticWeight;
        scoreWeight += semanticWeight;
        if (intent.positive.length > 0) {
          weightedScore += lexicalScore * 0.08;
          scoreWeight += 0.08;
        }
        if (intent.vibeTargets.length > 0) {
          weightedScore += localVibeScore * 0.1;
          scoreWeight += 0.1;
        }
        if (intent.seeds.length > 0) {
          weightedScore += seedScore * 0.78;
          scoreWeight += 0.78;
        }
      } else {
        if (intent.positive.length > 0) {
          weightedScore += lexicalScore * 0.66;
          scoreWeight += 0.66;
        }
        if (intent.vibeTargets.length > 0) {
          weightedScore += localVibeScore * 0.22;
          scoreWeight += 0.22;
        }
        if (intent.seeds.length > 0) {
          weightedScore += seedScore * 0.68;
          scoreWeight += 0.68;
        }
      }
      if (scoreWeight === 0) {
        weightedScore = 0.6;
        scoreWeight = 1;
      }
      const quality = generalRatingScore(document.item) / 10;
      const popularity = clamp(Math.log10(document.item.popularity + 1) / 3);
      const likedBoost = signals.get(document.item.key) === "liked" ? 0.025 : 0;
      const tieBreakWeight = promptVector ? 0.012 : 0.06;
      const score = weightedScore / scoreWeight +
        quality * tieBreakWeight * 0.75 + popularity * tieBreakWeight * 0.25 + likedBoost;
      const matchedKeywords = keywordMatches
        .sort((left, right) => right.idf * right.fieldWeight - left.idf * left.fieldWeight)
        .slice(0, 3)
        .map((entry) => entry.feature.label);
      return {
        item: document.item,
        score,
        matchedKeywords,
        reason: matchReason(matchedKeywords, seedTitles, intent.format, semanticSimilarity !== null),
        semanticSimilarity,
      };
    })
    .filter((match): match is PromptMatch => match !== null)
    .sort((left, right) =>
      right.score - left.score ||
      (right.semanticSimilarity ?? -1) - (left.semanticSimilarity ?? -1) ||
      right.item.voteCount - left.item.voteCount ||
      left.item.title.localeCompare(right.item.title),
    );

  let relevantMatches = matches;
  if (promptVector && intent.primary.length > 0 && intent.seeds.length === 0) {
    const bestSemanticMatch = matches.reduce(
      (best, match) => Math.max(best, match.semanticSimilarity ?? -1),
      -1,
    );
    if (bestSemanticMatch < MINIMUM_BEST_SEMANTIC_MATCH) {
      relevantMatches = [];
    } else {
      const cutoff = Math.max(
        MINIMUM_SEMANTIC_MATCH,
        bestSemanticMatch - SEMANTIC_RESULT_BAND,
      );
      relevantMatches = matches.filter((match) =>
        (match.semanticSimilarity ?? -1) >= cutoff,
      );
    }
  }

  return {
    matches: relevantMatches.slice(0, 120),
    wantedKeywords: [...intent.primary, ...intent.modifiers].map((feature) => feature.label),
    coreIdeas: intent.primary.map((feature) => feature.label),
    moodIdeas: intent.modifiers.map((feature) => feature.label),
    excludedKeywords: intent.negative.map((feature) => feature.label),
    referencedTitles: seedTitles,
    format: intent.format,
    meaningful: true,
    semantic: Boolean(promptVector),
  };
}
