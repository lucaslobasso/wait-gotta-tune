import { MicError, type MicStream } from '../audio/types';
import type { PitchDetectFn, Smoother, TunerReading, TunerStatus } from './types';

export interface TunerSink {
  onStatus(status: TunerStatus, error?: MicError): void;
  /** Every microphone window while listening (used by the string check). Valid only during the call. */
  onWindow?(window: Float32Array, sampleRate: number, tMs: number): void;
  onReading(reading: TunerReading | null): void;
}

export interface TunerDeps {
  mic: MicStream;
  detect: PitchDetectFn;
  smoother: Smoother;
  /** App foreground state: 'active' | 'background' | 'inactive' (iOS). */
  appState: { current(): string; subscribe(cb: (state: string) => void): () => void };
  keepAwake: { on(): void; off(): void };
  now(): number;
  /** Start listening on mount when permission is already granted (native). */
  autoStart: boolean;
  /** Opens the system settings for the app (native). When absent, a tap on "denied" retries. */
  openSettings?: () => void;
}

function toMicError(error: unknown): MicError {
  if (error instanceof MicError) return error;
  return new MicError('unknown', error instanceof Error ? error.message : String(error));
}

/**
 * The tuner state machine. Foreground only: the microphone runs while the status is
 * 'listening' and is released as soon as the app goes to the background.
 *
 * Start and stop never overlap: every event only updates `want` and queues a
 * `reconcile()` on one promise chain. `epoch` changes on every start and stop so
 * frames from an earlier run are ignored.
 */
export class TunerController {
  private status: TunerStatus = 'idle';
  private want = false;
  private running = false;
  private chain: Promise<void> = Promise.resolve();
  private epoch = 0;
  private disposed = false;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly deps: TunerDeps,
    private readonly sink: TunerSink,
  ) {}

  mount(): void {
    this.unsubscribe = this.deps.appState.subscribe((state) => this.onAppState(state));
    if (!this.deps.autoStart) return;
    void this.deps.mic
      .getPermission()
      .then((permission) => {
        const canStart = this.status === 'idle' && this.deps.appState.current() === 'active';
        if (permission === 'granted' && canStart && !this.disposed) this.requestStart();
      })
      .catch(() => {});
  }

  /** The user tapped the start / retry / open-settings button. */
  tap(): void {
    if (this.disposed || this.status === 'listening' || this.status === 'requesting') return;
    if (this.status === 'denied' && this.deps.openSettings) {
      this.deps.openSettings();
      return;
    }
    // Must run synchronously inside the tap (web audio needs a user gesture).
    this.deps.mic.prepare?.();
    this.requestStart();
  }

  /** The user stopped the tuner: release the microphone and wait for a tap. */
  stop(): void {
    if (this.disposed || (this.status !== 'listening' && this.status !== 'requesting')) return;
    this.want = false;
    this.setStatus('idle');
    this.sink.onReading(null);
    this.enqueue();
  }

  dispose(): void {
    this.disposed = true;
    this.want = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.enqueue();
  }

  private setStatus(status: TunerStatus, error?: MicError): void {
    this.status = status;
    if (!this.disposed) this.sink.onStatus(status, error);
  }

  private requestStart(): void {
    this.want = true;
    this.setStatus('requesting');
    this.enqueue();
  }

  private enqueue(): void {
    this.chain = this.chain.then(() => this.reconcile()).catch(() => {});
  }

  private async reconcile(): Promise<void> {
    if (this.want && !this.running) {
      const epoch = ++this.epoch;
      try {
        await this.deps.mic.start(
          (window, sampleRate) => this.onFrame(epoch, window, sampleRate),
          (error) => this.onMicError(epoch, error),
        );
        this.running = true;
      } catch (error) {
        const micError = toMicError(error);
        this.want = false;
        await this.deps.mic.stop();
        if (micError.code === 'permission-denied') this.setStatus('denied', micError);
        else if (micError.code === 'needs-gesture') this.setStatus('idle');
        else this.setStatus('error', micError);
        return;
      }
      if (this.want && !this.disposed) {
        if (this.deps.appState.current() === 'background') {
          // Went to the background while the microphone was starting.
          this.want = false;
          await this.stopMic();
          this.setStatus('paused');
        } else {
          this.deps.smoother.reset();
          this.setStatus('listening');
          this.deps.keepAwake.on();
        }
        return;
      }
    }
    if (!this.want && this.running) await this.stopMic();
  }

  private async stopMic(): Promise<void> {
    this.epoch += 1;
    this.running = false;
    this.deps.keepAwake.off();
    await this.deps.mic.stop();
    this.deps.smoother.reset();
    if (!this.disposed) this.sink.onReading(null);
  }

  private onAppState(state: string): void {
    // While starting, permission dialogs make the state flap; reconcile() checks it afterwards.
    if (this.disposed || this.status === 'requesting') return;
    if (state === 'background') {
      if (this.status !== 'listening') return;
      this.want = false;
      this.setStatus('paused');
      this.sink.onReading(null);
      this.enqueue();
    } else if (state === 'active') {
      if (this.status !== 'paused' && this.status !== 'denied') return;
      const from = this.status;
      void this.deps.mic
        .getPermission()
        .then((permission) => {
          if (this.disposed || this.status !== from) return;
          if (this.deps.appState.current() !== 'active') return;
          if (permission === 'denied') {
            if (from !== 'denied') this.setStatus('denied');
          } else if (from === 'paused' || permission === 'granted') {
            this.deps.mic.prepare?.();
            this.requestStart();
          }
        })
        .catch(() => {});
    }
  }

  private onMicError(epoch: number, error: MicError): void {
    if (epoch !== this.epoch || this.disposed) return;
    this.want = false;
    // An interruption (call, another app took the mic) just returns to "Tap to start".
    if (error.code === 'interrupted') this.setStatus('idle');
    else this.setStatus('error', error);
    this.enqueue();
  }

  private onFrame(epoch: number, window: Float32Array, sampleRate: number): void {
    if (epoch !== this.epoch || this.status !== 'listening' || this.disposed) return;
    try {
      const now = this.deps.now();
      this.sink.onWindow?.(window, sampleRate, now);
      const frame = this.deps.detect(window, sampleRate);
      this.sink.onReading(this.deps.smoother.push(frame, now));
    } catch (error) {
      this.onMicError(epoch, toMicError(error));
    }
  }
}
