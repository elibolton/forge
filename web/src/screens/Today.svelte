<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { dayKey } from '../lib/units';
  import GeneratorToday from './GeneratorToday.svelte';
  import ProgramToday from './ProgramToday.svelte';

  /** The day the user chose a generated workout over their program. */
  const usingGenerator = $derived(app.get<string>('generatorDay') === dayKey());
</script>

{#if app.activeProgram && !usingGenerator}
  <ProgramToday onUseGenerator={() => app.set('generatorDay', dayKey())} />
{:else}
  <GeneratorToday />
{/if}
