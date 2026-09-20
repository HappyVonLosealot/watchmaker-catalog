import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import type {
  AppSettings,
  AppView,
  CatalogItem,
  CustomSite,
  HotlineFeed,
  SyncProgress,
  TasteSignal,
} from "./types";
import { clearCatalog, getCatalog, getMeta, retainCatalogProviders } from "./lib/catalogDb";
import {
  loadSettings,
  loadTasteSignals,
  loadWatchlist,
  saveSettings,
  saveTasteSignals,
  saveWatchlist,
} from "./lib/settings";
import { HOTLINE_META_KEY, LAST_SYNC_META_KEY, syncCatalog } from "./lib/sync";
import { Sidebar } from "./components/Sidebar";
import { DetailModal } from "./components/DetailModal";
import { DiscoverView } from "./views/DiscoverView";
import { TastemakerView } from "./views/TastemakerView";
import { WatchlistView } from "./views/WatchlistView";
import { SettingsView } from "./views/SettingsView";
import { AdditionsView } from "./views/AdditionsView";
import { HotlineView } from "./views/HotlineView";

const INITIAL_SYNC: SyncProgress = {
  state: "idle",
  label: "Ready when you are",
  completed: 0,
  total: 0,
  lastSuccessfulSync: null,
};

function isConfigured(settings: AppSettings): boolean {
  return settings.selectedProviders.length > 0;
}

export default function App() {
  const [settings, setSettingsState] = useState(loadSettings);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [hotline, setHotline] = useState<HotlineFeed | null>(null);
  const [currentView, setCurrentView] = useState<AppView>(() =>
    isConfigured(loadSettings()) ? "discover" : "settings",
  );
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [watchlist, setWatchlist] = useState(loadWatchlist);
  const [tasteSignals, setTasteSignals] = useState(loadTasteSignals);
  const [sync, setSync] = useState<SyncProgress>(INITIAL_SYNC);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const beginSync = useCallback((nextSettings: AppSettings) => {
    if (!isConfigured(nextSettings)) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    void syncCatalog(
      nextSettings,
      {
        onProgress: (progress) =>
          mountedRef.current &&
          setSync((current) => ({
            ...progress,
            lastSuccessfulSync: progress.lastSuccessfulSync ?? current.lastSuccessfulSync,
          })),
        onCatalogUpdated: (nextCatalog) => mountedRef.current && setCatalog(nextCatalog),
        onHotlineUpdated: (nextHotline) => mountedRef.current && setHotline(nextHotline),
      },
      controller.signal,
    );
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const initialSettings = loadSettings();
    const loadSelectedCatalog = retainCatalogProviders(
      initialSettings.selectedProviders.map((provider) => provider.id),
    ).then(getCatalog);
    void Promise.all([
      loadSelectedCatalog,
      getMeta<number>(LAST_SYNC_META_KEY),
      getMeta<HotlineFeed>(HOTLINE_META_KEY),
    ]).then(
      ([savedCatalog, lastSync, savedHotline]) => {
        if (!mountedRef.current) return;
        setCatalog(savedCatalog);
        setHotline(
          savedHotline?.region === initialSettings.region &&
          savedHotline.language === initialSettings.language
            ? savedHotline
            : null,
        );
        setSync((current) => ({
          ...current,
          label: savedCatalog.length ? "Saved catalogue loaded" : current.label,
          lastSuccessfulSync: lastSync,
        }));
        beginSync(initialSettings);
      },
    );

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [beginSync]);

  const handleSaveSettings = async (nextSettings: AppSettings) => {
    saveSettings(nextSettings);
    setSettingsState(nextSettings);
    await retainCatalogProviders(nextSettings.selectedProviders.map((provider) => provider.id));
    setCatalog(await getCatalog());
    setHotline((current) =>
      current?.region === nextSettings.region && current.language === nextSettings.language
        ? current
        : null,
    );
    setCurrentView("discover");
    beginSync(nextSettings);
  };

  const handleToggleWatchlist = (key: string) => {
    setWatchlist((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveWatchlist(next);
      return next;
    });
  };

  const handleTasteSignal = (key: string, value: TasteSignal["value"] | null) => {
    setTasteSignals((current) => {
      const next = new Map(current);
      if (value) next.set(key, value);
      else next.delete(key);
      saveTasteSignals(next);
      return next;
    });
  };

  const handleClearCatalog = async () => {
    abortRef.current?.abort();
    await clearCatalog();
    setCatalog([]);
    setHotline(null);
    setSync({ ...INITIAL_SYNC, label: "Local catalogue cleared" });
  };

  const handleCustomSitesChange = (customSites: CustomSite[]) => {
    const nextSettings = { ...settings, customSites };
    saveSettings(nextSettings);
    setSettingsState(nextSettings);
  };

  const sharedViewProps = {
    catalog,
    watchlist,
    tasteSignals,
    onOpen: setSelectedItem,
    onToggleWatchlist: handleToggleWatchlist,
    onTasteSignal: handleTasteSignal,
  };

  return (
    <div className="app-shell">
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        sync={sync}
        onSync={() => beginSync(settings)}
        canSync={isConfigured(settings)}
        catalogCount={catalog.length}
      />
      <main className="main-content">
        {currentView === "discover" && (
          <DiscoverView
            {...sharedViewProps}
            providers={settings.selectedProviders}
            configured={isConfigured(settings)}
            onSettings={() => setCurrentView("settings")}
          />
        )}
        {currentView === "hotline" && (
          <HotlineView
            catalog={catalog}
            providers={settings.selectedProviders}
            hotline={hotline}
            onOpen={setSelectedItem}
          />
        )}
        {currentView === "tastemaker" && (
          <TastemakerView {...sharedViewProps} onSettings={() => setCurrentView("settings")} />
        )}
        {currentView === "watchlist" && (
          <WatchlistView {...sharedViewProps} onDiscover={() => setCurrentView("discover")} />
        )}
        {currentView === "additions" && (
          <AdditionsView customSites={settings.customSites} onChange={handleCustomSitesChange} />
        )}
        {currentView === "settings" && (
          <SettingsView
            settings={settings}
            onSave={handleSaveSettings}
            onClearCatalog={handleClearCatalog}
            onboarding={!isConfigured(settings)}
          />
        )}
      </main>

      {selectedItem && (
        <DetailModal
          item={selectedItem}
          customSites={settings.customSites}
          inWatchlist={watchlist.has(selectedItem.key)}
          onToggleWatchlist={handleToggleWatchlist}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}
