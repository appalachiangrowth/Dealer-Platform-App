import React, { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, Film, Images, Sparkles, Video, X } from 'lucide-react-native';
import { api } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { MAX_AI_PHOTOS, MIN_VIDEO_MS, runAiExtraction, type AiResult, type AiStatus, type LocalPhoto, type LocalVideo, type StepKey, type StepState } from '../../src/lib/ai';
import { cleanVin, toBody, type VehicleDraft } from '../../src/lib/vehicle';
import type { Vehicle } from '../../src/lib/types';
import { C, R } from '../../src/lib/theme';
import { VehicleForm } from '../../src/components/VehicleForm';
import { Button, Card, Field, Input, Notice, Screen, SectionTitle, notify, tap } from '../../src/components/ui';

const STEP_ORDER: StepKey[] = ['upload', 'photos', 'video', 'vin', 'text'];
let seq = 0;

function clock(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function AiAddVehicle() {
  const router = useRouter();
  const qc = useQueryClient();
  const { dealership } = useSession();
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [video, setVideo] = useState<LocalVideo | null>(null);
  const [vin, setVin] = useState('');
  const [steps, setSteps] = useState<Partial<Record<StepKey, StepState>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AiResult | null>(null);

  const status = useQuery({ queryKey: ['ai-status'], queryFn: () => api<AiStatus>('/dealer/ai/status'), staleTime: 5 * 60_000, retry: false });
  const canVideo = status.data?.video !== false;

  const addPhotos = (assets: ImagePicker.ImagePickerAsset[]) => {
    setPhotos((cur) => {
      const room = MAX_AI_PHOTOS - cur.length;
      if (assets.length > room) Alert.alert('Photo limit', `The AI reads up to ${MAX_AI_PHOTOS} photos at once.`);
      return [...cur, ...assets.slice(0, Math.max(0, room)).map((a) => ({ key: `a${Date.now()}_${seq++}`, uri: a.uri, width: a.width, height: a.height, name: a.fileName, mimeType: a.mimeType }))];
    });
  };
  const pickVideo = (a: ImagePicker.ImagePickerAsset) => {
    const durationMs = a.duration || 0;
    if (durationMs && durationMs < MIN_VIDEO_MS) {
      Alert.alert('Video too short', 'Film at least 30 seconds around the car.');
      return;
    }
    setVideo({ uri: a.uri, name: a.fileName || 'walkaround video', durationMs });
  };

  const camera = async (kind: 'images' | 'videos') => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access needed', 'Allow camera access in your phone settings.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync(kind === 'images' ? { mediaTypes: ['images'], quality: 0.85 } : { mediaTypes: ['videos'], videoMaxDuration: 180 });
    if (r.canceled || !r.assets?.length) return;
    if (kind === 'images') addPhotos(r.assets);
    else pickVideo(r.assets[0]);
  };
  const library = async (kind: 'images' | 'videos') => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo access needed', 'Allow photo access in your phone settings.');
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync(
      kind === 'images' ? { mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_AI_PHOTOS, orderedSelection: true, quality: 0.85 } : { mediaTypes: ['videos'] },
    );
    if (r.canceled || !r.assets?.length) return;
    if (kind === 'images') addPhotos(r.assets);
    else pickVideo(r.assets[0]);
  };

  const analyze = async () => {
    setBusy(true);
    setError('');
    setSteps({});
    try {
      const r = await runAiExtraction({ photos, video, vin, dealership: dealership?.name || '', canVideo }, (k, s) => setSteps((cur) => ({ ...cur, [k]: s })));
      notify(true);
      setResult(r);
    } catch (e) {
      notify(false);
      setError((e as Error).message || 'The AI could not read these pictures.');
    } finally {
      setBusy(false);
    }
  };

  // POST /dealer/vehicles — the same save as the manual form
  const create = useMutation({
    mutationFn: (d: VehicleDraft) => api<Vehicle>('/dealer/vehicles', { method: 'POST', body: toBody(d) }),
    onSuccess: (v) => {
      notify(true);
      void qc.invalidateQueries({ queryKey: ['vehicles'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['cg-monitor'] });
      router.replace({ pathname: '/vehicle/[id]', params: { id: v.id } });
    },
    onError: (e) => {
      notify(false);
      Alert.alert('Could not save the vehicle', (e as Error).message);
    },
  });

  // review: the normal Add Vehicle form, filled in, with the uploaded photos attached
  if (result) {
    return <VehicleForm initial={result.draft} aiFields={result.aiFields} aiNotes={result.notes} submitLabel="Save Vehicle" saving={create.isPending} onSubmit={(d) => create.mutate(d)} />;
  }

  const shown = STEP_ORDER.filter((k) => steps[k]);
  const ready = photos.length > 0 || !!video;

  return (
    <Screen>
      <Card>
        <SectionTitle right={<Text style={st.count}>{photos.length} / {MAX_AI_PHOTOS}</Text>}>Photos</SectionTitle>
        <Text style={st.help}>Exterior from every side, the interior, the VIN sticker (driver door) and the odometer.</Text>
        <View style={st.row}>
          <Button title="Take Photo" icon={<Camera size={18} color="#FFFFFF" />} onPress={() => void camera('images')} disabled={busy} style={{ flex: 1 }} />
          <Button title="Gallery" variant="secondary" icon={<Images size={18} color={C.ink} />} onPress={() => void library('images')} disabled={busy} style={{ flex: 1 }} />
        </View>
        {photos.length ? (
          <View style={st.grid}>
            {photos.map((p, i) => (
              <View key={p.key} style={st.cell}>
                <Image source={{ uri: p.uri }} style={st.thumb} />
                <View style={st.num}>
                  <Text style={st.numText}>{i + 1}</Text>
                </View>
                {!busy ? (
                  <Pressable
                    hitSlop={8}
                    style={st.del}
                    accessibilityLabel="Remove photo"
                    onPress={() => {
                      tap();
                      setPhotos((cur) => cur.filter((x) => x.key !== p.key));
                    }}
                  >
                    <X size={14} color="#FFFFFF" />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      <Card>
        <SectionTitle>Walkaround video</SectionTitle>
        <Text style={st.help}>30 seconds to 3 minutes: walk around the car, then film the interior, the dashboard and the VIN sticker. Still pictures are taken from it on your phone; the video itself is not uploaded.</Text>
        {!canVideo ? <Notice tone="warn">The AI on this server cannot read videos (it needs Gemini, OpenRouter or Qwen). Use photos.</Notice> : null}
        {video ? (
          <View style={st.video}>
            <Film size={22} color={C.primary} />
            <View style={{ flex: 1 }}>
              <Text style={st.videoName} numberOfLines={1}>{video.name}</Text>
              <Text style={st.help}>{video.durationMs ? clock(video.durationMs) : 'length unknown'}</Text>
            </View>
            {!busy ? (
              <Pressable hitSlop={10} onPress={() => setVideo(null)} accessibilityLabel="Remove video">
                <X size={20} color={C.muted} />
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={st.row}>
            <Button title="Record Video" variant="secondary" icon={<Video size={18} color={C.ink} />} onPress={() => void camera('videos')} disabled={busy || !canVideo} style={{ flex: 1 }} />
            <Button title="Choose Video" variant="secondary" icon={<Film size={18} color={C.ink} />} onPress={() => void library('videos')} disabled={busy || !canVideo} style={{ flex: 1 }} />
          </View>
        )}
      </Card>

      <Card>
        <Field label="VIN (optional)" hint="Leave it empty and the AI tries to read it from the VIN sticker.">
          <Input value={vin} onChangeText={(t) => setVin(cleanVin(t).slice(0, 17))} autoCapitalize="characters" autoCorrect={false} maxLength={17} editable={!busy} placeholder="17 characters" />
        </Field>
      </Card>

      {shown.length ? (
        <Card>
          <SectionTitle>{busy ? 'Working…' : 'Result'}</SectionTitle>
          {shown.map((k) => {
            const s = steps[k] as StepState;
            return (
              <View key={k} style={st.step}>
                <View style={[st.dot, s.st === 'ok' && { backgroundColor: C.ok }, s.st === 'fail' && { backgroundColor: C.bad }, s.st === 'skip' && { backgroundColor: C.faint }]}>
                  {s.st === 'ok' ? <Check size={12} color="#FFFFFF" /> : null}
                </View>
                <Text style={[st.stepText, s.st === 'fail' && { color: C.bad }]}>{s.text}</Text>
              </View>
            );
          })}
        </Card>
      ) : null}

      {error ? <Notice tone="bad">{error}</Notice> : null}

      <Button title={busy ? 'Analyzing…' : 'Analyze with AI'} icon={<Sparkles size={18} color="#FFFFFF" />} onPress={() => void analyze()} loading={busy} disabled={!ready} />
      {!ready ? <Text style={[st.help, { textAlign: 'center', marginTop: 8 }]}>Add at least one photo or a video.</Text> : null}
      <Button title="Add manually instead" variant="ghost" onPress={() => router.replace('/vehicle/new')} disabled={busy} style={{ marginTop: 6 }} />
    </Screen>
  );
}

const st = StyleSheet.create({
  help: { fontSize: 13, color: C.muted, lineHeight: 19, marginBottom: 10 },
  count: { fontSize: 13, color: C.muted, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3, marginTop: 12 },
  cell: { width: '25%', padding: 3 },
  thumb: { width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: '#E2E8F0' },
  num: { position: 'absolute', left: 7, top: 7, backgroundColor: 'rgba(15,23,42,0.75)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  numText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  del: { position: 'absolute', right: 7, top: 7, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(185,28,28,0.9)', alignItems: 'center', justifyContent: 'center' },
  video: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: 12 },
  videoName: { fontSize: 15, fontWeight: '700', color: C.ink },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  dot: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, fontSize: 14, color: C.text },
});
