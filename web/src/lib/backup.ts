import { app } from './store.svelte';
import { toasts } from './toasts.svelte';
import { dayKey } from './units';

const DAY = 86_400_000;

/** When the last backup was exported, if ever. */
export const lastBackupAt = () => app.get<number>('lastBackupAt');

/** Saves a backup file: the share sheet on iPhone (Save to Files / iCloud Drive), a download elsewhere. */
export async function exportBackup(): Promise<boolean> {
  const name = `forge-backup-${dayKey()}.json`;
  const file = new File([app.backup()], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Forge backup' });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return false;
      download(file);
    }
  } else {
    download(file);
  }
  app.set('lastBackupAt', Date.now());
  app.set('backupLogCount', app.logs.length);
  toasts.show('Backup saved');
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
  const logs = app.logs.length;
  if (logs < 3) return false;
  if ((app.get<number>('backupSnoozeUntil') ?? 0) > now) return false;
  const last = lastBackupAt();
  if (last === undefined) return true;
  const unsaved = logs - (app.get<number>('backupLogCount') ?? 0);
  return unsaved > 0 && now - last > 14 * DAY;
}

export function snoozeBackup(now = Date.now()) { app.set('backupSnoozeUntil', now + 7 * DAY); }

export function lastBackupText(now = Date.now()): string {
  const last = lastBackupAt();
  if (last === undefined) return 'Never';
  const days = Math.floor((now - last) / DAY);
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
}
