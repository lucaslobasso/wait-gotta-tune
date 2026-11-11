import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TuningProfile } from '../music/tuningProfile';
import { colors } from './theme';

type Props = {
  profiles: readonly TuningProfile[];
  selectedId: string;
  onSelect: (id: string) => void;
};

/** Auto / Guitar / Bass / Ukulele. */
export function ModePicker({ profiles, selectedId, onSelect }: Props) {
  return (
    <View style={styles.root} accessibilityRole="tablist">
      {profiles.map((profile) => {
        const selected = profile.id === selectedId;
        return (
          <Pressable
            key={profile.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onSelect(profile.id)}
            style={({ pressed }) => [
              styles.item,
              selected && styles.itemSelected,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
              {profile.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    marginHorizontal: 16,
    padding: 4,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  item: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemSelected: { backgroundColor: colors.line },
  pressed: { opacity: 0.6 },
  label: { fontSize: 15, fontWeight: '600', color: colors.dim },
  labelSelected: { color: colors.text },
});
