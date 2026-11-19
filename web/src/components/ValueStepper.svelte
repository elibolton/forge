<script lang="ts">
  import { Minus, Plus } from '@lucide/svelte';

  /**
   * A big numeral with − and + on either side; tap the number to type it. Typed numbers count as soon
   * as they're valid, so tapping Log straight from the keyboard logs what's on screen. Holding − or +
   * keeps stepping, faster the longer you hold.
   */
  let { title, value, step, unit, decimals, onchange, min = 0, max = Infinity }: {
    title: string; value: number; step: number; unit: string; decimals: boolean; onchange: (v: number) => void;
    /** Typed and stepped values are kept within these; a typo like 1000 for 100 can't be saved. */
    min?: number; max?: number;
  } = $props();

  // Hundredths, so a 1.25 kg microplate step or a converted load is kept as typed.
  const round = (v: number) => (decimals ? Math.round(v * 100) / 100 : Math.round(v));
  const clamp = (v: number) => Math.min(max, Math.max(min, round(v)));
  const shown = $derived(String(round(value)));

  // While typing, show exactly what was typed ("82." mid-entry) rather than the rounded value.
  let draft = $state<string | null>(null);
  const text = $derived(draft ?? shown);
  /** What's typed is below the minimum (or not a number): the minimum is what counts until it's fixed. */
  let invalid = $state(false);

  function input(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    draft = el.value;
    const raw = el.value.replace(',', '.');
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n)) { invalid = raw !== ''; return; }
    const committed = clamp(n);
    onchange(committed);
    invalid = n < min;
    // Show what will be saved: rounded reps, or the cap. A number under the minimum may still be on its
    // way to a valid one ("2" before "25"), so it's flagged instead and settles on blur.
    if (!invalid && committed !== n) {
      draft = String(committed);
      el.value = draft;
    }
  }

  // MARK: Hold to repeat

  let timer: ReturnType<typeof setTimeout> | undefined;
  const bump = (dir: 1 | -1) => onchange(clamp(value + dir * step));

  function hold(e: PointerEvent, dir: 1 | -1) {
    if (e.button !== 0) return;
    // Keeps the hold going if the finger drifts off the button.
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    bump(dir);
    let n = 0;
    const repeat = () => {
      bump(dir);
      n++;
      timer = setTimeout(repeat, n < 6 ? 140 : n < 16 ? 80 : 45);
    };
    timer = setTimeout(repeat, 420);
  }
  function release() { clearTimeout(timer); timer = undefined; }
  // Keyboard and assistive tech send a click with no pointer press before it.
  function click(e: MouseEvent, dir: 1 | -1) { if (e.detail === 0) bump(dir); }

  $effect(() => release);
</script>

<div class="dial">
  <span class="eyebrow" aria-hidden="true">{title}</span>
  <input class="num value" type="text" inputmode={decimals ? 'decimal' : 'numeric'} enterkeyhint="done" value={text} aria-label="{title} in {unit}"
    style="font-size:{text.length > 4 ? 2.1 : text.length > 3 ? 2.5 : 3.1}rem"
    class:invalid aria-invalid={invalid}
    oninput={input} onblur={() => { draft = null; invalid = false; }}
    onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
    onfocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
  <span class="caption muted" aria-hidden="true">{unit}</span>
  <div class="steps">
    <button aria-label="Decrease {title}" onpointerdown={(e) => hold(e, -1)} onpointerup={release} onpointercancel={release}
      onlostpointercapture={release} onclick={(e) => click(e, -1)}><Minus size={20} strokeWidth={2.6} /></button>
    <button aria-label="Increase {title}" onpointerdown={(e) => hold(e, 1)} onpointerup={release} onpointercancel={release}
      onlostpointercapture={release} onclick={(e) => click(e, 1)}><Plus size={20} strokeWidth={2.6} /></button>
  </div>
</div>

<style>
  .dial { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 14px 10px 10px;
    border-radius: var(--r-lg); background: rgba(0, 0, 0, 0.28); border: 1px solid var(--hairline); }
  .value { background: transparent !important; border: 0 !important; text-align: center; padding: 0 !important; min-height: 0 !important;
    height: 3.4rem; line-height: 1; font-stretch: 125%; font-weight: 800; letter-spacing: -0.03em; width: 100%; }
  .value.invalid { color: var(--fatigued); }
  .steps { display: flex; gap: 8px; width: 100%; margin-top: 10px; }
  .steps button { flex: 1; height: 48px; border-radius: 14px; display: grid; place-items: center; background: var(--surface-2);
    border: 1px solid var(--hairline); touch-action: manipulation; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
  .steps button:active { background: var(--surface-3); }
</style>
