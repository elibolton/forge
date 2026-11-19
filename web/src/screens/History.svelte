<script lang="ts">
  import { Catalog } from '../engine';
  import { Search, Trophy } from '@lucide/svelte';
  import ActionMenu from '../components/ActionMenu.svelte';
  import BackBar from '../components/BackBar.svelte';
  import { deleteLog, fmtDate, logSummary, logTitle } from '../lib/logs';
  import { nav } from '../lib/nav.svelte';
  import { type WorkoutLog, app } from '../lib/store.svelte';

  /** Every workout, searchable by exercise and filterable by where it came from, grouped by month. */
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

  /** Which exercises matched the search, to show why a workout is listed. */
  function matches(l: WorkoutLog): string[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return l.exercises.map((e) => Catalog.exercise(e.exerciseID).name).filter((n) => n.toLowerCase().includes(q));
  }
</script>

<div class="screen">
  <BackBar title="All Workouts" />
  {#if !app.logs.length}
    <p class="muted" style="text-align:center;padding:25vh 0 0">No workouts yet. Finished workouts show up here.</p>
  {:else}
    <div class="stack" style="--gap:10px;margin-top:10px">
      <label class="search">
        <Search size={17} color="var(--text-3)" />
        <input type="search" placeholder="Search by exercise" bind:value={query} aria-label="Search workouts by exercise" />
      </label>
      <div class="row" style="--gap:6px;overflow-x:auto">
        {#each [['all', 'All'], ['program', 'Program'], ['generated', 'Generated'], ['imported', 'Imported']] as [k, label] (k)}
          <button class="chip" class:on={kind === k} aria-pressed={kind === k} onclick={() => { kind = k as Kind; shown = 60; }}>{label}</button>
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
                <div class="row between" style="--gap:8px">
                  <span class="bold row" style="--gap:6px">{logTitle(log)}{#if prLogs.has(log.id)}<Trophy size={13} color="var(--recovering)" aria-label="Set a record" />{/if}</span>
                  <span class="sub muted">{fmtDate(log.date, { weekday: 'short', day: 'numeric' })}</span>
                </div>
                <div class="sub muted">{logSummary(log, app.units)}</div>
                {#if hits.length}<div class="caption accent one-line">{hits.join(' · ')}</div>{/if}
              </button>
              <ActionMenu label="{logTitle(log)} options" items={[{ label: 'Delete Workout', danger: true, action: () => deleteLog(log) }]}>⋯</ActionMenu>
            </div>
          {/each}
        </div>
      </div>
    {/each}
    {#if !filtered.length}<p class="muted" style="text-align:center;padding:40px 0">No workouts match.</p>{/if}
    {#if shown < filtered.length}<button class="btn block" style="margin-top:16px" onclick={() => (shown += 60)}>Show more</button>{/if}
  {/if}
</div>

<style>
  .search { display: flex; align-items: center; gap: 10px; padding: 0 14px; border-radius: 14px; background: var(--surface-2); border: 1px solid var(--hairline); }
  .search input { background: transparent; border: 0; padding-left: 0; }
</style>
