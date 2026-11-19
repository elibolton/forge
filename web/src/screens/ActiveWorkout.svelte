<script lang="ts">
  import SaveTemplateSheet from '../components/SaveTemplateSheet.svelte';
  import { templateFromSession } from '../lib/templates';
  import { Catalog } from '../engine';
  import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Ellipsis, Dumbbell, Link2, Plus, Trash2 } from '@lucide/svelte';
  import ActionMenu from '../components/ActionMenu.svelte';
  import ExercisePage from '../components/ExercisePage.svelte';
  import ExercisePicker from '../components/ExercisePicker.svelte';
  import ExerciseThumb from '../components/ExerciseThumb.svelte';
  import RestTimerBar from '../components/RestTimerBar.svelte';
  import RatePrompt from '../components/RatePrompt.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { dayTitle } from '../lib/labels';
  import { type SessionExercise, exerciseOf, isComplete, session, setProgress, supersetOf } from '../lib/session.svelte';
  import { app } from '../lib/store.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { minSec } from '../lib/units';
  import { saving } from '../lib/saving.svelte';
  import { liveRecords } from '../lib/records';
  import { groupLabel, linkedToNext, members, nextInRound } from '../lib/groups';

  let adding = $state(false);
  let swapping = $state(false);
  let savingTemplate = $state(false);
  let overview = $state(false);
  let reviewing = $state(false);
  let scroller = $state<HTMLDivElement>();
  let tick = $state(Date.now());
  // Once ever: point out that you can swipe between exercises.
  $effect(() => {
    if (ws.exercises.length > 1 && !app.get('swipeHintShown')) {
      app.set('swipeHintShown', true);
      setTimeout(() => toasts.show('Tip: swipe left or right to move between exercises'), 900);
    }
  });
  $effect(() => { const t = setInterval(() => (tick = Date.now()), 1000); return () => clearInterval(t); });

  // iOS keeps the layout viewport full height when the keyboard opens, so a full-screen logger would
  // sit under it. Fit the logger to the visible area instead, which keeps the Log button just above
  // the keyboard. The rest timer steps aside while typing to leave room.
  let viewport = $state<{ height: number; top: number } | null>(null);
  const keyboardOpen = $derived(viewport !== null && viewport.height < innerHeight - 120);
  $effect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      viewport = { height: vv.height, top: vv.offsetTop };
      // Keep the field being typed in on screen once the logger has shrunk.
      const field = document.activeElement;
      if (field instanceof HTMLInputElement && scroller?.contains(field)) requestAnimationFrame(() => field.scrollIntoView({ block: 'nearest' }));
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => { vv.removeEventListener('resize', sync); vv.removeEventListener('scroll', sync); };
  });

  const ws = $derived(session.state!);
  const index = $derived(Math.min(ws.currentIndex, Math.max(0, ws.exercises.length - 1)));
  const current = $derived(ws.exercises[index]);
  const title = $derived(ws.title ?? (ws.focus ? dayTitle(ws.focus) : 'Workout'));

  function go(i: number) {
    session.goTo(i);
    scroller?.scrollTo({ top: 0 });
  }

  function discard() {
    const snapshot = session.discard();
    if (snapshot) toasts.show('Workout discarded', () => { if (!session.restore(snapshot)) toasts.show("Can't undo: another workout has started"); });
  }

  const add = (e: ReturnType<typeof Catalog.exercise>) => session.addExercise(app.planner().prescribe(e));

  function remove(x: SessionExercise) {
    const undo = session.removeExercise(x.id);
    if (undo) toasts.show(`Removed ${exerciseOf(x).name}`, undo);
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

  // Personal records as they happen: a toast and a buzz the moment a set beats your best.
  const live = $derived(new Map(ws.exercises.flatMap((x) =>
    [...liveRecords(x.sets, app.derivedHistory.bestOneRM.get(x.exerciseID), x.rir)].map(([id, e1rm]) => [id, { x, e1rm }] as const))));
  /** Records already shown, so reopening the logger or editing a set doesn't announce one twice. */
  let announced: Set<string> | null = null;
  $effect(() => {
    const ids = [...live.keys()];
    if (!announced) { announced = new Set(ids); return; }
    for (const id of ids) {
      if (announced.has(id)) continue;
      announced.add(id);
      const r = live.get(id)!;
      navigator.vibrate?.([30, 40, 30, 40, 60]);
      toasts.show(`New PR · ${exerciseOf(r.x).name} · est. 1RM ${app.units.format(r.e1rm)}`);
    }
  });

  // Finish review
  const done = $derived(ws.exercises.flatMap((x) => x.sets).filter((s) => !s.isWarmup && s.done));
  const pending = $derived(ws.exercises.flatMap((x) => x.sets).filter((s) => !s.isWarmup && !s.done).length);
  const volume = $derived(done.reduce((t, s) => t + (s.weight ?? 0) * s.reps, 0));

  let saveFailed = $state(false);
  async function save() {
    saveFailed = false;
    const records = await session.finish();
    if (records === undefined) return; // a second tap while the first save runs: that one reports
    if (records === null) saveFailed = true; // Still open, with every set intact.
    else reviewing = false;
  }

  // Discarding loses logged sets, so ask first when there are any.
  let confirmingDiscard = $state(false);
  const loggedCount = $derived(ws.exercises.flatMap((x) => x.sets).filter((s) => s.done).length);
  function askDiscard() { if (loggedCount) confirmingDiscard = true; else discard(); }
</script>

<div class="logger" class:typing={keyboardOpen} role="dialog" aria-modal="true" aria-label={title}
  style={keyboardOpen && viewport ? `bottom:auto;height:${viewport.height}px;top:${viewport.top}px` : ''}>
  <header class="head">
    <button class="icon-btn" aria-label="Minimize workout" onclick={() => (session.isExpanded = false)}><ChevronDown size={20} /></button>
    <div class="center">
      <div class="title one-line">{title}</div>
      <div class="num elapsed" aria-label="Elapsed time">{minSec((tick - ws.startedAt) / 1000)}</div>
    </div>
    <ActionMenu label="Workout options" class="icon-btn" items={[
      { label: 'Reorder & group exercises', action: () => (overview = true) },
      { label: 'Swap this exercise', action: () => (swapping = true) },
      { label: 'Add exercise', action: () => (adding = true) },
      { label: 'Save as a workout', action: () => (savingTemplate = true) },
      { label: 'Discard workout', danger: true, action: askDiscard },
    ]}><Ellipsis size={18} /></ActionMenu>
    <button class="btn primary finish" onclick={() => (reviewing = true)}>Finish</button>
  </header>

  {#if ws.exercises.length}
    <div class="pos">
      <button class="step" aria-label="Previous exercise" disabled={index === 0} onclick={() => go(index - 1)}><ChevronLeft size={16} /></button>
      <span class="eyebrow">Exercise {index + 1} of {ws.exercises.length}</span>
      <button class="step" aria-label="Next exercise" disabled={index >= ws.exercises.length - 1} onclick={() => go(index + 1)}><ChevronRight size={16} /></button>
    </div>
  {/if}
  <div class="strip" role="tablist" aria-label="Exercises">
    {#each ws.exercises as x, i (x.id)}
      <button role="tab" aria-selected={i === index} aria-label="{exerciseOf(x).name}{isComplete(x) ? ', done' : ''}" onclick={() => go(i)}>
        <span class="seg" class:now={i === index} class:complete={isComplete(x)}
          class:pair-start={!!supersetOf(x) && ws.exercises[i + 1] && supersetOf(ws.exercises[i + 1]) === supersetOf(x)}
          class:pair-end={!!supersetOf(x) && ws.exercises[i - 1] && supersetOf(ws.exercises[i - 1]) === supersetOf(x)}></span>
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
        {@const g = supersetOf(current)}
        {@const m = g ? members(ws, g) : []}
        {@const step = nextInRound(ws, index)}
        {@const rounds = Math.max(...m.map((i) => setProgress(ws.exercises[i]).total), 0)}
        <ExercisePage exercise={current} nextName={ws.exercises[index + 1] ? exerciseOf(ws.exercises[index + 1]).name : undefined}
          onswap={() => (swapping = true)}
          group={m.length >= 2 ? {
            label: groupLabel(m.length), position: m.indexOf(index) + 1, size: m.length, rounds,
            round: Math.min(rounds, setProgress(current).next),
            next: step.next !== undefined ? { name: exerciseOf(ws.exercises[step.next]).name, newRound: step.endOfRound, go: () => go(step.next!) } : undefined,
          } : undefined}
          onNext={() => go(index + 1)} onFinish={() => (reviewing = true)} />
      {/key}
    {/if}
  </div>

  <div class="rest"><RatePrompt /><RestTimerBar /></div>
</div>

{#if reviewing}
  <Sheet title="Finish Workout" onclose={() => (reviewing = false)}>
    {#snippet leading()}<button class="link" onclick={() => (reviewing = false)}>Keep Going</button>{/snippet}
    <div class="stack" style="--gap:18px">
      <div class="card tight row stats">
        <div><b class="num">{Math.floor((session.endedAt(tick) - ws.startedAt) / 60000)} min</b><span class="caption muted">duration</span></div>
        <div><b class="num">{done.length}</b><span class="caption muted">sets logged</span></div>
        <div><b class="num">{volume > 0 ? app.units.format(volume) : '–'}</b><span class="caption muted">volume</span></div>
      </div>
      {#if saveFailed}
        <div class="card stack save-failed" role="alert">
          <div class="row bold" style="--gap:8px;color:var(--fatigued)"><CircleAlert size={20} /> Your workout wasn't saved</div>
          <p class="sub muted">{saving.lastFailure ?? "Forge couldn't save to this device."} The workout is still open and every set is kept. Free up some space if you can, then try again.</p>
        </div>
      {/if}
      {#if pending > 0}
        <div class="card stack">
          <div class="row bold" style="--gap:8px;color:var(--recovering)"><CircleAlert size={20} /> {pending} planned {pending === 1 ? "set wasn't" : "sets weren't"} logged</div>
          <p class="sub muted">Did you do them? Logging them keeps your recovery and progression accurate.</p>
          <!-- Equal weight: logging sets you didn't do would skew progression as much as missing ones. -->
          <button class="btn block big" disabled={session.saving} onclick={() => { session.logRemainingAsPlanned(); save(); }}>I did them, log as planned</button>
          <!-- A workout with no working sets would only add noise to history and recovery. -->
          <button class="btn block big" disabled={!done.length || session.saving} onclick={save}>{done.length ? 'Save without them' : 'Nothing logged to save'}</button>
        </div>
      {:else}
        <button class="btn primary block big" disabled={!done.length || session.saving} onclick={save}>{saveFailed ? 'Try Again' : 'Save Workout'}</button>
      {/if}
    </div>
  </Sheet>
{/if}

{#if confirmingDiscard}
  <Sheet title="Discard Workout?" onclose={() => (confirmingDiscard = false)}>
    {#snippet leading()}<span></span>{/snippet}
    <div class="stack" style="--gap:14px">
      <p class="sub muted">{loggedCount} logged {loggedCount === 1 ? 'set' : 'sets'} will be thrown away and won't count toward your history or recovery.</p>
      <button class="btn primary block big" onclick={() => (confirmingDiscard = false)}>Keep Training</button>
      <button class="btn block big danger" onclick={() => { confirmingDiscard = false; discard(); }}>Discard Workout</button>
    </div>
  </Sheet>
{/if}

{#if overview}
  <Sheet title="Exercises" onclose={() => (overview = false)}>
    {#snippet leading()}<span></span>{/snippet}
    {#snippet trailing()}<button class="link bold" onclick={() => (overview = false)}>Done</button>{/snippet}
    <p class="caption muted" style="margin:0 4px 10px">Link exercises to do them in rotation, one set of each per round: two make a superset, three a tri-set, more a circuit.</p>
    <div class="list">
      {#each ws.exercises as x, i (x.id)}
        {@const w = x.sets.filter((s) => !s.isWarmup)}
        {@const g = supersetOf(x)}
        {@const linked = linkedToNext(ws, i)}
        {#if g && (i === 0 || supersetOf(ws.exercises[i - 1]) !== g)}
          {@const size = members(ws, g).length}
          <div class="group-head"><span class="kicker">{groupLabel(size).toUpperCase()}</span><span class="caption muted">{size} exercises · one set of each per round</span></div>
        {/if}
        <div class="item" class:grouped={!!g}>
          <button class="row grow" style="text-align:left" onclick={() => { go(i); overview = false; }}>
            <ExerciseThumb exercise={exerciseOf(x)} size={44} />
            <span class="grow"><span>{exerciseOf(x).name}</span><br /><span class="caption muted mono">{w.filter((s) => s.done).length}/{w.length} sets</span></span>
            {#if isComplete(x)}<CircleCheck size={20} color="var(--fresh)" aria-label="Done" />{/if}
          </button>
          <button class="icon-btn plain" aria-label="Move {exerciseOf(x).name} up" disabled={i === 0} onclick={() => session.moveExercise(x.id, -1)}><ArrowUp size={18} /></button>
          <button class="icon-btn plain" aria-label="Move {exerciseOf(x).name} down" disabled={i === ws.exercises.length - 1} onclick={() => session.moveExercise(x.id, 1)}><ArrowDown size={18} /></button>
          <button class="icon-btn" style="color:var(--fatigued)" aria-label="Remove {exerciseOf(x).name}" onclick={() => remove(x)}><Trash2 size={18} /></button>
        </div>
        {#if i < ws.exercises.length - 1}
          {@const nextName = exerciseOf(ws.exercises[i + 1]).name}
          <div class="link-row" class:linked>
            <button class="link-btn" aria-pressed={linked}
              aria-label={linked ? `Unlink ${exerciseOf(x).name} from ${nextName}` : `Link ${exerciseOf(x).name} with ${nextName}`}
              onclick={() => (linked ? session.unlinkFromNext(x.id) : session.linkWithNext(x.id))}>
              {#if linked}<Link2 size={14} /> Linked<span class="faint"> · tap to unlink</span>{:else}<Plus size={14} /> Link with next{/if}
            </button>
          </div>
        {/if}
      {/each}
      <button class="item link" onclick={() => { overview = false; adding = true; }}>Add Exercise</button>
    </div>
  </Sheet>
{/if}

{#if savingTemplate}
  <SaveTemplateSheet suggested={title} make={(n) => templateFromSession(n, ws.exercises)} onclose={() => (savingTemplate = false)} />
{/if}
{#if swapping && current}
  {@const c = current}
  <ExercisePicker title="Swap {exerciseOf(c).name}" exercises={app.planner().alternatives(exerciseOf(c), new Set(ws.exercises.map((x) => x.exerciseID)))}
    onpick={(e) => { if (session.swapExercise(c.id, e, app.planner())) toasts.show(`Swapped in ${e.name}`); }}
    onclose={() => (swapping = false)} />
{/if}
{#if adding}
  {@const inWorkout = new Set(ws.exercises.map((x) => x.exerciseID))}
  <ExercisePicker title="Add Exercise" exercises={Catalog.all.filter((e) => app.planner().isEligible(e) && !inWorkout.has(e.id))} allowCreate onpick={add} onclose={() => (adding = false)} />
{/if}

<style>
  .logger { position: fixed; inset: 0; z-index: 50; display: flex; flex-direction: column; animation: up 0.45s var(--ease);
    background: radial-gradient(80% 40% at 100% 0%, rgba(255, 90, 31, 0.14), transparent 70%), var(--bg); }
  .head { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 8px; padding: calc(var(--safe-top) + 8px) 14px 4px; }
  .center { text-align: center; min-width: 0; }
  .title { font-weight: 650; font-size: 0.95rem; }
  .elapsed { font-size: 0.78rem; color: var(--text-3); }
  .finish { min-height: 40px; padding: 8px 16px; }
  .pos { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 2px; }
  .step { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; color: var(--text-2); background: var(--surface-2); }
  .strip { display: flex; gap: 5px; padding: 0 18px; }
  /* Thin bars, tall enough to tap. */
  .strip button { flex: 1; padding: 14px 0; }
  .seg { display: block; height: 4px; border-radius: 3px; background: var(--surface-3); transition: background 0.3s, box-shadow 0.3s; }
  .seg.now { background: var(--ember-gradient); box-shadow: 0 0 10px var(--ember-glow); }
  .seg.complete { background: var(--fresh); }
  /* Superset pairs read as one joined segment. */
  .strip button:has(.pair-start) { padding-right: 0; margin-right: -5px; }
  .seg.pair-start { border-radius: 3px 0 0 3px; }
  .seg.pair-end { border-radius: 0 3px 3px 0; }
  .seg.pair-start.pair-end { border-radius: 0; }
  /* Grouped exercises in the overview: a rail down the left joins them. */
  .group-head { display: flex; align-items: baseline; gap: 8px; padding: 12px 16px 2px; color: var(--ember-2); }
  .item.grouped { box-shadow: inset 3px 0 0 var(--ember); }
  .link-row { display: flex; justify-content: center; padding: 2px 0; }
  .link-row.linked { box-shadow: inset 3px 0 0 var(--ember); }
  .list > .link-row, .list > .link-row + .item { border-top: 0; }
  .link-btn { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 14px; border-radius: 999px;
    font-size: 0.8rem; font-weight: 600; color: var(--text-2); }
  .linked .link-btn { color: var(--ember-2); }
  .scroll { flex: 1; overflow-y: auto; padding: 10px 18px 0; -webkit-overflow-scrolling: touch; }
  .scroll > :global(*) { max-width: 620px; margin: 0 auto; }
  .rest { padding-bottom: var(--safe-bottom); }
  .rest:empty, .typing .rest { display: none; }
  .save-failed { border-color: rgba(255, 77, 109, 0.4); }
  .empty { align-items: center; text-align: center; padding-top: 22vh; }
  .stats > div { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .stats > div + div { border-left: 1px solid var(--hairline); }
  .stats b { font-size: 1.35rem; white-space: nowrap; }
  @keyframes up { from { transform: translateY(40px); opacity: 0; } }
</style>
