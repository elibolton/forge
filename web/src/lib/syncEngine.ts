// One sync pass: pull the server's changes since last time, then push this device's queued changes.
// Each record keeps whichever change is newest (by the device clock when it was made); deletions are
// tombstones. The server refuses an update older than what it has, so a device that missed a pull
// can't overwrite a newer change.

import { COLLECTIONS, type OutboxEntry, SYNCED_KEYS, type SyncStore, db } from './db';
import { type ServerRecord, type Server, ServerError, type Session, serverID } from './server';

/** Server collection for each local store. Synced kv keys all live in `state`, by name. */
export const REMOTE: Record<SyncStore, string> = {
  logs: 'workouts', activities: 'activities', bodyweights: 'bodyweights', templates: 'templates', profile: 'state',
};
const LOCAL_FOR: Record<string, SyncStore | 'state'> = { workouts: 'logs', activities: 'activities', bodyweights: 'bodyweights', templates: 'templates', state: 'state' };
const REMOTE_COLLECTIONS = [...new Set(Object.values(REMOTE))];

export type Cursors = Record<string, string>;
export type PassResult = { pulled: number; pushed: number; cursors: Cursors };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The local store a server record belongs in, or null for one this version doesn't sync. */
function localStore(collection: string, clientId: string): SyncStore | null {
  const local = LOCAL_FOR[collection];
  if (!local) return null;
  if (local === 'state') return (SYNCED_KEYS as readonly string[]).includes(clientId) ? (clientId as SyncStore) : null;
  return local;
}

async function pull(server: Server, s: Session, cursors: Cursors): Promise<{ applied: number; cursors: Cursors }> {
  const next = { ...cursors };
  let applied = 0;
  for (const collection of REMOTE_COLLECTIONS) {
    const records = await server.changedSince(collection, cursors[collection] ?? '', s.token);
    const changes = [];
    for (const r of records) {
      const store = localStore(collection, r.clientId);
      if (!store) continue;
      const isRecord = (COLLECTIONS as string[]).includes(store);
      // A body that couldn't be stored under its id is skipped rather than allowed to break the pass.
      if (!r.deleted && (isRecord ? !(isObj(r.body) && r.body.id === r.clientId) : r.body == null)) continue;
      changes.push({ store, id: r.clientId, at: r.updatedAt ?? 0, deleted: !!r.deleted, body: r.body });
    }
    applied += await db.applyRemote(changes);
    if (records.length) next[collection] = records[records.length - 1].updated;
  }
  return { applied, cursors: next };
}

async function pushOne(server: Server, s: Session, e: OutboxEntry): Promise<'pushed' | 'remoteWins' | 'skipped'> {
  const collection = REMOTE[e.store];
  const id = await serverID(s.account.id, collection, e.id);
  const local = e.deleted ? undefined : await db.readSynced(e.store, e.id);
  const deleted = e.deleted || local === undefined;
  const data = { owner: s.account.id, clientId: e.id, body: deleted ? null : local, updatedAt: e.at, deleted };
  // Queued at sign-in (time 0) and never synced: usually not on the server, so create first, which
  // keeps a large first upload to one request per record.
  if (e.at === 0 && !deleted) {
    try {
      await server.createRecord(collection, { id, ...data }, s.token);
      return 'pushed';
    } catch (err) {
      if (!(err instanceof ServerError) || err.status !== 400) throw err;
      // Already there (another device uploaded it): the pull will have brought it, so the server copy stands.
      return 'skipped';
    }
  }
  try {
    await server.updateRecord(collection, id, data, s.token);
    return 'pushed';
  } catch (err) {
    if (!(err instanceof ServerError) || err.status !== 404) throw err;
  }
  // 404: either it doesn't exist yet, or the server has a newer change (the rule hides the record).
  try {
    const remote = await server.getRecord(collection, id, s.token);
    await applyOne(e.store, remote);
    return 'remoteWins';
  } catch (err) {
    if (!(err instanceof ServerError) || err.status !== 404) throw err;
  }
  if (deleted) return 'skipped'; // never reached the server; nothing to delete
  await server.createRecord(collection, { id, ...data }, s.token);
  return 'pushed';
}

async function applyOne(store: SyncStore, r: ServerRecord) {
  await db.applyRemote([{ store, id: r.clientId, at: r.updatedAt ?? 0, deleted: !!r.deleted, body: r.body }]);
}

/** Runs one pull-then-push pass. Throws ServerError (offline, signed out…) for the caller to report. */
export async function syncPass(server: Server, s: Session, cursors: Cursors): Promise<PassResult> {
  const { applied, cursors: next } = await pull(server, s, cursors);
  let pulled = applied;
  let pushed = 0;
  for (const e of await db.outbox()) {
    const result = await pushOne(server, s, e);
    if (result === 'pushed') pushed++;
    if (result === 'remoteWins') pulled++;
    if (result !== 'remoteWins') await db.settle(e);
  }
  return { pulled, pushed, cursors: next };
}
