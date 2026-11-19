<script lang="ts">
  import { CircleAlert } from '@lucide/svelte';
  import { dayTitle } from '../lib/labels';
  import { saving } from '../lib/saving.svelte';
  import { session } from '../lib/session.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { isSameDay } from '../lib/units';
  import Sheet from './Sheet.svelte';

  /**
   * A workout left open for hours: most likely finished without tapping Finish. Saving it here ends it
   * at the last change, so history doesn't get a 14-hour session.
   */
  const ws = $derived(session.state!);
  const title = $derived(ws.title ?? (ws.focus ? dayTitle(ws.focus) : 'Your workout'));
  const lastActive = $derived(session.staleSince ?? session.lastActiveAt);
  const doneSets = $derived(ws.exercises.flatMap((x) => x.sets).filter((s) => s.done && !s.isWarmup).length);
  let failed = $state(false);

  function ago(t: number): string {
    const h = Math.floor((Date.now() - t) / 3_600_000);
    if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
    const d = Math.floor(h / 24);
    return `${d} day${d === 1 ? '' : 's'} ago`;
  }
  /** "7:20 PM", or "Tue 7:20 PM" when it wasn't today. */
  const at = (t: number) => new Date(t).toLocaleString([], {
    ...(isSameDay(t, Date.now()) ? {} : { weekday: 'short' as const }), hour: 'numeric', minute: '2-digit',
  });

  async function finish() {
    failed = false;
    if ((await session.finish(lastActive)) === null) failed = true;
  }

  function discard() {
    const snapshot = structuredClone($state.snapshot(ws));
    session.discard();
    toasts.show('Workout discarded', () => session.restore(snapshot));
  }
</script>

<Sheet title="Still Training?" onclose={() => session.keepGoing()}>
  {#snippet leading()}<span></span>{/snippet}
  <div class="stack" style="--gap:14px">
    <p class="sub muted">
      {title} is still open. You last logged anything {ago(lastActive)}{doneSets ? `, with ${doneSets} working ${doneSets === 1 ? 'set' : 'sets'} done` : ''}.
    </p>
    {#if failed}
      <div class="row sub bold" role="alert" style="--gap:8px;color:var(--fatigued)">
        <CircleAlert size={18} /> {saving.lastFailure ?? "Forge couldn't save to this device."}
      </div>
    {/if}
    {#if doneSets}
      <button class="btn primary block big" disabled={session.saving} onclick={finish}>Save, Ended at {at(lastActive)}</button>
    {/if}
    <button class="btn block big" class:primary={!doneSets} onclick={() => session.keepGoing()}>Keep Training</button>
    <button class="btn block danger" onclick={discard}>Discard Workout</button>
  </div>
</Sheet>
