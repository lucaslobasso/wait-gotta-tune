import { bandScores, measurePluck, type BandReading } from '../pitch/bandPitch';
import {
  CHECK_COMPARE_MS,
  CHECK_IN_TUNE_CENTS,
  CHECK_MAX_MEASURE_MS,
  CHECK_MIN_GAP_MS,
  CHECK_MIN_LEVEL,
  CHECK_MIN_MEASURE_MS,
  CHECK_MIN_SHARE,
  CHECK_ONSET_MIN_RMS,
  CHECK_ONSET_NEW_SHARE,
  CHECK_ONSET_RATIO,
  CHECK_PRE_GAP_MS,
  CHECK_RANGE_CENTS,
  CHECK_SKIP_MS,
  CHECK_WAIT_MS,
  WINDOW_SIZE,
} from './config';

export type StringVerdict = {
  /** 'missing' = not plucked (yet), or no clear pitch near the string's note. */
  status: 'ok' | 'flat' | 'sharp' | 'missing';
  /** Rounded cents from the string's note; null when missing. */
  cents: number | null;
};

export type StrumCheckState = {
  /** One verdict per string, in profile order (string 1 first). */
  verdicts: StringVerdict[];
  /** Index of the string expected next (the last one while it is being measured); null once finished. */
  current: number | null;
  finished: boolean;
};

export interface StrumCheck {
  /** Feed every microphone window (the latest samples, once per hop). Ignored once finished. */
  push(samples: Float32Array, sampleRate: number, tMs: number): StrumCheckState;
}

/**
 * Checks every string from one slow strum: the thickest string first, then the next,
 * up to string 1, a fraction of a second apart. Strings are told apart by order, not
 * by pitch: the first pluck heard is the last string of the profile, the next pluck
 * the one above it, and so on. However far off a string is, it is still that string.
 *
 * A pluck is a sudden rise in level, overall or around the note of the string that
 * is due. The string is then measured around its own note
 * in the sound after the pluck, up to the next pluck, against what was sounding before.
 * The check ends after the last string, or when no pluck is heard for a while
 * (strings not reached stay 'missing').
 *
 * Pure: no timers, time comes in with each window.
 */
export function createStrumCheck(targets: readonly number[]): StrumCheck {
  const verdicts: StringVerdict[] = targets.map(() => ({ status: 'missing', cents: null }));
  /** Plucks heard so far; pluck number n belongs to string index `targets.length - 1 - n`. */
  let plucks = 0;
  let measuring: { index: number; since: number; best: BandReading | null } | null = null;
  let lastActivity: number | null = null;
  /**
   * What recent windows looked like, oldest first: the overall level and the band scan
   * of the string that is due. Windows may arrive at any rate (a browser delivers them
   * about twice as often as a phone), so "before" is always chosen by time.
   */
  let history: { t: number; level: number; scores: Float64Array | null }[] = [];
  let finished = false;

  function state(): StrumCheckState {
    const next = Math.max(0, targets.length - 1 - plucks);
    return { verdicts: verdicts.slice(), current: finished ? null : next, finished };
  }

  function conclude(): void {
    if (!measuring) return;
    const reading = measuring.best;
    if (reading) {
      const cents = Math.round(reading.cents) + 0;
      const status = Math.abs(cents) <= CHECK_IN_TUNE_CENTS ? 'ok' : cents < 0 ? 'flat' : 'sharp';
      verdicts[measuring.index] = { status, cents };
    }
    measuring = null;
  }

  function push(samples: Float32Array, sampleRate: number, tMs: number): StrumCheckState {
    if (finished || targets.length === 0) {
      finished = true;
      return state();
    }
    if (lastActivity === null) lastActivity = tMs;
    const perMs = sampleRate / 1000;

    // The newest short window: its overall level, and the band of the string that is due.
    let energy = 0;
    const size = Math.min(WINDOW_SIZE, samples.length);
    for (let i = samples.length - size; i < samples.length; i++) energy += samples[i] * samples[i];
    const level = Math.sqrt(energy / Math.max(1, size));
    const due = plucks < targets.length;
    const scores = due
      ? bandScores(samples, sampleRate, targets[targets.length - 1 - plucks], WINDOW_SIZE, CHECK_RANGE_CENTS)
      : null;

    // Compare with the newest window that is old enough not to overlap this one much.
    // Nothing counts until there is one (a noisy room is not a pluck).
    let earlier: (typeof history)[number] | null = null;
    for (const past of history) if (past.t <= tMs - CHECK_COMPARE_MS) earlier = past;
    if (earlier) history = history.filter((past) => past.t >= earlier!.t);

    const louder =
      earlier !== null && level >= CHECK_ONSET_MIN_RMS && level >= CHECK_ONSET_RATIO * earlier.level;
    let appeared = false;
    if (earlier?.scores && scores) {
      let grown = 0;
      for (let i = 0; i < scores.length; i++) grown = Math.max(grown, scores[i] - earlier.scores[i]);
      appeared = grown >= CHECK_MIN_LEVEL && grown >= CHECK_ONSET_NEW_SHARE * Math.SQRT2 * level;
    }

    const sinceLast = measuring ? tMs - measuring.since : Infinity;
    // Right after a pluck the short window is still filling up with the new string:
    // those windows would make it look like yet another pluck, so they are not kept.
    if (sinceLast >= size / perMs) history.push({ t: tMs, level, scores });

    const plucked = due && (louder || appeared) && sinceLast >= CHECK_MIN_GAP_MS;

    if (plucked) {
      history = [];
      conclude();
      measuring = { index: targets.length - 1 - plucks, since: tMs, best: null };
      plucks += 1;
      lastActivity = tMs;
      return state();
    }

    if (measuring) {
      const age = tMs - measuring.since;
      const span = Math.min(age - CHECK_SKIP_MS, CHECK_MAX_MEASURE_MS);
      if (span >= CHECK_MIN_MEASURE_MS) {
        const length = Math.min(samples.length, Math.round(span * perMs));
        const preEnd = Math.max(0, samples.length - Math.round((age + CHECK_PRE_GAP_MS) * perMs));
        const reading = measurePluck(
          samples,
          sampleRate,
          targets[measuring.index],
          samples.length - length,
          length,
          preEnd,
          CHECK_RANGE_CENTS,
        );
        // A longer stretch of sound is a better measurement: the latest good one wins.
        if (reading && reading.level >= CHECK_MIN_LEVEL && reading.share >= CHECK_MIN_SHARE) {
          measuring.best = reading;
        }
      }
      if (plucks === targets.length && age >= CHECK_SKIP_MS + CHECK_MAX_MEASURE_MS) {
        conclude();
        finished = true;
        return state();
      }
    }

    if (tMs - lastActivity >= CHECK_WAIT_MS) {
      conclude();
      finished = true;
    }
    return state();
  }

  return { push };
}
