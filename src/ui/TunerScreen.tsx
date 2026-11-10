import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHROMATIC, nextString, PROFILES } from '../music/tuningProfile';
import { A4_HZ } from '../tuner/config';
import { useTuner } from '../tuner/useTuner';
import { CentsGauge } from './CentsGauge';
import { ModePicker } from './ModePicker';
import { NoteReadout } from './NoteReadout';
import { NoteStrip } from './NoteStrip';
import { StatusPanel } from './StatusPanel';
import { StringList, type TuneDirection } from './StringList';
import { StringReadout } from './StringReadout';
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

  const profile = PROFILES.find((p) => p.id === profileId) ?? CHROMATIC;
  const strings = profile.targets;
  const isInstrument = strings.length > 0;
  const target = isInstrument && selected !== null ? strings[selected].midi : null;
  const allDone = isInstrument && done.size === strings.length;

  const tuner = useTuner({
    targetMidi: target,
    onTargetReached: () => {
      if (selected === null) return;
      const nextDone = new Set(done).add(selected);
      setDone(nextDone);
      setSelected(nextString(strings.length, selected, nextDone));
    },
  });
  const listening = tuner.status === 'listening';

  const selectProfile = (id: string) => {
    setProfileId(id);
    setSelected(null);
    setDone(NO_STRINGS);
  };

  const selectString = (index: number) => {
    setSelected(index);
    if (done.has(index)) {
      const nextDone = new Set(done);
      nextDone.delete(index);
      setDone(nextDone);
    }
    // Selecting a string starts the tuner (the tap doubles as the mic's user gesture).
    if (!listening && tuner.status !== 'requesting') tuner.tap();
  };

  let direction: TuneDirection = null;
  if (listening && target !== null && tuner.display) {
    direction = tuner.display.inTune ? 'ok' : tuner.display.cents < 0 ? 'up' : 'down';
  }

  const waitingForString =
    isInstrument && selected === null && (listening || tuner.status === 'idle' || tuner.status === 'paused');

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.column} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Wait, gotta tune
          </Text>
          <Text style={styles.reference}>A4 = {A4_HZ} Hz</Text>
        </View>

        <ModePicker profiles={PROFILES} selectedId={profile.id} onSelect={selectProfile} />

        <View style={styles.main}>
          {waitingForString ? (
            <Text style={[styles.hint, allDone && styles.hintDone]}>
              {allDone ? 'All strings in tune ✓' : 'Select a string to start'}
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
            {isInstrument ? (
              <StringList
                strings={strings}
                selected={selected}
                done={done}
                direction={direction}
                onSelect={selectString}
              />
            ) : (
              <NoteStrip width={width} midi={tuner.midi} presence={tuner.presence} />
            )}
            <CentsGauge
              width={width}
              cents={tuner.cents}
              tuned={tuner.tuned}
              presence={tuner.presence}
            />
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
});
