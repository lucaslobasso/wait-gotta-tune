import type { MicFrameHandler } from './types';

/**
 * Turns arbitrary-sized microphone chunks into overlapping analysis windows:
 * keeps the latest `windowSize` samples and emits them at most once per push,
 * once the window is full and at least `hopSize` new samples have arrived.
 */
export class FrameAssembler {
  private readonly ring: Float32Array;
  private filled = 0;
  private sinceEmit = 0;
  private sampleRate = 0;

  constructor(
    private readonly windowSize: number,
    private readonly hopSize: number,
    private readonly onWindow: MicFrameHandler,
  ) {
    this.ring = new Float32Array(windowSize);
  }

  push(chunk: Float32Array, sampleRate: number): void {
    if (sampleRate !== this.sampleRate) {
      this.reset();
      this.sampleRate = sampleRate;
    }
    const n = chunk.length;
    if (n === 0) return;
    const size = this.windowSize;
    if (n >= size) {
      this.ring.set(chunk.subarray(n - size));
    } else {
      this.ring.copyWithin(0, n);
      this.ring.set(chunk, size - n);
    }
    this.filled = Math.min(size, this.filled + n);
    this.sinceEmit += n;
    if (this.filled >= size && this.sinceEmit >= this.hopSize) {
      this.sinceEmit = 0;
      this.onWindow(this.ring, sampleRate);
    }
  }

  reset(): void {
    this.filled = 0;
    this.sinceEmit = 0;
  }
}
