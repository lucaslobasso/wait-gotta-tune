import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHROMATIC, nextString, PROFILES } from '../music/tuningProfile';
import { A4_HZ } from '../tuner/config';
import type { StringVerdict } from '../tuner/strumCheck';
import { useTuner } from '../tuner/useTuner';
import { CheckPanel } from './CheckPanel';
import { ModePicker } from './ModePicker';
import { NoteReadout } from './NoteReadout';
import { StatusPanel } from './StatusPanel';
import { StringList, type TuneDirection } from './StringList';
import { StringReadout } from './StringReadout';
import { TuneBackdrop } from './TuneBackdrop';
import { colors, MAX_COLUMN_WIDTH } from './theme';

const NO_STRINGS: ReadonlySet<number> = new Set();

/**
 * The single screen. Auto mode shows the nearest note; instrument modes show the
 * strings, tune the selected one, and move on once it has rung in tune.
 */
export function TunerScreen() {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const [profileId, setProfileId] = useState(CHROMATIC.id);
  const [selected, setSelected] = useState<number | null>(null);
  const [done, setDone] = useState<ReadonlySet<number>>(NO_STRINGS);
  // String check: strings that passed are skipped (disabled) until re-enabled.
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(NO_STRINGS);
  const [verdicts, setVerdicts] = useState<readonly (StringVerdict | null)[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const profile = PROFILES.find((p) => p.id === profileId) ?? CHROMATIC;
  const strings = profile.targets;
  const isInstrument = strings.length > 0;
  const target = isInstrument && selected !== null ? strings[selected].midi : null;
  const allDone = isInstrument && done.size + skipped.size === strings.length;

  const clearVerdict = (index: number) => {
    if (verdicts?.[index]) setVerdicts(verdicts.map((v, i) => (i === index ? null : v)));
  };

  const tuner = useTuner({
    targetMidi: target,
    onTargetReached: () => {
      if (selected === null) return;
      const nextDone = new Set(done).add(selected);
      setDone(nextDone);
      clearVerdict(selected);
      setSelected(nextString(strings.length, selected, new Set([...nextDone, ...skipped])));
    },
    onCheckDone: (result) => {
      if (result.every((v) => v.status === 'missing')) {
        setNotice('Could not hear the strings. Try again a bit louder.');
        return;
      }
      const passed = new Set<number>();
      result.forEach((v, i) => {
        if (v.status === 'ok') passed.add(i);
      });
      const firstOff = result.findIndex((v) => v.status !== 'ok');
      setVerdicts(result);
      setSkipped(passed);
      setDone(NO_STRINGS);
      setSelected(firstOff >= 0 ? firstOff : null);
    },
  });
  const listening = tuner.status === 'listening';
  const checking = tuner.check !== null;

  const resetStrings = () => {
    setSelected(null);
    setDone(NO_STRINGS);
    setSkipped(NO_STRINGS);
    setVerdicts(null);
    setNotice(null);
  };

  const selectProfile = (id: string) => {
    tuner.cancelCheck();
    // An instrument listens once a string is selected: do not keep the microphone
    // (and the background) running from Auto with nothing to tune.
    if (id !== CHROMATIC.id) tuner.stop();
    setProfileId(id);
    resetStrings();
  };

  const selectString = (index: number) => {
    setSelected(index);
    setNotice(null);
    clearVerdict(index);
    if (done.has(index)) {
      const nextDone = new Set(done);
      nextDone.delete(index);
      setDone(nextDone);
    }
    // Selecting a string starts the tuner (the tap doubles as the mic's user gesture).
    if (!listening && tuner.status !== 'requesting') tuner.tap();
  };

  const startCheck = () => {
    resetStrings();
    tuner.startCheck(strings.map((string) => string.midi));
  };

  /** Makes the strings that passed the check selectable again. */
  const enableSkipped = () => {
    setVerdicts(verdicts ? verdicts.map((v, i) => (skipped.has(i) ? null : v)) : null);
    setSkipped(NO_STRINGS);
  };

  let direction: TuneDirection = null;
  if (listening && target !== null && tuner.display) {
    direction = tuner.display.inTune ? 'ok' : tuner.display.cents < 0 ? 'up' : 'down';
  }

  const waitingForString =
    isInstrument && selected === null && (listening || tuner.status === 'idle' || tuner.status === 'paused');

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <TuneBackdrop cents={tuner.cents} presence={tuner.presence} />
      <View style={styles.column} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Wait, gotta tune
          </Text>
          <Text style={styles.reference}>A4 = {A4_HZ} Hz</Text>
        </View>

        <ModePicker profiles={PROFILES} selectedId={profile.id} onSelect={selectProfile} />

        <View style={styles.main}>
          {checking && listening ? (
            <CheckPanel
              index={tuner.check!.current}
              midi={strings[tuner.check!.current].midi}
              total={strings.length}
              onCancel={tuner.cancelCheck}
            />
          ) : waitingForString && !checking ? (
            <Text style={[styles.hint, allDone && styles.hintDone]}>
              {allDone ? 'All strings in tune ✓' : (notice ?? 'Select a string to start')}
            </Text>
          ) : tuner.status !== 'listening' ? (
            <StatusPanel status={tuner.status} error={tuner.error} onPress={tuner.tap} />
          ) : target !== null ? (
            <StringReadout target={target} display={tuner.display} progress={tuner.progress} />
          ) : (
            <NoteReadout display={tuner.display} />
          )}
        </View>

        {width > 0 ? (
          <View style={styles.meters}>
            {listening && !checking ? (
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Stop listening"
                  onPress={tuner.stop}
                  style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                  <Text style={styles.actionLabel}>Stop</Text>
                </Pressable>
              </View>
            ) : null}
            {isInstrument && !checking ? (
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Check all strings, experimental"
                  onPress={startCheck}
                  style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                  <Text style={styles.actionLabel}>Check all strings</Text>
                  <Text style={styles.beta}>beta</Text>
                </Pressable>
                {skipped.size > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={enableSkipped}
                    style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                    <Text style={styles.actionLabel}>Enable skipped strings</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {isInstrument ? (
              <StringList
                strings={strings}
                selected={tuner.check ? tuner.check.current : selected}
                done={done}
                direction={direction}
                onSelect={selectString}
                verdicts={tuner.check ? tuner.check.verdicts : verdicts}
                skipped={skipped}
                locked={checking}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: MAX_COLUMN_WIDTH, gap: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  title: { fontSize: 18, fontWeight: '600', color: colors.text },
  reference: { fontSize: 14, color: colors.dim },
  main: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 20, color: colors.dim, textAlign: 'center', paddingHorizontal: 24 },
  hintDone: { color: colors.inTune, fontWeight: '600' },
  meters: { gap: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  action: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
  },
  actionLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  beta: { fontSize: 12, fontWeight: '600', color: colors.offPitch },
  pressed: { opacity: 0.6 },
});
