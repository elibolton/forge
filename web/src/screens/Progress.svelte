<script lang="ts">
  import { Catalog, MUSCLES, type Muscle, Planner, computeRecovery, muscleName, oneRM, workingSets } from '../engine';
  import { ChevronRight, List } from '@lucide/svelte';
  import ExerciseThumb from '../components/ExerciseThumb.svelte';
  import LineChart from '../components/LineChart.svelte';
  import MuscleTile from '../components/MuscleTile.svelte';
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

<div class="screen stack" style="--gap:24px">
  <h1 class="display" style="font-size:2rem;margin-top:12px">Progress</h1>

  <div class="stats">
    {@render stat(daysSinceLast === null ? '–' : `${daysSinceLast}`, daysSinceLast === 1 ? 'day since your last workout' : 'days since your last workout', 'var(--accent)')}
    {@render stat(`${fresh.length}`, fresh.length === 1 ? 'fresh muscle group' : 'fresh muscle groups', 'var(--fresh)')}
    {@render stat(`${thisWeek}`, 'workouts this week', 'var(--text)')}
    {@render stat(`${streak}`, streak === 1 ? 'week streak' : 'weeks streak', 'var(--recovering)')}
  </div>

  <section class="stack" style="--gap:10px">
    <h2 class="h">Calendar</h2>
    <WorkoutCalendar />
    <button class="card tight row sub semibold" onclick={() => nav.push({ name: 'history' })}>
      <List size={18} /> <span class="grow" style="text-align:left">All Workouts</span> <span class="muted">{app.logs.length}</span> <ChevronRight size={16} color="var(--muted)" />
    </button>
  </section>

  <section class="stack" style="--gap:10px">
    <h2 class="h">Muscle Recovery</h2>
    <div class="tiles">
      {#each [...MUSCLES].sort((a, b) => (recovery[a] ?? 1) - (recovery[b] ?? 1)) as m (m)}
        <MuscleTile muscle={m} value={recovery[m] ?? 1} fill onclick={() => openAdjust(m)} />
      {/each}
    </div>
    <p class="caption muted">Tap a muscle if it feels more or less sore than shown.</p>
  </section>

  <section class="stack" style="--gap:10px">
    <h2 class="h">Sets This Week</h2>
    <div class="card stack">
      {#if !trained.length}<span class="muted">No sets logged this week yet.</span>{/if}
      {#each trained as m (m)}
        {@const sets = weekly[m] ?? 0}
        <div class="row" role="group" aria-label="{muscleName(m)}, {Math.round(sets)} of {planner.weeklySetTarget} sets">
          <span class="sub name" aria-hidden="true">{muscleName(m)}</span>
          <span class="bar" aria-hidden="true"><i style="width:{Math.min(1, sets / planner.weeklySetTarget) * 100}%"></i></span>
          <span class="sub bold mono" style="width:28px;text-align:right" aria-hidden="true">{Math.round(sets)}</span>
        </div>
      {/each}
    </div>
    <p class="caption muted">Target {planner.weeklySetTarget} working sets per muscle.</p>
  </section>

  <section class="stack" style="--gap:10px">
    <h2 class="h">Strength</h2>
    <div class="card stack" style="--gap:16px">
      {#if !series.length}
        <p class="sub muted">Log squat, bench, deadlift or overhead press to see your estimated 1RM trend.</p>
      {:else}
        <LineChart {series} unit={app.units.symbol} label="Estimated one rep max trend" />
      {/if}
      {#each BENCHMARKS as id (id)}
        {@const e = Catalog.exercise(id)}
        <button class="row" onclick={() => nav.push({ name: 'exercise', id })}>
          <ExerciseThumb exercise={e} size={40} />
          <span class="sub semibold grow" style="text-align:left">{e.name}</span>
          <span class="sub bold mono">{best(id) ? app.units.format(best(id)) : '–'}</span>
          <ChevronRight size={16} color="var(--muted)" />
        </button>
      {/each}
    </div>
  </section>
</div>

{#snippet stat(value: string, label: string, color: string)}
  <div class="card tight stack" style="--gap:4px">
    <span class="display mono" style="font-size:2.1rem;color:{color}">{value}</span>
    <span class="kicker muted">{label.toUpperCase()}</span>
  </div>
{/snippet}

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
  .h { font-size: 1.25rem; font-weight: 700; }
  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(98px, 1fr)); gap: 10px; }
  .name { width: 96px; flex: none; }
  .bar { flex: 1; height: 8px; border-radius: 4px; background: var(--raised); overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--accent); border-radius: 4px; }
</style>
