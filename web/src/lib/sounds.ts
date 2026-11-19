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
