<script lang="ts">
  import { Catalog } from '../engine';
  import { Ellipsis, Search, Trophy } from '@lucide/svelte';
  import ActionMenu from '../components/ActionMenu.svelte';
  import BackBar from '../components/BackBar.svelte';
  import SaveTemplateSheet from '../components/SaveTemplateSheet.svelte';
  import { deleteLog, fmtDate, logTitle } from '../lib/logs';
  import { logDateText, logStats } from '../lib/logFormat';
  import { addMobility } from '../lib/mobility';
  import { session } from '../lib/session.svelte';
  import { sessionFromLog } from '../lib/templateStart';
  import { templateFromLogged } from '../lib/templates';
  import { nav } from '../lib/nav.svelte';
  import { type WorkoutLog, app } from '../lib/store.svelte';

  /** Every workout, newest first: searchable by exercise, filterable by where it came from, grouped by month. */
  type Kind = 'all' | 'program' | 'generated' | 'imported';
  let query = $state('');
  let kind = $state<Kind>('all');
  let shown = $state(60);

  const kindOf = (l: WorkoutLog): Kind => (l.program ? 'program' : l.durationSeconds === 0 && !l.focus ? 'imported' : 'generated');
  const prLogs = $derived(new Set(app.prEvents.map((p) => p.logID)));

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return app.logs.filter((l) =>
      (kind === 'all' || kindOf(l) === kind) &&
      (!q || logTitle(l).toLowerCase().includes(q) || l.exercises.some((e) => Catalog.exercise(e.exerciseID).name.toLowerCase().includes(q))));
  });

  const groups = $derived.by(() => {
    const out: { month: string; logs: WorkoutLog[] }[] = [];
    for (const l of filtered.slice(0, shown)) {
      const month = fmtDate(l.date, { month: 'long', year: 'numeric' });
      if (out[out.length - 1]?.month !== month) out.push({ month, logs: [] });
      out[out.length - 1].logs.push(l);
    }
    return out;
  });

  let savingFrom = $state<WorkoutLog | null>(null);

  /** Does a past workout again: same exercises, sets and reps, weights from your latest numbers. */
  function repeat(l: WorkoutLog) {
    if (!session.okToReplace()) return;
    const state = sessionFromLog(l, logTitle(l), app.planner());
    if (!state.exercises.length) return;
    addMobility(state, [...new Set(state.exercises.flatMap((x) => Catalog.exercise(x.exerciseID).primary))], app.profile!.mobility);
    session.startPrepared(state, true);
  }

  /** Which exercises matched the search, to show why a workout is listed. */
  function matches(l: WorkoutLog): string[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return l.exercises.map((e) => Catalog.exercise(e.exerciseID).name).filter((n) => n.toLowerCase().includes(q));
  }
</script>

<div class="screen">
  <BackBar title="History" />
  {#if !app.logs.length}
    <p class="muted" style="text-align:center;padding:25vh 0 0">No workouts yet. Finished workouts show up here.</p>
  {:else}
    <div class="stack" style="--gap:10px;margin-top:10px">
      <label class="search">
        <Search size={17} color="var(--text-3)" />
        <input type="search" placeholder="Search by exercise" bind:value={query} aria-label="Search workouts by exercise" />
      </label>
      <div class="row" style="--gap:6px;overflow-x:auto" role="radiogroup" aria-label="Show">
        {#each [['all', 'All'], ['program', 'Program'], ['generated', 'Generated'], ['imported', 'Imported']] as [k, label] (k)}
          <button class="chip" class:on={kind === k} role="radio" aria-checked={kind === k} onclick={() => { kind = k as Kind; shown = 60; }}>{label}</button>
        {/each}
      </div>
      <p class="caption faint" aria-live="polite">{filtered.length} {filtered.length === 1 ? 'workout' : 'workouts'}</p>
    </div>

    {#each groups as g (g.month)}
      <div class="section" style="margin-top:18px">
        <div class="head">{g.month}</div>
        <div class="list">
          {#each g.logs as log (log.id)}
            {@const hits = matches(log)}
            <div class="item">
              <button class="grow" style="text-align:left" onclick={() => nav.push({ name: 'log', id: log.id })}>
                <span class="bold row" style="--gap:6px">{logTitle(log)}{#if prLogs.has(log.id)}<Trophy size={13} color="var(--recovering)" aria-label="Set a record" />{/if}</span>
                <div class="sub muted">{logDateText(log)}</div>
                <div class="caption faint">{logStats(log)}</div>
                {#if hits.length}<div class="caption accent one-line">{hits.join(' · ')}</div>{/if}
              </button>
              <ActionMenu label="{logTitle(log)} options" class="icon-btn plain" items={[
                { label: 'Repeat', action: () => repeat(log) },
                { label: 'Save as Workout', action: () => (savingFrom = log) },
                { label: 'Delete', danger: true, action: () => deleteLog(log) },
              ]}><Ellipsis size={18} /></ActionMenu>
            </div>
          {/each}
        </div>
      </div>
    {/each}
    {#if !filtered.length}<p class="muted" style="text-align:center;padding:40px 0">No workouts match.</p>{/if}
    {#if shown < filtered.length}<button class="btn block" style="margin-top:16px" onclick={() => (shown += 60)}>Show more</button>{/if}
  {/if}
</div>

{#if savingFrom}
  {@const l = savingFrom}
  <SaveTemplateSheet suggested={logTitle(l)} make={(n) => templateFromLogged(n, l.exercises)} onclose={() => (savingFrom = null)} />
{/if}

<style>
  .search { display: flex; align-items: center; gap: 10px; padding: 0 14px; border-radius: 14px; background: var(--surface-2); border: 1px solid var(--hairline); }
  .search input { background: transparent; border: 0; padding-left: 0; }
</style>
