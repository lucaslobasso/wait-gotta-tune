import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { colors } from './theme';

/** A bar that fills while the selected string rings in tune (0..1 towards the hold time). */
export function HoldProgress({ progress }: { progress: SharedValue<number> }) {
  const fill = useAnimatedStyle(() => ({ width: `${Math.round(progress.get() * 100)}%` }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    marginTop: 12,
    width: 180,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.inTune },
});
