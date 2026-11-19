<script lang="ts">
  import { recoveryStatus } from '../engine';

  let { value, size = 64, width = 6 }: { value: number; size?: number; width?: number } = $props();
  const r = $derived((size - width) / 2);
  const c = $derived(2 * Math.PI * r);
  const color = $derived(`var(--${recoveryStatus(value)})`);
  const pct = $derived(Math.round(value * 100));
</script>

<svg width={size} height={size} viewBox="0 0 {size} {size}" role="img" aria-label="{pct} percent recovered">
  <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="var(--raised)" stroke-width={width} />
  <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke={color} stroke-width={width} stroke-linecap="round"
    stroke-dasharray="{c * Math.max(0.02, value)} {c}" transform="rotate(-90 {size / 2} {size / 2})" />
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="currentColor"
    font-size={size * 0.24} font-weight="700" style="font-variant-numeric: tabular-nums">{pct}%</text>
</svg>
