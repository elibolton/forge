<script lang="ts">
  import { CloudCheck, CloudOff, LoaderCircle, RefreshCw, TriangleAlert } from '@lucide/svelte';
  import BackBar from '../components/BackBar.svelte';
  import { cloud, syncLabel } from '../lib/cloud.svelte';
  import { ServerError, type Session } from '../lib/server';
  import { toasts } from '../lib/toasts.svelte';
  import { app } from '../lib/store.svelte';

  /** Shown inside onboarding on a new phone: no back bar, and `onDone` once signed in. */
  let { embedded = false, onDone }: { embedded?: boolean; onDone?: () => void } = $props();

  // Signing in: email → a 6-digit code by email → signed in. A new email gets an account with its first code.
  let step = $state<'email' | 'code'>('email');
  let email = $state(cloud.account?.email ?? '');
  let code = $state('');
  let otpId = '';
  let busy = $state(false);
  let error = $state<string | null>(null);

  const message = (e: unknown) => (e instanceof ServerError ? e.message : 'Something went wrong. Try again.');

  async function sendCode(e?: Event) {
    e?.preventDefault();
    error = null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { error = 'Enter your email address.'; return; }
    busy = true;
    try {
      otpId = await cloud.sendCode(email);
      step = 'code';
      code = '';
    } catch (err) { error = message(err); }
    busy = false;
  }

  async function verify(e?: Event) {
    e?.preventDefault();
    error = null;
    if (code.replace(/\D/g, '').length !== 6) { error = 'Enter the 6-digit code from the email.'; return; }
    busy = true;
    try {
      const { session, otherAccountData } = await cloud.checkCode(otpId, code);
      if (otherAccountData && !confirm(`This phone has workouts from another Forge account. Add them to ${session.account.email} too?\n\nCancel to stay signed out. To keep them apart, erase this phone's data first (Backup, Import & Export).`)) {
        busy = false;
        return;
      }
      await signIn(session);
    } catch (err) { error = message(err); }
    busy = false;
  }

  async function signIn(session: Session) {
    await cloud.signIn(session);
    step = 'email';
    if (embedded) {
      // With a profile on the server, the app now leaves onboarding by itself; a new account still needs setting up.
      toasts.show(app.profile ? 'Welcome back. Your data is on this phone.' : 'Signed in. Now set up Forge; it syncs as you go.');
      onDone?.();
      return;
    }
    toasts.show(cloud.status === 'synced' ? 'Signed in. Your data is synced.' : 'Signed in');
  }

  function signOut() {
    const waiting = cloud.pending ? `\n\n${cloud.pending} change${cloud.pending === 1 ? " hasn't" : "s haven't"} synced yet. They stay on this phone and sync when you sign in again.` : '';
    if (!confirm(`Sign out of Forge on this phone? Your data stays on this phone.${waiting}`)) return;
    cloud.signOut();
  }

  async function deleteAccount() {
    if (!confirm(`Delete your Forge account (${cloud.account?.email})?\n\nThis permanently deletes everything stored on the server. Your data on this phone stays. This can't be undone.`)) return;
    busy = true;
    try {
      await cloud.deleteAccount();
      toasts.show('Account deleted. Your data is still on this phone.');
    } catch (err) { toasts.show(message(err)); }
    busy = false;
  }
</script>

<div class:screen={!embedded}>
  {#if !embedded}<BackBar title="Account & Sync" />{/if}

  {#if cloud.account && !embedded}
    <div class="section">
      <div class="head">Signed in</div>
      <div class="list">
        <div class="item">Email<span class="value">{cloud.account.email}</span></div>
        <div class="item">
          {#if cloud.status === 'syncing'}<LoaderCircle size={18} class="spin" color="var(--text-2)" />
          {:else if cloud.status === 'synced'}<CloudCheck size={18} color="var(--ok, #4ade80)" />
          {:else if cloud.status === 'offline'}<CloudOff size={18} color="var(--text-2)" />
          {:else}<TriangleAlert size={18} color="var(--fatigued)" />{/if}
          Sync<span class="value" aria-live="polite">{syncLabel()}</span>
        </div>
        <button class="item link" onclick={() => cloud.now()} disabled={cloud.status === 'syncing'}><RefreshCw size={18} /> Sync Now</button>
      </div>
      <div class="foot">
        {#if cloud.status === 'expired'}Your sign-in has expired. Sign out, then sign in again with a new code. Nothing on this phone is lost.
        {:else if cloud.status === 'offline'}Forge saves everything on this phone and syncs when it can reach the server again.
        {:else if cloud.status === 'error'}{cloud.error}
        {:else}Changes sync a few seconds after you make them, and whenever you open Forge.{/if}
      </div>
    </div>

    <div class="section">
      <div class="list">
        <button class="item link" onclick={signOut}>Sign Out</button>
        <button class="item danger" onclick={deleteAccount} disabled={busy}>Delete Account…</button>
      </div>
      <div class="foot">Signing out or deleting your account keeps everything on this phone. Export a backup any time from Backup, Import & Export.</div>
    </div>
  {:else}
    <div class="section">
      {#if !embedded}<div class="head">Sign in to sync</div>{/if}
      {#if step === 'email'}
        <form class="stack" style="--gap:10px" onsubmit={sendCode}>
          <input type="email" autocomplete="email" autocapitalize="off" spellcheck="false" enterkeyhint="go" placeholder="Email" aria-label="Email" bind:value={email} />
          {#if error}<div class="error" role="alert">{error}</div>{/if}
          <button class="btn primary block" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Email Me a Code'}</button>
        </form>
        {#if !embedded}<div class="foot" style="margin-top:12px">Optional. Forge works fully on this phone without an account. Signed in, your workouts, settings and saved workouts are backed up to the Forge server and stay in sync across your devices. New here? The same code creates your account.</div>{/if}
      {:else}
        <form class="stack" style="--gap:10px" onsubmit={verify}>
          <div class="sent">We emailed a 6-digit code to <strong>{email.trim().toLowerCase()}</strong>. It expires in 10 minutes. Check spam if it isn't there.</div>
          <input type="text" inputmode="numeric" autocomplete="one-time-code" enterkeyhint="done" maxlength="7" placeholder="123456" aria-label="6-digit code" class="code" bind:value={code} />
          {#if error}<div class="error" role="alert">{error}</div>{/if}
          <button class="btn primary block" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Sign In'}</button>
          <button class="btn block" type="button" disabled={busy} onclick={() => sendCode()}>Send a New Code</button>
          <button class="btn block" type="button" onclick={() => { step = 'email'; error = null; }}>Use a Different Email</button>
        </form>
      {/if}
    </div>
  {/if}
</div>

<style>
  .error { color: var(--fatigued); font-size: 0.9rem; padding: 0 6px; }
  .sent { color: var(--text-2); font-size: 0.92rem; line-height: 1.45; padding: 0 6px; }
  .code { font-size: 1.6rem; letter-spacing: 0.3em; text-align: center; font-variant-numeric: tabular-nums; }
  .danger { color: var(--fatigued); }
  :global(.spin) { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
