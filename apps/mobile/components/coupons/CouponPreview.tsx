import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Coupon } from '@/api/coupons';
import { PaperColors } from '@/constants/paper';
import { getCouponTemplate } from '@/constants/couponTemplates';

export function CouponPreview({
  templateId,
  title,
  description,
  size,
}: {
  templateId: string;
  title?: string | null;
  description?: string | null;
  size: 'small' | 'large';
}) {
  const t = getCouponTemplate(templateId);

  return (
    <View
      style={[
        styles.base,
        size === 'small' ? styles.small : styles.large,
        { backgroundColor: t.background, borderColor: t.border },
      ]}
    >
      <View style={[styles.ribbon, { backgroundColor: t.accent }]} />
      {size === 'large' ? (
        <View style={styles.largeTextWrap}>
          <Text numberOfLines={2} style={[styles.title, { color: t.accent }]}>
            {title?.trim() ? title : 'Your coupon'}
          </Text>
          {description?.trim() ? (
            <Text numberOfLines={4} style={styles.description}>
              {description}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.dotsRow}>
        <View style={[styles.dot, { backgroundColor: t.accent }]} />
        <View style={[styles.dot, { backgroundColor: t.accent, opacity: 0.65 }]} />
        <View style={[styles.dot, { backgroundColor: t.accent, opacity: 0.45 }]} />
      </View>
    </View>
  );
}

export function CouponPreviewFromCoupon({ coupon, size }: { coupon: Coupon; size: 'small' | 'large' }) {
  return (
    <CouponPreview
      templateId={coupon.templateId}
      title={coupon.title}
      description={coupon.description}
      size={size}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  small: {
    width: 56,
    height: 44,
  },
  large: {
    width: '100%',
    height: 180,
  },
  ribbon: {
    height: 10,
    opacity: 0.9,
  },
  largeTextWrap: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 26,
  },
  description: {
    color: PaperColors.ink,
    opacity: 0.8,
    lineHeight: 18,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
});
