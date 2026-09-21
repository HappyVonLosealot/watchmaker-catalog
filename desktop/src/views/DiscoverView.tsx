import { useEffect, useMemo, useState } from "react";
import type { CatalogItem, GenreOption, MediaType, Provider, TasteSignal } from "../types";
import { filterCatalog, sortCatalog, type CatalogFilters } from "../lib/filtering";
import { openProvider } from "../lib/providerLinks";
import { BookmarkIcon, ChevronIcon, ExternalIcon } from "../components/Icons";
import { SearchToolbar } from "../components/SearchToolbar";
import { MediaGrid } from "../components/MediaGrid";
import { EmptyState } from "../components/EmptyState";
import { Artwork } from "../components/Artwork";
import { VibeSelector } from "../components/VibeSelector";
import { SmartCollections } from "../components/SmartCollections";

interface DiscoverViewProps {
  catalog: CatalogItem[];
  providers: Provider[];
  watchlist: Set<string>;
  tasteSignals: Map<string, TasteSignal["value"]>;
  configured: boolean;
  onSettings: () => void;
  onOpen: (item: CatalogItem) => void;
  onToggleWatchlist: (key: string) => void;
  onTasteSignal: (key: string, value: TasteSignal["value"] | null) => void;
}

const DEFAULT_FILTERS: CatalogFilters = {
  query: "",
  searchMode: "name",
  selectedGenreIds: [],
  mediaType: "all",
  providerId: "all",
  sortBy: "popularity",
};
const RESULT_BATCH_SIZE = 60;

function catalogGenres(items: CatalogItem[]): GenreOption[] {
  const genres = new Map<number, string>();
  for (const item of items) {
    item.genreIds.forEach((id, index) => {
      const name = item.genreNames[index];
      if (name && !genres.has(id)) genres.set(id, name);
    });
  }
  return [...genres].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function DiscoverView({
  catalog,
  providers,
  watchlist,
  tasteSignals,
  configured,
  onSettings,
  onOpen,
  onToggleWatchlist,
  onTasteSignal,
}: DiscoverViewProps) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [resultLimit, setResultLimit] = useState(RESULT_BATCH_SIZE);
  const sorted = useMemo(
    () => sortCatalog(catalog, filters.sortBy),
    [catalog, filters.sortBy],
  );
  const filtered = useMemo(() => filterCatalog(sorted, filters), [sorted, filters]);
  const genres = useMemo(() => catalogGenres(catalog), [catalog]);
  const hero = sorted.find((item) => item.backdropPath) ?? sorted[0];
  const hasActiveFilters =
    filters.query.trim() !== "" ||
    filters.selectedGenreIds.length > 0 ||
    filters.mediaType !== "all" ||
    filters.providerId !== "all" ||
    filters.sortBy !== "popularity";

  useEffect(() => setResultLimit(RESULT_BATCH_SIZE), [filters]);

  if (catalog.length === 0) {
    return <EmptyState configured={configured} onSettings={onSettings} />;
  }

  const sections: Array<{
    title: string;
    detail: string;
    items: CatalogItem[];
    mediaType?: MediaType;
    genreId?: number;
  }> = [
    { title: "Films for tonight", detail: "Included films across your subscriptions", mediaType: "movie" as const, items: sorted.filter((item) => item.mediaType === "movie") },
    { title: "Series worth starting", detail: "No rental detours, just press play", mediaType: "tv" as const, items: sorted.filter((item) => item.mediaType === "tv") },
    { title: "Animation", detail: "Animated films and series in one shelf", genreId: 16, items: sorted.filter((item) => item.genreIds.includes(16)) },
    { title: "Documentaries", detail: "Stories drawn from the real world", genreId: 99, items: sorted.filter((item) => item.genreIds.includes(99)) },
  ].filter((section) => section.items.length > 0);

  return (
    <div className="view discover-view">
      <header className="view-header">
        <div>
          <span className="eyebrow">YOUR STREAMING UNIVERSE</span>
          <h1>What are we watching?</h1>
        </div>
        <span className="title-count">{catalog.length.toLocaleString()} included titles</span>
      </header>

      <SearchToolbar filters={filters} onChange={setFilters} providers={providers} genres={genres} />

      {hasActiveFilters ? (
        <section className="results-section">
          <div className="section-heading">
            <div>
              <h2>{filtered.length.toLocaleString()} matches</h2>
              <p>{filters.searchMode === "tags" && filters.selectedGenreIds.length > 1
                ? "Every selected tag is required. Only included subscription offers are shown."
                : "Only included subscription offers are shown."}</p>
            </div>
            <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear all</button>
          </div>
          {filtered.length ? (
            <>
              <MediaGrid
                items={filtered}
                limit={resultLimit}
                onOpen={onOpen}
                watchlist={watchlist}
                onToggleWatchlist={onToggleWatchlist}
                tasteSignals={tasteSignals}
                onTasteSignal={onTasteSignal}
              />
              {filtered.length > resultLimit && (
                <div className="load-more-row">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setResultLimit((current) => current + RESULT_BATCH_SIZE)}
                  >
                    Show {Math.min(RESULT_BATCH_SIZE, filtered.length - resultLimit)} more
                  </button>
                  <span>{resultLimit.toLocaleString()} of {filtered.length.toLocaleString()} shown</span>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              configured
              onSettings={onSettings}
              title="No included matches"
              detail="Try another title, genre, or subscription filter. Rentals stay excluded."
            />
          )}
        </section>
      ) : (
        <>
          {hero && (
            <section className="hero-card">
              <Artwork item={hero} variant="backdrop" className="hero-image" decorative loading="eager" />
              <div className="hero-overlay" />
              <div className="hero-content">
                <span className="hero-provider">ON {hero.providerLinks[0]?.providerName.toLocaleUpperCase()}</span>
                <h2>{hero.title}</h2>
                <p>{hero.overview || "A popular title currently included with one of your services."}</p>
                <div className="hero-genres">{hero.genreNames.slice(0, 3).map((genre) => <span key={genre}>{genre}</span>)}</div>
                <div className="hero-actions">
                  {hero.providerLinks[0] && (
                    <button className="primary-button" type="button" onClick={() => void openProvider(hero, hero.providerLinks[0])}>
                      Find on {hero.providerLinks[0].providerName}<ExternalIcon />
                    </button>
                  )}
                  <button className="glass-button" type="button" onClick={() => onToggleWatchlist(hero.key)}>
                    <BookmarkIcon fill={watchlist.has(hero.key) ? "currentColor" : "none"} />
                    {watchlist.has(hero.key) ? "Saved" : "Watchlist"}
                  </button>
                </div>
              </div>
            </section>
          )}

          <VibeSelector
            catalog={catalog}
            watchlist={watchlist}
            tasteSignals={tasteSignals}
            onOpen={onOpen}
            onToggleWatchlist={onToggleWatchlist}
            onTasteSignal={onTasteSignal}
          />

          <SmartCollections
            catalog={catalog}
            watchlist={watchlist}
            tasteSignals={tasteSignals}
            onOpen={onOpen}
            onToggleWatchlist={onToggleWatchlist}
            onTasteSignal={onTasteSignal}
          />

          {sections.map((section) => (
            <section className="shelf-section" key={section.title}>
              <div className="section-heading">
                <div><h2>{section.title}</h2><p>{section.detail}</p></div>
                <button type="button" onClick={() => setFilters({
                  ...DEFAULT_FILTERS,
                  searchMode: section.genreId ? "tags" : "name",
                  mediaType: section.mediaType ?? "all",
                  selectedGenreIds: section.genreId ? [section.genreId] : [],
                })}>
                  See all <ChevronIcon />
                </button>
              </div>
              <MediaGrid
                items={section.items}
                limit={6}
                onOpen={onOpen}
                watchlist={watchlist}
                onToggleWatchlist={onToggleWatchlist}
                tasteSignals={tasteSignals}
                onTasteSignal={onTasteSignal}
              />
            </section>
          ))}
        </>
      )}
    </div>
  );
}
