import type { CatalogItem, CatalogSort, MediaType, SearchMode } from "../types";

export interface CatalogFilters {
  query: string;
  searchMode: SearchMode;
  selectedGenreIds: number[];
  mediaType: MediaType | "all";
  providerId: number | "all";
  sortBy: CatalogSort;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function conceptTerms(query: string): string[] {
  const terms: string[] = [];
  const pattern = /"([^"]+)"|(\S+)/g;
  for (const match of query.matchAll(pattern)) {
    const term = normalizeSearchText(match[1] || match[2] || "");
    if (term) terms.push(term);
  }
  return terms;
}

export function filterCatalog(items: CatalogItem[], filters: CatalogFilters): CatalogItem[] {
  const query = normalizeSearchText(filters.query);
  const concepts = filters.searchMode === "concept" ? conceptTerms(filters.query) : [];
  return items.filter((item) => {
    if (filters.mediaType !== "all" && item.mediaType !== filters.mediaType) return false;
    if (
      filters.providerId !== "all" &&
      !item.providerLinks.some((link) => link.providerId === filters.providerId)
    ) {
      return false;
    }
    if (!filters.selectedGenreIds.every((genreId) => item.genreIds.includes(genreId))) return false;
    if (!query || filters.searchMode === "tags") return true;

    const searchable = normalizeSearchText(
      filters.searchMode === "concept"
        ? item.overview
        : `${item.title} ${item.originalTitle}`,
    );
    return filters.searchMode === "concept"
      ? concepts.every((term) => searchable.includes(term))
      : searchable.includes(query);
  });
}

export function generalRatingScore(item: CatalogItem): number {
  if (item.voteCount <= 0 || item.voteAverage <= 0) return 0;
  const priorVotes = 100;
  const catalogueMean = 6.5;
  return (
    (item.voteCount / (item.voteCount + priorVotes)) * item.voteAverage +
    (priorVotes / (item.voteCount + priorVotes)) * catalogueMean
  );
}

function releaseTimestamp(item: CatalogItem): number | null {
  if (!item.releaseDate) return null;
  const timestamp = Date.parse(item.releaseDate);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function sortCatalog(items: CatalogItem[], sortBy: CatalogSort): CatalogItem[] {
  return [...items].sort((a, b) => {
    if (sortBy === "rating") {
      return generalRatingScore(b) - generalRatingScore(a) || b.voteCount - a.voteCount;
    }
    if (sortBy === "release-newest" || sortBy === "release-oldest") {
      const aDate = releaseTimestamp(a);
      const bDate = releaseTimestamp(b);
      if (aDate === null && bDate === null) return 0;
      if (aDate === null) return 1;
      if (bDate === null) return -1;
      return sortBy === "release-newest" ? bDate - aDate : aDate - bDate;
    }
    return b.popularity - a.popularity;
  });
}
