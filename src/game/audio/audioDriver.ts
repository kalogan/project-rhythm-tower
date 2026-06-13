import type { BeatGrid } from '../../core/beatGrid.js';
import { beatToTime } from '../../core/beatGrid.js';
import type { Chart, CueColor } from '../../core/index.js';

/**
 * Procedural Web Audio driver. The AudioContext clock is the MASTER time the core's
 * judgment reads (now()), so audio and judgment never drift. A floor's beats + cues
 * are scheduled UP FRONT (a floor is short) — no per-frame allocation in the loop.
 * Audio is cosmetic: it projects the beat grid, it is not the source of truth.
 */
const COLOR_FREQ: Readonly<Record<CueColor, number>> = {
  blue: 392.0, // G4
  green: 523.25, // C5
  red: 659.25, // E5
  yellow: 783.99, // G5
};

export interface AudioDriver {
  resume(): Promise<void>;
  now(): number;
  /** Schedule a floor's metronome + cue tones starting at `startTimeSec` (audio time). */
  scheduleFloor(grid: BeatGrid, chart: Chart, startTimeSec: number): void;
  stopAll(): void;
}

export function createAudioDriver(): AudioDriver {
  const Ctor: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  const live: AudioScheduledSourceNode[] = [];

  function blip(freq: number, atTime: number, dur: number, gain: number, type: OscillatorType): void {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0.0001, atTime);
    env.gain.exponentialRampToValueAtTime(gain, atTime + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, atTime + dur);
    osc.connect(env);
    env.connect(master);
    osc.start(atTime);
    osc.stop(atTime + dur + 0.02);
    live.push(osc);
  }

  return {
    resume: () => ctx.resume(),
    now: () => ctx.currentTime,
    scheduleFloor: (grid, chart, startTimeSec) => {
      const beats = Math.ceil((chart.cues.at(-1)?.beat ?? 0) + grid.beatsPerBar);
      for (let b = 0; b < beats; b++) {
        const t = startTimeSec + beatToTime(grid, b);
        const downbeat = b % grid.beatsPerBar === 0;
        blip(downbeat ? 180 : 120, t, 0.06, downbeat ? 0.28 : 0.16, 'triangle');
      }
      for (const cue of chart.cues) {
        const t = startTimeSec + beatToTime(grid, cue.beat);
        blip(COLOR_FREQ[cue.color], t, 0.18, 0.22, 'sawtooth');
      }
    },
    stopAll: () => {
      const t = ctx.currentTime;
      for (const node of live.splice(0)) {
        try {
          node.stop(t);
        } catch {
          /* already stopped */
        }
      }
    },
  };
}
