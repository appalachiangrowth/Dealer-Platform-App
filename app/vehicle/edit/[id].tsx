import React from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../src/lib/api';
import { draftFrom, toBody, type VehicleDraft } from '../../../src/lib/vehicle';
import type { Vehicle } from '../../../src/lib/types';
import { VehicleForm } from '../../../src/components/VehicleForm';
import { ErrorView, Loading, notify } from '../../../src/components/ui';

export default function EditVehicle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  // GET /dealer/vehicles/:id — always fresh, so the form never starts from an old copy
  const q = useQuery({ queryKey: ['vehicle', id, 'edit'], queryFn: () => api<Vehicle>(`/dealer/vehicles/${id}`), staleTime: 0, gcTime: 0 });

  // PATCH /dealer/vehicles/:id
  const save = useMutation({
    mutationFn: (d: VehicleDraft) => api<Vehicle>(`/dealer/vehicles/${id}`, { method: 'PATCH', body: toBody(d) }),
    onSuccess: () => {
      notify(true);
      void qc.invalidateQueries({ queryKey: ['vehicles'] });
      void qc.invalidateQueries({ queryKey: ['vehicle', id] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['cg-monitor'] });
      router.back();
    },
    onError: (e) => {
      notify(false);
      Alert.alert('Could not save the vehicle', (e as Error).message);
    },
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorView message={(q.error as Error)?.message || 'Vehicle not found'} onRetry={() => void q.refetch()} />;
  return <VehicleForm initial={draftFrom(q.data)} submitLabel="Save Changes" saving={save.isPending} onSubmit={(d) => save.mutate(d)} />;
}
