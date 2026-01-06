import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { listScrapbooks, type ScrapbookSummary } from '@/api/scrapbooks';
import { getSessionToken, getSessionUser, type SessionUser } from '@/auth/tokenStore';
import { SignInScreen } from '@/components/auth/SignInScreen';
import { PaperColors } from '@/constants/paper';

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export default function ScrapbooksTab() {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrapbooks, setScrapbooks] = useState<ScrapbookSummary[]>([]);

  async function refreshSession() {
    const [t, u] = await Promise.all([getSessionToken(), getSessionUser()]);
    setToken(t);
    setUser(u);
    setSessionChecked(true);
  }

  useEffect(() => {
    void refreshSession();
  }, []);

  const signedIn = Boolean(token);

  const load = useCallback(async () => {
    if (!signedIn) return;
    setLoading(true);
    setError(null);
    try {
      const items = await listScrapbooks();
      setScrapbooks(items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [signedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const emptyText = useMemo(() => {
    if (loading) return 'Loading…';
    if (error) return 'Could not load scrapbooks.';
    return 'No scrapbooks yet.';
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
    <View style={styles.page}>
      <FlatList
        data={scrapbooks}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.pageContent}
        ListHeaderComponent={
          <View style={styles.paper}>
            <View style={styles.header}>
              <Text style={styles.kicker}>Datebook</Text>
              <Text style={styles.title}>Scrapbooks</Text>
              <Text style={styles.subtitle}>A library of relationship-scoped scrapbooks.</Text>
              {user?.email ? <Text style={styles.muted}>Signed in as: {user.email}</Text> : null}
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/scrapbooks/new')}
              style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.buttonText}>+ New Scrapbook</Text>
            </Pressable>

            {error ? (
              <View style={styles.card}>
                <Text style={styles.error}>Error: {error}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void load()}
                  style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.buttonText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={[styles.paper, { marginTop: 12 }]}>
            <View style={styles.card}>
              <Text style={styles.body}>{emptyText}</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Link href={{ pathname: '/scrapbooks/[id]', params: { id: item.id } }} asChild>
            <Pressable style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]} accessibilityRole="button">
              <View style={styles.thumbWrap}>
                {item.cover?.url ? (
                  <Image source={{ uri: item.cover.url }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={styles.thumbPlaceholder}>
                    <Text style={styles.thumbPlaceholderText}>SB</Text>
                  </View>
                )}
              </View>

              <Text numberOfLines={2} style={styles.tileTitle}>
                {item.title}
              </Text>
              <Text numberOfLines={1} style={styles.tileMeta}>
                Rel: {shortId(item.relationshipId)}
              </Text>
            </Pressable>
          </Link>
        )}
      />
    </View>
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
    gap: 12,
  },
  gridRow: {
    gap: 12,
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
  body: {
    color: PaperColors.ink,
    opacity: 0.82,
    lineHeight: 20,
  },
  error: {
    color: PaperColors.error,
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
  buttonText: {
    fontWeight: '700',
    color: PaperColors.ink,
  },
  tile: {
    flex: 1,
    borderWidth: 1,
    borderColor: PaperColors.border,
    backgroundColor: PaperColors.paper,
    borderRadius: 18,
    padding: 12,
    gap: 8,
    minWidth: 0,
  },
  tilePressed: {
    opacity: 0.95,
    transform: [{ translateY: 1 }],
  },
  thumbWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: PaperColors.border,
    backgroundColor: PaperColors.white,
    aspectRatio: 1,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PaperColors.sand,
  },
  thumbPlaceholderText: {
    color: PaperColors.ink,
    opacity: 0.6,
    fontWeight: '800',
    letterSpacing: 1,
  },
  tileTitle: {
    color: PaperColors.ink,
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 18,
  },
  tileMeta: {
    color: PaperColors.ink,
    opacity: 0.65,
    fontSize: 12,
  },
});
