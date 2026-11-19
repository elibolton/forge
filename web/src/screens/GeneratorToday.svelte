<script lang="ts">
  import {
    Catalog, type DayFocus, type Exercise, type ExercisePreference, type PlannedExercise, Programs, estimatedMinutes,
    isBodyweight, plannedWorkingSets,
  } from '../engine';
  import { ArrowLeftRight, BadgeCheck, ChevronDown, ChevronRight, Clock, Building2, Ellipsis, Play, Plus, RefreshCw, TimerOff, Wand } from '@lucide/svelte';
  import ActionMenu, { type MenuItem } from '../components/ActionMenu.svelte';
  import ExercisePicker from '../components/ExercisePicker.svelte';
  import ExerciseThumb from '../components/ExerciseThumb.svelte';
  import MuscleTile from '../components/MuscleTile.svelte';
  import TrainedCard from '../components/TrainedCard.svelte';
  import { dayTitle, focusTitle, goalTitle, splitTitle, swappableFocuses } from '../lib/labels';
  import { nav } from '../lib/nav.svelte';
  import { type TodayPlan, buildToday, isTodayPlanCurrent, planBasis } from '../lib/plans';
  import { session } from '../lib/session.svelte';
  import { app } from '../lib/store.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { isSameDay } from '../lib/units';

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
      if (i >= 0) t.workout.exercises[i] = planner.prescribe(e);
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

  function summary(p: PlannedExercise): string {
    const working = plannedWorkingSets(p);
    const first = working[0];
    if (!first) return '';
    const parts = [`${working.length} sets`, p.exercise.isTimed ? `${first.reps}s` : `${first.reps} reps`];
    if (!isBodyweight(p.exercise)) parts.push(app.units.format(first.weight));
    if (working.some((s) => s.isAMRAP)) parts.push('max effort');
    return parts.join(' · ');
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

<div class="screen stack" style="--gap:20px">
  <div class="topbar">
    <span></span>
    <ActionMenu items={optionsMenu} label="Workout options"><Ellipsis /></ActionMenu>
  </div>

  {#if today}
    {@const workout = today.workout}
    {@const estimate = estimatedMinutes(workout.exercises)}
    {#if trainedToday && !session.isActive}
      {@const sets = trainedToday.exercises.reduce((t, e) => t + e.sets.filter((s) => !s.isWarmup && s.reps > 0).length, 0)}
      {@const count = sets > 0 ? sets : trainedToday.exercises.length}
      <TrainedCard detail="{trainedToday.focus ? `${focusTitle[trainedToday.focus]} · ` : ''}{Math.max(1, Math.floor(trainedToday.durationSeconds / 60))} min · {count} {sets > 0 ? (count === 1 ? 'set' : 'sets') : count === 1 ? 'exercise' : 'exercises'}. Recover well; here's what's next." />
    {/if}

    {#if app.activeProgram}
      <div class="card tight row">
        <Wand size={18} aria-hidden="true" />
        <span class="grow sub semibold">Using the generator today</span>
        <button class="link sub" onclick={() => app.set('generatorDay', undefined)}>Back to Program</button>
      </div>
    {:else if finishedProgram}
      <button class="card tight row pressable" style="text-align:left" onclick={() => nav.push({ name: 'program', id: finishedProgram.id })}>
        <BadgeCheck color="var(--fresh)" aria-hidden="true" />
        <span class="grow"><span class="sub bold">{finishedProgram.name} complete</span><br /><span class="caption muted">Start it again or pick another program.</span></span>
        <ChevronRight size={16} class="muted" />
      </button>
    {/if}

    <header class="stack" style="--gap:14px">
      <button class="row muted sub semibold" style="--gap:4px" onclick={() => nav.push({ name: 'plan' })}>
        {goalTitle[profile.plan.goal]} · {splitTitle[profile.plan.split]} <ChevronRight size={14} color="var(--accent)" aria-hidden="true" />
      </button>
      <div class="row between" style="align-items:flex-end">
        <div class="stack" style="--gap:4px">
          {#if trainedToday}<span class="kicker accent">NEXT UP</span>{/if}
          <h1 class="display" style="font-size:1.75rem">{dayTitle(workout.focus)}</h1>
          <span class="sub muted">{workout.exercises.length} exercises · {workout.targetMuscles.length} muscles · ~{estimate} min</span>
        </div>
        <ActionMenu items={switchMenu} label="Switch workout focus" class="chip on"><ArrowLeftRight size={16} /> Switch</ActionMenu>
      </div>
      <div class="row wrap" style="--gap:8px">
        <ActionMenu items={durationMenu} label="Duration, {chosenMinutes} minutes" class="chip"><Clock size={16} /> {chosenMinutes}m <ChevronDown size={14} /></ActionMenu>
        <ActionMenu items={gymMenu} label="Gym, {app.activeGym.name}" class="chip"><Building2 size={16} /> {app.activeGym.name} <ChevronDown size={14} /></ActionMenu>
      </div>
    </header>

    {#if today.basis !== planBasis(profile)}
      <div class="card tight stack" style="outline:1px solid rgba(255,107,46,.4)">
        <div class="row sub bold" style="--gap:8px"><RefreshCw size={16} /> Your plan or recovery changed</div>
        <p class="caption muted">This workout was built before the change. Update it, or keep it and your edits.</p>
        <div class="row" style="--gap:10px">
          <button class="btn primary" onclick={() => rebuild(today.focus, today.minutes, today.seed)}>Update Workout</button>
          <button class="btn" onclick={() => edit((t) => { t.basis = planBasis(profile); })}>Keep This One</button>
        </div>
      </div>
    {/if}

    {#if chosenMinutes - estimate >= 10 && estimate < chosenMinutes * 0.8}
      <div class="card tight row" style="align-items:flex-start">
        <TimerOff size={20} color="var(--recovering)" aria-hidden="true" />
        <div class="stack grow" style="--gap:6px">
          <div class="sub bold">About {estimate} of your {chosenMinutes} min</div>
          <p class="caption muted">Only a few {focusTitle[workout.focus].toLowerCase()} exercises suit {app.activeGym.name}'s equipment and today's recovery. Add one to use the time, or shorten today's session.</p>
          <button class="link sub" style="text-align:left" onclick={() => (adding = true)}>Add an Exercise</button>
        </div>
      </div>
    {/if}

    <div class="strip" role="group" aria-label="Target muscle recovery">
      {#each workout.targetMuscles as m (m)}<MuscleTile muscle={m} value={workout.recovery[m] ?? 1} />{/each}
    </div>

    <div class="card exercises">
      {#each workout.exercises as p, i (p.exercise.id)}
        <div class="ex-row">
          <button class="row grow" style="--gap:14px;text-align:left" onclick={() => nav.push({ name: 'exercise', id: p.exercise.id })}>
            <ExerciseThumb exercise={p.exercise} />
            <span class="stack grow" style="--gap:3px">
              {#if i === 0 && p.exercise.isCompound}<span class="kicker" style="color:var(--recovering)">MAIN LIFT</span>{/if}
              <span class="bold">{p.exercise.name}</span>
              <span class="sub muted mono">{summary(p)}</span>
              {#if p.reasons[1] ?? p.reasons[0]}<span class="caption muted">{p.reasons[1] ?? p.reasons[0]}</span>{/if}
            </span>
          </button>
          <ActionMenu items={rowMenu(p)} label="{p.exercise.name} options"><Ellipsis size={20} /></ActionMenu>
        </div>
      {/each}
      <button class="ex-row row link" style="--gap:16px" onclick={() => (adding = true)}>
        <span class="plus-tile"><Plus size={24} strokeWidth={2.6} /></span> <span class="bold">Add an Exercise</span>
      </button>
    </div>

    {#if !session.isActive}
      <button class="fab" onclick={() => session.start(workout)}><Play size={20} fill="currentColor" /> {trainedToday ? 'Start Next Workout' : 'Start Workout'}</button>
    {/if}
  {/if}
</div>

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
  .strip { display: flex; gap: 10px; overflow-x: auto; margin: 0 -16px; padding: 0 16px; scrollbar-width: none; }
  .strip::-webkit-scrollbar { display: none; }
  .exercises { padding: 4px 14px; border-radius: 24px; }
  .ex-row { display: flex; align-items: center; gap: 8px; padding: 12px 0; width: 100%; }
  .ex-row + .ex-row { border-top: 0.5px solid var(--line); }
  .plus-tile { width: 60px; height: 60px; border-radius: 16px; background: var(--accent-soft); display: grid; place-items: center; }
</style>
