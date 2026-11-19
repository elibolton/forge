<script lang="ts">
  import { Catalog, type Exercise, type ImportResult, importSetCount, newImports, parseHistory, uuid } from '../engine';
  import { CircleCheck, Download, FileUp, TriangleAlert, Upload } from '@lucide/svelte';
  import ActionMenu from '../components/ActionMenu.svelte';
  import BackBar from '../components/BackBar.svelte';
  import CustomExerciseEditor from '../components/CustomExerciseEditor.svelte';
  import ExercisePicker from '../components/ExercisePicker.svelte';
  import { fmtDate } from '../lib/logs';
  import { type Backup, app, readBackup } from '../lib/store.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { exportBackup, lastBackupText } from '../lib/backup';

  // CSV import from Fitbod, Strong or Hevy, so recommendations start from real numbers.
  const lastBackup = $derived.by(() => { void app.kv; return lastBackupText(); });
  let pounds = $state(app.profile!.usesPounds);
  let fileText = $state<string | null>(null);
  let result = $state.raw<ImportResult | null>(null);
  let error = $state<string | null>(null);
  let imported = $state<number | null>(null);
  /** Names from the file the user matched by hand → exercise id. */
  let manualMatches = $state<Record<string, string>>({});
  let matching = $state<string | null>(null);
  let creatingFrom = $state<string | null>(null);
  let csvInput = $state<HTMLInputElement>();
  let backupInput = $state<HTMLInputElement>();

  /** What importing adds: each day's exercises that aren't logged that day yet. */
  const newWorkouts = $derived(result ? newImports(result.workouts, app.logs) : []);
  const newSets = $derived(newWorkouts.reduce((t, w) => t + w.exercises.reduce((u, e) => u + e.sets.length, 0), 0));

  function reparse() {
    if (fileText === null) return;
    error = null;
    imported = null;
    try { result = parseHistory(fileText, pounds, manualMatches, Catalog.all); } catch (e) { result = null; error = (e as Error).message; }
  }

  async function pickCSV(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    imported = null;
    fileText = await file.text();
    reparse();
    (e.currentTarget as HTMLInputElement).value = '';
  }

  function importNow() {
    const logs = newWorkouts.map((w) => ({ id: uuid(), date: w.date, focus: null, durationSeconds: 0, exercises: w.exercises, program: null }));
    app.addLogs(logs);
    imported = logs.length;
  }

  function match(name: string, e: Exercise) { manualMatches = { ...manualMatches, [name]: e.id }; reparse(); }

  async function pickBackup(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    let backup: Backup;
    try {
      backup = readBackup(await file.text());
    } catch (err) {
      toasts.show((err as Error).message || "Couldn't read that backup");
      return;
    }
    if (!confirm(restoreQuestion(backup))) return;
    app.restore(backup);
    toasts.show(`Restored ${app.logs.length} workouts`);
  }

  /** What restoring would replace: the backup's counts against this device's, with a warning for anything it empties. */
  function restoreQuestion(b: Backup): string {
    const rows: [string, number, number][] = [
      ['Workouts', b.logs.length, app.logs.length],
      ['Activities', b.collections.activities.length, app.activities.length],
      ['Weigh-ins', b.collections.bodyweights.length, app.bodyweights.length],
      ['Saved workouts', b.collections.templates.length, app.templates.length],
    ];
    const lines = rows.map(([name, backup, device]) => `${name}: ${backup} in backup, ${device} on this device`);
    const emptied = rows.filter(([, backup, device]) => backup === 0 && device > 0).map(([name, , device]) => `${device} ${name.toLowerCase()}`);
    return [
      'Replace everything on this device with this backup?',
      '',
      ...lines,
      ...(emptied.length ? ['', `The backup has none of these, so restoring deletes: ${emptied.join(', ')}.`] : []),
      '',
      'Your current workouts and settings will be overwritten.',
    ].join('\n');
  }

  function erase() {
    if (!confirm('Erase all Forge data on this device? This removes every workout and setting and cannot be undone.')) return;
    app.eraseAll();
  }
</script>

<div class="screen">
  <BackBar title="Data" />

  <div class="section">
    <div class="head">Backup</div>
    <div class="list">
      <div class="item">Last backup<span class="value">{lastBackup}</span></div>
      <button class="item link" onclick={exportBackup}><Download size={18} /> Export Backup</button>
      <button class="item link" onclick={() => backupInput?.click()}><Upload size={18} /> Restore from Backup</button>
    </div>
    <div class="foot">Forge keeps your data only in this browser on this device. Export a backup now and then (to Files or iCloud Drive) so a cleared browser or a new phone doesn't lose your history.</div>
    <input type="file" accept="application/json,.json" hidden bind:this={backupInput} onchange={pickBackup} />
  </div>

  <div class="section">
    <div class="head">Import Workout History</div>
    <div class="list">
      <div class="item sub muted">Export your history from Fitbod (Settings → Export Workout Data), Strong or Hevy, then pick the CSV file here.</div>
      <div class="item">
        <span class="grow">Weights in file</span>
        <div class="segmented" style="width:180px" role="radiogroup" aria-label="Weights in file">
          <button role="radio" aria-checked={pounds} class:on={pounds} onclick={() => { pounds = true; reparse(); }}>Pounds</button>
          <button role="radio" aria-checked={!pounds} class:on={!pounds} onclick={() => { pounds = false; reparse(); }}>Kilograms</button>
        </div>
      </div>
      <button class="item link" onclick={() => csvInput?.click()}><FileUp size={18} /> Choose CSV File</button>
    </div>
    <div class="foot">The unit is only used when the file doesn't say (Fitbod and Hevy files do).</div>
    <input type="file" accept=".csv,text/csv,text/plain" hidden bind:this={csvInput} onchange={pickCSV} />
  </div>

  {#if error}
    <div class="section"><div class="list"><div class="item" style="color:var(--fatigued)"><TriangleAlert size={18} /> {error}</div></div></div>
  {/if}

  {#if result}
    <div class="section">
      <div class="head">Found</div>
      <div class="list">
        <div class="item">Workouts<span class="value">{result.workouts.length}</span></div>
        <div class="item">Sets<span class="value">{importSetCount(result)}</span></div>
        {#if result.workouts.length}
          <div class="item">Dates<span class="value">{fmtDate(result.workouts[0].date, { dateStyle: 'medium' })} – {fmtDate(result.workouts[result.workouts.length - 1].date, { dateStyle: 'medium' })}</span></div>
        {/if}
        {#if imported === null && newSets < importSetCount(result)}
          <div class="item">Already logged<span class="value">{importSetCount(result) - newSets} sets skipped</span></div>
        {/if}
        {#if result.badDates}
          <div class="item" style="color:var(--recovering)">Unreadable or future dates<span class="value">{result.badDates} rows skipped</span></div>
        {/if}
        {#if result.badWeights}
          <div class="item" style="color:var(--recovering)">Unreadable weights<span class="value">{result.badWeights} sets with no weight</span></div>
        {/if}
      </div>
    </div>

    {#if Object.keys(result.unmatched).length}
      {@const unmatched = Object.entries(result.unmatched).sort((a, b) => b[1] - a[1])}
      <div class="section">
        <div class="head">Not recognized ({unmatched.length})</div>
        <div class="list">
          {#each unmatched as [name, count] (name)}
            <div class="item">
              <span class="grow">{name}<br /><span class="caption muted">{count} sets skipped</span></span>
              <ActionMenu label="Fix {name}" class="link sub bold" items={[
                { label: 'Match to an Exercise…', action: () => (matching = name) },
                { label: 'Create as Custom Exercise', action: () => (creatingFrom = name) },
              ]}>Fix</ActionMenu>
            </div>
          {/each}
        </div>
        <div class="foot">Match each name to an exercise, or create it, to include those sets. Anything left here is skipped; you can fix it and import again later, and only the new sets are added.</div>
      </div>
    {/if}

    <div class="section">
      <div class="list">
        {#if imported !== null}
          <div class="item" style="color:var(--fresh)"><CircleCheck size={18} /> Imported {imported} workouts</div>
        {:else}
          <button class="item link bold" disabled={!newWorkouts.length} onclick={importNow}>Import {newWorkouts.length} Workouts</button>
        {/if}
      </div>
    </div>
  {/if}

  <div class="section">
    <div class="list"><button class="item" style="color:var(--fatigued)" onclick={erase}>Erase All Data</button></div>
  </div>
</div>

{#if matching}
  {@const name = matching}
  <ExercisePicker title="Match “{name}”" exercises={Catalog.all} onpick={(e) => match(name, e)} onclose={() => (matching = null)} />
{/if}
{#if creatingFrom}
  {@const name = creatingFrom}
  <CustomExerciseEditor initialName={name} onsave={(e) => match(name, e)} onclose={() => (creatingFrom = null)} />
{/if}
