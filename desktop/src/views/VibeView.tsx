import type { CatalogItem, TasteSignal } from "../types";
import { EmptyState } from "../components/EmptyState";
import { SlidersIcon } from "../components/Icons";
import { VibeSelector } from "../components/VibeSelector";

interface VibeViewProps {
  catalog: CatalogItem[];
  watchlist: Set<string>;
  tasteSignals: Map<string, TasteSignal["value"]>;
  onOpen: (item: CatalogItem) => void;
  onToggleWatchlist: (key: string) => void;
  onTasteSignal: (key: string, value: TasteSignal["value"] | null) => void;
  onSettings: () => void;
}

export function VibeView({
  catalog,
  watchlist,
  tasteSignals,
  onOpen,
  onToggleWatchlist,
  onTasteSignal,
  onSettings,
}: VibeViewProps) {
  if (catalog.length === 0) {
    return <EmptyState configured onSettings={onSettings} />;
  }

  return (
    <div className="view vibe-view">
      <header className="view-header">
        <div>
          <span className="eyebrow">MOOD-FIRST DISCOVERY</span>
          <h1>What&apos;s The Vibe?</h1>
          <p className="header-copy">Set the mood, pace, format and emotional weight you want tonight. Watchmaker ranks only titles included with your chosen services.</p>
        </div>
        <div className="zero-cost-badge"><SlidersIcon /><span><strong>Private matching</strong><small>Runs entirely on your PC</small></span></div>
      </header>

      <VibeSelector
        catalog={catalog}
        watchlist={watchlist}
        tasteSignals={tasteSignals}
        onOpen={onOpen}
        onToggleWatchlist={onToggleWatchlist}
        onTasteSignal={onTasteSignal}
      />
    </div>
  );
}
