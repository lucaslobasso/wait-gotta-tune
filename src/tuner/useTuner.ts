import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { createMicStream } from '../audio/createMicStream';
import { createPitchDetector } from '../pitch/detectPitch';
import { HOP_SIZE, WINDOW_SIZE } from './config';
import { createSmoother } from './smoother';
import { TunerController } from './tunerController';
import type { TunerStatus } from './types';

const KEEP_AWAKE_TAG = 'tuner';
const TEXT_INTERVAL_MS = 150;

/** What the text parts of the screen show. Changes rarely compared with the audio rate. */
export type TunerDisplay = {
  note: number;
  /** Rounded cents from the displayed note. */
  cents: number;
  /** Frequency rounded to 0.1 Hz. */
  hz: number;
  inTune: boolean;
  held: boolean;
};

export type Tuner = {
  status: TunerStatus;
  error: string | null;
  display: TunerDisplay | null;
  /** Smoothed fractional MIDI number; drives the note strip. */
  midi: SharedValue<number>;
  /** Cents from the displayed note; drives the gauge needle. */
  cents: SharedValue<number>;
  /** 1 = live signal, 0.4 = holding the last reading, 0 = no signal. */
  presence: SharedValue<number>;
  /** 1 when in tune, else 0. */
  tuned: SharedValue<number>;
  tap: () => void;
};

/**
 * Runs the tuner for the lifetime of the screen. Animated values are updated on
 * every detection; React state only changes when the visible text would change.
 */
export function useTuner(): Tuner {
  const midi = useSharedValue(69);
  const cents = useSharedValue(0);
  const presence = useSharedValue(0);
  const tuned = useSharedValue(0);

  const [status, setStatus] = useState<TunerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [display, setDisplay] = useState<TunerDisplay | null>(null);
  const controllerRef = useRef<TunerController | null>(null);

  useEffect(() => {
    let shown: TunerDisplay | null = null;
    let shownAt = 0;

    const controller = new TunerController(
      {
        mic: createMicStream({ windowSize: WINDOW_SIZE, hopSize: HOP_SIZE }),
        detect: createPitchDetector(WINDOW_SIZE),
        smoother: createSmoother(),
        appState: {
          current: () => AppState.currentState ?? 'active',
          subscribe: (cb) => {
            const subscription = AppState.addEventListener('change', cb);
            return () => subscription.remove();
          },
        },
        keepAwake: {
          on: () => void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {}),
          off: () => void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {}),
        },
        now: () => Date.now(),
        autoStart: Platform.OS !== 'web',
        openSettings: Platform.OS === 'web' ? undefined : () => void Linking.openSettings(),
      },
      {
        onStatus: (next, micError) => {
          setStatus(next);
          setError(micError && next === 'error' ? micError.message : null);
        },
        onReading: (reading) => {
          if (!reading) {
            presence.set(withTiming(0, { duration: 500 }));
            tuned.set(withTiming(0, { duration: 120 }));
            if (shown) {
              shown = null;
              setDisplay(null);
            }
            return;
          }
          midi.set(withTiming(reading.midi, { duration: 90 }));
          cents.set(withTiming(reading.cents, { duration: 90 }));
          presence.set(withTiming(reading.held ? 0.4 : 1, { duration: 150 }));
          tuned.set(withTiming(reading.inTune && !reading.held ? 1 : 0, { duration: 120 }));

          const next: TunerDisplay = {
            note: reading.note,
            cents: Math.round(reading.cents) + 0,
            hz: Math.round(reading.hz * 10) / 10,
            inTune: reading.inTune,
            held: reading.held,
          };
          const now = Date.now();
          const stateChanged =
            !shown ||
            shown.note !== next.note ||
            shown.inTune !== next.inTune ||
            shown.held !== next.held;
          const textChanged = !shown || shown.cents !== next.cents || shown.hz !== next.hz;
          if (stateChanged || (textChanged && now - shownAt >= TEXT_INTERVAL_MS)) {
            shown = next;
            shownAt = now;
            setDisplay(next);
          }
        },
      },
    );
    controllerRef.current = controller;
    controller.mount();
    return () => {
      controllerRef.current = null;
      controller.dispose();
    };
  }, [midi, cents, presence, tuned]);

  const tap = useCallback(() => controllerRef.current?.tap(), []);

  return { status, error, display, midi, cents, presence, tuned, tap };
}
