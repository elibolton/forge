// Rest-timer sounds, synthesized so they work offline and need no audio files.

export const REST_SOUNDS = ['chime', 'bell', 'pulse', 'off'] as const;
export type RestSound = (typeof REST_SOUNDS)[number];

export const restSoundTitle: Record<RestSound, string> = { chime: 'Chime', bell: 'Bell', pulse: 'Triple pulse', off: 'Silent' };

type Note = { freq: number; at: number; length: number; type?: OscillatorType; volume?: number };

const patterns: Record<Exclude<RestSound, 'off'>, Note[]> = {
  chime: [{ freq: 880, at: 0, length: 0.35 }, { freq: 1175, at: 0.18, length: 0.4 }],
  bell: [{ freq: 1318, at: 0, length: 1.2, type: 'triangle', volume: 0.35 }, { freq: 2637, at: 0, length: 0.6, volume: 0.08 }],
  pulse: [0, 0.22, 0.44].map((at) => ({ freq: 988, at, length: 0.14, type: 'square' as OscillatorType, volume: 0.12 })),
};

/**
 * Asks iOS for an audio session that ducks the user's music instead of stopping it. Safari 16.4+ has
 * `navigator.audioSession`; elsewhere this does nothing. ('playback' would ignore the silent switch but
 * pause Spotify or Apple Music, so it isn't used.) Returns whether it was set.
 */
export function configureAudioSession(nav: unknown = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  const session = (nav as { audioSession?: { type: string } } | undefined)?.audioSession;
  if (!session || typeof session !== 'object' || !('type' in session)) return false;
  try {
    session.type = 'transient';
    return true;
  } catch { return false; }
}

/**
 * Gets an audio context going again. iOS leaves it 'suspended' until a tap, and puts it in the
 * non-standard 'interrupted' state after a call, Siri or a lock; anything but 'running' is resumed.
 */
export function resumeAudio(ctx: AudioContext): Promise<void> {
  if (ctx.state === 'running') return Promise.resolve();
  try {
    return ctx.resume().catch(() => {});
  } catch { return Promise.resolve(); }
}

/** Plays a timer sound, first waking the audio context if iOS stopped it. */
export async function playWhenReady(ctx: AudioContext, sound: RestSound) {
  if (sound === 'off') return;
  await resumeAudio(ctx);
  playRestSound(ctx, sound);
}

export function playRestSound(ctx: AudioContext, sound: RestSound) {
  if (sound === 'off' || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  for (const n of patterns[sound]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.value = n.freq;
    gain.gain.setValueAtTime(0.0001, t + n.at);
    gain.gain.exponentialRampToValueAtTime(n.volume ?? 0.3, t + n.at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + n.at + n.length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t + n.at);
    osc.stop(t + n.at + n.length + 0.05);
  }
}
