import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const MAX_PHOTOS = 20;
const DEFAULT_API_URL = "http://192.168.1.166:4000";

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
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
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

    // Prefer the new ImagePicker.MediaType API; avoid using deprecated MediaTypeOptions
    const mediaTypesAny = (ImagePicker as any).MediaType;
    const mediaTypesOption = mediaTypesAny ? mediaTypesAny.Images : undefined;

    const launchOptions: any = {
      allowsMultipleSelection: true,
      quality: 0.82,
      selectionLimit: remainingSlots
    };

    if (mediaTypesOption) {
      launchOptions.mediaTypes = mediaTypesOption;
    }

    const picked = await ImagePicker.launchImageLibraryAsync(launchOptions);

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

      for (const [index, photo] of photos.entries()) {
        const isHeic = (photo.mimeType ?? "").includes("heic") || photo.uri.toLowerCase().endsWith(".heic");
        let uploadUri = photo.uri;
        let uploadType = photo.mimeType ?? "image/jpeg";
        let uploadName = photo.fileName ?? `trip-photo-${index + 1}`;

        if (isHeic) {
          try {
            const converted = await ImageManipulator.manipulateAsync(photo.uri, [], {
              compress: 0.9,
              format: ImageManipulator.SaveFormat.JPEG
            });
            uploadUri = converted.uri;
            uploadType = "image/jpeg";
            uploadName = `${uploadName}.jpg`;
          } catch (e) {
            console.warn("HEIC conversion failed, uploading original:", e);
          }
        } else {
          const extension = photo.mimeType?.includes("png") ? "png" : "jpg";
          uploadName = uploadName.includes(".") ? uploadName : `${uploadName}.${extension}`;
        }

        form.append("photos", {
          uri: uploadUri,
          name: uploadName,
          type: uploadType
        } as unknown as Blob);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      try {
        const response = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/stories`, {
          method: "POST",
          body: form,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

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
    } catch (outerError) {
      const message = outerError instanceof Error ? outerError.message : "Something went wrong.";
      Alert.alert("Error", message);
      setGenerating(false);
    }
  }

  return (
    <SafeAreaProvider>
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

            <Text style={styles.label}>API URL</Text>
            <TextInput
              value={apiUrl}
              onChangeText={setApiUrl}
              placeholder={DEFAULT_API_URL}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
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
              <Pressable 
                style={[styles.primaryButton, {marginTop: 16}]}
                onPress={() => {
                  // Try to open video in browser or media player
                  const Linking = require("react-native").Linking;
                  Linking.openURL(result.videoUrl);
                }}
              >
                <Text style={styles.primaryButtonText}>📹 Play video</Text>
              </Pressable>
              <Text style={{color: '#666', fontSize: 12, marginTop: 12, textAlign: 'center'}}>
                Video URL: {result.videoUrl}
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
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

