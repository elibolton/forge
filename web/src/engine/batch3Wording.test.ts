import { describe, expect, test } from 'vitest';
import { Gyms, Planner, defaultPlan } from './index';

// Regression tests for batch 3 of the bug hunt: wording.
const now = 1_800_000_000_000;

describe('batch 3: fallback reason wording', () => {
  test('a no-equipment push day doesn\'t say nothing fits chest right under a push-up', () => {
    let checked = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const w = new Planner({ plan: defaultPlan({}), gym: Gyms.bodyweight(), history: [] }).generate({ now, seed, focus: 'push' });
      w.exercises.forEach((p, i) => {
        if (!p.exercise.primary.includes('chest')) return;
        const chestBefore = w.exercises.slice(0, i).some((x) => x.exercise.primary.includes('chest'));
        if (!chestBefore) return;
        checked++;
        expect(p.reasons.join(' ')).not.toContain('Nothing usual for chest');
      });
    }
    expect(checked).toBeGreaterThan(0);
  });
});
