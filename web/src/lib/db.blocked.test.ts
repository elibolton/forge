// S4: an older Forge holding the database open (with no versionchange handler) must not leave the
// app on its loading screen forever. Its own file, so the database starts fresh.
import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';

test('a blocked upgrade becomes a load error that says to close the other tabs', async () => {
  const old = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('forge', 2);
    req.onupgradeneeded = () => { req.result.createObjectStore('kv'); req.result.createObjectStore('logs', { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const { app } = await import('./store.svelte');
  await app.load();
  expect(app.ready).toBe(true);
  expect(app.loadError).toMatch(/Close the other Forge tabs/);

  // Once the other copy closes, reloading opens and upgrades the database.
  old.close();
  await app.load();
  expect(app.loadError).toBeNull();
});
