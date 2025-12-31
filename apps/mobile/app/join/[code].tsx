import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { apiFetch } from '@/api/client';
import { SignInScreen } from '@/components/auth/SignInScreen';
import { getSessionToken } from '@/auth/tokenStore';
import { PaperColors } from '@/constants/paper';

type JoinOk = {
  ok: true;
  relationshipId: string;
  membership: { role: string; status: string };
};

export default function JoinByCodeScreen() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const code = useMemo(() => {
    const raw = params.code;
    const c = Array.isArray(raw) ? raw[0] : raw;
    return typeof c === 'string' ? c.trim() : '';
  }, [params.code]);

  const [sessionChecked, setSessionChecked] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function refreshAuth() {
    const t = await getSessionToken();
    setToken(t);
    setSessionChecked(true);
  }

  useEffect(() => {
    void refreshAuth();
  }, []);

  async function accept() {
    if (!code) return;

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiFetch<JoinOk>('/relationships/join', {
        method: 'POST',
        json: { code },
      });

      setSuccess(`Joined relationship ${res.relationshipId}`);
      // Send them home; Home will show relationship state on refresh.
      router.replace('/');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // If the link is malformed, send them to manual entry.
  if (sessionChecked && !code) {
    return (
      <View style={styles.page}>
        <View style={styles.paper}>
          <View style={styles.header}>
            <Text style={styles.kicker}>Datebook</Text>
            <Text style={styles.title}>Invalid invite link</Text>
            <Text style={styles.subtitle}>This link doesn’t include an invite code.</Text>
          </View>

          <View style={styles.card}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/join/index')}
              style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.buttonText}>Enter a code manually</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (!sessionChecked) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!token) {
    return (
      <SignInScreen
        onSignedIn={() => {
          // After sign-in, we should have a token, then we can accept.
          void (async () => {
            await refreshAuth();
          })();
        }}
      />
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.paper}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Datebook</Text>
          <Text style={styles.title}>Accept invite</Text>
          <Text style={styles.subtitle}>Invite code:</Text>
          <Text selectable style={styles.code}>
            {code || '(missing)'}
          </Text>
        </View>

        <View style={styles.card}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void accept()}
            disabled={busy || !code}
            style={({ pressed }) => [
              styles.button,
              styles.primaryButton,
              (pressed || busy) && styles.buttonPressed,
              (busy || !code) && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.buttonText}>{busy ? 'Joining…' : 'Accept'}</Text>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {success ? <Text style={styles.success}>{success}</Text> : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/join/index')}
            style={({ pressed }) => [styles.linkButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.linkText}>Enter a different code</Text>
          </Pressable>
        </View>
      </View>
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
    padding: 18,
    backgroundColor: PaperColors.sand,
    gap: 12,
    justifyContent: 'center',
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
    gap: 14,
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
  code: {
    fontFamily: 'monospace',
    paddingVertical: 8,
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
  linkButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  linkText: {
    textDecorationLine: 'underline',
    opacity: 0.8,
    color: PaperColors.ink,
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
  error: {
    color: PaperColors.error,
  },
  success: {
    color: PaperColors.success,
  },
});
