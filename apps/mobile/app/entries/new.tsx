import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { createRelationshipEntry } from '@/api/entries';
import { PaperColors } from '@/constants/paper';

function formatDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function CreateEntryScreen() {
  const params = useLocalSearchParams<{ relationshipId?: string | string[] }>();
  const relationshipId = useMemo(() => {
    const raw = params.relationshipId;
    const v = Array.isArray(raw) ? raw[0] : raw;
    return typeof v === 'string' ? v : null;
  }, [params.relationshipId]);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => formatDateYmd(new Date()));
  const [body, setBody] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = Boolean(relationshipId) && title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date.trim());

  async function submit() {
    if (!relationshipId) {
      setError('Missing relationshipId. Go back to Timeline and try again.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const entry = await createRelationshipEntry({
        relationshipId,
        title: title.trim(),
        date: date.trim(),
        body,
      });

      router.replace({ pathname: '/entries/[id]', params: { id: entry.id } });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!relationshipId) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'New entry' }} />
        <Text style={styles.error}>Missing relationshipId.</Text>
        <Text style={styles.muted}>Return to Timeline and try again.</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: 'New memory' }} />

      <View style={styles.paper}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Datebook</Text>
          <Text style={styles.title}>Add a memory</Text>
          <Text style={styles.subtitle}>Title + date, and optional notes.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="We went to the museum"
            placeholderTextColor={'rgba(46,42,39,0.45)'}
            style={styles.input}
            editable={!busy}
          />

          <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="2025-12-29"
            placeholderTextColor={'rgba(46,42,39,0.45)'}
            style={styles.input}
            editable={!busy}
          />

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="What do you want to remember?"
            placeholderTextColor={'rgba(46,42,39,0.45)'}
            style={[styles.input, styles.textArea]}
            editable={!busy}
            multiline
          />

          <Pressable
            accessibilityRole="button"
            onPress={() => void submit()}
            disabled={!canSubmit || busy}
            style={({ pressed }) => [
              styles.button,
              styles.primaryButton,
              (pressed || busy) && styles.buttonPressed,
              (!canSubmit || busy) && styles.buttonDisabled,
            ]}
          >
            {busy ? <ActivityIndicator /> : null}
            <Text style={styles.buttonText}>{busy ? 'Saving…' : 'Save memory'}</Text>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}
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
    padding: 18,
    backgroundColor: PaperColors.sand,
    gap: 8,
  },
  page: {
    flex: 1,
    backgroundColor: PaperColors.sand,
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
  label: {
    color: PaperColors.ink,
    opacity: 0.75,
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
  textArea: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  button: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
    fontWeight: '800',
    color: PaperColors.ink,
  },
  muted: {
    color: PaperColors.ink,
    opacity: 0.65,
  },
  error: {
    color: PaperColors.error,
  },
});
