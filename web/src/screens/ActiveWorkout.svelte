<script lang="ts">
  import { Catalog } from '../engine';
  import { ArrowDown, ArrowUp, ChevronDown, CircleAlert, CircleCheck, Ellipsis, Dumbbell, Trash2 } from '@lucide/svelte';
  import ActionMenu from '../components/ActionMenu.svelte';
  import ExercisePage from '../components/ExercisePage.svelte';
  import ExercisePicker from '../components/ExercisePicker.svelte';
  import ExerciseThumb from '../components/ExerciseThumb.svelte';
  import RestTimerBar from '../components/RestTimerBar.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { dayTitle } from '../lib/labels';
  import { exerciseOf, isComplete, session, sessionExerciseFrom } from '../lib/session.svelte';
  import { app } from '../lib/store.svelte';
  import { toasts } from '../lib/toasts.svelte';

  let adding = $state(false);
  let overview = $state(false);
  let reviewing = $state(false);
  let scroller = $state<HTMLDivElement>();

  const ws = $derived(session.state!);
  const index = $derived(Math.min(ws.currentIndex, Math.max(0, ws.exercises.length - 1)));
  const current = $derived(ws.exercises[index]);
  const title = $derived(ws.title ?? (ws.focus ? dayTitle(ws.focus) : 'Workout'));

  function go(i: number) {
    session.update((s) => { s.currentIndex = i; });
    scroller?.scrollTo({ top: 0 });
  }

  function discard() {
    const snapshot = structuredClone(session.state!);
    session.discard();
    toasts.show('Workout discarded', () => session.restore(snapshot));
  }

  function add(e: ReturnType<typeof Catalog.exercise>) {
    const planned = app.planner().prescribe(e);
    session.update((s) => { s.exercises.push(sessionExerciseFrom(planned)); s.currentIndex = s.exercises.length - 1; });
  }

  function removeAt(i: number) {
    const before = structuredClone(session.state!.exercises);
    const name = exerciseOf(before[i]).name;
    session.update((s) => {
      s.exercises.splice(i, 1);
      if (s.currentIndex >= s.exercises.length) s.currentIndex = Math.max(0, s.exercises.length - 1);
    });
    toasts.show(`Removed ${name}`, () => session.update((s) => { s.exercises = before; }));
  }

  function move(i: number, by: number) {
    session.update((s) => {
      const j = i + by;
      if (j < 0 || j >= s.exercises.length) return;
      [s.exercises[i], s.exercises[j]] = [s.exercises[j], s.exercises[i]];
      if (s.currentIndex === i) s.currentIndex = j; else if (s.currentIndex === j) s.currentIndex = i;
    });
  }

  // Swipe between exercises, like the iOS pager.
  let touchX = 0, touchY = 0;
  function touchStart(e: TouchEvent) { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }
  function touchEnd(e: TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchX, dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    if ((e.target as HTMLElement).closest('input, .steppers')) return;
    if (dx < 0 && index < ws.exercises.length - 1) go(index + 1);
    if (dx > 0 && index > 0) go(index - 1);
  }

  // Finish review
  const done = $derived(ws.exercises.flatMap((x) => x.sets).filter((s) => !s.isWarmup && s.done));
  const pending = $derived(ws.exercises.flatMap((x) => x.sets).filter((s) => !s.isWarmup && !s.done).length);
  const volume = $derived(done.reduce((t, s) => t + (s.weight ?? 0) * s.reps, 0));

  function save() {
    reviewing = false;
    session.finish();
  }
</script>

<div class="logger" role="dialog" aria-modal="true" aria-label={title}>
  <header class="topbar head">
    <button class="icon-btn" aria-label="Minimize workout" onclick={() => (session.isExpanded = false)}><ChevronDown /></button>
    <div class="title">{title}</div>
    <ActionMenu label="Workout options" class="icon-btn" items={[
      { label: 'All Exercises', action: () => (overview = true) },
      { label: 'Add Exercise', action: () => (adding = true) },
      { label: 'Discard Workout', danger: true, action: discard },
    ]}><Ellipsis /></ActionMenu>
    <button class="btn primary" style="min-height:36px;padding:6px 14px;border-radius:999px" onclick={() => (reviewing = true)}>Finish</button>
  </header>

  <div class="strip" role="tablist" aria-label="Exercises">
    {#each ws.exercises as x, i (x.id)}
      <button role="tab" aria-selected={i === index} aria-label="{exerciseOf(x).name}{isComplete(x) ? ', done' : ''}" onclick={() => go(i)}>
        <span class="seg" class:now={i === index} class:complete={isComplete(x)}></span>
      </button>
    {/each}
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="scroll" bind:this={scroller} ontouchstart={touchStart} ontouchend={touchEnd}>
    {#if !ws.exercises.length}
      <div class="empty stack" style="--gap:12px">
        <Dumbbell size={40} color="var(--muted)" />
        <div class="bold">No exercises yet</div>
        <p class="sub muted">Add exercises to build this workout as you go.</p>
        <button class="btn primary" onclick={() => (adding = true)}>Add Exercise</button>
      </div>
    {:else if current}
      {#key current.id}
        <ExercisePage exercise={current} nextName={ws.exercises[index + 1] ? exerciseOf(ws.exercises[index + 1]).name : undefined}
          onNext={() => go(index + 1)} onFinish={() => (reviewing = true)} />
      {/key}
    {/if}
  </div>

  <div class="rest"><RestTimerBar /></div>
</div>

{#if reviewing}
  <Sheet title="Finish Workout" onclose={() => (reviewing = false)}>
    {#snippet leading()}<button class="link" onclick={() => (reviewing = false)}>Keep Going</button>{/snippet}
    <div class="stack" style="--gap:18px">
      <div class="card tight row stats">
        <div><b class="mono">{Math.floor((Date.now() - ws.startedAt) / 60000)} min</b><span class="caption muted">duration</span></div>
        <div><b class="mono">{done.length}</b><span class="caption muted">sets logged</span></div>
        <div><b class="mono">{volume > 0 ? app.units.format(volume) : '–'}</b><span class="caption muted">volume</span></div>
      </div>
      {#if pending > 0}
        <div class="card stack">
          <div class="row bold" style="--gap:8px;color:var(--recovering)"><CircleAlert size={20} /> {pending} planned {pending === 1 ? "set wasn't" : "sets weren't"} logged</div>
          <p class="sub muted">Did you do them? Logging them keeps your recovery and progression accurate.</p>
          <button class="btn primary block big" onclick={() => { session.logRemainingAsPlanned(); save(); }}>I did them, log as planned</button>
          <!-- A workout with no working sets would only add noise to history and recovery. -->
          <button class="btn block" disabled={!done.length} onclick={save}>{done.length ? 'Save without them' : 'Nothing logged to save'}</button>
        </div>
      {:else}
        <button class="btn primary block big" disabled={!done.length} onclick={save}>Save Workout</button>
      {/if}
    </div>
  </Sheet>
{/if}

{#if overview}
  <Sheet title="Exercises" onclose={() => (overview = false)}>
    {#snippet leading()}<span></span>{/snippet}
    {#snippet trailing()}<button class="link bold" onclick={() => (overview = false)}>Done</button>{/snippet}
    <div class="list">
      {#each ws.exercises as x, i (x.id)}
        {@const w = x.sets.filter((s) => !s.isWarmup)}
        <div class="item">
          <button class="row grow" style="text-align:left" onclick={() => { go(i); overview = false; }}>
            <ExerciseThumb exercise={exerciseOf(x)} size={44} />
            <span class="grow"><span>{exerciseOf(x).name}</span><br /><span class="caption muted mono">{w.filter((s) => s.done).length}/{w.length} sets</span></span>
            {#if isComplete(x)}<CircleCheck size={20} color="var(--fresh)" aria-label="Done" />{/if}
          </button>
          <button class="icon-btn plain" aria-label="Move {exerciseOf(x).name} up" disabled={i === 0} onclick={() => move(i, -1)}><ArrowUp size={18} /></button>
          <button class="icon-btn plain" aria-label="Move {exerciseOf(x).name} down" disabled={i === ws.exercises.length - 1} onclick={() => move(i, 1)}><ArrowDown size={18} /></button>
          <button class="icon-btn" style="color:var(--fatigued)" aria-label="Remove {exerciseOf(x).name}" onclick={() => removeAt(i)}><Trash2 size={18} /></button>
        </div>
      {/each}
      <button class="item link" onclick={() => { overview = false; adding = true; }}>Add Exercise</button>
    </div>
  </Sheet>
{/if}

{#if adding}
  <ExercisePicker title="Add Exercise" exercises={Catalog.all.filter((e) => app.planner().isEligible(e))} allowCreate onpick={add} onclose={() => (adding = false)} />
{/if}

<style>
  .logger { position: fixed; inset: 0; z-index: 50; background: var(--bg); display: flex; flex-direction: column; animation: up 0.25s ease-out; }
  .head { padding: calc(var(--safe-top) + 4px) 8px 0; gap: 4px; }
  .strip { display: flex; gap: 4px; padding: 10px 16px; }
  .strip button { flex: 1; padding: 10px 0; }
  .seg { display: block; height: 4px; border-radius: 3px; background: var(--raised); }
  .seg.now { height: 6px; background: var(--accent); }
  .seg.complete { background: var(--fresh); }
  .scroll { flex: 1; overflow-y: auto; padding: 4px 16px 40px; -webkit-overflow-scrolling: touch; }
  .scroll > :global(*) { max-width: 640px; margin: 0 auto; }
  .rest { padding-bottom: calc(var(--safe-bottom) + 8px); }
  .rest:empty { display: none; }
  .empty { align-items: center; text-align: center; padding-top: 25vh; }
  .stats > div { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .stats b { font-size: 1.2rem; white-space: nowrap; }
  @keyframes up { from { transform: translateY(30px); opacity: 0; } }
</style>
