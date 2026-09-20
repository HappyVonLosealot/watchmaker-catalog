import { getCatalog, replaceProviderSlice, setMeta } from "./catalogDb";
import { fetchProviderCatalog } from "./catalogFeed";
import type { AppSettings, CatalogItem, MediaType, SyncProgress } from "../types";

export const LAST_SYNC_META_KEY = "last-successful-sync";

interface SyncCallbacks {
  onProgress: (progress: SyncProgress) => void;
  onCatalogUpdated: (catalog: CatalogItem[]) => void;
}

export async function syncCatalog(
  settings: AppSettings,
  callbacks: SyncCallbacks,
  signal: AbortSignal,
): Promise<void> {
  if (settings.selectedProviders.length === 0) return;

  const mediaTypes: MediaType[] = ["movie", "tv"];
  const totalSlices = settings.selectedProviders.length * mediaTypes.length;
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

    const completedAt = Date.now();
    await setMeta(LAST_SYNC_META_KEY, completedAt);
    callbacks.onProgress({
      state: "complete",
      label: "Catalogue is current",
      completed: totalSlices,
      total: totalSlices,
      lastSuccessfulSync: completedAt,
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
