/** One raw detection. `hz` is null when the frame has no usable pitch. */
export type PitchFrame = { hz: number | null; clarity: number; rmsDb: number };

export type PitchDetectFn = (window: Float32Array, sampleRate: number) => PitchFrame;

/** A smoothed reading ready for display. */
export type TunerReading = {
  /** Smoothed fractional MIDI number (drives the note strip). */
  midi: number;
  /** Displayed integer MIDI note (with hysteresis). */
  note: number;
  /** 100 * (midi - note); can reach about ±60 because of the hysteresis. */
  cents: number;
  hz: number;
  clarity: number;
  inTune: boolean;
  /** True while the signal is gone and the last reading is being held. */
  held: boolean;
};

export type TunerStatus = 'idle' | 'requesting' | 'listening' | 'paused' | 'denied' | 'error';

export interface Smoother {
  push(frame: PitchFrame | null, tMs: number): TunerReading | null;
  reset(): void;
}
