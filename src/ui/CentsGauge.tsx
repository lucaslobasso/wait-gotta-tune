import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { IN_TUNE_ENTER_CENTS } from '../tuner/config';
import { colors } from './theme';

const RANGE = 50;
const HEIGHT = 72;
const NEEDLE_WIDTH = 4;
const TICKS = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50];

type Props = {
  /** Width of the containing column, from onLayout. */
  width: number;
  cents: SharedValue<number>;
  tuned: SharedValue<number>;
  presence: SharedValue<number>;
};

/** A linear gauge from −50 to +50 cents with a needle and a centre "in tune" band. */
export function CentsGauge({ width, cents, tuned, presence }: Props) {
  const track = Math.max(0, Math.min(width - 48, 420));
  const half = track / 2;

  const needle = useAnimatedStyle(() => {
    const c = Math.min(RANGE, Math.max(-RANGE, cents.get()));
    return {
      opacity: presence.get(),
      transform: [{ translateX: (c / RANGE) * half }],
      backgroundColor: interpolateColor(tuned.get(), [0, 1], [colors.offPitch, colors.inTune]),
    };
  });
  const band = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(tuned.get(), [0, 1], [colors.surface, colors.inTune]),
    opacity: 0.35 + 0.35 * tuned.get(),
  }));

  return (
    <View
      style={styles.root}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Text style={styles.side}>♭</Text>
      <View style={[styles.track, { width: track }]}>
        <Animated.View
          style={[
            styles.band,
            { left: half - (IN_TUNE_ENTER_CENTS / RANGE) * half, width: (IN_TUNE_ENTER_CENTS / RANGE) * track },
            band,
          ]}
        />
        {TICKS.map((tick) => {
          const major = tick === 0 || Math.abs(tick) === RANGE;
          const height = major ? 28 : 14;
          return (
            <View
              key={tick}
              style={[
                styles.tick,
                { left: half + (tick / RANGE) * half - 1, height, top: (HEIGHT - height) / 2 },
              ]}
            />
          );
        })}
        <Animated.View style={[styles.needle, { left: half - NEEDLE_WIDTH / 2 }, needle]} />
      </View>
      <Text style={styles.side}>♯</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: HEIGHT },
  side: { width: 24, textAlign: 'center', fontSize: 20, color: colors.dim },
  track: { height: HEIGHT },
  band: { position: 'absolute', top: 8, bottom: 8, borderRadius: 6 },
  tick: { position: 'absolute', width: 2, borderRadius: 1, backgroundColor: colors.line },
  needle: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: NEEDLE_WIDTH,
    borderRadius: NEEDLE_WIDTH / 2,
  },
});
