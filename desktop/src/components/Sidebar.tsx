import type { AppView, SyncProgress } from "../types";
import { formatSyncTime } from "../lib/format";
import {
  BookmarkIcon,
  CompassIcon,
  FlameIcon,
  GlobeIcon,
  MessageIcon,
  RefreshIcon,
  SettingsIcon,
  ShieldIcon,
  SlidersIcon,
  SparklesIcon,
} from "./Icons";

interface SidebarProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  sync: SyncProgress;
  onSync: () => void;
  canSync: boolean;
  catalogCount: number;
}

const navigation = [
  { id: "discover" as const, label: "Discover", icon: CompassIcon },
  { id: "hotline" as const, label: "Hotline", icon: FlameIcon },
  { id: "vibe" as const, label: "What's The Vibe?", icon: SlidersIcon },
  { id: "prompt" as const, label: "Tell Me Whatcu' Want", icon: MessageIcon },
  { id: "tastemaker" as const, label: "Tastemaker", icon: SparklesIcon },
  { id: "watchlist" as const, label: "Watchlist", icon: BookmarkIcon },
  { id: "additions" as const, label: "Addition", icon: GlobeIcon },
  { id: "settings" as const, label: "Settings", icon: SettingsIcon },
];

export function Sidebar({
  currentView,
  onViewChange,
  sync,
  onSync,
  canSync,
  catalogCount,
}: SidebarProps) {
  const progress = sync.total ? Math.round((sync.completed / sync.total) * 100) : 0;
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true"><span>W</span></div>
        <div>
          <div className="brand-name">Watchmaker</div>
          <div className="brand-tagline">Time well watched.</div>
        </div>
      </div>

      <nav className="nav-list" aria-label="Primary navigation">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item ${currentView === id ? "active" : ""}`}
            onClick={() => onViewChange(id)}
            type="button"
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-spacer" />

      <section className={`sync-card state-${sync.state}`} aria-live="polite">
        <div className="sync-card-topline">
          <span className="eyebrow">LOCAL CATALOGUE</span>
          <span className={`status-dot ${sync.state}`} />
        </div>
        <strong>{catalogCount.toLocaleString()} titles ready</strong>
        <span className="sync-label">{sync.label}</span>
        {sync.state === "syncing" && (
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
        )}
        <span className="sync-time">{formatSyncTime(sync.lastSuccessfulSync)}</span>
        <button
          className="secondary-button full-width"
          type="button"
          disabled={!canSync || sync.state === "syncing"}
          onClick={onSync}
        >
          <RefreshIcon className={sync.state === "syncing" ? "spinning" : ""} />
          {sync.state === "syncing" ? "Updating…" : "Update now"}
        </button>
      </section>

      <div className="privacy-stamp">
        <ShieldIcon />
        <span><strong>Credential-blind</strong><small>External browser only</small></span>
      </div>
    </aside>
  );
}
