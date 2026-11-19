<script lang="ts">
  import { BadgeCheck } from '@lucide/svelte';
  let { detail }: { detail: string } = $props();
</script>

<div class="card tight row" style="--gap:14px">
  <BadgeCheck size={32} color="var(--fresh)" aria-hidden="true" />
  <div class="grow">
    <div class="bold">Trained today</div>
    <div class="sub muted">{detail}</div>
  </div>
</div>
