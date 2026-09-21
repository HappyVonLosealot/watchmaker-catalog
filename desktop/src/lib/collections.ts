import type { CatalogItem } from "../types";
import { generalRatingScore } from "./filtering";
import { vibeScoresFor } from "./vibes";

export interface SmartCollection {
  id: "comfort" | "bleak" | "full-throttle" | "hidden-gems" | "prestige";
  title: string;
  detail: string;
  items: CatalogItem[];
}

function isReleased(item: CatalogItem, now: number): boolean {
  if (!item.releaseDate) return true;
  const timestamp = Date.parse(`${item.releaseDate}T00:00:00Z`);
  return Number.isNaN(timestamp) || timestamp <= now;
}

function rank(
  items: CatalogItem[],
  score: (item: CatalogItem) => number,
): CatalogItem[] {
  return [...items].sort((left, right) =>
    score(right) - score(left) ||
    right.voteCount - left.voteCount ||
    left.title.localeCompare(right.title),
  );
}

function quality(item: CatalogItem): number {
  return generalRatingScore(item) / 10;
}

export function buildSmartCollections(catalog: CatalogItem[], now = Date.now()): SmartCollection[] {
  const released = catalog.filter((item) => isReleased(item, now));
  const comfort = released.filter((item) => {
    const vibe = vibeScoresFor(item);
    return vibe.cozyStressful <= 0.08 && vibe.lightDevastating <= 0.08;
  });
  const bleak = released.filter((item) => {
    const vibe = vibeScoresFor(item);
    return vibe.funnyGrim >= -0.02 && vibe.lightDevastating >= 0.04;
  });
  const fullThrottle = released.filter((item) => {
    const vibe = vibeScoresFor(item);
    return vibe.slowFast >= 0.04 && vibe.cozyStressful >= -0.04;
  });
  const hiddenGems = released.filter(
    (item) => item.voteCount >= 35 && item.voteCount <= 12_000 && generalRatingScore(item) >= 6.7,
  );
  const prestige = released.filter((item) => vibeScoresFor(item).productionPolish >= 0.58);

  const collections: SmartCollection[] = [
    {
      id: "comfort",
      title: "Comfort Watches",
      detail: "Warm, easy-going stories for a softer night",
      items: rank(comfort, (item) => {
        const vibe = vibeScoresFor(item);
        return -vibe.cozyStressful * 0.34 - vibe.lightDevastating * 0.34 + quality(item) * 0.32;
      }),
    },
    {
      id: "bleak",
      title: "Beautifully Bleak",
      detail: "Dark, serious stories worth the emotional damage",
      items: rank(bleak, (item) => {
        const vibe = vibeScoresFor(item);
        return vibe.funnyGrim * 0.3 + vibe.lightDevastating * 0.3 + quality(item) * 0.4;
      }),
    },
    {
      id: "full-throttle",
      title: "Full-Throttle",
      detail: "Fast, tense picks that keep moving",
      items: rank(fullThrottle, (item) => {
        const vibe = vibeScoresFor(item);
        return vibe.slowFast * 0.4 + vibe.cozyStressful * 0.24 + quality(item) * 0.36;
      }),
    },
    {
      id: "hidden-gems",
      title: "Hidden Gems",
      detail: "Well-rated titles outside the usual popularity loop",
      items: rank(hiddenGems, (item) =>
        quality(item) * 0.8 - Math.min(Math.log10(item.popularity + 1) / 3, 1) * 0.2,
      ),
    },
    {
      id: "prestige",
      title: "Prestige Picks",
      detail: "Polished productions with strong audience confidence",
      items: rank(prestige, (item) =>
        vibeScoresFor(item).productionPolish * 0.55 + quality(item) * 0.45,
      ),
    },
  ];
  return collections.filter((collection) => collection.items.length > 0);
}
