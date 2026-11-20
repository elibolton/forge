<script lang="ts">
  import TemplatePicker from '../components/TemplatePicker.svelte';
  import { addMobility } from '../lib/mobility';
  import { focusMuscles, gymFitsProgramExercise } from '../engine';
  import {
    type Exercise, type FatigueCheckIn, type WeekRule, Programs, checkInDue, nextDayID, programDay, repsLeftText, rxExercise,
    scheduledOn, setsText, effortText, restText, skipDay, dayOrder, isDone, ruleFor,
  } from '../engine';
  import { BedDouble, ChevronRight, Ellipsis, Flame, HeartPulse, Info, MoonStar, TriangleAlert } from '@lucide/svelte';
  import ActionMenu, { type MenuItem } from '../components/ActionMenu.svelte';
  import ExercisePicker from '../components/ExercisePicker.svelte';
  import ExerciseCard from '../components/ExerciseCard.svelte';
  import HeroCard from '../components/HeroCard.svelte';
  import ScreenHeader from '../components/ScreenHeader.svelte';
  import FatigueCheckInSheet from '../components/FatigueCheckInSheet.svelte';
  import TrainedLine from '../components/TrainedLine.svelte';
  import Notice from '../components/Notice.svelte';
  import SafariBanner from '../components/SafariBanner.svelte';
  import { breakable } from '../lib/programInfo';
  import { trainedDetail } from '../lib/logFormat';
  import BackupNudge from '../components/BackupNudge.svelte';
  import WeekStrip from '../components/WeekStrip.svelte';
  import ActivitySheet from '../components/ActivitySheet.svelte';
  import { currentTime } from '../lib/clock.svelte';
  import { nav } from '../lib/nav.svelte';
  import {
    type ProgramDayEdits, type ProgramDayItem, dayPlanMinutes, editsKey, loadEdits, makeDayPlan, saveEdits, startDayPlan,
  } from '../lib/plans';
  import { session } from '../lib/session.svelte';
  import { app } from '../lib/store.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { isSameDay } from '../lib/units';

  let loggingActivity = $state(false);
  let pickingTemplate = $state(false);
  let { onUseGenerator }: { onUseGenerator: () => void } = $props();

  let replacing = $state<ProgramDayItem | null>(null);
  let checkInWeek = $state<number | null>(null);
  let trainOnRestDay = $state(false);

  const active = $derived(app.activeProgram!);
  // Re-reads day-of edits and history whenever either changes.
  const plan = $derived.by(() => { void app.kv; void app.logs; return makeDayPlan(active.program, active.progress); });
  const trainedToday = $derived(app.logs[0] && isSameDay(app.logs[0].date, currentTime()) ? app.logs[0] : undefined);
  const isRestDay = $derived(scheduledOn(active.program, new Date(currentTime())) === null);
  const showRest = $derived(isRestDay && !trainedToday && !trainOnRestDay);
  const dueWeek = $derived(checkInDue(active.progress, active.program));


  function start() {
    if (!plan || !session.okToReplace()) return;
    const { state } = startDayPlan(plan);
    addMobility(state, focusMuscles(plan.session.day.focus), app.profile!.mobility);
    session.startPrepared(state, true);
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
    // In plain words: "RIR" (reps in reserve) means nothing to a newcomer; the logger asks "reps left" too.
    if (rule.compoundRIR) out.push(`Big lifts: ${repsLeftText(rule.compoundRIR)}`);
    if (rule.isolationRIR) out.push(`Small lifts: ${repsLeftText(rule.isolationRIR)}`);
    if (!rule.compoundRIR && !rule.isolationRIR) out.push('Usual effort');
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
    { label: 'Use a Generated Workout Today', action: onUseGenerator },
    { label: 'Empty Workout', action: () => { if (session.okToReplace()) session.startEmpty(true); } },
    { label: 'Log Cardio or Activity', action: () => (loggingActivity = true) },
    { label: 'Start a Saved Workout', action: () => (pickingTemplate = true) },
  ]);
</script>

<div class="screen stack" style="--gap:16px">
  <ScreenHeader>
    {#snippet actions()}<ActionMenu items={options} label="Workout options" class="icon-btn"><Ellipsis size={18} /></ActionMenu>{/snippet}
  </ScreenHeader>

  <SafariBanner />

  {#if plan}
    {@const rule = plan.session.rule}
    {@const totalSets = plan.items.reduce((t, i) => t + i.prescription.sets, 0)}
    <HeroCard eyebrow={trainedToday ? 'Next up' : `Week ${plan.session.week} of ${plan.program.weeks}`} title="{plan.session.day.title} Day"
      stats={[{ value: `${dayPlanMinutes(plan)}`, label: 'Minutes' }, { value: `${plan.items.length}`, label: 'Exercises' }, { value: `${totalSets}`, label: 'Sets' }]}
      startLabel="Start {plan.session.day.title} Day" showStart={!session.isActive && !showRest} onstart={start}>
      {#snippet top()}
        {#if trainedToday && !session.isActive}<TrainedLine detail={trainedDetail(trainedToday)} />{/if}
        <button class="program row" onclick={() => nav.push({ name: 'program', id: plan.program.id })}>
          <span class="grow stack" style="--gap:8px;text-align:left">
            <span class="caption semibold program-name">{breakable(plan.program.name)}</span>
            <span class="weeks" aria-label="Week {plan.session.week} of {plan.program.weeks}">
              {#each Array(plan.program.weeks) as _, w (w)}
                <i class:done={w + 1 !== plan.session.week && (active.progress.completed[w + 1] ?? []).length > 0} class:now={w + 1 === plan.session.week} class:deload={ruleFor(plan.program, w + 1).isDeload}></i>
              {/each}
            </span>
          </span>
          <ChevronRight size={16} color="var(--text-3)" />
        </button>
        <div class="days" aria-label="This week">
          {#each dayOrder(plan.program) as d (d)}
            {@const skipped = (active.progress.skipped[active.progress.week] ?? []).includes(d)}
            {@const done = !skipped && isDone(active.progress, d)}
            {@const now = d === plan.session.day.id}
            <span class="day" class:done class:skip={skipped} class:now><i aria-hidden="true"></i>{programDay(plan.program, d)?.title}{#if skipped}<span class="sr-only">, skipped</span>{/if}</span>
          {/each}
        </div>
      {/snippet}
      {#snippet controls()}
        {#if rule.isDeload}<span class="chip on glass-chip"><BedDouble size={15} /> Deload week</span>{/if}
        {#each chips(rule) as c (c)}<span class="chip glass-chip">{c}</span>{/each}
      {/snippet}
    </HeroCard>

    <!-- Secondary messages: one quiet card style, below the workout summary. -->
    {#if dueWeek}
      <Notice icon={HeartPulse} title="Week {dueWeek} check-in">
        Four quick fatigue flags. Two or more and it's time to deload early.
        {#snippet actions()}
          <button class="notice-act" onclick={() => (checkInWeek = dueWeek)}>Check in</button>
          <button class="notice-act plain" onclick={() => saveCheckIn({ jointPain: false, stillSore: false, poorSleepOrMotivation: false, repsDropped: false }, dueWeek)}>Skip</button>
        {/snippet}
      </Notice>
    {/if}
    {#if active.progress.deloadNext}
      <Notice icon={BedDouble} tone="warn" title="Deload starts after this week">A lighter week to recover comes next.</Notice>
    {/if}
    <BackupNudge />

    <WeekStrip />

    {#if rule.notes.length}
      <div class="card tight stack" style="--gap:8px">
        {#each rule.notes as n (n)}<div class="row sub" style="--gap:10px;align-items:flex-start"><Info size={16} color="var(--ember-2)" style="flex:none;margin-top:2px" /> {n}</div>{/each}
      </div>
    {/if}

    {#if showRest}
      <div class="card stack rest">
        <div class="row bold" style="--gap:10px"><MoonStar size={20} color="var(--ember-2)" /> Rest day</div>
        <p class="sub muted">The schedule has today off. Next session: {plan.session.day.title}.</p>
        <button class="btn" style="align-self:flex-start" onclick={() => (trainOnRestDay = true)}>Train anyway</button>
      </div>
    {:else}
      <div class="row between section-row">
        <h2 class="eyebrow">The session</h2>
        <span class="caption faint">{plan.items.length} exercises{app.profile?.mobility.warmup || app.profile?.mobility.cooldown ? ' + stretches' : ''}</span>
      </div>
      <div class="stack" style="--gap:10px">
        {#each plan.items as item, i (item.prescription.slot.id)}
          {@const p = item.prescription}
          {@const s = item.suggestion}
          {@const e = rxExercise(p)}
          {@const tags = [
            ...(p.slot.label ? [{ text: p.slot.label.toUpperCase() }] : []),
            ...(p.slot.supersetGroup ? [{ text: 'SUPERSET' }] : []),
            ...(p.slot.isOptional ? [{ text: 'OPTIONAL', tone: 'muted' as const }] : []),
          ]}
          <ExerciseCard index={i} exercise={e} tag={tags} pills={[setsText(p), effortText(p.effort), `Rest ${restText(p)}`]}
            onopen={() => nav.push({ name: 'exercise', id: e.id })}>
            {#snippet menu()}<ActionMenu items={rowMenu(item)} label="{e.name} options"><Ellipsis size={18} /></ActionMenu>{/snippet}
            {#snippet detail()}
              <div class="stack" style="--gap:6px">
                <div class="target row" style="--gap:8px">
                  <span class="eyebrow" style="color:var(--ember-2)">Target</span>
                  <span class="num">{s.weight !== null ? `${app.units.format(s.weight)} × ` : ''}{s.reps}+</span>
                </div>
                <span class="caption muted">{s.reason}</span>
                {#if p.lastSetNote}<span class="caption row" style="--gap:6px;color:var(--recovering)"><Flame size={13} /> {p.lastSetNote}</span>{/if}
                {#each [...p.slot.notes, ...(p.weekNote ? [p.weekNote] : [])] as n (n)}<span class="caption faint">• {n}</span>{/each}
                {#if !gymFitsProgramExercise(app.activeGym, e)}
                  <span class="caption row" style="--gap:6px;color:var(--recovering)"><TriangleAlert size={13} /> Needs equipment your gym ({app.activeGym.name}) doesn't list</span>
                {/if}
                {#if item.isSwapped}<span class="caption faint">Swapped for today</span>{/if}
              </div>
            {/snippet}
          </ExerciseCard>
        {/each}
        {#each plan.removed as p (p.slot.id)}
          <div class="skipped row">
            <span class="grow sub muted">Skipped today · {rxExercise(p).name}</span>
            <button class="link sub" onclick={() => restore(p.slot.id)}>Restore</button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

{#if pickingTemplate}<TemplatePicker onclose={() => (pickingTemplate = false)} />{/if}
{#if loggingActivity}<ActivitySheet onclose={() => (loggingActivity = false)} />{/if}
{#if replacing}
  {@const r = replacing}
  <ExercisePicker title="Swap {rxExercise(r.prescription).name}" exercises={app.planner().alternatives(rxExercise(r.prescription), new Set(plan?.items.map((x) => x.prescription.slot.exerciseID)))}
    onpick={(e) => swap(r, e)} onclose={() => (replacing = null)} />
{/if}
{#if checkInWeek !== null}
  <FatigueCheckInSheet week={checkInWeek} onclose={() => (checkInWeek = null)} />
{/if}

<style>
  .section-row { margin-top: 10px; padding: 0 4px; }
  .program { width: 100%; padding: 12px 14px; border-radius: var(--r-md); background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.1); }
  .program:active { transform: none; }
  .program-name { line-height: 1.3; }
  .weeks { display: flex; gap: 4px; }
  .weeks i { flex: 1; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.12); }
  .weeks i.deload { background: rgba(255, 255, 255, 0.06); outline: 1px dashed rgba(255, 255, 255, 0.2); outline-offset: -1px; }
  .weeks i.done { background: rgba(255, 166, 70, 0.6); }
  .weeks i.now { background: var(--ember-gradient); box-shadow: 0 0 10px var(--ember-glow); }
  .days { display: flex; gap: 6px; }
  .day { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 10px 0 9px; border-radius: 14px;
    background: rgba(0, 0, 0, 0.22); border: 1px solid rgba(255, 255, 255, 0.08); font-size: 0.68rem; font-weight: 650; color: var(--text-3); }
  .day i { width: 7px; height: 7px; border-radius: 50%; background: rgba(255, 255, 255, 0.18); }
  .day.done { color: var(--text-2); }
  .day.done i { background: var(--fresh); box-shadow: 0 0 8px rgba(60, 239, 176, 0.6); }
  .day.skip { color: var(--text-3); text-decoration: line-through; }
  .day.skip i { background: transparent; outline: 1px dashed rgba(255, 255, 255, 0.35); outline-offset: -1px; }
  .day.now { color: #fff; background: var(--ember-soft); border-color: rgba(255, 106, 46, 0.55); }
  .day.now i { background: var(--ember-2); box-shadow: 0 0 10px var(--ember-glow); }
  .target .num { font-size: 1.05rem; }
  .rest { background: radial-gradient(80% 100% at 100% 0%, rgba(255, 90, 31, 0.12), transparent 70%), var(--surface); }
  .skipped { padding: 14px 16px; border-radius: var(--r-lg); border: 1px dashed var(--hairline-2); }
</style>
