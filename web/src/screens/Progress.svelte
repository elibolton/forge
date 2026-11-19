<script lang="ts">
  import { Catalog, MUSCLES, type Muscle, Planner, computeRecovery, muscleName, oneRM, workingSets } from '../engine';
  import { ChevronRight, Trophy } from '@lucide/svelte';
  import ExerciseThumb from '../components/ExerciseThumb.svelte';
  import LineChart from '../components/LineChart.svelte';
  import BodyMap from '../components/BodyMap.svelte';
  import Report from '../components/Report.svelte';
  import Bodyweight from '../components/Bodyweight.svelte';
  import RecoveryRing from '../components/RecoveryRing.svelte';
  import Sheet from '../components/Sheet.svelte';
  import WorkoutCalendar from '../components/WorkoutCalendar.svelte';
  import { nav } from '../lib/nav.svelte';
  import { currentTime } from '../lib/clock.svelte';
  import { app } from '../lib/store.svelte';
  import { goalStreak, weeklyCounts } from '../lib/weeks';
  import { count } from '../lib/labels';

  const BENCHMARKS = ['bb-squat', 'bb-bench', 'bb-deadlift', 'bb-ohp'];

  let adjusting = $state<Muscle | null>(null);
  let adjustValue = $state(1);

  const planner = $derived(app.planner());
  const recovery = $derived(computeRecovery({ history: app.records, external: app.external, overrides: app.profile!.overrides, now: Date.now() }));
  const weekly = $derived(planner.weeklySets());
  const fresh = $derived(Planner.freshGroupNames(recovery));

  const DAY = 86_400_000;
  const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  /** Monday 00:00 of the week containing t. */
  const weekStart = (t: number) => { const d = new Date(startOfDay(t)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };

  const daysSinceLast = $derived(app.logs[0] ? Math.round((startOfDay(currentTime()) - startOfDay(app.logs[0].date)) / DAY) : null);
  const thisWeek = $derived(app.logs.filter((l) => l.date >= weekStart(currentTime())).length);
  const goal = $derived(app.weeklyGoal);
  const dates = $derived(app.logs.map((l) => l.date));
  /** Consecutive weeks that hit the weekly goal. */
  const streak = $derived(goalStreak(dates, goal));
  /** Workouts in each of the last 8 weeks, oldest first. */
  const weeksBars = $derived(weeklyCounts(dates, 8));
  const maxBar = $derived(Math.max(goal + 1, ...weeksBars));
  const recentPRs = $derived(app.prEvents.slice(0, 5));
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
      <span class="eyebrow">Goal streak</span>
      <span class="num huge gradient-text">{streak}</span>
      <div class="bars" aria-label="Workouts per week, last 8 weeks">
        <span class="goal-line" style="bottom:{(goal / maxBar) * 100}%"></span>
        {#each weeksBars as n, i (i)}<i class:now={i === 7} class:hit={n >= goal} style="height:{Math.max(6, (n / maxBar) * 100)}%" title="{n} workouts"></i>{/each}
      </div>
      <span class="caption faint">{streak === 1 ? 'week' : 'weeks'} in a row hitting {count(goal, 'workout')}</span>
    </div>
    <div class="tile">
      <span class="eyebrow">This week</span>
      <span class="num big">{thisWeek}<span class="of" style="margin-left:4px">/ {goal}</span></span>
      <span class="caption" style="color:{thisWeek >= goal ? 'var(--fresh)' : 'var(--text-3)'}">{thisWeek >= goal ? 'goal met' : `${goal - thisWeek} to go`}</span>
    </div>
    <div class="tile">
      <span class="eyebrow">Last workout</span>
      <span class="num big">{daysSinceLast === null ? '–' : daysSinceLast === 0 ? 'Today' : daysSinceLast}</span>
      <span class="caption faint">{daysSinceLast === null ? 'none yet' : daysSinceLast === 0 ? 'nice work' : daysSinceLast === 1 ? 'day ago' : 'days ago'}</span>
    </div>
  </div>

  <Report />

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
      {#if app.logs.length}<button class="link caption all" onclick={() => nav.push({ name: 'history' })}>{app.logs.length === 1 ? 'See workout' : `All ${app.logs.length} workouts`}</button>{/if}</div>
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

  <Bodyweight />

  <section class="stack" style="--gap:12px">
    <div class="row between head-row"><h2 class="eyebrow">Strength</h2><span class="caption faint">Estimated 1RM</span></div>
    <div class="card stack" style="--gap:6px">
      {#if !series.length}
        <p class="sub muted" style="padding-bottom:8px">Log squat, bench, deadlift or overhead press to see your estimated 1RM trend: the most you could lift for one rep, worked out from your sets.</p>
      {:else}
        <LineChart {series} unit={app.units.symbol} label="Estimated one rep max trend" />
      {/if}
      {#each BENCHMARKS as id (id)}
        {@const e = Catalog.exercise(id)}
        <button class="lift row" onclick={() => nav.push({ name: 'exercise', id })}>
          <ExerciseThumb exercise={e} size={38} />
          <span class="sub semibold grow" style="text-align:left">{e.name}</span>
          <span class="num">{app.units.estimate(best(id))}</span>
          <ChevronRight size={16} color="var(--text-3)" />
        </button>
      {/each}
    </div>
  </section>

  {#if recentPRs.length}
    <section class="stack" style="--gap:12px">
      <div class="row between head-row"><h2 class="eyebrow">Recent records</h2><span class="caption faint">{app.prEvents.length} all time</span></div>
      <div class="card stack" style="--gap:0">
        {#each recentPRs as pr, i (i)}
          <button class="lift row" onclick={() => nav.push({ name: 'log', id: pr.logID })}>
            <span class="trophy"><Trophy size={16} /></span>
            <span class="grow stack" style="--gap:2px;text-align:left">
              <span class="sub semibold">{Catalog.exercise(pr.exerciseID).name}</span>
              <span class="caption faint">{new Date(pr.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · est. 1RM</span>
            </span>
            <span class="stack" style="--gap:2px;align-items:flex-end">
              <span class="num">{app.units.estimate(pr.oneRM)}</span>
              <span class="caption" style="color:var(--fresh)">+{app.units.estimate(pr.oneRM - pr.previous)}</span>
            </span>
          </button>
        {/each}
      </div>
    </section>
  {/if}
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
  .of { font-size: 1.1rem; color: var(--text-3); }
  .pct { font-size: 1rem; opacity: 0.7; margin-left: 2px; }
  .bars { position: relative; display: flex; align-items: flex-end; gap: 4px; flex: 1; min-height: 54px; margin: 8px 0 4px; }
  .bars i { flex: 1; border-radius: 3px; background: rgba(255, 255, 255, 0.12); }
  .bars i.hit { background: rgba(255, 166, 70, 0.55); }
  .goal-line { position: absolute; left: 0; right: 0; border-top: 1px dashed rgba(255, 255, 255, 0.35); pointer-events: none; }
  .bars i.now { background: var(--ember-gradient); box-shadow: 0 0 12px var(--ember-glow); }
  .figure { padding: 8px 0; background: radial-gradient(55% 60% at 50% 45%, rgba(255, 255, 255, 0.04), transparent 70%); }
  .head-row { padding: 0 4px; }
  /* A small text link, with a full-height tap area. */
  .all { min-height: 44px; margin: -12px 0; }
  .vol { display: grid; grid-template-columns: 92px 1fr 26px; align-items: center; gap: 12px; }
  .vol .num { text-align: right; }
  .track { height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; }
  .track i { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, rgba(255, 90, 31, 0.6), var(--ember-2)); }
  .track i.full { background: linear-gradient(90deg, rgba(60, 239, 176, 0.6), var(--fresh)); }
  .lift { padding: 10px 0; border-top: 1px solid var(--hairline); }
  .lift:first-of-type { border-top: 0; }
  .trophy { width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; color: var(--recovering); background: rgba(255, 187, 69, 0.14); flex: none; }
  .lift:active { transform: none; opacity: 0.7; }
</style>
