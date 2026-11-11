import { midiToFreq } from '../../music/notes';
import { GUITAR } from '../../music/tuningProfile';
import { CHECK_BUFFER_SIZE, HOP_SIZE } from '../../tuner/config';
import { createSmoother } from '../../tuner/smoother';
import { stringFrame } from '../bandPitch';

const SR = 48000;

type Voice = { midi: number; cents?: number; amp: number; h: number[]; decay?: number };

/** Decaying plucked voices (each partial a shrinking rotating vector) plus a little noise. */
function render(voices: Voice[], seconds: number, noise = 0.004): Float32Array {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  let seed = 3;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  for (const voice of voices) {
    const f = midiToFreq(voice.midi + (voice.cents ?? 0) / 100);
    voice.h.forEach((amplitude, k) => {
      const angle = (2 * Math.PI * (k + 1) * f) / SR;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const decay = Math.exp(-(k + 1) / ((voice.decay ?? 3) * SR));
      let re = voice.amp * amplitude;
      let im = 0;
      for (let i = 0; i < n; i++) {
        out[i] += im;
        const next = (re * cos - im * sin) * decay;
        im = (re * sin + im * cos) * decay;
        re = next;
      }
    });
  }
  for (let i = 0; i < n; i++) out[i] += noise * random();
  return out;
}

/** Every reading the tuner would show for one selected string, in cents (null = nothing shown). */
function readings(audio: Float32Array, target: number): (number | null)[] {
  const smoother = createSmoother({ target: () => target });
  const window = new Float32Array(CHECK_BUFFER_SIZE);
  const out: (number | null)[] = [];
  for (let end = HOP_SIZE; end <= audio.length; end += HOP_SIZE) {
    window.fill(0);
    const from = Math.max(0, end - CHECK_BUFFER_SIZE);
    window.set(audio.subarray(from, end), CHECK_BUFFER_SIZE - (end - from));
    const reading = smoother.push(stringFrame(window, SR, target), (end / SR) * 1000);
    out.push(reading && !reading.held ? reading.cents : null);
  }
  return out;
}

/** Readings once the pluck has settled (skips the first 0.7 s), without gaps. */
function settled(values: (number | null)[]): number[] {
  return values.slice(16).filter((v): v is number => v !== null);
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

describe('stringFrame', () => {
  const WEAK_LOW_E = [0.25, 1, 0.9, 0.5, 0.3, 0.2]; // a phone microphone barely picks up 82 Hz

  it('reads the low E steadily when its fundamental is weak', () => {
    const values = settled(readings(render([{ midi: 40, cents: -10, amp: 0.05, h: WEAK_LOW_E }], 4), 40));
    expect(values.length).toBeGreaterThan(40);
    values.forEach((cents) => expect(Math.abs(cents + 10)).toBeLessThan(2));
    expect(spread(values)).toBeLessThan(2);
  });

  it('ignores the A string ringing next to the low E', () => {
    const audio = render(
      [
        { midi: 40, cents: -10, amp: 0.05, h: WEAK_LOW_E },
        { midi: 45, amp: 0.05, h: [1, 0.6, 0.3] },
      ],
      4,
    );
    const values = settled(readings(audio, 40));
    expect(values.length).toBeGreaterThan(40);
    values.forEach((cents) => expect(Math.abs(cents + 10)).toBeLessThan(4));
    expect(spread(values)).toBeLessThan(4);
  });

  it('reads the B string with the low E ringing under it (its third partial is B3)', () => {
    const audio = render(
      [
        { midi: 59, cents: 12, amp: 0.05, h: [1, 0.5, 0.3] },
        { midi: 40, amp: 0.03, h: [0.4, 1, 1, 0.5, 0.3], decay: 6 },
      ],
      4,
    );
    const values = settled(readings(audio, 59));
    expect(values.length).toBeGreaterThan(40);
    values.forEach((cents) => expect(Math.abs(cents - 12)).toBeLessThan(4));
    expect(spread(values)).toBeLessThan(4);
  });

  it.each(GUITAR.targets.map((t, i) => [i + 1, t.midi] as const))(
    'guitar string %i: follows the detuning of a decaying pluck within 2 cents',
    (_string, midi) => {
      for (const cents of [-60, -15, 0, 20, 90]) {
        const audio = render([{ midi, cents, amp: 0.05, h: [1, 0.6, 0.4, 0.25] }], 3.5);
        const values = settled(readings(audio, midi));
        expect(values.length).toBeGreaterThan(30);
        values.forEach((reading) => expect(Math.abs(reading - cents)).toBeLessThan(2));
      }
    },
  );

  it('shows nothing for a string that is not sounding (another string, or silence)', () => {
    const a = render([{ midi: 45, amp: 0.05, h: [1, 0.6, 0.3] }], 2);
    expect(readings(a, 40).every((v) => v === null)).toBe(true);
    expect(readings(render([], 2), 59).every((v) => v === null)).toBe(true);
  });

  it('gives no pitch for silence', () => {
    const frame = stringFrame(new Float32Array(CHECK_BUFFER_SIZE), SR, 59);
    expect(frame.hz).toBeNull();
  });
});
