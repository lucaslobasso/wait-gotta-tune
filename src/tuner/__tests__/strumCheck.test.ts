import { midiToFreq } from '../../music/notes';
import { BASS, GUITAR, UKULELE } from '../../music/tuningProfile';
import type { BandReading } from '../../pitch/bandPitch';
import { CHECK_BUFFER_SIZE, CHECK_STABLE_FRAMES, CHECK_STRING_TIMEOUT_MS, HOP_SIZE } from '../config';
import { createStrumCheck, type StrumCheckState } from '../strumCheck';

const guitar = GUITAR.targets.map((t) => t.midi);
const NO_AUDIO = new Float32Array(0);
const STEP_MS = 43;

/** A check whose measurements are scripted: `heard[midi]` = cents, or absent = silence. */
function scripted(targets: number[]) {
  const heard = new Map<number, BandReading>();
  const check = createStrumCheck(targets, (_samples, _rate, midi) => heard.get(midi) ?? null);
  let t = 0;
  const step = (frames = 1) => {
    let state!: StrumCheckState;
    for (let i = 0; i < frames; i++) state = check.push(NO_AUDIO, 48000, (t += STEP_MS));
    return state;
  };
  const ring = (midi: number, cents: number, level = 0.1, share = 0.5) =>
    heard.set(midi, { cents, level, share });
  return { check, heard, step, ring, wait: (ms: number) => (t += ms) };
}

describe('strumCheck', () => {
  it('asks for string 1 first and moves down as each string is heard', () => {
    const t = scripted(guitar);
    expect(t.step().current).toBe(0);
    t.ring(64, 2);
    expect(t.step(CHECK_STABLE_FRAMES - 1).current).toBe(0);
    const state = t.step();
    expect(state.current).toBe(1);
    expect(state.verdicts[0]).toEqual({ status: 'ok', cents: 2 });
    expect(state.finished).toBe(false);
  });

  it('reports flat and sharp strings with their cents and finishes after the last string', () => {
    const t = scripted(guitar);
    const offsets = [0, 18, -3, -25, 8, 9];
    guitar.forEach((midi, i) => t.ring(midi, offsets[i]));
    const state = t.step(guitar.length * CHECK_STABLE_FRAMES);
    expect(state.finished).toBe(true);
    expect(state.current).toBeNull();
    expect(state.verdicts).toEqual([
      { status: 'ok', cents: 0 },
      { status: 'sharp', cents: 18 },
      { status: 'ok', cents: -3 },
      { status: 'flat', cents: -25 },
      { status: 'ok', cents: 8 },
      { status: 'sharp', cents: 9 },
    ]);
  });

  it('does not credit a string that rings before its turn', () => {
    const t = scripted(guitar);
    t.ring(59, 0);
    expect(t.step(20).current).toBe(0);
  });

  it('waits for the measurements to settle', () => {
    const t = scripted(guitar);
    t.ring(64, 30);
    t.step();
    t.ring(64, 20);
    t.step();
    t.ring(64, 11);
    expect(t.step().current).toBe(0);
    t.ring(64, 10.4);
    t.step();
    t.ring(64, 10);
    expect(t.step().current).toBe(0);
    t.ring(64, 9.6);
    const state = t.step();
    expect(state.verdicts[0]).toEqual({ status: 'sharp', cents: 10 });
  });

  it('ignores measurements that are too quiet or too small a share of the sound', () => {
    const t = scripted(guitar);
    t.ring(64, 0, 0.0005, 0.9);
    expect(t.step(10).current).toBe(0);
    t.ring(64, 0, 0.1, 0.02);
    expect(t.step(10).current).toBe(0);
  });

  it('reports a string that is not heard in time as missing and moves on', () => {
    const t = scripted(guitar);
    t.ring(64, 0);
    expect(t.step(CHECK_STABLE_FRAMES).current).toBe(1);
    t.wait(CHECK_STRING_TIMEOUT_MS);
    const state = t.step();
    expect(state.current).toBe(2);
    expect(state.verdicts[1]).toEqual({ status: 'missing', cents: null });
  });

  it('gives up when the first string is never heard', () => {
    const t = scripted(guitar);
    t.step();
    t.wait(CHECK_STRING_TIMEOUT_MS);
    const state = t.step();
    expect(state.finished).toBe(true);
    expect(state.verdicts.every((v) => v.status === 'missing')).toBe(true);
  });

  it('ignores windows after it finished', () => {
    const t = scripted([69]);
    t.ring(69, 0);
    const done = t.step(CHECK_STABLE_FRAMES);
    expect(done.finished).toBe(true);
    t.ring(69, 40);
    expect(t.step(10).verdicts).toEqual(done.verdicts);
  });
});

/**
 * End to end on synthetic audio: every string is plucked in turn, decays slowly
 * (so the earlier ones are still ringing loudly), has overtones, and the audio is
 * delivered the way the microphone delivers it: the latest samples, once per hop.
 */
describe('strumCheck on synthetic plucks', () => {
  const GAP_S = 1.2;

  type Options = { sr?: number; harmonics?: number[]; noise?: number };

  function play(targets: number[], offsetsCents: number[], options: Options = {}) {
    const { sr = 48000, harmonics = [1, 0.6, 0.4, 0.25, 0.15, 0.1], noise = 0 } = options;
    const total = Math.round((targets.length * GAP_S + 1) * sr);
    const audio = new Float32Array(total);
    let seed = 7;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    targets.forEach((midi, n) => {
      const f = midiToFreq(midi + offsetsCents[n] / 100);
      const start = Math.round((0.3 + n * GAP_S) * sr);
      // Higher partials die away faster, as on a real string. Each partial is a
      // rotating, shrinking vector (much faster than calling sin and exp per sample).
      for (let k = 0; k < harmonics.length; k++) {
        const angle = (2 * Math.PI * (k + 1) * f) / sr;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const decay = Math.exp(-(k + 1) / (3 * sr));
        let re = 0.12 * harmonics[k];
        let im = 0;
        for (let i = start; i < total; i++) {
          audio[i] += im;
          const next = (re * cos - im * sin) * decay;
          im = (re * sin + im * cos) * decay;
          re = next;
        }
      }
    });
    if (noise) for (let i = 0; i < total; i++) audio[i] += noise * random();

    const check = createStrumCheck(targets);
    const window = new Float32Array(CHECK_BUFFER_SIZE);
    let state: StrumCheckState = { verdicts: [], current: 0, finished: false };
    const heardAt: number[] = [];
    for (let end = HOP_SIZE; end <= total && !state.finished; end += HOP_SIZE) {
      window.fill(0);
      const from = Math.max(0, end - CHECK_BUFFER_SIZE);
      window.set(audio.subarray(from, end), CHECK_BUFFER_SIZE - (end - from));
      const before = state.current ?? 0;
      state = check.push(window, sr, (end / sr) * 1000);
      if ((state.current ?? targets.length) > before) heardAt.push(end / sr - 0.3 - before * GAP_S);
    }
    return { state, heardAt };
  }

  const uke = UKULELE.targets.map((t) => t.midi);
  const bass = BASS.targets.map((t) => t.midi);

  it.each<[string, number[], number[], Options]>([
    ['guitar in tune', guitar, [0, 0, 0, 0, 0, 0], {}],
    ['guitar, mixed', guitar, [0, 20, -4, -30, 5, 15], {}],
    ['guitar, low E flat under in-tune B and high E', guitar, [0, 0, 0, 0, 0, -40], {}],
    ['guitar, all off', guitar, [-25, 35, -15, 50, -60, 30], {}],
    ['guitar at 44.1 kHz with noise', guitar, [12, 0, -20, 0, 25, -12], { sr: 44100, noise: 0.01 }],
    ['guitar with a weak fundamental', guitar, [0, -18, 0, 22, 0, -30], { harmonics: [0.15, 1, 0.6, 0.3] }],
    ['ukulele', uke, [0, -20, 0, 25], {}],
    ['ukulele, all off', uke, [40, -35, 15, -50], {}],
    ['bass', bass, [0, 30, 0, -20], {}],
    ['bass, all off', bass, [-30, 20, -45, 35], { sr: 44100 }],
  ])('%s: every verdict is within 3 cents of the real detuning', (_name, targets, offsets, options) => {
    const { state, heardAt } = play(targets, offsets, options);
    expect(state.finished).toBe(true);
    state.verdicts.forEach((v, i) => {
      expect(v.status).not.toBe('missing');
      expect(Math.abs((v.cents as number) - offsets[i])).toBeLessThanOrEqual(3);
    });
    // Each string is recognised after its own pluck, and within about a second of it.
    heardAt.forEach((seconds) => {
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThan(1.1);
    });
  });

  it('reports a string more than a semitone off as missing', () => {
    const t = play([64, 59], [0, 150]);
    expect(t.state.verdicts[0].status).toBe('ok');
    expect(t.state.verdicts[1].status).toBe('missing');
  });
});
