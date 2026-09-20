import type { CatalogItem, TasteSignal } from "../types";

const SEMANTIC_DESCRIPTION_WEIGHT = 0.84;
const LEXICAL_DESCRIPTION_WEIGHT = 0.78;
const GENRE_WEIGHT = 0.08;
const DESCRIPTION_SCALE = 2.4;
const MINIMUM_RECOMMENDATION_SCORE = 0.12;
const SEMANTIC_VECTOR_BYTES = 384;
const SEMANTIC_VECTOR_PATTERN = /^[A-Za-z0-9+/]{512}$/;

// These are removed before comparing synopses so connective language does not
// outweigh the actual people, places, events, and ideas in a story.
const STOP_WORDS = new Set(
  [
    "about", "after", "again", "against", "all", "also", "among", "and", "another", "any",
    "are", "around", "back", "because", "been", "before", "being", "between", "both", "but",
    "can", "could", "does", "during", "each", "even", "every", "find", "finds", "for", "from",
    "gets", "has", "have", "having", "her", "here", "hers", "him", "his", "how", "into", "its",
    "just", "life", "like", "may", "more", "most", "must", "new", "not", "now", "off", "one",
    "only", "other", "our", "out", "over", "own", "she", "some", "such", "than", "that", "the",
    "their", "them", "then", "there", "these", "they", "this", "those", "through", "too", "under",
    "until", "very", "was", "way", "were", "what", "when", "where", "which", "while", "who", "whose",
    "will", "with", "without", "would", "you", "young",
    // Common Turkish connective words. Keeping them out makes Turkish synopsis
    // matching useful without sending text to a translation or AI service.
    "ama", "ancak", "artık", "bazi", "bazen", "ben", "beri", "bile", "bir", "biz", "bu", "bunu",
    "butun", "cok", "daha", "de", "degil", "diye", "en", "gibi", "hem", "her", "icin", "ile", "ise",
    "kadar", "karsi", "kendi", "ki", "mi", "mu", "nasil", "ne", "neden", "olan", "olarak", "oldugu",
    "olur", "onlar", "sonra", "su", "tum", "uzere", "var", "ve", "veya", "ya", "yeni",
  ],
);

// A small, transparent synonym layer helps related synopsis wording meet in
// the same concept without a cloud model. Most matching still comes directly
// from the full description text.
const CONCEPT_ALIASES = new Map<string, string>([
  ["alien", "aliens"], ["extraterrestrial", "aliens"],
  ["android", "artificial-intelligence"], ["robot", "artificial-intelligence"],
  ["burial", "funeral"], ["coffin", "funeral"], ["funeral", "funeral"], ["mourning", "funeral"],
  ["bride", "wedding"], ["groom", "wedding"], ["marriage", "wedding"], ["married", "wedding"],
  ["nuptial", "wedding"], ["wedding", "wedding"],
  ["detective", "investigation"], ["investigator", "investigation"], ["mystery", "investigation"],
  ["ghost", "haunting"], ["haunted", "haunting"], ["spirit", "haunting"],
  ["heist", "robbery"], ["robbery", "robbery"],
  ["homicide", "murder"], ["murder", "murder"],
  ["magic", "magic"], ["sorcery", "magic"], ["witch", "magic"], ["wizard", "magic"],
  ["revenge", "revenge"], ["vengeance", "revenge"],
  ["spaceship", "space"], ["spacecraft", "space"],
  ["survivor", "survival"], ["survival", "survival"],
  ["undead", "zombie-undead"], ["walker", "zombie-undead"], ["zombie", "zombie-undead"],
]);

const CONCEPT_LABELS = new Map<string, string>([
  ["aliens", "aliens"],
  ["artificial-intelligence", "artificial intelligence"],
  ["funeral", "funerals and mourning"],
  ["haunting", "hauntings"],
  ["investigation", "investigation"],
  ["magic", "magic"],
  ["murder", "murder"],
  ["revenge", "revenge"],
  ["robbery", "robbery and heists"],
  ["space", "space travel"],
  ["survival", "survival"],
  ["wedding", "weddings and marriage"],
  ["zombie-undead", "zombies and the undead"],
]);

interface ExtractedDescription {
  features: Map<string, number>;
  labels: Map<string, string>;
}

interface DescriptionContext {
  vectors: Map<string, Map<string, number>>;
  labels: Map<string, Map<string, string>>;
}

interface DecodedSemanticVector {
  values: Int8Array;
  length: number;
}

interface DescriptionMatch {
  affinity: number;
  semantic: boolean;
}

interface PreferenceContext {
  liked: CatalogItem[];
  disliked: CatalogItem[];
}

const semanticVectorCache = new Map<string, DecodedSemanticVector | null>();

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase();
}

function stemWord(word: string): string {
  if (word.length > 6 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 6 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 5 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 5 && (word.endsWith("lar") || word.endsWith("ler"))) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function descriptionTokens(value: string): Array<{ label: string; term: string }> {
  const words = normalizeText(value).match(/[\p{L}\p{N}]+/gu) ?? [];
  return words
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word))
    .map((word) => ({ label: word, term: stemWord(word) }))
    .filter(({ term }) => term.length >= 3 && !STOP_WORDS.has(term));
}

function addFeature(
  features: Map<string, number>,
  labels: Map<string, string>,
  feature: string,
  label: string,
): void {
  features.set(feature, (features.get(feature) ?? 0) + 1);
  if (!labels.has(feature)) labels.set(feature, label);
}

function extractDescription(value: string): ExtractedDescription {
  const features = new Map<string, number>();
  const labels = new Map<string, string>();
  const tokens = descriptionTokens(value);

  tokens.forEach(({ label, term }, index) => {
    addFeature(features, labels, `term:${term}`, label);

    const concept = CONCEPT_ALIASES.get(term) ?? CONCEPT_ALIASES.get(label);
    if (concept) {
      addFeature(
        features,
        labels,
        `concept:${concept}`,
        CONCEPT_LABELS.get(concept) ?? concept.split("-").join(" "),
      );
    }

    const next = tokens[index + 1];
    if (next) {
      const phrase = `${term}:${next.term}`;
      addFeature(features, labels, `phrase:${phrase}`, `${label} ${next.label}`);
    }
  });

  return { features, labels };
}

function featureBoost(feature: string): number {
  if (feature.startsWith("concept:")) return 1.5;
  if (feature.startsWith("phrase:")) return 1.3;
  return 1;
}

function buildDescriptionContext(items: CatalogItem[]): DescriptionContext {
  const documents = new Map<string, ExtractedDescription>();
  const documentFrequency = new Map<string, number>();

  for (const item of items) {
    if (documents.has(item.key)) continue;
    const document = extractDescription(item.overview);
    documents.set(item.key, document);
    for (const feature of document.features.keys()) {
      documentFrequency.set(feature, (documentFrequency.get(feature) ?? 0) + 1);
    }
  }

  const documentCount = Math.max(documents.size, 1);
  const vectors = new Map<string, Map<string, number>>();
  const labels = new Map<string, Map<string, string>>();

  for (const [key, document] of documents) {
    const weighted = new Map<string, number>();
    let squaredLength = 0;

    for (const [feature, count] of document.features) {
      const frequency = documentFrequency.get(feature) ?? 1;
      const inverseFrequency = Math.log((documentCount + 1) / (frequency + 1)) + 1;
      const value = (1 + Math.log(count)) * inverseFrequency * featureBoost(feature);
      weighted.set(feature, value);
      squaredLength += value * value;
    }

    const length = Math.sqrt(squaredLength);
    if (length > 0) {
      for (const [feature, value] of weighted) weighted.set(feature, value / length);
    }
    vectors.set(key, weighted);
    labels.set(key, document.labels);
  }

  return { vectors, labels };
}

function cosineSimilarity(
  left: Map<string, number> | undefined,
  right: Map<string, number> | undefined,
): number {
  if (!left || !right || left.size === 0 || right.size === 0) return 0;
  const [shorter, longer] = left.size <= right.size ? [left, right] : [right, left];
  let score = 0;
  for (const [feature, value] of shorter) {
    score += value * (longer.get(feature) ?? 0);
  }
  return Math.min(Math.max(score, 0), 1);
}

function descriptionSimilarity(
  left: CatalogItem,
  right: CatalogItem,
  context: DescriptionContext,
): number {
  return cosineSimilarity(context.vectors.get(left.key), context.vectors.get(right.key));
}

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

function semanticSimilarity(left: CatalogItem, right: CatalogItem): number | null {
  const leftVector = decodeSemanticVector(left.semanticVector);
  const rightVector = decodeSemanticVector(right.semanticVector);
  if (!leftVector || !rightVector) return null;

  let dotProduct = 0;
  for (let index = 0; index < SEMANTIC_VECTOR_BYTES; index += 1) {
    dotProduct += leftVector.values[index] * rightVector.values[index];
  }
  return Math.min(Math.max(dotProduct / (leftVector.length * rightVector.length), -1), 1);
}

function descriptionMatch(
  left: CatalogItem,
  right: CatalogItem,
  context: DescriptionContext,
): DescriptionMatch {
  const semantic = semanticSimilarity(left, right);
  if (semantic !== null) return { affinity: Math.max(semantic, 0), semantic: true };
  const lexical = descriptionSimilarity(left, right, context);
  return { affinity: Math.min(lexical * DESCRIPTION_SCALE, 1), semantic: false };
}

function jaccard<T>(left: Set<T>, right: Set<T>): number {
  if (left.size === 0 && right.size === 0) return 0;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

function genreConcepts(item: CatalogItem): Set<string> {
  const concepts = new Set<string>();
  for (const genre of item.genreNames) {
    const normalized = normalizeText(genre).replace(/[^a-z0-9]+/g, " ").trim();
    if (!normalized) continue;
    if (normalized.includes("action")) concepts.add("action");
    if (normalized.includes("adventure")) concepts.add("adventure");
    if (normalized.includes("sci fi") || normalized.includes("science fiction")) {
      concepts.add("science-fiction");
    }
    if (normalized.includes("fantasy")) concepts.add("fantasy");
    if (normalized.includes("animation")) concepts.add("animation");
    if (normalized.includes("documentary")) concepts.add("documentary");
    if (normalized.includes("family")) concepts.add("family");
    if (normalized.includes("kids")) {
      concepts.add("kids");
      concepts.add("family");
    }
    if (normalized.includes("music")) concepts.add("music");
    if (normalized.includes("comedy")) concepts.add("comedy");
    if (normalized.includes("reality")) concepts.add("reality");
    if (normalized.includes("talk")) concepts.add("talk");
    concepts.add(normalized);
  }
  return concepts;
}

const TITLE_STOP_WORDS = new Set([
  "a", "an", "and", "of", "season", "series", "the", "tv", "with",
]);

function titleTokens(item: CatalogItem): string[] {
  return (normalizeText(item.title).match(/[a-z0-9]+/g) ?? [])
    .filter((token) => token.length > 2 && !TITLE_STOP_WORDS.has(token));
}

function franchiseRelated(left: CatalogItem, right: CatalogItem): boolean {
  const leftTitle = normalizeText(left.title).replace(/[^a-z0-9]+/g, " ").trim();
  const rightTitle = normalizeText(right.title).replace(/[^a-z0-9]+/g, " ").trim();
  if (leftTitle === rightTitle) return true;
  const leftTokens = titleTokens(left);
  const rightTokenSet = new Set(titleTokens(right));
  return leftTokens.length >= 2 && leftTokens.every((token) => rightTokenSet.has(token));
}

function hasAny(concepts: Set<string>, values: string[]): boolean {
  return values.some((value) => concepts.has(value));
}

function formatMismatchPenalty(seed: CatalogItem, candidate: CatalogItem): number {
  const seedGenres = genreConcepts(seed);
  const candidateGenres = genreConcepts(candidate);
  const franchise = franchiseRelated(seed, candidate) || franchiseRelated(candidate, seed);
  let penalty = 0;

  const seedDocumentary = hasAny(seedGenres, ["documentary", "reality", "talk"]);
  const candidateDocumentary = hasAny(candidateGenres, ["documentary", "reality", "talk"]);
  if (seedDocumentary !== candidateDocumentary) penalty += 0.34;
  if (!franchise && seedGenres.has("animation") !== candidateGenres.has("animation")) penalty += 0.18;
  if (!franchise && seedGenres.has("family") !== candidateGenres.has("family")) penalty += 0.14;
  if (!franchise && seedGenres.has("music") !== candidateGenres.has("music")) penalty += 0.06;
  if (!franchise && seedGenres.has("comedy") !== candidateGenres.has("comedy")) penalty += 0.06;
  return penalty;
}

function releaseYear(item: CatalogItem): number | null {
  const year = Number.parseInt(item.releaseDate.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

export function tasteScore(
  candidate: CatalogItem,
  seeds: CatalogItem[],
  signals: Map<string, TasteSignal["value"]> = new Map(),
  suppliedDescriptionContext?: DescriptionContext,
  preferences: PreferenceContext = { liked: [], disliked: [] },
): number {
  if (seeds.some((seed) => seed.key === candidate.key)) return Number.NEGATIVE_INFINITY;
  if (signals.get(candidate.key) === "disliked") return Number.NEGATIVE_INFINITY;

  const descriptionContext = suppliedDescriptionContext
    ?? buildDescriptionContext([candidate, ...seeds]);

  const seedScores = seeds.map((seed) => {
    const match = descriptionMatch(candidate, seed, descriptionContext);
    const descriptionWeight = match.semantic
      ? SEMANTIC_DESCRIPTION_WEIGHT
      : LEXICAL_DESCRIPTION_WEIGHT;
    const genreSimilarity = jaccard(genreConcepts(seed), genreConcepts(candidate));
    const mediaAffinity = seed.mediaType === candidate.mediaType ? 0.025 : 0;
    const seedYear = releaseYear(seed);
    const candidateYear = releaseYear(candidate);
    const yearAffinity =
      seedYear && candidateYear
        ? Math.max(0, 1 - Math.abs(seedYear - candidateYear) / 35) * 0.02
        : 0;

    return (
      match.affinity * descriptionWeight
      + genreSimilarity * GENRE_WEIGHT
      + mediaAffinity
      + yearAffinity
      - formatMismatchPenalty(seed, candidate)
    );
  });

  const closestSeed = Math.max(...seedScores, 0);
  const ratingConfidence = Math.min(candidate.voteCount / 1500, 1);
  const quality = (candidate.voteAverage / 10) * ratingConfidence * 0.035;
  const popularity = Math.min(Math.log10(candidate.popularity + 1) / 4, 1) * 0.005;
  const likedBoost = signals.get(candidate.key) === "liked" ? 0.04 : 0;
  const likedNeighbour = Math.max(
    ...preferences.liked.map((item) => descriptionMatch(candidate, item, descriptionContext).affinity),
    0,
  );
  const dislikedNeighbour = Math.max(
    ...preferences.disliked.map((item) => descriptionMatch(candidate, item, descriptionContext).affinity),
    0,
  );
  const learnedPreference = likedNeighbour * 0.12 - Math.max(dislikedNeighbour - 0.3, 0) * 0.24;
  return closestSeed + quality + popularity + likedBoost + learnedPreference;
}

export function rankTasteMatches(
  catalog: CatalogItem[],
  seeds: CatalogItem[],
  signals: Map<string, TasteSignal["value"]> = new Map(),
): CatalogItem[] {
  if (seeds.length === 0) return [];
  const needsLexicalFallback = [...catalog, ...seeds].some(
    (item) => decodeSemanticVector(item.semanticVector) === null,
  );
  const descriptionContext = needsLexicalFallback
    ? buildDescriptionContext([...catalog, ...seeds])
    : { vectors: new Map(), labels: new Map() };
  const seedKeys = new Set(seeds.map((seed) => seed.key));
  const preferences: PreferenceContext = {
    liked: catalog.filter(
      (item) => signals.get(item.key) === "liked" && !seedKeys.has(item.key),
    ),
    disliked: catalog.filter((item) => signals.get(item.key) === "disliked"),
  };
  return [...catalog]
    .map((item) => ({
      item,
      score: tasteScore(item, seeds, signals, descriptionContext, preferences),
    }))
    .filter(({ score }) => Number.isFinite(score) && score > MINIMUM_RECOMMENDATION_SCORE)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

function sharedDescriptionIdeas(
  candidate: CatalogItem,
  seed: CatalogItem,
  context: DescriptionContext,
): string[] {
  const candidateVector = context.vectors.get(candidate.key) ?? new Map<string, number>();
  const seedVector = context.vectors.get(seed.key) ?? new Map<string, number>();
  const candidateLabels = context.labels.get(candidate.key) ?? new Map<string, string>();
  const sharedConcepts = new Set<string>();

  const matches = [...candidateVector]
    .filter(([feature]) => seedVector.has(feature) && !feature.startsWith("phrase:"))
    .map(([feature, value]) => {
      const featureParts = feature.split(":");
      return {
        concept: feature.startsWith("concept:") ? feature.slice("concept:".length) : null,
        feature,
        label: candidateLabels.get(feature) ?? featureParts[featureParts.length - 1] ?? feature,
        score: value * (seedVector.get(feature) ?? 0) * featureBoost(feature),
      };
    })
    .sort((left, right) => {
      const conceptPriority = Number(Boolean(right.concept)) - Number(Boolean(left.concept));
      return conceptPriority || right.score - left.score;
    });

  const ideas: string[] = [];
  for (const match of matches) {
    if (match.concept) {
      if (sharedConcepts.has(match.concept)) continue;
      sharedConcepts.add(match.concept);
    } else {
      const concept = CONCEPT_ALIASES.get(match.label) ?? CONCEPT_ALIASES.get(stemWord(match.label));
      if (concept && sharedConcepts.has(concept)) continue;
    }
    if (!ideas.includes(match.label)) ideas.push(match.label);
    if (ideas.length === 2) break;
  }
  return ideas;
}

function joinIdeas(ideas: string[]): string {
  if (ideas.length < 2) return ideas[0] ?? "similar story themes";
  return `${ideas[0]} and ${ideas[1]}`;
}

export function recommendationReason(candidate: CatalogItem, seeds: CatalogItem[]): string {
  const seedNames = seeds.slice(0, 2).map((seed) => seed.title).join(" + ");
  if (seeds.length === 0) return "Selected for your local taste profile.";

  const semanticSeed = [...seeds]
    .map((seed) => ({ seed, similarity: semanticSimilarity(candidate, seed) }))
    .filter((entry): entry is { seed: CatalogItem; similarity: number } => entry.similarity !== null)
    .sort((left, right) => right.similarity - left.similarity)[0];
  if (semanticSeed) {
    return `Its full synopsis is closest in overall story, setting and tone to ${semanticSeed.seed.title}.`;
  }

  const descriptionContext = buildDescriptionContext([candidate, ...seeds]);
  const closestSeed = [...seeds]
    .map((seed) => ({ seed, similarity: descriptionSimilarity(candidate, seed, descriptionContext) }))
    .sort((left, right) => right.similarity - left.similarity)[0];

  if (closestSeed && closestSeed.similarity > 0) {
    const ideas = sharedDescriptionIdeas(candidate, closestSeed.seed, descriptionContext);
    if (ideas.length > 0) {
      return `Its description shares ${joinIdeas(ideas)} with ${closestSeed.seed.title}.`;
    }
    return `Its description is closest to the story and themes of ${closestSeed.seed.title}.`;
  }

  const seedGenres = new Set(seeds.flatMap((seed) => seed.genreNames));
  const sharedGenres = candidate.genreNames.filter((genre) => seedGenres.has(genre)).slice(0, 2);
  if (sharedGenres.length > 0) {
    return `Synopsis data is limited; ${sharedGenres.join(" and ")} lightly connects it to ${seedNames}.`;
  }
  return `A nearby pick for the taste profile created by ${seedNames}.`;
}
