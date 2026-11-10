import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { TunerStatus } from '../tuner/types';
import { colors } from './theme';

type Props = {
  status: Exclude<TunerStatus, 'listening'>;
  error: string | null;
  onPress: () => void;
};

type Content = { message?: string; tone?: 'error'; button?: string };

function contentFor(status: Props['status'], error: string | null): Content {
  switch (status) {
    case 'idle':
      return { button: 'Tap to start' };
    case 'paused':
      return { message: 'Paused', button: 'Tap to resume' };
    case 'requesting':
      return { message: 'Starting microphone…' };
    case 'denied':
      return Platform.OS === 'web'
        ? {
            message:
              'The microphone is blocked. Allow it for this site in your browser settings, then try again.',
            tone: 'error',
            button: 'Try again',
          }
        : {
            message: 'The tuner needs the microphone to hear your instrument.',
            tone: 'error',
            button: 'Open settings',
          };
    case 'error':
      return {
        message: error ?? 'The microphone could not be started.',
        tone: 'error',
        button: 'Retry',
      };
  }
}

/** Shown instead of the note readout whenever the tuner is not listening. */
export function StatusPanel({ status, error, onPress }: Props) {
  const content = contentFor(status, error);
  const primary = status === 'idle' || status === 'paused';
  return (
    <View style={styles.root}>
      {content.message ? (
        <Text style={[styles.message, content.tone === 'error' && styles.error]}>
          {content.message}
        </Text>
      ) : null}
      {content.button ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [
            primary ? styles.round : styles.button,
            pressed && styles.pressed,
          ]}>
          <Text style={primary ? styles.roundLabel : styles.buttonLabel}>{content.button}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 24 },
  message: { fontSize: 18, lineHeight: 26, color: colors.dim, textAlign: 'center' },
  error: { color: colors.error },
  round: {
    width: 168,
    height: 168,
    borderRadius: 84,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.inTune,
  },
  roundLabel: { fontSize: 20, fontWeight: '600', color: colors.text, textAlign: 'center' },
  button: {
    minHeight: 48,
    paddingHorizontal: 24,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  buttonLabel: { fontSize: 17, fontWeight: '600', color: colors.text },
  pressed: { opacity: 0.6 },
});
