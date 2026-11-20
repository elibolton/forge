<script lang="ts">
  import {
    Programs, dayOrder, deloadNow, deloadWeek, effortText, isDone, jumpToWeek, newProgress, programDay, resolveSession, restText,
    ruleFor, rxExercise, setsText,
  } from '../engine';
  import { BadgeCheck, ChevronRight, CircleCheck, Flame, Info, Play, TriangleAlert } from '@lucide/svelte';
  import ActionMenu from '../components/ActionMenu.svelte';
  import BackBar from '../components/BackBar.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { breakable, gymFit, programInfo } from '../lib/programInfo';
  import { type Route, nav } from '../lib/nav.svelte';
  import { app } from '../lib/store.svelte';
  import { toasts } from '../lib/toasts.svelte';

  /** Built-in multi-week programs: browse, start, and manage the active one. */
  let { route }: { route: Route } = $props();
  const current = $derived(app.profile!.programProgress);

  // Detail
  const program = $derived(route.name === 'program' ? Programs.byID(route.id) : undefined);
  const progress = $derived(program && current?.programID === program.id ? current : null);
  let pickedWeek = $state<number | null>(null);
  const week = $derived(pickedWeek ?? (progress ? Math.min(progress.week, program!.weeks) : 1));
  const weeks = $derived(program ? Array.from({ length: program.weeks }, (_, i) => i + 1) : []);

  /** The week a start is waiting to be confirmed for. */
  let confirming = $state<number | null>(null);
  const replacing = $derived(current && !current.isFinished ? current : null);

  /** Starts (after the confirm sheet), says so, and goes to Today, where the program's first day now waits. */
  function start(w: number) {
    const before = current ? $state.snapshot(current) : null;
    confirming = null;
    app.setProgramProgress(newProgress(program!.id, Date.now(), w));
    // A "generated workout today" choice would hide the program that was just started.
    app.set('generatorDay', undefined);
    pickedWeek = w;
    toasts.show(`Program started: week ${w} is on Today`, () => { app.setProgramProgress(before); pickedWeek = null; });
    nav.select('today');
  }

  function update(change: (p: NonNullable<typeof progress>) => void) {
    if (!progress) return;
    const p = structuredClone(progress);
    change(p);
    app.setProgramProgress(p);
    pickedWeek = Math.min(p.week, program!.weeks);
  }

  function end() {
    if (!confirm('End this program? Today goes back to generated workouts. Your logged workouts stay in history.')) return;
    const before = current;
    app.setProgramProgress(null);
    toasts.show('Program ended', () => app.setProgramProgress(before));
  }

  const schedule = (p: NonNullable<typeof program>) =>
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => `${d} ${p.schedule[i] ? programDay(p, p.schedule[i]!)?.title : 'Rest'}`).join(' · ');
</script>

{#if route.name === 'programs'}
  <div class="screen">
    <BackBar title="Programs" />
    <div class="section">
      <div class="list">
        {#each Programs.all as p (p.id)}
          <button class="item" onclick={() => nav.push({ name: 'program', id: p.id })}>
            <span class="stack grow" style="--gap:4px">
              <span class="row wrap" style="--gap:8px"><b>{breakable(p.name)}</b>
                {#if current?.programID === p.id}<span class="kicker accent">{current.isFinished ? 'DONE' : 'ACTIVE'}</span>{/if}</span>
              <span class="sub muted">{p.weeks} weeks · {dayOrder(p).length} days a week</span>
              <span class="caption muted">{programInfo(p).about}</span>
            </span>
            <ChevronRight size={16} color="var(--muted)" />
          </button>
        {/each}
      </div>
      <div class="foot">While a program is active, Today shows its next session instead of a generated workout.</div>
    </div>
  </div>
{:else if program}
  {@const rule = ruleFor(program, week)}
  {@const deload = deloadWeek(program)}
  {@const info = programInfo(program)}
  {@const fit = gymFit(program, app.activeGym)}
  <div class="screen">
    <BackBar title="Program" />
    <h1 class="display program-title">{breakable(program.name)}</h1>
    <p class="sub muted" style="margin-top:6px">{program.weeks} weeks · {dayOrder(program).length} days a week</p>
    <div class="section" style="margin-top:16px">
      <div class="list">
        <div class="item sub" style="display:block">{info.about}</div>
        {#if info.suits}<div class="item sub" style="display:block"><span class="muted">Good for</span><br />{info.suits}</div>{/if}
        {#if info.equipment.length}
          <div class="item sub" style="display:block"><span class="muted">You'll need</span>
            <ul class="needs">{#each info.equipment as e (e)}<li>{e}</li>{/each}</ul>
            {#if fit.fits < fit.total}
              <span class="caption row" style="--gap:6px;color:var(--recovering);margin-top:6px"><TriangleAlert size={13} style="flex:none" /> {fit.total - fit.fits} of its {fit.total} exercises need equipment {app.activeGym.name} doesn't list. You can swap them day to day.</span>
            {:else}
              <span class="caption row" style="--gap:6px;color:var(--fresh);margin-top:6px"><CircleCheck size={13} style="flex:none" /> {app.activeGym.name} has everything it needs.</span>
            {/if}
          </div>
        {/if}
        <div class="item sub" style="display:block"><span class="muted">Schedule</span><br />{schedule(program)}</div>
      </div>
    </div>

    {#if !progress}
      <div class="section">
        <button class="btn primary block big" onclick={() => (confirming = 1)}><Play size={16} fill="currentColor" /> Start Program</button>
        <div class="row" style="justify-content:center;margin-top:6px">
          <ActionMenu label="Start at Week" class="link sub start-at" items={weeks.map((w) => ({ label: `Week ${w}`, action: () => (confirming = w) }))}>Start at a later week…</ActionMenu>
        </div>
        {#if current && !current.isFinished}<div class="foot" style="text-align:center">Starting this replaces your current program.</div>{/if}
      </div>
    {/if}

    {#if progress}
    <div class="section">
      <div class="list">
          {#if progress.isFinished}
            <div class="item" style="color:var(--fresh)"><BadgeCheck size={18} /> Program complete</div>
            <button class="item link" onclick={() => (confirming = 1)}>Start Again</button>
          {:else}
            <div class="item">Current week<span class="value">{progress.week} of {program.weeks}</span></div>
            {#if deload !== undefined && progress.week !== deload}
              {#if progress.deloadNext}
                <button class="item link" onclick={() => update((p) => { p.deloadNext = false; })}>Cancel Early Deload</button>
              {:else}
                <button class="item link" onclick={() => update((p) => { p.deloadNext = true; })}>Deload Next Week</button>
              {/if}
              <button class="item link" onclick={() => update((p) => deloadNow(p, program))}>Deload Now</button>
            {/if}
            <ActionMenu label="Jump to Week" class="item link" items={weeks.map((w) => ({ label: `Week ${w}`, action: () => update((p) => jumpToWeek(p, w, program)) }))}>Jump to Week…</ActionMenu>
          {/if}
          <button class="item" style="color:var(--fatigued)" onclick={end}>End Program</button>
      </div>
    </div>
    {/if}

    <div class="section">
      <div class="head">Prescription</div>
      <div class="list">
        <label class="item">Week
          <select style="width:auto;margin-left:auto" value={week} onchange={(e) => (pickedWeek = +(e.currentTarget as HTMLSelectElement).value)}>
            {#each weeks as w (w)}<option value={w}>{ruleFor(program, w).isDeload ? `Week ${w} · Deload` : `Week ${w}`}</option>{/each}
          </select>
        </label>
        {#each rule.notes as n (n)}<div class="item caption" style="align-items:flex-start"><Info size={14} style="flex:none" /> {n}</div>{/each}
      </div>
      <div class="foot">"Reps left" is how many more reps you could still do when you stop: "2 reps left" means end the set with about two in the tank, and "to failure" means none. A deload is a lighter week to recover.</div>
    </div>

    {#each dayOrder(program) as dayID (dayID)}
      {@const s = resolveSession(program, dayID, week, progress?.setAdjustments ?? {})}
      {#if s}
        <div class="section">
          <div class="head row" style="--gap:6px">{s.day.title}
            {#if progress?.week === week && isDone(progress, dayID)}<CircleCheck size={14} color="var(--fresh)" aria-label="Done" />{/if}</div>
          <div class="list">
            {#each s.exercises as p (p.slot.id)}
              <div class="item" style="display:block">
                <div class="row" style="--gap:6px">
                  {#if p.slot.label}<span class="caption bold accent">{p.slot.label}</span>{/if}
                  <span class="sub semibold">{rxExercise(p).name}</span>
                  {#if p.slot.isOptional}<span class="kicker muted">OPTIONAL</span>{/if}
                </div>
                <div class="caption muted mono">{setsText(p)} · {effortText(p.effort)} · {restText(p)}</div>
                {#if p.lastSetNote}<div class="caption row" style="--gap:4px;color:var(--recovering)"><Flame size={12} /> {p.lastSetNote}</div>{/if}
                {#if p.weekNote}<div class="caption muted">{p.weekNote}</div>{/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/each}

    <div class="section">
      <div class="head">Progression</div>
      <div class="list">{#each program.progressionNotes as n (n)}<div class="item caption">{n}</div>{/each}</div>
    </div>
  </div>
{/if}

{#if confirming !== null && program}
  {@const w = confirming}
  {@const p = program}
  <Sheet title={replacing ? 'Replace Program?' : 'Start Program?'} onclose={() => (confirming = null)}>
    <div class="stack" style="--gap:14px">
      <p class="sub bold">{breakable(p.name)}{w > 1 ? `, from week ${w}` : ''}</p>
      <p class="sub muted">From now on Today shows the program's next workout instead of a generated one, {dayOrder(p).length} days a week: {schedule(p)}.</p>
      {#if replacing}
        <p class="sub" style="color:var(--recovering)">This replaces {Programs.byID(replacing.programID)?.name ?? 'your current program'} and its progress (week {replacing.week}). Your logged workouts stay in history.</p>
      {/if}
      <button class="btn primary block big" onclick={() => start(w)}><Play size={16} fill="currentColor" /> {replacing ? 'Replace and Start' : 'Start Program'}</button>
    </div>
  </Sheet>
{/if}

<style>
  .program-title { font-size: 1.9rem; line-height: 1.05; margin-top: 10px; }
  .needs { margin: 6px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; }
  :global(.start-at) { min-height: 44px; }
</style>
