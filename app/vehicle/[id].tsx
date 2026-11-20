import React from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Facebook, Pencil, Trash2 } from 'lucide-react-native';
import { api, mediaUrl } from '../../src/lib/api';
import { C, R } from '../../src/lib/theme';
import { miles, money, STATUSES, STATUS_LABEL, vehicleName } from '../../src/lib/format';
import type { Vehicle, VehicleStatus } from '../../src/lib/types';
import { Badge, Button, Card, Chip, ErrorView, Loading, Screen, SectionTitle, StatusBadge, notify } from '../../src/components/ui';

function Row({ k, v }: { k: string; v?: string | number | null }) {
  if (v === null || v === undefined || v === '') return null;
  return (
    <View style={st.row}>
      <Text style={st.k}>{k}</Text>
      <Text style={st.v}>{String(v)}</Text>
    </View>
  );
}

export default function VehicleDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ['vehicle', id], queryFn: () => api<Vehicle>(`/dealer/vehicles/${id}`) });

  const refreshLists = () => {
    void qc.invalidateQueries({ queryKey: ['vehicles'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['cg-monitor'] });
  };

  // PATCH /dealer/vehicles/:id { status }
  const setStatus = useMutation({
    mutationFn: (status: VehicleStatus) => api<Vehicle>(`/dealer/vehicles/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: (v) => {
      notify(true);
      qc.setQueryData(['vehicle', id], v);
      refreshLists();
    },
    onError: (e) => {
      notify(false);
      Alert.alert('Status not changed', (e as Error).message);
    },
  });

  // DELETE /dealer/vehicles/:id
  const del = useMutation({
    mutationFn: () => api<{ ok: boolean }>(`/dealer/vehicles/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify(true);
      refreshLists();
      router.back();
    },
    onError: (e) => {
      notify(false);
      Alert.alert('Could not delete', (e as Error).message);
    },
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorView message={(q.error as Error)?.message || 'Vehicle not found'} onRetry={() => void q.refetch()} />;
  const v = q.data;
  const name = vehicleName(v) || 'Vehicle';

  const confirmDelete = () =>
    Alert.alert(`Delete ${name}?`, v.status === 'PUBLISHED' ? 'This removes it from your website and feeds for good. Sold it? Use “Sold” instead to keep it in your records.' : 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => del.mutate() },
    ]);

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      {v.images.length ? (
        <ScrollView horizontal pagingEnabled={false} showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginBottom: 14 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
          {v.images.map((u, i) => (
            <Image key={`${u}-${i}`} source={{ uri: mediaUrl(u) }} style={st.photo} resizeMode="cover" />
          ))}
        </ScrollView>
      ) : null}

      <Card>
        <Text style={st.name}>{name}</Text>
        <Text style={st.price}>{money(v.price)}</Text>
        <Text style={st.meta}>
          {miles(v.mileage)}
          {v.stockNumber ? ` · Stock ${v.stockNumber}` : ''}
        </Text>
        <View style={st.badges}>
          <StatusBadge status={v.status} />
          {v.syndicateCargurus !== false ? <Badge label="CarGurus" tone="info" /> : null}
          {v.syndicateFacebook !== false ? <Badge label="Facebook" tone="info" /> : null}
          <Badge label={`${v.images.length} photo${v.images.length === 1 ? '' : 's'}`} />
        </View>
      </Card>

      <Card>
        <SectionTitle>Status</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {STATUSES.map((x) => (
            <Chip key={x} label={STATUS_LABEL[x]} active={v.status === x} onPress={() => (v.status === x || setStatus.isPending ? undefined : setStatus.mutate(x))} />
          ))}
        </View>
        {setStatus.isPending ? <Text style={st.saving}>Saving…</Text> : null}
      </Card>

      <View style={st.actions}>
        <Button title="Edit Vehicle" icon={<Pencil size={18} color="#FFFFFF" />} onPress={() => router.push({ pathname: '/vehicle/edit/[id]', params: { id: v.id } })} />
        <Button
          title="Post to Facebook"
          variant="facebook"
          icon={<Facebook size={18} color="#FFFFFF" />}
          onPress={() => router.push({ pathname: '/(tabs)/facebook', params: { vehicleId: v.id } })}
        />
        <Button title="Delete Vehicle" variant="secondary" icon={<Trash2 size={18} color={C.bad} />} onPress={confirmDelete} loading={del.isPending} />
      </View>

      <Card>
        <SectionTitle>Details</SectionTitle>
        <Row k="VIN" v={v.vin} />
        <Row k="Stock #" v={v.stockNumber} />
        <Row k="Condition" v={v.condition} />
        <Row k="Certified Pre-Owned" v={v.certified ? 'Yes' : 'No'} />
        <Row k="Exterior Color" v={v.exteriorColor} />
        <Row k="Interior Color" v={v.interiorColor} />
        <Row k="Body Style" v={v.bodyStyle} />
        <Row k="Transmission" v={v.transmission} />
        <Row k="Drivetrain" v={v.drivetrain} />
        <Row k="Fuel Type" v={v.fuelType} />
        <Row k="Engine" v={v.engine} />
      </Card>

      {v.features?.length ? (
        <Card>
          <SectionTitle>Features</SectionTitle>
          {v.features.map((f, i) => (
            <Text key={`${f}-${i}`} style={st.feature}>• {f}</Text>
          ))}
        </Card>
      ) : null}

      {v.description ? (
        <Card>
          <SectionTitle>Description</SectionTitle>
          <Text style={st.desc}>{v.description}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  photo: { width: 280, height: 200, borderRadius: R.lg, backgroundColor: '#E2E8F0' },
  name: { fontSize: 21, fontWeight: '800', color: C.ink },
  price: { fontSize: 22, fontWeight: '800', color: C.primary, marginTop: 4 },
  meta: { fontSize: 14, color: C.muted, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  saving: { fontSize: 13, color: C.muted, marginTop: 8 },
  actions: { gap: 10, marginBottom: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  k: { fontSize: 14, color: C.muted },
  v: { fontSize: 14, color: C.ink, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  feature: { fontSize: 14, color: C.text, lineHeight: 22 },
  desc: { fontSize: 14, color: C.text, lineHeight: 21 },
});
