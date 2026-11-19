<script lang="ts">
  import { ChevronLeft, ChevronRight, Dumbbell } from '@lucide/svelte';
  import ActionMenu from './ActionMenu.svelte';
  import { deleteLog, logSummary, logTitle } from '../lib/logs';
  import { nav } from '../lib/nav.svelte';
  import { type WorkoutLog, app } from '../lib/store.svelte';
  import { dayKey } from '../lib/units';

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
  const monthDate = $derived(new Date(month));
  const days = $derived.by(() => {
    const n = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => new Date(monthDate.getFullYear(), monthDate.getMonth(), i + 1).getTime());
  });
  // Weeks start on Monday.
  const leading = $derived((monthDate.getDay() + 6) % 7);
  const count = $derived(days.reduce((t, d) => t + (byDay.get(dayKey(d))?.length ?? 0), 0));
  const isCurrentMonth = $derived(month === startOfMonth(Date.now()));
  const today = startOfDay(Date.now());
  const selectedLogs = $derived(byDay.get(dayKey(selected)) ?? []);

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
      <div class="bold">{monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
      <div class="caption muted">{count === 1 ? '1 workout' : `${count} workouts`}</div>
    </div>
    <button class="icon-btn" aria-label="Previous month" onclick={() => shift(-1)}><ChevronLeft /></button>
    <button class="icon-btn" aria-label="Next month" disabled={isCurrentMonth} onclick={() => shift(1)}><ChevronRight /></button>
  </div>
  <div class="grid">
    {#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as s, i (i)}<span class="caption bold muted" aria-hidden="true">{s}</span>{/each}
    {#each Array(leading) as _, i (i)}<span></span>{/each}
    {#each days as d (d)}
      {@const trained = byDay.has(dayKey(d))}
      <button class="day mono" class:trained class:today={d === today} class:sel={d === selected} disabled={d > Date.now()}
        aria-label="{new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}{trained ? ', trained' : ''}"
        aria-pressed={d === selected} onclick={() => (selected = d)}>{new Date(d).getDate()}</button>
    {/each}
  </div>
  <div class="divider"></div>
  <div class="sub bold">{new Date(selected).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
  {#if !selectedLogs.length}
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
</div>

<style>
  .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px 4px; text-align: center; align-items: center; }
  .day { width: 36px; height: 36px; border-radius: 50%; margin: 0 auto; font-size: 0.92rem; border: 2px solid transparent; }
  .day:disabled { opacity: 0.35; }
  .day.trained { background: var(--accent); color: #fff; font-weight: 700; }
  .day.today { border-color: var(--accent); font-weight: 700; }
  .day.sel { border-color: #fff; }
  .ico { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: rgba(255, 107, 46, 0.18); color: var(--accent); flex: none; }
</style>
