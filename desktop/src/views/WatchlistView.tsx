import type { CatalogItem, TasteSignal } from "../types";
import { BookmarkIcon } from "../components/Icons";
import { MediaGrid } from "../components/MediaGrid";
import { EmptyState } from "../components/EmptyState";

interface WatchlistViewProps {
  catalog: CatalogItem[];
  watchlist: Set<string>;
  tasteSignals: Map<string, TasteSignal["value"]>;
  onOpen: (item: CatalogItem) => void;
  onToggleWatchlist: (key: string) => void;
  onTasteSignal: (key: string, value: TasteSignal["value"] | null) => void;
  onDiscover: () => void;
}

export function WatchlistView({
  catalog,
  watchlist,
  tasteSignals,
  onOpen,
  onToggleWatchlist,
  onTasteSignal,
  onDiscover,
}: WatchlistViewProps) {
  const items = catalog.filter((item) => watchlist.has(item.key));
  return (
    <div className="view watchlist-view">
      <header className="view-header">
        <div><span className="eyebrow">SAVED LOCALLY</span><h1>Your watchlist</h1></div>
        <span className="title-count">{items.length} saved</span>
      </header>
      {items.length > 0 ? (
        <MediaGrid
          items={items}
          onOpen={onOpen}
          watchlist={watchlist}
          onToggleWatchlist={onToggleWatchlist}
          tasteSignals={tasteSignals}
          onTasteSignal={onTasteSignal}
        />
      ) : (
        <EmptyState
          configured
          onSettings={onDiscover}
          title="Nothing saved yet"
          detail="Use the bookmark on any title to build a shortlist for the next movie night."
        />
      )}
      {items.length === 0 && (
        <button className="primary-button empty-followup" type="button" onClick={onDiscover}><BookmarkIcon />Browse titles</button>
      )}
    </div>
  );
}
