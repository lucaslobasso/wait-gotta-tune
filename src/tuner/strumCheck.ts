import { measureString, type BandReading } from '../pitch/bandPitch';
import {
  CHECK_IN_TUNE_CENTS,
  CHECK_MIN_LEVEL,
  CHECK_MIN_SHARE,
  CHECK_STABLE_CENTS,
  CHECK_STABLE_FRAMES,
  CHECK_STRING_TIMEOUT_MS,
} from './config';

export type StringVerdict = {
  /** 'missing' = not heard (yet), or too far off to recognise. */
  status: 'ok' | 'flat' | 'sharp' | 'missing';
  /** Rounded cents from the string's note; null when missing. */
  cents: number | null;
};

export type StrumCheckState = {
  /** One verdict per string, in profile order (string 1 first). */
  verdicts: StringVerdict[];
  /** Index of the string to pluck now; null once finished. */
  current: number | null;
  finished: boolean;
};

export interface StrumCheck {
  /** Feed every microphone window. Once finished, further windows are ignored. */
  push(samples: Float32Array, sampleRate: number, tMs: number): StrumCheckState;
}

export type MeasureFn = (
  samples: Float32Array,
  sampleRate: number,
  targetMidi: number,
  ringing: readonly number[],
) => BandReading | null;

/**
 * A guided check of every string: asks for string 1, then the next one down, and
 * so on. Going from the thinnest string down matters: a thick string's overtones
 * land on the notes of thinner strings, so those are measured before it rings.
 * Each string gets a verdict once consecutive measurements agree; one that is not
 * heard in time is reported as missing. If the very first string is not heard,
 * the check ends there.
 *
 * Pure: no timers, time comes in with each window.
 */
export function createStrumCheck(
  targets: readonly number[],
  measure: MeasureFn = measureString,
): StrumCheck {
  const verdicts: StringVerdict[] = targets.map(() => ({ status: 'missing', cents: null }));
  let current = 0;
  let since: number | null = null;
  let recent: number[] = [];
  let heardAny = false;

  function state(): StrumCheckState {
    const finished = current >= targets.length;
    return { verdicts: verdicts.slice(), current: finished ? null : current, finished };
  }

  function advance(tMs: number): void {
    current += 1;
    since = tMs;
    recent = [];
  }

  function push(samples: Float32Array, sampleRate: number, tMs: number): StrumCheckState {
    if (current >= targets.length) return state();
    if (since === null) since = tMs;

    const reading = measure(samples, sampleRate, targets[current], targets.slice(0, current));
    if (reading && reading.level >= CHECK_MIN_LEVEL && reading.share >= CHECK_MIN_SHARE) {
      recent.push(reading.cents);
      if (recent.length > CHECK_STABLE_FRAMES) recent.shift();
    } else {
      recent = [];
    }

    if (recent.length === CHECK_STABLE_FRAMES) {
      const sorted = [...recent].sort((a, b) => a - b);
      if (sorted[sorted.length - 1] - sorted[0] <= CHECK_STABLE_CENTS) {
        const cents = Math.round(sorted[sorted.length >> 1]) + 0;
        const status =
          Math.abs(cents) <= CHECK_IN_TUNE_CENTS ? 'ok' : cents < 0 ? 'flat' : 'sharp';
        verdicts[current] = { status, cents };
        heardAny = true;
        advance(tMs);
        return state();
      }
    }

    if (tMs - since >= CHECK_STRING_TIMEOUT_MS) {
      if (heardAny) advance(tMs);
      else current = targets.length;
    }
    return state();
  }

  return { push };
}
