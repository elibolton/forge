<script lang="ts">
  import { ShieldCheck } from '@lucide/svelte';
  import { backupDue, exportBackup, lastBackupAt, snoozeBackup, unsavedCount } from '../lib/backup';
  import { storageGuard } from '../lib/install.svelte';
  import { count } from '../lib/labels';
  import { app } from '../lib/store.svelte';
  import Notice from './Notice.svelte';

  /** A gentle reminder that history lives only on this phone. Re-evaluates whenever the data changes. */
  const due = $derived.by(() => { void app.kv; void app.logs; void storageGuard.persisted; return backupDue(); });
  const unsaved = $derived.by(() => { void app.kv; void app.logs; return unsavedCount(); });
</script>

{#if due}
  <Notice icon={ShieldCheck} tone="info" title="Back up your training">
    {lastBackupAt() === undefined
      ? `${count(app.logs.length, 'workout')} ${app.logs.length === 1 ? 'lives' : 'live'} only on this phone.`
      : `${count(unsaved, 'new workout')} since your last backup.`}
    Save a copy to Files or iCloud Drive.
    {#snippet actions()}
      <button class="notice-act" onclick={exportBackup}>Back up now</button>
      <button class="notice-act plain" onclick={() => snoozeBackup()}>Later</button>
    {/snippet}
  </Notice>
{/if}
