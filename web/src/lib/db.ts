// IndexedDB on this device: a small key-value store for settings and state, plus one store per kind of
// record that grows over time (workouts, cardio, weigh-ins, saved workouts), keyed by id so saving one
// record writes just that record.

const DB_NAME = 'forge';
/** 2: workouts moved to their own store. 3: cardio, weigh-ins and saved workouts moved out of the profile. */
const VERSION = 3;
const KV = 'kv';

/** The stores of records with an `id`. */
export type Collection = 'logs' | 'activities' | 'bodyweights' | 'templates';
export const COLLECTIONS: Collection[] = ['logs', 'activities', 'bodyweights', 'templates'];

let dbPromise: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(KV)) d.createObjectStore(KV);
      for (const c of COLLECTIONS) if (!d.objectStoreNames.contains(c)) d.createObjectStore(c, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      // Another tab upgrading the database: step aside so it can, and open afresh next time.
      req.result.onversionchange = () => { req.result.close(); dbPromise = undefined; };
      resolve(req.result);
    };
    req.onerror = () => { dbPromise = undefined; reject(req.error); };
  });
  return dbPromise;
}

function tx<T>(stores: string | string[], mode: IDBTransactionMode, run: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(stores, mode);
    const req = run(t);
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

type Record = { id: string };

export const db = {
  get: <T = unknown>(key: string) => tx<T>(KV, 'readonly', (t) => t.objectStore(KV).get(key) as IDBRequest<T>),
  set: (key: string, value: unknown) => tx(KV, 'readwrite', (t) => { t.objectStore(KV).put(value, key); }),
  del: (key: string) => tx(KV, 'readwrite', (t) => { t.objectStore(KV).delete(key); }),

  /** Every record in a collection, in no particular order. */
  all: (c: Collection) => tx<unknown[]>(c, 'readonly', (t) => t.objectStore(c).getAll() as IDBRequest<unknown[]>).then((v) => v ?? []),
  /** Adds or replaces records by id. */
  put: (c: Collection, items: Record[]) => tx(c, 'readwrite', (t) => { const s = t.objectStore(c); for (const x of items) s.put(x); }),
  delete: (c: Collection, id: string) => tx(c, 'readwrite', (t) => { t.objectStore(c).delete(id); }),
  /** Replaces a whole collection at once (restoring a backup). */
  replace: (c: Collection, items: Record[]) => tx(c, 'readwrite', (t) => { const s = t.objectStore(c); s.clear(); for (const x of items) s.put(x); }),

  /**
   * Moves records into their collections and writes the profile without them, in one transaction:
   * either all of it lands or none of it does, so nothing is lost or doubled if the app is closed midway.
   */
  moveIntoCollections: (profile: unknown, moved: Partial<{ [K in Collection]: Record[] }>) =>
    tx([KV, ...Object.keys(moved)], 'readwrite', (t) => {
      for (const [c, items] of Object.entries(moved)) { const s = t.objectStore(c); for (const x of items ?? []) s.put(x); }
      t.objectStore(KV).put(profile, 'profile');
    }),

  // Workouts, by their older names.
  allLogs: () => db.all('logs'),
  putLogs: (logs: Record[]) => db.put('logs', logs),
  deleteLog: (id: string) => db.delete('logs', id),
  replaceLogs: (logs: Record[]) => db.replace('logs', logs),

  async clear() {
    await tx([KV, ...COLLECTIONS], 'readwrite', (t) => { for (const s of [KV, ...COLLECTIONS]) t.objectStore(s).clear(); });
  },
};

/** Asks the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
