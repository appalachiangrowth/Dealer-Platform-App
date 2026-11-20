import React, { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FlaskConical, ImageOff, RefreshCw, Send, TriangleAlert } from 'lucide-react-native';
import { api, ApiError, mediaUrl } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, R } from '../../src/lib/theme';
import { dateTime, money } from '../../src/lib/format';
import type { CgDispatch, CgDryRun, CgMonitor, CgRow } from '../../src/lib/types';
import { Badge, Button, Card, Chip, ErrorView, Loading, Notice, Screen, SectionTitle, notify, tap } from '../../src/components/ui';

const SYNC: Record<string, string> = {
  uploaded: 'sent to CarGurus',
  not_configured: 'approved, CarGurus delivery (SFTP) not set up yet',
  failed: 'upload failed',
  no_feed: 'no approved feed yet',
};

function Stat({ k, n, sub, tone }: { k: string; n: string; sub?: string; tone?: 'ok' | 'bad' }) {
  return (
    <View style={st.stat}>
      <View style={st.statCard}>
        <Text style={st.statK}>{k}</Text>
        <Text style={[st.statN, tone === 'ok' && { color: C.ok }, tone === 'bad' && { color: C.bad }, n.length > 8 && { fontSize: 14 }]}>{n}</Text>
        {sub ? <Text style={st.statSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function VehicleRow({ r, onPress }: { r: CgRow; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={st.vrow}
    >
      {r.image ? (
        <Image source={{ uri: mediaUrl(r.image) }} style={st.thumb} />
      ) : (
        <View style={[st.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
          <ImageOff size={16} color={C.faint} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={st.vname} numberOfLines={1}>{r.name || 'Vehicle'}</Text>
        <Text style={st.vmeta} numberOfLines={1}>{[r.vin, r.stock && `Stock ${r.stock}`, money(r.price)].filter(Boolean).join(' · ')}</Text>
        {r.issues?.length ? (
          r.issues.map((x, i) => (
            <Text key={i} style={st.issue}>
              <Text style={{ fontWeight: '700' }}>{x.label}: </Text>
              {x.msg.replace(/ - https?:\/\/\S+$/, '')}
            </Text>
          ))
        ) : (
          <View style={{ marginTop: 5 }}>{r.live ? <Badge label="On CarGurus" tone="ok" /> : <Badge label="Queued · being verified" tone="warn" />}</View>
        )}
      </View>
    </Pressable>
  );
}

export default function CarGurus() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isOwner, dealership } = useSession();
  const [tab, setTab] = useState<'attention' | 'ready'>('attention');
  const [dry, setDry] = useState<CgDryRun | null>(null);
  const [sync, setSync] = useState<CgDispatch | null>(null);

  // GET /dealer/feeds/cargurus/monitor
  const mon = useQuery({ queryKey: ['cg-monitor'], queryFn: () => api<CgMonitor>('/dealer/feeds/cargurus/monitor') });
  const M = mon.data;
  const tenantId = dealership?.id || '';
  const reload = () => void qc.invalidateQueries({ queryKey: ['cg-monitor'] });

  // Dealer: POST /dealer/feeds/cargurus/submit-inventory — stages every vehicle for sale for Platform Admin verification
  const submit = useMutation({
    mutationFn: () => api<unknown>('/dealer/feeds/cargurus/submit-inventory', { method: 'POST', body: {} }),
    onSuccess: () => {
      notify(true);
      reload();
      Alert.alert('Inventory sent', 'Your vehicles are queued for verification. They go to CarGurus as soon as the platform team approves the feed.');
    },
    onError: (e) => {
      notify(false);
      Alert.alert('Could not send the inventory', (e as Error).message);
    },
  });

  // Platform Admin: POST /platform/cargurus/:tenantId/:submissionId/dry-run { includeInvalid }
  //                 (no waiting batch → POST /api/cargurus/dry-run { tenantId } checks the latest / live feed)
  const dryRun = useMutation({
    mutationFn: () =>
      M?.pending
        ? api<CgDryRun>(`/platform/cargurus/${tenantId}/${M.pending.id}/dry-run`, { method: 'POST', body: { includeInvalid: false }, timeout: 60_000 })
        : api<CgDryRun>('/api/cargurus/dry-run', { method: 'POST', body: { tenantId, includeInvalid: false }, timeout: 60_000 }),
    onSuccess: (r) => {
      setDry(r);
      notify(r.status === 'READY_TO_SYNC');
    },
    onError: (e) => {
      notify(false);
      Alert.alert('Dry run failed', (e as Error).message);
    },
  });

  // Platform Admin: POST /platform/cargurus/:tenantId/:submissionId/approve { includeInvalid } → { ok, vehicles, dispatch }
  //                 (nothing waiting but a live feed exists → POST /platform/cargurus/:tenantId/resend)
  const approve = useMutation({
    mutationFn: async (): Promise<CgDispatch> => {
      if (M?.pending) {
        const r = await api<{ ok: boolean; vehicles: number; dispatch: CgDispatch }>(`/platform/cargurus/${tenantId}/${M.pending.id}/approve`, { method: 'POST', body: { includeInvalid: false }, timeout: 120_000 });
        return { ...r.dispatch, rows: r.dispatch?.rows ?? r.vehicles };
      }
      return api<CgDispatch>(`/platform/cargurus/${tenantId}/resend`, { method: 'POST', body: {}, timeout: 120_000 });
    },
    onSuccess: (r) => {
      setSync(r);
      setDry(null);
      notify(!!r.sent);
      reload();
    },
    onError: (e) => {
      notify(false);
      Alert.alert('Sync failed', (e as Error).message);
    },
  });

  const confirmApprove = () =>
    Alert.alert(
      M?.pending ? 'Approve & sync now?' : 'Re-send the live feed?',
      M?.pending ? `${M.pending.vehicles} vehicle(s) are waiting. Vehicles with problems are left out. The feed is uploaded to CarGurus over SFTP straight away.` : 'The approved feed is uploaded to CarGurus again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: M?.pending ? 'Approve & Sync' : 'Re-send', onPress: () => approve.mutate() },
      ],
    );

  if (mon.isLoading) return <Loading />;
  if (mon.error) {
    const off = mon.error instanceof ApiError && mon.error.status === 403;
    if (off)
      return (
        <Screen onRefresh={() => void mon.refetch()} refreshing={mon.isRefetching}>
          <Notice tone="warn">{(mon.error as Error).message}</Notice>
        </Screen>
      );
    return <ErrorView message={(mon.error as Error).message} onRetry={() => void mon.refetch()} />;
  }
  if (!M) return null;

  const rows = tab === 'ready' ? M.ready : M.attention;
  const ap = M.approved;
  const last = M.lastSync;
  const lastTxt = ap ? dateTime(ap.at) : 'Not sent yet';
  const lastSub = ap ? (last ? SYNC[last.status || ''] || (last.sent ? SYNC.uploaded : last.reason || '') : `${ap.vehicles} vehicle(s) approved`) : 'First feed goes out after verification';
  const dl = M.dealer || {};
  const canSync = !!M.pending || !!ap;

  return (
    <Screen refreshing={mon.isRefetching} onRefresh={() => void mon.refetch()}>
      <Card>
        <SectionTitle>Connection & feed</SectionTitle>
        <View style={st.kv}>
          <Text style={st.kvK}>Dealer ID</Text>
          <Text style={st.kvV}>{dl.id || '—'}</Text>
        </View>
        <View style={st.kv}>
          <Text style={st.kvK}>Feed status</Text>
          <Text style={st.kvV}>{M.liveCount > 0 ? 'Live on CarGurus' : M.pending ? 'Waiting for verification' : 'Not sent yet'}</Text>
        </View>
        <View style={st.kv}>
          <Text style={st.kvK}>Last sync</Text>
          <Text style={st.kvV}>{lastTxt}</Text>
        </View>
        <View style={[st.kv, { borderBottomWidth: 0 }]}>
          <Text style={st.kvK}>Eligible vehicles</Text>
          <Text style={st.kvV}>{M.ready.length}</Text>
        </View>
      </Card>

      <View style={st.stats}>
        <Stat k="Live on feed" n={String(M.liveCount)} tone="ok" />
        <Stat k="Ready" n={String(M.ready.length)} sub={M.pending ? `queued ${dateTime(M.pending.at)}` : undefined} />
        <Stat k="Need attention" n={String(M.attention.length)} tone={M.attention.length ? 'bad' : undefined} />
        <Stat k="Last feed" n={ap ? `${ap.vehicles} sent` : '—'} sub={lastSub} />
      </View>

      {M.dealerWarnings.length ? (
        <Notice tone="warn">
          Your dealer details need attention before CarGurus can list your cars: {M.dealerWarnings.join(' · ')}. Fix them in the Business tab.
        </Notice>
      ) : null}

      <Card>
        <SectionTitle>Actions</SectionTitle>
        {isOwner ? (
          <View style={{ gap: 10 }}>
            <Button title="Run Dry Run" variant="secondary" icon={<FlaskConical size={18} color={C.ink} />} onPress={() => dryRun.mutate()} loading={dryRun.isPending} />
            <Button title={M.pending ? 'Approve & Sync Now' : 'Re-send Live Feed'} icon={<RefreshCw size={18} color="#FFFFFF" />} onPress={confirmApprove} loading={approve.isPending} disabled={!canSync} />
            {!canSync ? <Text style={st.small}>Nothing is waiting for approval yet. Publish vehicles in Inventory first.</Text> : null}
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <Button title="Send Inventory for Verification" icon={<Send size={18} color="#FFFFFF" />} onPress={() => submit.mutate()} loading={submit.isPending} />
            <Text style={st.small}>
              Your inventory is also staged automatically after every change. “Run Dry Run” and “Approve & Sync Now” are Platform Admin actions on the server
              (/platform/cargurus/…): log in with a Platform Admin account (Login › Server settings) to use them here.
            </Text>
          </View>
        )}
      </Card>

      {sync ? (
        <Card style={{ borderColor: sync.sent ? C.ok : C.warn }}>
          <SectionTitle>{sync.sent ? 'Feed uploaded to CarGurus' : 'Feed not uploaded'}</SectionTitle>
          <Text style={st.body}>{sync.sent ? `${sync.rows ?? ''} vehicle row(s) sent${sync.host ? ` to ${sync.host}` : ''}.` : sync.reason || SYNC[sync.status || ''] || 'The upload did not go through.'}</Text>
          {sync.remotePath ? <Text style={st.small}>File: {sync.remotePath}</Text> : null}
        </Card>
      ) : null}

      {dry ? (
        <Card style={{ borderColor: dry.status === 'READY_TO_SYNC' ? C.ok : C.warn }}>
          <SectionTitle right={<Badge label={dry.status === 'READY_TO_SYNC' ? 'Ready to sync' : 'Action required'} tone={dry.status === 'READY_TO_SYNC' ? 'ok' : 'warn'} />}>Dry run result</SectionTitle>
          <View style={st.stats}>
            <Stat k="Checked" n={String(dry.summary.totalEvaluated)} />
            <Stat k="Passed" n={String(dry.summary.validCount)} tone="ok" />
            <Stat k="Failed" n={String(dry.summary.blockedCount)} tone={dry.summary.blockedCount ? 'bad' : undefined} />
            <Stat k="Rows in file" n={String(dry.fileGeneration.rowsCount)} />
          </View>
          <Text style={st.small}>
            Would upload to {dry.sftpStaging.protocol}://{dry.sftpStaging.targetHost}:{dry.sftpStaging.targetPort} · {dry.sftpStaging.remotePath} · {Math.round(dry.fileGeneration.estimatedSizeBytes / 1024)} KB. Nothing was sent.
          </Text>
          {dry.blockers.map((b, i) => (
            <View key={i} style={st.blocker}>
              <TriangleAlert size={15} color={C.bad} />
              <Text style={st.blockerText}>{b}</Text>
            </View>
          ))}
          {dry.flaggedList.slice(0, 30).map((f, i) => (
            <View key={i} style={st.flag}>
              <Text style={st.vname}>{f.name}</Text>
              <Text style={st.issue}>{f.reasons.join(' · ')}</Text>
            </View>
          ))}
          {dry.flaggedList.length > 30 ? <Text style={st.small}>…and {dry.flaggedList.length - 30} more.</Text> : null}
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', marginBottom: 10 }}>
        <Chip label="Needs attention" count={M.attention.length} active={tab === 'attention'} onPress={() => setTab('attention')} />
        <Chip label="Ready on feed" count={M.ready.length} active={tab === 'ready'} onPress={() => setTab('ready')} />
      </View>

      <Card style={{ padding: 0 }}>
        {rows.length ? (
          rows.map((r) => <VehicleRow key={r.id} r={r} onPress={() => router.push({ pathname: tab === 'attention' ? '/vehicle/edit/[id]' : '/vehicle/[id]', params: { id: r.id } })} />)
        ) : (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <CheckCircle2 size={28} color={tab === 'attention' ? C.ok : C.faint} />
            <Text style={[st.vname, { marginTop: 8 }]}>{tab === 'attention' ? 'Nothing to fix' : 'No vehicle is ready yet'}</Text>
            <Text style={[st.small, { textAlign: 'center' }]}>
              {tab === 'attention' ? 'Every vehicle for sale meets the CarGurus requirements.' : 'Fix the vehicles under “Needs attention”, or add vehicles in Inventory.'}
            </Text>
          </View>
        )}
      </Card>
    </Screen>
  );
}

const st = StyleSheet.create({
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  kvK: { fontSize: 14, color: C.muted },
  kvV: { fontSize: 14, color: C.ink, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, marginBottom: 8 },
  stat: { width: '50%', padding: 5 },
  statCard: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: 12, minHeight: 78 },
  statK: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase' },
  statN: { fontSize: 24, fontWeight: '800', color: C.ink, marginTop: 2 },
  statSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  small: { fontSize: 13, color: C.muted, lineHeight: 19, marginTop: 4 },
  body: { fontSize: 14, color: C.text, lineHeight: 20 },
  blocker: { flexDirection: 'row', gap: 8, backgroundColor: C.badSoft, borderRadius: R.sm, padding: 10, marginTop: 8 },
  blockerText: { flex: 1, color: C.bad, fontSize: 13, lineHeight: 18 },
  flag: { paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, marginTop: 8 },
  vrow: { flexDirection: 'row', gap: 12, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  thumb: { width: 64, height: 48, borderRadius: 8, backgroundColor: '#E2E8F0' },
  vname: { fontSize: 15, fontWeight: '700', color: C.ink },
  vmeta: { fontSize: 12, color: C.muted, marginTop: 2 },
  issue: { fontSize: 13, color: C.bad, marginTop: 3, lineHeight: 18 },
});
