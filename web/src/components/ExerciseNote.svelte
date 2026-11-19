<script lang="ts">
  import { NotebookPen } from '@lucide/svelte';
  import { app } from '../lib/store.svelte';

  /** Your sticky note for an exercise, shown every time it comes up. Tap to edit; saves when you leave the field. */
  let { exerciseID }: { exerciseID: string } = $props();
  let editing = $state(false);
  let field = $state<HTMLTextAreaElement>();
  const note = $derived(app.profile?.exerciseNotes[exerciseID] ?? '');

  $effect(() => { if (editing) field?.focus(); });
  function save(e: Event) {
    app.setExerciseNote(exerciseID, (e.currentTarget as HTMLTextAreaElement).value);
    editing = false;
  }
</script>

{#if editing}
  <textarea class="note-field" rows="2" bind:this={field} value={note} placeholder="e.g. Seat on 4, use the wide handle" aria-label="Note for this exercise"
    onblur={save} onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget as HTMLTextAreaElement).blur(); } }}></textarea>
{:else if note}
  <button class="note has" onclick={() => (editing = true)} aria-label="Your note: {note}. Edit"><NotebookPen size={14} /> <span>{note}</span></button>
{:else}
  <button class="note" onclick={() => (editing = true)}><NotebookPen size={14} /> Add a note</button>
{/if}

<style>
  .note { display: inline-flex; align-items: flex-start; gap: 8px; text-align: left; font-size: 0.8rem; color: var(--text-3); padding: 2px 0; }
  .note.has { color: var(--text); padding: 9px 12px; border-radius: 12px; background: rgba(255, 187, 69, 0.08); border: 1px solid rgba(255, 187, 69, 0.22); width: 100%; }
  .note.has :global(svg) { color: var(--recovering); flex: none; margin-top: 2px; }
  .note-field { font-size: 0.9rem; min-height: 0; }
</style>
