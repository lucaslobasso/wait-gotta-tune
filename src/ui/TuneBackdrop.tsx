import { StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { colors } from './theme';

/** Cents away from the note at which the background is back to its normal colour. */
const RANGE = 50;

type Props = {
  cents: SharedValue<number>;
  /** 1 = live signal, 0.4 = holding the last reading, 0 = no signal. */
  presence: SharedValue<number>;
};

/**
 * The screen background: the usual dark blue far from the note, shifting to green
 * the closer the pitch gets to it. Fades back when there is no signal.
 */
export function TuneBackdrop({ cents, presence }: Props) {
  const tint = useAnimatedStyle(() => {
    // Squared: the green only really comes in close to the note.
    const closeness = (1 - Math.min(RANGE, Math.abs(cents.get())) / RANGE) ** 2;
    return {
      backgroundColor: interpolateColor(
        closeness * presence.get(),
        [0, 1],
        [colors.bg, colors.bgInTune],
      ),
    };
  });
  return <Animated.View style={[StyleSheet.absoluteFill, tint]} pointerEvents="none" />;
}
