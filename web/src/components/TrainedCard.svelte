<script lang="ts">
  import { Check } from '@lucide/svelte';
  let { detail }: { detail: string } = $props();
</script>

<div class="done row" style="--gap:12px">
  <span class="tick" aria-hidden="true"><Check size={16} strokeWidth={3} /></span>
  <div class="grow">
    <div class="sub bold">Trained today</div>
    <div class="caption muted">{detail}</div>
  </div>
</div>

<style>
  .done { padding: 12px 14px; border-radius: var(--r-md); background: linear-gradient(90deg, rgba(60, 239, 176, 0.1), rgba(60, 239, 176, 0.02));
    border: 1px solid rgba(60, 239, 176, 0.2); }
  .tick { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: var(--fresh); color: #062b1e; flex: none;
    box-shadow: 0 0 18px rgba(60, 239, 176, 0.4); }
</style>
