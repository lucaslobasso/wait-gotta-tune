import { midiToFreq } from '../music/notes';
import type { PitchFrame } from '../tuner/types';
import {
  CHECK_CLEAR_CENTS,
  CHECK_MIN_LEVEL,
  CHECK_LOW_HZ,
  CHECK_PARTIALS,
  CHECK_RANGE_CENTS,
  CHECK_STEP_CENTS,
  CHECK_WINDOW_SIZE,
  RMS_CLOSE_DB,
  TUNE_MIN_SHARE,
  TUNE_RANGE_CENTS,
} from '../tuner/config';

export type BandReading = {
  /** Cents from the note to the strongest peak in its band. */
  cents: number;
  /** Peak amplitude (of the bands used: note, octave or both), linear; 1 = full scale. */
  level: number;
  /** The peak as a share of everything in the analysed range (about 0..1). */
  share: number;
};

const hannCache = new Map<number, Float64Array>();

function hann(size: number): Float64Array {
  let w = hannCache.get(size);
  if (!w) {
    w = new Float64Array(size);
    for (let i = 0; i < size; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / size);
    hannCache.set(size, w);
  }
  return w;
}

/** True when a partial of a ringing string falls in or next to the band around `midi`. */
function crowded(midi: number, ringing: readonly number[]): boolean {
  for (const other of ringing) {
    for (let k = 1; k <= CHECK_PARTIALS; k++) {
      const partial = other + 12 * Math.log2(k);
      if (Math.abs(partial - midi) * 100 < CHECK_CLEAR_CENTS) return true;
    }
  }
  return false;
}

/** |X(omega)| of `x` (Goertzel, any frequency), omega in radians per sample. */
function magnitude(x: Float64Array, omega: number): number {
  const k = 2 * Math.cos(omega);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < x.length; i++) {
    const s = x[i] + k * s1 - s2;
    s2 = s1;
    s1 = s;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2));
}

/**
 * Measures one known string while others may be ringing: looks only at a narrow
 * band around the string's note and around its octave (the second partial, which
 * small microphones pick up better), and returns the strongest peak there.
 * `ringing` lists the notes of strings plucked earlier: a band that one of their
 * overtones falls into is left out (if both are, only the note itself is used).
 * Returns null when the band has no peak of its own (energy leaking in from a
 * neighbouring note peaks at the edge of the band).
 *
 * Pure. `samples` is the latest audio; the last CHECK_WINDOW_SIZE samples are used
 * (all of it for very low strings, which need the frequency resolution).
 */
export function measureString(
  samples: Float32Array,
  sampleRate: number,
  targetMidi: number,
  ringing: readonly number[] = [],
  rangeCents: number = CHECK_RANGE_CENTS,
): BandReading | null {
  const steps = Math.round(rangeCents / CHECK_STEP_CENTS);
  const f0 = midiToFreq(targetMidi);
  const length = f0 < CHECK_LOW_HZ ? samples.length : Math.min(samples.length, CHECK_WINDOW_SIZE);
  const start = samples.length - length;

  // Only frequencies up to a bit above 2 * f0 matter: average blocks down to 16 * f0.
  const block = Math.max(1, Math.floor(sampleRate / (16 * f0)));
  const size = Math.floor(length / block);
  if (size < 64) return null;
  const x = new Float64Array(size);
  let mean = 0;
  for (let m = 0; m < size; m++) {
    let sum = 0;
    const from = start + m * block;
    for (let i = 0; i < block; i++) sum += samples[from + i];
    x[m] = sum / block;
    mean += x[m];
  }
  mean /= size;

  const w = hann(size);
  let energy = 0;
  let gain = 0;
  for (let m = 0; m < size; m++) {
    const v = x[m] - mean;
    energy += v * v;
    x[m] = v * w[m];
    gain += w[m];
  }
  const rms = Math.sqrt(energy / size);
  if (rms === 0) return null;

  const useOctave = !crowded(targetMidi + 12, ringing);
  const useNote = !useOctave || !crowded(targetMidi, ringing);

  const scores = new Float64Array(2 * steps + 1);
  let best = 0;
  for (let i = 0; i < scores.length; i++) {
    const f = f0 * 2 ** (((i - steps) * CHECK_STEP_CENTS) / 1200);
    const omega = (2 * Math.PI * f * block) / sampleRate;
    const note = useNote ? magnitude(x, omega) : 0;
    const octave = useOctave ? magnitude(x, 2 * omega) : 0;
    scores[i] = (2 * (note + octave)) / gain;
    if (scores[i] > scores[best]) best = i;
  }
  if (best === 0 || best === scores.length - 1) return null;

  // Parabolic interpolation between grid points.
  const a = scores[best - 1];
  const b = scores[best];
  const c = scores[best + 1];
  const curve = a - 2 * b + c;
  const shift = curve < 0 ? (0.5 * (a - c)) / curve : 0;
  return {
    cents: (best - steps + shift) * CHECK_STEP_CENTS,
    level: b,
    share: b / (Math.SQRT2 * rms),
  };
}

/**
 * Pitch of one known string as a `PitchFrame`, for tuning that string: only its own note
 * and octave are measured, up to TUNE_RANGE_CENTS either way. A neighbouring string, or an
 * overtone of a lower one, is outside the band, so it cannot be mistaken for this string.
 * No peak, too quiet, or too little of the band's sound -> `hz: null`.
 *
 * Pure. Needs the long microphone history (about 0.3 s of it is used), so it follows the
 * pitch a little more slowly than `detectPitch` and a lot more steadily.
 */
export function stringFrame(
  samples: Float32Array,
  sampleRate: number,
  targetMidi: number,
): PitchFrame {
  const none: PitchFrame = { hz: null, clarity: 0, rmsDb: RMS_CLOSE_DB - 1 };
  const reading = measureString(samples, sampleRate, targetMidi, [], TUNE_RANGE_CENTS);
  if (!reading || reading.level < CHECK_MIN_LEVEL || reading.share < TUNE_MIN_SHARE) return none;
  return {
    hz: midiToFreq(targetMidi + reading.cents / 100),
    clarity: 1,
    // The peak covers the note and its octave: about 1.5x the fundamental, so -3 dB is close enough.
    rmsDb: 20 * Math.log10(reading.level) - 3,
  };
}
