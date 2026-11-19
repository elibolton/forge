<script lang="ts">
  import { type Muscle, type MuscleMap, muscleName, recoveryStatus } from '../engine';

  /**
   * Front and back mannequins with each muscle lit by recovery. When `highlight` is given (today's targets),
   * other muscles fade back. Tapping a muscle calls `onpick`.
   */
  let { recovery, highlight, onpick, size = 130 }: {
    recovery: MuscleMap; highlight?: Muscle[]; onpick?: (m: Muscle) => void; size?: number;
  } = $props();

  type Part =
    | { m: Muscle | null; k: 'e'; cx: number; cy: number; rx: number; ry: number; r?: number }
    | { m: Muscle | null; k: 'p'; d: string }
    | { m: Muscle | null; k: 'c'; x: number; y: number; w: number; h: number; r: number };

  /** Right-side part plus its mirror image across x = 50. */
  const both = (f: (s: 1 | -1, x: (v: number) => number) => Part): Part[] =>
    [f(1, (v) => v), f(-1, (v) => 100 - v)];

  // Mannequin: neutral capsules the muscles sit on.
  const body: Part[] = [
    { m: null, k: 'e', cx: 50, cy: 13, rx: 7.5, ry: 9 },
    { m: null, k: 'p', d: 'M46,20 h8 v10 h-8 z' },
    { m: null, k: 'p', d: 'M33,33 Q50,27 67,33 L68,45 Q66,63 61.5,80 L63,93 Q50,100 37,93 L38.5,80 Q34,63 32,45 Z' },
    ...both((s, x) => ({ m: null, k: 'c', x: x(71), y: 35, w: 10, h: 30, r: -10 * s })),
    ...both((s, x) => ({ m: null, k: 'c', x: x(75.6), y: 63, w: 8.6, h: 29, r: -7 * s })),
    ...both((s, x) => ({ m: null, k: 'e', cx: x(79.6), cy: 96, rx: 3.6, ry: 5 })),
    ...both((s, x) => ({ m: null, k: 'c', x: x(56.5), y: 91, w: 14, h: 46, r: 2 * s })),
    ...both((s, x) => ({ m: null, k: 'c', x: x(56), y: 135, w: 10.5, h: 42, r: 0 })),
    ...both((s, x) => ({ m: null, k: 'e', cx: x(57), cy: 179, rx: 5, ry: 3 })),
  ];

  const front: Part[] = [
    ...body,
    ...both((s, x) => ({ m: 'sideDelts', k: 'e', cx: x(70.4), cy: 38.6, rx: 4.4, ry: 6.4, r: -12 * s })),
    ...both((s, x) => ({ m: 'frontDelts', k: 'e', cx: x(66), cy: 38, rx: 4, ry: 6 })),
    ...both((s, x) => ({ m: 'chest', k: 'p', d: `M${x(50.6)},36 Q${x(62)},33 ${x(63.5)},40 Q${x(63)},50 ${x(52)},51 Q${x(50.6)},50 ${x(50.6)},47 Z` })),
    ...both((s, x) => ({ m: 'biceps', k: 'e', cx: x(73.4), cy: 50.5, rx: 3.9, ry: 9.5, r: -10 * s })),
    ...both((s, x) => ({ m: 'forearms', k: 'e', cx: x(77.4), cy: 77, rx: 3.5, ry: 11, r: -7 * s })),
    { m: 'abs', k: 'c', x: 50, y: 53, w: 12, h: 32, r: 0 },
    ...both((s, x) => ({ m: 'abductors', k: 'e', cx: x(62.5), cy: 95, rx: 2.8, ry: 6 })),
    ...both((s, x) => ({ m: 'quads', k: 'e', cx: x(57.6), cy: 113, rx: 5.6, ry: 17, r: 2 * s })),
    ...both((s, x) => ({ m: 'adductors', k: 'e', cx: x(52.4), cy: 104, rx: 2, ry: 8.5, r: 4 * s })),
  ];

  const back: Part[] = [
    ...body,
    { m: 'upperBack', k: 'p', d: 'M40,33 Q50,29 60,33 L63,40 Q57,50 50,55 Q43,50 37,40 Z' },
    ...both((s, x) => ({ m: 'sideDelts', k: 'e', cx: x(70.4), cy: 38.6, rx: 4.4, ry: 6.4, r: -12 * s })),
    ...both((s, x) => ({ m: 'rearDelts', k: 'e', cx: x(66), cy: 38, rx: 4, ry: 6 })),
    ...both((s, x) => ({ m: 'lats', k: 'p', d: `M${x(52)},55 Q${x(62)},44 ${x(64.5)},48 Q${x(64)},63 ${x(56)},77 Q${x(53)},66 ${x(52)},55 Z` })),
    ...both((s, x) => ({ m: 'triceps', k: 'e', cx: x(73.4), cy: 50.5, rx: 3.9, ry: 9.5, r: -10 * s })),
    ...both((s, x) => ({ m: 'forearms', k: 'e', cx: x(77.4), cy: 77, rx: 3.5, ry: 11, r: -7 * s })),
    { m: 'lowerBack', k: 'c', x: 50, y: 72, w: 11, h: 16, r: 0 },
    ...both((s, x) => ({ m: 'glutes', k: 'e', cx: x(56.4), cy: 98, rx: 6.6, ry: 7.4 })),
    ...both((s, x) => ({ m: 'hamstrings', k: 'e', cx: x(57.4), cy: 121, rx: 5.2, ry: 14, r: 2 * s })),
    ...both((s, x) => ({ m: 'calves', k: 'e', cx: x(56), cy: 151, rx: 4.4, ry: 12 })),
  ];

  const views = [{ label: 'Front', parts: front }, { label: 'Back', parts: back }];

  const tone = (m: Muscle) => `var(--${recoveryStatus(recovery[m] ?? 1)})`;
  function alpha(m: Muscle): number {
    if (highlight && !highlight.includes(m)) return 0.1;
    // Fresh muscles glow softly; tired ones burn brighter so they stand out.
    return 0.5 + (1 - (recovery[m] ?? 1)) * 0.45;
  }
</script>

{#snippet shape(p: Part, attrs: Record<string, unknown>)}
  {#if p.k === 'e'}
    <ellipse cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} transform={p.r ? `rotate(${p.r} ${p.cx} ${p.cy})` : undefined} {...attrs} />
  {:else if p.k === 'c'}
    <rect x={p.x - p.w / 2} y={p.y} width={p.w} height={p.h} rx={p.w / 2} transform={p.r ? `rotate(${p.r} ${p.x} ${p.y})` : undefined} {...attrs} />
  {:else}
    <path d={p.d} {...attrs} />
  {/if}
{/snippet}

<div class="map">
  {#each views as v (v.label)}
    <figure>
      <svg viewBox="16 0 68 186" width={size} role="img" aria-label="{v.label} view">
        <defs>
          <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#2a2a31" /><stop offset="1" stop-color="#18181c" />
          </linearGradient>
          <filter id="bloom" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.4" /></filter>
        </defs>
        {#each v.parts.filter((p) => !p.m) as p, i (i)}{@render shape(p, { fill: 'url(#skin)' })}{/each}
        <g filter="url(#bloom)">
          {#each v.parts.filter((p) => p.m) as p, i (i)}{@render shape(p, { fill: tone(p.m!), 'fill-opacity': alpha(p.m!) * 0.55 })}{/each}
        </g>
        {#each v.parts.filter((p) => p.m) as p, i (i)}
          {@const m = p.m!}
          {#if onpick}
            {@render shape(p, {
              fill: tone(m), 'fill-opacity': alpha(m), stroke: 'rgba(255,255,255,0.18)', 'stroke-width': 0.4, class: 'hit',
              role: 'button', tabindex: 0, 'aria-label': `${muscleName(m)}, ${Math.round((recovery[m] ?? 1) * 100)} percent recovered`,
              onclick: () => onpick(m), onkeydown: (ev: KeyboardEvent) => ev.key === 'Enter' && onpick(m),
            })}
          {:else}
            {@render shape(p, { fill: tone(m), 'fill-opacity': alpha(m), stroke: 'rgba(255,255,255,0.14)', 'stroke-width': 0.4 })}
          {/if}
        {/each}
      </svg>
      <figcaption class="eyebrow">{v.label}</figcaption>
    </figure>
  {/each}
</div>

<style>
  .map { display: flex; justify-content: center; gap: 18px; }
  figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  svg { height: auto; max-width: 42vw; overflow: visible; }
  :global(.hit) { cursor: pointer; transition: fill-opacity 0.2s; }
  :global(.hit:focus-visible) { outline: none; stroke: #fff; stroke-width: 1; }
</style>
