import { A4_HZ } from '../tuner/config';

const LETTERS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'] as const;
const SHARP = [false, true, false, true, false, false, true, false, true, false, true, false] as const;

export type NoteInfo = {
  midi: number;
  /** Letter without accidental, e.g. "A". */
  letter: string;
  sharp: boolean;
  /** e.g. "A♯". */
  name: string;
  /** Scientific pitch octave: C4 = MIDI 60, A4 = MIDI 69. Changes at C. */
  octave: number;
  /** For screen readers, e.g. "A sharp 4". */
  spoken: string;
};

/** Fractional MIDI number for a frequency. */
export function freqToMidi(hz: number, a4: number = A4_HZ): number {
  return 69 + 12 * Math.log2(hz / a4);
}

export function midiToFreq(midi: number, a4: number = A4_HZ): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

/** Note for an integer MIDI number (sharps only for now). */
export function midiToNote(midi: number): NoteInfo {
  const index = ((midi % 12) + 12) % 12;
  const letter = LETTERS[index];
  const sharp = SHARP[index];
  const octave = Math.floor(midi / 12) - 1;
  return {
    midi,
    letter,
    sharp,
    name: sharp ? `${letter}♯` : letter,
    octave,
    spoken: `${letter}${sharp ? ' sharp' : ''} ${octave}`,
  };
}

/** Cents from `note` to `midi`, with -0 normalised to 0. */
export function centsFrom(midi: number, note: number): number {
  return 100 * (midi - note) + 0;
}
