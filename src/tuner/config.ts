/** All tuning constants in one place. RMS and clarity gates are starting points; calibrate on devices. */

export const WINDOW_SIZE = 4096;
export const HOP_SIZE = 2048;

export const A4_HZ = 440;
export const MIN_HZ = 28;
export const MAX_HZ = 1600;

/** Clarity needed to start tracking, and the lower bar to keep tracking a decaying note. */
export const CLARITY_LOCK = 0.9;
export const CLARITY_SUSTAIN = 0.8;

/** Signal level (dBFS) needed to start tracking, and the level below which tracking stops. */
export const RMS_OPEN_DB = -50;
export const RMS_CLOSE_DB = -58;

/** A reading further than this (semitones) from the current pitch is a suspected outlier. */
export const JUMP_SEMITONES = 0.6;
/** Agreeing frames needed to accept a jump; octave/harmonic-shaped jumps need more. */
export const JUMP_FRAMES = 2;
export const OCTAVE_JUMP_FRAMES = 3;
/** After this many consecutive rejected frames the newest one is accepted anyway. */
export const MAX_DROPPED = 3;

export const MEDIAN_SIZE = 5;
export const EMA_ALPHA = 0.35;

/** The displayed note changes only after the pitch sits this far away for this many frames. */
export const NOTE_SWITCH_SEMITONES = 0.6;
export const NOTE_SWITCH_FRAMES = 3;

/** How long the last reading stays on screen (dimmed) after the signal drops. */
export const HOLD_MS = 1000;

/** In tune when within ENTER cents; stays in tune until beyond EXIT cents. */
export const IN_TUNE_ENTER_CENTS = 5;
export const IN_TUNE_EXIT_CENTS = 8;

/** Instrument modes: a string must ring in tune this long before moving to the next one. */
export const IN_TUNE_HOLD_MS = 3000;
/** Longest gap between two readings that still counts as continuous ringing. */
export const MAX_FRAME_GAP_MS = 250;

/** Range of the note strip: A0 to G#6. */
export const STRIP_MIN_MIDI = 21;
export const STRIP_MAX_MIDI = 92;
