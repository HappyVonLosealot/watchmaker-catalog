import { useEffect, useMemo, useState } from "react";
import type { CatalogItem, ContentFormat, TasteSignal } from "../types";
import {
  DEFAULT_VIBE_PREFERENCES,
  hasVibePreferences,
  rankVibeMatches,
  vibeReason,
  type VibePreferences,
} from "../lib/vibes";
import { SparklesIcon } from "./Icons";
import { MediaGrid } from "./MediaGrid";

interface VibeSelectorProps {
  catalog: CatalogItem[];
  watchlist: Set<string>;
  tasteSignals: Map<string, TasteSignal["value"]>;
  onOpen: (item: CatalogItem) => void;
  onToggleWatchlist: (key: string) => void;
  onTasteSignal: (key: string, value: TasteSignal["value"] | null) => void;
}

interface NumberDialProps {
  label: string;
  value: number | null;
  defaultValue: number;
  minimum: number;
  maximum: number;
  step: number;
  labels: string[];
  onChange: (value: number | null) => void;
  note?: string;
}

function NumberDial({
  label,
  value,
  defaultValue,
  minimum,
  maximum,
  step,
  labels,
  onChange,
  note,
}: NumberDialProps) {
  const active = value !== null;
  return (
    <div className={`vibe-dial ${active ? "active" : "inactive"}`}>
      <div className="vibe-dial-heading">
        <strong>{label}</strong>
        <button
          type="button"
          className={!active ? "selected" : ""}
          onClick={() => onChange(null)}
          aria-pressed={!active}
        >
          Any
        </button>
      </div>
      <input
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value ?? defaultValue}
        onPointerDown={() => {
          if (!active) onChange(defaultValue);
        }}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        aria-label={label}
      />
      <div className={`vibe-dial-labels labels-${labels.length}`}>
        {labels.map((dialLabel) => <span key={dialLabel}>{dialLabel}</span>)}
      </div>
      {note && <small>{note}</small>}
    </div>
  );
}

function FormatDial({
  value,
  onChange,
}: {
  value: ContentFormat | null;
  onChange: (value: ContentFormat | null) => void;
}) {
  const formats: ContentFormat[] = ["series", "miniseries", "movie"];
  const numericValue = value === null ? 1 : formats.indexOf(value);
  return (
    <NumberDial
      label="Format"
      value={value === null ? null : numericValue}
      defaultValue={1}
      minimum={0}
      maximum={2}
      step={1}
      labels={["Series", "Mini Series", "Movie"]}
      onChange={(next) => onChange(next === null ? null : formats[next])}
    />
  );
}

export function VibeSelector({
  catalog,
  watchlist,
  tasteSignals,
  onOpen,
  onToggleWatchlist,
  onTasteSignal,
}: VibeSelectorProps) {
  const [preferences, setPreferences] = useState<VibePreferences>(DEFAULT_VIBE_PREFERENCES);
  const [resultLimit, setResultLimit] = useState(6);
  const active = hasVibePreferences(preferences);
  const matches = useMemo(
    () => active ? rankVibeMatches(catalog, preferences, tasteSignals) : [],
    [active, catalog, preferences, tasteSignals],
  );
  const reason = useMemo(() => vibeReason(preferences), [preferences]);
  const reasons = useMemo(
    () => new Map(matches.slice(0, resultLimit).map((item) => [item.key, reason])),
    [matches, reason, resultLimit],
  );

  useEffect(() => setResultLimit(6), [preferences]);

  const update = <Key extends keyof VibePreferences>(key: Key, value: VibePreferences[Key]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="vibe-section" aria-labelledby="vibe-heading">
      <div className="vibe-heading-row">
        <div className="vibe-heading-icon"><SparklesIcon /></div>
        <div>
          <span className="eyebrow">MOOD-FIRST DISCOVERY</span>
          <h2 id="vibe-heading">Dial in tonight</h2>
          <p>Move only the dials you care about. Story-vibe fingerprints are precomputed—no live AI or extra cost.</p>
        </div>
        {active && (
          <button type="button" className="vibe-reset" onClick={() => setPreferences(DEFAULT_VIBE_PREFERENCES)}>
            Reset dials
          </button>
        )}
      </div>

      <div className="vibe-dial-grid">
        <NumberDial
          label="Comfort level"
          value={preferences.cozyStressful}
          defaultValue={0}
          minimum={-1}
          maximum={1}
          step={0.5}
          labels={["Cozy", "Stressful"]}
          onChange={(value) => update("cozyStressful", value)}
        />
        <NumberDial
          label="Tone"
          value={preferences.funnyGrim}
          defaultValue={0}
          minimum={-1}
          maximum={1}
          step={1}
          labels={["Funny", "Serious", "Grim"]}
          onChange={(value) => update("funnyGrim", value)}
        />
        <NumberDial
          label="Pace"
          value={preferences.slowFast}
          defaultValue={0}
          minimum={-1}
          maximum={1}
          step={0.5}
          labels={["Slow Burn", "Fast Paced"]}
          onChange={(value) => update("slowFast", value)}
        />
        <FormatDial value={preferences.format} onChange={(value) => update("format", value)} />
        <NumberDial
          label="Emotional weight"
          value={preferences.lightDevastating}
          defaultValue={0}
          minimum={-1}
          maximum={1}
          step={0.5}
          labels={["Light Hearted", "Devastating"]}
          onChange={(value) => update("lightDevastating", value)}
        />
        <NumberDial
          label="Production polish"
          value={preferences.production}
          defaultValue={0}
          minimum={0}
          maximum={1}
          step={0.5}
          labels={["High Quality / Budget", "Anything Goes"]}
          onChange={(value) => update("production", value)}
          note="Estimated from ratings, audience confidence, popularity and artwork—not studio budget data."
        />
      </div>

      {!active ? (
        <div className="vibe-idle-message">Move a dial to mix your mood.</div>
      ) : matches.length > 0 ? (
        <div className="vibe-results">
          <div className="section-heading">
            <div>
              <h3>Your vibe matches</h3>
              <p>{matches.length.toLocaleString()} included titles ranked by the dials above</p>
            </div>
          </div>
          <MediaGrid
            items={matches}
            limit={resultLimit}
            reasons={reasons}
            onOpen={onOpen}
            watchlist={watchlist}
            onToggleWatchlist={onToggleWatchlist}
            tasteSignals={tasteSignals}
            onTasteSignal={onTasteSignal}
          />
          {matches.length > resultLimit && (
            <div className="load-more-row">
              <button className="secondary-button" type="button" onClick={() => setResultLimit((value) => value + 6)}>
                Show more vibe matches
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="vibe-idle-message">No included titles match every active dial. Loosen one and try again.</div>
      )}
    </section>
  );
}
