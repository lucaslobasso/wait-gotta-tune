import { centsFrom, freqToMidi, midiToFreq, midiToNote } from '../notes';

describe('freqToMidi / midiToFreq', () => {
  it('maps reference pitches', () => {
    expect(freqToMidi(440)).toBeCloseTo(69, 10);
    expect(freqToMidi(261.6256)).toBeCloseTo(60, 3);
    expect(freqToMidi(880)).toBeCloseTo(81, 10);
  });

  it('honours the A4 reference', () => {
    expect(freqToMidi(442, 442)).toBeCloseTo(69, 10);
    expect(freqToMidi(440, 442)).toBeLessThan(69);
    expect(midiToFreq(69, 432)).toBeCloseTo(432, 10);
  });

  it('round trips', () => {
    for (const hz of [30.87, 82.41, 440, 1567.98]) {
      expect(midiToFreq(freqToMidi(hz))).toBeCloseTo(hz, 8);
    }
  });
});

describe('midiToNote', () => {
  it('names notes and octaves, changing octave at C', () => {
    expect(midiToNote(69)).toMatchObject({ name: 'A', octave: 4, sharp: false });
    expect(midiToNote(60)).toMatchObject({ name: 'C', octave: 4 });
    expect(midiToNote(59)).toMatchObject({ name: 'B', octave: 3 });
    expect(midiToNote(21)).toMatchObject({ name: 'A', octave: 0 });
    expect(midiToNote(70)).toMatchObject({ name: 'A♯', letter: 'A', sharp: true, octave: 4 });
    expect(midiToNote(0)).toMatchObject({ name: 'C', octave: -1 });
  });

  it('handles negative MIDI numbers', () => {
    expect(midiToNote(-1)).toMatchObject({ name: 'B', octave: -2 });
    expect(midiToNote(-12)).toMatchObject({ name: 'C', octave: -2 });
  });

  it('gives a spoken form for screen readers', () => {
    expect(midiToNote(70).spoken).toBe('A sharp 4');
    expect(midiToNote(64).spoken).toBe('E 4');
  });
});

describe('centsFrom', () => {
  it('measures cents from a note', () => {
    expect(centsFrom(69.12, 69)).toBeCloseTo(12, 8);
    expect(centsFrom(68.5, 69)).toBeCloseTo(-50, 8);
  });

  it('never returns negative zero', () => {
    expect(Object.is(centsFrom(69, 69), 0)).toBe(true);
    expect(Object.is(Math.round(centsFrom(68.999, 69)) + 0, 0)).toBe(true);
  });
});
