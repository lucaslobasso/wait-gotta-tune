import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { midiToNote } from '../music/notes';
import { STRIP_MAX_MIDI, STRIP_MIN_MIDI } from '../tuner/config';
import { colors } from './theme';

const CELL = 64;
const HEIGHT = 64;
const NOTES = Array.from({ length: STRIP_MAX_MIDI - STRIP_MIN_MIDI + 1 }, (_, i) =>
  midiToNote(STRIP_MIN_MIDI + i),
);

const Cells = memo(function Cells() {
  return (
    <>
      {NOTES.map((note) => (
        <View key={note.midi} style={styles.cell}>
          <Text style={[styles.name, note.sharp && styles.sharp]} maxFontSizeMultiplier={1.2}>
            {note.name}
            <Text style={styles.octave}>{note.octave}</Text>
          </Text>
        </View>
      ))}
    </>
  );
});

type Props = {
  /** Width of the containing column, from onLayout. */
  width: number;
  midi: SharedValue<number>;
  presence: SharedValue<number>;
};

/**
 * A row of every note that slides continuously so the current pitch sits under the
 * fixed centre marker: halfway between two cells means halfway between two notes.
 */
export function NoteStrip({ width, midi, presence }: Props) {
  const slide = useAnimatedStyle(() => {
    const m = Math.min(STRIP_MAX_MIDI + 0.5, Math.max(STRIP_MIN_MIDI - 0.5, midi.get()));
    return { transform: [{ translateX: width / 2 - (m - STRIP_MIN_MIDI + 0.5) * CELL }] };
  });
  const fade = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * presence.get() }));

  return (
    <View
      style={styles.clip}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.fill, fade]}>
        <Animated.View style={[styles.row, slide]}>
          <Cells />
        </Animated.View>
      </Animated.View>
      <View style={[styles.marker, { left: width / 2 - CELL / 2 }]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { height: HEIGHT, overflow: 'hidden', alignSelf: 'stretch' },
  fill: { ...StyleSheet.absoluteFill },
  row: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: HEIGHT,
    width: NOTES.length * CELL,
    flexDirection: 'row',
  },
  cell: { width: CELL, height: HEIGHT, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 22, fontWeight: '600', color: colors.text },
  sharp: { color: colors.dim },
  octave: { fontSize: 13, fontWeight: '400', color: colors.dim },
  marker: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: CELL,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.line,
  },
});
