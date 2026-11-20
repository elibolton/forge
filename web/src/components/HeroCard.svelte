<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Play } from '@lucide/svelte';

  /**
   * The big card at the top of Today: what's next, its numbers, quick controls and the start button.
   * When the start button scrolls out of view, a floating one takes over.
   */
  let { eyebrow, title, stats, controls, top, startLabel, onstart, showStart = true }: {
    eyebrow: string; title: string; stats: { value: string; label: string }[];
    controls?: Snippet; top?: Snippet; startLabel: string; onstart: () => void; showStart?: boolean;
  } = $props();

  let startButton = $state<HTMLButtonElement>();
  let startVisible = $state(true);

  $effect(() => {
    if (!startButton) return;
    // Only fully clear of the tab bar counts, so Start is never half-hidden under it: the floating button takes over.
    const io = new IntersectionObserver(([entry]) => (startVisible = entry.isIntersecting && entry.intersectionRatio > 0.98),
      { rootMargin: '0px 0px -100px 0px', threshold: [0, 0.99, 1] });
    io.observe(startButton);
    return () => io.disconnect();
  });
</script>

<section class="hero">
  <div class="mesh" aria-hidden="true"></div>
  <div class="content stack" style="--gap:18px">
    {#if top}{@render top()}{/if}
    <div class="stack" style="--gap:8px">
      <span class="eyebrow" style="color:var(--ember-2)">{eyebrow}</span>
      <h1 class="display title">{title}</h1>
    </div>
    <div class="stats">
      {#each stats as s (s.label)}
        <div class="stat"><span class="num value">{s.value}</span><span class="eyebrow">{s.label}</span></div>
      {/each}
    </div>
    {#if controls}<div class="controls">{@render controls()}</div>{/if}
    {#if showStart}
      <button class="btn primary block big start" bind:this={startButton} onclick={onstart}>
        <span class="play"><Play size={16} fill="currentColor" /></span> {startLabel}
      </button>
    {/if}
  </div>
</section>

{#if showStart && !startVisible}
  <button class="fab" onclick={onstart}><Play size={18} fill="currentColor" /> {startLabel}</button>
{/if}

<style>
  .hero { position: relative; border-radius: var(--r-xl); overflow: hidden; border: 1px solid var(--hairline-2);
    background: linear-gradient(165deg, #1d1410 0%, #121014 45%, #0d0d10 100%);
    box-shadow: 0 30px 60px -30px rgba(255, 90, 31, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.07); }
  .mesh { position: absolute; inset: 0; pointer-events: none;
    background:
      radial-gradient(70% 60% at 100% 0%, rgba(255, 90, 31, 0.45), transparent 60%),
      radial-gradient(50% 50% at 85% 20%, rgba(255, 166, 70, 0.22), transparent 70%),
      radial-gradient(60% 50% at 0% 100%, rgba(255, 90, 31, 0.08), transparent 70%); }
  .mesh::after { content: ''; position: absolute; inset: 0; opacity: 0.35; mix-blend-mode: overlay;
    background-image: radial-gradient(rgba(255, 255, 255, 0.5) 0.6px, transparent 0.6px); background-size: 3px 3px; }
  .content { position: relative; padding: 22px 20px 20px; }
  .title { font-size: clamp(2.3rem, 11vw, 3.1rem); line-height: 0.95; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--hairline); padding-top: 14px; }
  .stat { display: flex; flex-direction: column; gap: 4px; }
  .stat + .stat { padding-left: 14px; border-left: 1px solid var(--hairline); }
  .value { font-size: 1.6rem; line-height: 1; }
  .stat .eyebrow { font-stretch: 100%; letter-spacing: 0.08em; font-size: 0.62rem; }
  /* Wraps rather than scrolls sideways: at phone width a scrolling row cut the gym chip off mid-word. */
  .controls { display: flex; flex-wrap: wrap; gap: 8px; }
  .start { margin-top: 2px; }
  .play { width: 28px; height: 28px; border-radius: 50%; background: rgba(26, 11, 5, 0.14); display: grid; place-items: center; }
</style>
