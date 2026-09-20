// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PROVIDERS, loadSettings, saveSettings } from "./settings";

const SETTINGS_KEY = "watchmaker.settings.v1";

beforeEach(() => localStorage.clear());

describe("local settings", () => {
  it("removes credentials left by the pre-feed beta", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      region: "TR",
      language: "en-US",
      selectedProviders: [],
      customSites: [],
      tmdbToken: "legacy-secret",
      syncPageLimit: 3,
    }));

    expect(loadSettings()).toEqual({
      region: "TR",
      language: "en-US",
      selectedProviders: DEFAULT_PROVIDERS,
      customSites: [],
    });
    expect(localStorage.getItem(SETTINGS_KEY)).not.toContain("legacy-secret");
    expect(localStorage.getItem(SETTINGS_KEY)).not.toContain("tmdbToken");
  });

  it("never persists unexpected credential fields", () => {
    saveSettings({
      region: "TR",
      language: "tr-TR",
      selectedProviders: [],
      customSites: [],
      tmdbToken: "do-not-store",
    } as never);

    expect(localStorage.getItem(SETTINGS_KEY)).not.toContain("do-not-store");
  });

  it("replaces malformed settings instead of retaining their raw contents", () => {
    localStorage.setItem(SETTINGS_KEY, '{"tmdbToken":"truncated-secret"');

    expect(loadSettings().selectedProviders).toEqual(DEFAULT_PROVIDERS);
    expect(localStorage.getItem(SETTINGS_KEY)).not.toContain("truncated-secret");
  });

  it("is plug and play on first launch in Turkey", () => {
    expect(loadSettings()).toEqual({
      region: "TR",
      language: "en-US",
      selectedProviders: DEFAULT_PROVIDERS,
      customSites: [],
    });
  });
});
