import { getCatalog, replaceProviderSlice, setMeta } from "./catalogDb";
import { fetchHotlineFeed, fetchProviderCatalog } from "./catalogFeed";
import type { AppSettings, CatalogItem, HotlineFeed, MediaType, SyncProgress } from "../types";

export const LAST_SYNC_META_KEY = "last-successful-sync";
export const HOTLINE_META_KEY = "hotline-feed";

interface SyncCallbacks {
  onProgress: (progress: SyncProgress) => void;
  onCatalogUpdated: (catalog: CatalogItem[]) => void;
  onHotlineUpdated: (hotline: HotlineFeed) => void;
}

export async function syncCatalog(
  settings: AppSettings,
  callbacks: SyncCallbacks,
  signal: AbortSignal,
): Promise<void> {
  if (settings.selectedProviders.length === 0) return;

  const mediaTypes: MediaType[] = ["movie", "tv"];
  const catalogueSlices = settings.selectedProviders.length * mediaTypes.length;
  const totalSlices = catalogueSlices + 1;
  let completedSlices = 0;

  callbacks.onProgress({
    state: "syncing",
    label: "Checking for catalogue updates…",
    completed: 0,
    total: totalSlices,
    lastSuccessfulSync: null,
  });

  try {
    for (const provider of settings.selectedProviders) {
      for (const mediaType of mediaTypes) {
        if (signal.aborted) throw new DOMException("Sync cancelled", "AbortError");

        const mediaLabel = mediaType === "movie" ? "movies" : "series";
        callbacks.onProgress({
          state: "syncing",
          label: `${provider.name}: ${mediaLabel}`,
          completed: completedSlices,
          total: totalSlices,
          lastSuccessfulSync: null,
        });
        const items = await fetchProviderCatalog(
          settings,
          provider,
          mediaType,
          signal,
        );

        if (signal.aborted) throw new DOMException("Sync cancelled", "AbortError");
        await replaceProviderSlice({ provider, mediaType, items });
        completedSlices += 1;
        callbacks.onCatalogUpdated(await getCatalog());
      }
    }

    callbacks.onProgress({
      state: "syncing",
      label: "Refreshing Hotline trends and episodes",
      completed: completedSlices,
      total: totalSlices,
      lastSuccessfulSync: null,
    });
    let hotlineWarning: string | null = null;
    try {
      const hotline = await fetchHotlineFeed(settings, signal);
      if (signal.aborted) throw new DOMException("Sync cancelled", "AbortError");
      await setMeta(HOTLINE_META_KEY, hotline);
      callbacks.onHotlineUpdated(hotline);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      hotlineWarning = error instanceof Error ? error.message : "Hotline update failed";
    }
    completedSlices += 1;

    const completedAt = Date.now();
    await setMeta(LAST_SYNC_META_KEY, completedAt);
    callbacks.onProgress({
      state: "complete",
      label: hotlineWarning
        ? "Catalogue is current; using the saved Hotline"
        : "Catalogue and Hotline are current",
      completed: totalSlices,
      total: totalSlices,
      lastSuccessfulSync: completedAt,
      error: hotlineWarning ?? undefined,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      callbacks.onProgress({
        state: "cancelled",
        label: "Update stopped; cached catalogue is safe",
        completed: completedSlices,
        total: totalSlices,
        lastSuccessfulSync: null,
      });
      return;
    }

    const message = error instanceof Error ? error.message : "Catalogue update failed";
    callbacks.onProgress({
      state: "error",
      label: "Using the last saved catalogue",
      completed: completedSlices,
      total: totalSlices,
      lastSuccessfulSync: null,
      error: message,
    });
  }
}
