import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppSettings, Provider } from "../types";
import { fetchProviders, PROVIDER_LOGO_ROOT } from "../lib/catalogFeed";
import {
  CheckIcon,
  DatabaseIcon,
  RefreshIcon,
  SearchIcon,
  ShieldIcon,
} from "../components/Icons";

interface SettingsViewProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onClearCatalog: () => Promise<void>;
  onboarding?: boolean;
}

type FeedStatus = "idle" | "loading" | "ready" | "error";

function ProviderLogo({ provider }: { provider: Provider }) {
  const [failed, setFailed] = useState(false);
  if (!provider.logoPath || failed) {
    return <span className="provider-monogram">{provider.name.slice(0, 1)}</span>;
  }
  return (
    <img
      src={PROVIDER_LOGO_ROOT + provider.logoPath}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function isPriorityProvider(provider: Provider): boolean {
  const name = provider.name.toLocaleLowerCase();
  return (
    name.includes("netflix") ||
    name.includes("amazon prime video") ||
    name === "prime video" ||
    name.startsWith("disney") ||
    name === "max" ||
    name === "hbo max" ||
    name.includes("dropout")
  );
}

export function SettingsView({ settings, onSave, onClearCatalog, onboarding }: SettingsViewProps) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [providers, setProviders] = useState<Provider[]>(settings.selectedProviders);
  const [providerQuery, setProviderQuery] = useState("");
  const [feedStatus, setFeedStatus] = useState<FeedStatus>("idle");
  const [feedMessage, setFeedMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const loadServices = useCallback(async (
    region: string,
    language: string,
    signal?: AbortSignal,
  ) => {
    if (!/^[A-Z]{2}$/.test(region)) {
      setFeedStatus("idle");
      setFeedMessage("Enter a two-letter region to load its services.");
      return;
    }

    setFeedStatus("loading");
    setFeedMessage("Loading services available in " + region + "…");
    try {
      const available = await fetchProviders(region, language, signal);
      const availableIds = new Set(available.map((provider) => provider.id));
      const availableById = new Map(available.map((provider) => [provider.id, provider]));
      setProviders(available);
      setDraft((current) => ({
        ...current,
        selectedProviders: current.selectedProviders
          .filter((provider) => availableIds.has(provider.id))
          .map((provider) => availableById.get(provider.id) ?? provider),
      }));
      setFeedStatus("ready");
      setFeedMessage(
        available.length.toLocaleString() + " services ready for " + region + ".",
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFeedStatus("error");
      setFeedMessage(
        error instanceof Error
          ? error.message
          : "Watchmaker could not reach the catalogue feed.",
      );
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadServices(draft.region, draft.language, controller.signal);
    return () => controller.abort();
  }, [draft.language, draft.region, loadServices]);

  const visibleProviders = useMemo(() => {
    const query = providerQuery.trim().toLocaleLowerCase();
    const selectedIds = new Set(draft.selectedProviders.map((provider) => provider.id));
    return providers
      .filter((provider) =>
        query
          ? provider.name.toLocaleLowerCase().includes(query)
          : isPriorityProvider(provider) || selectedIds.has(provider.id),
      )
      .sort((a, b) => {
        const aSelected = selectedIds.has(a.id) ? 1 : 0;
        const bSelected = selectedIds.has(b.id) ? 1 : 0;
        return bSelected - aSelected || a.name.localeCompare(b.name);
      });
  }, [draft.selectedProviders, providerQuery, providers]);

  const toggleProvider = (provider: Provider) => {
    setDraft((current) => {
      const exists = current.selectedProviders.some((entry) => entry.id === provider.id);
      return {
        ...current,
        selectedProviders: exists
          ? current.selectedProviders.filter((entry) => entry.id !== provider.id)
          : [...current.selectedProviders, provider],
      };
    });
    setSaveMessage("");
  };

  const save = () => {
    if (!/^[A-Z]{2}$/.test(draft.region)) {
      setSaveMessage("Use a two-letter catalogue region, such as US, GB, AU, or TR.");
      return;
    }
    if (draft.selectedProviders.length === 0) {
      setSaveMessage("Choose at least one streaming service.");
      return;
    }
    onSave(draft);
    setSaveMessage("Saved. Watchmaker is updating your catalogue now.");
  };

  return (
    <div className="view settings-view">
      <header className="view-header">
        <div>
          <span className="eyebrow">{onboarding ? "FIRST WIND" : "WATCHMAKER SETTINGS"}</span>
          <h1>{onboarding ? "Choose your shelf" : "Settings"}</h1>
          <p className="header-copy">
            Confirm your region, choose the services you use, and start watching. No API key or
            streaming-account connection is required.
          </p>
        </div>
        <div className="zero-cost-badge">
          <span className="zero-symbol">$0</span>
          <span><strong>Plug and play</strong><small>No keys or paid APIs; uses your existing subscriptions</small></span>
        </div>
      </header>

      <div className="settings-layout">
        <div className="settings-main">
          <section className="settings-card feed-status-card">
            <div className="settings-card-heading">
              <div className="settings-icon"><DatabaseIcon /></div>
              <div>
                <h2>Automatic catalogue updates</h2>
                <p>Watchmaker checks its non-secret catalogue feed only while the app is open.</p>
              </div>
              <span className={"feed-status-pill " + feedStatus}>
                <span className="status-dot" />
                {feedStatus === "loading"
                  ? "Connecting"
                  : feedStatus === "ready"
                    ? "Ready"
                    : feedStatus === "error"
                      ? "Unavailable"
                      : "Waiting"}
              </span>
            </div>
            <div className="feed-message-row">
              <p className={"form-message " + (feedStatus === "ready" ? "valid" : feedStatus)}>
                {feedMessage || "Watchmaker will load services after a region is detected."}
              </p>
              {feedStatus === "error" && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void loadServices(draft.region, draft.language)}
                >
                  <RefreshIcon />Retry
                </button>
              )}
            </div>
          </section>

          <section className="settings-card compact-settings">
            <div>
              <label className="field-label" htmlFor="region">Catalogue region</label>
              <input
                id="region"
                className="text-input short-input"
                value={draft.region}
                maxLength={2}
                pattern="[A-Z]{2}"
                onChange={(event) => {
                  setDraft({
                    ...draft,
                    region: event.target.value.toUpperCase().replace(/[^A-Z]/g, ""),
                  });
                  setSaveMessage("");
                }}
              />
              <small>Detected from Windows. Change it if your subscriptions use another country.</small>
            </div>
            <div>
              <label className="field-label" htmlFor="language">Descriptions</label>
              <select
                id="language"
                value={draft.language}
                onChange={(event) => {
                  setDraft({ ...draft, language: event.target.value });
                  setSaveMessage("");
                }}
              >
                <option value="en-US">English</option>
                <option value="tr-TR">Türkçe</option>
              </select>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-heading compact">
              <div>
                <h2>Your subscriptions</h2>
                <p>Select only services you already use. Watchmaker never signs in to them.</p>
              </div>
              <span className="selection-count">{draft.selectedProviders.length} selected</span>
            </div>
            {feedStatus === "loading" && providers.length === 0 ? (
              <div className="provider-placeholder">
                <RefreshIcon className="spinning" />
                <span>Loading streaming services for {draft.region}…</span>
              </div>
            ) : providers.length === 0 ? (
              <div className="provider-placeholder">
                <DatabaseIcon />
                <span>No services are available from the catalogue feed for this region yet.</span>
              </div>
            ) : (
              <>
                <label className="provider-search">
                  <SearchIcon />
                  <input
                    value={providerQuery}
                    onChange={(event) => setProviderQuery(event.target.value)}
                    placeholder="Find another service…"
                  />
                </label>
                <div className="provider-grid">
                  {visibleProviders.map((provider) => {
                    const selected = draft.selectedProviders.some(
                      (entry) => entry.id === provider.id,
                    );
                    return (
                      <button
                        key={provider.id}
                        type="button"
                        className={"provider-option " + (selected ? "selected" : "")}
                        onClick={() => toggleProvider(provider)}
                      >
                        <ProviderLogo provider={provider} />
                        <span>{provider.name}</span>
                        <span className="provider-check">{selected && <CheckIcon />}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          {saveMessage && (
            <p className={"form-message settings-save-message " + (saveMessage.startsWith("Saved") ? "valid" : "error")}>
              {saveMessage}
            </p>
          )}
          <div className="settings-actions">
            <button
              className="primary-button large"
              type="button"
              onClick={save}
              disabled={feedStatus !== "ready"}
            >
              Save and update catalogue
            </button>
            <button
              className="danger-text-button"
              type="button"
              onClick={() => void onClearCatalog()}
            >
              Clear local catalogue cache
            </button>
          </div>
        </div>

        <aside className="security-card">
          <ShieldIcon className="security-hero-icon" />
          <span className="eyebrow">NON-NEGOTIABLE BOUNDARY</span>
          <h2>Watchmaker is credential-blind.</h2>
          <ul>
            <li><CheckIcon /><span>No Netflix, Prime, Max, Disney+, or Dropout passwords.</span></li>
            <li><CheckIcon /><span>No TMDb key, developer account, or technical setup requested.</span></li>
            <li><CheckIcon /><span>No embedded provider login screens.</span></li>
            <li><CheckIcon /><span>No access to browser cookies or remembered sessions.</span></li>
            <li><CheckIcon /><span>Provider pages open in your external default browser.</span></li>
            <li><CheckIcon /><span>No tray process or background service after closing.</span></li>
            <li><CheckIcon /><span>No paid API, cloud database, or AI bill.</span></li>
          </ul>
          <div className="attribution-note">
            <strong>Data attribution</strong>
            <p>
              This product uses the TMDB API but is not endorsed or certified by TMDB.
              Streaming availability data is powered by JustWatch through TMDb.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
