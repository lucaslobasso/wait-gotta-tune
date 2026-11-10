import { midiToFreq } from '../../music/notes';
import { CHECK_BUFFER_SIZE } from '../../tuner/config';
import { measureString } from '../bandPitch';

type Tone = { midi: number; amplitude?: number; harmonics?: number[] };

function mix(tones: Tone[], sr = 48000): Float32Array {
  const out = new Float32Array(CHECK_BUFFER_SIZE);
  tones.forEach(({ midi, amplitude = 0.1, harmonics = [1, 0.5, 0.3] }, n) => {
    const f = midiToFreq(midi);
    for (let i = 0; i < out.length; i++) {
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
      const reading = measureString(mix([{ midi: midi + cents / 100 }]), 48000, midi);
      expect(Math.abs((reading?.cents ?? 999) - cents)).toBeLessThan(1);
      expect(reading?.share).toBeGreaterThan(0.5);
    }
  });

  it('reports the level of the note plus its octave', () => {
    const reading = measureString(mix([{ midi: 57, amplitude: 0.2, harmonics: [1, 0.5] }]), 48000, 57);
    expect(reading?.level).toBeCloseTo(0.3, 1);
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
    const reading = measureString(audio, 44100, 50, [64, 59, 55]);
    expect(Math.abs((reading?.cents ?? 999) + 20)).toBeLessThan(1.5);
  });

  it('leaves out a band that an overtone of a ringing string falls into', () => {
    // Ukulele G4, 30 cents sharp, while C4 rings: the third partial of C4 sits on G5.
    const audio = mix([{ midi: 60, amplitude: 0.3, harmonics: [1, 0.6, 0.8] }, { midi: 67.3 }]);
    const blind = measureString(audio, 48000, 67);
    const aware = measureString(audio, 48000, 67, [60]);
    expect(Math.abs((blind?.cents ?? 999) - 30)).toBeGreaterThan(10);
    expect(Math.abs((aware?.cents ?? 999) - 30)).toBeLessThan(1.5);
  });

  it('finds nothing in silence or when only a neighbouring note sounds', () => {
    expect(measureString(new Float32Array(CHECK_BUFFER_SIZE), 48000, 64)).toBeNull();
    const reading = measureString(mix([{ midi: 62 }]), 48000, 64);
    expect(reading === null || reading.share < 0.02).toBe(true);
  });
});
