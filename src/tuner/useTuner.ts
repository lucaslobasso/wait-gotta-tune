import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { createMicStream } from '../audio/createMicStream';
import { stringFrame } from '../pitch/bandPitch';
import { createPitchDetector } from '../pitch/detectPitch';
import { CHECK_BUFFER_SIZE, HOP_SIZE, WINDOW_SIZE } from './config';
import { createInTuneTimer } from './inTuneTimer';
import { createSmoother } from './smoother';
import { createStrumCheck, type StringVerdict, type StrumCheck } from './strumCheck';
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

export type TunerOptions = {
  /** Instrument modes: MIDI note of the string being tuned. Null = Auto (nearest note). */
  targetMidi?: number | null;
  /** Called when the target string has rung in tune for the hold time. */
  onTargetReached?: () => void;
  /** Called with one verdict per string when a string check ends by itself. */
  onCheckDone?: (verdicts: StringVerdict[]) => void;
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
  /** 0..1: how long the target string has rung in tune, towards the hold time. */
  progress: SharedValue<number>;
  tap: () => void;
  /** Stops listening and releases the microphone until the next tap. */
  stop: () => void;
  /** While a string check is running: the verdicts so far and the string to pluck now. */
  check: { verdicts: StringVerdict[]; current: number } | null;
  /** Starts a string check for these string notes (MIDI); starts the microphone if needed. */
  startCheck: (targets: readonly number[]) => void;
  cancelCheck: () => void;
};

/**
 * Runs the tuner for the lifetime of the screen. Animated values are updated on
 * every detection; React state only changes when the visible text would change.
 */
export function useTuner({
  targetMidi = null,
  onTargetReached,
  onCheckDone,
}: TunerOptions = {}): Tuner {
  const midi = useSharedValue(69);
  const cents = useSharedValue(0);
  const presence = useSharedValue(0);
  const tuned = useSharedValue(0);
  const progress = useSharedValue(0);

  const [status, setStatus] = useState<TunerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [display, setDisplay] = useState<TunerDisplay | null>(null);
  const [check, setCheck] = useState<Tuner['check']>(null);
  const controllerRef = useRef<TunerController | null>(null);
  const checkRef = useRef<StrumCheck | null>(null);
  const checkDoneRef = useRef(onCheckDone);

  // Read by the audio callbacks, so they always see the current string.
  const targetRef = useRef<number | null>(targetMidi);
  const reachedRef = useRef(onTargetReached);
  const timerRef = useRef(createInTuneTimer());

  useEffect(() => {
    reachedRef.current = onTargetReached;
    checkDoneRef.current = onCheckDone;
  }, [onTargetReached, onCheckDone]);

  useEffect(() => {
    targetRef.current = targetMidi;
    timerRef.current.reset();
    progress.set(0);
  }, [targetMidi, progress]);

  useEffect(() => {
    let shown: TunerDisplay | null = null;
    let shownAt = 0;
    let checkShown = -1;
    const timer = timerRef.current;
    const detector = createPitchDetector(WINDOW_SIZE);

    const controller = new TunerController(
      {
        // The microphone keeps a long history for the string check; the tuner reads its end.
        mic: createMicStream({
          windowSize: CHECK_BUFFER_SIZE,
          hopSize: HOP_SIZE,
          minFill: WINDOW_SIZE,
        }),
        // One string selected: measure only that string's band. Auto: general pitch detection.
        detect: (window, sampleRate) =>
          targetRef.current !== null
            ? stringFrame(window, sampleRate, targetRef.current)
            : detector(window.subarray(window.length - WINDOW_SIZE), sampleRate),
        smoother: createSmoother({ target: () => targetRef.current }),
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
          // A check does not survive losing the microphone (backgrounded, denied, error).
          if (next !== 'listening' && next !== 'requesting' && checkRef.current) {
            checkRef.current = null;
            setCheck(null);
          }
        },
        onWindow: (window, sampleRate, tMs) => {
          const running = checkRef.current;
          if (!running) return;
          const { verdicts, current, finished } = running.push(window, sampleRate, tMs);
          if (finished || current === null) {
            checkRef.current = null;
            checkShown = -1;
            setCheck(null);
            checkDoneRef.current?.(verdicts);
          } else if (current !== checkShown) {
            checkShown = current;
            setCheck({ verdicts, current });
          }
        },
        onReading: (reading) => {
          const now = Date.now();
          if (targetRef.current !== null && !checkRef.current) {
            const reached = timer.push(reading, now);
            progress.set(withTiming(timer.progress(), { duration: 90 }));
            if (reached) reachedRef.current?.();
          }

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
  }, [midi, cents, presence, tuned, progress]);

  const tap = useCallback(() => controllerRef.current?.tap(), []);
  const stop = useCallback(() => controllerRef.current?.stop(), []);

  const startCheck = useCallback((targets: readonly number[]) => {
    checkRef.current = createStrumCheck(targets);
    setCheck({ verdicts: targets.map(() => ({ status: 'missing', cents: null })), current: 0 });
    controllerRef.current?.tap();
  }, []);
  const cancelCheck = useCallback(() => {
    checkRef.current = null;
    setCheck(null);
  }, []);

  return {
    status,
    error,
    display,
    midi,
    cents,
    presence,
    tuned,
    progress,
    tap,
    stop,
    check,
    startCheck,
    cancelCheck,
  };
}
