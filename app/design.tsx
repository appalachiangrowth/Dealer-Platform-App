import React, { useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Lock, RotateCcw } from 'lucide-react-native';
import { api, ApiError, mediaUrl } from '../src/lib/api';
import { C, R } from '../src/lib/theme';
import { Badge, Button, Card, ErrorView, Input, Loading, Notice, Screen, SectionTitle, notify, tap } from '../src/components/ui';

/**
 * Design & colours — the same endpoints as dealer-portal/app/dealer/design/page.tsx (permission "design"):
 *   GET  /dealer/design            → { current, colors: { slots, values }, catalog, paymentInstructions }
 *   POST /dealer/design/activate   { themeId }           → the same answer as GET
 *   PUT  /dealer/design/colors     { colors: { [slot.key]: '#RRGGBB' } } → the same answer as GET
 *   POST /dealer/design/request    { themeId, note }     (ask the platform to unlock a paid design)
 * The colour boxes are the active design's own "colour slots" — each design defines its own list.
 */
type Slot = { key: string; label: string; default: string; hint: string };
type Access = { paid: boolean; label: string; unlocked: boolean; requested: string; allowed: boolean };
type Theme = { id: string; name: string; description: string; style: string; previewUrl: string; version: string; active: boolean; access: Access };
type DesignView = {
  current: { themeId: string; name: string; version: string };
  colors: { slots: Slot[]; values: Record<string, string> };
  catalog: Theme[];
  paymentInstructions: string;
};

// the backend accepts #RGB and #RRGGBB (common/util.ts isColor)
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const full = (h: string) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h).toUpperCase();
/** quick picks (the server has no preset list: any hex colour is allowed) */
const PRESETS = ['#0F172A', '#1D4ED8', '#0EA5E9', '#0D9488', '#15803D', '#CA8A04', '#EA580C', '#DC2626', '#BE185D', '#7C3AED', '#475569', '#FFFFFF'];

/** black or white text, whichever reads better on this colour */
function inkOn(hex: string): string {
  const h = full(hex);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0F172A' : '#FFFFFF';
}

function ThemeImage({ url }: { url: string }) {
  const [failed, setFailed] = useState(!url);
  if (failed) return <View style={[st.themeImg, { alignItems: 'center', justifyContent: 'center' }]}><Text style={st.small}>No preview picture</Text></View>;
  return <Image source={{ uri: mediaUrl(url) }} style={st.themeImg} resizeMode="cover" onError={() => setFailed(true)} />;
}

export default function Design() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['design'], queryFn: () => api<DesignView>('/dealer/design') });
  const data = q.data;
  const [colors, setColors] = useState<Record<string, string>>({});
  const [slotKey, setSlotKey] = useState('');

  useEffect(() => {
    if (data) setColors(data.colors.values || {});
  }, [data]);

  const done = (r: DesignView, msg: string) => {
    qc.setQueryData(['design'], r);
    notify(true);
    Alert.alert(msg);
  };
  const fail = (title: string) => (e: Error) => {
    notify(false);
    Alert.alert(title, e.message);
  };

  const activate = useMutation({
    mutationFn: (themeId: string) => api<DesignView>('/dealer/design/activate', { method: 'POST', body: { themeId } }),
    onSuccess: (r) => done(r, 'Your website now uses this design'),
    onError: fail('Design not changed'),
  });
  const save = useMutation({
    mutationFn: (c: Record<string, string>) => api<DesignView>('/dealer/design/colors', { method: 'PUT', body: { colors: c } }),
    onSuccess: (r) => done(r, 'Colours saved — your website is updated'),
    onError: fail('Colours not saved'),
  });
  const request = useMutation({
    mutationFn: (themeId: string) => api<unknown>('/dealer/design/request', { method: 'POST', body: { themeId, note: 'Requested from the mobile app' } }),
    onSuccess: () => {
      notify(true);
      void q.refetch();
      Alert.alert('Request sent', 'The platform team will contact you to complete the payment. The design is unlocked as soon as it is confirmed.');
    },
    onError: fail('Request not sent'),
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !data) {
    if (q.error instanceof ApiError && q.error.status === 403) {
      return (
        <Screen>
          <Notice tone="warn">Your login does not have the “Design & colours” permission. Ask your dealership admin.</Notice>
        </Screen>
      );
    }
    return <ErrorView message={(q.error as Error)?.message || 'Could not load the designs'} onRetry={() => void q.refetch()} />;
  }

  const slots = data.colors.slots || [];
  const saved = data.colors.values || {};
  const shown = (s: Slot) => {
    const v = (colors[s.key] || '').trim();
    return HEX.test(v) ? full(v) : HEX.test(s.default) ? full(s.default) : '#1D4ED8';
  };
  const changed = slots.some((s) => (colors[s.key] || '').toUpperCase() !== (saved[s.key] || '').toUpperCase());
  const invalid = slots.filter((s) => (colors[s.key] || '').trim() && !HEX.test((colors[s.key] || '').trim()));
  const active = slots.find((s) => s.key === slotKey) || slots[0];
  const setColor = (key: string, v: string) => setColors((c) => ({ ...c, [key]: v }));

  // which colours play "header", "button" and "badge" in the preview: by the slot names, else by position
  const find = (re: RegExp, fallback: number) => slots.find((s) => re.test(`${s.key} ${s.label}`)) || slots[Math.min(fallback, slots.length - 1)];
  const primary = slots.length ? shown(find(/primary|brand|main/i, 0)) : '#1D4ED8';
  const accent = slots.length ? shown(find(/accent|secondary|highlight|button/i, 1)) : '#EA580C';
  const head = slots.length ? shown(find(/header|dark|nav|background/i, 0)) : primary;

  const submit = () => {
    const out: Record<string, string> = {};
    for (const s of slots) {
      const v = (colors[s.key] || '').trim();
      if (HEX.test(v)) out[s.key] = full(v);
    }
    save.mutate(out);
  };

  const confirmUse = (t: Theme) =>
    Alert.alert(`Use ${t.name}?`, 'Your live website switches to this design straight away. Your text, vehicles and business details stay as they are.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Use this design', onPress: () => activate.mutate(t.id) },
    ]);
  const confirmRequest = (t: Theme) =>
    Alert.alert(`Unlock ${t.name} · ${t.access.label}`, data.paymentInstructions || 'Your request goes to the platform team, who complete the payment with you.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send request', onPress: () => request.mutate(t.id) },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
        {/* live preview */}
        <View style={st.preview}>
          <View style={[st.pvHead, { backgroundColor: head }]}>
            <Text style={[st.pvBrand, { color: inkOn(head) }]}>Your Dealership</Text>
            <Text style={[st.pvNav, { color: inkOn(head) }]}>Inventory · About · Contact</Text>
          </View>
          <View style={st.pvBody}>
            <View style={[st.pvBadge, { backgroundColor: accent }]}>
              <Text style={[st.pvBadgeText, { color: inkOn(accent) }]}>GREAT DEAL</Text>
            </View>
            <Text style={st.pvTitle}>2021 Ford F-150 XLT</Text>
            <Text style={[st.pvPrice, { color: inkOn(primary) === '#FFFFFF' ? primary : C.ink }]}>$34,995</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <View style={[st.pvBtn, { backgroundColor: primary }]}>
                <Text style={[st.pvBtnText, { color: inkOn(primary) }]}>View details</Text>
              </View>
              <View style={[st.pvBtn, { backgroundColor: accent }]}>
                <Text style={[st.pvBtnText, { color: inkOn(accent) }]}>Call now</Text>
              </View>
            </View>
          </View>
          <Text style={st.pvNote}>Preview · {data.current.name} with your colours</Text>
        </View>

        <Card>
          <SectionTitle>Brand colours</SectionTitle>
          <Text style={st.small}>For {data.current.name}. Tap a colour box, then pick a swatch or type a hex code.</Text>
          {slots.length === 0 ? <Text style={[st.small, { marginTop: 8 }]}>This design has no colours to change.</Text> : null}
          {slots.map((s) => {
            const v = colors[s.key] || '';
            const on = active?.key === s.key;
            const bad = !!v.trim() && !HEX.test(v.trim());
            return (
              <Pressable key={s.key} onPress={() => setSlotKey(s.key)} style={[st.slot, on && st.slotOn]}>
                <View style={[st.swatchBig, { backgroundColor: shown(s) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={st.slotLabel}>{s.label}</Text>
                  {s.hint ? <Text style={st.small}>{s.hint}</Text> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <Input
                      value={v}
                      onChangeText={(t) => setColor(s.key, t.trim().toUpperCase().slice(0, 7))}
                      onFocus={() => setSlotKey(s.key)}
                      placeholder={s.default}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={7}
                      invalid={bad}
                      style={{ flex: 1, minHeight: 42, fontSize: 15 }}
                    />
                    {v && v.toUpperCase() !== s.default.toUpperCase() ? (
                      <Pressable hitSlop={10} onPress={() => setColor(s.key, s.default.toUpperCase())} accessibilityLabel="Back to the design's own colour">
                        <RotateCcw size={18} color={C.muted} />
                      </Pressable>
                    ) : null}
                  </View>
                  {bad ? <Text style={st.err}>Use a hex code like #1D4ED8.</Text> : null}
                </View>
              </Pressable>
            );
          })}

          {active ? (
            <>
              <Text style={[st.small, { marginTop: 12, marginBottom: 8 }]}>Swatches for “{active.label}”</Text>
              <View style={st.presets}>
                {[...new Set([full(HEX.test(active.default) ? active.default : '#1D4ED8'), ...PRESETS])].map((c) => {
                  const sel = shown(active) === c;
                  return (
                    <Pressable
                      key={c}
                      accessibilityLabel={`Colour ${c}`}
                      onPress={() => {
                        tap();
                        setColor(active.key, c);
                      }}
                      style={[st.preset, { backgroundColor: c }, sel && st.presetOn]}
                    >
                      {sel ? <Check size={16} color={inkOn(c)} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {slots.length ? (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              {changed ? <Button title="Undo" variant="secondary" onPress={() => setColors(saved)} style={{ flex: 1 }} /> : null}
              <Button title="Save colours" onPress={submit} loading={save.isPending} disabled={!changed || invalid.length > 0} style={{ flex: 2 }} />
            </View>
          ) : null}
        </Card>

        <SectionTitle>Website designs</SectionTitle>
        {data.catalog.map((t) => (
          <View key={t.id} style={[st.theme, t.active && st.themeOn]}>
            <ThemeImage url={t.previewUrl} />
            {t.active ? (
              <View style={st.activeTag}>
                <Check size={12} color="#FFFFFF" />
                <Text style={st.activeText}>Active</Text>
              </View>
            ) : t.access.paid && !t.access.unlocked ? (
              <View style={[st.activeTag, { backgroundColor: 'rgba(15,23,42,0.85)' }]}>
                <Lock size={12} color="#FFFFFF" />
                <Text style={st.activeText}>{t.access.label}</Text>
              </View>
            ) : null}
            <View style={{ padding: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text style={st.themeName}>{t.name}</Text>
                {t.style ? <Badge label={t.style} /> : null}
              </View>
              {t.description ? <Text style={[st.small, { marginTop: 4 }]}>{t.description}</Text> : null}
              <View style={{ marginTop: 12 }}>
                {t.active ? (
                  <Text style={[st.small, { color: C.ok, fontWeight: '700' }]}>Your website uses this design.</Text>
                ) : t.access.allowed ? (
                  <Button small title="Use this design" onPress={() => confirmUse(t)} loading={activate.isPending && activate.variables === t.id} />
                ) : t.access.requested ? (
                  <Badge label="Requested — waiting for confirmation" tone="warn" />
                ) : (
                  <Button small variant="secondary" title={`Unlock · ${t.access.label}`} icon={<Lock size={15} color={C.ink} />} onPress={() => confirmRequest(t)} loading={request.isPending && request.variables === t.id} />
                )}
              </View>
            </View>
          </View>
        ))}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  small: { fontSize: 13, color: C.muted, lineHeight: 18 },
  err: { fontSize: 12, color: C.bad, marginTop: 4 },
  preview: { borderRadius: R.lg, overflow: 'hidden', borderWidth: 1, borderColor: C.line, backgroundColor: '#FFFFFF', marginBottom: 14 },
  pvHead: { paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pvBrand: { fontSize: 16, fontWeight: '800' },
  pvNav: { fontSize: 11, opacity: 0.85 },
  pvBody: { padding: 14 },
  pvBadge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 8 },
  pvBadgeText: { fontSize: 11, fontWeight: '800' },
  pvTitle: { fontSize: 17, fontWeight: '800', color: C.ink },
  pvPrice: { fontSize: 19, fontWeight: '800', marginTop: 2 },
  pvBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  pvBtnText: { fontSize: 13, fontWeight: '700' },
  pvNote: { fontSize: 11, color: C.muted, paddingHorizontal: 14, paddingBottom: 10 },
  slot: { flexDirection: 'row', gap: 12, padding: 10, borderRadius: R.md, borderWidth: 1, borderColor: 'transparent', marginTop: 8 },
  slotOn: { borderColor: C.primary, backgroundColor: '#F8FAFF' },
  swatchBig: { width: 46, height: 46, borderRadius: 10, borderWidth: 1, borderColor: C.line },
  slotLabel: { fontSize: 15, fontWeight: '700', color: C.ink },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  preset: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  presetOn: { borderWidth: 3, borderColor: C.ink },
  theme: { backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, overflow: 'hidden', marginBottom: 14 },
  themeOn: { borderColor: C.primary, borderWidth: 2 },
  themeImg: { width: '100%', aspectRatio: 16 / 10, backgroundColor: '#E2E8F0' },
  activeTag: { position: 'absolute', left: 10, top: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.primary, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  activeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  themeName: { fontSize: 16, fontWeight: '800', color: C.ink, flexShrink: 1 },
});
