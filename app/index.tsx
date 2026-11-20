import React from 'react';
import { View } from 'react-native';
import { Loading } from '../src/components/ui';
import { C } from '../src/lib/theme';

/** Launch screen: shown while the stored session is checked; AuthGate (app/_layout.tsx) then opens Login or Home. */
export default function Launch() {
  return (
    <View style={{ flex: 1, backgroundColor: C.navy }}>
      <Loading />
    </View>
  );
}
