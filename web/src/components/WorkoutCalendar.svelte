<script lang="ts">
  import { ChevronLeft, ChevronRight, Dumbbell, HeartPulse } from '@lucide/svelte';
  import ActionMenu from './ActionMenu.svelte';
  import { deleteLog, logSummary, logTitle } from '../lib/logs';
  import { clock, currentTime } from '../lib/clock.svelte';
  import { nav } from '../lib/nav.svelte';
  import { type WorkoutLog, app } from '../lib/store.svelte';
  import { dayKey } from '../lib/units';
  import { type Activity, activityTitle } from '../lib/activities';
  import { toasts } from '../lib/toasts.svelte';

  /** Month grid with workout days marked; tapping a day lists what was done. */
  const startOfMonth = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
  const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

  let month = $state(startOfMonth(Date.now()));
  let selected = $state(startOfDay(Date.now()));

  const byDay = $derived.by(() => {
    const m = new Map<string, WorkoutLog[]>();
    for (const l of app.logs) { const k = dayKey(l.date); m.set(k, [...(m.get(k) ?? []), l]); }
    return m;
  });
  const activitiesByDay = $derived.by(() => {
    const m = new Map<string, Activity[]>();
    for (const a of app.activities) { const k = dayKey(a.date); m.set(k, [...(m.get(k) ?? []), a]); }
    return m;
  });
  const monthDate = $derived(new Date(month));
  const days = $derived.by(() => {
    const n = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => new Date(monthDate.getFullYear(), monthDate.getMonth(), i + 1).getTime());
  });
  // Weeks start on Monday.
  const leading = $derived((monthDate.getDay() + 6) % 7);
  const count = $derived(days.reduce((t, d) => t + (byDay.get(dayKey(d))?.length ?? 0), 0));
  const isCurrentMonth = $derived(month === startOfMonth(currentTime()));
  const today = $derived(clock.today);
  const selectedLogs = $derived(byDay.get(dayKey(selected)) ?? []);
  const selectedActivities = $derived(activitiesByDay.get(dayKey(selected)) ?? []);

  function removeActivity(a: Activity) {
    app.removeActivity(a.id);
    toasts.show(`${activityTitle[a.kind]} deleted`, () => app.addActivity(a));
  }

  function shift(delta: number) {
    const d = new Date(month);
    month = new Date(d.getFullYear(), d.getMonth() + delta, 1).getTime();
    // Keep the selection in view: today in the current month, else the 1st.
    selected = month === startOfMonth(Date.now()) ? today : month;
  }
</script>

<div class="card stack" style="--gap:14px">
  <div class="row">
    <div class="grow">
      <div class="month">{monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
      <div class="caption muted">{count === 1 ? '1 workout' : `${count} workouts`}</div>
    </div>
    <button class="icon-btn plain" aria-label="Previous month" onclick={() => shift(-1)}><ChevronLeft /></button>
    <button class="icon-btn plain" aria-label="Next month" disabled={isCurrentMonth} onclick={() => shift(1)}><ChevronRight /></button>
  </div>
  <div class="grid">
    {#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as s, i (i)}<span class="eyebrow" aria-hidden="true">{s}</span>{/each}
    {#each Array(leading) as _, i (i)}<span></span>{/each}
    {#each days as d (d)}
      {@const trained = byDay.has(dayKey(d))}
      {@const cardio = activitiesByDay.has(dayKey(d))}
      <button class="day mono" class:trained class:cardio class:today={d === today} class:sel={d === selected} disabled={d > currentTime()}
        aria-label="{new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}{trained ? ', trained' : ''}{cardio ? ', cardio' : ''}"
        aria-pressed={d === selected} onclick={() => (selected = d)}>{new Date(d).getDate()}</button>
    {/each}
  </div>
  <div class="divider"></div>
  <div class="sub bold">{new Date(selected).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
  {#if !selectedLogs.length && !selectedActivities.length}
    <div class="sub muted">{selected === today ? 'Nothing logged yet today.' : 'Rest day.'}</div>
  {:else}
    {#each selectedLogs as log (log.id)}
      <div class="row">
        <button class="row grow" style="text-align:left" onclick={() => nav.push({ name: 'log', id: log.id })}>
          <span class="ico"><Dumbbell size={18} /></span>
          <span class="grow"><span class="sub bold">{logTitle(log)}</span><br /><span class="caption muted">{logSummary(log, app.units)}</span></span>
          <ChevronRight size={16} color="var(--muted)" />
        </button>
        <ActionMenu label="{logTitle(log)} options" items={[{ label: 'Delete Workout', danger: true, action: () => deleteLog(log) }]}>⋯</ActionMenu>
      </div>
    {/each}
  {/if}
  {#each selectedActivities as a (a.id)}
    <div class="row">
      <span class="ico cardio-ico"><HeartPulse size={18} /></span>
      <span class="grow"><span class="sub bold">{activityTitle[a.kind]}</span><br /><span class="caption muted">{a.minutes} min · counts toward recovery</span></span>
      <ActionMenu label="{activityTitle[a.kind]} options" items={[{ label: 'Delete Activity', danger: true, action: () => removeActivity(a) }]}>⋯</ActionMenu>
    </div>
  {/each}
</div>

<style>
  .month { font-family: var(--font-display); font-stretch: 112%; font-weight: 750; font-size: 1.05rem; }
  .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px 2px; text-align: center; align-items: center; }
  .day { width: 38px; height: 38px; border-radius: 12px; margin: 0 auto; font-size: 0.88rem; font-weight: 550; border: 1px solid transparent; color: var(--text-2); }
  .day:disabled { opacity: 0.25; }
  .day.trained { background: var(--ember-gradient); color: var(--on-ember); font-weight: 750; box-shadow: 0 6px 16px -6px var(--ember-glow); }
  .day { position: relative; }
  .day.cardio::after { content: ''; position: absolute; left: 50%; bottom: 4px; width: 5px; height: 5px; margin-left: -2.5px; border-radius: 50%;
    background: #6fa2ff; box-shadow: 0 0 6px rgba(111, 162, 255, 0.8); }
  .day.trained.cardio::after { background: #fff; }
  .day.today { border-color: rgba(255, 106, 46, 0.7); color: var(--text); font-weight: 750; }
  .day.sel { outline: 2px solid #fff; outline-offset: 2px; }
  .cardio-ico { background: rgba(111, 162, 255, 0.16) !important; color: #8db4ff !important; }
  .ico { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: var(--ember-soft); color: var(--ember-2); flex: none; }
</style>
