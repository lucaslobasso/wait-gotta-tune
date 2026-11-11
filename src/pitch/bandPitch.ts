import { midiToFreq } from '../music/notes';
import type { PitchFrame } from '../tuner/types';
import {
  CHECK_MIN_LEVEL,
  CHECK_LOW_HZ,
  CHECK_STEP_CENTS,
  CHECK_WINDOW_SIZE,
  RMS_CLOSE_DB,
  TUNE_MIN_SHARE,
  TUNE_RANGE_CENTS,
} from '../tuner/config';

export type BandReading = {
  /** Cents from the note to the strongest peak in its band. */
  cents: number;
  /** Peak amplitude (note plus octave), linear; 1 = full scale. */
  level: number;
  /** The peak as a share of everything in the analysed range (about 0..1, can exceed 1). */
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

type Scan = { scores: Float64Array; rms: number };

/**
 * Strength of every candidate pitch for a string with fundamental `f0`, in
 * `samples[start, start + length)`: the amplitude at the candidate plus the amplitude
 * at its octave (the second partial, which small microphones pick up better).
 * Candidates are `steps` grid points either side of `f0`.
 */
function scan(
  samples: Float32Array,
  start: number,
  length: number,
  sampleRate: number,
  f0: number,
  steps: number,
): Scan | null {
  // Only frequencies up to a bit above 2 * f0 matter: average blocks down to 16 * f0.
  const block = Math.max(1, Math.floor(sampleRate / (16 * f0)));
  const size = Math.floor(length / block);
  if (size < 16) return null;
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

  const scores = new Float64Array(2 * steps + 1);
  for (let i = 0; i < scores.length; i++) {
    const f = f0 * 2 ** (((i - steps) * CHECK_STEP_CENTS) / 1200);
    const omega = (2 * Math.PI * f * block) / sampleRate;
    scores[i] = (2 * (magnitude(x, omega) + magnitude(x, 2 * omega))) / gain;
  }
  return { scores, rms: Math.sqrt(energy / size) };
}

/** The strongest candidate, refined between grid points. Null when it sits on the edge of the band. */
function peak(scores: Float64Array, steps: number, rms: number): BandReading | null {
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
  if (best === 0 || best === scores.length - 1 || rms === 0) return null;
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
 * Measures one known string in the latest audio: looks only at a band `rangeCents`
 * either side of the string's note (and of its octave) and returns the strongest
 * peak there. Returns null when the band has no peak of its own (energy leaking in
 * from a neighbouring note peaks at the edge of the band).
 *
 * Pure. The last CHECK_WINDOW_SIZE samples are used (all of `samples` for very low
 * strings, which need the frequency resolution).
 */
export function measureString(
  samples: Float32Array,
  sampleRate: number,
  targetMidi: number,
  rangeCents: number,
): BandReading | null {
  const steps = Math.round(rangeCents / CHECK_STEP_CENTS);
  const f0 = midiToFreq(targetMidi);
  const length = f0 < CHECK_LOW_HZ ? samples.length : Math.min(samples.length, CHECK_WINDOW_SIZE);
  const result = scan(samples, samples.length - length, length, sampleRate, f0, steps);
  return result && peak(result.scores, steps, result.rms);
}

/**
 * Strength of every candidate pitch in one string's band, in the last `length` samples.
 * Comparing two of these a moment apart shows whether that string was just plucked:
 * its own pitch gets louder, while whatever was already ringing does not.
 */
export function bandScores(
  samples: Float32Array,
  sampleRate: number,
  targetMidi: number,
  length: number,
  rangeCents: number,
): Float64Array | null {
  const steps = Math.round(rangeCents / CHECK_STEP_CENTS);
  const size = Math.min(length, samples.length);
  const result = scan(samples, samples.length - size, size, sampleRate, midiToFreq(targetMidi), steps);
  return result ? result.scores : null;
}

/**
 * Measures a string that was just plucked while earlier strings are still ringing.
 * `samples[postStart, postStart + length)` is the sound after the pluck; the same
 * length of sound ending at `preEnd` is what was sounding before it. Only what the
 * pluck added counts: a ringing string's overtone that falls in this string's band
 * was there before too, and is subtracted.
 *
 * Pure. Returns null when nothing new peaks inside the band.
 */
export function measurePluck(
  samples: Float32Array,
  sampleRate: number,
  targetMidi: number,
  postStart: number,
  length: number,
  preEnd: number,
  rangeCents: number,
): BandReading | null {
  const steps = Math.round(rangeCents / CHECK_STEP_CENTS);
  const f0 = midiToFreq(targetMidi);
  const post = scan(samples, postStart, length, sampleRate, f0, steps);
  if (!post) return null;
  const preLength = Math.min(length, preEnd);
  const pre = preLength > 0 ? scan(samples, preEnd - preLength, preLength, sampleRate, f0, steps) : null;
  if (pre) {
    for (let i = 0; i < post.scores.length; i++) {
      post.scores[i] = Math.max(0, post.scores[i] - pre.scores[i]);
    }
  }
  return peak(post.scores, steps, post.rms);
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
  const reading = measureString(samples, sampleRate, targetMidi, TUNE_RANGE_CENTS);
  if (!reading || reading.level < CHECK_MIN_LEVEL || reading.share < TUNE_MIN_SHARE) return none;
  return {
    hz: midiToFreq(targetMidi + reading.cents / 100),
    clarity: 1,
    // The peak covers the note and its octave: about 1.5x the fundamental, so -3 dB is close enough.
    rmsDb: 20 * Math.log10(reading.level) - 3,
  };
}
