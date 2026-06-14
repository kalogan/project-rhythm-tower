import type { BeatGrid } from '../../core/beatGrid.js';
import { beatToTime, secPerBeat } from '../../core/beatGrid.js';
import type { Chart } from '../../core/index.js';
import type { BandMusic } from '../../content/schemas.js';
import { PROGRESSION, colorDegree, midiToFreq, moodFromBandMusic, moodFromChart, scaleMidi, type Mood } from './music.js';

/**
 * Procedural Web Audio driver. The AudioContext clock is the MASTER time the core's
 * judgment reads (now()), so audio and judgment never drift. A floor's whole bed —
 * percussion, bass, pad, arpeggio — plus the per-cue lead tones are scheduled UP FRONT
 * (a floor is short), so there's no per-frame allocation in the loop. Audio is cosmetic:
 * it projects the beat grid + a chart-derived key; it is never the source of truth.
 */
export interface AudioDriver {
  resume(): Promise<void>;
  now(): number;
  /** Schedule a floor's full music bed + cue tones at `startTimeSec`. `music` is the
   *  band's authored sound (key/scale/timbres); omitted -> a key hashed from the chart. */
  scheduleFloor(grid: BeatGrid, chart: Chart, startTimeSec: number, music?: BandMusic): void;
  stopAll(): void;
}

export function createAudioDriver(): AudioDriver {
  const Ctor: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();

  // Master chain: a gentle compressor keeps the layered bed from clipping.
  const master = ctx.createGain();
  master.gain.value = 0.5;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp);
  comp.connect(ctx.destination);

  const live: AudioScheduledSourceNode[] = [];

  /** A single enveloped voice, optionally low-passed (for warm bass/pad layers). */
  function voice(
    freq: number,
    at: number,
    dur: number,
    peak: number,
    type: OscillatorType,
    cutoff?: number,
  ): void {
    if (at < ctx.currentTime) at = ctx.currentTime; // never schedule in the past
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(peak, at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let tail: AudioNode = env;
    if (cutoff !== undefined) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      env.connect(lp);
      tail = lp;
    }
    osc.connect(env);
    tail.connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.04);
    live.push(osc);
  }

  /** A short percussive kick (pitch drop) for the pulse. */
  function kick(at: number, peak: number): void {
    if (at < ctx.currentTime) at = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, at);
    osc.frequency.exponentialRampToValueAtTime(50, at + 0.12);
    env.gain.setValueAtTime(peak, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    osc.connect(env);
    env.connect(master);
    osc.start(at);
    osc.stop(at + 0.2);
    live.push(osc);
  }

  function scheduleBed(grid: BeatGrid, chart: Chart, t0: number, mood: Mood): void {
    const spb = secPerBeat(grid);
    const lastBeat = chart.cues.length > 0 ? (chart.cues.at(-1)!.beat ?? 0) : grid.beatsPerBar;
    const totalBeats = Math.ceil(lastBeat) + grid.beatsPerBar; // a tail bar to breathe
    const bars = Math.ceil(totalBeats / grid.beatsPerBar);

    // Per-bar harmony: bass root + a sustained pad triad, following the progression.
    for (let bar = 0; bar < bars; bar++) {
      const deg = PROGRESSION[bar % PROGRESSION.length]!;
      const barAt = t0 + beatToTime(grid, bar * grid.beatsPerBar) - grid.offsetSec;
      const barDur = spb * grid.beatsPerBar;
      const bassMidi = scaleMidi(mood.rootMidi - 12, mood.scale, deg);
      voice(midiToFreq(bassMidi), barAt, barDur * 0.95, 0.22, mood.bass, 420);
      // pad triad (root / third / fifth within the scale), soft + low-passed
      for (const d of [deg, deg + 2, deg + 4]) {
        voice(midiToFreq(scaleMidi(mood.rootMidi, mood.scale, d)), barAt, barDur * 0.98, 0.05, mood.pad, 900);
      }
    }

    // Per-beat pulse: kick on the beat (stronger on the downbeat), hat on the offbeat,
    // plus a gentle climbing arpeggio that gives the bed motion.
    for (let b = 0; b < totalBeats; b++) {
      const at = t0 + b * spb;
      const downbeat = b % grid.beatsPerBar === 0;
      kick(at, downbeat ? 0.5 : 0.32);
      voice(9000, at + spb * 0.5, 0.03, 0.04, 'square'); // hat (high blip)
      const deg = PROGRESSION[Math.floor(b / grid.beatsPerBar) % PROGRESSION.length]!;
      const arpMidi = scaleMidi(mood.rootMidi + 12, mood.scale, deg + (b % 4) * 2);
      voice(midiToFreq(arpMidi), at, 0.16, 0.07, mood.arp);
    }
  }

  return {
    resume: () => ctx.resume(),
    now: () => ctx.currentTime,
    scheduleFloor: (grid, chart, startTimeSec, music) => {
      const mood = music ? moodFromBandMusic(music) : moodFromChart(chart);
      scheduleBed(grid, chart, startTimeSec, mood);
      // Cue lead tones, tuned into the scale so they sing over the bed.
      for (const cue of chart.cues) {
        const at = startTimeSec + beatToTime(grid, cue.beat);
        const midi = scaleMidi(mood.rootMidi + 24, mood.scale, colorDegree(cue.color));
        voice(midiToFreq(midi), at, 0.2, 0.16, mood.lead);
        if (cue.kind === 'double' && cue.color2) {
          const midi2 = scaleMidi(mood.rootMidi + 24, mood.scale, colorDegree(cue.color2));
          voice(midiToFreq(midi2), at, 0.2, 0.14, mood.lead);
        }
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
