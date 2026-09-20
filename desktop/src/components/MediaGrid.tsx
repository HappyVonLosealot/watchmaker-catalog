import type { CatalogItem, TasteSignal } from "../types";
import { MediaCard } from "./MediaCard";

interface MediaGridProps {
  items: CatalogItem[];
  onOpen: (item: CatalogItem) => void;
  watchlist: Set<string>;
  onToggleWatchlist: (key: string) => void;
  tasteSignals?: Map<string, TasteSignal["value"]>;
  onTasteSignal?: (key: string, value: TasteSignal["value"] | null) => void;
  reasons?: Map<string, string>;
  limit?: number;
}

export function MediaGrid({
  items,
  onOpen,
  watchlist,
  onToggleWatchlist,
  tasteSignals,
  onTasteSignal,
  reasons,
  limit,
}: MediaGridProps) {
  const visible = typeof limit === "number" ? items.slice(0, limit) : items;
  return (
    <div className="media-grid">
      {visible.map((item) => (
        <MediaCard
          key={item.key}
          item={item}
          onOpen={onOpen}
          inWatchlist={watchlist.has(item.key)}
          onToggleWatchlist={onToggleWatchlist}
          tasteSignal={tasteSignals?.get(item.key)}
          onTasteSignal={onTasteSignal}
          reason={reasons?.get(item.key)}
        />
      ))}
    </div>
  );
}
