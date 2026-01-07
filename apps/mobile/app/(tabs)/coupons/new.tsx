import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';

import { apiFetch } from '@/api/client';
import { createCoupon } from '@/api/coupons';
import { listMyRelationships, type RelationshipSummary } from '@/api/relationships';
import { getSessionToken, getSessionUser, type SessionUser } from '@/auth/tokenStore';
import { SignInScreen } from '@/components/auth/SignInScreen';
import { CouponPreview } from '@/components/coupons/CouponPreview';
import { PaperColors } from '@/constants/paper';
import { COUPON_TEMPLATES } from '@/constants/couponTemplates';

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

function endOfDayIso(d: Date): string {
  const dd = new Date(d);
  dd.setHours(23, 59, 59, 0);
  return dd.toISOString();
}

function parseExpirationInputToIso(text: string): string | undefined {
  const raw = text.trim();
  if (!raw) return undefined;

  // Prefer a forgiving parser; accept YYYY-MM-DD as a common input.
  const yyyyMmDd = /^\d{4}-\d{2}-\d{2}$/;
  const d = yyyyMmDd.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw);
  if (!Number.isFinite(d.getTime())) return undefined;

  return endOfDayIso(d);
}

export default function CreateCouponScreen() {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [relationshipStatus, setRelationshipStatus] = useState<RelationshipStatus>('none');
  const [relationshipId, setRelationshipId] = useState<string | null>(null);

  const [relationships, setRelationships] = useState<RelationshipSummary[]>([]);

  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recipientUserId, setRecipientUserId] = useState<string | null>(null);
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState(COUPON_TEMPLATES[0]!.id);
  const [expiresAtText, setExpiresAtText] = useState('');

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

  const availableRecipients = useMemo(() => {
    if (!relationshipId) return [];
    const rel = relationships.find((r) => r.relationshipId === relationshipId);
    if (!rel) return [];
    const meId = user?.id;
    return rel.members
      .filter((m) => m.status !== 'pending')
      .filter((m) => (meId ? m.userId !== meId : true));
  }, [relationships, relationshipId, user?.id]);

  // Auto-select the other member if there is exactly one choice.
  useEffect(() => {
    if (!canUseCoupons) return;
    if (recipientUserId) return;
    if (availableRecipients.length === 1) setRecipientUserId(availableRecipients[0]!.userId);
  }, [availableRecipients, canUseCoupons, recipientUserId]);

  const loadRelationships = useCallback(async () => {
    if (!canUseCoupons) {
      setRelationships([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const rels = await listMyRelationships();
      setRelationships(rels);
    } catch (e: unknown) {
      setRelationships([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [canUseCoupons]);

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    void loadRelationships();
  }, [loadRelationships]);

  async function onSubmit() {
    if (!relationshipId) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Please enter a title.');
      return;
    }
    if (!recipientUserId) {
      setError('Please select who this coupon is for.');
      return;
    }

    const expiresAtIso = parseExpirationInputToIso(expiresAtText);
    if (expiresAtText.trim() && !expiresAtIso) {
      setError('Expiration must be a valid date (try YYYY-MM-DD).');
      return;
    }

    setCreating(true);
    setError(null);
    try {
      await createCoupon({
        relationshipId,
        recipientUserId,
        title: trimmedTitle,
        description: description.trim() ? description.trim() : undefined,
        templateId,
        ...(expiresAtIso ? { expiresAt: expiresAtIso } : {}),
      });

      // In expo-router, `index.tsx` routes to `/coupons`, not `/coupons/index`.
      // Navigating to `/coupons/index` can be treated as `/coupons/[id]` with id="index".
      router.replace('/(tabs)/coupons?toast=sent');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
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

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
      <View style={styles.paper}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Datebook</Text>
          <Text style={styles.title}>Create Coupon</Text>
          <Text style={styles.subtitle}>Templates are fixed presets (MVP).</Text>
        </View>

        {relationshipStatus !== 'active' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Link your partner first</Text>
            <Text style={styles.muted}>Coupons are relationship-scoped.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Preview</Text>
          <CouponPreview templateId={templateId} title={title} description={description} size="large" />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Details</Text>

          <Text style={styles.label}>To</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRecipientPickerOpen(true)}
            style={({ pressed }) => [styles.picker, pressed && styles.pickerPressed]}
            disabled={!canUseCoupons}
          >
            <Text style={styles.pickerText}>
              {recipientUserId
                ? memberEmailByUserId.get(recipientUserId) ?? recipientUserId
                : availableRecipients.length === 0
                  ? '(No recipient available)'
                  : 'Select recipient…'}
            </Text>
          </Pressable>

          <Text style={styles.label}>Title (required)</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Breakfast in bed"
            placeholderTextColor={PaperColors.ink60}
            style={styles.input}
            editable={!creating}
          />

          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Add details…"
            placeholderTextColor={PaperColors.ink60}
            style={[styles.input, styles.multiline]}
            multiline
            editable={!creating}
          />

          <Text style={styles.label}>Template</Text>
          <View style={styles.templateRow}>
            {COUPON_TEMPLATES.map((t) => {
              const selected = t.id === templateId;
              return (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  onPress={() => setTemplateId(t.id)}
                  style={({ pressed }) => [
                    styles.templateChip,
                    { backgroundColor: t.background, borderColor: selected ? t.accent : t.border },
                    selected && styles.templateChipSelected,
                    pressed && styles.pickerPressed,
                  ]}
                >
                  <Text style={[styles.templateChipText, { color: t.accent }]}>{t.name}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Expiration (optional)</Text>
          <TextInput
            value={expiresAtText}
            onChangeText={setExpiresAtText}
            placeholder="YYYY-MM-DD (or ISO)"
            placeholderTextColor={PaperColors.ink60}
            style={styles.input}
            editable={!creating}
          />

          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setExpiresAtText('')}
              style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.buttonPressed]}
              disabled={creating}
            >
              <Text style={styles.secondaryButtonText}>No expiration</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                setExpiresAtText(`${yyyy}-${mm}-${dd}`);
              }}
              style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.buttonPressed]}
              disabled={creating}
            >
              <Text style={styles.secondaryButtonText}>+7 days</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => void onSubmit()}
            disabled={creating || !canUseCoupons}
            style={({ pressed }) => [
              styles.button,
              styles.primaryButton,
              (pressed || creating) && styles.buttonPressed,
              (creating || !canUseCoupons) && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.primaryButtonText}>{creating ? 'Sending…' : 'Send coupon'}</Text>
          </Pressable>
        </View>
      </View>

      <Modal
        transparent
        visible={recipientPickerOpen}
        animationType="fade"
        onRequestClose={() => setRecipientPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.cardTitle}>Choose recipient</Text>
            {availableRecipients.length === 0 ? (
              <Text style={styles.muted}>No eligible recipients found.</Text>
            ) : (
              <View style={{ gap: 10 }}>
                {availableRecipients.map((m) => (
                  <Pressable
                    key={m.userId}
                    accessibilityRole="button"
                    onPress={() => {
                      setRecipientUserId(m.userId);
                      setRecipientPickerOpen(false);
                    }}
                    style={({ pressed }) => [styles.picker, pressed && styles.pickerPressed]}
                  >
                    <Text style={styles.pickerText}>{m.email}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              onPress={() => setRecipientPickerOpen(false)}
              style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.secondaryButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {loading ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator />
        </View>
      ) : null}
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
  header: {
    gap: 2,
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
  label: {
    color: PaperColors.ink60,
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: PaperColors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: PaperColors.ink,
    backgroundColor: PaperColors.paper,
  },
  multiline: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  templateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  templateChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  templateChipSelected: {
    transform: [{ translateY: -1 }],
  },
  templateChipText: {
    fontWeight: '900',
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
  error: {
    color: '#B42318',
    fontWeight: '700',
  },
  muted: {
    color: PaperColors.ink60,
  },
  picker: {
    borderWidth: 1,
    borderColor: PaperColors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: PaperColors.paper,
  },
  pickerPressed: {
    opacity: 0.9,
  },
  pickerText: {
    color: PaperColors.ink,
    fontWeight: '700',
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
  loadingOverlay: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
});
