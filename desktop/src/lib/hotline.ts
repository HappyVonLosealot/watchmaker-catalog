import type { CatalogItem, MediaType } from "../types";

function isReleased(item: CatalogItem, now: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.releaseDate)) return true;
  const releaseTime = Date.parse(`${item.releaseDate}T00:00:00Z`);
  return !Number.isFinite(releaseTime) || releaseTime <= now;
}

export function rankHotlineItems(
  catalog: CatalogItem[],
  providerId: number,
  mediaType: MediaType,
  limit = 20,
  now = Date.now(),
): CatalogItem[] {
  return catalog
    .filter((item) =>
      item.mediaType === mediaType &&
      item.providerLinks.some((link) => link.providerId === providerId) &&
      isReleased(item, now),
    )
    .sort((left, right) => {
      const leftTrending = Number.isSafeInteger(left.trendingRank);
      const rightTrending = Number.isSafeInteger(right.trendingRank);
      if (leftTrending !== rightTrending) return leftTrending ? -1 : 1;
      if (leftTrending && rightTrending && left.trendingRank !== right.trendingRank) {
        return (left.trendingRank ?? 0) - (right.trendingRank ?? 0);
      }
      return (
        right.popularity - left.popularity ||
        right.voteCount - left.voteCount ||
        right.voteAverage - left.voteAverage ||
        left.title.localeCompare(right.title)
      );
    })
    .slice(0, Math.max(0, limit));
}
