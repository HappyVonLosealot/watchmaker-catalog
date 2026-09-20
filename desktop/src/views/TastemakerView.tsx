import { useMemo, useState } from "react";
import type { CatalogItem, TasteSignal } from "../types";
import { rankTasteMatches, recommendationReason } from "../lib/recommendations";
import { CloseIcon, SearchIcon, SparklesIcon } from "../components/Icons";
import { MediaGrid } from "../components/MediaGrid";
import { EmptyState } from "../components/EmptyState";
import { Artwork } from "../components/Artwork";

interface TastemakerViewProps {
  catalog: CatalogItem[];
  watchlist: Set<string>;
  tasteSignals: Map<string, TasteSignal["value"]>;
  onOpen: (item: CatalogItem) => void;
  onToggleWatchlist: (key: string) => void;
  onTasteSignal: (key: string, value: TasteSignal["value"] | null) => void;
  onSettings: () => void;
}

export function TastemakerView({
  catalog,
  watchlist,
  tasteSignals,
  onOpen,
  onToggleWatchlist,
  onTasteSignal,
  onSettings,
}: TastemakerViewProps) {
  const [query, setQuery] = useState("");
  const [seedKeys, setSeedKeys] = useState<string[]>([]);
  const seeds = useMemo(
    () => seedKeys.map((key) => catalog.find((item) => item.key === key)).filter(Boolean) as CatalogItem[],
    [catalog, seedKeys],
  );
  const searchResults = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (needle.length < 2) return [];
    return catalog
      .filter((item) => !seedKeys.includes(item.key) && item.title.toLocaleLowerCase().includes(needle))
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 8);
  }, [catalog, query, seedKeys]);
  const matches = useMemo(
    () => rankTasteMatches(catalog, seeds, tasteSignals).slice(0, 30),
    [catalog, seeds, tasteSignals],
  );
  const reasons = useMemo(
    () => new Map(matches.map((item) => [item.key, recommendationReason(item, seeds)])),
    [matches, seeds],
  );

  if (catalog.length === 0) {
    return <EmptyState configured onSettings={onSettings} />;
  }

  const addSeed = (item: CatalogItem) => {
    setSeedKeys((current) => [...current.slice(-4), item.key]);
    setQuery("");
  };

  return (
    <div className="view tastemaker-view">
      <header className="view-header">
        <div>
          <span className="eyebrow">LOCAL RECOMMENDATION ENGINE</span>
          <h1>Tastemaker</h1>
          <p className="header-copy">Give it up to five things you love. It reads their descriptions to find similar stories, subjects and moods, then recommends only titles included with your services.</p>
        </div>
        <div className="zero-cost-badge"><SparklesIcon /><span><strong>On-device</strong><small>No paid AI calls</small></span></div>
      </header>

      <section className="taste-builder">
        <div className="taste-search-area">
          <label className="taste-search">
            <SearchIcon />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Type a film, show, animation or documentary you like…"
            />
          </label>
          {searchResults.length > 0 && (
            <div className="taste-search-results">
              {searchResults.map((item) => (
                <button key={item.key} type="button" onClick={() => addSeed(item)}>
                  <Artwork item={item} variant="mini" decorative />
                  <span><strong>{item.title}</strong><small>{item.mediaType === "movie" ? "Film" : "Series"} · {item.genreNames.slice(0, 2).join(", ")}</small></span>
                  <span className="add-seed">+</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="seed-tray">
          <span className="seed-label">YOUR TASTE CLOCKWORK</span>
          {seeds.length === 0 ? (
            <p>Add a title above to start winding the recommendations.</p>
          ) : (
            <div className="seed-list">
              {seeds.map((seed) => (
                <div className="seed-chip" key={seed.key}>
                  <Artwork item={seed} variant="mini" decorative />
                  <span>{seed.title}</span>
                  <button type="button" onClick={() => setSeedKeys((keys) => keys.filter((key) => key !== seed.key))} aria-label={`Remove ${seed.title}`}><CloseIcon /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {seeds.length > 0 && (
        <section className="results-section">
          <div className="section-heading">
            <div><h2>Made for this mood</h2><p>Ranked primarily by description likeness. Genres, format, era, ratings and your feedback only fine-tune the order.</p></div>
          </div>
          <MediaGrid
            items={matches}
            onOpen={onOpen}
            watchlist={watchlist}
            onToggleWatchlist={onToggleWatchlist}
            tasteSignals={tasteSignals}
            onTasteSignal={onTasteSignal}
            reasons={reasons}
          />
        </section>
      )}
    </div>
  );
}
