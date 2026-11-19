import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { session } from './lib/session.svelte';
import { app } from './lib/store.svelte';
import { updates } from './lib/pwa.svelte';
import { sync } from './lib/sync.svelte';

// Listen before loading, so a save in another window during the load still marks this copy out of date.
sync.start();

// Load saved data before the first render that needs it.
await app.load();
await session.load();

updates.start();

export default mount(App, { target: document.getElementById('app')! });
