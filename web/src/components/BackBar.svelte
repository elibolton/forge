<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ChevronLeft } from '@lucide/svelte';
  import { nav } from '../lib/nav.svelte';

  let { title, trailing }: { title: string; trailing?: Snippet } = $props();
</script>

<header class="topbar">
  <button class="row link" style="--gap:0;min-width:80px;min-height:44px" onclick={() => nav.pop()} aria-label="Back"><ChevronLeft /> Back</button>
  <h1 class="title" style="font-size:1rem">{title}</h1>
  <div class="row" style="min-width:80px;justify-content:flex-end">{#if trailing}{@render trailing()}{/if}</div>
</header>
