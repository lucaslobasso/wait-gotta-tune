import { midiToFreq } from '../../music/notes';
import { createSmoother } from '../smoother';
import type { PitchFrame, Smoother, TunerReading } from '../types';

const STEP_MS = 45;

function frame(midi: number, clarity = 0.97, rmsDb = -30): PitchFrame {
  return { hz: midiToFreq(midi), clarity, rmsDb };
}

/** Feeds frames at a steady rate and returns every reading. */
function feeder(smoother: Smoother) {
  let t = 0;
  return {
    push(f: PitchFrame | null): TunerReading | null {
      t += STEP_MS;
      return smoother.push(f, t);
    },
    repeat(f: PitchFrame | null, times: number): TunerReading | null {
      let last: TunerReading | null = null;
      for (let i = 0; i < times; i++) last = this.push(f);
      return last;
    },
    advance(ms: number) {
      t += ms;
    },
  };
}

describe('smoother', () => {
  it('locks onto a steady pitch', () => {
    const feed = feeder(createSmoother());
    const reading = feed.repeat(frame(69.02), 6)!;
    expect(reading.note).toBe(69);
    expect(reading.cents).toBeCloseTo(2, 5);
    expect(reading.hz).toBeCloseTo(midiToFreq(69.02), 5);
    expect(reading.inTune).toBe(true);
    expect(reading.held).toBe(false);
  });

  it('honours the A4 reference', () => {
    const feed = feeder(createSmoother({ a4: 442 }));
    const reading = feed.repeat({ hz: 442, clarity: 0.97, rmsDb: -30 }, 3)!;
    expect(reading.note).toBe(69);
    expect(reading.cents).toBeCloseTo(0, 5);
  });

  it('needs high clarity to start but less to keep going', () => {
    const feed = feeder(createSmoother());
    expect(feed.repeat(frame(69, 0.85), 5)).toBeNull();
    expect(feed.push(frame(69, 0.95))).not.toBeNull();
    expect(feed.push(frame(69, 0.82))!.held).toBe(false);
    expect(feed.push(frame(69, 0.75))!.held).toBe(true);
  });

  it('needs a louder signal to start than to keep going', () => {
    const feed = feeder(createSmoother());
    expect(feed.repeat(frame(69, 0.97, -55), 5)).toBeNull();
    expect(feed.push(frame(69, 0.97, -45))).not.toBeNull();
    expect(feed.push(frame(69, 0.97, -55))!.held).toBe(false);
    expect(feed.push(frame(69, 0.97, -59))!.held).toBe(true);
  });

  it('ignores frequencies outside the supported range', () => {
    const feed = feeder(createSmoother());
    expect(feed.push({ hz: 20, clarity: 0.99, rmsDb: -20 })).toBeNull();
    expect(feed.push({ hz: 2000, clarity: 0.99, rmsDb: -20 })).toBeNull();
    expect(feed.push({ hz: null, clarity: 0, rmsDb: -20 })).toBeNull();
    expect(feed.push(null)).toBeNull();
  });

  it('ignores a single octave blip', () => {
    const feed = feeder(createSmoother());
    feed.repeat(frame(69), 5);
    const during = feed.push(frame(81))!;
    expect(during.note).toBe(69);
    expect(during.midi).toBeCloseTo(69, 5);
    expect(during.held).toBe(false);
    const after = feed.repeat(frame(69), 3)!;
    expect(after.note).toBe(69);
    expect(after.midi).toBeCloseTo(69, 5);
  });

  it('switches to a new note after two agreeing frames, without gliding', () => {
    const feed = feeder(createSmoother());
    feed.repeat(frame(69), 5);
    expect(feed.push(frame(64))!.note).toBe(69);
    const switched = feed.push(frame(64))!;
    expect(switched.note).toBe(64);
    expect(switched.midi).toBeCloseTo(64, 5);
    expect(switched.cents).toBeCloseTo(0, 5);
  });

  it('needs three frames before believing an octave jump', () => {
    const feed = feeder(createSmoother());
    feed.repeat(frame(69), 5);
    expect(feed.push(frame(81))!.note).toBe(69);
    expect(feed.push(frame(81))!.note).toBe(69);
    expect(feed.push(frame(81))!.note).toBe(81);
  });

  it('accepts the newest frame after three disagreeing outliers', () => {
    const feed = feeder(createSmoother());
    feed.repeat(frame(69), 5);
    expect(feed.push(frame(75))!.note).toBe(69);
    expect(feed.push(frame(79))!.note).toBe(69);
    expect(feed.push(frame(62))!.note).toBe(62);
  });

  it('keeps the displayed note while the pitch drifts up to 60 cents away', () => {
    const feed = feeder(createSmoother());
    feed.repeat(frame(69), 5);
    feed.repeat(frame(69.3), 10);
    const sharp = feed.repeat(frame(69.55), 30)!;
    expect(sharp.note).toBe(69);
    expect(sharp.cents).toBeCloseTo(55, 0);

    const next = feed.repeat(frame(69.7), 30)!;
    expect(next.note).toBe(70);
    expect(next.cents).toBeCloseTo(-30, 0);
  });

  it('holds the last reading for a second after the signal drops, then clears', () => {
    const feed = feeder(createSmoother());
    feed.repeat(frame(69), 5);
    const held = feed.push(null)!;
    expect(held.held).toBe(true);
    expect(held.note).toBe(69);

    feed.advance(800);
    expect(feed.push(null)!.held).toBe(true);
    feed.advance(200);
    expect(feed.push(null)).toBeNull();
    // After clearing, the stricter start thresholds apply again.
    expect(feed.push(frame(69, 0.85))).toBeNull();
  });

  it('resumes the same note when the signal returns during the hold', () => {
    const feed = feeder(createSmoother());
    feed.repeat(frame(69), 5);
    feed.repeat(null, 3);
    const back = feed.push(frame(69.01, 0.85))!;
    expect(back.held).toBe(false);
    expect(back.note).toBe(69);
  });

  it('enters in-tune within 5 cents and leaves beyond 8', () => {
    const feed = feeder(createSmoother());
    expect(feed.repeat(frame(69.04), 20)!.inTune).toBe(true);
    expect(feed.repeat(frame(69.07), 20)!.inTune).toBe(true);
    expect(feed.repeat(frame(69.1), 20)!.inTune).toBe(false);
    expect(feed.repeat(frame(69.07), 20)!.inTune).toBe(false);
    expect(feed.repeat(frame(69.03), 20)!.inTune).toBe(true);
  });

  it('forgets everything on reset', () => {
    const smoother = createSmoother();
    const feed = feeder(smoother);
    feed.repeat(frame(69), 5);
    smoother.reset();
    expect(feed.push(null)).toBeNull();
    expect(feed.push(frame(60))!.note).toBe(60);
  });

  describe('with a target string', () => {
    it('measures against the target however far off the pitch is', () => {
      const feed = feeder(createSmoother({ target: () => 64 }));
      const flat = feed.repeat(frame(61.5), 8)!;
      expect(flat.note).toBe(64);
      expect(flat.cents).toBeCloseTo(-250, 0);
      expect(flat.inTune).toBe(false);

      const sharp = feed.repeat(frame(64.3), 30)!;
      expect(sharp.note).toBe(64);
      expect(sharp.cents).toBeCloseTo(30, 0);

      expect(feed.repeat(frame(64.02), 30)!.inTune).toBe(true);
    });

    it('follows the target when the selected string changes', () => {
      let target: number | null = 64;
      const feed = feeder(createSmoother({ target: () => target }));
      expect(feed.repeat(frame(64), 6)!.inTune).toBe(true);

      target = 59;
      const next = feed.push(frame(64))!;
      expect(next.note).toBe(59);
      expect(next.cents).toBeCloseTo(500, 0);
      expect(next.inTune).toBe(false);
    });

    it('goes back to the nearest note when the target is cleared', () => {
      let target: number | null = 64;
      const feed = feeder(createSmoother({ target: () => target }));
      feed.repeat(frame(69), 6);
      target = null;
      const auto = feed.push(frame(69))!;
      expect(auto.note).toBe(69);
      expect(auto.cents).toBeCloseTo(0, 5);
    });
  });
});
