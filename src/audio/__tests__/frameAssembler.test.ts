import { FrameAssembler } from '../frameAssembler';

const WINDOW = 16;
const HOP = 8;

function ramp(from: number, length: number): Float32Array {
  return Float32Array.from({ length }, (_, i) => from + i);
}

function collect() {
  const windows: number[][] = [];
  const assembler = new FrameAssembler(WINDOW, HOP, (window) => windows.push(Array.from(window)));
  return { assembler, windows };
}

describe('FrameAssembler', () => {
  it('emits nothing until the window is full', () => {
    const { assembler, windows } = collect();
    assembler.push(ramp(0, 8), 48000);
    expect(windows).toHaveLength(0);
    assembler.push(ramp(8, 7), 48000);
    expect(windows).toHaveLength(0);
    assembler.push(ramp(15, 1), 48000);
    expect(windows).toHaveLength(1);
    expect(windows[0]).toEqual(Array.from(ramp(0, 16)));
  });

  it('emits the latest samples once per hop', () => {
    const { assembler, windows } = collect();
    assembler.push(ramp(0, 16), 48000);
    assembler.push(ramp(16, 4), 48000);
    expect(windows).toHaveLength(1);
    assembler.push(ramp(20, 4), 48000);
    expect(windows).toHaveLength(2);
    expect(windows[1]).toEqual(Array.from(ramp(8, 16)));
  });

  it('handles small and irregular chunks', () => {
    const { assembler, windows } = collect();
    let next = 0;
    for (const size of [3, 5, 1, 7, 2, 6, 4, 9, 3]) {
      assembler.push(ramp(next, size), 44100);
      next += size;
    }
    expect(windows.length).toBeGreaterThan(0);
    for (const window of windows) {
      // Every window is a contiguous run of the ramp.
      for (let i = 1; i < window.length; i++) expect(window[i]).toBe(window[i - 1] + 1);
    }
    expect(windows[windows.length - 1][WINDOW - 1]).toBeLessThanOrEqual(next - 1);
  });

  it('keeps only the tail of a chunk larger than the window, emitting once', () => {
    const { assembler, windows } = collect();
    assembler.push(ramp(0, 50), 48000);
    expect(windows).toHaveLength(1);
    expect(windows[0]).toEqual(Array.from(ramp(34, 16)));
  });

  it('starts over when the sample rate changes or on reset', () => {
    const { assembler, windows } = collect();
    assembler.push(ramp(0, 16), 48000);
    assembler.push(ramp(16, 8), 44100);
    expect(windows).toHaveLength(1);
    assembler.push(ramp(24, 8), 44100);
    expect(windows).toHaveLength(2);
    expect(windows[1]).toEqual(Array.from(ramp(16, 16)));

    assembler.reset();
    assembler.push(ramp(100, 8), 44100);
    expect(windows).toHaveLength(2);
  });
});
