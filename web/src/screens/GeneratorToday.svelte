<script lang="ts">
  import TemplatePicker from '../components/TemplatePicker.svelte';
  import SaveTemplateSheet from '../components/SaveTemplateSheet.svelte';
  import { templateFromPlanned } from '../lib/templates';
  import { addMobility } from '../lib/mobility';
  import {
    Catalog, type BlockCheckIn, type DayFocus, type Exercise, type ExercisePreference, type PlannedExercise, Programs, blockCheckInDue,
    blockStatus, estimatedMinutes, isBodyweight, muscleName, plannedWorkingSets,
  } from '../engine';
  import {
    ArrowLeftRight, BadgeCheck, BatteryCharging, Clock, Ellipsis, HeartPulse, MapPin, Plus, RefreshCw, SlidersHorizontal,
    TimerOff, TrendingUp, Wand,
  } from '@lucide/svelte';
  import BlockCheckInSheet from '../components/BlockCheckInSheet.svelte';
  import ActionMenu, { type MenuItem } from '../components/ActionMenu.svelte';
  import ExercisePicker from '../components/ExercisePicker.svelte';
  import ExerciseCard from '../components/ExerciseCard.svelte';
  import HeroCard from '../components/HeroCard.svelte';
  import ScreenHeader from '../components/ScreenHeader.svelte';
  import TargetMuscles from '../components/TargetMuscles.svelte';
  import TrainedLine from '../components/TrainedLine.svelte';
  import Notice from '../components/Notice.svelte';
  import SafariBanner from '../components/SafariBanner.svelte';
  import { type SavedParts, changeText, changedParts, planParts } from '../lib/planChange';
  import BackupNudge from '../components/BackupNudge.svelte';
  import WeekStrip from '../components/WeekStrip.svelte';
  import ActivitySheet from '../components/ActivitySheet.svelte';
  import { clock, currentTime } from '../lib/clock.svelte';
  import { count, dayTitle, focusTitle, goalTitle, swappableFocuses } from '../lib/labels';
  import { nav } from '../lib/nav.svelte';
  import { trainedDetail } from '../lib/logFormat';
  import { type TodayPlan, buildToday, isTodayPlanCurrent, planBasis, withoutDuplicateExercises } from '../lib/plans';
  import { session } from '../lib/session.svelte';
  import { app } from '../lib/store.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { isSameDay } from '../lib/units';

  /** "A, B and C". */
  const listText = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '');

  let loggingActivity = $state(false);
  let pickingTemplate = $state(false);
  let savingTemplate = $state(false);
  let replacing = $state<PlannedExercise | null>(null);
  let adding = $state(false);

  const profile = $derived(app.profile!);
  const saved = $derived(app.get<TodayPlan>('todayPlan'));
  // A plan saved with an exercise twice would crash the list; show it once, and save it that way.
  const today = $derived(saved && withoutDuplicateExercises(saved));
  const trainedToday = $derived(app.logs[0] && isSameDay(app.logs[0].date, currentTime()) ? app.logs[0] : undefined);
  const chosenMinutes = $derived(today?.minutes ?? profile.plan.sessionMinutes);
  const planner = $derived(app.planner(today?.minutes));
  /** Where today sits in the block now (the saved plan's copy can predate a check-in). */
  const block = $derived.by(() => { void clock.today; return blockStatus(app.records, currentTime(), profile.blockCheckIns); });
  const checkInWeek = $derived(blockCheckInDue(block, profile.blockCheckIns));
  let checkingIn = $state(false);

  /** Saves a block check-in (or a skip) and rebuilds today's workout, which it can change. */
  function saveBlockCheckIn(answer: BlockCheckIn) {
    const week = checkInWeek;
    if (week === undefined) return;
    // `block` re-derives once the answer is saved, so keep the one it was answered in.
    const before = block;
    app.saveBlockCheckIn(before.startedAt, week, answer);
    rebuild(today?.focus ?? null, today?.minutes ?? null, today?.seed);
    if (answer.skipped) return;
    const after = blockStatus(app.records, currentTime(), app.profile!.blockCheckIns);
    toasts.show(after.isDeload ? 'Deload starts now' : after.weeks > before.weeks ? `Block extended to ${after.weeks - 1} training weeks` : 'Check-in saved');
  }

  $effect(() => {
    if (saved && today && today !== saved) app.set('todayPlan', $state.snapshot(today));
  });
  // Keeps the saved plan if it's still today's and nothing was logged since; otherwise builds the next one.
  // Re-checked at midnight too, so an app left open overnight doesn't keep yesterday's plan.
  $effect(() => {
    void clock.today;
    if (!today || !isTodayPlanCurrent(today, app.logs.length)) rebuild(null, null, null);
  });
  // Coming back to the app on a new day.
  $effect(() => {
    const onVisible = () => {
      const t = app.get<TodayPlan>('todayPlan');
      if (document.visibilityState === 'visible' && t && !isTodayPlanCurrent(t, app.logs.length)) rebuild(null, null, null);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });

  function rebuild(focus: DayFocus | null, minutes: number | null, seed: number | null | undefined): TodayPlan {
    const t = buildToday(focus, minutes, seed);
    app.set('todayPlan', t);
    rememberParts(t.generatedAt);
    return t;
  }

  /** What the plan was built from, in labelled pieces, so a later change can be named. */
  function rememberParts(generatedAt: number) {
    app.set('todayPlanParts', { generatedAt, parts: planParts(app.profile!, app.activities) } satisfies SavedParts);
  }

  /** Settings changed since today's workout was built. */
  const stale = $derived(!!today && today.basis !== planBasis(profile));
  const staleText = $derived.by(() => {
    if (!stale || !today) return '';
    const saved = app.get<SavedParts>('todayPlanParts');
    return changeText(changedParts(saved?.generatedAt === today.generatedAt ? saved.parts : undefined, planParts(profile, app.activities)));
  });

  function keepThisOne() {
    edit((t) => { t.basis = planBasis(profile); });
    if (today) rememberParts(today.generatedAt);
  }

  /** Start never runs a workout built before a change: it builds the updated one first. */
  function startToday() {
    if (!today) return;
    let workout = today.workout;
    if (stale) {
      const what = staleText;
      workout = rebuild(today.focus, today.minutes, today.seed).workout;
      toasts.show(`${what}: workout updated`);
    }
    session.start(workout, (st) => addMobility(st, workout.targetMuscles, profile.mobility));
  }


  function edit(change: (t: TodayPlan) => void) {
    const t = app.get<TodayPlan>('todayPlan');
    if (!t) return;
    const next = structuredClone($state.snapshot(t)) as TodayPlan;
    change(next);
    // A superset whose partner was removed becomes a normal exercise again.
    const scheme = planner.scheme;
    for (const x of next.workout.exercises) {
      if (x.supersetGroup && next.workout.exercises.filter((y) => y.supersetGroup === x.supersetGroup).length < 2) {
        delete x.supersetGroup;
        x.restSeconds = x.exercise.isCompound ? scheme.restCompound : scheme.restIsolation;
      }
    }
    app.set('todayPlan', next);
  }

  function remove(p: PlannedExercise, announce = true) {
    const index = today?.workout.exercises.findIndex((x) => x.exercise.id === p.exercise.id) ?? -1;
    if (index < 0) return;
    edit((t) => { t.workout.exercises.splice(index, 1); });
    if (announce) toasts.show(`Removed ${p.exercise.name}`, () => edit((t) => { t.workout.exercises.splice(Math.min(index, t.workout.exercises.length), 0, p); }));
  }

  function replace(p: PlannedExercise, e: Exercise) {
    edit((t) => {
      const i = t.workout.exercises.findIndex((x) => x.exercise.id === p.exercise.id);
      if (i < 0) return;
      const old = t.workout.exercises[i];
      // Keep its place in a superset, with the same rest.
      t.workout.exercises[i] = { ...planner.prescribe(e), ...(old.supersetGroup ? { supersetGroup: old.supersetGroup, restSeconds: old.restSeconds } : {}) };
    });
  }

  function add(e: Exercise) {
    edit((t) => { if (!t.workout.exercises.some((x) => x.exercise.id === e.id)) t.workout.exercises.push(planner.prescribe(e)); });
  }

  /** Starting a workout replaces one in progress, so ask first. */
  function startEmpty() { if (session.okToReplace()) session.startEmpty(true); }

  function setPreference(pref: ExercisePreference, p: PlannedExercise) {
    const e = p.exercise;
    const previous = profile.plan.preferences[e.id];
    const index = today?.workout.exercises.findIndex((x) => x.exercise.id === e.id) ?? -1;
    app.updatePlan((plan) => { plan.preferences[e.id] = pref; });
    // "Never" also takes it out of today's workout; Undo puts both back.
    if (pref === 'exclude') remove(p, false);
    const message = pref === 'more' ? `You'll see ${e.name} more often` : pref === 'less' ? `You'll see ${e.name} less often` : `${e.name} won't be recommended`;
    toasts.show(message, () => {
      app.updatePlan((plan) => { if (previous) plan.preferences[e.id] = previous; else delete plan.preferences[e.id]; });
      if (pref === 'exclude' && index >= 0) edit((t) => { t.workout.exercises.splice(Math.min(index, t.workout.exercises.length), 0, p); });
    });
  }

  function summary(p: PlannedExercise): string[] {
    const working = plannedWorkingSets(p);
    const first = working[0];
    if (!first) return [];
    const parts = [`${working.length} × ${p.exercise.isTimed ? `${first.reps}s` : first.reps}`];
    if (!isBodyweight(p.exercise)) parts.push(app.units.format(first.weight));
    parts.push(`${p.restSeconds < 120 ? `${p.restSeconds}s` : `${Math.round(p.restSeconds / 30) / 2} min`} rest`);
    return parts;
  }

  function rowMenu(p: PlannedExercise): MenuItem[] {
    return [
      { label: 'Swap Exercise', action: () => (replacing = p) },
      { label: 'Remove', danger: true, action: () => remove(p) },
      { label: 'Recommend More', section: 'Recommend', action: () => setPreference('more', p) },
      { label: 'Recommend Less', action: () => setPreference('less', p) },
      { label: 'Never Recommend', action: () => setPreference('exclude', p) },
    ];
  }

  const optionsMenu = $derived<MenuItem[]>([
    { label: 'New Variation', action: () => rebuild(today?.focus ?? null, today?.minutes ?? null, (today?.seed ?? 0) + 1) },
    { label: 'Add Exercise', action: () => (adding = true) },
    { label: 'Empty Workout', action: startEmpty },
    { label: 'Log Cardio or Activity', action: () => (loggingActivity = true) },
    { label: 'Start a Saved Workout', action: () => (pickingTemplate = true) },
    { label: 'Save This Workout', action: () => (savingTemplate = true) },
  ]);
  const switchMenu = $derived<MenuItem[]>([
    { label: 'Follow My Plan', checked: !today?.focus, action: () => rebuild(null, today?.minutes ?? null, today?.seed) },
    ...swappableFocuses.map((f) => ({ label: focusTitle[f], checked: today?.focus === f, action: () => rebuild(f, today?.minutes ?? null, today?.seed) })),
  ]);
  const durationMenu = $derived<MenuItem[]>([15, 20, 30, 45, 60, 75, 90].map((m) => ({
    label: `${m} min`, checked: chosenMinutes === m, action: () => rebuild(today?.focus ?? null, m, today?.seed),
  })));
  const gymMenu = $derived<MenuItem[]>(profile.gyms.map((g) => ({
    label: g.name, checked: g.id === profile.activeGymID,
    action: () => { app.updateProfile((p) => { p.activeGymID = g.id; }); rebuild(today?.focus ?? null, today?.minutes ?? null, today?.seed); },
  })));

  const finishedProgram = $derived.by(() => {
    const progress = profile.programProgress;
    return progress?.isFinished ? Programs.byID(progress.programID) : undefined;
  });
</script>

<div class="screen stack" style="--gap:16px">
  <ScreenHeader>
    {#snippet actions()}
      <button class="icon-btn" aria-label="Your plan" onclick={() => nav.push({ name: 'plan' })}><SlidersHorizontal size={18} /></button>
      <ActionMenu items={optionsMenu} label="Workout options" class="icon-btn"><Ellipsis size={18} /></ActionMenu>
    {/snippet}
  </ScreenHeader>

  <SafariBanner />

  {#if today}
    {@const workout = today.workout}
    {@const estimate = estimatedMinutes(workout.exercises)}
    {@const totalSets = workout.exercises.reduce((t, p) => t + plannedWorkingSets(p).length, 0)}

    <!-- Above Start, so nobody starts a workout built before (say) an injury without seeing it. -->
    {#if stale}
      <Notice icon={RefreshCw} tone="ember" title={staleText} role="status">
        Start builds an updated workout. Keep this one to do it as it is, edits and all.
        {#snippet actions()}
          <button class="notice-act" onclick={() => rebuild(today.focus, today.minutes, today.seed)}>Update now</button>
          <button class="notice-act plain" onclick={keepThisOne}>Keep this one</button>
        {/snippet}
      </Notice>
    {/if}

    <!-- Non-breaking spaces keep "Week 1 of 6" together, so a narrow screen doesn't strand the "6" on its own line. -->
    {@const blockLabel = workout.block ? (workout.block.isDeload ? ' · Deload week' : ` · Week ${workout.block.week} of ${workout.block.weeks}`) : ''}
    <HeroCard eyebrow={trainedToday ? `Next up${blockLabel}` : `Today · ${goalTitle[profile.plan.goal]}${blockLabel}`} title={dayTitle(workout.focus)}
      stats={[{ value: `${estimate}`, label: 'Minutes' }, { value: `${workout.exercises.length}`, label: 'Exercises' }, { value: `${totalSets}`, label: 'Sets' }]}
      startLabel={stale ? 'Start updated workout' : trainedToday ? 'Start next workout' : 'Start workout'} showStart={!session.isActive} onstart={startToday}>
      {#snippet top()}{#if trainedToday && !session.isActive}<TrainedLine detail={trainedDetail(trainedToday)} />{/if}{/snippet}
      {#snippet controls()}
        <ActionMenu items={switchMenu} label="Switch workout focus" class="chip glass-chip"><ArrowLeftRight size={15} /> Switch</ActionMenu>
        <ActionMenu items={durationMenu} label="Duration, {chosenMinutes} minutes" class="chip glass-chip"><Clock size={15} /> {chosenMinutes} min</ActionMenu>
        <ActionMenu items={gymMenu} label="Gym, {app.activeGym.name}" class="chip glass-chip gym-chip"><MapPin size={15} style="flex:none" /> <span class="one-line">{app.activeGym.name}</span></ActionMenu>
      {/snippet}
    </HeroCard>

    <!-- Everything else is secondary: one quiet card style, below the workout summary. -->
    {#if checkInWeek !== undefined}
      <Notice icon={HeartPulse} title="Week {checkInWeek} check-in">
        Four quick questions near the end of the block. Recovering well stretches it a week; joint pain or two flags bring the deload forward.
        {#snippet actions()}
          <button class="notice-act" onclick={() => (checkingIn = true)}>Check in</button>
          <button class="notice-act plain" onclick={() => saveBlockCheckIn({ jointPain: false, stillSore: false, poorSleepOrMotivation: false, stalled: false, answeredAt: Date.now(), skipped: true })}>Skip</button>
        {/snippet}
      </Notice>
    {/if}

    {#if workout.block?.checkInNote && !workout.block.isDeload}
      <Notice icon={TrendingUp} tone="fresh" title={workout.block.checkInNote}>
        This block now runs {workout.block.weeks - 1} training weeks, then a deload.
      </Notice>
    {/if}

    <BackupNudge />

    {#if app.activeGym.reviewEquipment}
      <Notice icon={MapPin} title="Check your equipment: {app.activeGym.name}">
        Forge now asks which bench, cables and attachments you have, so it only suggests what you can do.
        {#snippet actions()}<button class="notice-act" onclick={() => nav.push({ name: 'gym', id: app.activeGym.id })}>Review equipment</button>{/snippet}
      </Notice>
    {/if}

    {#if app.activeProgram}
      <Notice icon={Wand} title="Using a generated workout today">
        Your program picks up again tomorrow.
        {#snippet actions()}<button class="notice-act" onclick={() => app.set('generatorDay', undefined)}>Back to program</button>{/snippet}
      </Notice>
    {:else if finishedProgram}
      <Notice icon={BadgeCheck} tone="fresh" title="{finishedProgram.name} complete">
        Start it again or pick another program.
        {#snippet actions()}<button class="notice-act" onclick={() => nav.push({ name: 'program', id: finishedProgram.id })}>See program</button>{/snippet}
      </Notice>
    {/if}

    {#if workout.uncovered?.length}
      <Notice icon={TimerOff} tone="warn" title={workout.exercises.length ? 'Some muscles get no work today' : 'Nothing fits today'}>
        {workout.exercises.length ? `Nothing for ${listText(workout.uncovered.map(muscleName))} fits` : `No ${focusTitle[workout.focus].toLowerCase()} exercise fits`} your equipment at {app.activeGym.name}, your injuries and excluded exercises. Add equipment, or switch to another day.
        {#snippet actions()}
          <button class="notice-act" onclick={() => nav.push({ name: 'gym', id: app.activeGym.id })}>Edit equipment</button>
          {#if profile.plan.injuries.length}<button class="notice-act" onclick={() => nav.push({ name: 'injuries' })}>Review injuries</button>{/if}
        {/snippet}
      </Notice>
    {/if}
    {#if workout.fatigued}
      <Notice icon={BatteryCharging} tone="warn" title="Still recovering">
        Nothing is well recovered yet. A rest day or easy mobility may serve you better; if you train, keep it easy.
      </Notice>
    {/if}

    {#if workout.block?.isDeload}
      <!-- A check-in that brought the deload forward says so; an extended block's deload is just the deload. -->
      <Notice icon={BatteryCharging} tone="fresh" title={workout.block.earlyReason && workout.block.checkInNote ? workout.block.checkInNote : 'Deload week'}>
        Fewer sets, lighter weights and easy effort, so you recover and come back stronger.{workout.block.earlyReason ? ` ${workout.block.earlyReason}, so it came early.` : ''} Next week starts block {workout.block.number + 1}.
      </Notice>
    {:else if chosenMinutes - estimate >= 10 && estimate < chosenMinutes * 0.8 && !workout.uncovered?.length}
      {@const complete = !!workout.note && !workout.fatigued}
      <Notice icon={complete ? BadgeCheck : TimerOff} tone={complete ? 'fresh' : 'warn'} title="About {estimate} of your {chosenMinutes} min">
        {#if complete}
          Every muscle today already gets the sets that help it grow; more would add fatigue, not size. Leftover time went to muscles today doesn't otherwise train.
        {:else}
          Only a few {focusTitle[workout.focus].toLowerCase()} exercises suit your equipment ({app.activeGym.name}) and today's recovery. Add one to use the time, or shorten today's session.
        {/if}
        {#snippet actions()}<button class="notice-act" onclick={() => (adding = true)}>Add an exercise</button>{/snippet}
      </Notice>
    {/if}

    <WeekStrip />

    <TargetMuscles targets={workout.targetMuscles} recovery={workout.recovery} />

    <div class="row between section-row">
      <h2 class="eyebrow">The session</h2>
      <span class="caption faint">{count(workout.exercises.length, 'exercise')}{app.profile?.mobility.warmup || app.profile?.mobility.cooldown ? ' + stretches' : ''}</span>
    </div>
    <div class="stack" style="--gap:10px">
      {#each workout.exercises as p, i (p.exercise.id)}
        {@const reason = p.reasons[1] ?? p.reasons[0]}
        {@const first = !!p.supersetGroup && workout.exercises[i + 1]?.supersetGroup === p.supersetGroup}
        {@const second = !!p.supersetGroup && workout.exercises[i - 1]?.supersetGroup === p.supersetGroup}
        {#if first}<div class="pair-label"><span class="kicker">SUPERSET {p.supersetGroup}</span><span class="caption faint">alternate sets · rest after each pair</span></div>{/if}
        <div class="paired" class:first class:second>
          <ExerciseCard index={i} exercise={p.exercise} pills={summary(p)}
            tag={i === 0 && p.exercise.isCompound ? [{ text: 'MAIN LIFT', tone: 'amber' }] : plannedWorkingSets(p).some((s) => s.isAMRAP) ? [{ text: 'MAX EFFORT' }] : []}
            onopen={() => nav.push({ name: 'exercise', id: p.exercise.id })}>
            {#snippet menu()}<ActionMenu items={rowMenu(p)} label="{p.exercise.name} options"><Ellipsis size={18} /></ActionMenu>{/snippet}
            {#snippet detail()}{#if reason}<p class="caption muted">{reason}</p>{/if}{/snippet}
          </ExerciseCard>
        </div>
      {/each}
      <button class="add" onclick={() => (adding = true)}><Plus size={18} /> Add an exercise</button>
    </div>
  {/if}
</div>

{#if pickingTemplate}<TemplatePicker onclose={() => (pickingTemplate = false)} />{/if}
{#if savingTemplate && today}
  {@const w = today.workout}
  <SaveTemplateSheet suggested={dayTitle(w.focus)} make={(n) => templateFromPlanned(n, w.exercises)} onclose={() => (savingTemplate = false)} />
{/if}
{#if loggingActivity}<ActivitySheet onclose={() => (loggingActivity = false)} />{/if}
{#if checkingIn && checkInWeek !== undefined}
  <BlockCheckInSheet {block} week={checkInWeek} onsave={saveBlockCheckIn} onclose={() => (checkingIn = false)} />
{/if}
{#if replacing}
  {@const r = replacing}
  <ExercisePicker title="Swap {r.exercise.name}"
    exercises={planner.alternatives(r.exercise, new Set(today?.workout.exercises.map((x) => x.exercise.id)))}
    onpick={(e) => replace(r, e)} onclose={() => (replacing = null)} />
{/if}
{#if adding}
  {@const inPlan = new Set(today?.workout.exercises.map((x) => x.exercise.id))}
  <ExercisePicker title="Add Exercise" exercises={Catalog.all.filter((e) => planner.isEligible(e) && !inPlan.has(e.id))} allowCreate onpick={add} onclose={() => (adding = false)} />
{/if}

<style>
  .section-row { margin-top: 10px; padding: 0 4px; }
  .pair-label { display: flex; align-items: baseline; gap: 8px; margin: 6px 0 -2px 14px; color: var(--ember-2); }
  /* A rail joins the two cards of a superset. */
  .paired { position: relative; }
  .paired.first::after, .paired.second::before { content: ''; position: absolute; left: -7px; width: 3px; border-radius: 2px; background: var(--ember-gradient); }
  .paired.first::after { top: 22px; bottom: -10px; }
  .paired.second::before { top: -10px; bottom: 22px; }
  .add { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 56px; border-radius: var(--r-lg);
    border: 1px dashed var(--hairline-2); color: var(--text-2); font-weight: 600; }
  /* The gym's name gets what's left of the row, so a long one ends in "…" rather than a mid-word cut. */
  :global(.gym-chip) { max-width: 100%; min-width: 0; }
  :global(.glass-chip) { background: rgba(0, 0, 0, 0.28) !important; border-color: rgba(255, 255, 255, 0.12) !important;
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
</style>
