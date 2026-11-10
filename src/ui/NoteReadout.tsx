import { StyleSheet, Text, View } from 'react-native';

import { midiToNote } from '../music/notes';
import type { TunerDisplay } from '../tuner/useTuner';
import { colors } from './theme';

export function centsLabel(cents: number): string {
  if (cents === 0) return '0 cents';
  return `${cents > 0 ? '+' : '−'}${Math.abs(cents)} cents`;
}

function spokenLabel(display: TunerDisplay): string {
  const note = midiToNote(display.note).spoken;
  if (display.inTune) return `${note}, in tune`;
  const amount = Math.abs(display.cents);
  return `${note}, ${amount} cents ${display.cents > 0 ? 'sharp' : 'flat'}`;
}

type BigNoteProps = { midi: number; color?: string; size?: number };

/** A large note letter with its accidental (top right) and octave (bottom right). */
export function BigNote({ midi, color = colors.text, size = 128 }: BigNoteProps) {
  const note = midiToNote(midi);
  const mark = Math.round(size * 0.31);
  return (
    <View style={styles.noteRow}>
      <Text
        style={[styles.letter, { color, fontSize: size, lineHeight: Math.round(size * 1.125) }]}
        maxFontSizeMultiplier={1}>
        {note.letter}
      </Text>
      <View style={[styles.marks, { paddingVertical: Math.round(size * 0.11), minWidth: mark }]}>
        <Text
          style={[styles.mark, { color, fontSize: mark, lineHeight: Math.round(mark * 1.1) }]}
          maxFontSizeMultiplier={1}>
          {note.sharp ? '♯' : ' '}
        </Text>
        <Text
          style={[styles.mark, styles.octave, { fontSize: mark, lineHeight: Math.round(mark * 1.1) }]}
          maxFontSizeMultiplier={1}>
          {note.octave}
        </Text>
      </View>
    </View>
  );
}

/** Auto mode: the nearest note with its octave, and a small cents / frequency line. */
export function NoteReadout({ display }: { display: TunerDisplay | null }) {
  if (!display) {
    return (
      <View style={styles.root}>
        <Text style={[styles.letter, styles.placeholder]} maxFontSizeMultiplier={1}>
          –
        </Text>
        <Text style={styles.detail}>Play a note</Text>
      </View>
    );
  }
  return (
    <View
      style={[styles.root, display.held && styles.held]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={spokenLabel(display)}>
      <BigNote midi={display.note} color={display.inTune ? colors.inTune : colors.text} />
      <Text style={[styles.detail, display.inTune && styles.detailInTune]}>
        {display.inTune ? 'In tune ✓' : centsLabel(display.cents)}
        {`  ·  ${display.hz.toFixed(1)} Hz`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  held: { opacity: 0.45 },
  noteRow: { flexDirection: 'row', alignItems: 'stretch' },
  letter: { fontSize: 128, lineHeight: 144, fontWeight: '700', color: colors.text },
  placeholder: { color: colors.line },
  marks: { justifyContent: 'space-between', marginLeft: 4 },
  mark: { fontWeight: '600', color: colors.text },
  octave: { color: colors.dim },
  detail: { marginTop: 4, fontSize: 18, color: colors.dim, fontVariant: ['tabular-nums'] },
  detailInTune: { color: colors.inTune },
});
