import { Pressable, StyleSheet, Text, View } from 'react-native';

import { midiToNote } from '../music/notes';
import type { TuningTarget } from '../music/tuningProfile';
import type { StringVerdict } from '../tuner/strumCheck';
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
  /** String check results (or the verdicts so far while it runs), one per string. */
  verdicts?: readonly (StringVerdict | null)[] | null;
  /** Strings that passed the check: shown as in tune and not selectable. */
  skipped?: ReadonlySet<number>;
  /** True while a check runs: `selected` is the string to pluck next (they go from the last string up) and none can be pressed. */
  locked?: boolean;
};

const NONE: ReadonlySet<number> = new Set();

/** e.g. "−23¢", "+12¢". */
function verdictLabel(cents: number): string {
  return `${cents < 0 ? '−' : '+'}${Math.abs(cents)}¢`;
}

const ROW_HEIGHT = 44;

/** The instrument's strings as horizontal lines, each with its note and octave on the left. */
export function StringList({
  strings,
  selected,
  done,
  direction,
  onSelect,
  verdicts = null,
  skipped = NONE,
  locked = false,
}: Props) {
  return (
    <View style={styles.root}>
      {strings.map((string, index) => {
        const note = midiToNote(string.midi);
        const isSelected = index === selected;
        const isSkipped = skipped.has(index);
        const verdict = verdicts?.[index] ?? null;
        const isDone = done.has(index) || isSkipped || verdict?.status === 'ok';
        const isOff = !isDone && (verdict?.status === 'flat' || verdict?.status === 'sharp');
        const color = isDone ? colors.inTune : isSelected ? colors.text : colors.dim;
        const state = isSkipped
          ? ', in tune, skipped'
          : isDone
            ? ', in tune'
            : isOff
              ? `, ${Math.abs(verdict!.cents!)} cents ${verdict!.status}`
              : '';
        return (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled: isSkipped || locked }}
            disabled={isSkipped || locked}
            accessibilityLabel={`String ${index + 1}, ${note.spoken}${state}`}
            onPress={() => onSelect(index)}
            style={({ pressed }) => [
              styles.row,
              isSelected && styles.rowSelected,
              isSkipped && styles.rowSkipped,
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
                <Arrow
                  direction={direction}
                  size={16}
                  color={direction === 'up' ? colors.tooLow : colors.offPitch}
                />
              ) : isOff ? (
                <Text style={styles.off}>{verdictLabel(verdict!.cents!)}</Text>
              ) : verdict?.status === 'missing' && (!locked || index > (selected ?? strings.length)) ? (
                <Text style={styles.waiting}>?</Text>
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
  rowSkipped: { opacity: 0.45 },
  pressed: { opacity: 0.6 },
  label: { width: 52, fontSize: 20, fontWeight: '700' },
  octave: { fontSize: 14, fontWeight: '500' },
  string: { flex: 1, borderRadius: 3 },
  status: { width: 56, alignItems: 'flex-end', justifyContent: 'center' },
  check: { fontSize: 18, fontWeight: '700', color: colors.inTune },
  off: { fontSize: 15, fontWeight: '600', color: colors.offPitch, fontVariant: ['tabular-nums'] },
  waiting: { fontSize: 18, fontWeight: '700', color: colors.dim },
});
