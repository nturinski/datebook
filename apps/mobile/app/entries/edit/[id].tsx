import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { getEntryById, updateEntry, type TimelineEntry } from '@/api/entries';
import { PaperColors } from '@/constants/paper';

function dateOnlyFromIso(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function EditEntryScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = useMemo(() => {
    const raw = params.id;
    const v = Array.isArray(raw) ? raw[0] : raw;
    return typeof v === 'string' ? v : null;
  }, [params.id]);

  const [entry, setEntry] = useState<TimelineEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (!id) return;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const e = await getEntryById(id);
        setEntry(e);
        setTitle(e.title ?? '');
        setDate(dateOnlyFromIso(e.occurredAt));
        setBody(e.body ?? '');
      } catch (e: unknown) {
        setEntry(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const canSubmit = Boolean(id) && title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date.trim());

  async function submit() {
    if (!id) return;

    setBusy(true);
    setError(null);

    try {
      const updated = await updateEntry({
        id,
        title: title.trim(),
        date: date.trim(),
        body: body.trim().length === 0 ? null : body,
      });

      router.replace({ pathname: '/entries/[id]', params: { id: updated.id } });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!id) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Edit' }} />
        <Text style={styles.error}>Missing entry id.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Edit' }} />
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <Stack.Screen options={{ title: 'Edit memory' }} />

      <View style={styles.paper}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Datebook</Text>
          <Text style={styles.title}>Edit memory</Text>
          {entry ? <Text style={styles.subtitle}>ID: {entry.id}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
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

          <Text style={styles.label}>Notes</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="(optional)"
            placeholderTextColor={'rgba(46,42,39,0.45)'}
            style={[styles.input, styles.textArea]}
            editable={!busy}
            multiline
          />

          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
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
              <Text style={styles.buttonText}>{busy ? 'Saving…' : 'Save'}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              disabled={busy}
              style={({ pressed }) => [
                styles.button,
                styles.secondaryButton,
                pressed && styles.buttonPressed,
                busy && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
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
    opacity: 0.65,
    fontSize: 12,
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
    minHeight: 130,
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
    fontWeight: '800',
    color: PaperColors.ink,
  },
  error: {
    color: PaperColors.error,
  },
});
