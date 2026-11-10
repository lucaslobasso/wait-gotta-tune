# wait-gotta-tune

A simple chromatic tuner for web, Android and iOS from one Expo (React Native) codebase.
Tap start, play a note, and it shows the nearest note, how many cents off you are, and a
note strip that slides to the exact pitch. It turns green when you are in tune.

- Foreground only: the microphone is released when the tab is hidden, the app is minimized or the screen locks.
- Audio is analysed on the device and never sent anywhere.
- Range: about 28 Hz to 1600 Hz (bass low B up to G6), A4 = 440 Hz.

## Run it

```
npm install
npm run web          # http://localhost:8081 (localhost counts as a secure context for the mic)
npm run check        # typecheck + lint + tests
npm run export:web   # static build in dist/
```

The web build deploys to GitHub Pages from `main` (`.github/workflows/pages.yml`), under `/wait-gotta-tune`.

## Android

The app needs a development build (it uses a native microphone module, so Expo Go will not run it).

```
npm i -g eas-cli
eas login
eas init
eas build -p android --profile development   # dev client APK; then: npx expo start --dev-client
eas build -p android --profile preview       # standalone APK for daily use
```

## iOS

Use the web build in Safari for now. A native build needs a paid Apple Developer account:
`eas build -p ios --profile development`. The config (`app.json`) is already set up for it,
but the native iOS microphone path has not been tested on a device yet.

## How it works

```
microphone -> 4096-sample window -> pitch detection (pitchy, McLeod method)
           -> smoothing (outlier rejection, median, EMA, note hysteresis, hold)
           -> animated note strip + cents gauge
```

See `CLAUDE.md` for the layout and the rules the code follows.
