import { MicError, type MicFrameHandler, type MicPermission, type MicStream } from '../../audio/types';
import { TunerController, type TunerDeps } from '../tunerController';
import type { TunerReading, TunerStatus } from '../types';

const READING: TunerReading = {
  midi: 69,
  note: 69,
  cents: 0,
  hz: 440,
  clarity: 0.97,
  inTune: true,
  held: false,
};

async function flush(): Promise<void> {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

class FakeMic implements MicStream {
  permission: MicPermission = 'granted';
  startError: MicError | null = null;
  /** When false, start() waits for finishStart(). */
  autoResolve = true;
  startCalls = 0;
  stopCalls = 0;
  active = false;
  overlapped = false;
  prepare = jest.fn();
  onFrame: MicFrameHandler | null = null;
  onError: ((error: MicError) => void) | null = null;
  private busy = false;
  private finish: (() => void) | null = null;

  async getPermission(): Promise<MicPermission> {
    return this.permission;
  }

  start(onFrame: MicFrameHandler, onError: (error: MicError) => void): Promise<void> {
    if (this.busy) this.overlapped = true;
    this.busy = true;
    this.startCalls += 1;
    return new Promise((resolve, reject) => {
      this.finish = () => {
        this.busy = false;
        this.finish = null;
        if (this.startError) {
          reject(this.startError);
        } else {
          this.active = true;
          this.onFrame = onFrame;
          this.onError = onError;
          resolve();
        }
      };
      if (this.autoResolve) this.finish();
    });
  }

  finishStart(): void {
    this.finish?.();
  }

  async stop(): Promise<void> {
    if (this.busy) this.overlapped = true;
    if (this.active) this.stopCalls += 1;
    this.active = false;
  }

  emit(): void {
    this.onFrame?.(new Float32Array(4), 48000);
  }
}

function setup(overrides: Partial<TunerDeps> = {}) {
  const mic = new FakeMic();
  const statuses: TunerStatus[] = [];
  const errors: (MicError | undefined)[] = [];
  const readings: (TunerReading | null)[] = [];
  const app = {
    state: 'active',
    listeners: new Set<(state: string) => void>(),
    set(state: string) {
      this.state = state;
      this.listeners.forEach((listener) => listener(state));
    },
  };
  const keepAwake = { on: jest.fn(), off: jest.fn() };
  const detect = jest.fn(() => ({ hz: 440, clarity: 0.97, rmsDb: -30 }));
  const smoother = { push: jest.fn(() => READING), reset: jest.fn() };
  const controller = new TunerController(
    {
      mic,
      detect,
      smoother,
      appState: {
        current: () => app.state,
        subscribe: (cb) => {
          app.listeners.add(cb);
          return () => app.listeners.delete(cb);
        },
      },
      keepAwake,
      now: () => 0,
      autoStart: false,
      ...overrides,
    },
    {
      onStatus: (status, error) => {
        statuses.push(status);
        errors.push(error);
      },
      onReading: (reading) => readings.push(reading),
    },
  );
  const status = () => statuses[statuses.length - 1] ?? 'idle';
  return { controller, mic, app, keepAwake, detect, smoother, statuses, errors, readings, status };
}

describe('TunerController', () => {
  it('starts listening on tap', async () => {
    const t = setup();
    t.controller.mount();
    await flush();
    expect(t.mic.startCalls).toBe(0);

    t.controller.tap();
    expect(t.mic.prepare).toHaveBeenCalledTimes(1);
    expect(t.status()).toBe('requesting');
    await flush();
    expect(t.statuses).toEqual(['requesting', 'listening']);
    expect(t.keepAwake.on).toHaveBeenCalledTimes(1);
    expect(t.mic.active).toBe(true);
  });

  it('turns frames into readings while listening', async () => {
    const t = setup();
    t.controller.mount();
    t.controller.tap();
    await flush();
    t.mic.emit();
    t.mic.emit();
    expect(t.detect).toHaveBeenCalledTimes(2);
    expect(t.readings).toEqual([READING, READING]);
  });

  it('auto-starts only when permission is already granted', async () => {
    const granted = setup({ autoStart: true });
    granted.controller.mount();
    await flush();
    expect(granted.status()).toBe('listening');

    const undetermined = setup({ autoStart: true });
    undetermined.mic.permission = 'undetermined';
    undetermined.controller.mount();
    await flush();
    expect(undetermined.status()).toBe('idle');
    expect(undetermined.mic.startCalls).toBe(0);
  });

  it('reports a denied permission and opens settings on the next tap', async () => {
    const openSettings = jest.fn();
    const t = setup({ openSettings });
    t.mic.startError = new MicError('permission-denied');
    t.controller.mount();
    t.controller.tap();
    await flush();
    expect(t.status()).toBe('denied');
    expect(t.keepAwake.on).not.toHaveBeenCalled();

    t.controller.tap();
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(t.mic.startCalls).toBe(1);
  });

  it('retries on tap when denied and there is no settings screen (web)', async () => {
    const t = setup();
    t.mic.startError = new MicError('permission-denied');
    t.controller.mount();
    t.controller.tap();
    await flush();
    t.mic.startError = null;
    t.controller.tap();
    await flush();
    expect(t.status()).toBe('listening');
  });

  it('reports other start failures and recovers on retry', async () => {
    const t = setup();
    t.mic.startError = new MicError('unavailable', 'No microphone was found.');
    t.controller.mount();
    t.controller.tap();
    await flush();
    expect(t.status()).toBe('error');
    expect(t.errors[t.errors.length - 1]?.message).toBe('No microphone was found.');

    t.mic.startError = null;
    t.controller.tap();
    await flush();
    expect(t.status()).toBe('listening');
  });

  it('releases the microphone in the background and resumes in the foreground', async () => {
    const t = setup();
    t.controller.mount();
    t.controller.tap();
    await flush();

    t.app.set('background');
    expect(t.status()).toBe('paused');
    await flush();
    expect(t.mic.active).toBe(false);
    expect(t.mic.stopCalls).toBe(1);
    expect(t.keepAwake.off).toHaveBeenCalledTimes(1);
    expect(t.readings[t.readings.length - 1]).toBeNull();

    t.app.set('active');
    await flush();
    expect(t.status()).toBe('listening');
    expect(t.mic.startCalls).toBe(2);
    expect(t.keepAwake.on).toHaveBeenCalledTimes(2);
  });

  it('keeps listening through iOS "inactive" (control centre, permission dialogs)', async () => {
    const t = setup();
    t.controller.mount();
    t.controller.tap();
    await flush();
    t.app.set('inactive');
    await flush();
    expect(t.status()).toBe('listening');
    expect(t.mic.active).toBe(true);
  });

  it('never overlaps start and stop under rapid background/foreground switches', async () => {
    const t = setup();
    t.controller.mount();
    t.controller.tap();
    await flush();
    for (let i = 0; i < 5; i++) {
      t.app.set('background');
      t.app.set('active');
    }
    await flush();
    expect(t.mic.overlapped).toBe(false);
    expect(t.status()).toBe('listening');
    expect(t.mic.active).toBe(true);
  });

  it('ignores app state changes while the microphone is starting', async () => {
    const t = setup();
    t.mic.autoResolve = false;
    t.controller.mount();
    t.controller.tap();
    await flush();
    t.app.set('background');
    t.app.set('active');
    t.mic.finishStart();
    await flush();
    expect(t.statuses).toEqual(['requesting', 'listening']);
  });

  it('pauses if the app is in the background when the microphone finishes starting', async () => {
    const t = setup();
    t.mic.autoResolve = false;
    t.controller.mount();
    t.controller.tap();
    await flush();
    t.app.set('background');
    t.mic.finishStart();
    await flush();
    expect(t.status()).toBe('paused');
    expect(t.mic.active).toBe(false);
    expect(t.keepAwake.on).not.toHaveBeenCalled();
  });

  it('ignores frames from a run that has been stopped', async () => {
    const t = setup();
    t.controller.mount();
    t.controller.tap();
    await flush();
    const staleFrame = t.mic.onFrame!;
    t.app.set('background');
    await flush();
    t.app.set('active');
    await flush();
    staleFrame(new Float32Array(4), 48000);
    expect(t.detect).not.toHaveBeenCalled();
  });

  it('falls back to "tap to start" when resuming needs a user gesture (web)', async () => {
    const t = setup();
    t.controller.mount();
    t.controller.tap();
    await flush();
    t.app.set('background');
    await flush();
    t.mic.startError = new MicError('needs-gesture');
    t.app.set('active');
    await flush();
    expect(t.status()).toBe('idle');
  });

  it('shows denied if permission was revoked while in the background', async () => {
    const t = setup();
    t.controller.mount();
    t.controller.tap();
    await flush();
    t.app.set('background');
    await flush();
    t.mic.permission = 'denied';
    t.app.set('active');
    await flush();
    expect(t.status()).toBe('denied');
  });

  it('starts when the user grants permission in settings and returns', async () => {
    const t = setup({ openSettings: jest.fn() });
    t.mic.startError = new MicError('permission-denied');
    t.mic.permission = 'denied';
    t.controller.mount();
    t.controller.tap();
    await flush();
    expect(t.status()).toBe('denied');

    t.app.set('background');
    t.mic.startError = null;
    t.mic.permission = 'granted';
    t.app.set('active');
    await flush();
    expect(t.status()).toBe('listening');
  });

  it('stops on a microphone error', async () => {
    const t = setup();
    t.controller.mount();
    t.controller.tap();
    await flush();
    t.mic.onError!(new MicError('unknown', 'recorder failed'));
    await flush();
    expect(t.status()).toBe('error');
    expect(t.mic.active).toBe(false);
    expect(t.keepAwake.off).toHaveBeenCalledTimes(1);
  });

  it('returns to "tap to start" when another app interrupts the microphone', async () => {
    const t = setup();
    t.controller.mount();
    t.controller.tap();
    await flush();
    t.mic.onError!(new MicError('interrupted'));
    await flush();
    expect(t.status()).toBe('idle');
    expect(t.mic.active).toBe(false);
  });

  it('stops the microphone and goes quiet on dispose', async () => {
    const t = setup();
    t.controller.mount();
    t.controller.tap();
    await flush();
    const before = t.statuses.length;
    const readingsBefore = t.readings.length;
    t.controller.dispose();
    await flush();
    expect(t.mic.active).toBe(false);
    t.app.set('background');
    t.controller.tap();
    await flush();
    expect(t.statuses.length).toBe(before);
    expect(t.readings.length).toBe(readingsBefore);
    expect(t.mic.startCalls).toBe(1);
  });
});
