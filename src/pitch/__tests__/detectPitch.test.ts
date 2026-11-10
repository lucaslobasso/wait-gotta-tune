import { CLARITY_SUSTAIN, MAX_HZ, MIN_HZ, WINDOW_SIZE } from '../../tuner/config';
import { createPitchDetector } from '../detectPitch';

/** Deterministic PRNG so the noisy cases never flake. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Synth = {
  f: number;
  sr: number;
  /** Amplitude of each harmonic, fundamental first. */
  harmonics?: number[];
  amplitude?: number;
  /** White noise amplitude (uniform, peak). */
  noise?: number;
  dc?: number;
  seed?: number;
};

function synth({ f, sr, harmonics = [1], amplitude = 0.3, noise = 0, dc = 0, seed = 1 }: Synth) {
  const random = mulberry32(seed);
  const phase = random() * 2 * Math.PI;
  const norm = harmonics.reduce((sum, a) => sum + Math.abs(a), 0);
  const out = new Float32Array(WINDOW_SIZE);
  for (let i = 0; i < WINDOW_SIZE; i++) {
    let v = 0;
    for (let k = 0; k < harmonics.length; k++) {
      v += harmonics[k] * Math.sin((2 * Math.PI * (k + 1) * f * i) / sr + phase * (k + 1));
    }
    out[i] = (amplitude * v) / norm + dc + noise * (random() * 2 - 1);
  }
  return out;
}

function centsError(hz: number, expected: number): number {
  return 1200 * Math.log2(hz / expected);
}

const detect = createPitchDetector(WINDOW_SIZE);
const RATES = [44100, 48000];
// E1 (bass) up to G6.
const NOTES = [41.2, 55, 82.41, 110, 146.83, 196, 246.94, 329.63, 440, 659.25, 880, 1318.51, 1567.98];

describe('detectPitch', () => {
  describe.each(RATES)('at %i Hz', (sr) => {
    it.each(NOTES)('finds a %f Hz sine', (f) => {
      const { hz, clarity } = detect(synth({ f, sr }), sr);
      expect(hz).not.toBeNull();
      expect(Math.abs(centsError(hz!, f))).toBeLessThan(f < 60 ? 10 : 3);
      expect(clarity).toBeGreaterThan(0.95);
    });

    it.each(NOTES.filter((f) => f <= 880))(
      'finds the fundamental of a harmonic-rich %f Hz tone',
      (f) => {
        const { hz } = detect(synth({ f, sr, harmonics: [1, 0.5, 0.33, 0.25, 0.2] }), sr);
        expect(hz).not.toBeNull();
        // Under 50 cents means the right note and octave.
        expect(Math.abs(centsError(hz!, f))).toBeLessThan(f < 60 ? 10 : 3);
      },
    );

    it.each([82.41, 110, 196])(
      'finds a %f Hz note whose fundamental is weak (small phone mic)',
      (f) => {
        const { hz } = detect(synth({ f, sr, harmonics: [0.1, 1, 0.8, 0.5] }), sr);
        expect(hz).not.toBeNull();
        expect(Math.abs(centsError(hz!, f))).toBeLessThan(10);
      },
    );

    it.each([110, 440])('tolerates noise on a %f Hz sine', (f) => {
      // Signal RMS 0.21, noise RMS about 0.023: roughly 19 dB SNR.
      const { hz, clarity } = detect(synth({ f, sr, noise: 0.04, seed: 7 }), sr);
      expect(hz).not.toBeNull();
      expect(Math.abs(centsError(hz!, f))).toBeLessThan(10);
      expect(clarity).toBeGreaterThan(0.8);
    });
  });

  it.each(RATES)('never reports a confident in-range pitch for white noise at %i Hz', (sr) => {
    // pitchy often reports HIGH clarity on noise, but only at frequencies below the
    // tuner's range. The frequency gate, not clarity alone, is what stops ghost notes.
    let confidentOutOfRange = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const { hz, clarity } = detect(synth({ f: 440, sr, amplitude: 0, noise: 0.17, seed }), sr);
      const inRange = hz !== null && hz >= MIN_HZ && hz <= MAX_HZ;
      if (clarity >= CLARITY_SUSTAIN && !inRange) confidentOutOfRange += 1;
      expect(inRange && clarity >= CLARITY_SUSTAIN).toBe(false);
    }
    expect(confidentOutOfRange).toBeGreaterThan(0);
  });

  it('returns no pitch for silence', () => {
    const frame = detect(new Float32Array(WINDOW_SIZE), 48000);
    expect(frame.hz).toBeNull();
    expect(frame.rmsDb).toBeLessThanOrEqual(-100);
    expect(Number.isNaN(frame.rmsDb)).toBe(false);
  });

  it('skips detection below the level gate', () => {
    const frame = detect(synth({ f: 440, sr: 48000, amplitude: 0.001 }), 48000);
    expect(frame.rmsDb).toBeCloseTo(-63, 0);
    expect(frame.hz).toBeNull();
  });

  it('ignores a DC offset for both pitch and level', () => {
    const frame = detect(synth({ f: 220, sr: 48000, amplitude: 0.1, dc: 0.3 }), 48000);
    expect(Math.abs(centsError(frame.hz!, 220))).toBeLessThan(3);
    // RMS of a 0.1 sine is about -23 dBFS; with the offset left in it would be about -10.
    expect(frame.rmsDb).toBeCloseTo(-23, 0);
  });

  it('does not modify the input window', () => {
    const input = synth({ f: 220, sr: 48000, dc: 0.2 });
    const copy = Float32Array.from(input);
    detect(input, 48000);
    expect(Array.from(input)).toEqual(Array.from(copy));
  });

  it('rejects a window of the wrong length', () => {
    expect(() => detect(new Float32Array(1024), 48000)).toThrow(/4096/);
  });
});
