import { useEffect, useMemo, useState } from "react";
import type { CatalogItem, TasteSignal } from "../types";
import { buildSmartCollections } from "../lib/collections";
import { ChevronIcon, FilmIcon } from "./Icons";
import { MediaGrid } from "./MediaGrid";

interface SmartCollectionsProps {
  catalog: CatalogItem[];
  watchlist: Set<string>;
  tasteSignals: Map<string, TasteSignal["value"]>;
  onOpen: (item: CatalogItem) => void;
  onToggleWatchlist: (key: string) => void;
  onTasteSignal: (key: string, value: TasteSignal["value"] | null) => void;
}

export function SmartCollections({
  catalog,
  watchlist,
  tasteSignals,
  onOpen,
  onToggleWatchlist,
  onTasteSignal,
}: SmartCollectionsProps) {
  const collections = useMemo(() => buildSmartCollections(catalog), [catalog]);
  const [selectedId, setSelectedId] = useState<string>(collections[0]?.id ?? "");
  const [expanded, setExpanded] = useState(false);
  const selected = collections.find((collection) => collection.id === selectedId) ?? collections[0];

  useEffect(() => {
    if (!collections.some((collection) => collection.id === selectedId)) {
      setSelectedId(collections[0]?.id ?? "");
    }
  }, [collections, selectedId]);

  useEffect(() => setExpanded(false), [selectedId]);

  if (!selected) return null;

  const reasons = new Map(
    selected.items.slice(0, expanded ? 24 : 6).map((item) => [item.key, `Smart collection: ${selected.title}`]),
  );

  return (
    <section className="smart-collections" aria-labelledby="smart-collections-heading">
      <div className="section-heading smart-collections-heading">
        <div>
          <span className="eyebrow">AUTOMATIC SHELVES</span>
          <h2 id="smart-collections-heading">Smart Collections</h2>
          <p>Fresh groupings rebuilt from your current catalogue every time Watchmaker updates.</p>
        </div>
      </div>

      <div className="collection-tabs" role="tablist" aria-label="Smart Collections">
        {collections.map((collection) => (
          <button
            key={collection.id}
            type="button"
            role="tab"
            aria-selected={collection.id === selected.id}
            className={collection.id === selected.id ? "active" : ""}
            onClick={() => setSelectedId(collection.id)}
          >
            <span className="collection-tab-icon"><FilmIcon /></span>
            <span>
              <strong>{collection.title}</strong>
              <small>{collection.items.length.toLocaleString()} titles</small>
            </span>
          </button>
        ))}
      </div>

      <div className="collection-result-heading">
        <div>
          <h3>{selected.title}</h3>
          <p>{selected.detail}</p>
        </div>
        {selected.items.length > 6 && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Show less" : "See more"} <ChevronIcon />
          </button>
        )}
      </div>
      <MediaGrid
        items={selected.items}
        limit={expanded ? 24 : 6}
        reasons={reasons}
        onOpen={onOpen}
        watchlist={watchlist}
        onToggleWatchlist={onToggleWatchlist}
        tasteSignals={tasteSignals}
        onTasteSignal={onTasteSignal}
      />
    </section>
  );
}
