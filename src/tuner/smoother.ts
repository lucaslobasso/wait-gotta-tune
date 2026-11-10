import { centsFrom, freqToMidi, midiToFreq } from '../music/notes';
import {
  A4_HZ,
  CLARITY_LOCK,
  CLARITY_SUSTAIN,
  EMA_ALPHA,
  HOLD_MS,
  IN_TUNE_ENTER_CENTS,
  IN_TUNE_EXIT_CENTS,
  JUMP_FRAMES,
  JUMP_SEMITONES,
  MAX_DROPPED,
  MAX_HZ,
  MEDIAN_SIZE,
  MIN_HZ,
  NOTE_SWITCH_FRAMES,
  NOTE_SWITCH_SEMITONES,
  OCTAVE_JUMP_FRAMES,
  RMS_CLOSE_DB,
  RMS_OPEN_DB,
} from './config';
import type { PitchFrame, Smoother, TunerReading } from './types';

export type SmootherOptions = {
  a4?: number;
  /**
   * Instrument modes: the note (MIDI number) of the string being tuned. Read on every
   * frame, so it can change at any time. Null or absent means "nearest note" (Auto).
   */
  target?: () => number | null;
};

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** True when a jump looks like an octave or harmonic error (±1 octave, octave + fifth, 2 octaves). */
function isOctaveShaped(deltaSemitones: number): boolean {
  const d = Math.abs(deltaSemitones);
  return Math.abs(d - 12) <= 0.35 || Math.abs(d - 19.02) <= 0.35 || Math.abs(d - 24) <= 0.35;
}

/**
 * Turns raw detections into a stable reading. All smoothing happens on fractional
 * MIDI numbers (log frequency), never on Hz:
 * gate -> outlier/octave-jump rejection -> median -> EMA -> note hysteresis -> hold.
 */
export function createSmoother(options: SmootherOptions = {}): Smoother {
  const a4 = options.a4 ?? A4_HZ;
  const target = options.target ?? (() => null);

  let previousTarget: number | null = target();
  let tracking = false;
  let history: number[] = [];
  let ema: number | null = null;
  let note: number | null = null;
  let switchCount = 0;
  let pending: number[] = [];
  let dropped = 0;
  let inTune = false;
  let last: TunerReading | null = null;
  let lastValidAt = 0;

  function reset(): void {
    tracking = false;
    history = [];
    ema = null;
    note = null;
    switchCount = 0;
    pending = [];
    dropped = 0;
    inTune = false;
    last = null;
  }

  function passesGate(frame: PitchFrame): frame is PitchFrame & { hz: number } {
    if (frame.hz === null || frame.hz < MIN_HZ || frame.hz > MAX_HZ) return false;
    if (frame.clarity < (tracking ? CLARITY_SUSTAIN : CLARITY_LOCK)) return false;
    return frame.rmsDb >= (tracking ? RMS_CLOSE_DB : RMS_OPEN_DB);
  }

  function restartAt(values: number[]): void {
    history = values.slice(-MEDIAN_SIZE);
    ema = null;
    note = null;
    switchCount = 0;
    pending = [];
    dropped = 0;
    inTune = false;
  }

  function push(frame: PitchFrame | null, tMs: number): TunerReading | null {
    // A different string (or mode): nothing measured against the old one may linger.
    const fixed = target();
    if (fixed !== previousTarget) {
      previousTarget = fixed;
      reset();
    }
    if (!frame || !passesGate(frame)) {
      if (last && tMs - lastValidAt <= HOLD_MS) return { ...last, held: true };
      reset();
      return null;
    }
    tracking = true;
    const m = freqToMidi(frame.hz, a4);

    if (ema !== null && Math.abs(m - ema) > JUMP_SEMITONES) {
      // Suspected outlier: only believe it once several consecutive frames agree.
      const agrees = pending.length > 0 && Math.abs(m - pending[pending.length - 1]) <= 0.5;
      pending = agrees ? [...pending, m] : [m];
      dropped += 1;
      const needed = isOctaveShaped(m - ema) ? OCTAVE_JUMP_FRAMES : JUMP_FRAMES;
      if (pending.length >= needed) {
        restartAt(pending);
      } else if (dropped >= MAX_DROPPED) {
        restartAt([m]);
      } else {
        // Keep showing the current reading; the hold timer keeps running.
        if (last && tMs - lastValidAt <= HOLD_MS) return last;
        reset();
        return null;
      }
    } else {
      pending = [];
      dropped = 0;
      history.push(m);
      if (history.length > MEDIAN_SIZE) history.shift();
    }

    const med = median(history);
    const smoothed: number = ema === null ? med : ema + EMA_ALPHA * (med - ema);
    ema = smoothed;

    if (fixed !== null) {
      // Tuning one string: always measure against it, however far off the pitch is.
      if (note !== fixed) inTune = false;
      note = fixed;
      switchCount = 0;
    } else if (note === null) {
      note = Math.round(smoothed);
      switchCount = 0;
      inTune = false;
    } else if (Math.abs(smoothed - note) > NOTE_SWITCH_SEMITONES) {
      switchCount += 1;
      if (switchCount >= NOTE_SWITCH_FRAMES) {
        note = Math.round(smoothed);
        switchCount = 0;
        inTune = false;
      }
    } else {
      switchCount = 0;
    }
    const cents = centsFrom(smoothed, note);
    inTune = Math.abs(cents) <= (inTune ? IN_TUNE_EXIT_CENTS : IN_TUNE_ENTER_CENTS);

    last = {
      midi: smoothed,
      note,
      cents,
      hz: midiToFreq(smoothed, a4),
      clarity: frame.clarity,
      inTune,
      held: false,
    };
    lastValidAt = tMs;
    return last;
  }

  return { push, reset };
}
