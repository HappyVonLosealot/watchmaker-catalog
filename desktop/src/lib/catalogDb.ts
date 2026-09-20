import type { CatalogItem, ProviderSlice } from "../types";

const DATABASE_NAME = "watchmaker-catalog";
const DATABASE_VERSION = 1;
const CATALOG_STORE = "catalog";
const META_STORE = "meta";

interface StoredCatalogItem extends CatalogItem {
  providerIds: number[];
}

interface MetaRow {
  key: string;
  value: unknown;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

export async function openCatalogDb(): Promise<IDBDatabase> {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    const catalog = db.createObjectStore(CATALOG_STORE, { keyPath: "key" });
    catalog.createIndex("mediaType", "mediaType", { unique: false });
    catalog.createIndex("providerIds", "providerIds", { unique: false, multiEntry: true });
    db.createObjectStore(META_STORE, { keyPath: "key" });
  };
  return requestResult(request);
}

function toStoredItem(item: CatalogItem): StoredCatalogItem {
  return {
    ...item,
    providerIds: item.providerLinks.map((link) => link.providerId),
  };
}

function fromStoredItem(item: StoredCatalogItem): CatalogItem {
  const { providerIds: _providerIds, ...catalogItem } = item;
  return catalogItem;
}

export async function getCatalog(): Promise<CatalogItem[]> {
  const db = await openCatalogDb();
  try {
    const transaction = db.transaction(CATALOG_STORE, "readonly");
    const rows = await requestResult(
      transaction.objectStore(CATALOG_STORE).getAll() as IDBRequest<StoredCatalogItem[]>,
    );
    return rows.map(fromStoredItem);
  } finally {
    db.close();
  }
}

async function readExistingByKeys(
  db: IDBDatabase,
  keys: string[],
): Promise<Map<string, StoredCatalogItem>> {
  const transaction = db.transaction(CATALOG_STORE, "readonly");
  const store = transaction.objectStore(CATALOG_STORE);
  const requests = keys.map((key) => requestResult(store.get(key) as IDBRequest<StoredCatalogItem>));
  const rows = await Promise.all(requests);
  const existing = new Map<string, StoredCatalogItem>();
  for (const row of rows) {
    if (row) existing.set(row.key, row);
  }
  return existing;
}

export async function replaceProviderSlice(slice: ProviderSlice): Promise<void> {
  const db = await openCatalogDb();
  try {
    // Read cross-provider links before starting the write. Removal and insertion then
    // happen in one transaction, so a storage failure cannot leave half a slice behind.
    const existing = await readExistingByKeys(db, slice.items.map((item) => item.key));
    const transaction = db.transaction(CATALOG_STORE, "readwrite");
    const store = transaction.objectStore(CATALOG_STORE);
    const index = store.index("providerIds");

    await new Promise<void>((resolve, reject) => {
      const cursorRequest = index.openCursor(IDBKeyRange.only(slice.provider.id));
      cursorRequest.onerror = () => reject(cursorRequest.error);
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          for (const item of slice.items) {
            const currentLinks = (existing.get(item.key)?.providerLinks ?? []).filter(
              (link) => link.providerId !== slice.provider.id,
            );
            store.put(toStoredItem({
              ...item,
              providerLinks: [...currentLinks, ...item.providerLinks],
            }));
          }
          resolve();
          return;
        }

        const row = cursor.value as StoredCatalogItem;
        if (row.mediaType === slice.mediaType) {
          const providerLinks = row.providerLinks.filter(
            (link) => link.providerId !== slice.provider.id,
          );
          if (providerLinks.length === 0) {
            cursor.delete();
          } else {
            cursor.update(toStoredItem({ ...fromStoredItem(row), providerLinks }));
          }
        }
        cursor.continue();
      };
    });
    await transactionComplete(transaction);
  } finally {
    db.close();
  }
}

export async function clearCatalog(): Promise<void> {
  const db = await openCatalogDb();
  try {
    const transaction = db.transaction([CATALOG_STORE, META_STORE], "readwrite");
    transaction.objectStore(CATALOG_STORE).clear();
    transaction.objectStore(META_STORE).clear();
    await transactionComplete(transaction);
  } finally {
    db.close();
  }
}

export async function retainCatalogProviders(providerIds: number[]): Promise<void> {
  const selected = new Set(providerIds);
  const db = await openCatalogDb();
  try {
    const transaction = db.transaction(CATALOG_STORE, "readwrite");
    const store = transaction.objectStore(CATALOG_STORE);

    await new Promise<void>((resolve, reject) => {
      const cursorRequest = store.openCursor();
      cursorRequest.onerror = () => reject(cursorRequest.error);
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          resolve();
          return;
        }

        const row = cursor.value as StoredCatalogItem;
        const providerLinks = row.providerLinks.filter((link) => selected.has(link.providerId));
        if (providerLinks.length === 0) {
          cursor.delete();
        } else if (providerLinks.length !== row.providerLinks.length) {
          cursor.update(toStoredItem({ ...fromStoredItem(row), providerLinks }));
        }
        cursor.continue();
      };
    });
    await transactionComplete(transaction);
  } finally {
    db.close();
  }
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openCatalogDb();
  try {
    const transaction = db.transaction(META_STORE, "readwrite");
    transaction.objectStore(META_STORE).put({ key, value } satisfies MetaRow);
    await transactionComplete(transaction);
  } finally {
    db.close();
  }
}

export async function getMeta<T>(key: string): Promise<T | null> {
  const db = await openCatalogDb();
  try {
    const transaction = db.transaction(META_STORE, "readonly");
    const row = (await requestResult(transaction.objectStore(META_STORE).get(key))) as
      | MetaRow
      | undefined;
    return (row?.value as T | undefined) ?? null;
  } finally {
    db.close();
  }
}
