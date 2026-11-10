# wait-gotta-tune

A simple chromatic tuner for web, Android and iOS from one Expo SDK 58 (React Native, TypeScript) codebase. One screen: it listens to the microphone and shows the note being played (big note name, a note strip that slides to the current pitch, a cents gauge that turns green in tune). Per-instrument tuning modes are planned but not built; `src/music/tuningProfile.ts` and the smoother's `pickNote` option are the seam for them.
Web is hosted on GitHub Pages (public repo). Android is built with EAS and installed on a phone. iOS is covered by the web build in Safari until there is an Apple Developer account.
Skills: none (code repo, edited deliberately).

## Hard rules
- **Foreground only.** The microphone runs only while the status is `listening` and stops when the app goes to the background. In `app.json` the `react-native-audio-api` plugin must keep `iosBackgroundMode: false` and `androidForegroundService: false` (its defaults enable background audio). Verify with `npx expo config --type introspect`: no `UIBackgroundModes`, no `<service>`, foreground-service permissions only as removals.
- **Audio never leaves the device.** No analytics, no network calls with audio or pitch data.
- **`react-native-audio-api` is imported only in `src/audio/createMicStream.native.ts`** and pinned to an exact version. It has no microphone on web: importing it elsewhere breaks the web build.
- **`detectPitch` and `smoother` stay pure** (no React, no timers, no platform APIs) so they are unit-testable and can move off the JS thread later.
- **All tuning constants live in `src/tuner/config.ts`.** Smoothing happens on fractional MIDI numbers, never on Hz.
- **Frequency gate before clarity.** pitchy often reports high clarity on plain noise, but only below 28 Hz; the 28–1600 Hz gate in the smoother is what prevents ghost notes. Do not use pitchy's `minVolumeDecibels` (it is wrong by a factor of two in dB).
- **Animated values, not React state, per audio frame.** `useTuner` writes shared values (`.get()`/`.set()`, the React Compiler is on) on every detection and only sets React state when the visible text changes.
- **Native dependency changes need a new EAS build** (limited free quota): ask first. JS-only changes do not.
- Use relative imports inside `src/` (tests run without a path mapper).
- Run `npm run check` before committing.
- Reply in English, briefly.

## Sync
None. This is a code repo: make normal commits with a short sentence-case message once the user agrees to a change, then push. A push to `main` redeploys GitHub Pages.

## Layout
- `app.json` (name, ids, plugin flags, `web.output: "single"`, `experiments.baseUrl: "/wait-gotta-tune"`), `eas.json` (development / preview / production profiles), `.github/workflows/pages.yml`, `public/.nojekyll`.
- `src/app/`: `_layout.tsx` (Stack, no header, dark), `index.tsx` (renders `TunerScreen`).
- `src/audio/`:
  - `types.ts`: `MicStream` (delivers the latest analysis window about once per hop), `MicError`, `MicPermission`.
  - `createMicStream.native.ts`: `AudioRecorder.onAudioReady` + `FrameAssembler`; capture constants at the top (Android input preset, iOS session category/mode).
  - `createMicStream.web.ts`: `getUserMedia` + `AudioContext` + `AnalyserNode`, polled once per hop; full teardown on stop.
  - `createMicStream.d.ts`: type declaration for the platform split. `frameAssembler.ts`: chunks in, latest 4096 samples out every hop.
- `src/pitch/detectPitch.ts`: DC removal, RMS in dBFS, pitchy (McLeod) -> `PitchFrame`.
- `src/music/`: `notes.ts` (Hz <-> MIDI, note names, cents), `tuningProfile.ts` (future instrument modes).
- `src/tuner/`:
  - `config.ts`, `types.ts`.
  - `smoother.ts`: gate -> outlier/octave-jump rejection -> median -> EMA -> note hysteresis -> hold.
  - `tunerController.ts`: state machine `idle -> requesting -> listening <-> paused`, plus `denied` / `error`; start/stop serialized on one promise chain; dependencies injected.
  - `useTuner.ts`: wires the real dependencies, owns the shared values and minimal React state.
- `src/ui/`: `TunerScreen`, `NoteReadout`, `NoteStrip`, `CentsGauge`, `StatusPanel`, `theme.ts`.
- Tests are colocated in `__tests__/`.

## Helper scripts
- `npm run web`: dev server (the mic works on localhost; other devices need HTTPS).
- `npm run check`: `tsc --noEmit`, `expo lint`, `jest`.
- `npm run export:web`: static build in `dist/`.
- `eas build -p android --profile development|preview`: dev client / standalone APK (needs `eas login` and `eas init` once).

## Not verified yet
- Native microphone path on a real Android phone and on iOS (written against the library's types; needs a dev build). Calibrate `RMS_OPEN_DB` / `RMS_CLOSE_DB` and the Android input preset there.
- Detection time on Hermes (estimate 5–20 ms per window on a mid-range phone, unmeasured).
