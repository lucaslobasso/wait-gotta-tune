# wait-gotta-tune

A simple chromatic tuner for web, Android and iOS from one Expo SDK 58 (React Native, TypeScript) codebase. One screen with four modes. **Auto** shows the nearest note big, with one small neighbouring note beside it on the side the pitch leans to (below on the left when flat, above on the right when sharp); there is no note strip and no cents gauge in any mode (the user found them confusing). **Guitar / Bass / Ukulele** show the instrument's strings as horizontal lines (string 1, the thinnest, at the top; note and octave on the left); the user selects a string, an arrow says which way to tune it (too low = blue up arrow on the left of the note, too high = amber down arrow on its right), and after it has rung in tune for 3 seconds the tuner moves to the next string that is not done. In every mode the background shifts from its dark blue to green as the pitch nears the note, and a Stop button releases the microphone while listening. **Check all strings** (beta, instrument modes): the user plucks every string once, from the thickest to string 1, about 0.2 to 0.8 s apart; each pluck heard is taken as the next string in that order, each string gets a verdict (in tune / cents flat / cents sharp / no clear pitch), the ones that passed are disabled and the first one that is off is selected; "Enable skipped strings" re-enables them.
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
- **The string check tells strings apart by order, never by pitch**, and never uses `detectPitch` (with several strings ringing a single-pitch detector reports the chord's common bass note: C4 over G4 reads as C3). A pluck is a jump in level, overall or in the band of the string that is due; the string is then measured around its own note in the sound after the pluck, minus what was sounding before it (`measurePluck`), so a ringing string's overtone in that band does not count.
- **Never count windows, count time.** Microphone windows arrive about every 43 ms on native and about every 20 ms in a browser, irregularly. Anything that compares "now" with "before" must pick "before" by timestamp.
- **Window sizes assume about 48 kHz.** Some computers run audio at 96 or 192 kHz (this one does); the web microphone asks for a `PREFERRED_SAMPLE_RATE` context, otherwise 4096 samples would be 21 ms and low notes unreadable.
- **A selected string is measured with `stringFrame`, not `detectPitch`.** The general detector has to guess the note, so a weak low E reads as its overtones and a neighbouring string that is still sounding takes over the reading. `detectPitch` is for Auto mode only.
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
- `src/pitch/`: `detectPitch.ts` (DC removal, RMS in dBFS, pitchy (McLeod) -> `PitchFrame`; Auto mode only), `bandPitch.ts` (Goertzel scans of one known string's band, note plus octave, on a block-averaged window: `measureString` = strongest peak in the latest audio; `stringFrame` = the same as a `PitchFrame`, used while one string is selected; `bandScores` and `measurePluck` = what a pluck added, used by the string check).
- `src/music/`: `notes.ts` (Hz <-> MIDI, note names, cents), `tuningProfile.ts` (`PROFILES`: Auto, Guitar, Bass, Ukulele, each listing strings from string 1 down; `nextString`). A new instrument is one more profile there.
- `src/tuner/`:
  - `config.ts`, `types.ts`.
  - `smoother.ts`: gate -> outlier/octave-jump rejection -> median -> EMA -> note hysteresis -> hold. With a `target` (the selected string) it measures against that note however far off the pitch is; a change of target resets it.
  - `inTuneTimer.ts`: counts live in-tune time towards `IN_TUNE_HOLD_MS`; a short held gap pauses it, going out of tune resets it.
  - `strumCheck.ts`: the string check: pluck detection by time-based comparison, pluck n = string (last - n), measurement between plucks, ends after the last string or `CHECK_WAIT_MS` without a pluck.
  - `tunerController.ts`: state machine `idle -> requesting -> listening <-> paused`, plus `denied` / `error`; start/stop serialized on one promise chain; dependencies injected. `stop()` is the user's Stop button: back to `idle` until the next tap.
  - `useTuner.ts`: wires the real dependencies, owns the shared values and minimal React state; takes `targetMidi` and `onTargetReached`; `startCheck` / `cancelCheck` / `check` / `onCheckDone` run the string check (it is cancelled when the microphone stops).
- `src/ui/`: `TunerScreen` (mode, selected string, done and skipped strings, check verdicts live here), `ModePicker`, `NoteReadout` (Auto: big note plus the neighbouring note), `TuneBackdrop` (background blue -> green), `StringList` + `StringReadout` + `HoldProgress` + `Arrow` + `CheckPanel` (instruments), `StatusPanel`, `theme.ts`.
- Tests are colocated in `__tests__/`. Components that import Reanimated cannot load under Jest: keep animated parts in their own small component (like `HoldProgress`) and stub it with `jest.mock` in tests.

## Helper scripts
- `npm run web`: dev server (the mic works on localhost; other devices need HTTPS).
- `npm run check`: `tsc --noEmit`, `expo lint`, `jest`.
- `npm run export:web`: static build in `dist/`.
- `eas build -p android --profile development|preview`: dev client / standalone APK (needs `eas login` and `eas init` once).

## Not verified yet
- Native microphone path on a real Android phone and on iOS (written against the library's types; needs a dev build). Calibrate `RMS_OPEN_DB` / `RMS_CLOSE_DB` and the Android input preset there.
- The string check and single-string tuning on real instruments and real microphones: only synthetic audio was tested (Jest and headless Edge). The `CHECK_*` and `TUNE_*` gates are guesses. Known limits: bass needs slow plucks (about 0.8 s apart) for exact verdicts; a string more than 250 cents off gives no verdict / is not heard; single-string readings follow the pitch about 0.3 s late; a pluck too soft to stand out over the ringing strings is missed, which shifts every later string by one.
- Browsers that refuse a 48 kHz context fall back to the device rate; nothing rescales the windows there.
- Detection time on Hermes (estimate 5–20 ms per window on a mid-range phone, unmeasured).
