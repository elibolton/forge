<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ChevronLeft } from '@lucide/svelte';
  import { nav } from '../lib/nav.svelte';

  let { title, trailing }: { title: string; trailing?: Snippet } = $props();
</script>

<header class="topbar">
  <div class="side"><button class="icon-btn" onclick={() => nav.pop()} aria-label="Back"><ChevronLeft size={20} /></button></div>
  <h1 class="title">{title}</h1>
  <div class="side end">{#if trailing}{@render trailing()}{/if}</div>
</header>

<style>
  .side { min-width: 64px; display: flex; }
  .side.end { justify-content: flex-end; }
  .title { font-family: var(--font-display); font-stretch: 112%; font-weight: 750; font-size: 1rem; }
</style>
