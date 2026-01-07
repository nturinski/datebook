import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import { getCoupon, redeemCoupon, type Coupon } from '@/api/coupons';
import { listMyRelationships, type RelationshipSummary } from '@/api/relationships';
import { getSessionToken, getSessionUser, type SessionUser } from '@/auth/tokenStore';
import { SignInScreen } from '@/components/auth/SignInScreen';
import { CouponPreviewFromCoupon } from '@/components/coupons/CouponPreview';
import { CouponStatusPill } from '@/components/coupons/CouponStatusPill';
import { PaperColors } from '@/constants/paper';

function isUuid(value: string): boolean {
  // UUID v1-v5 (case-insensitive). Good enough for UI-side validation.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function formatWhen(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  return d.toLocaleString();
}

export default function CouponDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const couponId = useMemo(() => {
    if (typeof id !== 'string') return null;
    return id;
  }, [id]);

  const [sessionChecked, setSessionChecked] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);

  const [relationships, setRelationships] = useState<RelationshipSummary[]>([]);
  const [coupon, setCoupon] = useState<Coupon | null>(null);

  const [loading, setLoading] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // “stamp” animation on redeem (tiny micro-animation).
  const stampScale = useRef(new Animated.Value(0)).current;
  const stampOpacity = useRef(new Animated.Value(0)).current;

  const memberEmailByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of relationships) {
      if (coupon && r.relationshipId !== coupon.relationshipId) continue;
      for (const m of r.members) map.set(m.userId, m.email);
    }
    return map;
  }, [relationships, coupon]);

  const canRedeem = Boolean(user?.id && coupon && coupon.recipientUserId === user.id && coupon.status === 'ACTIVE');

  const playStamp = useCallback(() => {
    stampScale.setValue(0);
    stampOpacity.setValue(0);

    Animated.parallel([
      Animated.timing(stampOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(stampScale, {
        toValue: 1,
        friction: 6,
        tension: 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, [stampOpacity, stampScale]);

  async function refreshSession() {
    const [t, u] = await Promise.all([getSessionToken(), getSessionUser()]);
    setToken(t);
    setUser(u);
    setSessionChecked(true);
  }

  const signedIn = Boolean(token);

  const load = useCallback(async () => {
    if (!couponId) {
      setError('Missing coupon id.');
      return;
    }
    if (!isUuid(couponId)) {
      setError('Invalid coupon id.');
      return;
    }
    if (!signedIn) return;

    setLoading(true);
    setError(null);
    try {
      const [c, rels] = await Promise.all([getCoupon(couponId), listMyRelationships()]);
      setCoupon(c);
      setRelationships(rels);

      if (c.status === 'REDEEMED') {
        playStamp();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [couponId, playStamp, signedIn]);

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // If the route is malformed, show a useful message instead of a forever spinner.
    if (!couponId) return;
    if (!isUuid(couponId)) setError('Invalid coupon id.');
  }, [couponId]);

  useEffect(() => {
    if (coupon?.title) {
      // Update header title.
      // Stack.Screen must be in render, so we just let it read state.
    }
  }, [coupon?.title]);

  async function onRedeem() {
    if (!coupon) return;

    setRedeeming(true);
    setError(null);
    try {
      const updated = await redeemCoupon(coupon.id);
      setCoupon(updated);
      playStamp();
      setConfirmOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRedeeming(false);
    }
  }

  if (!sessionChecked) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!signedIn) {
    return <SignInScreen onSignedIn={() => void refreshSession()} />;
  }

  // If the route param is bad, stop here and let the user recover.
  if (error && !loading && !coupon) {
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: 'Coupon' }} />
        <View style={styles.paper}>
          <Text style={styles.error}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/(tabs)/coupons')}
            style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.secondaryButtonText}>Back to coupons</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: coupon?.title ? 'Coupon' : 'Coupon' }} />

      <View style={styles.paper}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>Datebook</Text>
            <Text style={styles.title}>{coupon?.title ?? 'Coupon'}</Text>
          </View>
          {coupon ? <CouponStatusPill status={coupon.status} /> : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading || !coupon ? (
          <View style={{ paddingVertical: 12 }}>
            <ActivityIndicator />
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <View style={styles.previewWrap}>
              <CouponPreviewFromCoupon coupon={coupon} size="large" />

              {coupon.status === 'REDEEMED' ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.stamp,
                    {
                      opacity: stampOpacity,
                      transform: [{ scale: stampScale }, { rotate: '-12deg' }],
                    },
                  ]}
                >
                  <Text style={styles.stampText}>REDEEMED</Text>
                </Animated.View>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Details</Text>

              <Text style={styles.meta}>
                Issuer: <Text style={styles.metaStrong}>{memberEmailByUserId.get(coupon.issuerUserId) ?? coupon.issuerUserId}</Text>
              </Text>
              <Text style={styles.meta}>
                Recipient: <Text style={styles.metaStrong}>{memberEmailByUserId.get(coupon.recipientUserId) ?? coupon.recipientUserId}</Text>
              </Text>

              <Text style={styles.meta}>
                Created: <Text style={styles.metaStrong}>{formatWhen(coupon.createdAt)}</Text>
              </Text>
              <Text style={styles.meta}>
                Expires: <Text style={styles.metaStrong}>{coupon.expiresAt ? formatWhen(coupon.expiresAt) : 'Never'}</Text>
              </Text>
              <Text style={styles.meta}>
                Redeemed: <Text style={styles.metaStrong}>{formatWhen(coupon.redeemedAt)}</Text>
              </Text>

              {coupon.description ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.cardTitle}>Message</Text>
                  <Text style={styles.body}>{coupon.description}</Text>
                </View>
              ) : null}
            </View>

            {canRedeem ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Ready?</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setConfirmOpen(true)}
                  disabled={redeeming}
                  style={({ pressed }) => [
                    styles.button,
                    styles.primaryButton,
                    (pressed || redeeming) && styles.buttonPressed,
                    redeeming && styles.buttonDisabled,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>{redeeming ? 'Redeeming…' : 'Redeem'}</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.back()}
                  style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.secondaryButtonText}>Back</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.back()}
                style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      <Modal transparent visible={confirmOpen} animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.cardTitle}>Redeem this coupon now?</Text>
            <Text style={styles.muted}>
              This will mark the coupon as redeemed for both of you.
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirmOpen(false)}
                style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.buttonPressed]}
                disabled={redeeming}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => void onRedeem()}
                style={({ pressed }) => [
                  styles.button,
                  styles.primaryButton,
                  (pressed || redeeming) && styles.buttonPressed,
                  redeeming && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.primaryButtonText}>{redeeming ? 'Redeeming…' : 'Redeem'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  page: {
    flex: 1,
    backgroundColor: PaperColors.sand,
  },
  pageContent: {
    padding: 18,
  },
  paper: {
    backgroundColor: PaperColors.paper,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: PaperColors.border,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  kicker: {
    color: PaperColors.ink60,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 26,
    color: PaperColors.ink,
    fontWeight: '900',
  },
  error: {
    color: '#B42318',
    fontWeight: '700',
  },
  previewWrap: {
    position: 'relative',
  },
  stamp: {
    position: 'absolute',
    right: 14,
    top: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(46,42,39,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  stampText: {
    color: PaperColors.paper,
    fontWeight: '900',
    letterSpacing: 2,
  },
  card: {
    borderWidth: 1,
    borderColor: PaperColors.border,
    borderRadius: 18,
    padding: 14,
    gap: 10,
    backgroundColor: PaperColors.paper,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: PaperColors.ink,
  },
  body: {
    color: PaperColors.ink,
    opacity: 0.82,
    lineHeight: 20,
  },
  meta: {
    color: PaperColors.ink60,
    fontSize: 13,
  },
  metaStrong: {
    color: PaperColors.ink,
    fontWeight: '900',
  },
  muted: {
    color: PaperColors.ink60,
  },
  button: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PaperColors.borderStrong,
  },
  primaryButton: {
    backgroundColor: PaperColors.ink,
  },
  secondaryButton: {
    backgroundColor: PaperColors.paper,
  },
  primaryButtonText: {
    color: PaperColors.paper,
    fontWeight: '900',
  },
  secondaryButtonText: {
    color: PaperColors.ink,
    fontWeight: '900',
  },
  buttonPressed: {
    transform: [{ translateY: 1 }],
    opacity: 0.95,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: 18,
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: PaperColors.paper,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PaperColors.border,
    padding: 14,
    gap: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    flexWrap: 'wrap',
  },
});
