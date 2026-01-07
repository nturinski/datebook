import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { CouponStatus } from '@/api/coupons';
import { PaperColors } from '@/constants/paper';

export function CouponStatusPill({ status }: { status: CouponStatus }) {
  const tone = status === 'ACTIVE' ? 'good' : 'muted';
  return (
    <View style={[styles.pill, tone === 'good' ? styles.good : styles.muted]}>
      <Text style={styles.text}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  good: {
    backgroundColor: '#DCFCE7',
  },
  muted: {
    backgroundColor: '#E5E7EB',
  },
  text: {
    fontWeight: '900',
    fontSize: 12,
    color: PaperColors.ink,
  },
});
