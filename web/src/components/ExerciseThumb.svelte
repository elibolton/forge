<script lang="ts">
  import type { Exercise } from '../engine';
  import { Dumbbell, Footprints, PersonStanding, Rows3, ArrowUpFromLine, ArrowDownToLine, Cable, Activity, Flower2, MoveHorizontal } from '@lucide/svelte';

  /** Stand-in for exercise photos: a tile tinted by body region with a movement icon. */
  let { exercise, size = 60 }: { exercise: Exercise; size?: number } = $props();

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

  const tint = $derived.by(() => {
    switch (exercise.primary[0] ?? 'chest') {
      case 'chest': case 'shoulders': case 'triceps': return '255, 115, 64';
      case 'lats': case 'upperBack': case 'biceps': case 'forearms': return '77, 140, 255';
      case 'abs': case 'lowerBack': return '51, 199, 191';
      default: return '158, 102, 255';
    }
  });
</script>

<div class="thumb" aria-hidden="true"
  style="width:{size}px;height:{size}px;border-radius:{size * 0.27}px;background:linear-gradient(135deg, rgba({tint},0.9), rgba({tint},0.35))">
  <Icon size={size * 0.42} strokeWidth={2.2} color="#fff" />
</div>

<style>
  .thumb { display: grid; place-items: center; flex: none; }
</style>
