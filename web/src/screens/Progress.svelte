<script lang="ts">
  import { Catalog, MUSCLES, type Muscle, Planner, computeRecovery, muscleName, oneRM, workingSets } from '../engine';
  import { ChevronRight } from '@lucide/svelte';
  import ExerciseThumb from '../components/ExerciseThumb.svelte';
  import LineChart from '../components/LineChart.svelte';
  import BodyMap from '../components/BodyMap.svelte';
  import RecoveryRing from '../components/RecoveryRing.svelte';
  import Sheet from '../components/Sheet.svelte';
  import WorkoutCalendar from '../components/WorkoutCalendar.svelte';
  import { nav } from '../lib/nav.svelte';
  import { app } from '../lib/store.svelte';

  const BENCHMARKS = ['bb-squat', 'bb-bench', 'bb-deadlift', 'bb-ohp'];

  let adjusting = $state<Muscle | null>(null);
  let adjustValue = $state(1);

  const planner = $derived(app.planner());
  const recovery = $derived(computeRecovery({ history: app.records, overrides: app.profile!.overrides, now: Date.now() }));
  const weekly = $derived(planner.weeklySets());
  const fresh = $derived(Planner.freshGroupNames(recovery));

  const DAY = 86_400_000;
  const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  /** Monday 00:00 of the week containing t. */
  const weekStart = (t: number) => { const d = new Date(startOfDay(t)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };

  const daysSinceLast = $derived(app.logs[0] ? Math.round((startOfDay(Date.now()) - startOfDay(app.logs[0].date)) / DAY) : null);
  const thisWeek = $derived(app.logs.filter((l) => l.date >= weekStart(Date.now())).length);
  /** Consecutive weeks (including this one or last) with at least one workout. */
  const streak = $derived.by(() => {
    const weeks = new Set(app.logs.map((l) => weekStart(l.date)));
    let week = weekStart(Date.now());
    if (!weeks.has(week)) week = weekStart(week - 3 * DAY);
    let n = 0;
    while (weeks.has(week)) { n++; week = weekStart(week - 3 * DAY); }
    return n;
  });

  /** Workouts in each of the last 8 weeks, oldest first. */
  const weeksBars = $derived.by(() => {
    const start = weekStart(Date.now());
    return Array.from({ length: 8 }, (_, i) => {
      const from = weekStart(start - (7 - i) * 7 * DAY + DAY), to = from + 7 * DAY;
      return app.logs.filter((l) => l.date >= from && l.date < to).length;
    });
  });
  const maxBar = $derived(Math.max(3, ...weeksBars));
  const overall = $derived(MUSCLES.reduce((t, m) => t + (recovery[m] ?? 1), 0) / MUSCLES.length);

  const best = (id: string) => app.derivedHistory.bestOneRM.get(id);
  const series = $derived(BENCHMARKS.map((id) => ({
    name: Catalog.exercise(id).name,
    points: (app.derivedHistory.sessions.get(id) ?? []).flatMap((s) => {
      const v = workingSets(s.logged).filter((x) => x.weight > 0).map((x) => oneRM(x.weight, x.reps, x.rir));
      return v.length ? [{ x: s.date, y: app.units.display(Math.max(...v)) }] : [];
    }),
  })).filter((s) => s.points.length));

  const trained = $derived(MUSCLES.filter((m) => (weekly[m] ?? 0) > 0).sort((a, b) => weekly[b]! - weekly[a]!));

  function openAdjust(m: Muscle) { adjusting = m; adjustValue = recovery[m] ?? 1; }
  function saveAdjust() {
    const m = adjusting!;
    app.updateProfile((p) => { p.overrides = [...p.overrides.filter((o) => o.muscle !== m), { muscle: m, recovery: adjustValue, date: Date.now() }]; });
    adjusting = null;
  }
</script>

<div class="screen stack" style="--gap:26px">
  <header class="stack" style="--gap:6px;padding-top:6px">
    <span class="eyebrow">Your training</span>
    <h1 class="page-title">Progress</h1>
  </header>

  <div class="bento">
    <div class="tile streak">
      <span class="eyebrow">Week streak</span>
      <span class="num huge gradient-text">{streak}</span>
      <div class="bars" aria-label="Workouts per week, last 8 weeks">
        {#each weeksBars as n, i (i)}<i class:now={i === 7} style="height:{Math.max(6, (n / maxBar) * 100)}%" title="{n} workouts"></i>{/each}
      </div>
      <span class="caption faint">{streak === 1 ? 'week' : 'weeks'} in a row with a workout</span>
    </div>
    <div class="tile">
      <span class="eyebrow">This week</span>
      <span class="num big">{thisWeek}</span>
      <span class="caption faint">{thisWeek === 1 ? 'workout' : 'workouts'}</span>
    </div>
    <div class="tile">
      <span class="eyebrow">Last workout</span>
      <span class="num big">{daysSinceLast === null ? '–' : daysSinceLast === 0 ? 'Today' : daysSinceLast}</span>
      <span class="caption faint">{daysSinceLast === null ? 'none yet' : daysSinceLast === 0 ? 'nice work' : daysSinceLast === 1 ? 'day ago' : 'days ago'}</span>
    </div>
  </div>

  <section class="card stack" style="--gap:14px">
    <div class="row between" style="align-items:flex-end">
      <div class="stack" style="--gap:6px">
        <span class="eyebrow">Recovery</span>
        <span class="num big" style="color:var(--{overall >= 0.8 ? 'fresh' : overall >= 0.5 ? 'recovering' : 'fatigued'})">{Math.round(overall * 100)}<span class="pct">%</span></span>
      </div>
      <div class="caption muted" style="text-align:right">{fresh.length} of 6 muscle groups<br />fresh and ready</div>
    </div>
    <div class="figure"><BodyMap {recovery} onpick={openAdjust} size={128} /></div>
    <p class="caption faint" style="text-align:center">Tap a muscle if it feels more or less sore than shown.</p>
  </section>

  <section class="stack" style="--gap:12px">
    <div class="row between head-row"><h2 class="eyebrow">Calendar</h2>
      <button class="link caption" onclick={() => nav.push({ name: 'history' })}>All {app.logs.length} workouts</button></div>
    <WorkoutCalendar />
  </section>

  <section class="stack" style="--gap:12px">
    <div class="row between head-row"><h2 class="eyebrow">Sets this week</h2><span class="caption faint">Target {planner.weeklySetTarget} per muscle</span></div>
    <div class="card stack" style="--gap:14px">
      {#if !trained.length}<span class="sub muted">No sets logged this week yet.</span>{/if}
      {#each trained as m (m)}
        {@const sets = weekly[m] ?? 0}
        {@const pct = Math.min(1, sets / planner.weeklySetTarget)}
        <div class="vol" role="group" aria-label="{muscleName(m)}, {Math.round(sets)} of {planner.weeklySetTarget} sets">
          <span class="sub" aria-hidden="true">{muscleName(m)}</span>
          <span class="track" aria-hidden="true"><i style="width:{pct * 100}%" class:full={pct >= 1}></i></span>
          <span class="num sub" aria-hidden="true">{Math.round(sets)}</span>
        </div>
      {/each}
    </div>
  </section>

  <section class="stack" style="--gap:12px">
    <div class="row between head-row"><h2 class="eyebrow">Strength</h2><span class="caption faint">Estimated 1RM</span></div>
    <div class="card stack" style="--gap:6px">
      {#if !series.length}
        <p class="sub muted" style="padding-bottom:8px">Log squat, bench, deadlift or overhead press to see your estimated 1RM trend.</p>
      {:else}
        <LineChart {series} unit={app.units.symbol} label="Estimated one rep max trend" />
      {/if}
      {#each BENCHMARKS as id (id)}
        {@const e = Catalog.exercise(id)}
        <button class="lift row" onclick={() => nav.push({ name: 'exercise', id })}>
          <ExerciseThumb exercise={e} size={38} />
          <span class="sub semibold grow" style="text-align:left">{e.name}</span>
          <span class="num">{best(id) ? app.units.format(best(id)) : '–'}</span>
          <ChevronRight size={16} color="var(--text-3)" />
        </button>
      {/each}
    </div>
  </section>
</div>

{#if adjusting}
  <Sheet title={muscleName(adjusting)} onclose={() => (adjusting = null)}>
    {#snippet trailing()}<button class="link bold" onclick={saveAdjust}>Save</button>{/snippet}
    <div class="stack" style="--gap:28px;align-items:center;padding:16px 0 24px">
      <RecoveryRing value={adjustValue} size={140} width={12} />
      <input type="range" min="0" max="1" step="0.05" bind:value={adjustValue} aria-label="Recovery"
        aria-valuetext="{Math.round(adjustValue * 100)} percent recovered" />
      <div class="row between caption muted" style="width:100%"><span>Very sore</span><span>Fresh</span></div>
    </div>
  </Sheet>
{/if}

<style>
  .bento { display: grid; grid-template-columns: 1.25fr 1fr; grid-template-rows: auto auto; gap: 10px; }
  .tile { display: flex; flex-direction: column; gap: 6px; padding: 16px; border-radius: var(--r-lg); border: 1px solid var(--hairline);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02)); }
  .streak { grid-row: span 2; background: radial-gradient(90% 60% at 100% 0%, rgba(255, 90, 31, 0.22), transparent 70%), linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02)); }
  .huge { font-size: 3.6rem; font-stretch: 125%; font-weight: 800; line-height: 0.95; }
  .big { font-size: 2.1rem; font-stretch: 125%; font-weight: 800; line-height: 1; }
  .pct { font-size: 1rem; opacity: 0.7; margin-left: 2px; }
  .bars { display: flex; align-items: flex-end; gap: 4px; flex: 1; min-height: 54px; margin: 8px 0 4px; }
  .bars i { flex: 1; border-radius: 3px; background: rgba(255, 255, 255, 0.12); }
  .bars i.now { background: var(--ember-gradient); box-shadow: 0 0 12px var(--ember-glow); }
  .figure { padding: 8px 0; background: radial-gradient(55% 60% at 50% 45%, rgba(255, 255, 255, 0.04), transparent 70%); }
  .head-row { padding: 0 4px; }
  .vol { display: grid; grid-template-columns: 92px 1fr 26px; align-items: center; gap: 12px; }
  .vol .num { text-align: right; }
  .track { height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; }
  .track i { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, rgba(255, 90, 31, 0.6), var(--ember-2)); }
  .track i.full { background: linear-gradient(90deg, rgba(60, 239, 176, 0.6), var(--fresh)); }
  .lift { padding: 10px 0; border-top: 1px solid var(--hairline); }
  .lift:first-of-type { border-top: 0; }
  .lift:active { transform: none; opacity: 0.7; }
</style>
