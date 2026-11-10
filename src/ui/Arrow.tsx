import { View } from 'react-native';

type Props = { direction: 'up' | 'down'; size: number; color: string };

/** A solid triangle pointing up or down (drawn with borders so it looks the same everywhere). */
export function Arrow({ direction, size, color }: Props) {
  const half = size / 2;
  const height = Math.round(size * 0.9);
  return (
    <View
      style={[
        {
          width: 0,
          height: 0,
          borderLeftWidth: half,
          borderRightWidth: half,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
        },
        direction === 'up'
          ? { borderBottomWidth: height, borderBottomColor: color }
          : { borderTopWidth: height, borderTopColor: color },
      ]}
    />
  );
}
