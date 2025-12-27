import { Image } from 'expo-image';
import { ActivityIndicator, Button, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Link } from 'expo-router';
import { createUser, getApiBaseUrl, getHealth, type HealthResponse } from '@/lib/datebook-api';
import { SignInScreen } from '@/components/auth/SignInScreen';
import { getSessionToken, getSessionUser, type SessionUser } from '@/auth/tokenStore';
import { signOut } from '@/auth/authService';
import { apiFetch } from '@/api/client';

function HomeAuthed({ user, onSignOut }: { user: SessionUser | null; onSignOut: () => void }) {
  const apiBaseUrl = useMemo(() => {
    try {
      return getApiBaseUrl();
    } catch {
      return null;
    }
  }, []);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [email, setEmail] = useState('test@example.com');
  const [output, setOutput] = useState<string>('');
  const [devUsersOutput, setDevUsersOutput] = useState<string>('');

  async function refreshHealth() {
    setLoadingHealth(true);
    setHealthError(null);

    try {
      const data = await getHealth();
      setHealth(data);
    } catch (err) {
      setHealth(null);
      setHealthError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingHealth(false);
    }
  }

  useEffect(() => {
    void refreshHealth();
  }, []);

  async function fetchDevUsers() {
    try {
      setDevUsersOutput('Working...');
      const res = await apiFetch<{ users: { id: string; email: string }[] }>('/dev/users');
      setDevUsersOutput(JSON.stringify(res, null, 2));
    } catch (e: any) {
      setDevUsersOutput(`Error: ${e?.message ?? String(e)}`);
    }
  }

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.reactLogo}
        />
      }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Welcome!</ThemedText>
        <HelloWave />
      </ThemedView>

      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Session</ThemedText>
        <ThemedText>
          Signed in as:{' '}
          <ThemedText type="defaultSemiBold">
            {user ? `${user.email} (${user.id})` : '(unknown user)'}
          </ThemedText>
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          onPress={onSignOut}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <ThemedText type="defaultSemiBold">Sign out</ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Dev API</ThemedText>
        <Pressable
          accessibilityRole="button"
          onPress={fetchDevUsers}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <ThemedText type="defaultSemiBold">GET /dev/users</ThemedText>
        </Pressable>
        <ThemedText selectable style={{ fontFamily: 'monospace' }}>
          {devUsersOutput}
        </ThemedText>
      </ThemedView>

      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: '600' }}>Create User</Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
        />

        <Button
          title="POST /users"
          onPress={async () => {
            try {
              setOutput('Working...');
              const res = await createUser(email);
              setOutput(JSON.stringify(res, null, 2));
            } catch (e: any) {
              setOutput(`Error: ${e.message}`);
            }
          }}
        />

        <Text selectable style={{ marginTop: 12, fontFamily: 'monospace' }}>
          {output}
        </Text>
      </View>

      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">API Health</ThemedText>
        <ThemedText>
          Base URL:{' '}
          <ThemedText type="defaultSemiBold">{apiBaseUrl ?? '(not configured)'}</ThemedText>
        </ThemedText>

        <Pressable
          accessibilityRole="button"
          onPress={refreshHealth}
          disabled={loadingHealth}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, loadingHealth && styles.buttonDisabled]}>
          <ThemedText type="defaultSemiBold">{loadingHealth ? 'Checking…' : 'Refresh health'}</ThemedText>
        </Pressable>

        {health ? (
          <ThemedText>
            Result:{' '}
            <ThemedText type="defaultSemiBold">
              {health.ok
                ? `OK (dbTime=${health.dbTime ?? 'n/a'}, latencyMs=${health.latencyMs})`
                : `NOT OK (${health.error}, latencyMs=${health.latencyMs})`}
            </ThemedText>
          </ThemedText>
        ) : null}

        {healthError ? (
          <ThemedText>
            Error: <ThemedText type="defaultSemiBold">{healthError}</ThemedText>
          </ThemedText>
        ) : null}
      </ThemedView>

      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Step 1: Try it</ThemedText>
        <ThemedText>
          Edit <ThemedText type="defaultSemiBold">app/(tabs)/index.tsx</ThemedText> to see changes.
          Press{' '}
          <ThemedText type="defaultSemiBold">
            {Platform.select({
              ios: 'cmd + d',
              android: 'cmd + m',
              web: 'F12',
            })}
          </ThemedText>{' '}
          to open developer tools.
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.stepContainer}>
        <Link href="/modal">
          <Link.Trigger>
            <ThemedText type="subtitle">Step 2: Explore</ThemedText>
          </Link.Trigger>
          <Link.Preview />
          <Link.Menu>
            <Link.MenuAction title="Action" icon="cube" onPress={() => alert('Action pressed')} />
            <Link.MenuAction
              title="Share"
              icon="square.and.arrow.up"
              onPress={() => alert('Share pressed')}
            />
            <Link.Menu title="More" icon="ellipsis">
              <Link.MenuAction
                title="Delete"
                icon="trash"
                destructive
                onPress={() => alert('Delete pressed')}
              />
            </Link.Menu>
          </Link.Menu>
        </Link>

        <ThemedText>
          {`Tap the Explore tab to learn more about what's included in this starter app.`}
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Step 3: Get a fresh start</ThemedText>
        <ThemedText>
          {`When you're ready, run `}
          <ThemedText type="defaultSemiBold">npm run reset-project</ThemedText> to get a fresh{' '}
          <ThemedText type="defaultSemiBold">app</ThemedText> directory. This will move the current{' '}
          <ThemedText type="defaultSemiBold">app</ThemedText> to{' '}
          <ThemedText type="defaultSemiBold">app-example</ThemedText>.
        </ThemedText>
      </ThemedView>
    </ParallaxScrollView>
  );
}

export default function HomeScreen() {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);

  async function refreshSession() {
    const [t, u] = await Promise.all([getSessionToken(), getSessionUser()]);
    setToken(t);
    setUser(u);
    setSessionChecked(true);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [t, u] = await Promise.all([getSessionToken(), getSessionUser()]);
        if (!cancelled) {
          setToken(t);
          setUser(u);
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
    <HomeAuthed
      user={user}
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
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(127,127,127,0.35)',
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
});
