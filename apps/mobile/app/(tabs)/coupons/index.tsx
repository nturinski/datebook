import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';

import { apiFetch } from '@/api/client';
import { listCoupons, type Coupon, type CouponStatus } from '@/api/coupons';
import { listMyRelationships, type RelationshipSummary } from '@/api/relationships';
import { getSessionToken, getSessionUser, type SessionUser } from '@/auth/tokenStore';
import { SignInScreen } from '@/components/auth/SignInScreen';
import { CouponPreview } from '@/components/coupons/CouponPreview';
import { CouponStatusPill } from '@/components/coupons/CouponStatusPill';
import { PaperColors } from '@/constants/paper';
import { ensurePushTokenRegistered } from '@/lib/pushNotifications';

type RelationshipStatus = 'none' | 'pending' | 'active';

type MeResponse = {
  ok: true;
  user: { id: string; email: string };
  relationship:
    | { status: 'none' }
    | {
        status: Exclude<RelationshipStatus, 'none'>;
        relationshipId: string;
        role: string;
        memberStatus: string;
      };
};

function formatWhenDateOnly(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  return d.toLocaleDateString();
}

function byStatus(coupons: Coupon[]): Record<CouponStatus, Coupon[]> {
  return {
    ACTIVE: coupons.filter((c) => c.status === 'ACTIVE'),
    REDEEMED: coupons.filter((c) => c.status === 'REDEEMED'),
    EXPIRED: coupons.filter((c) => c.status === 'EXPIRED'),
  };
}

function byDirection(coupons: Coupon[], meUserId: string | null): { received: Coupon[]; sent: Coupon[] } {
  if (!meUserId) return { received: [], sent: [] };
  return {
    received: coupons.filter((c) => c.recipientUserId === meUserId),
    sent: coupons.filter((c) => c.issuerUserId === meUserId),
  };
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <View style={styles.toastWrap} pointerEvents="none">
      <View style={styles.toast}>
        <Text style={styles.toastText}>{message}</Text>
      </View>
    </View>
  );
}

export default function CouponListScreen() {
  const params = useLocalSearchParams<{ toast?: string }>();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [relationshipStatus, setRelationshipStatus] = useState<RelationshipStatus>('none');
  const [relationshipId, setRelationshipId] = useState<string | null>(null);

  const [relationships, setRelationships] = useState<RelationshipSummary[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExpired, setShowExpired] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  async function refreshSession() {
    const [t, u] = await Promise.all([getSessionToken(), getSessionUser()]);
    setToken(t);
    setUser(u);

    if (t) {
      try {
        const me = await apiFetch<MeResponse>('/me');
        setUser(me.user);
        setRelationshipStatus(me.relationship.status);
        setRelationshipId(me.relationship.status === 'none' ? null : me.relationship.relationshipId);
      } catch {
        setToken(null);
        setUser(null);
        setRelationshipStatus('none');
        setRelationshipId(null);
      }
    } else {
      setRelationshipStatus('none');
      setRelationshipId(null);
    }

    setSessionChecked(true);
  }

  const signedIn = Boolean(token);
  const canUseCoupons = signedIn && relationshipStatus === 'active' && typeof relationshipId === 'string';

  const memberEmailByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of relationships) {
      if (relationshipId && r.relationshipId !== relationshipId) continue;
      for (const m of r.members) map.set(m.userId, m.email);
    }
    return map;
  }, [relationships, relationshipId]);

  const loadAll = useCallback(async () => {
    if (!canUseCoupons || !relationshipId) {
      setRelationships([]);
      setCoupons([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [rels, cps] = await Promise.all([listMyRelationships(), listCoupons({ relationshipId })]);
      setRelationships(rels);
      setCoupons(cps);
    } catch (e: unknown) {
      setRelationships([]);
      setCoupons([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [canUseCoupons, relationshipId]);

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    void ensurePushTokenRegistered();
  }, [signedIn]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (params.toast === 'sent') {
      setToastMessage('Sent!');
      router.setParams({ toast: undefined });
    }
  }, [params.toast]);

  useFocusEffect(
    useCallback(() => {
      void refreshSession().then(() => loadAll());
    }, [loadAll])
  );

  const meUserId = user?.id ?? null;
  const directed = useMemo(() => byDirection(coupons, meUserId), [coupons, meUserId]);
  const received = useMemo(() => byStatus(directed.received), [directed.received]);
  const sent = useMemo(() => byStatus(directed.sent), [directed.sent]);

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

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        <View style={styles.paper}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>Datebook</Text>
              <Text style={styles.title}>Coupons</Text>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(tabs)/coupons/new')}
              style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.buttonText}>New Coupon</Text>
            </Pressable>
          </View>

          {user?.email ? <Text style={styles.subtitle}>Signed in as: {user.email}</Text> : null}

          {relationshipStatus !== 'active' ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Link your partner first</Text>
              <Text style={styles.muted}>
                Coupons are relationship-scoped. Create or join a relationship in the Timeline tab.
              </Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.cardTitle}>Coupon Book</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void loadAll()}
                disabled={loading}
                style={({ pressed }) => [
                  styles.smallButton,
                  pressed && styles.smallButtonPressed,
                  loading && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.smallButtonText}>{loading ? '…' : 'Refresh'}</Text>
              </Pressable>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {loading ? (
              <View style={{ paddingVertical: 12 }}>
                <ActivityIndicator />
              </View>
            ) : coupons.length === 0 ? (
              <Text style={styles.muted}>No coupons yet.</Text>
            ) : (
              <View style={{ gap: 14 }}>
                <CouponDirectionSection
                  title="Received"
                  subtitle="Issued to you"
                  active={received.ACTIVE}
                  redeemed={received.REDEEMED}
                  expired={received.EXPIRED}
                  showExpired={showExpired}
                  onToggleExpired={() => setShowExpired((v) => !v)}
                  memberEmailByUserId={memberEmailByUserId}
                />

                <CouponDirectionSection
                  title="Sent"
                  subtitle="Issued by you"
                  active={sent.ACTIVE}
                  redeemed={sent.REDEEMED}
                  expired={sent.EXPIRED}
                  showExpired={showExpired}
                  onToggleExpired={() => setShowExpired((v) => !v)}
                  memberEmailByUserId={memberEmailByUserId}
                />
              </View>
            )}
          </View>

          <Text style={styles.finePrint}>
            Tip: tap a coupon to view details and redeem.
          </Text>

          <Text style={styles.finePrintMuted}>
            Expiration is computed server-side (ACTIVE coupons can become EXPIRED automatically).
          </Text>
        </View>
      </ScrollView>

      {toastMessage ? <Toast message={toastMessage} onDone={() => setToastMessage(null)} /> : null}
    </View>
  );
}

function CouponDirectionSection({
  title,
  subtitle,
  active,
  redeemed,
  expired,
  showExpired,
  onToggleExpired,
  memberEmailByUserId,
}: {
  title: string;
  subtitle: string;
  active: Coupon[];
  redeemed: Coupon[];
  expired: Coupon[];
  showExpired: boolean;
  onToggleExpired: () => void;
  memberEmailByUserId: Map<string, string>;
}) {
  const hasAny = active.length + redeemed.length + expired.length > 0;

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 2 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      {!hasAny ? <Text style={styles.muted}>No coupons.</Text> : null}

      <CouponSection
        title="Active"
        coupons={active}
        emptyText="No active coupons."
        memberEmailByUserId={memberEmailByUserId}
      />

      <CouponSection
        title="Redeemed"
        coupons={redeemed}
        emptyText="No redeemed coupons."
        memberEmailByUserId={memberEmailByUserId}
      />

      <View>
        <Pressable
          accessibilityRole="button"
          onPress={onToggleExpired}
          style={({ pressed }) => [styles.expiredToggle, pressed && styles.smallButtonPressed]}
        >
          <Text style={styles.expiredToggleText}>{showExpired ? '▾' : '▸'} Expired</Text>
          <Text style={styles.expiredToggleCount}>{expired.length}</Text>
        </Pressable>

        {showExpired ? (
          <View style={{ marginTop: 10 }}>
            <CouponSection
              title=""
              coupons={expired}
              emptyText="No expired coupons."
              memberEmailByUserId={memberEmailByUserId}
              hideTitle
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function CouponSection({
  title,
  coupons,
  emptyText,
  memberEmailByUserId,
  hideTitle,
}: {
  title: string;
  coupons: Coupon[];
  emptyText: string;
  memberEmailByUserId: Map<string, string>;
  hideTitle?: boolean;
}) {
  return (
    <View style={{ gap: 10 }}>
      {!hideTitle ? <Text style={styles.sectionTitle}>{title}</Text> : null}

      {coupons.length === 0 ? (
        <Text style={styles.muted}>{emptyText}</Text>
      ) : (
        <View style={{ gap: 10 }}>
          {coupons.map((c) => {
            const issuerName = memberEmailByUserId.get(c.issuerUserId) ?? c.issuerUserId;
            const expiration = c.expiresAt ? formatWhenDateOnly(c.expiresAt) : null;

            return (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/(tabs)/coupons/[id]', params: { id: c.id } })}
                style={({ pressed }) => [styles.couponCard, pressed && styles.couponCardPressed]}
              >
                <CouponPreview templateId={c.templateId} size="small" />

                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.couponTitleRow}>
                    <Text style={styles.couponTitle} numberOfLines={1}>
                      {c.title}
                    </Text>
                    <CouponStatusPill status={c.status} />
                  </View>

                  <View style={styles.issuerRow}>
                    <View style={styles.issuerBadge}>
                      <Text style={styles.issuerBadgeText}>ISSUER</Text>
                    </View>
                    <Text style={styles.meta} numberOfLines={1}>
                      {issuerName}
                    </Text>
                  </View>

                  {expiration ? (
                    <Text style={styles.meta}>
                      Expires: <Text style={styles.metaStrong}>{expiration}</Text>
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
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
    alignItems: 'flex-end',
    gap: 12,
  },
  kicker: {
    color: PaperColors.ink60,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    color: PaperColors.ink,
    fontWeight: '800',
  },
  subtitle: {
    color: PaperColors.ink60,
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
    fontWeight: '800',
    color: PaperColors.ink,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: PaperColors.ink,
    opacity: 0.85,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  muted: {
    color: PaperColors.ink60,
  },
  error: {
    color: '#B42318',
    fontWeight: '700',
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
  buttonPressed: {
    transform: [{ translateY: 1 }],
    opacity: 0.95,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: PaperColors.paper,
    fontWeight: '900',
  },
  smallButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PaperColors.border,
    backgroundColor: PaperColors.paper,
  },
  smallButtonPressed: {
    opacity: 0.85,
  },
  smallButtonText: {
    color: PaperColors.ink,
    fontWeight: '800',
  },
  couponCard: {
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: PaperColors.border,
    borderRadius: 16,
    padding: 12,
    backgroundColor: PaperColors.sand,
    alignItems: 'center',
  },
  couponCardPressed: {
    opacity: 0.95,
    transform: [{ translateY: 1 }],
  },
  couponTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  couponTitle: {
    flex: 1,
    fontWeight: '900',
    color: PaperColors.ink,
    fontSize: 16,
  },
  issuerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  issuerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(46,42,39,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(46,42,39,0.12)',
  },
  issuerBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: PaperColors.ink,
    opacity: 0.8,
    letterSpacing: 0.6,
  },
  meta: {
    color: PaperColors.ink60,
    fontSize: 12,
    flexShrink: 1,
  },
  metaStrong: {
    color: PaperColors.ink,
    fontWeight: '800',
  },
  expiredToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: PaperColors.border,
    backgroundColor: PaperColors.paper,
  },
  expiredToggleText: {
    fontWeight: '900',
    color: PaperColors.ink,
  },
  expiredToggleCount: {
    fontWeight: '900',
    color: PaperColors.ink60,
  },
  finePrint: {
    marginTop: 4,
    color: PaperColors.ink,
    opacity: 0.65,
    fontSize: 12,
    lineHeight: 16,
  },
  finePrintMuted: {
    marginTop: 2,
    color: PaperColors.ink60,
    fontSize: 12,
    lineHeight: 16,
  },
  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 18,
    alignItems: 'center',
  },
  toast: {
    backgroundColor: 'rgba(46,42,39,0.92)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  toastText: {
    color: PaperColors.paper,
    fontWeight: '900',
  },
});
