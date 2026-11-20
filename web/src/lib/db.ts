// IndexedDB on this device: a small key-value store for settings and state, plus one store per kind of
// record that grows over time (workouts, cardio, weigh-ins, saved workouts), keyed by id so saving one
// record writes just that record.

const DB_NAME = 'forge';
/**
 * 2: workouts moved to their own store. 3: cardio, weigh-ins and saved workouts moved out of the profile.
 * 4: an outbox of local changes waiting to sync.
 */
const VERSION = 4;
const KV = 'kv';
/** Local changes not yet sent to the server, keyed `${store}:${id}` (the profile is `profile:profile`). */
const OUTBOX = 'outbox';
/** kv keys that sync. The rest of kv (today's plan, the running workout…) belongs to this device. */
export const SYNCED_KEYS = ['profile'] as const;
export type SyncedKey = (typeof SYNCED_KEYS)[number];
/** Where a change lives on this device: a collection, or a synced kv key. */
export type SyncStore = Collection | SyncedKey;
export type OutboxEntry = { key: string; store: SyncStore; id: string; at: number; deleted: boolean };

const outboxKey = (store: SyncStore, id: string) => `${store}:${id}`;
const isSynced = (key: string): key is SyncedKey => (SYNCED_KEYS as readonly string[]).includes(key);

/** Listeners told after a synced local change is saved, so sync can schedule a push. */
const changeListeners = new Set<() => void>();
export function onLocalChange(fn: () => void): () => void { changeListeners.add(fn); return () => changeListeners.delete(fn); }
function changed<T>(p: Promise<T>): Promise<T> { return p.then((v) => { for (const fn of changeListeners) fn(); return v; }); }

/** Deep equality for stored data, ignoring key order (the server may return keys in another order). */
type Obj = { [k: string]: unknown };
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((x, i) => sameData(x, (b as unknown[])[i]));
  const ka = Object.keys(a).filter((k) => (a as Obj)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Obj)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => sameData((a as Obj)[k], (b as Obj)[k]));
}

function mark(t: IDBTransaction, store: SyncStore, id: string, deleted = false) {
  const entry: OutboxEntry = { key: outboxKey(store, id), store, id, at: Date.now(), deleted };
  t.objectStore(OUTBOX).put(entry);
}

/** The stores of records with an `id`. */
export type Collection = 'logs' | 'activities' | 'bodyweights' | 'templates';
export const COLLECTIONS: Collection[] = ['logs', 'activities', 'bodyweights', 'templates'];

let dbPromise: Promise<IDBDatabase> | undefined;

/** Shown when an older Forge in another tab or window holds the database open, so this one can't upgrade it. */
export const BLOCKED_MESSAGE = 'Forge is open in another tab or window. Close the other Forge tabs or windows, then reload.';

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(KV)) d.createObjectStore(KV);
      for (const c of COLLECTIONS) if (!d.objectStoreNames.contains(c)) d.createObjectStore(c, { keyPath: 'id' });
      if (!d.objectStoreNames.contains(OUTBOX)) d.createObjectStore(OUTBOX, { keyPath: 'key' });
    };
    // An older version open elsewhere (one with no versionchange handler) keeps the upgrade waiting
    // forever. Say so instead of sitting on the loading screen.
    let blocked = false;
    req.onblocked = () => { blocked = true; dbPromise = undefined; reject(new Error(BLOCKED_MESSAGE)); };
    req.onsuccess = () => {
      // Already reported as blocked: don't hold a connection the next attempt would have to wait on.
      if (blocked) { req.result.close(); return; }
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
  set: (key: string, value: unknown) => {
    if (!isSynced(key)) return tx(KV, 'readwrite', (t) => { t.objectStore(KV).put(value, key); });
    return changed(tx([KV, OUTBOX], 'readwrite', (t) => { t.objectStore(KV).put(value, key); mark(t, key, key); }));
  },
  del: (key: string) => tx(KV, 'readwrite', (t) => { t.objectStore(KV).delete(key); }),
  /**
   * Reads a value and writes back `change(value)` in one transaction, so a change made from an older
   * copy in memory (another tab wrote since) lands on top of what's stored rather than over it.
   * `change` must be synchronous.
   */
  update: (key: string, change: (stored: unknown) => unknown) => {
    const synced = isSynced(key);
    const run = tx(synced ? [KV, OUTBOX] : KV, 'readwrite', (t) => {
      const s = t.objectStore(KV);
      const req = s.get(key);
      req.onsuccess = () => {
        try { s.put(change(req.result), key); if (synced) mark(t, key, key); } catch (e) { console.error(`Could not update ${key}`, e); t.abort(); }
      };
    });
    return synced ? changed(run) : run;
  },

  /** Every record in a collection, in no particular order. */
  all: (c: Collection) => tx<unknown[]>(c, 'readonly', (t) => t.objectStore(c).getAll() as IDBRequest<unknown[]>).then((v) => v ?? []),
  /** Adds or replaces records by id. */
  put: (c: Collection, items: Record[]) => changed(tx([c, OUTBOX], 'readwrite', (t) => {
    const s = t.objectStore(c);
    for (const x of items) { s.put(x); mark(t, c, x.id); }
  })),
  delete: (c: Collection, id: string) => changed(tx([c, OUTBOX], 'readwrite', (t) => { t.objectStore(c).delete(id); mark(t, c, id, true); })),
  /** Replaces a whole collection at once (restoring a backup). Records it drops sync as deletions. */
  replace: (c: Collection, items: Record[]) => changed(tx([c, OUTBOX], 'readwrite', (t) => {
    const s = t.objectStore(c);
    const keep = new Set(items.map((x) => x.id));
    s.getAllKeys().onsuccess = (e) => {
      for (const k of (e.target as IDBRequest<IDBValidKey[]>).result) if (typeof k === 'string' && !keep.has(k)) mark(t, c, k, true);
      s.clear();
      for (const x of items) { s.put(x); mark(t, c, x.id); }
    };
  })),

  /**
   * Moves records into their collections and writes the profile without them, in one transaction:
   * either all of it lands or none of it does, so nothing is lost or doubled if the app is closed midway.
   */
  moveIntoCollections: (profile: unknown, moved: Partial<{ [K in Collection]: Record[] }>) =>
    tx([KV, ...Object.keys(moved)], 'readwrite', (t) => {
      for (const [c, items] of Object.entries(moved)) {
        const s = t.objectStore(c);
        // A record already in the store wins over the profile's copy.
        for (const x of items ?? []) s.add(x).onerror = (e) => { e.preventDefault(); e.stopPropagation(); };
      }
      t.objectStore(KV).put(profile, 'profile');
    }),

  /**
   * Moves the workouts that versions before 2 kept in one list under kv 'logs' into the logs store and
   * removes the list, in one transaction. Records already in the store win over the list's copies.
   */
  moveLegacyLogs: (logs: Record[]) => tx([KV, 'logs'], 'readwrite', (t) => {
    const s = t.objectStore('logs');
    for (const x of logs) s.add(x).onerror = (e) => { e.preventDefault(); e.stopPropagation(); };
    t.objectStore(KV).delete('logs');
  }),

  // Workouts, by their older names.
  allLogs: () => db.all('logs'),
  putLogs: (logs: Record[]) => db.put('logs', logs),
  deleteLog: (id: string) => db.delete('logs', id),
  replaceLogs: (logs: Record[]) => db.replace('logs', logs),

  async clear() {
    await tx([KV, OUTBOX, ...COLLECTIONS], 'readwrite', (t) => { for (const s of [KV, OUTBOX, ...COLLECTIONS]) t.objectStore(s).clear(); });
  },

  // MARK: Sync

  outbox: () => tx<OutboxEntry[]>(OUTBOX, 'readonly', (t) => t.objectStore(OUTBOX).getAll() as IDBRequest<OutboxEntry[]>).then((v) => v ?? []),
  outboxCount: () => tx<number>(OUTBOX, 'readonly', (t) => t.objectStore(OUTBOX).count()).then((v) => v ?? 0),

  /** The record (or profile) an outbox entry points at, or undefined if it's gone. */
  readSynced: (store: SyncStore, id: string): Promise<unknown> =>
    isSynced(store) ? db.get(store) : tx<unknown>(store, 'readonly', (t) => t.objectStore(store).get(id)),

  /**
   * Queues every local record that isn't already queued, at time 0, so it uploads unless the server
   * already has a copy (any server copy is newer than 0). Used when signing in.
   */
  queueEverything: () => tx([KV, OUTBOX, ...COLLECTIONS], 'readwrite', (t) => {
    const out = t.objectStore(OUTBOX);
    const queue = (store: SyncStore, id: string) => {
      const key = outboxKey(store, id);
      out.getKey(key).onsuccess = (e) => {
        if ((e.target as IDBRequest).result === undefined) out.put({ key, store, id, at: 0, deleted: false } satisfies OutboxEntry);
      };
    };
    for (const c of COLLECTIONS) {
      t.objectStore(c).getAllKeys().onsuccess = (e) => {
        for (const k of (e.target as IDBRequest<IDBValidKey[]>).result) if (typeof k === 'string') queue(c, k);
      };
    }
    for (const k of SYNCED_KEYS) t.objectStore(KV).getKey(k).onsuccess = (e) => { if ((e.target as IDBRequest).result !== undefined) queue(k, k); };
  }),

  /**
   * Applies changes from the server in one transaction, without queueing them. A change is skipped
   * when this device has a newer one waiting to go up; otherwise it replaces whatever is queued.
   * Returns how many were applied.
   */
  applyRemote: (changes: { store: SyncStore; id: string; at: number; deleted: boolean; body: unknown }[]) => {
    let applied = 0;
    const stores = [...new Set(changes.map((c) => (isSynced(c.store) ? KV : c.store)))];
    if (!changes.length) return Promise.resolve(0);
    return tx([OUTBOX, ...stores], 'readwrite', (t) => {
      const out = t.objectStore(OUTBOX);
      for (const c of changes) {
        const key = outboxKey(c.store, c.id);
        out.get(key).onsuccess = (e) => {
          const queued = (e.target as IDBRequest<OutboxEntry | undefined>).result;
          if (queued && queued.at > c.at) return;
          if (queued) out.delete(key);
          const target = t.objectStore(isSynced(c.store) ? KV : c.store);
          const id = isSynced(c.store) ? c.store : c.id;
          // Only count real changes, so this device's own changes coming back don't trigger a reload.
          target.get(id).onsuccess = (g) => {
            const current = (g.target as IDBRequest).result;
            if (c.deleted ? current === undefined : sameData(current, c.body)) return;
            if (c.deleted) target.delete(id); else if (isSynced(c.store)) target.put(c.body, id); else target.put(c.body);
            applied++;
          };
        };
      }
    }).then(() => applied);
  },

  /** Drops an outbox entry once it's on the server, unless the record changed again meanwhile. */
  settle: (entry: OutboxEntry) => tx(OUTBOX, 'readwrite', (t) => {
    const out = t.objectStore(OUTBOX);
    out.get(entry.key).onsuccess = (e) => {
      const now = (e.target as IDBRequest<OutboxEntry | undefined>).result;
      if (now && now.at === entry.at) out.delete(entry.key);
    };
  }),
};

/** Asks the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
