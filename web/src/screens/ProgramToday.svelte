<script lang="ts">
  import {
    type Exercise, type FatigueCheckIn, type WeekRule, Programs, checkInDue, nextDayID, programDay, rirText, rxExercise,
    scheduledOn, setsText, effortText, restText, skipDay,
  } from '../engine';
  import { BedDouble, Ellipsis, Flame, HeartPulse, Info, MoonStar, Play, TriangleAlert, ChevronRight } from '@lucide/svelte';
  import ActionMenu, { type MenuItem } from '../components/ActionMenu.svelte';
  import ExercisePicker from '../components/ExercisePicker.svelte';
  import ExerciseThumb from '../components/ExerciseThumb.svelte';
  import FatigueCheckInSheet from '../components/FatigueCheckInSheet.svelte';
  import TrainedCard from '../components/TrainedCard.svelte';
  import { nav } from '../lib/nav.svelte';
  import {
    type ProgramDayEdits, type ProgramDayItem, dayPlanMinutes, editsKey, loadEdits, makeDayPlan, saveEdits, startDayPlan,
  } from '../lib/plans';
  import { session } from '../lib/session.svelte';
  import { app } from '../lib/store.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { isSameDay } from '../lib/units';

  let { onUseGenerator }: { onUseGenerator: () => void } = $props();

  let replacing = $state<ProgramDayItem | null>(null);
  let checkInWeek = $state<number | null>(null);
  let trainOnRestDay = $state(false);

  const active = $derived(app.activeProgram!);
  // Re-reads day-of edits and history whenever either changes.
  const plan = $derived.by(() => { void app.kv; void app.logs; return makeDayPlan(active.program, active.progress); });
  const trainedToday = $derived(app.logs[0] && isSameDay(app.logs[0].date, Date.now()) ? app.logs[0] : undefined);
  const isRestDay = $derived(scheduledOn(active.program, new Date()) === null);
  const showRest = $derived(isRestDay && !trainedToday && !trainOnRestDay);
  const dueWeek = $derived(checkInDue(active.progress, active.program));

  function trainedDetail(): string {
    const ref = trainedToday?.program;
    const day = ref ? Programs.byID(ref.programID) && programDay(Programs.byID(ref.programID)!, ref.dayID) : undefined;
    return `${ref && day ? `Week ${ref.week} · ${day.title}. ` : ''}Recover well; here's what's next.`;
  }

  function start() {
    if (!plan) return;
    const { state, progress } = startDayPlan(plan);
    app.setProgramProgress(progress);
    session.startPrepared(state);
  }

  function skipToday() {
    const day = nextDayID(active.progress, active.program);
    if (!day) return;
    const before = structuredClone(active.progress);
    const p = structuredClone(active.progress);
    skipDay(p, day, active.program);
    app.setProgramProgress(p);
    toasts.show(`Skipped ${programDay(active.program, day)?.title ?? 'day'}`, () => app.setProgramProgress(before));
  }

  function editToday(change: (e: ProgramDayEdits) => void) {
    const day = nextDayID(active.progress, active.program);
    if (!day) return;
    const edits = structuredClone(loadEdits(editsKey(active.program.id, active.progress.week, day)));
    change(edits);
    saveEdits(edits);
  }

  const swap = (item: ProgramDayItem, e: Exercise) => editToday((x) => { x.swaps[item.prescription.slot.id] = e.id; });
  const restore = (slotID: string) => editToday((x) => { x.removed = x.removed.filter((r) => r !== slotID); delete x.swaps[slotID]; });

  function remove(item: ProgramDayItem) {
    const id = item.prescription.slot.id;
    editToday((x) => { if (!x.removed.includes(id)) x.removed.push(id); });
    toasts.show(`Skipping ${rxExercise(item.prescription).name} today`, () => restore(id));
  }

  function dropSet(item: ProgramDayItem) {
    const p = structuredClone(active.progress);
    p.setAdjustments[item.prescription.slot.id] = -1;
    app.setProgramProgress(p);
    toasts.show(`${rxExercise(item.prescription).name}: one set fewer from now on`, () => restoreSets(item));
  }

  function restoreSets(item: ProgramDayItem) {
    const p = structuredClone(app.profile!.programProgress!);
    delete p.setAdjustments[item.prescription.slot.id];
    app.setProgramProgress(p);
  }

  function saveCheckIn(c: FatigueCheckIn, week: number) {
    const p = structuredClone(active.progress);
    p.checkIns[week] = c;
    app.setProgramProgress(p);
  }

  function chips(rule: WeekRule): string[] {
    const out: string[] = [];
    if (rule.compoundRIR) out.push(`Compounds RIR ${rirText(rule.compoundRIR)}`);
    if (rule.isolationRIR) out.push(`Isolations RIR ${rirText(rule.isolationRIR)}`);
    if (!rule.compoundRIR && !rule.isolationRIR) out.push('Base RIR targets');
    return out;
  }

  function rowMenu(item: ProgramDayItem): MenuItem[] {
    const items: MenuItem[] = [
      { label: 'Swap Exercise', action: () => (replacing = item) },
      { label: 'Skip Today', action: () => remove(item) },
    ];
    if (item.suggestion.action?.type === 'dropSet') items.push({ label: 'Drop a Set (Stalled)', action: () => dropSet(item) });
    if ((active.progress.setAdjustments[item.prescription.slot.id] ?? 0) !== 0) items.push({ label: 'Restore Set Count', action: () => restoreSets(item) });
    return items;
  }

  const options = $derived<MenuItem[]>([
    { label: 'Program Details', action: () => nav.push({ name: 'program', id: active.program.id }) },
    { label: 'Skip This Day', action: skipToday },
    { label: 'Use Generator Today', action: onUseGenerator },
    { label: 'Empty Workout', action: () => session.startEmpty() },
  ]);
</script>

<div class="screen stack" style="--gap:20px">
  <div class="topbar">
    <span></span>
    <ActionMenu items={options} label="Workout options"><Ellipsis /></ActionMenu>
  </div>

  {#if trainedToday && !session.isActive}<TrainedCard detail={trainedDetail()} />{/if}

  {#if dueWeek}
    <div class="card tight stack" style="--gap:10px;outline:1px solid rgba(255,107,46,.4)">
      <div class="row sub bold" style="--gap:8px"><HeartPulse size={18} /> Week {dueWeek} check-in</div>
      <p class="caption muted">Four quick fatigue flags. Two or more and it's time to deload early.</p>
      <div class="row" style="--gap:10px">
        <button class="btn primary" onclick={() => (checkInWeek = dueWeek)}>Check In</button>
        <button class="btn" onclick={() => saveCheckIn({ jointPain: false, stillSore: false, poorSleepOrMotivation: false, repsDropped: false }, dueWeek)}>Skip</button>
      </div>
    </div>
  {/if}

  {#if active.progress.deloadNext}
    <div class="card tight row sub semibold" style="color:var(--recovering)"><BedDouble size={18} /> Deload starts after this week</div>
  {/if}

  {#if plan}
    {@const rule = plan.session.rule}
    <header class="stack" style="--gap:12px">
      <button class="row muted sub semibold" style="--gap:4px" onclick={() => nav.push({ name: 'program', id: plan.program.id })}>
        {plan.program.name} <ChevronRight size={14} color="var(--accent)" aria-hidden="true" />
      </button>
      <div class="stack" style="--gap:4px">
        {#if trainedToday}<span class="kicker accent">NEXT UP</span>{/if}
        <h1 class="display" style="font-size:1.75rem">{plan.session.day.title} Day</h1>
        <span class="sub muted">Week {plan.session.week} of {plan.program.weeks} · {plan.items.length} exercises · ~{dayPlanMinutes(plan)} min</span>
      </div>
      <div class="row wrap" style="--gap:8px">
        {#if rule.isDeload}<span class="chip on"><BedDouble size={16} /> Deload week</span>{/if}
        {#each chips(rule) as c (c)}<span class="chip">{c}</span>{/each}
      </div>
    </header>

    {#if rule.notes.length}
      <div class="card tight stack" style="--gap:8px">
        {#each rule.notes as n (n)}<div class="row sub" style="--gap:8px;align-items:flex-start"><Info size={16} style="flex:none;margin-top:2px" /> {n}</div>{/each}
      </div>
    {/if}

    {#if showRest}
      <div class="card stack">
        <div class="row bold" style="--gap:8px"><MoonStar size={18} /> Rest day</div>
        <p class="sub muted">The schedule has today off. Next session: {plan.session.day.title}.</p>
        <button class="btn" style="align-self:flex-start" onclick={() => (trainOnRestDay = true)}>Train Anyway</button>
      </div>
    {:else}
      <div class="card exercises">
        {#each plan.items as item (item.prescription.slot.id)}
          {@const p = item.prescription}
          {@const s = item.suggestion}
          {@const e = rxExercise(p)}
          <div class="ex-row">
            <button class="row grow" style="--gap:14px;text-align:left;align-items:flex-start" onclick={() => nav.push({ name: 'exercise', id: e.id })}>
              <ExerciseThumb exercise={e} />
              <span class="stack grow" style="--gap:3px">
                {#if p.slot.label || p.slot.supersetGroup || p.slot.isOptional}
                  <span class="row" style="--gap:6px">
                    {#if p.slot.label}<span class="kicker accent">{p.slot.label.toUpperCase()}</span>{/if}
                    {#if p.slot.supersetGroup}<span class="kicker accent">SUPERSET</span>{/if}
                    {#if p.slot.isOptional}<span class="kicker muted">OPTIONAL</span>{/if}
                  </span>
                {/if}
                <span class="bold">{e.name}</span>
                <span class="sub muted mono">{setsText(p)} · {effortText(p.effort)}</span>
                <span class="caption muted">Rest {restText(p)}</span>
                <span class="sub semibold mono">Target: {s.weight !== null ? `${app.units.format(s.weight)} × ` : ''}{s.reps}+ reps</span>
                <span class="caption muted">{s.reason}</span>
                {#if p.lastSetNote}<span class="caption row" style="--gap:4px;color:var(--recovering)"><Flame size={12} /> {p.lastSetNote}</span>{/if}
                {#each [...p.slot.notes, ...(p.weekNote ? [p.weekNote] : [])] as n (n)}<span class="caption muted">• {n}</span>{/each}
                {#if !e.equipment.every((x) => app.activeGym.equipment.includes(x))}
                  <span class="caption row" style="--gap:4px;color:var(--recovering)"><TriangleAlert size={12} /> {app.activeGym.name} doesn't list all the equipment</span>
                {/if}
                {#if item.isSwapped}<span class="caption muted">Swapped for today</span>{/if}
              </span>
            </button>
            <ActionMenu items={rowMenu(item)} label="{e.name} options"><Ellipsis size={20} /></ActionMenu>
          </div>
        {/each}
        {#each plan.removed as p (p.slot.id)}
          <div class="ex-row">
            <span class="grow sub muted">Skipped: {rxExercise(p).name}</span>
            <button class="link sub" onclick={() => restore(p.slot.id)}>Restore</button>
          </div>
        {/each}
      </div>
    {/if}

    {#if !session.isActive && !showRest}
      <button class="fab" onclick={start}><Play size={20} fill="currentColor" /> Start {plan.session.day.title}</button>
    {/if}
  {/if}
</div>

{#if replacing}
  {@const r = replacing}
  <ExercisePicker title="Swap {rxExercise(r.prescription).name}" exercises={app.planner().alternatives(rxExercise(r.prescription))}
    onpick={(e) => swap(r, e)} onclose={() => (replacing = null)} />
{/if}
{#if checkInWeek !== null}
  <FatigueCheckInSheet week={checkInWeek} onclose={() => (checkInWeek = null)} />
{/if}

<style>
  .exercises { padding: 4px 14px; border-radius: 24px; }
  .ex-row { display: flex; align-items: flex-start; gap: 8px; padding: 12px 0; }
  .ex-row + .ex-row { border-top: 0.5px solid var(--line); }
</style>
