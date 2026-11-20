/**
 * How a − or + button turns presses into steps. A tap steps on click, so a VoiceOver double-tap (which
 * may send a click with no pointer press before it) works like any other. Holding a finger down
 * repeats, faster the longer it's held; the click that ends a hold is then ignored, since the hold
 * already stepped.
 */
export class StepperPress {
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** When the last hold that stepped ended (or its latest step, while one is running). */
  private heldAt = 0;
  private holding = false;

  constructor(private step: () => void, private now: () => number = Date.now) {}

  /** A finger (or mouse button) went down: start the hold timer, without stepping yet. */
  down() {
    this.cancel();
    let n = 0;
    const repeat = () => {
      this.holding = true;
      this.heldAt = this.now();
      this.step();
      n++;
      this.timer = setTimeout(repeat, n < 6 ? 140 : n < 16 ? 80 : 45);
    };
    this.timer = setTimeout(repeat, 420);
  }

  /** The finger lifted or left: stop repeating. */
  up() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.holding) this.heldAt = this.now();
    this.holding = false;
  }

  /** Clears the hold entirely, e.g. on pointercancel (no click follows that). */
  cancel() {
    this.up();
    this.heldAt = 0;
  }

  /** A click: step, unless it's the one that ends a hold that already stepped. */
  click() {
    const afterHold = this.heldAt !== 0 && this.now() - this.heldAt < 600;
    this.heldAt = 0;
    if (!afterHold) this.step();
  }
}
