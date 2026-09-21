import type { CatalogItem, ContentFormat, TasteSignal, VibeScores } from "../types";
import { generalRatingScore } from "./filtering";

export interface VibePreferences {
  cozyStressful: number | null;
  funnyGrim: number | null;
  slowFast: number | null;
  format: ContentFormat | null;
  lightDevastating: number | null;
  production: number | null;
}

export const DEFAULT_VIBE_PREFERENCES: VibePreferences = {
  cozyStressful: null,
  funnyGrim: null,
  slowFast: null,
  format: null,
  lightDevastating: null,
  production: null,
};

const SIGNED_AXES = [
  "cozyStressful",
  "funnyGrim",
  "slowFast",
  "lightDevastating",
] as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function textIncludesAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function fallbackSignedScore(
  item: CatalogItem,
  lowGenres: number[],
  highGenres: number[],
  lowWords: string[],
  highWords: string[],
): number {
  const text = `${item.title} ${item.overview}`.toLocaleLowerCase();
  let score = 0;
  if (item.genreIds.some((id) => lowGenres.includes(id))) score -= 0.52;
  if (item.genreIds.some((id) => highGenres.includes(id))) score += 0.52;
  if (textIncludesAny(text, lowWords)) score -= 0.36;
  if (textIncludesAny(text, highWords)) score += 0.36;
  return clamp(score, -1, 1);
}

function fallbackProductionPolish(item: CatalogItem): number {
  const rating = clamp(item.voteAverage / 10, 0, 1);
  const confidence = clamp(Math.log10(item.voteCount + 1) / 4, 0, 1);
  const popularity = clamp(Math.log10(item.popularity + 1) / 3, 0, 1);
  const artwork = (item.posterPath ? 0.5 : 0) + (item.backdropPath ? 0.5 : 0);
  return clamp(rating * 0.28 + confidence * 0.3 + popularity * 0.27 + artwork * 0.15, 0, 1);
}

export function vibeScoresFor(item: CatalogItem): VibeScores {
  if (item.vibeScores) return item.vibeScores;
  return {
    cozyStressful: fallbackSignedScore(
      item,
      [35, 10751, 10749],
      [27, 53, 80, 10752],
      ["comfort", "gentle", "home", "friendship", "holiday"],
      ["danger", "escape", "murder", "survive", "threat"],
    ),
    funnyGrim: fallbackSignedScore(
      item,
      [35],
      [27, 80, 10752],
      ["comic", "comedy", "funny", "hilarious", "joke"],
      ["bleak", "brutal", "death", "grim", "murder"],
    ),
    slowFast: fallbackSignedScore(
      item,
      [18, 99, 36],
      [28, 53, 10759],
      ["contemplative", "journey", "quiet", "reflect", "years"],
      ["battle", "chase", "mission", "race", "rescue"],
    ),
    lightDevastating: fallbackSignedScore(
      item,
      [35, 10751, 16],
      [18, 10752, 27],
      ["celebrate", "cheerful", "hope", "joy", "love"],
      ["death", "grief", "loss", "tragedy", "trauma"],
    ),
    productionPolish: fallbackProductionPolish(item),
  };
}

export function contentFormatFor(item: CatalogItem): ContentFormat {
  return item.contentFormat ?? (item.mediaType === "movie" ? "movie" : "series");
}

export function hasVibePreferences(preferences: VibePreferences): boolean {
  return (
    preferences.format !== null ||
    preferences.production !== null ||
    SIGNED_AXES.some((axis) => preferences[axis] !== null)
  );
}

function isReleased(item: CatalogItem, now: number): boolean {
  if (!item.releaseDate) return true;
  const timestamp = Date.parse(`${item.releaseDate}T00:00:00Z`);
  return Number.isNaN(timestamp) || timestamp <= now;
}

function closeness(actual: number, desired: number): number {
  return clamp(1 - Math.abs(actual - desired) / 2, 0, 1);
}

export function rankVibeMatches(
  catalog: CatalogItem[],
  preferences: VibePreferences,
  tasteSignals: Map<string, TasteSignal["value"]> = new Map(),
  now = Date.now(),
): CatalogItem[] {
  const format = preferences.format;
  return catalog
    .filter((item) => tasteSignals.get(item.key) !== "disliked")
    .filter((item) => isReleased(item, now))
    .filter((item) => format === null || contentFormatFor(item) === format)
    .map((item) => {
      const vibes = vibeScoresFor(item);
      let matched = 0;
      let weight = 0;

      for (const axis of SIGNED_AXES) {
        const desired = preferences[axis];
        if (desired === null) continue;
        matched += closeness(vibes[axis], desired);
        weight += 1;
      }

      if (preferences.production !== null) {
        const productionWeight = 1 - clamp(preferences.production, 0, 1);
        matched += vibes.productionPolish * productionWeight;
        weight += productionWeight;
      }

      const vibeMatch = weight > 0 ? matched / weight : 0.64;
      const rating = generalRatingScore(item) / 10;
      const popularity = clamp(Math.log10(item.popularity + 1) / 3, 0, 1);
      const likedBoost = tasteSignals.get(item.key) === "liked" ? 0.035 : 0;
      return {
        item,
        score: vibeMatch * 0.78 + rating * 0.14 + popularity * 0.08 + likedBoost,
      };
    })
    .sort((left, right) =>
      right.score - left.score ||
      right.item.voteCount - left.item.voteCount ||
      left.item.title.localeCompare(right.item.title),
    )
    .map(({ item }) => item);
}

function signedLabel(value: number, low: string, middle: string, high: string): string {
  if (value <= -0.34) return low;
  if (value >= 0.34) return high;
  return middle;
}

export function vibePreferenceSummary(preferences: VibePreferences): string {
  const labels: string[] = [];
  if (preferences.cozyStressful !== null) {
    labels.push(signedLabel(preferences.cozyStressful, "cozy", "balanced", "stressful"));
  }
  if (preferences.funnyGrim !== null) {
    labels.push(signedLabel(preferences.funnyGrim, "funny", "serious", "grim"));
  }
  if (preferences.slowFast !== null) {
    labels.push(signedLabel(preferences.slowFast, "slow-burn", "steady-paced", "fast-paced"));
  }
  if (preferences.format !== null) {
    labels.push(preferences.format === "miniseries" ? "mini series" : preferences.format);
  }
  if (preferences.lightDevastating !== null) {
    labels.push(signedLabel(preferences.lightDevastating, "light-hearted", "bittersweet", "devastating"));
  }
  if (preferences.production !== null && preferences.production < 0.66) {
    labels.push(preferences.production < 0.34 ? "polished production" : "some production polish");
  }
  return labels.join(" · ");
}

export function vibeReason(preferences: VibePreferences): string {
  const summary = vibePreferenceSummary(preferences);
  return summary ? `Vibe match: ${summary}` : "Popular, well-rated pick";
}
