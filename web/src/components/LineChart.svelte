<script lang="ts">
  /** A small multi-series line chart: dates on x, values on y. */
  interface Series { name: string; points: { x: number; y: number }[] }
  let { series, height = 200, unit = '', label }: { series: Series[]; height?: number; unit?: string; label: string } = $props();

  const COLORS = ['#ff6b2e', '#4d8cff', '#5cdb9e', '#c08bff', '#ffc74d'];
  const W = 340, PAD_L = 36, PAD_R = 8, PAD_T = 8, PAD_B = 22;

  const all = $derived(series.flatMap((s) => s.points));
  const xMin = $derived(Math.min(...all.map((p) => p.x)));
  const xMax = $derived(Math.max(...all.map((p) => p.x)));
  const yLo = $derived(Math.min(...all.map((p) => p.y)));
  const yHi = $derived(Math.max(...all.map((p) => p.y)));
  const ticks = $derived.by(() => {
    const span = Math.max(1, yHi - yLo);
    const step = [1, 2, 5, 10, 20, 25, 50, 100].find((s) => span / s <= 4) ?? 200;
    const lo = Math.floor(yLo / step) * step, hi = Math.ceil(yHi / step) * step || step;
    const out: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += step) out.push(v);
    return out.length > 1 ? out : [lo, lo + step];
  });
  const sx = (x: number) => PAD_L + (xMax === xMin ? 0.5 : (x - xMin) / (xMax - xMin)) * (W - PAD_L - PAD_R);
  const sy = (y: number) => PAD_T + (1 - (y - ticks[0]) / (ticks[ticks.length - 1] - ticks[0])) * (height - PAD_T - PAD_B);
  const path = (pts: { x: number; y: number }[]) =>
    [...pts].sort((a, b) => a.x - b.x).map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  const dateLabel = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
</script>

<figure aria-label={label}>
  <svg viewBox="0 0 {W} {height}" width="100%" role="img" aria-label={label}>
    {#each ticks as t (t)}
      <line x1={PAD_L} x2={W - PAD_R} y1={sy(t)} y2={sy(t)} stroke="var(--line)" stroke-width="0.5" />
      <text x={PAD_L - 6} y={sy(t)} text-anchor="end" dominant-baseline="central" class="tick">{t}</text>
    {/each}
    <text x={PAD_L} y={height - 4} class="tick">{dateLabel(xMin)}</text>
    {#if xMax !== xMin}<text x={W - PAD_R} y={height - 4} text-anchor="end" class="tick">{dateLabel(xMax)}</text>{/if}
    {#each series as s, i (s.name)}
      <path d={path(s.points)} fill="none" stroke={COLORS[i % COLORS.length]} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      {#each s.points as p (p.x)}<circle cx={sx(p.x)} cy={sy(p.y)} r="3" fill={COLORS[i % COLORS.length]}><title>{s.name}: {p.y} {unit}, {dateLabel(p.x)}</title></circle>{/each}
    {/each}
  </svg>
  {#if series.length > 1}
    <figcaption class="row wrap caption" style="--gap:12px">
      {#each series as s, i (s.name)}<span class="row" style="--gap:5px"><i style="background:{COLORS[i % COLORS.length]}"></i>{s.name}</span>{/each}
    </figcaption>
  {/if}
</figure>

<style>
  figure { margin: 0; }
  .tick { font-size: 10px; fill: var(--muted); font-variant-numeric: tabular-nums; }
  i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
</style>
