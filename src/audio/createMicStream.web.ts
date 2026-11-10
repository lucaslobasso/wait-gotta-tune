import { MicError, type MicPermission, type MicStream, type MicStreamOptions } from './types';

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Browser microphone: getUserMedia -> AudioContext -> AnalyserNode. The analyser
 * already keeps a sliding window of the latest samples (silence until it fills),
 * so it is simply polled once per hop. `windowSize` must be a power of two up to
 * 32768. Fully torn down on stop (tracks stopped, context closed).
 */
export function createMicStream({ windowSize, hopSize }: MicStreamOptions): MicStream {
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let raf = 0;

  function prepare(): void {
    if (!ctx || ctx.state === 'closed') {
      const Ctor = audioContextCtor();
      ctx = Ctor ? new Ctor() : null;
    }
    void ctx?.resume().catch(() => {});
  }

  async function stop(): Promise<void> {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    try {
      source?.disconnect();
    } catch {
      // already disconnected
    }
    source = null;
    const closing = ctx;
    ctx = null;
    if (closing && closing.state !== 'closed') {
      try {
        await closing.close();
      } catch {
        // already closing
      }
    }
  }

  async function getPermission(): Promise<MicPermission> {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (result.state === 'granted') return 'granted';
      return result.state === 'denied' ? 'denied' : 'undetermined';
    } catch {
      return 'undetermined';
    }
  }

  async function start(
    onFrame: Parameters<MicStream['start']>[0],
    onError: Parameters<MicStream['start']>[1],
  ): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new MicError('unavailable', 'This browser cannot access the microphone (HTTPS is required).');
    }
    if (!ctx || ctx.state === 'closed') prepare();
    const context = ctx;
    if (!context) throw new MicError('unavailable', 'Web Audio is not available in this browser.');

    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({
        // A tuner needs the raw signal: voice processing wrecks sustained tones.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
    } catch (error) {
      await stop();
      const name = error instanceof Error ? error.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') throw new MicError('permission-denied');
      if (name === 'NotFoundError') throw new MicError('unavailable', 'No microphone was found.');
      throw new MicError('unknown', error instanceof Error ? error.message : String(error));
    }
    if (ctx !== context) {
      // stop() ran while the permission prompt was open.
      media.getTracks().forEach((track) => track.stop());
      throw new MicError('interrupted');
    }
    stream = media;

    const isRunning = () => context.state === 'running';
    if (!isRunning()) {
      await Promise.race([context.resume().catch(() => {}), delay(300)]);
      if (!isRunning()) {
        await stop();
        throw new MicError('needs-gesture');
      }
    }

    source = context.createMediaStreamSource(media);
    const analyser = context.createAnalyser();
    analyser.fftSize = windowSize;
    source.connect(analyser);

    media.getAudioTracks()[0]?.addEventListener('ended', () => onError(new MicError('interrupted')));

    const buffer = new Float32Array(windowSize);
    // Always the rate the browser actually runs at (iOS Safari may ignore requests).
    const sampleRate = context.sampleRate;
    const hopSeconds = hopSize / sampleRate;
    let lastAt = -Infinity;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (context.currentTime - lastAt < hopSeconds) return;
      lastAt = context.currentTime;
      analyser.getFloatTimeDomainData(buffer);
      onFrame(buffer, sampleRate);
    };
    raf = requestAnimationFrame(tick);
  }

  return { prepare, getPermission, start, stop };
}
