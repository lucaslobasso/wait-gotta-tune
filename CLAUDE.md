# wait-gotta-tune

A simple chromatic tuner for web, Android and iOS from one Expo SDK 58 (React Native, TypeScript) codebase. One screen with four modes. **Auto** shows the nearest note (big note name, a note strip that slides to the current pitch, a cents gauge that turns green in tune). **Guitar / Bass / Ukulele** show the instrument's strings as horizontal lines (string 1, the thinnest, at the top; note and octave on the left); the user selects a string, an arrow says which way to tune it (up = too low, down = too high), and after it has rung in tune for 3 seconds the tuner moves to the next string that is not done. **Check all strings** (beta, instrument modes) asks for each string in turn from string 1 down, gives each a verdict (in tune / cents flat / cents sharp / not heard), disables the ones that passed and selects the first one that is off; "Enable skipped strings" re-enables them.
Web is hosted on GitHub Pages (public repo). Android is built with EAS and installed on a phone. iOS is covered by the web build in Safari until there is an Apple Developer account.
Skills: none (code repo, edited deliberately).

## Hard rules
- **Foreground only.** The microphone runs only while the status is `listening` and stops when the app goes to the background. In `app.json` the `react-native-audio-api` plugin must keep `iosBackgroundMode: false` and `androidForegroundService: false` (its defaults enable background audio). Verify with `npx expo config --type introspect`: no `UIBackgroundModes`, no `<service>`, foreground-service permissions only as removals.
- **Audio never leaves the device.** No analytics, no network calls with audio or pitch data.
- **`react-native-audio-api` is imported only in `src/audio/createMicStream.native.ts`** and pinned to an exact version. It has no microphone on web: importing it elsewhere breaks the web build.
- **`detectPitch`, `bandPitch`, `smoother` and `strumCheck` stay pure** (no React, no timers, no platform APIs) so they are unit-testable and can move off the JS thread later.
- **All tuning constants live in `src/tuner/config.ts`.** Smoothing happens on fractional MIDI numbers, never on Hz.
- **Frequency gate before clarity.** pitchy often reports high clarity on plain noise, but only below 28 Hz; the 28–1600 Hz gate in the smoother is what prevents ghost notes. Do not use pitchy's `minVolumeDecibels` (it is wrong by a factor of two in dB).
- **Animated values, not React state, per audio frame.** `useTuner` writes shared values (`.get()`/`.set()`, the React Compiler is on) on every detection and only sets React state when the visible text changes.
- **Native dependency changes need a new EAS build** (limited free quota): ask first. JS-only changes do not.
- **The string check never uses `detectPitch`.** With several strings ringing, a single-pitch detector reports the chord's common bass note (C4 over G4 reads as C3). The check measures only the expected string's own band (`bandPitch`), goes from string 1 down so a thick string's overtones are not yet ringing when the thinner strings they land on are measured, and skips a band that an earlier string's overtone falls into.
- Use relative imports inside `src/` (tests run without a path mapper).
- Run `npm run check` before committing.
- Reply in English, briefly.

## Sync
None. This is a code repo: make normal commits with a short sentence-case message once the user agrees to a change, then push. A push to `main` redeploys GitHub Pages.

## Layout
- `app.json` (name, ids, plugin flags, `web.output: "single"`, `experiments.baseUrl: "/wait-gotta-tune"`), `eas.json` (development / preview / production profiles), `.github/workflows/pages.yml`, `public/.nojekyll`.
- `src/app/`: `_layout.tsx` (Stack, no header, dark), `index.tsx` (renders `TunerScreen`).
- `src/audio/`:
  - `types.ts`: `MicStream` (delivers the latest samples about once per hop: a 32768-sample buffer, of which the tuner reads the last 4096 and the string check up to all of it), `MicError`, `MicPermission`.
  - `createMicStream.native.ts`: `AudioRecorder.onAudioReady` + `FrameAssembler`; capture constants at the top (Android input preset, iOS session category/mode).
  - `createMicStream.web.ts`: `getUserMedia` + `AudioContext` + `AnalyserNode`, polled once per hop; full teardown on stop.
  - `createMicStream.d.ts`: type declaration for the platform split. `frameAssembler.ts`: chunks in, latest window out every hop (starts once `minFill` samples arrived; silence before them).
- `src/pitch/`: `detectPitch.ts` (DC removal, RMS in dBFS, pitchy (McLeod) -> `PitchFrame`), `bandPitch.ts` (`measureString`: the peak near one known string's note and octave, by Goertzel on a block-averaged window; used by the string check).
- `src/music/`: `notes.ts` (Hz <-> MIDI, note names, cents), `tuningProfile.ts` (`PROFILES`: Auto, Guitar, Bass, Ukulele, each listing strings from string 1 down; `nextString`). A new instrument is one more profile there.
- `src/tuner/`:
  - `config.ts`, `types.ts`.
  - `smoother.ts`: gate -> outlier/octave-jump rejection -> median -> EMA -> note hysteresis -> hold. With a `target` (the selected string) it measures against that note however far off the pitch is; a change of target resets it.
  - `inTuneTimer.ts`: counts live in-tune time towards `IN_TUNE_HOLD_MS`; a short held gap pauses it, going out of tune resets it.
  - `strumCheck.ts`: the guided string check: current string, verdict once `CHECK_STABLE_FRAMES` measurements agree, timeout -> missing.
  - `tunerController.ts`: state machine `idle -> requesting -> listening <-> paused`, plus `denied` / `error`; start/stop serialized on one promise chain; dependencies injected.
  - `useTuner.ts`: wires the real dependencies, owns the shared values and minimal React state; takes `targetMidi` and `onTargetReached`; `startCheck` / `cancelCheck` / `check` / `onCheckDone` run the string check (it is cancelled when the microphone stops).
- `src/ui/`: `TunerScreen` (mode, selected string, done and skipped strings, check verdicts live here), `ModePicker`, `NoteReadout` + `NoteStrip` (Auto), `StringList` + `StringReadout` + `HoldProgress` + `Arrow` + `CheckPanel` (instruments), `CentsGauge`, `StatusPanel`, `theme.ts`.
- Tests are colocated in `__tests__/`. Components that import Reanimated cannot load under Jest: keep animated parts in their own small component (like `HoldProgress`) and stub it with `jest.mock` in tests.

## Helper scripts
- `npm run web`: dev server (the mic works on localhost; other devices need HTTPS).
- `npm run check`: `tsc --noEmit`, `expo lint`, `jest`.
- `npm run export:web`: static build in `dist/`.
- `eas build -p android --profile development|preview`: dev client / standalone APK (needs `eas login` and `eas init` once).

## Not verified yet
- Native microphone path on a real Android phone and on iOS (written against the library's types; needs a dev build). Calibrate `RMS_OPEN_DB` / `RMS_CLOSE_DB` and the Android input preset there.
- The string check on real instruments and real microphones: only synthetic plucks were tested (Jest and headless Edge). `CHECK_MIN_LEVEL`, `CHECK_MIN_SHARE` and `CHECK_IN_TUNE_CENTS` are guesses; phone microphones may be too weak for bass. Single-string tuning right after a check still uses `detectPitch`, so strings left ringing can confuse it until they are muted.
- Detection time on Hermes (estimate 5–20 ms per window on a mid-range phone, unmeasured).
