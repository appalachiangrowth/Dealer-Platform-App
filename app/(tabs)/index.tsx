import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Building2, Car, Facebook, Palette, Plus, RefreshCw, Sparkles } from 'lucide-react-native';
import { api, ApiError, mediaUrl } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, R } from '../../src/lib/theme';
import type { CgMonitor, Dashboard, FbQuickConfig } from '../../src/lib/types';
import { Badge, Notice, Screen, SectionTitle, tap } from '../../src/components/ui';

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'ok' ? C.ok : tone === 'warn' ? C.warn : tone === 'bad' ? C.bad : C.ink;
  return (
    <View style={st.kpi}>
      <View style={st.kpiCard}>
        <Text style={st.kpiLabel}>{label}</Text>
        <Text style={[st.kpiValue, { color }, value.length > 6 && { fontSize: 17 }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        {sub ? <Text style={st.kpiSub} numberOfLines={2}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function Action({ label, icon, onPress, primary }: { label: string; icon: React.ReactNode; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [st.action, primary && { backgroundColor: C.primary, borderColor: C.primary }, pressed && { opacity: 0.8 }]}
    >
      {icon}
      <Text style={[st.actionText, primary && { color: '#FFFFFF' }]}>{label}</Text>
    </Pressable>
  );
}

export default function Home() {
  const router = useRouter();
  const { dealership, me, isOwner } = useSession();
  const [ask, setAsk] = useState('');
  // AI search: the question is answered on the Inventory tab
  const goAsk = () => {
    const t = ask.trim();
    if (!t) return;
    setAsk('');
    router.push({ pathname: '/(tabs)/inventory', params: { ask: t } });
  };

  // GET /dealer/dashboard → { vehicles: { published, draft, sold }, … }
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dealer/dashboard') });
  // GET /dealer/feeds/cargurus/monitor (403 code "cargurus_off" when CarGurus is not switched on)
  const cg = useQuery({ queryKey: ['cg-monitor'], queryFn: () => api<CgMonitor>('/dealer/feeds/cargurus/monitor') });
  // GET /dealer/facebook/quick-config → saved Facebook login (does not wake the server browser)
  const fb = useQuery({ queryKey: ['fb-config'], queryFn: () => api<FbQuickConfig>('/dealer/facebook/quick-config') });

  const v = dash.data?.vehicles;
  const total = v ? v.published + v.draft + v.sold : 0;
  const cgOff = cg.error instanceof ApiError && cg.error.status === 403;
  const cgValue = cg.data ? (cg.data.liveCount > 0 ? `${cg.data.liveCount} live` : cg.data.pending ? 'In review' : 'Not sent') : cgOff ? 'Off' : cg.isLoading ? '…' : '—';
  const cgSub = cg.data ? `${cg.data.ready.length} ready · ${cg.data.attention.length} need attention` : cgOff ? 'Not switched on' : cg.error ? 'Could not load' : '';
  const fbOn = !!fb.data?.connection.connected;
  const fbValue = fb.data ? (fbOn ? 'Connected' : fb.data.connection.loginLost ? 'Login lost' : 'Not connected') : fb.isLoading ? '…' : '—';

  const refreshing = dash.isRefetching || cg.isRefetching || fb.isRefetching;
  const refresh = () => {
    void dash.refetch();
    void cg.refetch();
    void fb.refetch();
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={st.header}>
        {dealership?.logo ? (
          <Image source={{ uri: mediaUrl(dealership.logo) }} style={st.logo} resizeMode="contain" />
        ) : (
          <View style={[st.logo, st.logoEmpty]}>
            <Building2 size={26} color={C.muted} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={st.name} numberOfLines={2}>{dealership?.name || 'Your dealership'}</Text>
          <Text style={st.user} numberOfLines={1}>{me?.user.name || me?.user.login}</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
            <Badge label={dealership?.status === 'SUSPENDED' ? 'Suspended' : 'Active'} tone={dealership?.status === 'SUSPENDED' ? 'bad' : 'ok'} />
            {isOwner ? <Badge label="Support mode" tone="info" /> : null}
          </View>
        </View>
      </View>

      <View style={st.ask}>
        <Sparkles size={18} color="#6D28D9" />
        <TextInput
          value={ask}
          onChangeText={setAsk}
          onSubmitEditing={goAsk}
          placeholder="Ask AI: red SUV under 25000…"
          placeholderTextColor={C.faint}
          style={st.askInput}
          returnKeyType="search"
          autoCorrect={false}
        />
        <Pressable onPress={goAsk} disabled={!ask.trim()} style={[st.askBtn, !ask.trim() && { opacity: 0.4 }]} accessibilityLabel="Ask AI">
          <Text style={st.askBtnText}>Ask</Text>
        </Pressable>
      </View>

      {dash.error ? <Notice tone="bad">{(dash.error as Error).message}</Notice> : null}

      <View style={st.grid}>
        <Kpi label="Total Vehicles" value={v ? String(total) : '…'} />
        <Kpi label="Available" value={v ? String(v.published) : '…'} tone="ok" />
        <Kpi label="Pending" value={v ? String(v.draft) : '…'} tone="warn" />
        <Kpi label="Sold" value={v ? String(v.sold) : '…'} />
        <Kpi label="CarGurus Sync" value={cgValue} sub={cgSub} tone={cg.data?.liveCount ? 'ok' : cg.data?.attention.length ? 'warn' : undefined} />
        <Kpi label="Facebook Posting" value={fbValue} sub={fbOn && fb.data?.connection.fbName ? fb.data.connection.fbName : undefined} tone={fbOn ? 'ok' : fb.data ? 'warn' : undefined} />
      </View>

      <SectionTitle>Quick actions</SectionTitle>
      <View style={st.grid}>
        <Action primary label="+ Add Vehicle" icon={<Plus size={26} color="#FFFFFF" />} onPress={() => router.push('/vehicle/add')} />
        <Action label="Manage Inventory" icon={<Car size={26} color={C.primary} />} onPress={() => router.push('/(tabs)/inventory')} />
        <Action label="CarGurus Sync" icon={<RefreshCw size={26} color={C.primary} />} onPress={() => router.push('/(tabs)/cargurus')} />
        <Action label="Facebook Post" icon={<Facebook size={26} color={C.fb} />} onPress={() => router.push('/(tabs)/facebook')} />
        <Action label="Business Details" icon={<Building2 size={26} color={C.primary} />} onPress={() => router.push('/(tabs)/settings')} />
        <Action label="Design & Colors" icon={<Palette size={26} color={C.primary} />} onPress={() => router.push('/design')} />
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: R.lg, padding: 16, borderWidth: 1, borderColor: C.line, marginBottom: 14 },
  logo: { width: 64, height: 64, borderRadius: 14, backgroundColor: '#FFFFFF' },
  logoEmpty: { backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  ask: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FAF5FF', borderWidth: 1, borderColor: '#C4B5FD', borderRadius: R.md, paddingLeft: 12, paddingRight: 6, height: 50, marginBottom: 14 },
  askInput: { flex: 1, fontSize: 16, color: C.ink, paddingVertical: 0 },
  askBtn: { backgroundColor: '#6D28D9', borderRadius: 10, paddingHorizontal: 14, height: 38, alignItems: 'center', justifyContent: 'center' },
  askBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  name: { fontSize: 19, fontWeight: '800', color: C.ink },
  user: { fontSize: 13, color: C.muted, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, marginBottom: 10 },
  kpi: { width: '50%', padding: 5 },
  kpiCard: { backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 14, minHeight: 92 },
  kpiLabel: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.3 },
  kpiValue: { fontSize: 28, fontWeight: '800', marginTop: 4 },
  kpiSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  action: { width: '47%', marginHorizontal: '1.5%', marginVertical: 5, minHeight: 96, borderRadius: R.lg, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 },
  actionText: { fontSize: 15, fontWeight: '700', color: C.ink, textAlign: 'center' },
});
