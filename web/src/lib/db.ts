// A tiny key-value store on IndexedDB. Everything the app saves lives here, on this device only.

const DB_NAME = 'forge';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const db = {
  get: <T = unknown>(key: string) => tx<T>('readonly', (s) => s.get(key) as IDBRequest<T>),
  set: (key: string, value: unknown) => tx('readwrite', (s) => { s.put(value, key); }),
  del: (key: string) => tx('readwrite', (s) => { s.delete(key); }),
  async getAll(): Promise<Record<string, unknown>> {
    const keys = (await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys())) ?? [];
    const out: Record<string, unknown> = {};
    for (const k of keys) out[String(k)] = await db.get(String(k));
    return out;
  },
  async clear() { await tx('readwrite', (s) => { s.clear(); }); },
};

/** Asks the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
