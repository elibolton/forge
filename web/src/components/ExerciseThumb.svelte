<script lang="ts">
  import type { Exercise } from '../engine';
  import { Activity, ArrowDownToLine, ArrowUpFromLine, Cable, Dumbbell, Flower2, Footprints, MoveHorizontal, PersonStanding, Rows3 } from '@lucide/svelte';

  /** Stand-in for exercise photos: a dark tile lit by body region, with a movement glyph. */
  let { exercise, size = 56 }: { exercise: Exercise; size?: number } = $props();

  const Icon = $derived.by(() => {
    switch (exercise.pattern) {
      case 'squat': return ArrowDownToLine;
      case 'hinge': return Rows3;
      case 'lunge': return Footprints;
      case 'verticalPush': return ArrowUpFromLine;
      case 'horizontalPull': case 'verticalPull': return MoveHorizontal;
      case 'isolation': return exercise.equipment.includes('cable') ? Cable : Dumbbell;
      case 'core': return Activity;
      case 'carry': return PersonStanding;
      case 'mobility': return Flower2;
      default: return Dumbbell;
    }
  });

  /** Push warm, pull cool, legs violet, core teal. */
  const tint = $derived.by(() => {
    switch (exercise.primary[0] ?? 'chest') {
      case 'chest': case 'shoulders': case 'triceps': return '255, 112, 52';
      case 'lats': case 'upperBack': case 'biceps': case 'forearms': return '92, 150, 255';
      case 'abs': case 'lowerBack': return '60, 220, 200';
      default: return '170, 120, 255';
    }
  });
</script>

<div class="thumb" aria-hidden="true" style="--t:{tint};width:{size}px;height:{size}px;border-radius:{size * 0.32}px">
  <Icon size={size * 0.4} strokeWidth={2} color="rgb({tint})" />
</div>

<style>
  .thumb { display: grid; place-items: center; flex: none; position: relative;
    background:
      radial-gradient(120% 120% at 20% 0%, rgba(var(--t), 0.32), transparent 60%),
      linear-gradient(160deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.015));
    border: 1px solid rgba(var(--t), 0.22); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06); }
</style>
