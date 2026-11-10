export type MicPermission = 'granted' | 'denied' | 'undetermined';

export type MicErrorCode =
  | 'permission-denied'
  | 'needs-gesture'
  | 'unavailable'
  | 'interrupted'
  | 'unknown';

export class MicError extends Error {
  constructor(
    public code: MicErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'MicError';
  }
}

/** `window.length` equals the requested window size. The buffer is reused: valid only during the call. */
export type MicFrameHandler = (window: Float32Array, sampleRate: number) => void;

/** Delivers the latest analysis window of microphone samples, roughly once per hop. */
export interface MicStream {
  /** Web: create/resume the AudioContext synchronously inside a user tap. */
  prepare?(): void;
  /** Never prompts. */
  getPermission(): Promise<MicPermission>;
  /** Prompts for permission if needed. Rejects with a MicError. */
  start(onFrame: MicFrameHandler, onError: (error: MicError) => void): Promise<void>;
  /** Idempotent; never rejects. */
  stop(): Promise<void>;
}

export type MicStreamOptions = { windowSize: number; hopSize: number };
