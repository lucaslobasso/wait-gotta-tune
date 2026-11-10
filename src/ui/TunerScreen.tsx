import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { A4_HZ } from '../tuner/config';
import { useTuner } from '../tuner/useTuner';
import { CentsGauge } from './CentsGauge';
import { NoteReadout } from './NoteReadout';
import { NoteStrip } from './NoteStrip';
import { StatusPanel } from './StatusPanel';
import { colors, MAX_COLUMN_WIDTH } from './theme';

/** The single screen: auto (chromatic) tuner. */
export function TunerScreen() {
  const tuner = useTuner();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.column} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Wait, gotta tune
          </Text>
          <Text style={styles.reference}>A4 = {A4_HZ} Hz</Text>
        </View>

        <View style={styles.main}>
          {tuner.status === 'listening' ? (
            <NoteReadout display={tuner.display} />
          ) : (
            <StatusPanel status={tuner.status} error={tuner.error} onPress={tuner.tap} />
          )}
        </View>

        {width > 0 ? (
          <View style={styles.meters}>
            <NoteStrip width={width} midi={tuner.midi} presence={tuner.presence} />
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
  column: { flex: 1, width: '100%', maxWidth: MAX_COLUMN_WIDTH },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  title: { fontSize: 18, fontWeight: '600', color: colors.text },
  reference: { fontSize: 14, color: colors.dim },
  main: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  meters: { gap: 20 },
});
