import { StyleSheet, Text, View } from 'react-native';

import { midiToNote } from '../music/notes';
import type { TunerDisplay } from '../tuner/useTuner';
import { colors } from './theme';

function centsLabel(cents: number): string {
  if (cents === 0) return '0 cents';
  return `${cents > 0 ? '+' : '−'}${Math.abs(cents)} cents`;
}

function spokenLabel(display: TunerDisplay): string {
  const note = midiToNote(display.note).spoken;
  if (display.inTune) return `${note}, in tune`;
  const amount = Math.abs(display.cents);
  return `${note}, ${amount} cents ${display.cents > 0 ? 'sharp' : 'flat'}`;
}

/** The big note name with its octave, and a small cents / frequency line. */
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
  const note = midiToNote(display.note);
  const color = display.inTune ? colors.inTune : colors.text;
  return (
    <View
      style={[styles.root, display.held && styles.held]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={spokenLabel(display)}>
      <View style={styles.noteRow}>
        <Text style={[styles.letter, { color }]} maxFontSizeMultiplier={1}>
          {note.letter}
        </Text>
        <View style={styles.marks}>
          <Text style={[styles.mark, { color }]} maxFontSizeMultiplier={1}>
            {note.sharp ? '♯' : ' '}
          </Text>
          <Text style={[styles.mark, styles.octave]} maxFontSizeMultiplier={1}>
            {note.octave}
          </Text>
        </View>
      </View>
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
  marks: { justifyContent: 'space-between', paddingVertical: 14, marginLeft: 4, minWidth: 36 },
  mark: { fontSize: 40, lineHeight: 44, fontWeight: '600', color: colors.text },
  octave: { color: colors.dim },
  detail: { marginTop: 4, fontSize: 18, color: colors.dim, fontVariant: ['tabular-nums'] },
  detailInTune: { color: colors.inTune },
});
