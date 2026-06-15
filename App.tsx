import { Video, ResizeMode } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

const MAX_PHOTOS = 20;
const API_URL = "http://localhost:4000";

type PickedPhoto = {
  uri: string;
  fileName?: string | null;
  mimeType?: string;
};

type StoryResult = {
  title: string;
  narrative: string;
  videoUrl: string;
};

export default function App() {
  const [tripName, setTripName] = useState("Rome weekend");
  const [tone, setTone] = useState("witty, cinematic, observational");
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [result, setResult] = useState<StoryResult | null>(null);
  const [isGenerating, setGenerating] = useState(false);

  const canGenerate = photos.length > 0 && tripName.trim().length > 0 && !isGenerating;
  const photoCountLabel = useMemo(() => `${photos.length}/${MAX_PHOTOS} photos`, [photos.length]);

  async function pickPhotos() {
    const remainingSlots = MAX_PHOTOS - photos.length;

    if (remainingSlots <= 0) {
      Alert.alert("Photo limit reached", `This POC accepts up to ${MAX_PHOTOS} photos.`);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow photo access to add trip moments.");
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.82,
      selectionLimit: remainingSlots
    });

    if (picked.canceled) {
      return;
    }

    const incoming = picked.assets.slice(0, remainingSlots).map((asset) => ({
      uri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType ?? "image/jpeg"
    }));

    setPhotos((current) => [...current, ...incoming].slice(0, MAX_PHOTOS));
    setResult(null);
  }

  function removePhoto(uri: string) {
    setPhotos((current) => current.filter((photo) => photo.uri !== uri));
  }

  async function generateStory() {
    if (!canGenerate) {
      return;
    }

    setGenerating(true);
    setResult(null);

    try {
      const form = new FormData();
      form.append("tripName", tripName.trim());
      form.append("tone", tone.trim());

      photos.forEach((photo, index) => {
        const extension = photo.mimeType?.includes("png") ? "png" : "jpg";
        form.append("photos", {
          uri: photo.uri,
          name: photo.fileName ?? `trip-photo-${index + 1}.${extension}`,
          type: photo.mimeType ?? "image/jpeg"
        } as unknown as Blob);
      });

      const response = await fetch(`${API_URL}/api/stories`, {
        method: "POST",
        body: form
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Story generation failed.");
      }

      const payload = (await response.json()) as StoryResult;
      setResult(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      Alert.alert("Could not create story", message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Tripstory POC</Text>
            <Text style={styles.title}>Make yesterday feel written down.</Text>
            <Text style={styles.subtitle}>
              Create one solo trip, upload up to 20 photos, then generate a narrative and recap video.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Trip name</Text>
            <TextInput
              value={tripName}
              onChangeText={setTripName}
              placeholder="Lisbon escape"
              style={styles.input}
            />

            <Text style={styles.label}>Narrative voice</Text>
            <TextInput
              value={tone}
              onChangeText={setTone}
              placeholder="warm, witty, deadpan..."
              style={styles.input}
            />
          </View>

          <View style={styles.toolbar}>
            <Text style={styles.count}>{photoCountLabel}</Text>
            <Pressable style={styles.secondaryButton} onPress={pickPhotos}>
              <Text style={styles.secondaryButtonText}>Add photos</Text>
            </Pressable>
          </View>

          {photos.length > 0 ? (
            <View style={styles.grid}>
              {photos.map((photo) => (
                <View key={photo.uri} style={styles.thumbWrap}>
                  <Image source={{ uri: photo.uri }} style={styles.thumb} />
                  <Pressable style={styles.removeButton} onPress={() => removePhoto(photo.uri)}>
                    <Text style={styles.removeButtonText}>x</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Pressable style={styles.emptyState} onPress={pickPhotos}>
              <Text style={styles.emptyTitle}>No photos yet</Text>
              <Text style={styles.emptyText}>Add moments from a day and let the POC try to turn them into a story.</Text>
            </Pressable>
          )}

          <Pressable
            disabled={!canGenerate}
            style={[styles.primaryButton, !canGenerate && styles.primaryButtonDisabled]}
            onPress={generateStory}
          >
            {isGenerating ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Generate story video</Text>
            )}
          </Pressable>

          {result && (
            <View style={styles.result}>
              <Text style={styles.resultTitle}>{result.title}</Text>
              <Text style={styles.narrative}>{result.narrative}</Text>
              <Video
                source={{ uri: result.videoUrl }}
                style={styles.video}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc"
  },
  container: {
    flex: 1
  },
  content: {
    gap: 22,
    padding: 20,
    paddingBottom: 44
  },
  header: {
    gap: 8,
    paddingTop: 12
  },
  eyebrow: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  title: {
    color: "#111827",
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 38
  },
  subtitle: {
    color: "#475569",
    fontSize: 16,
    lineHeight: 23
  },
  section: {
    gap: 10
  },
  label: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700"
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ef",
    borderRadius: 8,
    borderWidth: 1,
    color: "#111827",
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  toolbar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  count: {
    color: "#475569",
    fontSize: 15,
    fontWeight: "700"
  },
  secondaryButton: {
    backgroundColor: "#e0ecff",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  secondaryButtonText: {
    color: "#1d4ed8",
    fontSize: 15,
    fontWeight: "800"
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  thumbWrap: {
    height: 100,
    position: "relative",
    width: "31%"
  },
  thumb: {
    backgroundColor: "#e2e8f0",
    borderRadius: 8,
    height: "100%",
    width: "100%"
  },
  removeButton: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.76)",
    borderRadius: 13,
    height: 26,
    justifyContent: "center",
    position: "absolute",
    right: 6,
    top: 6,
    width: 26
  },
  removeButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 18
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderStyle: "dashed",
    borderWidth: 1,
    gap: 6,
    padding: 26
  },
  emptyTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900"
  },
  emptyText: {
    color: "#64748b",
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center"
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 8,
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 14
  },
  primaryButtonDisabled: {
    backgroundColor: "#94a3b8"
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900"
  },
  result: {
    gap: 14,
    paddingTop: 6
  },
  resultTitle: {
    color: "#111827",
    fontSize: 26,
    fontWeight: "900"
  },
  narrative: {
    color: "#334155",
    fontSize: 16,
    lineHeight: 24
  },
  video: {
    aspectRatio: 9 / 16,
    backgroundColor: "#020617",
    borderRadius: 8,
    width: "100%"
  }
});

