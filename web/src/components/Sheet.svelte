<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title = '', onclose, children, trailing, leading, full = false }: {
    title?: string; onclose: () => void; children: Snippet; trailing?: Snippet; leading?: Snippet; full?: boolean;
  } = $props();

  let panel: HTMLDivElement;

  $effect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onclose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  });
</script>

<div class="scrim" onclick={onclose} role="presentation"></div>
<div class="sheet" class:full role="dialog" aria-modal="true" aria-label={title} tabindex="-1" bind:this={panel}>
  <header class="topbar">
    <div class="side">
      {#if leading}{@render leading()}{:else}<button class="link" onclick={onclose}>Cancel</button>{/if}
    </div>
    <div class="title">{title}</div>
    <div class="side end">{#if trailing}{@render trailing()}{/if}</div>
  </header>
  <div class="body">{@render children()}</div>
</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55); z-index: 60; animation: fade 0.2s; }
  .sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 61; background: #111113; border-radius: 16px 16px 0 0;
    max-height: calc(100dvh - var(--safe-top) - 24px); display: flex; flex-direction: column; outline: none;
    max-width: 720px; margin: 0 auto; animation: rise 0.25s ease-out; }
  .sheet.full { height: calc(100dvh - var(--safe-top) - 24px); }
  header { padding: 8px 16px 0; flex: none; }
  .side { width: 80px; display: flex; }
  .side.end { justify-content: flex-end; }
  .body { overflow-y: auto; padding: 8px 16px calc(var(--safe-bottom) + 24px); -webkit-overflow-scrolling: touch; flex: 1; }
  @keyframes rise { from { transform: translateY(40px); opacity: 0; } }
  @keyframes fade { from { opacity: 0; } }
</style>
