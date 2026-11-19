<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title = '', onclose, children, trailing, leading, full = false }: {
    title?: string; onclose: () => void; children: Snippet; trailing?: Snippet; leading?: Snippet; full?: boolean;
  } = $props();

  let panel: HTMLDivElement;
  let body: HTMLDivElement;
  let scrim: HTMLDivElement;

  // Drag down to close: from the header anywhere, or from the content once it's scrolled to the top.
  let drag: { y: number; t: number; dy: number; active: boolean } | null = null;
  function start(e: TouchEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select')) return;
    const fromContent = body.contains(target);
    if (fromContent && body.scrollTop > 0) return;
    drag = { y: e.touches[0].clientY, t: performance.now(), dy: 0, active: false };
  }
  function move(e: TouchEvent) {
    if (!drag) return;
    const dy = e.touches[0].clientY - drag.y;
    if (!drag.active) {
      if (dy < -4) { drag = null; return; }   // scrolling up through content
      if (dy > 6) drag.active = true; else return;
    }
    e.preventDefault();
    drag.dy = Math.max(0, dy);
    panel.style.transition = 'none';
    panel.style.transform = `translateY(${drag.dy}px)`;
    scrim.style.opacity = `${1 - Math.min(1, drag.dy / 400)}`;
  }
  function end() {
    if (!drag) return;
    const { dy, t, active } = drag;
    drag = null;
    if (!active) return;
    const velocity = dy / Math.max(1, performance.now() - t);
    panel.style.transition = 'transform 0.3s var(--ease)';
    scrim.style.transition = 'opacity 0.3s';
    if (dy > 120 || velocity > 0.7) {
      panel.style.transform = 'translateY(100%)';
      scrim.style.opacity = '0';
      setTimeout(() => {
        onclose();
        // Still here (the close was refused, e.g. unsaved edits): spring back.
        setTimeout(() => { if (panel?.isConnected) { panel.style.transform = ''; scrim.style.opacity = ''; } }, 0);
      }, 220);
    } else {
      panel.style.transform = '';
      scrim.style.opacity = '';
    }
  }

  $effect(() => {
    panel.addEventListener('touchstart', start, { passive: true });
    panel.addEventListener('touchmove', move, { passive: false });
    panel.addEventListener('touchend', end);
    panel.addEventListener('touchcancel', end);
    return () => {
      panel.removeEventListener('touchstart', start);
      panel.removeEventListener('touchmove', move);
      panel.removeEventListener('touchend', end);
      panel.removeEventListener('touchcancel', end);
    };
  });

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

<div class="scrim" onclick={onclose} role="presentation" bind:this={scrim}></div>
<div class="sheet" class:full role="dialog" aria-modal="true" aria-label={title} tabindex="-1" bind:this={panel}>
  <div class="grabber" aria-hidden="true"></div>
  <header class="topbar">
    <div class="side">
      {#if leading}{@render leading()}{:else}<button class="link" onclick={onclose}>Cancel</button>{/if}
    </div>
    <div class="title">{title}</div>
    <div class="side end">{#if trailing}{@render trailing()}{/if}</div>
  </header>
  <div class="body" bind:this={body}>{@render children()}</div>
</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    z-index: 60; animation: fade 0.25s; }
  .sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 61; max-width: 680px; margin: 0 auto;
    background: linear-gradient(180deg, #17171b, #0e0e11 40%); border: 1px solid var(--hairline-2); border-bottom: 0;
    border-radius: 30px 30px 0 0; max-height: calc(100dvh - var(--safe-top) - 20px); display: flex; flex-direction: column;
    outline: none; box-shadow: 0 -30px 60px -20px rgba(0, 0, 0, 0.8); animation: rise 0.42s var(--ease); }
  .sheet.full { height: calc(100dvh - var(--safe-top) - 20px); }
  .grabber { width: 38px; height: 5px; border-radius: 3px; background: var(--surface-3); margin: 8px auto 0; flex: none; }
  header { padding: 2px 18px 0; flex: none; }
  .title { font-family: var(--font-display); font-stretch: 112%; font-weight: 750; }
  .side { width: 84px; display: flex; }
  .side.end { justify-content: flex-end; }
  .body { overscroll-behavior: contain; overflow-y: auto; padding: 10px 18px calc(var(--safe-bottom) + 28px); -webkit-overflow-scrolling: touch; flex: 1; }
  @keyframes rise { from { transform: translateY(60px); opacity: 0; } }
  @keyframes fade { from { opacity: 0; } }
</style>
