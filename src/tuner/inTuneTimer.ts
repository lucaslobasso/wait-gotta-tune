import { IN_TUNE_HOLD_MS, MAX_FRAME_GAP_MS } from './config';
import type { TunerReading } from './types';

export type InTuneTimer = {
  /** Feed every reading. Returns true once, when the string has rung in tune long enough. */
  push(reading: TunerReading | null, tMs: number): boolean;
  /** 0..1 progress towards the hold time. */
  progress(): number;
  reset(): void;
};

/**
 * Measures how long a string has been ringing in tune. Only live in-tune frames
 * count. A short gap while the last reading is held (the note died away and is
 * plucked again) pauses the count; going out of tune or losing the note resets it.
 */
export function createInTuneTimer(holdMs: number = IN_TUNE_HOLD_MS): InTuneTimer {
  let elapsed = 0;
  let lastAt: number | null = null;

  function reset(): void {
    elapsed = 0;
    lastAt = null;
  }

  function push(reading: TunerReading | null, tMs: number): boolean {
    if (!reading || !reading.inTune) {
      reset();
      return false;
    }
    if (reading.held) {
      lastAt = null;
      return false;
    }
    if (lastAt !== null) elapsed += Math.min(MAX_FRAME_GAP_MS, Math.max(0, tMs - lastAt));
    lastAt = tMs;
    if (elapsed >= holdMs) {
      reset();
      return true;
    }
    return false;
  }

  return { push, progress: () => Math.min(1, elapsed / holdMs), reset };
}
