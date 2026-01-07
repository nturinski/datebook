import { Stack } from 'expo-router';
import React from 'react';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function CouponsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Coupons' }} />
      <Stack.Screen name="new" options={{ title: 'Create coupon', presentation: 'modal' }} />
      <Stack.Screen name="[id]" options={{ title: 'Coupon' }} />
    </Stack>
  );
}
