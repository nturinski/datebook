import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { apiFetch } from '@/api/client';
import { SignInScreen } from '@/components/auth/SignInScreen';
import { getSessionToken } from '@/auth/tokenStore';
import { PaperColors } from '@/constants/paper';

type JoinOk = {
  ok: true;
  relationshipId: string;
  membership: { role: string; status: string };
};

export default function JoinIndexScreen() {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const normalizedCode = useMemo(() => code.trim(), [code]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function refreshAuth() {
    const t = await getSessionToken();
    setToken(t);
    setSessionChecked(true);
  }

  if (!sessionChecked) {
    // Lazy check: only when screen renders.
    void refreshAuth();
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
          void refreshAuth();
        }}
      />
    );
  }

  async function accept() {
    const c = normalizedCode;
    if (!c) return;

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiFetch<JoinOk>('/relationships/join', {
        method: 'POST',
        json: { code: c },
      });

      setSuccess(`Joined relationship ${res.relationshipId}`);

      // Take them back to Home; Home will refresh /me on mount.
      router.replace('/');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.paper}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Datebook</Text>
          <Text style={styles.title}>Join a relationship</Text>
          <Text style={styles.subtitle}>Paste the invite code you received.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Invite code</Text>

          <TextInput
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Invite code"
            placeholderTextColor={'rgba(46,42,39,0.45)'}
            style={styles.input}
            editable={!busy}
          />

          <Pressable
            accessibilityRole="button"
            onPress={() => void accept()}
            disabled={busy || !normalizedCode}
            style={({ pressed }) => [
              styles.button,
              styles.primaryButton,
              (pressed || busy) && styles.buttonPressed,
              (busy || !normalizedCode) && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.buttonText}>{busy ? 'Joining…' : 'Accept invite'}</Text>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {success ? <Text style={styles.success}>{success}</Text> : null}

          <Text style={styles.finePrint}>
            If the code says “already redeemed” or “expired”, ask the other person to generate a new invite.
          </Text>
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
    backgroundColor: PaperColors.sand,
    padding: 18,
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
  input: {
    borderWidth: 1,
    borderColor: PaperColors.borderStrong,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: PaperColors.paper,
    color: PaperColors.ink,
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
  error: {
    color: PaperColors.error,
  },
  success: {
    color: PaperColors.success,
  },
  finePrint: {
    marginTop: 10,
    color: PaperColors.ink,
    opacity: 0.6,
    fontSize: 12,
    lineHeight: 16,
  },
});
