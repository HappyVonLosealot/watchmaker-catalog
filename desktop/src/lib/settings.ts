import type { AppSettings, Provider, TasteSignal } from "../types";

const SETTINGS_KEY = "watchmaker.settings.v1";
const WATCHLIST_KEY = "watchmaker.watchlist.v1";
const TASTE_KEY = "watchmaker.taste.v1";

export const DEFAULT_PROVIDERS: Provider[] = [
  { id: 9, name: "Amazon Prime Video", logoPath: "/gMZdpavHmxFNnLpMHwVxfqeux2g.png", kind: "watch" },
  { id: 337, name: "Disney+", logoPath: "/5eZ872CghnHFLB1j8grszbrx0dx.png", kind: "watch" },
  { id: -101, name: "Dropout", logoPath: null, kind: "dropout" },
  { id: 1899, name: "Max", logoPath: "/skypuy7SXuugIQeYg0IglmzoKaS.png", kind: "watch" },
  { id: 8, name: "Netflix", logoPath: "/rK1KljqmbvO9HQa1PBFLILWah72.png", kind: "watch" },
];

export const DEFAULT_SETTINGS: AppSettings = {
  region: "TR",
  language: "en-US",
  selectedProviders: DEFAULT_PROVIDERS,
  customSites: [],
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeSettings(settings: Partial<AppSettings>): AppSettings {
  const region = typeof settings.region === "string" && /^[A-Z]{2}$/.test(settings.region)
    ? settings.region
    : DEFAULT_SETTINGS.region;
  const language = settings.language === "tr-TR" ? "tr-TR" : "en-US";

  const selectedProviders = Array.isArray(settings.selectedProviders)
    ? settings.selectedProviders.filter((provider) =>
        DEFAULT_PROVIDERS.some((allowed) => allowed.id === provider?.id),
      )
    : [];

  return {
    region,
    language,
    selectedProviders: selectedProviders.length ? selectedProviders : DEFAULT_PROVIDERS,
    customSites: Array.isArray(settings.customSites) ? settings.customSites : [],
  };
}

export function loadSettings(): AppSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  const stored = readJson<Partial<AppSettings>>(SETTINGS_KEY, {});
  const clean = sanitizeSettings(stored);

  // Version 0.1 accepted a personal TMDb token. Rewrite any older or malformed
  // settings through the strict allowlist so legacy and unexpected fields vanish.
  const serialized = JSON.stringify(clean);
  if (raw !== null && raw !== serialized) {
    localStorage.setItem(SETTINGS_KEY, serialized);
  }
  return clean;
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(settings)));
}

export function loadWatchlist(): Set<string> {
  return new Set(readJson<string[]>(WATCHLIST_KEY, []));
}

export function saveWatchlist(keys: Set<string>): void {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...keys]));
}

export function loadTasteSignals(): Map<string, TasteSignal["value"]> {
  return new Map(
    readJson<TasteSignal[]>(TASTE_KEY, []).map((signal) => [signal.key, signal.value]),
  );
}

export function saveTasteSignals(signals: Map<string, TasteSignal["value"]>): void {
  localStorage.setItem(
    TASTE_KEY,
    JSON.stringify([...signals].map(([key, value]) => ({ key, value }))),
  );
}
