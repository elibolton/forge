<script lang="ts">
  import {
    Programs, dayOrder, deloadNow, deloadWeek, effortText, isDone, newProgress, programDay, resolveSession, restText,
    ruleFor, rxExercise, setsText,
  } from '../engine';
  import { BadgeCheck, ChevronRight, CircleCheck, Flame, Info } from '@lucide/svelte';
  import ActionMenu from '../components/ActionMenu.svelte';
  import BackBar from '../components/BackBar.svelte';
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

  function start(w: number) {
    app.setProgramProgress(newProgress(program!.id, Date.now(), w));
    pickedWeek = w;
    toasts.show(`${program!.name} started`);
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
              <span class="row" style="--gap:8px"><b>{p.name}</b>
                {#if current?.programID === p.id}<span class="kicker accent">{current.isFinished ? 'DONE' : 'ACTIVE'}</span>{/if}</span>
              <span class="sub muted">{p.weeks} weeks · {dayOrder(p).length} days a week</span>
              <span class="caption muted">{p.summary}</span>
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
  <div class="screen">
    <BackBar title={program.name} />
    <div class="section" style="margin-top:12px">
      <div class="list">
        <div class="item sub">{program.summary}</div>
        <div class="item sub" style="display:block"><span class="muted">Schedule</span><br />{schedule(program)}</div>
      </div>
    </div>

    <div class="section">
      <div class="list">
        {#if progress}
          {#if progress.isFinished}
            <div class="item" style="color:var(--fresh)"><BadgeCheck size={18} /> Program complete</div>
            <button class="item link" onclick={() => start(1)}>Start Again</button>
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
            <ActionMenu label="Jump to Week" class="item link" items={weeks.map((w) => ({ label: `Week ${w}`, action: () => update((p) => { p.week = w; p.isFinished = false; }) }))}>Jump to Week…</ActionMenu>
          {/if}
          <button class="item" style="color:var(--fatigued)" onclick={end}>End Program</button>
        {:else}
          <button class="item link bold" onclick={() => start(1)}>Start Program</button>
          <ActionMenu label="Start at Week" class="item link" items={weeks.map((w) => ({ label: `Week ${w}`, action: () => start(w) }))}>Start at Week…</ActionMenu>
        {/if}
      </div>
      {#if !progress && current}<div class="foot">Starting this replaces your current program.</div>{/if}
    </div>

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
