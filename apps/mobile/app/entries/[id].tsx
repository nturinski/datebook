import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { getEntryById, type TimelineEntry } from '@/api/entries';
import { attachEntryMedia, requestMediaUploadUrl } from '@/api/media';
import { PaperColors } from '@/constants/paper';

function dateOnlyFromIso(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function EntryDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = useMemo(() => {
    const raw = params.id;
    const v = Array.isArray(raw) ? raw[0] : raw;
    return typeof v === 'string' ? v : null;
  }, [params.id]);

  const [entry, setEntry] = useState<TimelineEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const e = await getEntryById(id);
        setEntry(e);
      } catch (e: unknown) {
        setEntry(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function pickAndAttachPhoto() {
    if (!entry) return;
    if (!entry.relationshipId) {
      setUploadStatus('This entry is missing relationshipId; refresh and try again.');
      return;
    }
    if (uploading) return;

    setUploading(true);
    setUploadStatus(null);

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setUploadStatus('Photos permission not granted.');
        return;
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });

      if (picked.canceled) return;

      const asset = picked.assets?.[0];
      if (!asset?.uri) {
        setUploadStatus('No image selected.');
        return;
      }

      const width = typeof asset.width === 'number' ? asset.width : null;
      const height = typeof asset.height === 'number' ? asset.height : null;
      if (!width || !height) {
        setUploadStatus('Could not determine image size.');
        return;
      }

      const contentType = typeof asset.mimeType === 'string' ? asset.mimeType : undefined;

      const { uploadUrl, blobKey } = await requestMediaUploadUrl({
        relationshipId: entry.relationshipId,
        contentType,
      });

      // Upload to Azure Blob SAS URL.
      // NOTE: expo-file-system.uploadAsync is not available on web, so we use fetch there.
      if (Platform.OS === 'web') {
        const sourceRes = await fetch(asset.uri);
        if (!sourceRes.ok) {
          throw new Error(`Failed to read selected image (status ${sourceRes.status})`);
        }

        const blob = await sourceRes.blob();
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'x-ms-blob-type': 'BlockBlob',
            ...(contentType ? { 'Content-Type': contentType } : {}),
          },
          body: blob,
        });

        if (!putRes.ok) {
          const text = await putRes.text().catch(() => '');
          throw new Error(`Upload failed (status ${putRes.status})${text ? `: ${text}` : ''}`);
        }
      } else {
        const uploadRes = await FileSystem.uploadAsync(uploadUrl, asset.uri, {
          httpMethod: 'PUT',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            'x-ms-blob-type': 'BlockBlob',
            ...(contentType ? { 'Content-Type': contentType } : {}),
          },
        });

        if (uploadRes.status < 200 || uploadRes.status >= 300) {
          throw new Error(`Upload failed (status ${uploadRes.status})`);
        }
      }

      await attachEntryMedia({
        entryId: entry.id,
        blobKey,
        kind: 'photo',
        width,
        height,
      });

      setUploadStatus('Photo attached.');
    } catch (e: unknown) {
      setUploadStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  if (!id) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Entry' }} />
        <Text style={styles.error}>Missing entry id.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Entry' }} />
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <Stack.Screen options={{ title: 'Memory' }} />

      <View style={styles.paper}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Datebook</Text>
          <Text style={styles.title}>Memory</Text>
        </View>

        {error ? (
          <View style={styles.card}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}

        {entry ? (
          <View style={styles.card}>
            <Text style={styles.muted}>Date</Text>
            <Text style={styles.valueStrong}>{dateOnlyFromIso(entry.occurredAt)}</Text>

            <Text style={[styles.muted, { marginTop: 10 }]}>Title</Text>
            <Text style={styles.entryTitle}>{entry.title}</Text>

            <Text style={[styles.muted, { marginTop: 10 }]}>Notes</Text>
            {entry.body ? <Text style={styles.body}>{entry.body}</Text> : <Text style={styles.muted}>(none)</Text>}

            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => void pickAndAttachPhoto()}
                disabled={uploading}
                style={({ pressed }) => [
                  styles.button,
                  styles.secondaryButton,
                  (pressed || uploading) && styles.buttonPressed,
                  uploading && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.buttonText}>{uploading ? 'Uploading…' : 'Attach photo'}</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/entries/edit/[id]', params: { id: entry.id } })}
                style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.buttonText}>Edit</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => router.back()}
                style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.buttonText}>Back</Text>
              </Pressable>
            </View>

            {uploadStatus ? <Text style={styles.muted}>{uploadStatus}</Text> : null}
          </View>
        ) : null}
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
    gap: 8,
  },
  muted: {
    color: PaperColors.ink,
    opacity: 0.65,
  },
  valueStrong: {
    color: PaperColors.ink,
    fontWeight: '800',
    opacity: 0.95,
  },
  entryTitle: {
    color: PaperColors.ink,
    fontWeight: '900',
    fontSize: 20,
    lineHeight: 26,
  },
  body: {
    color: PaperColors.ink,
    opacity: 0.85,
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
    fontWeight: '800',
    color: PaperColors.ink,
  },
  error: {
    color: PaperColors.error,
  },
});
