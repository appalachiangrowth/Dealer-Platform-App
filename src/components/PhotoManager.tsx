import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';
import { Camera, ChevronLeft, ChevronRight, Images, RotateCw, Star, Trash2 } from 'lucide-react-native';
import { api, mediaUrl, uploadPhoto } from '../lib/api';
import { C, R } from '../lib/theme';
import { Button, notify, tap } from './ui';

const MAX_PHOTOS = 60; // backend keeps at most 60 photos per vehicle (cleanImageList)

type Item = {
  key: string;
  /** what the thumbnail shows: the local file while uploading, then the server .jpeg */
  preview: string;
  /** server URL ("/uploads/…") once uploaded */
  url: string | null;
  progress: number;
  error: string;
  asset?: { uri: string; name?: string | null; mimeType?: string | null };
};

let seq = 0;
const nextKey = () => `p${Date.now()}_${seq++}`;

/**
 * Lot-walk photo manager: camera + multi-select gallery, per-photo upload progress, cover badge (#1), reorder, delete.
 * Every photo goes straight to POST /dealer/media (field "files"), so the server's automatic .jpeg conversion and the
 * dealership's photo settings (max size, Auto White Studio Background) apply exactly like in the web portal.
 */
export function PhotoManager({ value, onChange, onBusyChange, error }: {
  value: string[]; onChange: (urls: string[]) => void; onBusyChange?: (busy: boolean) => void; error?: string;
}) {
  const [items, setItems] = useState<Item[]>(() => value.map((u) => ({ key: nextKey(), preview: mediaUrl(u), url: u, progress: 1, error: '' })));
  const [studio, setStudio] = useState(false);
  const studioRef = useRef(false);
  studioRef.current = studio;
  const lastEmitted = useRef(value.join('|'));

  // is "Auto White Studio Background" installed on the server? (GET /dealer/media/enhancer)
  const enhancer = useQuery({ queryKey: ['media-enhancer'], queryFn: () => api<{ available: boolean; reason: string }>('/dealer/media/enhancer'), staleTime: 10 * 60_000, retry: false });

  // the vehicle was (re)loaded from the server
  useEffect(() => {
    const joined = value.join('|');
    if (joined === lastEmitted.current) return;
    lastEmitted.current = joined;
    setItems(value.map((u) => ({ key: nextKey(), preview: mediaUrl(u), url: u, progress: 1, error: '' })));
  }, [value]);

  // tell the form: uploaded URLs in order + whether something is still uploading
  useEffect(() => {
    const urls = items.filter((i) => i.url).map((i) => i.url as string);
    const joined = urls.join('|');
    if (joined !== lastEmitted.current) {
      lastEmitted.current = joined;
      onChange(urls);
    }
    onBusyChange?.(items.some((i) => !i.url && !i.error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const patch = useCallback((key: string, p: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i))), []);

  const upload = useCallback(
    async (it: Item) => {
      if (!it.asset) return;
      patch(it.key, { error: '', progress: 0 });
      try {
        const f = await uploadPhoto(it.asset, { enhance: studioRef.current, onProgress: (p) => patch(it.key, { progress: p }) });
        patch(it.key, { url: f.url, preview: mediaUrl(f.url), progress: 1, error: '' });
      } catch (e) {
        patch(it.key, { error: (e as Error).message || 'Upload failed' });
        notify(false);
      }
    },
    [patch],
  );

  const add = useCallback(
    (assets: ImagePicker.ImagePickerAsset[]) => {
      const room = MAX_PHOTOS - items.length;
      if (room <= 0) {
        Alert.alert('Photo limit reached', `A vehicle can have up to ${MAX_PHOTOS} photos.`);
        return;
      }
      const fresh: Item[] = assets.slice(0, room).map((a) => ({
        key: nextKey(), preview: a.uri, url: null, progress: 0, error: '', asset: { uri: a.uri, name: a.fileName, mimeType: a.mimeType },
      }));
      setItems((list) => [...list, ...fresh]);
      // one after another: steady on mobile data, and the order stays the order they were taken in
      void (async () => {
        for (const it of fresh) await upload(it);
      })();
    },
    [items.length, upload],
  );

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access needed', 'Allow camera access in your phone settings to take vehicle photos.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!r.canceled && r.assets?.length) add(r.assets);
  };

  const pickPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo access needed', 'Allow photo access in your phone settings to choose vehicle photos.');
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 30, orderedSelection: true, quality: 0.85 });
    if (!r.canceled && r.assets?.length) add(r.assets);
  };

  const move = (index: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    tap();
    setItems((list) => {
      const next = [...list];
      const [x] = next.splice(index, 1);
      next.splice(to, 0, x);
      return next;
    });
  };

  const remove = (it: Item) => {
    Alert.alert('Remove this photo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setItems((list) => list.filter((i) => i.key !== it.key)) },
    ]);
  };

  return (
    <View>
      <View style={st.actions}>
        <Button title="Take Photo" icon={<Camera size={20} color="#FFFFFF" />} onPress={takePhoto} style={{ flex: 1 }} />
        <Button title="Gallery" variant="secondary" icon={<Images size={20} color={C.ink} />} onPress={pickPhotos} style={{ flex: 1 }} />
      </View>

      {enhancer.data?.available ? (
        <View style={st.studio}>
          <View style={{ flex: 1 }}>
            <Text style={st.studioTitle}>Auto White Studio Background</Text>
            <Text style={st.studioText}>New photos are put on a clean white background by the server.</Text>
          </View>
          <Switch value={studio} onValueChange={setStudio} />
        </View>
      ) : null}

      {error ? <Text style={st.err}>{error}</Text> : null}

      {items.length === 0 ? (
        <View style={st.empty}>
          <Text style={st.emptyText}>No photos yet. The first photo is the cover.</Text>
        </View>
      ) : (
        <View style={st.grid}>
          {items.map((it, i) => {
            const uploading = !it.url && !it.error;
            return (
              <View key={it.key} style={st.cell}>
                <View style={st.thumbWrap}>
                  <Image source={{ uri: it.preview }} style={st.thumb} resizeMode="cover" />
                  <View style={[st.num, i === 0 && { backgroundColor: C.primary }]}>
                    <Text style={st.numText}>{i === 0 ? '#1 Cover' : `#${i + 1}`}</Text>
                  </View>
                  {uploading ? (
                    <View style={st.overlay}>
                      <Text style={st.pct}>{Math.round(it.progress * 100)}%</Text>
                      <View style={st.barBg}>
                        <View style={[st.bar, { width: `${Math.max(4, Math.round(it.progress * 100))}%` }]} />
                      </View>
                      <Text style={st.overlaySmall}>{it.progress >= 1 ? 'Saving…' : 'Uploading…'}</Text>
                    </View>
                  ) : null}
                  {it.error ? (
                    <Pressable style={[st.overlay, { backgroundColor: 'rgba(185,28,28,0.82)' }]} onPress={() => void upload(it)}>
                      <RotateCw size={20} color="#FFFFFF" />
                      <Text style={st.overlaySmall} numberOfLines={3}>{it.error}</Text>
                      <Text style={[st.overlaySmall, { fontWeight: '700' }]}>Tap to retry</Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={st.tools}>
                  <Pressable hitSlop={6} disabled={i === 0} onPress={() => move(i, i - 1)} style={[st.tool, i === 0 && st.toolOff]} accessibilityLabel="Move left">
                    <ChevronLeft size={18} color={C.ink} />
                  </Pressable>
                  <Pressable hitSlop={6} disabled={i === 0} onPress={() => move(i, 0)} style={[st.tool, i === 0 && st.toolOff]} accessibilityLabel="Set as cover">
                    <Star size={16} color={C.ink} />
                  </Pressable>
                  <Pressable hitSlop={6} disabled={i === items.length - 1} onPress={() => move(i, i + 1)} style={[st.tool, i === items.length - 1 && st.toolOff]} accessibilityLabel="Move right">
                    <ChevronRight size={18} color={C.ink} />
                  </Pressable>
                  <Pressable hitSlop={6} onPress={() => remove(it)} style={st.tool} accessibilityLabel="Delete photo">
                    <Trash2 size={16} color={C.bad} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  studio: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.bg, borderRadius: R.md, padding: 12, marginBottom: 12 },
  studioTitle: { fontSize: 14, fontWeight: '700', color: C.ink },
  studioText: { fontSize: 12, color: C.muted, marginTop: 2 },
  err: { color: C.bad, fontSize: 13, marginBottom: 8 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.faint, borderRadius: R.md, padding: 22, alignItems: 'center' },
  emptyText: { color: C.muted, fontSize: 14, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  cell: { width: '50%', padding: 5 },
  thumbWrap: { borderRadius: R.md, overflow: 'hidden', backgroundColor: '#E2E8F0', aspectRatio: 4 / 3 },
  thumb: { width: '100%', height: '100%' },
  num: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(15,23,42,0.75)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  numText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,23,42,0.6)', alignItems: 'center', justifyContent: 'center', padding: 8, gap: 5 },
  pct: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  overlaySmall: { color: '#FFFFFF', fontSize: 12, textAlign: 'center' },
  barBg: { width: '80%', height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  bar: { height: 6, backgroundColor: '#FFFFFF' },
  tools: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  tool: { width: 38, height: 34, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  toolOff: { opacity: 0.35 },
});
