<script lang="ts">
  import { Smartphone } from '@lucide/svelte';
  import { safariBanner, storageGuard } from '../lib/install.svelte';
  import InstallSteps from './InstallSteps.svelte';
  import Notice from './Notice.svelte';
  import Sheet from './Sheet.svelte';

  /** Shown in a Safari tab until dismissed for this visit: data there can be cleared, and it's a separate copy. */
  let showing = $state(false);
</script>

{#if !storageGuard.installed && !safariBanner.hidden}
  <Notice icon={Smartphone} tone="warn" title="Add Forge to your Home Screen" role="note"
    onclose={() => safariBanner.dismiss()} closeLabel="Hide until next visit">
    In a Safari tab, iOS can clear your workouts after 7 days without a visit.
    {#snippet actions()}<button class="notice-act" onclick={() => (showing = true)}>Show me how</button>{/snippet}
  </Notice>
{/if}

{#if showing}
  <Sheet title="Add to Home Screen" onclose={() => (showing = false)}>
    {#snippet trailing()}<button class="link bold" onclick={() => (showing = false)}>Done</button>{/snippet}
    <div class="stack" style="--gap:14px">
      <p class="sub muted">The Home Screen app opens full screen, works offline and keeps your data safe from Safari's clean-up.</p>
      <InstallSteps />
      <p class="caption muted">The Home Screen app starts empty: it doesn't share data with this tab. Back up here first (You → Backup, Import & Export), then restore the file in the app.</p>
    </div>
  </Sheet>
{/if}
