import { PitchDetector } from 'pitchy';

import { RMS_CLOSE_DB } from '../tuner/config';
import type { PitchDetectFn } from '../tuner/types';

const SILENCE_DB = -160;

/**
 * Pure pitch detection for one analysis window (McLeod Pitch Method via pitchy).
 * Removes the DC offset, measures the level, and skips detection when the window
 * is quieter than the close gate. All stateful gating lives in the smoother.
 */
export function createPitchDetector(windowSize: number): PitchDetectFn {
  const detector = PitchDetector.forFloat32Array(windowSize);
  const scratch = new Float32Array(windowSize);

  return (window, sampleRate) => {
    if (window.length !== windowSize) {
      throw new Error(`Expected a window of ${windowSize} samples, got ${window.length}`);
    }
    let sum = 0;
    for (let i = 0; i < windowSize; i++) sum += window[i];
    const mean = sum / windowSize;

    let energy = 0;
    for (let i = 0; i < windowSize; i++) {
      const v = window[i] - mean;
      scratch[i] = v;
      energy += v * v;
    }
    const rms = Math.sqrt(energy / windowSize);
    const rmsDb = rms > 0 ? Math.max(SILENCE_DB, 20 * Math.log10(rms)) : SILENCE_DB;

    if (rmsDb < RMS_CLOSE_DB) return { hz: null, clarity: 0, rmsDb };

    const [hz, clarity] = detector.findPitch(scratch, sampleRate);
    if (!Number.isFinite(hz) || hz <= 0) return { hz: null, clarity: 0, rmsDb };
    return { hz, clarity, rmsDb };
  };
}
