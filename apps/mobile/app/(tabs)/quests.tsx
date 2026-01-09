import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { apiFetch } from '@/api/client';
import { listQuests, type Quest } from '@/api/quests';
import { getSessionToken, getSessionUser, type SessionUser } from '@/auth/tokenStore';
import { SignInScreen } from '@/components/auth/SignInScreen';
import { PaperColors } from '@/constants/paper';

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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function formatIsoDateOnly(value: string): string {
  // value expected: YYYY-MM-DD
  const d = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return value;
  return d.toLocaleDateString();
}

function QuestCard({ cadenceLabel, quest }: { cadenceLabel: string; quest: Quest }) {
  const progressRatio = clamp01(quest.target > 0 ? quest.progress / quest.target : 0);
  const done = quest.completed;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>{cadenceLabel}</Text>
        <Text style={[styles.badge, done ? styles.badgeDone : styles.badgeInProgress]}>
          {done ? 'Completed' : 'In progress'}
        </Text>
      </View>

      <Text style={styles.questTitle}>{quest.title}</Text>

      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progressRatio * 100)}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {quest.progress}/{quest.target}
        </Text>
      </View>

      <Text style={styles.muted}>Ends: {formatIsoDateOnly(quest.periodEnd)} (UTC)</Text>
    </View>
  );
}

export default function QuestsTab() {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);

  const [relationshipStatus, setRelationshipStatus] = useState<RelationshipStatus>('none');
  const [relationshipId, setRelationshipId] = useState<string | null>(null);

  const [weekly, setWeekly] = useState<Quest | null>(null);
  const [monthly, setMonthly] = useState<Quest | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const canShowQuests = signedIn && relationshipStatus === 'active' && typeof relationshipId === 'string';

  const load = useCallback(async () => {
    if (!canShowQuests || !relationshipId) {
      setWeekly(null);
      setMonthly(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await listQuests({ relationshipId });
      setWeekly(res.weekly);
      setMonthly(res.monthly);
    } catch (e: unknown) {
      setWeekly(null);
      setMonthly(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [canShowQuests, relationshipId]);

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void refreshSession().then(() => load());
    }, [load])
  );

  const emptyState = useMemo(() => {
    if (loading) return 'Loading…';
    if (error) return 'Could not load quests.';
    return 'No quests to show.';
  }, [error, loading]);

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
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.paper}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>Datebook</Text>
            <Text style={styles.title}>Quests</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => void load()}
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

        {user?.email ? <Text style={styles.subtitle}>Signed in as: {user.email}</Text> : null}

        <Text style={styles.muted}>
          Shared quests are gentle nudges: no reminders, no streaks, no penalties.
        </Text>

        {relationshipStatus !== 'active' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Link your partner first</Text>
            <Text style={styles.muted}>
              Quests are relationship-scoped. Create or join a relationship in the Timeline tab.
            </Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>Error: {error}</Text> : null}

        {canShowQuests && weekly && monthly ? (
          <View style={{ gap: 12 }}>
            <QuestCard cadenceLabel="Weekly" quest={weekly} />
            <QuestCard cadenceLabel="Monthly" quest={monthly} />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.body}>{emptyState}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PaperColors.sand,
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  kicker: {
    color: PaperColors.ink,
    opacity: 0.65,
    letterSpacing: 1.2,
    fontSize: 12,
    textTransform: 'uppercase',
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
    lineHeight: 20,
  },
  body: {
    color: PaperColors.ink,
    opacity: 0.82,
    lineHeight: 20,
  },
  error: {
    color: PaperColors.error,
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
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitle: {
    color: PaperColors.ink,
    fontWeight: '800',
    fontSize: 16,
  },
  questTitle: {
    color: PaperColors.ink,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(46,42,39,0.10)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 10,
    borderRadius: 999,
    backgroundColor: PaperColors.sage,
  },
  progressText: {
    color: PaperColors.ink,
    opacity: 0.8,
    fontWeight: '700',
    minWidth: 52,
    textAlign: 'right',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
  },
  badgeInProgress: {
    backgroundColor: PaperColors.lavender,
    borderColor: PaperColors.borderStrong,
    color: PaperColors.ink,
  },
  badgeDone: {
    backgroundColor: PaperColors.sage,
    borderColor: PaperColors.borderStrong,
    color: PaperColors.ink,
  },
  smallButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PaperColors.borderStrong,
    backgroundColor: PaperColors.paper,
  },
  smallButtonPressed: {
    transform: [{ translateY: 1 }],
    opacity: 0.95,
  },
  smallButtonText: {
    color: PaperColors.ink,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
