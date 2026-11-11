import { StyleSheet, Text, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { midiToNote } from '../music/notes';
import type { TunerDisplay } from '../tuner/useTuner';
import { Arrow } from './Arrow';
import { HoldProgress } from './HoldProgress';
import { BigNote, centsLabel } from './NoteReadout';
import { colors } from './theme';

type Props = {
  /** MIDI note of the string being tuned. */
  target: number;
  display: TunerDisplay | null;
  /** 0..1 towards the in-tune hold time. */
  progress: SharedValue<number>;
};

function spokenLabel(target: number, display: TunerDisplay | null): string {
  const note = midiToNote(target).spoken;
  if (!display) return `${note}, pluck the string`;
  if (display.inTune) return `${note}, in tune`;
  return `${note}, tune ${display.cents < 0 ? 'up' : 'down'}`;
}

/**
 * Instrument modes: the note of the selected string, an arrow showing which way to
 * tune it, and a bar that fills while it rings in tune. The two directions look
 * different on purpose: too low = a blue up arrow on the left of the note, too high =
 * an amber down arrow on its right (the same sides as the neighbouring note in Auto).
 */
export function StringReadout({ target, display, progress }: Props) {
  const inTune = display?.inTune ?? false;
  const direction = !display || inTune ? null : display.cents < 0 ? 'up' : 'down';

  return (
    <View
      style={[styles.root, display?.held && styles.held]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={spokenLabel(target, display)}>
      <View style={styles.row}>
        <View style={styles.side}>
          {direction === 'up' ? <Arrow direction="up" size={44} color={colors.tooLow} /> : null}
        </View>
        <BigNote midi={target} size={96} color={inTune ? colors.inTune : colors.text} />
        <View style={styles.side}>
          {direction === 'down' ? (
            <Arrow direction="down" size={44} color={colors.offPitch} />
          ) : inTune ? (
            <Text style={styles.check}>✓</Text>
          ) : null}
        </View>
      </View>
      <Text
        style={[
          styles.detail,
          inTune && styles.detailInTune,
          direction === 'up' && styles.detailUp,
          direction === 'down' && styles.detailDown,
        ]}>
        {!display
          ? 'Pluck the string'
          : `${inTune ? 'In tune' : direction === 'up' ? 'Tune up' : 'Tune down'}  ·  ${centsLabel(display.cents)}  ·  ${display.hz.toFixed(1)} Hz`}
      </Text>
      <HoldProgress progress={progress} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  held: { opacity: 0.45 },
  row: { flexDirection: 'row', alignItems: 'center' },
  side: { width: 64, alignItems: 'center', justifyContent: 'center' },
  check: { fontSize: 44, fontWeight: '700', color: colors.inTune },
  detail: { marginTop: 4, fontSize: 17, color: colors.dim, fontVariant: ['tabular-nums'] },
  detailInTune: { color: colors.inTune },
  detailUp: { color: colors.tooLow },
  detailDown: { color: colors.offPitch },
});
