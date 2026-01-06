import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { createScrapbook } from '@/api/scrapbooks';
import { listMyRelationships, type RelationshipSummary } from '@/api/relationships';
import { requestMediaUploadUrl } from '@/api/media';
import { PaperColors } from '@/constants/paper';

type PickedCover = {
  uri: string;
  width: number;
  height: number;
  mimeType?: string;
};

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function relationshipLabel(r: RelationshipSummary): string {
  const memberCount = r.members?.length ?? 0;
  const firstEmail = r.members?.[0]?.email;
  const suffix = firstEmail ? ` • ${firstEmail}` : '';
  return `Relationship ${shortId(r.relationshipId)} (${memberCount} member${memberCount === 1 ? '' : 's'})${suffix}`;
}

export default function NewScrapbookScreen() {
  const [title, setTitle] = useState('');
  const [cover, setCover] = useState<PickedCover | null>(null);

  const [relationships, setRelationships] = useState<RelationshipSummary[]>([]);
  const [relationshipId, setRelationshipId] = useState<string | null>(null);
  const [selectingRelationship, setSelectingRelationship] = useState(false);

  const [loadingRelationships, setLoadingRelationships] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim().length > 0 && Boolean(relationshipId) && !busy;

  const selectedRelationship = useMemo(
    () => relationships.find((r) => r.relationshipId === relationshipId) ?? null,
    [relationshipId, relationships]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingRelationships(true);
      setError(null);
      try {
        const rels = await listMyRelationships();
        if (cancelled) return;
        setRelationships(rels);

        // Convenience default: if exactly 1 relationship, preselect it.
        if (rels.length === 1) setRelationshipId(rels[0]!.relationshipId);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoadingRelationships(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function pickCover() {
    if (busy) return;
    setError(null);

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Photos permission not granted.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (picked.canceled) return;

    const asset = picked.assets?.[0];
    if (!asset?.uri) {
      setError('No image selected.');
      return;
    }

    if (typeof asset.width !== 'number' || typeof asset.height !== 'number') {
      setError('Could not determine image size.');
      return;
    }

    setCover({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      mimeType: typeof asset.mimeType === 'string' ? asset.mimeType : undefined,
    });
  }

  async function submit() {
    if (!relationshipId) return;
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      let coverBlobKey: string | null = null;
      let coverWidth: number | null = null;
      let coverHeight: number | null = null;

      if (cover) {
        const { uploadUrl, blobKey } = await requestMediaUploadUrl({
          relationshipId,
          contentType: cover.mimeType,
        });

        // Upload to Azure Blob SAS URL.
        // NOTE: expo-file-system.uploadAsync is not available on web, so we use fetch there.
        if (Platform.OS === 'web') {
          const sourceRes = await fetch(cover.uri);
          if (!sourceRes.ok) throw new Error(`Failed to read selected image (status ${sourceRes.status})`);

          const blob = await sourceRes.blob();
          const putRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'x-ms-blob-type': 'BlockBlob',
              ...(cover.mimeType ? { 'Content-Type': cover.mimeType } : {}),
            },
            body: blob,
          });

          if (!putRes.ok) {
            const text = await putRes.text().catch(() => '');
            throw new Error(`Upload failed (status ${putRes.status})${text ? `: ${text}` : ''}`);
          }
        } else {
          const uploadRes = await FileSystem.uploadAsync(uploadUrl, cover.uri, {
            httpMethod: 'PUT',
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: {
              'x-ms-blob-type': 'BlockBlob',
              ...(cover.mimeType ? { 'Content-Type': cover.mimeType } : {}),
            },
          });

          if (uploadRes.status < 200 || uploadRes.status >= 300) {
            throw new Error(`Upload failed (status ${uploadRes.status})`);
          }
        }

        coverBlobKey = blobKey;
        coverWidth = cover.width;
        coverHeight = cover.height;
      }

      const created = await createScrapbook({
        relationshipId,
        title: title.trim(),
        ...(coverBlobKey ? { coverBlobKey } : {}),
        ...(typeof coverWidth === 'number' ? { coverWidth } : {}),
        ...(typeof coverHeight === 'number' ? { coverHeight } : {}),
      });

      // Step 2 viewer route (placeholder for now).
      router.replace({ pathname: '/scrapbooks/[id]', params: { id: created.id } });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'New scrapbook' }} />

      <View style={styles.paper}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Datebook</Text>
          <Text style={styles.title}>New scrapbook</Text>
          <Text style={styles.subtitle}>Choose a title, optional cover, and a relationship.</Text>
        </View>

        {error ? (
          <View style={styles.card}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.label}>Title *</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Weekend getaway"
            placeholderTextColor={'rgba(46,42,39,0.45)'}
            style={styles.input}
            editable={!busy}
          />

          <Text style={styles.label}>Relationship / Group *</Text>

          {loadingRelationships ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ActivityIndicator />
              <Text style={styles.muted}>Loading relationships…</Text>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setSelectingRelationship(true)}
              disabled={busy}
              style={({ pressed }) => [styles.selector, pressed && styles.selectorPressed, busy && styles.selectorDisabled]}
            >
              <Text style={styles.selectorText} numberOfLines={2}>
                {selectedRelationship ? relationshipLabel(selectedRelationship) : 'Select a relationship'}
              </Text>
            </Pressable>
          )}

          <Text style={styles.label}>Cover photo (optional)</Text>

          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void pickCover()}
              disabled={busy}
              style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.buttonPressed, busy && styles.buttonDisabled]}
            >
              <Text style={styles.buttonText}>{cover ? 'Change cover' : 'Pick cover photo'}</Text>
            </Pressable>

            {cover ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setCover(null)}
                disabled={busy}
                style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, busy && styles.buttonDisabled]}
              >
                <Text style={styles.buttonText}>Remove</Text>
              </Pressable>
            ) : null}
          </View>

          {cover ? (
            <View style={styles.coverPreviewWrap}>
              <Image source={{ uri: cover.uri }} style={styles.coverPreview} contentFit="cover" />
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => void submit()}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.button,
              styles.primaryButton,
              (pressed || busy) && styles.buttonPressed,
              !canSubmit && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.buttonText}>{busy ? 'Saving…' : 'Create scrapbook'}</Text>
          </Pressable>

          <Text style={styles.muted}>Tip: the photo picker includes a simple square crop.</Text>
        </View>
      </View>

      <Modal visible={selectingRelationship} animationType="slide" onRequestClose={() => setSelectingRelationship(false)}>
        <View style={styles.modalPage}>
          <View style={styles.modalPaper}>
            <View style={styles.header}>
              <Text style={styles.kicker}>Datebook</Text>
              <Text style={styles.title}>Select relationship</Text>
              <Text style={styles.subtitle}>Pick where this scrapbook lives.</Text>
            </View>

            <ScrollView contentContainerStyle={{ gap: 10 }}>
              {relationships.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.body}>No relationships found.</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setSelectingRelationship(false);
                      router.push('/relationships');
                    }}
                    style={({ pressed }) => [styles.button, styles.primaryButton, pressed && styles.buttonPressed]}
                  >
                    <Text style={styles.buttonText}>Go to Relationships</Text>
                  </Pressable>
                </View>
              ) : (
                relationships.map((r) => (
                  <Pressable
                    key={r.relationshipId}
                    accessibilityRole="button"
                    onPress={() => {
                      setRelationshipId(r.relationshipId);
                      setSelectingRelationship(false);
                    }}
                    style={({ pressed }) => [styles.relRow, pressed && styles.relRowPressed]}
                  >
                    <Text style={styles.relTitle}>{relationshipLabel(r)}</Text>
                    <Text style={styles.relMeta}>ID: {r.relationshipId}</Text>
                  </Pressable>
                ))
              )}
            </ScrollView>

            <Pressable
              accessibilityRole="button"
              onPress={() => setSelectingRelationship(false)}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            >
              <Text style={styles.buttonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
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
  label: {
    color: PaperColors.ink,
    fontWeight: '800',
  },
  input: {
    borderWidth: 1,
    borderColor: PaperColors.border,
    backgroundColor: PaperColors.paper,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, default: 10 }),
    borderRadius: 14,
    color: PaperColors.ink,
  },
  selector: {
    borderWidth: 1,
    borderColor: PaperColors.border,
    backgroundColor: PaperColors.paper,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
  },
  selectorPressed: {
    opacity: 0.95,
    transform: [{ translateY: 1 }],
  },
  selectorDisabled: {
    opacity: 0.5,
  },
  selectorText: {
    color: PaperColors.ink,
    fontWeight: '700',
  },
  coverPreviewWrap: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: PaperColors.border,
    backgroundColor: PaperColors.paper,
    aspectRatio: 1,
  },
  coverPreview: {
    width: '100%',
    height: '100%',
  },
  body: {
    color: PaperColors.ink,
    opacity: 0.82,
    lineHeight: 20,
  },
  error: {
    color: PaperColors.error,
    fontWeight: '700',
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
  modalPage: {
    flex: 1,
    backgroundColor: PaperColors.sand,
    padding: 18,
  },
  modalPaper: {
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
    flex: 1,
  },
  relRow: {
    borderWidth: 1,
    borderColor: PaperColors.border,
    backgroundColor: PaperColors.white,
    borderRadius: 18,
    padding: 14,
    gap: 6,
  },
  relRowPressed: {
    opacity: 0.95,
    transform: [{ translateY: 1 }],
  },
  relTitle: {
    color: PaperColors.ink,
    fontWeight: '800',
    lineHeight: 20,
  },
  relMeta: {
    color: PaperColors.ink,
    opacity: 0.65,
    fontSize: 12,
  },
});
