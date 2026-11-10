import { createInTuneTimer } from '../inTuneTimer';
import type { TunerReading } from '../types';

const STEP_MS = 50;

function reading(inTune: boolean, held = false): TunerReading {
  return { midi: 64, note: 64, cents: inTune ? 1 : 30, hz: 329.6, clarity: 0.97, inTune, held };
}

/** Feeds the same reading at a steady rate; returns how many times the timer fired. */
function feeder(holdMs = 3000) {
  const timer = createInTuneTimer(holdMs);
  let t = 0;
  return {
    timer,
    run(r: TunerReading | null, ms: number): number {
      let fired = 0;
      for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) {
        t += STEP_MS;
        if (timer.push(r, t)) fired += 1;
      }
      return fired;
    },
    skip(ms: number) {
      t += ms;
    },
  };
}

describe('inTuneTimer', () => {
  it('fires once after three seconds in tune', () => {
    const feed = feeder();
    expect(feed.run(reading(true), 2900)).toBe(0);
    expect(feed.timer.progress()).toBeGreaterThan(0.9);
    expect(feed.run(reading(true), 300)).toBe(1);
    expect(feed.timer.progress()).toBeLessThan(0.2);
  });

  it('starts over when the string goes out of tune', () => {
    const feed = feeder();
    feed.run(reading(true), 2500);
    feed.run(reading(false), 100);
    expect(feed.timer.progress()).toBe(0);
    expect(feed.run(reading(true), 2900)).toBe(0);
    expect(feed.run(reading(true), 300)).toBe(1);
  });

  it('starts over when the note is lost', () => {
    const feed = feeder();
    feed.run(reading(true), 2500);
    feed.run(null, 50);
    expect(feed.timer.progress()).toBe(0);
  });

  it('pauses, without counting, while the last reading is only being held', () => {
    const feed = feeder();
    feed.run(reading(true), 2000);
    const before = feed.timer.progress();
    expect(feed.run(reading(true, true), 800)).toBe(0);
    expect(feed.timer.progress()).toBe(before);
    // Plucked again: carries on from where it was.
    expect(feed.run(reading(true), 900)).toBe(0);
    expect(feed.run(reading(true), 300)).toBe(1);
  });

  it('does not count long gaps between readings', () => {
    const feed = feeder();
    feed.run(reading(true), 1000);
    feed.skip(5000);
    expect(feed.run(reading(true), 50)).toBe(0);
    expect(feed.timer.progress()).toBeLessThan(0.5);
  });

  it('reports progress from 0 to 1 and can be reset', () => {
    const feed = feeder();
    expect(feed.timer.progress()).toBe(0);
    feed.run(reading(true), 1550);
    expect(feed.timer.progress()).toBeCloseTo(0.5, 1);
    feed.timer.reset();
    expect(feed.timer.progress()).toBe(0);
  });
});
