import { Pressable, StyleSheet, Text, View } from 'react-native';

import { midiToNote } from '../music/notes';
import { BigNote } from './NoteReadout';
import { colors } from './theme';

type Props = {
  /** The string to pluck now (0 = string 1) and its note. */
  index: number;
  midi: number;
  total: number;
  onCancel: () => void;
};

/** Shown while a string check runs: says which string is expected next (thickest first). */
export function CheckPanel({ index, midi, total, onCancel }: Props) {
  return (
    <View
      style={styles.root}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Pluck string ${index + 1}, ${midiToNote(midi).spoken}`}>
      <Text style={styles.title}>Pluck string {index + 1}</Text>
      <BigNote midi={midi} size={72} color={colors.text} />
      <Text style={styles.detail}>
        {total - index} of {total} · one string at a time, from string {total} to string 1
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onCancel}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Text style={styles.buttonLabel}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 24 },
  title: { fontSize: 22, fontWeight: '600', color: colors.text, textAlign: 'center' },
  detail: { fontSize: 15, color: colors.dim, textAlign: 'center' },
  button: {
    marginTop: 16,
    minHeight: 48,
    paddingHorizontal: 24,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.6 },
  buttonLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
});
