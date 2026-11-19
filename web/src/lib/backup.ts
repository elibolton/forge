import { db } from './db';
import { app } from './store.svelte';
import { toasts } from './toasts.svelte';
import { dayKey } from './units';

const DAY = 86_400_000;

/** When the last backup was exported, if ever. */
export const lastBackupAt = () => app.get<number>('lastBackupAt');

/** Saves a backup file: the share sheet on iPhone (Save to Files / iCloud Drive), a download elsewhere. */
export async function exportBackup(): Promise<boolean> {
  const ids = app.logs.map((l) => l.id);
  if (!(await saveFile(backupFile(app.backup(), `forge-backup-${dayKey()}.json`)))) return false;
  app.set('lastBackupAt', Date.now());
  // Which workouts it holds, not just how many: delete three and log three new ones and the count
  // would say nothing's missing.
  app.set('backupLogIDs', ids);
  app.set('backupLogCount', ids.length);
  toasts.show('Backup saved');
  return true;
}

/**
 * Everything on the device exactly as stored, for when the app can't read it. Nothing is parsed, so a
 * damaged record still makes it into the file.
 */
export async function exportRawBackup(): Promise<boolean> {
  return saveFile(await rawBackupFile());
}

/**
 * The raw backup, read ahead of the tap that saves it: the share sheet needs the tap's user activation,
 * which waiting on the database first can use up.
 */
export async function rawBackupFile(): Promise<File> {
  const [profile, logs, kv, session, activities, bodyweights, templates] = await Promise.all([
    db.get('profile'), db.allLogs(), db.get('kv'), db.get('session'), db.all('activities'), db.all('bodyweights'), db.all('templates'),
  ]);
  const text = JSON.stringify({
    app: 'forge', version: 2, raw: true, exportedAt: Date.now(), profile, logs, activities, bodyweights, templates, kv, session,
  }, null, 1);
  return backupFile(text, `forge-raw-${dayKey()}.json`);
}

const backupFile = (text: string, name: string) => new File([text], name, { type: 'application/json' });

/** Running from the Home Screen, where a plain download usually does nothing visible. */
const standalone = () =>
  (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
  || (navigator as { standalone?: boolean }).standalone === true;

/**
 * The share sheet on iPhone (Save to Files / iCloud Drive), a download elsewhere. False if cancelled or
 * if it couldn't be saved, so a backup is only marked done when there's a file.
 */
export async function saveFile(file: File): Promise<boolean> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Forge backup' });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return false;
      // From the Home Screen the download fallback usually does nothing, so don't claim it worked.
      if (standalone()) {
        toasts.show("Couldn't save the backup. Try again.");
        return false;
      }
      download(file);
    }
  } else {
    download(file);
  }
  return true;
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Whether to nudge for a backup: there are workouts the last backup doesn't have, and it's been two
 * weeks (or there's never been one and three workouts are at stake). "Later" snoozes for a week.
 */
export function backupDue(now = Date.now()): boolean {
  if (app.logs.length < 3) return false;
  if ((app.get<number>('backupSnoozeUntil') ?? 0) > now) return false;
  const last = lastBackupAt();
  if (last === undefined) return true;
  return unsavedCount() > 0 && now - last > 14 * DAY;
}

/** Workouts the last backup doesn't have. */
export function unsavedCount(): number {
  const ids = app.get<unknown>('backupLogIDs');
  if (Array.isArray(ids)) {
    const saved = new Set(ids);
    return app.logs.filter((l) => !saved.has(l.id)).length;
  }
  // Backups made before ids were kept: the count is all there is.
  return Math.max(0, app.logs.length - (app.get<number>('backupLogCount') ?? 0));
}

export function snoozeBackup(now = Date.now()) { app.set('backupSnoozeUntil', now + 7 * DAY); }

export function lastBackupText(now = Date.now()): string {
  const last = lastBackupAt();
  if (last === undefined) return 'Never';
  const days = Math.floor((now - last) / DAY);
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
}
