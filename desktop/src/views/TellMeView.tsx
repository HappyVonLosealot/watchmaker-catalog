import type { CatalogItem, TasteSignal } from "../types";
import { EmptyState } from "../components/EmptyState";
import { MessageIcon } from "../components/Icons";
import { TellMeWhatYouWant } from "../components/TellMeWhatYouWant";

interface TellMeViewProps {
  catalog: CatalogItem[];
  watchlist: Set<string>;
  tasteSignals: Map<string, TasteSignal["value"]>;
  onOpen: (item: CatalogItem) => void;
  onToggleWatchlist: (key: string) => void;
  onTasteSignal: (key: string, value: TasteSignal["value"] | null) => void;
  onSettings: () => void;
}

export function TellMeView({
  catalog,
  watchlist,
  tasteSignals,
  onOpen,
  onToggleWatchlist,
  onTasteSignal,
  onSettings,
}: TellMeViewProps) {
  if (catalog.length === 0) {
    return <EmptyState configured onSettings={onSettings} />;
  }

  return (
    <div className="view prompt-view">
      <header className="view-header">
        <div>
          <span className="eyebrow">SAY IT YOUR WAY</span>
          <h1>Tell Me Whatcu&apos; Want</h1>
          <p className="header-copy">Describe whatever you feel like watching in plain language. Watchmaker compares your ideas with full title descriptions and recommends only included content.</p>
        </div>
        <div className="zero-cost-badge"><MessageIcon /><span><strong>Free &amp; private</strong><small>No prompt is sent anywhere</small></span></div>
      </header>

      <TellMeWhatYouWant
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
