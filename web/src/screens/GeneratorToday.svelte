<script lang="ts">
  import TemplatePicker from '../components/TemplatePicker.svelte';
  import SaveTemplateSheet from '../components/SaveTemplateSheet.svelte';
  import { templateFromPlanned } from '../lib/templates';
  import { addMobility } from '../lib/mobility';
  import {
    Catalog, type DayFocus, type Exercise, type ExercisePreference, type PlannedExercise, Programs, estimatedMinutes,
    isBodyweight, plannedWorkingSets,
  } from '../engine';
  import { ArrowLeftRight, BadgeCheck, ChevronRight, Clock, Ellipsis, MapPin, Plus, RefreshCw, SlidersHorizontal, TimerOff, Wand } from '@lucide/svelte';
  import ActionMenu, { type MenuItem } from '../components/ActionMenu.svelte';
  import ExercisePicker from '../components/ExercisePicker.svelte';
  import ExerciseCard from '../components/ExerciseCard.svelte';
  import HeroCard from '../components/HeroCard.svelte';
  import ScreenHeader from '../components/ScreenHeader.svelte';
  import TargetMuscles from '../components/TargetMuscles.svelte';
  import TrainedCard from '../components/TrainedCard.svelte';
  import BackupNudge from '../components/BackupNudge.svelte';
  import WeekStrip from '../components/WeekStrip.svelte';
  import ActivitySheet from '../components/ActivitySheet.svelte';
  import { dayTitle, focusTitle, goalTitle, swappableFocuses } from '../lib/labels';
  import { nav } from '../lib/nav.svelte';
  import { type TodayPlan, buildToday, isTodayPlanCurrent, planBasis } from '../lib/plans';
  import { session } from '../lib/session.svelte';
  import { app } from '../lib/store.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { isSameDay } from '../lib/units';

  let loggingActivity = $state(false);
  let pickingTemplate = $state(false);
  let savingTemplate = $state(false);
  let replacing = $state<PlannedExercise | null>(null);
  let adding = $state(false);

  const profile = $derived(app.profile!);
  const today = $derived(app.get<TodayPlan>('todayPlan'));
  const trainedToday = $derived(app.logs[0] && isSameDay(app.logs[0].date, Date.now()) ? app.logs[0] : undefined);
  const chosenMinutes = $derived(today?.minutes ?? profile.plan.sessionMinutes);
  const planner = $derived(app.planner(today?.minutes));

  // Keeps the saved plan if it's still today's and nothing was logged since; otherwise builds the next one.
  $effect(() => {
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

  function rebuild(focus: DayFocus | null, minutes: number | null, seed: number | null | undefined) {
    app.set('todayPlan', buildToday(focus, minutes, seed));
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

  function add(e: Exercise) { edit((t) => { t.workout.exercises.push(planner.prescribe(e)); }); }

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
    { label: 'Empty Workout', action: () => session.startEmpty() },
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

  <BackupNudge />

  {#if today}
    {@const workout = today.workout}
    {@const estimate = estimatedMinutes(workout.exercises)}
    {@const totalSets = workout.exercises.reduce((t, p) => t + plannedWorkingSets(p).length, 0)}
    {#if trainedToday && !session.isActive}
      {@const sets = trainedToday.exercises.reduce((t, e) => t + e.sets.filter((s) => !s.isWarmup && s.reps > 0).length, 0)}
      {@const count = sets > 0 ? sets : trainedToday.exercises.length}
      <TrainedCard detail="{trainedToday.focus ? `${focusTitle[trainedToday.focus]} · ` : ''}{Math.max(1, Math.floor(trainedToday.durationSeconds / 60))} min · {count} {sets > 0 ? (count === 1 ? 'set' : 'sets') : count === 1 ? 'exercise' : 'exercises'}. Recover well; here's what's next." />
    {/if}

    {#if app.activeProgram}
      <div class="card tight row">
        <Wand size={18} aria-hidden="true" color="var(--ember-2)" />
        <span class="grow sub semibold">Using the generator today</span>
        <button class="link sub" onclick={() => app.set('generatorDay', undefined)}>Back to program</button>
      </div>
    {:else if finishedProgram}
      <button class="card tight row" style="text-align:left" onclick={() => nav.push({ name: 'program', id: finishedProgram.id })}>
        <BadgeCheck color="var(--fresh)" aria-hidden="true" />
        <span class="grow"><span class="sub bold">{finishedProgram.name} complete</span><br /><span class="caption muted">Start it again or pick another program.</span></span>
        <ChevronRight size={16} color="var(--text-3)" />
      </button>
    {/if}

    <HeroCard eyebrow={trainedToday ? 'Next up' : `Today · ${goalTitle[profile.plan.goal]}`} title={dayTitle(workout.focus)}
      stats={[{ value: `${estimate}`, label: 'Minutes' }, { value: `${workout.exercises.length}`, label: 'Exercises' }, { value: `${totalSets}`, label: 'Sets' }]}
      startLabel={trainedToday ? 'Start next workout' : 'Start workout'} showStart={!session.isActive} onstart={() => session.start(workout, (st) => addMobility(st, workout.targetMuscles, profile.mobility))}>
      {#snippet controls()}
        <ActionMenu items={switchMenu} label="Switch workout focus" class="chip glass-chip"><ArrowLeftRight size={15} /> Switch</ActionMenu>
        <ActionMenu items={durationMenu} label="Duration, {chosenMinutes} minutes" class="chip glass-chip"><Clock size={15} /> {chosenMinutes} min</ActionMenu>
        <ActionMenu items={gymMenu} label="Gym, {app.activeGym.name}" class="chip glass-chip"><MapPin size={15} /> <span class="one-line" style="max-width:120px">{app.activeGym.name}</span></ActionMenu>
      {/snippet}
    </HeroCard>

    {#if today.basis !== planBasis(profile)}
      <div class="card stack notice">
        <div class="row sub bold" style="--gap:8px"><RefreshCw size={16} color="var(--ember-2)" /> Your plan or recovery changed</div>
        <p class="caption muted">This workout was built before the change. Update it, or keep it and your edits.</p>
        <div class="row" style="--gap:8px">
          <button class="btn primary" onclick={() => rebuild(today.focus, today.minutes, today.seed)}>Update workout</button>
          <button class="btn" onclick={() => edit((t) => { t.basis = planBasis(profile); })}>Keep this one</button>
        </div>
      </div>
    {/if}

    {#if chosenMinutes - estimate >= 10 && estimate < chosenMinutes * 0.8}
      <div class="card tight row" style="align-items:flex-start">
        <TimerOff size={18} color="var(--recovering)" aria-hidden="true" style="flex:none;margin-top:2px" />
        <div class="stack grow" style="--gap:6px">
          <div class="sub bold">About {estimate} of your {chosenMinutes} min</div>
          <p class="caption muted">Only a few {focusTitle[workout.focus].toLowerCase()} exercises suit {app.activeGym.name}'s equipment and today's recovery. Add one to use the time, or shorten today's session.</p>
          <button class="link sub" style="text-align:left" onclick={() => (adding = true)}>Add an exercise</button>
        </div>
      </div>
    {/if}

    <WeekStrip />

    <TargetMuscles targets={workout.targetMuscles} recovery={workout.recovery} />

    <div class="row between section-row">
      <h2 class="eyebrow">The session</h2>
      <span class="caption faint">{workout.exercises.length} exercises{app.profile?.mobility.warmup || app.profile?.mobility.cooldown ? ' + stretches' : ''}</span>
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
{#if replacing}
  {@const r = replacing}
  <ExercisePicker title="Swap {r.exercise.name}"
    exercises={planner.alternatives(r.exercise, new Set(today?.workout.exercises.map((x) => x.exercise.id)))}
    onpick={(e) => replace(r, e)} onclose={() => (replacing = null)} />
{/if}
{#if adding}
  <ExercisePicker title="Add Exercise" exercises={Catalog.all.filter((e) => planner.isEligible(e))} allowCreate onpick={add} onclose={() => (adding = false)} />
{/if}

<style>
  .notice { border-color: rgba(255, 106, 46, 0.35); }
  .section-row { margin-top: 10px; padding: 0 4px; }
  .pair-label { display: flex; align-items: baseline; gap: 8px; margin: 6px 0 -2px 14px; color: var(--ember-2); }
  /* A rail joins the two cards of a superset. */
  .paired { position: relative; }
  .paired.first::after, .paired.second::before { content: ''; position: absolute; left: -7px; width: 3px; border-radius: 2px; background: var(--ember-gradient); }
  .paired.first::after { top: 22px; bottom: -10px; }
  .paired.second::before { top: -10px; bottom: 22px; }
  .add { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 56px; border-radius: var(--r-lg);
    border: 1px dashed var(--hairline-2); color: var(--text-2); font-weight: 600; }
  :global(.glass-chip) { background: rgba(0, 0, 0, 0.28) !important; border-color: rgba(255, 255, 255, 0.12) !important;
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
</style>
