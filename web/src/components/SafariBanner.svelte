<script lang="ts">
  import { Smartphone } from '@lucide/svelte';
  import { browserName, device, installPrompt, safariBanner, separateAppData, storageGuard } from '../lib/install.svelte';
  import InstallSteps from './InstallSteps.svelte';
  import Notice from './Notice.svelte';
  import Sheet from './Sheet.svelte';

  /**
   * Shown in a phone's browser tab until dismissed for this visit. On iPhone it warns: data there can be
   * cleared, and the Home Screen app is a separate copy. On Android it suggests installing.
   */
  let showing = $state(false);
  const browser = browserName[device.browser];
</script>

{#if !storageGuard.installed && !safariBanner.hidden && device.os !== 'other'}
  <Notice icon={Smartphone} tone={separateAppData ? 'warn' : undefined} title={separateAppData ? 'Add Forge to your Home Screen' : 'Install Forge'} role="note"
    onclose={() => safariBanner.dismiss()} closeLabel="Hide until next visit">
    {#if separateAppData}In a {browser} tab, iOS can clear your workouts after 7 days without a visit.
    {:else}It opens full screen from your home screen and works offline. Your workouts come with it.{/if}
    {#snippet actions()}
      {#if installPrompt.available}<button class="notice-act" onclick={() => installPrompt.show()}>Install</button>
      {:else}<button class="notice-act" onclick={() => (showing = true)}>Show me how</button>{/if}
    {/snippet}
  </Notice>
{/if}

{#if showing}
  <Sheet title={separateAppData ? 'Add to Home Screen' : 'Install Forge'} onclose={() => (showing = false)}>
    {#snippet trailing()}<button class="link bold" onclick={() => (showing = false)}>Done</button>{/snippet}
    <div class="stack" style="--gap:14px">
      {#if separateAppData}
        <p class="sub muted">The Home Screen app opens full screen, works offline and keeps your data safe from {browser}'s clean-up.</p>
        <InstallSteps />
        <p class="caption muted">The Home Screen app starts empty: it doesn't share data with this tab. Back up here first (You → Backup, Import & Export), then restore the file in the app.</p>
      {:else}
        <p class="sub muted">The installed app opens full screen and works offline. Your workouts and settings come with it.</p>
        <InstallSteps />
      {/if}
    </div>
  </Sheet>
{/if}
