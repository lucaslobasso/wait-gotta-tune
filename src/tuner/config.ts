/** All tuning constants in one place. RMS and clarity gates are starting points; calibrate on devices. */

/**
 * Every window below is sized in samples for about this rate (44.1 kHz is fine too).
 * Some computers run audio at 96 or 192 kHz, where the same windows would be far too
 * short for low notes: the web microphone asks the browser for this rate instead.
 */
export const PREFERRED_SAMPLE_RATE = 48000;

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

/** Samples the microphone keeps (the Auto tuner uses the last WINDOW_SIZE of them). */
export const CHECK_BUFFER_SIZE = 32768;
/** Band measurements use this many samples; strings below CHECK_LOW_HZ use the whole buffer. */
export const CHECK_WINDOW_SIZE = 16384;
export const CHECK_LOW_HZ = 70;
/** Band measurements search on a grid of this step (cents). */
export const CHECK_STEP_CENTS = 4;
/** A measured peak must be at least this loud (linear amplitude, about -54 dBFS). */
export const CHECK_MIN_LEVEL = 0.002;

/**
 * Tuning one selected string: it is measured only in its own band (see `stringFrame`), so other
 * strings and its own overtones cannot pull the reading. The band reaches this far either way
 * (a string further off than this is not heard); the peak must be this share of the band's sound.
 */
export const TUNE_RANGE_CENTS = 250;
export const TUNE_MIN_SHARE = 0.4;

/**
 * String check (experimental): the user plucks every string once, from the thickest
 * to string 1, a fraction of a second apart. Each pluck heard is taken as the next
 * string in that order (it is not recognised by its pitch), then that string is
 * measured around its own note. Untested on real instruments: calibrate on devices.
 */
/**
 * Plucks are found by comparing the last WINDOW_SIZE samples with the same thing at
 * least this long ago (by time: windows arrive at different rates on web and native).
 */
export const CHECK_COMPARE_MS = 60;
/**
 * A pluck is either a jump in the overall level by this factor, reaching at least
 * CHECK_ONSET_MIN_RMS (linear RMS, about -50 dBFS)...
 */
export const CHECK_ONSET_RATIO = 1.6;
export const CHECK_ONSET_MIN_RMS = 0.003;
/**
 * ...or new sound around the note of the string that is due (a soft pluck over ringing
 * strings barely moves the overall level): some pitch in its band grew by at least this
 * share of the overall level, and by at least CHECK_MIN_LEVEL...
 */
export const CHECK_ONSET_NEW_SHARE = 0.25;
/** ...and at least this long after the previous pluck (in practice about 150 to 190 ms: see CHECK_COMPARE_MS). */
export const CHECK_MIN_GAP_MS = 150;
/** The measurement starts this long after a pluck is noticed (skips the attack)... */
export const CHECK_SKIP_MS = 45;
/** ...and covers at least / at most this much sound, always ending before the next pluck. */
export const CHECK_MIN_MEASURE_MS = 70;
export const CHECK_MAX_MEASURE_MS = 250;
/** What was already sounding is taken from audio ending this long before the pluck was noticed. */
export const CHECK_PRE_GAP_MS = 70;
/** How far (cents) from its note a plucked string is searched. */
export const CHECK_RANGE_CENTS = 250;
/** The new sound must be at least this share of everything in the string's range. */
export const CHECK_MIN_SHARE = 0.1;
/** A string passes the check when it is within this many cents. */
export const CHECK_IN_TUNE_CENTS = 8;
/** The check ends when no pluck is heard for this long. */
export const CHECK_WAIT_MS = 6000;

