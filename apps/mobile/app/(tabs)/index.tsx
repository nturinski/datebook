import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { HelloWave } from '@/components/hello-wave';
import { Link, router } from 'expo-router';
import { SignInScreen } from '@/components/auth/SignInScreen';
import { getSessionToken, getSessionUser, type SessionUser } from '@/auth/tokenStore';
import { signOut } from '@/auth/authService';
import { apiFetch } from '@/api/client';
import { PaperColors } from '@/constants/paper';
import { listRelationshipEntries, type TimelineEntry } from '@/api/entries';

type RelationshipStatus = 'none' | 'pending' | 'active';

type MeResponse = {
  ok: true;
  user: { id: string; email: string };
  memberships?: { relationshipId: string; role: string; memberStatus: string; status: string }[];
  relationships?: { relationshipId: string; role: string; memberStatus: string; status: string }[];
  pendingInviteCount?: number;
  relationship:
    | { status: 'none' }
    | {
        status: Exclude<RelationshipStatus, 'none'>;
        relationshipId: string;
        role: string;
        memberStatus: string;
      };
};

function TimelineAuthed({
  user,
  relationshipStatus,
  relationshipId,
  onSignOut,
  onRefreshSession,
}: {
  user: SessionUser | null;
  relationshipStatus: RelationshipStatus;
  relationshipId: string | null;
  onSignOut: () => void;
  onRefreshSession: () => void;
}) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [creatingRelationship, setCreatingRelationship] = useState(false);
  const [inviteOutput, setInviteOutput] = useState<string>('');
  const [generatingInvite, setGeneratingInvite] = useState(false);

  async function createRelationship() {
    setCreatingRelationship(true);
    setError(null);
    try {
      await apiFetch('/relationships', { method: 'POST' });
      await onRefreshSession();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingRelationship(false);
    }
  }

  async function generateInvite() {
    if (!relationshipId) return;
    setGeneratingInvite(true);
    setError(null);
    setInviteOutput('');

    try {
      const res = await apiFetch<{ ok: true; code: string; link?: string; expiresAt: string }>('/relationships/invite', {
        method: 'POST',
        json: { relationshipId },
      });

      const deepLink = `datebook://join/${res.code}`;
      const lines = [
        'Invite code',
        res.code,
        '',
        `app link: ${deepLink}`,
        ...(res.link ? [`link: ${res.link}`] : []),
        `expiresAt: ${res.expiresAt}`,
        '',
        'Share this code/link with your partner. They can use the Join screen to enter the code.',
      ];
      setInviteOutput(lines.join('\n'));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGeneratingInvite(false);
    }
  }

  const canShowTimeline = relationshipStatus === 'active' && typeof relationshipId === 'string';

  const loadFirstPage = useCallback(() => {
    if (!canShowTimeline) {
      setEntries([]);
      setNextCursor(null);
      return;
    }

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await listRelationshipEntries({ relationshipId, limit: 50 });
        setEntries(res.entries);
        setNextCursor(res.nextCursor);
      } catch (e: unknown) {
        setEntries([]);
        setNextCursor(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [canShowTimeline, relationshipId]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  useFocusEffect(
    useCallback(() => {
      loadFirstPage();
    }, [loadFirstPage])
  );

  async function loadMore() {
    if (!canShowTimeline) return;
    if (!nextCursor) return;
    if (loadingMore) return;

    setLoadingMore(true);
    setError(null);
    try {
      const res = await listRelationshipEntries({ relationshipId, limit: 50, cursor: nextCursor });
      setEntries((prev) => [...prev, ...res.entries]);
      setNextCursor(res.nextCursor);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.paper}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Datebook</Text>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Timeline</Text>
            <HelloWave />
          </View>
          <Text style={styles.subtitle}>
            Signed in as: <Text style={styles.valueStrong}>{user ? user.email : '(unknown user)'}</Text>
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Session</Text>
          <Text style={styles.muted}>Relationship status: <Text style={styles.valueStrong}>{relationshipStatus}</Text></Text>

          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Pressable
              accessibilityRole="button"
              onPress={onSignOut}
              style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.buttonPressed]}>
              <Text style={styles.buttonText}>Sign out</Text>
            </Pressable>

            <Link href="/join/index" asChild>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.buttonPressed]}>
                <Text style={styles.buttonText}>Join with code</Text>
              </Pressable>
            </Link>

            <Link href="/(tabs)/relationships" asChild>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.buttonPressed]}>
                <Text style={styles.buttonText}>Relationships</Text>
              </Pressable>
            </Link>
          </View>
        </View>

        {relationshipStatus === 'none' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Link your partner</Text>
            <Text style={styles.body}>
              Create a relationship, generate an invite code, and share it with your partner.
            </Text>

            <View style={{ gap: 10 }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => void createRelationship()}
                disabled={creatingRelationship}
                style={({ pressed }) => [
                  styles.button,
                  styles.primaryButton,
                  (pressed || creatingRelationship) && styles.buttonPressed,
                  creatingRelationship && styles.buttonDisabled,
                ]}>
                <Text style={styles.buttonText}>{creatingRelationship ? 'Creating…' : 'Create relationship'}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {relationshipStatus === 'active' && relationshipId ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Invite partner</Text>
            <Text style={styles.muted}>Relationship</Text>
            <Text selectable style={styles.code}>{relationshipId}</Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => void generateInvite()}
              disabled={generatingInvite}
              style={({ pressed }) => [
                styles.button,
                styles.primaryButton,
                (pressed || generatingInvite) && styles.buttonPressed,
                generatingInvite && styles.buttonDisabled,
              ]}>
              <Text style={styles.buttonText}>{generatingInvite ? 'Generating…' : 'Generate invite code'}</Text>
            </Pressable>

            {inviteOutput ? (
              <View style={styles.monoBlock}>
                <Text selectable style={styles.monoText}>{inviteOutput}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {relationshipStatus === 'pending' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Waiting on partner</Text>
            <Text style={styles.body}>
              Your relationship is pending. Once both members are active, you’ll be able to add memories.
            </Text>
          </View>
        ) : null}

        {canShowTimeline ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Memories</Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/entries/new', params: { relationshipId } })}
              style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.buttonPressed]}>
              <Text style={styles.buttonText}>Add memory</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={loadFirstPage}
              disabled={loading}
              style={({ pressed }) => [
                styles.button,
                styles.secondaryButton,
                (pressed || loading) && styles.buttonPressed,
                loading && styles.buttonDisabled,
              ]}>
              <Text style={styles.buttonText}>{loading ? 'Refreshing…' : 'Refresh timeline'}</Text>
            </Pressable>

            {entries.length === 0 && !loading ? (
              <Text style={styles.muted}>No entries yet. Add your first memory.</Text>
            ) : null}

            <View style={{ gap: 10, marginTop: 6 }}>
              {entries.map((e) => {
                const occurred = new Date(e.occurredAt);
                const dateLabel = Number.isNaN(occurred.getTime()) ? e.occurredAt : occurred.toLocaleDateString();
                const preview = typeof e.body === 'string' && e.body.trim().length > 0 ? e.body.trim() : '';

                return (
                  <Pressable
                    key={e.id}
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/entries/[id]', params: { id: e.id } })}
                    style={({ pressed }) => [styles.entryRow, pressed && styles.entryRowPressed]}>
                    <Text style={styles.entryDate}>{dateLabel}</Text>
                    <Text style={styles.entryTitle}>{e.title}</Text>
                    {preview ? (
                      <Text numberOfLines={2} style={styles.entryPreview}>
                        {preview}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            {nextCursor ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void loadMore()}
                disabled={loadingMore}
                style={({ pressed }) => [
                  styles.button,
                  styles.secondaryButton,
                  (pressed || loadingMore) && styles.buttonPressed,
                  loadingMore && styles.buttonDisabled,
                  { marginTop: 12 },
                ]}>
                <Text style={styles.buttonText}>{loadingMore ? 'Loading…' : 'Load more'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {error ? (
          <View style={styles.card}>
            <Text style={styles.error}>Error: {error}</Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

export default function HomeScreen() {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [relationshipStatus, setRelationshipStatus] = useState<RelationshipStatus>('none');
  const [relationshipId, setRelationshipId] = useState<string | null>(null);

  async function refreshSession() {
    const [t, u] = await Promise.all([getSessionToken(), getSessionUser()]);
    setToken(t);
    setUser(u);

    // Boot endpoint: validate token + get server truth.
    if (t) {
      try {
        const me = await apiFetch<MeResponse>('/me');
        setUser(me.user);
        setRelationshipStatus(me.relationship.status);
        setRelationshipId(me.relationship.status === 'none' ? null : me.relationship.relationshipId);
      } catch {
        // Token invalid/expired -> clear local state and let SignInScreen show.
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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [t, u] = await Promise.all([getSessionToken(), getSessionUser()]);
        if (cancelled) return;

        setToken(t);
        setUser(u);

        if (t) {
          try {
            const me = await apiFetch<MeResponse>('/me');
            if (!cancelled) {
              setUser(me.user);
              setRelationshipStatus(me.relationship.status);
              setRelationshipId(me.relationship.status === 'none' ? null : me.relationship.relationshipId);
            }
          } catch {
            if (!cancelled) {
              setToken(null);
              setUser(null);
              setRelationshipStatus('none');
              setRelationshipId(null);
            }
          }
        }
      } finally {
        if (!cancelled) setSessionChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!sessionChecked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const signedIn = Boolean(token);

  if (!signedIn) {
    return <SignInScreen onSignedIn={() => void refreshSession()} />;
  }

  return (
    <TimelineAuthed
      user={user}
      relationshipStatus={relationshipStatus}
      relationshipId={relationshipId}
      onRefreshSession={() => void refreshSession()}
      onSignOut={() => {
        void (async () => {
          await signOut();
          await refreshSession();
        })();
      }}
    />
  );
}

const styles = StyleSheet.create({
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
    gap: 6,
  },
  kicker: {
    color: PaperColors.ink,
    opacity: 0.65,
    letterSpacing: 1.2,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  valueStrong: {
    color: PaperColors.ink,
    fontWeight: '700',
    opacity: 0.95,
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
    gap: 10,
  },
  cardTitle: {
    color: PaperColors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    color: PaperColors.ink,
    opacity: 0.82,
    lineHeight: 20,
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
  secondaryButton: {
    backgroundColor: PaperColors.lavender,
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
  monoBlock: {
    borderWidth: 1,
    borderColor: PaperColors.border,
    borderRadius: 14,
    backgroundColor: PaperColors.paper,
    padding: 12,
  },
  monoText: {
    fontFamily: 'monospace',
    color: PaperColors.ink,
    opacity: 0.9,
    fontSize: 12,
    lineHeight: 16,
  },
  error: {
    color: PaperColors.error,
  },
  entryRow: {
    borderWidth: 1,
    borderColor: PaperColors.border,
    backgroundColor: PaperColors.paper,
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  entryRowPressed: {
    opacity: 0.95,
    transform: [{ translateY: 1 }],
  },
  entryDate: {
    color: PaperColors.ink,
    opacity: 0.65,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  entryTitle: {
    color: PaperColors.ink,
    fontWeight: '800',
    fontSize: 16,
  },
  entryPreview: {
    color: PaperColors.ink,
    opacity: 0.75,
    lineHeight: 18,
  },
});
