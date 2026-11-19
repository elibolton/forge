// IndexedDB on this device: a small key-value store for settings and state, and a store of workouts
// keyed by id so saving one workout writes just that workout.

const DB_NAME = 'forge';
const KV = 'kv';
const LOGS = 'logs';

let dbPromise: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(KV)) d.createObjectStore(KV);
      if (!d.objectStoreNames.contains(LOGS)) d.createObjectStore(LOGS, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = run(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const db = {
  get: <T = unknown>(key: string) => tx<T>(KV, 'readonly', (s) => s.get(key) as IDBRequest<T>),
  set: (key: string, value: unknown) => tx(KV, 'readwrite', (s) => { s.put(value, key); }),
  del: (key: string) => tx(KV, 'readwrite', (s) => { s.delete(key); }),

  /** Every saved workout, in no particular order. */
  allLogs: () => tx<unknown[]>(LOGS, 'readonly', (s) => s.getAll() as IDBRequest<unknown[]>).then((v) => v ?? []),
  putLogs: (logs: { id: string }[]) => tx(LOGS, 'readwrite', (s) => { for (const l of logs) s.put(l); }),
  deleteLog: (id: string) => tx(LOGS, 'readwrite', (s) => { s.delete(id); }),
  /** Replaces every workout at once (restoring a backup). */
  replaceLogs: (logs: { id: string }[]) => tx(LOGS, 'readwrite', (s) => { s.clear(); for (const l of logs) s.put(l); }),

  async clear() {
    await tx(KV, 'readwrite', (s) => { s.clear(); });
    await tx(LOGS, 'readwrite', (s) => { s.clear(); });
  },
};

/** Asks the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
