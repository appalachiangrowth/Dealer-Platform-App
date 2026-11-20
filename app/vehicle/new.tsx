import React from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../src/lib/api';
import { EMPTY_DRAFT, toBody, type VehicleDraft } from '../../src/lib/vehicle';
import type { Vehicle } from '../../src/lib/types';
import { VehicleForm } from '../../src/components/VehicleForm';
import { notify } from '../../src/components/ui';

export default function NewVehicle() {
  const router = useRouter();
  const qc = useQueryClient();

  // POST /dealer/vehicles
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

  return <VehicleForm initial={EMPTY_DRAFT} submitLabel="Save Vehicle" saving={create.isPending} onSubmit={(d) => create.mutate(d)} />;
}
