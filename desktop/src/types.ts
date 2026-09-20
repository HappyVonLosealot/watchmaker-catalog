export type MediaType = "movie" | "tv";
export type AppView = "discover" | "tastemaker" | "watchlist" | "additions" | "settings";
export type SearchMode = "name" | "tags" | "concept";
export type CatalogSort = "popularity" | "rating" | "release-newest" | "release-oldest";

export interface Provider {
  id: number;
  name: string;
  logoPath: string | null;
  kind?: "watch" | "dropout";
}

export interface ProviderLink {
  providerId: number;
  providerName: string;
  url?: string;
}

export interface CustomSite {
  id: string;
  name: string;
  homeUrl: string;
  searchUrlTemplate: string;
}

export interface GenreOption {
  id: number;
  name: string;
}

export interface CatalogItem {
  key: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  originalTitle: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string;
  genreIds: number[];
  genreNames: string[];
  voteAverage: number;
  voteCount: number;
  popularity: number;
  semanticVector?: string;
  providerLinks: ProviderLink[];
  syncedAt: number;
}

export interface AppSettings {
  region: string;
  language: string;
  selectedProviders: Provider[];
  customSites: CustomSite[];
}

export interface SyncProgress {
  state: "idle" | "syncing" | "complete" | "error" | "cancelled";
  label: string;
  completed: number;
  total: number;
  lastSuccessfulSync: number | null;
  error?: string;
}

export interface TasteSignal {
  key: string;
  value: "liked" | "disliked";
}

export interface ProviderSlice {
  provider: Provider;
  mediaType: MediaType;
  items: CatalogItem[];
}
