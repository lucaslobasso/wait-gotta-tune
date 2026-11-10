import { Stack } from 'expo-router';

import { TunerScreen } from '../ui/TunerScreen';

export default function Index() {
  return (
    <>
      <Stack.Screen options={{ title: 'Wait Gotta Tune' }} />
      <TunerScreen />
    </>
  );
}
