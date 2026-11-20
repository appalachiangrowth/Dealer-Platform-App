import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, type AppStateStatus, FlatList, Image, Linking, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, ExternalLink, Facebook, Globe, ImageOff, RefreshCw, Search, Square, X } from 'lucide-react-native';
import { api, mediaUrl } from '../../src/lib/api';
import { C, R } from '../../src/lib/theme';
import { cover, dateTime, money, vehicleName } from '../../src/lib/format';
import type { FbItem, FbQuickConfig, FbResult, FbRun, FbState, Vehicle, VehicleList } from '../../src/lib/types';
import { Badge, Button, Card, Field, Input, Notice, Screen, SectionTitle, notify, tap } from '../../src/components/ui';
import { useSession } from '../../src/lib/session';
import { getApiUrl } from '../../src/lib/config';

const MAX_MEDIA = 20;
const FB = '/dealer/facebook';

function resultText(r: FbResult): string {
  if (r.status === 'done') return r.note && r.note !== 'posted' ? `Posted (${r.note})` : 'Posted';
  if (r.status === 'running') return 'Posting now…';
  if (r.status === 'retry') return 'Trying again…';
  if (r.status === 'waiting') return 'Waiting for its turn';
  if (r.status === 'cancelled') return 'Stopped before it was posted';
  if (r.status === 'not posted') return 'Not posted (the run stopped earlier)';
  return r.error || r.note || r.status;
}

function VehiclePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (v: Vehicle) => void }) {
  const [text, setText] = useState('');
  // only vehicles for sale can be posted
  const list = useQuery({
    queryKey: ['vehicles', 'PUBLISHED', '', 'picker'],
    queryFn: () => api<VehicleList>('/dealer/vehicles?status=PUBLISHED&sort=newest&page=1&pageSize=200'),
    enabled: open,
  });
  const items = useMemo(() => {
    const t = text.trim().toLowerCase();
    const all = list.data?.items || [];
    return t ? all.filter((v) => `${vehicleName(v)} ${v.vin} ${v.stockNumber}`.toLowerCase().includes(t)) : all;
  }, [list.data, text]);

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={st.pickHead}>
          <Text style={st.pickTitle}>Choose a vehicle</Text>
          <Pressable hitSlop={12} onPress={onClose}>
            <X size={24} color={C.ink} />
          </Pressable>
        </View>
        <View style={st.search}>
          <Search size={18} color={C.muted} />
          <TextInput value={text} onChangeText={setText} placeholder="Search" placeholderTextColor={C.faint} style={st.searchInput} autoCorrect={false} autoCapitalize="none" />
        </View>
        <FlatList
          data={items}
          keyExtractor={(v) => v.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={st.small}>{list.isLoading ? 'Loading…' : list.error ? (list.error as Error).message : 'No vehicles for sale.'}</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={st.pickRow}
              onPress={() => {
                tap();
                onPick(item);
                onClose();
              }}
            >
              {cover(item) ? <Image source={{ uri: mediaUrl(cover(item)) }} style={st.pickThumb} /> : <View style={[st.pickThumb, st.centerBox]}><ImageOff size={16} color={C.faint} /></View>}
              <View style={{ flex: 1 }}>
                <Text style={st.vname} numberOfLines={1}>{vehicleName(item) || 'Vehicle'}</Text>
                <Text style={st.small} numberOfLines={1}>{money(item.price)} · {item.images.length} photo(s){item.stockNumber ? ` · Stock ${item.stockNumber}` : ''}</Text>
              </View>
              <ChevronRight size={18} color={C.faint} />
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

export default function FacebookTab() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ vehicleId?: string }>();
  const { me, dealership } = useSession();
  const [focused, setFocused] = useState(false);
  const [picker, setPicker] = useState(false);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [pages, setPages] = useState<string[] | null>(null); // null = all Pages ticked (default)
  const [toMarketplace, setToMarketplace] = useState(true);
  const [result, setResult] = useState<{ ok: boolean; lines: string[] } | null>(null);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // GET /dealer/facebook/quick-config → saved Facebook login + Pages (does not start the server browser)
  const cfg = useQuery({ queryKey: ['fb-config'], queryFn: () => api<FbQuickConfig>(`${FB}/quick-config`) });
  // GET /dealer/facebook/state?peek=1 → posting progress (peek: never keeps an unused Facebook browser awake)
  const state = useQuery({
    queryKey: ['fb-state'],
    queryFn: () => api<FbState>(`${FB}/state?peek=1&log=999999999`),
    refetchInterval: focused ? 3000 : false,
    enabled: focused,
  });
  // GET /dealer/facebook/history → { runs } (the last 25 posts of this login)
  const history = useQuery({ queryKey: ['fb-history'], queryFn: () => api<{ runs: FbRun[] }>(`${FB}/history`) });

  const allPages: FbItem[] = cfg.data?.account.pages || [];
  const selectedPages = (pages === null ? allPages.map((p) => p.url) : pages).filter((u) => allPages.some((p) => p.url === u));
  const connected = !!cfg.data?.connection.connected;
  const job = state.data?.job || null;
  const batch = state.data?.mp.batch || null;
  const posting = job?.status === 'running' || job?.status === 'queued' || !!state.data?.mp.running;

  // a run just finished → refresh the history
  const jobStatus = job?.status;
  useEffect(() => {
    if (jobStatus === 'finished') void qc.invalidateQueries({ queryKey: ['fb-history'] });
  }, [jobStatus, qc]);

  // POST /dealer/facebook/mp/vehicles/:id/generate { ai: false, save: false } → { text, copy: { hashtags }, photos }
  const generate = useMutation({
    mutationFn: (id: string) => api<{ text: string; copy: { hashtags?: string }; photos: string[] }>(`${FB}/mp/vehicles/${id}/generate`, { method: 'POST', body: { ai: false, save: false } }),
    onSuccess: (r) => {
      setCaption(r.text || '');
      setHashtags(r.copy?.hashtags || '');
    },
    onError: () => undefined, // the caption stays editable by hand
  });
  const runGenerate = generate.mutate;

  const choose = useCallback(
    (v: Vehicle) => {
      setVehicle(v);
      setResult(null);
      setPhotos((v.images || []).slice(0, MAX_MEDIA));
      setToMarketplace(v.syndicateFacebook !== false);
      setCaption(vehicleName(v));
      setHashtags('');
      runGenerate(v.id);
    },
    [runGenerate],
  );

  // opened from Vehicle details › "Post to Facebook"
  const wanted = typeof params.vehicleId === 'string' ? params.vehicleId : '';
  useEffect(() => {
    if (!wanted || vehicle?.id === wanted) return;
    let alive = true;
    api<Vehicle>(`/dealer/vehicles/${wanted}`)
      .then((v) => {
        if (alive) choose(v);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);

  // POST /dealer/facebook/connect — starts the Facebook browser on the server with the saved login
  const connect = useMutation({
    mutationFn: () => api<unknown>(`${FB}/connect`, { method: 'POST', body: {}, timeout: 120_000 }),
    onSettled: () => {
      void cfg.refetch();
      void state.refetch();
    },
    onError: (e) => Alert.alert('Could not connect', (e as Error).message),
  });
  // POST /dealer/facebook/pages/load → { pages }
  const loadPages = useMutation({
    mutationFn: () => api<{ pages: FbItem[] }>(`${FB}/pages/load`, { method: 'POST', body: {}, timeout: 120_000 }),
    onSuccess: () => void cfg.refetch(),
    onError: (e) => Alert.alert('Could not read your Pages', (e as Error).message),
  });
  // POST /dealer/facebook/stop + /mp/stop
  const stop = useMutation({
    mutationFn: async () => {
      await api(`${FB}/stop`, { method: 'POST', body: {} }).catch(() => undefined);
      await api(`${FB}/mp/stop`, { method: 'POST', body: {} }).catch(() => undefined);
    },
    onSettled: () => void state.refetch(),
  });

  const post = useMutation({
    mutationFn: async () => {
      if (!vehicle) throw new Error('Choose a vehicle first.');
      const lines: string[] = [];
      let ok = true;
      const pageList = allPages.filter((p) => selectedPages.includes(p.url));
      if (pageList.length) {
        // POST /dealer/facebook/post (multipart/form-data): profile, pages, order, caption, hashtags, vehicle
        // "v:<url>" in order = a vehicle photo already on the server (first = featured)
        const form = new FormData();
        form.append('profile', '0');
        form.append('pages', JSON.stringify(pageList));
        form.append('order', JSON.stringify(photos.map((u) => `v:${u}`)));
        form.append('caption', caption.trim() || vehicleName(vehicle));
        form.append('hashtags', hashtags.trim());
        form.append('vehicle', vehicleName(vehicle));
        try {
          const r = await api<{ ok: boolean; count: number; media: number }>(`${FB}/post`, { method: 'POST', form, timeout: 180_000 });
          lines.push(`Posting to ${r.count} Page${r.count === 1 ? '' : 's'} with ${r.media} photo${r.media === 1 ? '' : 's'} has started.`);
        } catch (e) {
          ok = false;
          lines.push(`Pages: ${(e as Error).message}`);
        }
      }
      if (toMarketplace) {
        // POST /dealer/facebook/mp/publish { ids } → { queued, rejected: [{ id, error }] }
        try {
          const r = await api<{ queued: number; rejected: { id: string; error: string }[] }>(`${FB}/mp/publish`, { method: 'POST', body: { ids: [vehicle.id] }, timeout: 180_000 });
          if (r.queued) lines.push('Marketplace listing queued.');
          for (const x of r.rejected || []) {
            ok = false;
            lines.push(`Marketplace: ${x.error}`);
          }
        } catch (e) {
          ok = false;
          lines.push(`Marketplace: ${(e as Error).message}`);
        }
      }
      return { ok, lines };
    },
    onSuccess: (r) => {
      setResult(r);
      notify(r.ok);
      void state.refetch();
      void history.refetch();
    },
    onError: (e) => {
      notify(false);
      Alert.alert('Not posted', (e as Error).message);
    },
  });

  const canPost = !!vehicle && (selectedPages.length > 0 || toMarketplace) && (photos.length > 0 || caption.trim().length > 0);
  const togglePage = (url: string) => {
    tap();
    setPages(selectedPages.includes(url) ? selectedPages.filter((u) => u !== url) : [...selectedPages, url]);
  };
  const togglePhoto = (u: string) => {
    tap();
    setPhotos((cur) => (cur.includes(u) ? cur.filter((x) => x !== u) : cur.length >= MAX_MEDIA ? cur : [...cur, u]));
  };

  const refreshing = cfg.isRefetching || history.isRefetching;
  const refresh = useCallback(() => {
    void cfg.refetch();
    void history.refetch();
    void state.refetch();
  }, [cfg, history, state]);

  // Auto-refresh Facebook status when the app returns to the foreground
  const appState = useRef<string>(AppState.currentState || 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (/inactive|background/.test(appState.current) && nextState === 'active') {
        refresh();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [refresh]);

  // Determine the Dealer Web Portal URL for Facebook connection
  const portalUrl = useMemo(() => {
    const siteUrl = me?.tenant?.siteUrl?.trim();
    if (siteUrl && /^https?:\/\//i.test(siteUrl)) {
      return `${siteUrl.replace(/\/+$/, '')}/dealer/facebook`;
    }
    const apiHost = getApiUrl().trim();
    if (/revixasolutions\.com/i.test(apiHost)) {
      return 'https://portal.revixasolutions.com/dealer/facebook';
    }
    if (/localhost|127\.0\.0\.1/i.test(apiHost)) {
      return 'http://localhost:3000/dealer/facebook';
    }
    if (/^https?:\/\/\d+\.\d+\.\d+\.\d+/i.test(apiHost)) {
      try {
        const u = new URL(apiHost);
        return `http://${u.hostname}:3000/dealer/facebook`;
      } catch {
        /* fallback */
      }
    }
    return 'https://portal.revixasolutions.com/dealer/facebook';
  }, [me?.tenant?.siteUrl]);

  const openPortalFacebook = async () => {
    tap();
    try {
      const supported = await Linking.canOpenURL(portalUrl).catch(() => false);
      if (supported) {
        await Linking.openURL(portalUrl);
      } else {
        await Linking.openURL(portalUrl).catch(() => {
          Alert.alert('Unable to open browser', `Please open this address in your browser:\n\n${portalUrl}`);
        });
      }
    } catch {
      Alert.alert('Unable to open browser', `Please open this address in your browser:\n\n${portalUrl}`);
    }
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Card>
        <SectionTitle right={<Badge label={cfg.isLoading ? 'Checking…' : connected ? 'Connected' : cfg.data?.connection.loginLost ? 'Login lost' : 'Not connected'} tone={connected ? 'ok' : cfg.isLoading ? 'muted' : 'warn'} />}>
          Facebook account
        </SectionTitle>
        {cfg.error ? <Notice tone="bad">{(cfg.error as Error).message}</Notice> : null}
        {connected ? (
          <>
            <Text style={st.body}>
              {cfg.data?.connection.fbName || 'Your Facebook login'} · {allPages.length} Page{allPages.length === 1 ? '' : 's'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Button small variant="secondary" title="Load my Pages" icon={<RefreshCw size={16} color={C.ink} />} onPress={() => loadPages.mutate()} loading={loadPages.isPending} style={{ flex: 1 }} />
            </View>
          </>
        ) : cfg.data ? (
          <>
            <View style={{ marginTop: 8, marginBottom: 12 }}>
              <Notice tone="info">
                Facebook is connected securely via the Dealer Web Portal. Once you sign in to Facebook there, daily vehicle posting and Marketplace listings work directly inside this mobile app.
              </Notice>
            </View>
            <Text style={[st.body, { marginBottom: 14 }]}>
              {cfg.data.connection.loginLost
                ? 'Your Facebook session expired. Please open the Dealer Web Portal to log in again.'
                : 'Connect your Facebook account in your browser to post vehicles to your Pages and Marketplace.'}
            </Text>
            <View style={{ gap: 10 }}>
              <Button
                variant="facebook"
                title="Connect in Browser"
                icon={<ExternalLink size={18} color="#FFFFFF" />}
                onPress={openPortalFacebook}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button
                  small
                  variant="secondary"
                  title="Refresh Status"
                  icon={<RefreshCw size={15} color={C.ink} />}
                  onPress={refresh}
                  loading={cfg.isRefetching}
                  style={{ flex: 1 }}
                />
                {cfg.data.account.fbUserId ? (
                  <Button
                    small
                    variant="secondary"
                    title="Reconnect Saved"
                    onPress={() => connect.mutate()}
                    loading={connect.isPending}
                    style={{ flex: 1 }}
                  />
                ) : null}
              </View>
            </View>
          </>
        ) : null}
      </Card>

      {posting || job || batch ? (
        <Card style={{ borderColor: posting ? C.fb : C.line }}>
          <SectionTitle right={posting ? <Button small variant="secondary" title="Stop" icon={<Square size={14} color={C.bad} />} onPress={() => stop.mutate()} loading={stop.isPending} /> : undefined}>
            {posting ? 'Posting now…' : 'Last post'}
          </SectionTitle>
          {job ? (
            <View>
              {job.label ? <Text style={st.vname}>{job.label}</Text> : null}
              {job.results.map((r, i) => (
                <View key={`${r.url}-${i}`} style={st.resRow}>
                  <Text style={st.resName} numberOfLines={1}>{r.name || r.url}</Text>
                  <Text style={[st.resStatus, r.status === 'done' && { color: C.ok }, (r.status === 'failed' || r.status === 'skipped') && { color: C.bad }]}>{resultText(r)}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {batch && batch.items.length ? (
            <View style={{ marginTop: job ? 10 : 0 }}>
              <Text style={st.small}>Marketplace: {batch.done} done · {batch.running + batch.queued} in progress · {batch.failed + batch.attention} need attention</Text>
              {batch.items.slice(0, 8).map((it) => (
                <View key={it.id} style={st.resRow}>
                  <Text style={st.resName} numberOfLines={1}>{it.name}</Text>
                  <Text style={[st.resStatus, it.status === 'done' && { color: C.ok }, it.status === 'failed' && { color: C.bad }]} numberOfLines={2}>{it.error || it.step || it.status}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <SectionTitle>New post</SectionTitle>
        <Pressable
          style={st.vehicleBox}
          onPress={() => {
            tap();
            setPicker(true);
          }}
        >
          {vehicle ? (
            <>
              {cover(vehicle) ? <Image source={{ uri: mediaUrl(cover(vehicle)) }} style={st.pickThumb} /> : <View style={[st.pickThumb, st.centerBox]}><ImageOff size={16} color={C.faint} /></View>}
              <View style={{ flex: 1 }}>
                <Text style={st.vname} numberOfLines={1}>{vehicleName(vehicle)}</Text>
                <Text style={st.small}>{money(vehicle.price)} · tap to change</Text>
              </View>
            </>
          ) : (
            <Text style={[st.body, { flex: 1, color: C.primary, fontWeight: '700' }]}>Choose a vehicle from inventory</Text>
          )}
          <ChevronRight size={18} color={C.faint} />
        </Pressable>

        {vehicle ? (
          <>
            {vehicle.status !== 'PUBLISHED' ? <Notice tone="warn">This vehicle is not Available (for sale). Make it Available before posting.</Notice> : null}
            <Field label={`Photos (${photos.length} of ${vehicle.images.length} selected, first = cover)`}>
              {vehicle.images.length ? (
                <View style={st.photoGrid}>
                  {vehicle.images.map((u, i) => {
                    const idx = photos.indexOf(u);
                    return (
                      <Pressable key={`${u}-${i}`} onPress={() => togglePhoto(u)} style={st.photoCell}>
                        <Image source={{ uri: mediaUrl(u) }} style={[st.photo, idx < 0 && { opacity: 0.35 }]} />
                        {idx >= 0 ? (
                          <View style={st.photoNum}>
                            <Text style={st.photoNumText}>{idx + 1}</Text>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Button small variant="secondary" title="Add photos to this vehicle" onPress={() => router.push({ pathname: '/vehicle/edit/[id]', params: { id: vehicle.id } })} />
              )}
            </Field>
            <Field label="Caption" hint={generate.isPending ? 'Writing the caption from the vehicle…' : 'Written from the vehicle by the server template. Edit it as you like.'}>
              <Input value={caption} onChangeText={setCaption} multiline style={{ minHeight: 170 }} maxLength={8000} />
            </Field>
            <Field label="Hashtags">
              <Input value={hashtags} onChangeText={setHashtags} autoCapitalize="none" placeholder="#usedcars #ford" />
            </Field>

            <Text style={st.label}>Post to</Text>
            {allPages.length ? (
              allPages.map((p) => {
                const on = selectedPages.includes(p.url);
                return (
                  <Pressable key={p.url} style={st.target} onPress={() => togglePage(p.url)}>
                    <View style={[st.box, on && st.boxOn]}>{on ? <Check size={15} color="#FFFFFF" /> : null}</View>
                    <Text style={st.targetText} numberOfLines={1}>{p.name || p.url}</Text>
                    <Badge label="Page" />
                  </Pressable>
                );
              })
            ) : (
              <Text style={st.small}>{connected ? 'No Pages saved yet. Tap “Load my Pages” above.' : 'Connect Facebook to post to your Pages.'}</Text>
            )}
            <View style={st.target}>
              <Facebook size={20} color={C.fb} />
              <Text style={st.targetText}>Marketplace listing</Text>
              <Switch value={toMarketplace} onValueChange={setToMarketplace} />
            </View>

            {result ? (
              <View style={{ marginTop: 12, marginBottom: -4 }}>
                <Notice tone={result.ok ? 'ok' : 'warn'}>{result.lines.join('\n') || 'Nothing was posted.'}</Notice>
              </View>
            ) : null}

            <Button
              title="Post to Facebook / Marketplace"
              variant="facebook"
              icon={<Facebook size={18} color="#FFFFFF" />}
              onPress={() => post.mutate()}
              loading={post.isPending}
              disabled={!canPost || !connected}
              style={{ marginTop: 12 }}
            />
            {!connected ? <Text style={st.small}>Connect Facebook first (see above).</Text> : null}
          </>
        ) : null}
      </Card>

      <Card>
        <SectionTitle>Recent posts</SectionTitle>
        {history.isLoading ? (
          <Text style={st.small}>Loading…</Text>
        ) : history.error ? (
          <Text style={[st.small, { color: C.bad }]}>{(history.error as Error).message}</Text>
        ) : history.data?.runs.length ? (
          history.data.runs.map((r) => (
            <View key={r.id} style={st.run}>
              <Text style={st.runWhen}>{dateTime(r.startedAt)}</Text>
              <Text style={st.body} numberOfLines={2}>{(r.caption || '').split('\n')[0] || '(no caption)'}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {r.ok > 0 ? <Badge label={`${r.ok} posted`} tone="ok" /> : null}
                {r.failed > 0 ? <Badge label={`${r.failed} failed`} tone="bad" /> : null}
                {r.cancelled ? <Badge label="Stopped" tone="warn" /> : null}
                {!r.finishedAt && !r.cancelled ? <Badge label="In progress" tone="info" /> : null}
                <Badge label={`${r.media} photo${r.media === 1 ? '' : 's'}`} />
              </View>
            </View>
          ))
        ) : (
          <Text style={st.small}>Nothing posted yet.</Text>
        )}
      </Card>

      <VehiclePicker open={picker} onClose={() => setPicker(false)} onPick={choose} />
    </Screen>
  );
}

const st = StyleSheet.create({
  body: { fontSize: 14, color: C.text, lineHeight: 20 },
  small: { fontSize: 13, color: C.muted, lineHeight: 18, marginTop: 2 },
  label: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 6 },
  vname: { fontSize: 15, fontWeight: '700', color: C.ink },
  vehicleBox: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: 12, marginBottom: 14, minHeight: 64 },
  pickHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  pickTitle: { fontSize: 20, fontWeight: '800', color: C.ink },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, paddingHorizontal: 12, height: 46, borderRadius: R.md, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.line },
  searchInput: { flex: 1, fontSize: 16, color: C.ink, paddingVertical: 0 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: 10, marginBottom: 10 },
  pickThumb: { width: 64, height: 48, borderRadius: 8, backgroundColor: '#E2E8F0' },
  centerBox: { alignItems: 'center', justifyContent: 'center' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 },
  photoCell: { width: '25%', padding: 3 },
  photo: { width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: '#E2E8F0' },
  photoNum: { position: 'absolute', top: 7, left: 7, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  photoNumText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  target: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  targetText: { flex: 1, fontSize: 15, color: C.ink, fontWeight: '600' },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.faint, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.primary, borderColor: C.primary },
  resRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, marginTop: 6 },
  resName: { flex: 1, fontSize: 14, color: C.ink, fontWeight: '600' },
  resStatus: { fontSize: 13, color: C.muted, maxWidth: '55%', textAlign: 'right' },
  run: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  runWhen: { fontSize: 12, color: C.muted, marginBottom: 2 },
});
