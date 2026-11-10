// The ONLY file that imports react-native-audio-api (it has no microphone support on web).
import { AudioManager, AudioRecorder, type AndroidInputPreset } from 'react-native-audio-api';

import { FrameAssembler } from './frameAssembler';
import { MicError, type MicPermission, type MicStream, type MicStreamOptions } from './types';

/**
 * Capture settings to calibrate on real devices:
 * - Android: 'voiceRecognition' has no echo cancellation. If cents are unstable or
 *   decaying notes get cut off, try 'unprocessed', then 'generic'.
 * - iOS: 'playAndRecord' + 'measurement' disables voice processing. Category 'record'
 *   returned empty buffers in older versions of the library. Untested on a device so far.
 */
const ANDROID_INPUT_PRESET: AndroidInputPreset = 'voiceRecognition';
const IOS_CATEGORY = 'playAndRecord';
const IOS_MODE = 'measurement';

const FALLBACK_SAMPLE_RATE = 48000;

// One recorder for the app's lifetime: recreating it on every resume is discouraged.
let recorder: AudioRecorder | null = null;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createMicStream({ windowSize, hopSize }: MicStreamOptions): MicStream {
  let started = false;
  let interruption: { remove(): void } | null = null;

  async function stop(): Promise<void> {
    if (!started) return;
    started = false;
    interruption?.remove();
    interruption = null;
    try {
      recorder?.clearOnAudioReady();
      recorder?.clearOnError();
      // stop()/start() only: pause()/resume() has a history of recording silence.
      await recorder?.stop();
    } catch {
      // nothing to release
    }
    try {
      await AudioManager.setAudioSessionActivity(false);
    } catch {
      // session already inactive
    }
  }

  async function getPermission(): Promise<MicPermission> {
    try {
      const status = await AudioManager.checkRecordingPermissions();
      if (status === 'Granted') return 'granted';
      return status === 'Denied' ? 'denied' : 'undetermined';
    } catch {
      return 'undetermined';
    }
  }

  async function start(
    onFrame: Parameters<MicStream['start']>[0],
    onError: Parameters<MicStream['start']>[1],
  ): Promise<void> {
    const permission = await AudioManager.requestRecordingPermissions();
    if (permission !== 'Granted') throw new MicError('permission-denied');

    started = true;
    try {
      AudioManager.setSystemOptions({ ios: { category: IOS_CATEGORY, mode: IOS_MODE, options: [] } });
      await AudioManager.setAudioSessionActivity(true);

      recorder ??= new AudioRecorder({
        iosVoiceProcessing: false,
        androidInputPreset: ANDROID_INPUT_PRESET,
      });

      // The recorder may not honour bufferLength, so windows are assembled here.
      const assembler = new FrameAssembler(windowSize, hopSize, onFrame);
      const sampleRate = AudioManager.getDevicePreferredSampleRate() || FALLBACK_SAMPLE_RATE;
      const registered = recorder.onAudioReady(
        { sampleRate, bufferLength: hopSize, channelCount: 1 },
        // Always trust the rate on the buffer: devices differ (44.1 kHz vs 48 kHz).
        ({ buffer }) => assembler.push(buffer.getChannelData(0), buffer.sampleRate),
      );
      if (registered.status === 'error') throw new MicError('unavailable', registered.message);
      recorder.onError((event) => onError(new MicError('unknown', event.message)));

      AudioManager.observeAudioInterruptions(true);
      const subscription = AudioManager.addSystemEventListener('interruption', (event) => {
        if (event.type === 'began') onError(new MicError('interrupted'));
      });
      interruption = subscription ?? null;

      const result = await recorder.start();
      if (result.status === 'error') throw new MicError('unavailable', result.message);
    } catch (error) {
      await stop();
      throw error instanceof MicError ? error : new MicError('unknown', message(error));
    }
  }

  return { getPermission, start, stop };
}
