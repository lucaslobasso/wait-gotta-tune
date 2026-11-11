import { midiToFreq } from '../../music/notes';
import { CHECK_BUFFER_SIZE } from '../../tuner/config';
import { measurePluck, measureString } from '../bandPitch';

type Tone = { midi: number; amplitude?: number; harmonics?: number[]; from?: number };

/** Steady tones; `from` (samples) makes a tone start part-way through the buffer. */
function mix(tones: Tone[], sr = 48000): Float32Array {
  const out = new Float32Array(CHECK_BUFFER_SIZE);
  tones.forEach(({ midi, amplitude = 0.1, harmonics = [1, 0.5, 0.3], from = 0 }, n) => {
    const f = midiToFreq(midi);
    for (let i = from; i < out.length; i++) {
      for (let k = 0; k < harmonics.length; k++) {
        out[i] += amplitude * harmonics[k] * Math.sin((2 * Math.PI * (k + 1) * f * i) / sr + n + k);
      }
    }
  });
  return out;
}

describe('measureString', () => {
  it.each([64, 59, 55, 50, 45, 40, 33, 28, 69])('reads the detuning of MIDI %d alone', (midi) => {
    for (const cents of [-60, -12, 0, 7, 45]) {
      const reading = measureString(mix([{ midi: midi + cents / 100 }]), 48000, midi, 80);
      expect(Math.abs((reading?.cents ?? 999) - cents)).toBeLessThan(1);
      expect(reading?.share).toBeGreaterThan(0.5);
    }
  });

  it('reaches as far as the range it is given', () => {
    const audio = mix([{ midi: 45 + 1.9 }]);
    expect(measureString(audio, 48000, 45, 80)).toBeNull();
    expect(Math.abs((measureString(audio, 48000, 45, 250)?.cents ?? 999) - 190)).toBeLessThan(1);
  });

  it('reports the level of the note plus its octave', () => {
    const audio = mix([{ midi: 57, amplitude: 0.2, harmonics: [1, 0.5] }]);
    expect(measureString(audio, 48000, 57, 80)?.level).toBeCloseTo(0.3, 1);
  });

  it('measures a string under louder higher strings that are still ringing', () => {
    // Guitar D string, 20 cents flat, with E4, B3 and G3 ringing twice as loud.
    const audio = mix(
      [
        { midi: 64, amplitude: 0.2 },
        { midi: 59, amplitude: 0.2 },
        { midi: 55, amplitude: 0.2 },
        { midi: 49.8 },
      ],
      44100,
    );
    const reading = measureString(audio, 44100, 50, 80);
    expect(Math.abs((reading?.cents ?? 999) + 20)).toBeLessThan(1.5);
  });

  it('finds nothing in silence or when only a neighbouring note sounds', () => {
    expect(measureString(new Float32Array(CHECK_BUFFER_SIZE), 48000, 64, 80)).toBeNull();
    const reading = measureString(mix([{ midi: 62 }]), 48000, 64, 80);
    expect(reading === null || reading.share < 0.02).toBe(true);
  });
});

describe('measurePluck', () => {
  const LENGTH = 9600; // 0.2 s
  const PLUCK_AT = CHECK_BUFFER_SIZE - LENGTH - 2400;

  it('reads a string plucked into silence', () => {
    const audio = mix([{ midi: 40.25, from: PLUCK_AT }]);
    const reading = measurePluck(audio, 48000, 40, CHECK_BUFFER_SIZE - LENGTH, LENGTH, PLUCK_AT - 1200, 250);
    expect(Math.abs((reading?.cents ?? 999) - 25)).toBeLessThan(3);
  });

  it('counts only what the pluck added: an overtone that was already ringing is ignored', () => {
    // The low E rings (its third partial is B3, its sixth B4); then the B string, 30 cents sharp.
    const audio = mix([
      { midi: 40, amplitude: 0.15, harmonics: [1, 0.6, 0.5, 0.2, 0.1, 0.1] },
      { midi: 59.3, from: PLUCK_AT },
    ]);
    const reading = measurePluck(audio, 48000, 59, CHECK_BUFFER_SIZE - LENGTH, LENGTH, PLUCK_AT - 1200, 250);
    expect(Math.abs((reading?.cents ?? 999) - 30)).toBeLessThan(6);
  });

  it('finds nothing new when the string was not plucked', () => {
    const audio = mix([{ midi: 40, amplitude: 0.15, harmonics: [1, 0.6, 0.5] }]);
    const reading = measurePluck(audio, 48000, 59, CHECK_BUFFER_SIZE - LENGTH, LENGTH, PLUCK_AT - 1200, 250);
    expect(reading === null || reading.share < 0.05).toBe(true);
  });
});
