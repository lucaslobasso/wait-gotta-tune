import { midiToFreq } from '../../music/notes';
import { BASS, GUITAR, UKULELE } from '../../music/tuningProfile';
import { CHECK_BUFFER_SIZE, CHECK_WAIT_MS, HOP_SIZE } from '../config';
import { createStrumCheck, type StrumCheckState } from '../strumCheck';

const guitar = GUITAR.targets.map((t) => t.midi);
const uke = UKULELE.targets.map((t) => t.midi);
const bass = BASS.targets.map((t) => t.midi);

const LEAD_S = 0.4;

type Options = {
  sr?: number;
  harmonics?: number[];
  noise?: number;
  /** How many strings are actually plucked (default: all). */
  plucked?: number;
  /** Seconds of sound after the last pluck. */
  tail?: number;
  /** Samples between deliveries, cycled (default: one hop). A browser delivers about twice as often. */
  steps?: number[];
};

/**
 * A slow strum on synthetic strings, thickest first, `gap` seconds apart. Every string
 * keeps ringing (slow decay, higher partials die faster) and there is no pick noise, so
 * the overall level barely rises with each pluck: harder than a real instrument.
 * The audio is delivered the way the microphone delivers it: the latest samples, once per hop.
 */
function strum(targets: number[], offsetsCents: number[], gap: number, options: Options = {}) {
  const { sr = 48000, harmonics = [1, 0.6, 0.4, 0.25, 0.15, 0.1], noise = 0.003 } = options;
  const plucked = options.plucked ?? targets.length;
  const total = Math.round((LEAD_S + plucked * gap + (options.tail ?? 1)) * sr);
  const audio = new Float32Array(total);
  let seed = 7;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  for (let n = 0; n < plucked; n++) {
    const index = targets.length - 1 - n;
    const f = midiToFreq(targets[index] + offsetsCents[index] / 100);
    const start = Math.round((LEAD_S + n * gap) * sr);
    for (let k = 0; k < harmonics.length; k++) {
      const angle = (2 * Math.PI * (k + 1) * f) / sr;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const decay = Math.exp(-(k + 1) / (3 * sr));
      let re = 0.1 * harmonics[k];
      let im = 0;
      for (let i = start; i < total; i++) {
        audio[i] += im;
        const next = (re * cos - im * sin) * decay;
        im = (re * sin + im * cos) * decay;
        re = next;
      }
    }
  }
  for (let i = 0; i < total; i++) audio[i] += noise * random();

  const check = createStrumCheck(targets);
  const window = new Float32Array(CHECK_BUFFER_SIZE);
  let state: StrumCheckState = { verdicts: [], current: null, finished: false };
  /** [seconds, string index expected next] each time it changes. */
  const asked: [number, number | null][] = [];
  const steps = options.steps ?? [HOP_SIZE];
  let end = HOP_SIZE;
  for (let n = 0; end <= total && !state.finished; end += steps[n++ % steps.length]) {
    window.fill(0);
    const from = Math.max(0, end - CHECK_BUFFER_SIZE);
    window.set(audio.subarray(from, end), CHECK_BUFFER_SIZE - (end - from));
    state = check.push(window, sr, (end / sr) * 1000);
    if (!asked.length || asked[asked.length - 1][1] !== state.current) {
      asked.push([end / sr, state.current]);
    }
  }
  return { state, asked, check, seconds: end / sr };
}

describe('strumCheck', () => {
  it('expects the thickest string first and takes each pluck as the next string up', () => {
    const { state, asked } = strum(guitar, [0, 0, 0, 0, 0, 0], 0.5);
    expect(state.finished).toBe(true);
    // Before any sound: string 6. Then one step up per pluck, shortly after each pluck.
    expect(asked.map(([, index]) => index)).toEqual([5, 4, 3, 2, 1, 0, null]);
    asked.slice(1, 6).forEach(([seconds], n) => {
      const sincePluck = seconds - (LEAD_S + n * 0.5);
      expect(sincePluck).toBeGreaterThan(0);
      expect(sincePluck).toBeLessThan(0.15);
    });
    expect(state.verdicts.map((v) => v.status)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
  });

  it.each<[string, number[], number[], number, Options & { within?: number }]>([
    ['guitar, mixed, 0.5 s apart', guitar, [0, 20, -4, -30, 5, 15], 0.5, {}],
    ['guitar, mixed, 0.2 s apart', guitar, [0, 20, -4, -30, 5, 15], 0.2, {}],
    ['guitar, mixed, 0.8 s apart', guitar, [0, 20, -4, -30, 5, 15], 0.8, {}],
    ['guitar, all off, 0.3 s apart', guitar, [-25, 35, -15, 50, -60, 30], 0.3, {}],
    ['guitar, far off, 0.5 s apart', guitar, [150, -120, 90, -180, 200, -140], 0.5, { within: 6 }],
    ['guitar at 44.1 kHz, noisy', guitar, [12, 0, -20, 0, 25, -12], 0.4, { sr: 44100, noise: 0.01 }],
    ['guitar with a weak fundamental', guitar, [0, -18, 0, 22, 0, -30], 0.5, { harmonics: [0.2, 1, 0.6, 0.3] }],
    ['guitar from digital silence, 0.5 s apart', guitar, [0, 20, 0, -30, 0, 15], 0.5, { noise: 0 }],
    ['guitar from digital silence, 0.25 s apart', guitar, [0, 20, 0, -30, 0, 15], 0.25, { noise: 0 }],
    ['guitar, delivered every ~20 ms like a browser', guitar, [0, 20, 0, -30, 0, 15], 0.5, { noise: 0, steps: [1008, 1008, 768, 1008] }],
    ['guitar, delivered irregularly', guitar, [0, 20, 0, -30, 0, 15], 0.3, { steps: [2048, 700, 3100, 1500] }],
    ['ukulele, delivered every ~20 ms', uke, [10, -25, 0, 30], 0.25, { steps: [960] }],
    ['ukulele, 0.2 s apart', uke, [40, -35, 15, -50], 0.2, {}],
    ['ukulele, 0.6 s apart', uke, [0, -20, 0, 25], 0.6, {}],
    ['bass, 0.8 s apart', bass, [-30, 20, -45, 35], 0.8, {}],
  ])('%s: every verdict is within 3 cents of the real detuning (6 when far off)', (_name, targets, offsets, gap, options) => {
    const { state } = strum(targets, offsets, gap, options);
    expect(state.finished).toBe(true);
    state.verdicts.forEach((v, i) => {
      expect(v.status).not.toBe('missing');
      expect(Math.abs((v.cents as number) - offsets[i])).toBeLessThanOrEqual(options.within ?? 3);
      const expected = Math.abs(v.cents as number) <= 8 ? 'ok' : offsets[i] < 0 ? 'flat' : 'sharp';
      expect(v.status).toBe(expected);
    });
  });

  it('bass strummed faster is still roughly right (low notes need time)', () => {
    const { state } = strum(bass, [-30, 20, -45, 35], 0.4);
    state.verdicts.forEach((v, i) => {
      expect(Math.abs((v.cents as number) - [-30, 20, -45, 35][i])).toBeLessThanOrEqual(10);
    });
  });

  it('ends a while after the last pluck heard, leaving the strings not reached as missing', () => {
    const { state, seconds } = strum(guitar, [0, 0, 0, 0, 10, -20], 0.5, {
      plucked: 2,
      tail: CHECK_WAIT_MS / 1000 + 1,
    });
    expect(state.finished).toBe(true);
    expect(seconds).toBeGreaterThan(LEAD_S + 0.5 + CHECK_WAIT_MS / 1000 - 0.1);
    expect(state.verdicts.map((v) => v.status)).toEqual([
      'missing',
      'missing',
      'missing',
      'missing',
      'sharp',
      'flat',
    ]);
  });

  it('gives up when nothing is plucked', () => {
    const { state } = strum(guitar, [0, 0, 0, 0, 0, 0], 0.5, { plucked: 0, tail: CHECK_WAIT_MS / 1000 + 1 });
    expect(state.finished).toBe(true);
    expect(state.verdicts.every((v) => v.status === 'missing')).toBe(true);
  });

  it('does not take steady background noise for a pluck', () => {
    const { state, asked } = strum(guitar, [0, 0, 0, 0, 0, 0], 0.5, { plucked: 0, noise: 0.02, tail: 3 });
    expect(state.finished).toBe(false);
    expect(asked.map(([, index]) => index)).toEqual([5]);
  });

  it('does not count a ringing string as a new pluck', () => {
    // One pluck, then five seconds of that string ringing: still waiting for string 5.
    const { state } = strum(guitar, [0, 0, 0, 0, 0, 0], 0.5, { plucked: 1, tail: 5 });
    expect(state.finished).toBe(false);
    expect(state.current).toBe(4);
  });

  it('ignores windows after it finished', () => {
    const { state, check } = strum(uke, [0, 0, 0, 0], 0.5);
    expect(state.finished).toBe(true);
    const loud = new Float32Array(CHECK_BUFFER_SIZE).fill(0.5);
    expect(check.push(loud, 48000, 99999).verdicts).toEqual(state.verdicts);
  });
});
