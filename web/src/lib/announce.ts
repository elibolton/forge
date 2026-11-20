// One polite live region for VoiceOver, inside the logger (content outside an aria-modal dialog can be
// hidden from VoiceOver, so a region at the page level might never be read while the logger is open).

let region: { textContent: string | null } | null = null;
let clearTimer: ReturnType<typeof setTimeout> | undefined;
const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** The element `announce` writes to; returns the function that unregisters it. */
export function registerLiveRegion(el: { textContent: string | null }): () => void {
  region = el;
  return () => { if (region === el) region = null; };
}

/**
 * Says `text` through the live region. The region is emptied first, so saying the same thing twice
 * ("Rest over" after two rests) is still read.
 */
export function announce(text: string) {
  // Something newer to say: a stepper value still waiting would talk over it ("Set 2 logged").
  for (const t of pending.values()) clearTimeout(t);
  pending.clear();
  say(text);
}

function say(text: string) {
  const el = region;
  if (!el) return;
  clearTimeout(clearTimer);
  el.textContent = '';
  clearTimer = setTimeout(() => { el.textContent = text; }, 50);
}

/**
 * Like `announce`, but waits until `key` has gone quiet for `ms`, so holding + on a stepper says only
 * where it stopped rather than every value on the way.
 */
export function announceSoon(key: string, text: string, ms = 700) {
  clearTimeout(pending.get(key));
  pending.set(key, setTimeout(() => { pending.delete(key); say(text); }, ms));
}

/** "1 rep left", "2 reps left", "4 or more reps left", "no reps left". */
export function repsLeftText(n: number): string {
  if (n <= 0) return 'no reps left';
  if (n >= 4) return '4 or more reps left';
  return `${n} ${n === 1 ? 'rep' : 'reps'} left`;
}

/** The spoken name of a stepper's field: "Weight in lb", but just "Reps" rather than "Reps in reps". */
export function stepperLabel(title: string, unit: string): string {
  return title.toLowerCase() === unit.toLowerCase() ? title : `${title} in ${unit}`;
}
