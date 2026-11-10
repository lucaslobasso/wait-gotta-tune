import { Pressable, StyleSheet, Text, View } from 'react-native';

import { midiToNote } from '../music/notes';
import type { TuningTarget } from '../music/tuningProfile';
import { Arrow } from './Arrow';
import { colors } from './theme';

/** Which way to turn the selected string: 'up' = too low, 'down' = too high, 'ok' = in tune. */
export type TuneDirection = 'up' | 'down' | 'ok' | null;

type Props = {
  /** String 1 (thinnest) first; drawn top to bottom. */
  strings: readonly TuningTarget[];
  selected: number | null;
  done: ReadonlySet<number>;
  direction: TuneDirection;
  onSelect: (index: number) => void;
};

const ROW_HEIGHT = 44;

/** The instrument's strings as horizontal lines, each with its note and octave on the left. */
export function StringList({ strings, selected, done, direction, onSelect }: Props) {
  return (
    <View style={styles.root}>
      {strings.map((string, index) => {
        const note = midiToNote(string.midi);
        const isSelected = index === selected;
        const isDone = done.has(index);
        const color = isDone ? colors.inTune : isSelected ? colors.text : colors.dim;
        const state = isDone ? ', in tune' : '';
        return (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`String ${index + 1}, ${note.spoken}${state}`}
            onPress={() => onSelect(index)}
            style={({ pressed }) => [
              styles.row,
              isSelected && styles.rowSelected,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.label, { color }]} maxFontSizeMultiplier={1.2}>
              {note.name}
              <Text style={styles.octave}>{note.octave}</Text>
            </Text>
            <View
              style={[
                styles.string,
                { height: Math.min(5, 1.5 + index * 0.7), backgroundColor: color },
              ]}
            />
            <View style={styles.status}>
              {isDone || (isSelected && direction === 'ok') ? (
                <Text style={styles.check}>✓</Text>
              ) : isSelected && (direction === 'up' || direction === 'down') ? (
                <Arrow direction={direction} size={16} color={colors.offPitch} />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 16 },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  rowSelected: { backgroundColor: colors.surface },
  pressed: { opacity: 0.6 },
  label: { width: 52, fontSize: 20, fontWeight: '700' },
  octave: { fontSize: 14, fontWeight: '500' },
  string: { flex: 1, borderRadius: 3 },
  status: { width: 36, alignItems: 'flex-end', justifyContent: 'center' },
  check: { fontSize: 18, fontWeight: '700', color: colors.inTune },
});
