import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { apiFetch } from '@/api/client';
import { getSessionToken, getSessionUser, type SessionUser } from '@/auth/tokenStore';
import { SignInScreen } from '@/components/auth/SignInScreen';
import { PaperColors } from '@/constants/paper';

type RelationshipMember = {
  userId: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
};

type RelationshipSummary = {
  relationshipId: string;
  createdAt: string | null;
  myMembership: { role: string; status: string } | null;
  members: RelationshipMember[];
};

type RelationshipsMineResponse =
  | { ok: true; relationships: RelationshipSummary[] }
  | { ok: false; error: string };

type PendingInvite = {
  code: string;
  relationshipId: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
};

type PendingInvitesResponse =
  | { ok: true; invites: PendingInvite[] }
  | { ok: false; error: string };

type JoinOk = {
  ok: true;
  relationshipId: string;
  membership: { role: string; status: string };
};

export default function RelationshipsTab() {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);

  const [loading, setLoading] = useState(false);
  const [relationships, setRelationships] = useState<RelationshipSummary[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [acceptingCode, setAcceptingCode] = useState<string | null>(null);
  const [leavingRelationshipId, setLeavingRelationshipId] = useState<string | null>(null);
  const [confirmLeaveRelationshipId, setConfirmLeaveRelationshipId] = useState<string | null>(null);

  async function refreshAuth() {
    const [t, u] = await Promise.all([getSessionToken(), getSessionUser()]);
    setToken(t);
    setUser(u);
    setSessionChecked(true);
    return { token: t, user: u };
  }

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const [rels, pending] = await Promise.all([
        apiFetch<RelationshipsMineResponse>('/relationships/mine'),
        apiFetch<PendingInvitesResponse>('/relationships/invites/pending'),
      ]);

      if ('ok' in rels && rels.ok) {
        setRelationships(Array.isArray(rels.relationships) ? rels.relationships : []);
      } else {
        setRelationships([]);
        setError((rels as any)?.error ?? 'Failed to load relationships');
      }

      if ('ok' in pending && pending.ok) {
        setInvites(Array.isArray(pending.invites) ? pending.invites : []);
      } else {
        setInvites([]);
        setError((prev) => prev ?? ((pending as any)?.error ?? 'Failed to load invites'));
      }
    } catch (e: unknown) {
      setRelationships([]);
      setInvites([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const refreshAndLoad = useCallback(() => {
    void (async () => {
      const { token: t } = await refreshAuth();
      if (t) {
        await loadAll();
      } else {
        setRelationships([]);
        setInvites([]);
      }
    })();
  }, []);

  useEffect(() => {
    refreshAndLoad();
  }, [refreshAndLoad]);

  useFocusEffect(
    useCallback(() => {
      refreshAndLoad();
    }, [refreshAndLoad])
  );

  if (!sessionChecked) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!token) {
    return <SignInScreen onSignedIn={() => void refreshAuth()} />;
  }

  async function acceptInvite(code: string) {
    setAcceptingCode(code);
    setError(null);

    try {
      await apiFetch<JoinOk>('/relationships/join', {
        method: 'POST',
        json: { code },
      });

      // Reload both: invite disappears + relationship membership may have changed.
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAcceptingCode(null);
    }
  }

  async function leaveRelationship(relationshipId: string) {
    setLeavingRelationshipId(relationshipId);
    setError(null);

    try {
      await apiFetch<{ ok: true }>(`/relationships/${relationshipId}/leave`, {
        method: 'POST',
      });

      // Reload: membership + members list will change.
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLeavingRelationshipId(null);
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.paper}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Datebook</Text>
          <Text style={styles.title}>Relationships</Text>
          <Text style={styles.subtitle}>Signed in as: {user ? `${user.email}` : '(unknown user)'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Overview</Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => void loadAll()}
            disabled={loading}
            style={({ pressed }) => [
              styles.button,
              styles.primaryButton,
              (pressed || loading) && styles.buttonPressed,
              loading && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.buttonText}>{loading ? 'Refreshing…' : 'Refresh'}</Text>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pending invites</Text>
          {invites.length === 0 ? (
            <Text style={styles.muted}>No pending invites.</Text>
          ) : (
            <View style={{ gap: 12 }}>
              {invites.map((i) => (
                <View key={i.code} style={styles.card}>
                  <Text style={styles.cardTitle}>Invite</Text>

                  <Text style={styles.muted}>Invite code</Text>
                  <Text selectable style={styles.code}>
                    {i.code}
                  </Text>

                  <Text style={styles.muted}>Relationship</Text>
                  <Text selectable style={styles.value}>
                    {i.relationshipId}
                  </Text>

                  <Text style={styles.muted}>Expires</Text>
                  <Text style={styles.value}>{new Date(i.expiresAt).toLocaleString()}</Text>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void acceptInvite(i.code)}
                    disabled={acceptingCode === i.code}
                    style={({ pressed }) => [
                      styles.button,
                      styles.primaryButton,
                      (pressed || acceptingCode === i.code) && styles.buttonPressed,
                      acceptingCode === i.code && styles.buttonDisabled,
                    ]}
                  >
                    <Text style={styles.buttonText}>{acceptingCode === i.code ? 'Accepting…' : 'Accept'}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your relationships</Text>
          {relationships.length === 0 ? (
            <Text style={styles.muted}>No active relationships.</Text>
          ) : (
            <View style={{ gap: 12 }}>
              {relationships.map((r) => (
                <View key={r.relationshipId} style={styles.card}>
                  <Text style={styles.cardTitle}>Relationship</Text>

                  <Text style={styles.muted}>Relationship</Text>
                  <Text selectable style={styles.code}>
                    {r.relationshipId}
                  </Text>

                  <Text style={styles.muted}>You</Text>
                  <Text style={styles.value}>
                    {r.myMembership ? `${r.myMembership.role} (${r.myMembership.status})` : '(unknown)'}
                  </Text>

                  {r.createdAt ? (
                    <>
                      <Text style={styles.muted}>Created</Text>
                      <Text style={styles.value}>{new Date(r.createdAt).toLocaleString()}</Text>
                    </>
                  ) : null}

                  <Text style={[styles.muted, { marginTop: 10 }]}>Members</Text>
                  {r.members.length === 0 ? (
                    <Text style={styles.muted}>(none)</Text>
                  ) : (
                    <View style={{ gap: 6 }}>
                      {r.members.map((m) => (
                        <Text key={`${r.relationshipId}:${m.userId}`} style={styles.value}>
                          {m.email} — {m.role} ({m.status})
                        </Text>
                      ))}
                    </View>
                  )}

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setConfirmLeaveRelationshipId(r.relationshipId)}
                    disabled={leavingRelationshipId === r.relationshipId}
                    style={({ pressed }) => [
                      styles.button,
                      styles.destructiveButton,
                      (pressed || leavingRelationshipId === r.relationshipId) && styles.buttonPressed,
                      leavingRelationshipId === r.relationshipId && styles.buttonDisabled,
                    ]}
                  >
                    <Text style={styles.destructiveButtonText}>
                      {leavingRelationshipId === r.relationshipId ? 'Leaving…' : 'Leave relationship'}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      <Modal
        transparent
        animationType="fade"
        visible={confirmLeaveRelationshipId !== null}
        onRequestClose={() => setConfirmLeaveRelationshipId(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Leave relationship?</Text>
            <Text style={styles.modalBody}>
              This will remove you from the members list. To rejoin later, you will need to be reinvited.
            </Text>

            <View style={styles.modalButtonsRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirmLeaveRelationshipId(null)}
                disabled={confirmLeaveRelationshipId !== null && leavingRelationshipId === confirmLeaveRelationshipId}
                style={({ pressed }) => [styles.modalButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const relId = confirmLeaveRelationshipId;
                  if (!relId) return;

                  void (async () => {
                    await leaveRelationship(relId);
                    setConfirmLeaveRelationshipId(null);
                  })();
                }}
                disabled={
                  confirmLeaveRelationshipId !== null && leavingRelationshipId === confirmLeaveRelationshipId
                }
                style={({ pressed }) => [
                  styles.modalButtonDestructive,
                  pressed && styles.buttonPressed,
                  confirmLeaveRelationshipId !== null &&
                    leavingRelationshipId === confirmLeaveRelationshipId &&
                    styles.buttonDisabled,
                ]}
              >
                <Text style={styles.modalButtonDestructiveText}>
                  {confirmLeaveRelationshipId !== null && leavingRelationshipId === confirmLeaveRelationshipId
                    ? 'Leaving…'
                    : 'Leave'}
                </Text>
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
    borderColor: 'rgba(46,42,39,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    gap: 12,
  },
  header: {
    marginBottom: 2,
  },
  kicker: {
    color: PaperColors.ink,
    opacity: 0.65,
    letterSpacing: 1.2,
    fontSize: 12,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    color: PaperColors.ink,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  subtitle: {
    color: PaperColors.ink,
    opacity: 0.7,
    fontSize: 14,
    lineHeight: 20,
  },
  muted: {
    color: PaperColors.ink,
    opacity: 0.65,
  },
  value: {
    color: PaperColors.ink,
    opacity: 0.9,
  },
  code: {
    fontFamily: 'monospace',
    paddingVertical: 6,
    color: PaperColors.ink,
  },
  card: {
    backgroundColor: PaperColors.white,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: PaperColors.border,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    gap: 6,
  },
  cardTitle: {
    color: PaperColors.ink,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: PaperColors.ink,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PaperColors.borderStrong,
  },
  primaryButton: {
    backgroundColor: PaperColors.sage,
  },
  buttonPressed: {
    transform: [{ translateY: 1 }],
    opacity: 0.95,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontWeight: '700',
    color: PaperColors.ink,
  },
  destructiveButton: {
    borderColor: 'rgba(180, 40, 40, 0.55)',
    backgroundColor: 'rgba(180, 40, 40, 0.08)',
    marginTop: 12,
  },
  destructiveButtonText: {
    fontWeight: '800',
    color: PaperColors.error,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 14,
    backgroundColor: PaperColors.paper,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(46,42,39,0.10)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: PaperColors.ink,
  },
  modalBody: {
    color: PaperColors.ink,
    opacity: 0.85,
    lineHeight: 20,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PaperColors.borderStrong,
    backgroundColor: PaperColors.white,
  },
  modalButtonText: {
    fontWeight: '700',
    color: PaperColors.ink,
  },
  modalButtonDestructive: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(180, 40, 40, 0.55)',
    backgroundColor: 'rgba(180, 40, 40, 0.08)',
  },
  modalButtonDestructiveText: {
    fontWeight: '800',
    color: PaperColors.error,
  },
  error: {
    color: PaperColors.error,
  },
});
