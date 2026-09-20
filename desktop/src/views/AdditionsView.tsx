import { useState, type FormEvent } from "react";
import type { CustomSite } from "../types";
import { openCustomHome, validateCustomSite } from "../lib/providerLinks";
import { ExternalIcon, GlobeIcon, PlusIcon, ShieldIcon, TrashIcon } from "../components/Icons";

interface AdditionsViewProps {
  customSites: CustomSite[];
  onChange: (sites: CustomSite[]) => void;
}

interface SiteDraft {
  name: string;
  homeUrl: string;
  searchUrlTemplate: string;
}

const EMPTY_DRAFT: SiteDraft = { name: "", homeUrl: "", searchUrlTemplate: "" };

function normalizeHttps(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function newSiteId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AdditionsView({ customSites, onChange }: AdditionsViewProps) {
  const [draft, setDraft] = useState<SiteDraft>(EMPTY_DRAFT);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const addSite = (event: FormEvent) => {
    event.preventDefault();
    const candidate = {
      name: draft.name.trim(),
      homeUrl: normalizeHttps(draft.homeUrl),
      searchUrlTemplate: normalizeHttps(draft.searchUrlTemplate),
    };
    const validationError = validateCustomSite(candidate);
    if (validationError) {
      setIsError(true);
      setMessage(validationError);
      return;
    }
    if (customSites.some((site) => site.homeUrl === candidate.homeUrl)) {
      setIsError(true);
      setMessage("That streaming website is already in your Addition list.");
      return;
    }

    onChange([...customSites, { id: newSiteId(), ...candidate }]);
    setDraft(EMPTY_DRAFT);
    setIsError(false);
    setMessage(`${candidate.name} was added locally.`);
  };

  const openSite = async (site: CustomSite) => {
    try {
      await openCustomHome(site);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "The site could not be opened.");
    }
  };

  return (
    <div className="view additions-view">
      <header className="view-header">
        <div>
          <span className="eyebrow">ADDITION</span>
          <h1>Add another streaming site</h1>
          <p className="header-copy">Create a local shortcut so any Watchmaker title can be searched on another streaming website.</p>
        </div>
        <div className="zero-cost-badge"><GlobeIcon /><span><strong>Local additions</strong><small>No account connection</small></span></div>
      </header>

      <div className="addition-layout">
        <form className="addition-form settings-card" onSubmit={addSite}>
          <div className="settings-card-heading">
            <div className="settings-icon"><PlusIcon /></div>
            <div><h2>New streaming site</h2><p>Only public HTTPS addresses are accepted. Never paste a login or account link.</p></div>
          </div>

          <label className="field-label" htmlFor="site-name">Site name</label>
          <input
            id="site-name"
            className="text-input"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="MUBI"
            maxLength={80}
          />

          <label className="field-label addition-field" htmlFor="site-home">Website</label>
          <input
            id="site-home"
            className="text-input"
            value={draft.homeUrl}
            onChange={(event) => setDraft({ ...draft, homeUrl: event.target.value })}
            placeholder="https://mubi.com"
            inputMode="url"
          />

          <label className="field-label addition-field" htmlFor="site-search">Title-search address <span>optional</span></label>
          <input
            id="site-search"
            className="text-input"
            value={draft.searchUrlTemplate}
            onChange={(event) => setDraft({ ...draft, searchUrlTemplate: event.target.value })}
            placeholder="https://example.com/search?q={query}"
            inputMode="url"
          />
          <p className="field-help">Use <code>{"{query}"}</code> where Watchmaker should insert the encoded title. If left blank, Watchmaker opens the homepage.</p>

          {message && <p className={`form-message ${isError ? "error" : "valid"}`}>{message}</p>}
          <button className="primary-button addition-submit" type="submit"><PlusIcon />Add streaming site</button>
        </form>

        <aside className="addition-boundary security-card">
          <ShieldIcon className="security-hero-icon" />
          <span className="eyebrow">WHAT AN ADDITION DOES</span>
          <h2>A launcher, not an account connection.</h2>
          <p>Watchmaker saves the public site and search pattern on this computer. It never signs in, reads cookies, or learns credentials.</p>
          <p>Custom sites are not automatically added to the availability catalogue because arbitrary websites do not share one safe, free catalogue API. Their search buttons appear on every title instead.</p>
        </aside>
      </div>

      <section className="added-sites-section">
        <div className="section-heading">
          <div><h2>Your added sites</h2><p>{customSites.length ? `${customSites.length} local addition${customSites.length === 1 ? "" : "s"}` : "No custom sites yet"}</p></div>
        </div>
        {customSites.length > 0 ? (
          <div className="added-sites-grid">
            {customSites.map((site) => (
              <article className="added-site-card" key={site.id}>
                <div className="added-site-monogram">{site.name.slice(0, 1).toUpperCase()}</div>
                <div className="added-site-copy">
                  <h3>{site.name}</h3>
                  <p>{new URL(site.homeUrl).hostname}</p>
                  <small>{site.searchUrlTemplate ? "Title search configured" : "Opens homepage"}</small>
                </div>
                <div className="added-site-actions">
                  <button className="icon-button" type="button" onClick={() => void openSite(site)} aria-label={`Open ${site.name}`} title={`Open ${site.name}`}><ExternalIcon /></button>
                  <button className="icon-button negative" type="button" onClick={() => onChange(customSites.filter((entry) => entry.id !== site.id))} aria-label={`Remove ${site.name}`} title={`Remove ${site.name}`}><TrashIcon /></button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="provider-placeholder"><GlobeIcon /><span>Add a public streaming website above. It will be saved only on this computer.</span></div>
        )}
      </section>
    </div>
  );
}
