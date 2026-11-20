import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Switch, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useMutation } from '@tanstack/react-query';
import { ClipboardPaste, ScanLine } from 'lucide-react-native';
import { api } from '../lib/api';
import { C } from '../lib/theme';
import { BODY_STYLES, CERTIFIED, COLORS, CONDITIONS, DRIVETRAINS, FUEL_TYPES, MAXLEN, TRANSMISSIONS, VEHICLE_TYPES } from '../lib/options';
import { STATUSES, STATUS_LABEL } from '../lib/format';
import { applyVin, cargurusMissing, cleanVin, validate, VIN_RE, type FieldErrors, type VehicleDraft } from '../lib/vehicle';
import type { VehicleStatus, VinDecode } from '../lib/types';
import { Badge, Button, Card, Chip, Field, Input, Notice, Screen, SectionTitle, Select, notify } from './ui';
import { PhotoManager } from './PhotoManager';

export function VehicleForm({ initial, submitLabel, saving, onSubmit, aiFields, aiNotes }: {
  initial: VehicleDraft; submitLabel: string; saving: boolean; onSubmit: (d: VehicleDraft) => void;
  /** AI Quick Add: the fields the AI filled in (highlighted until the dealer changes them) and what to check */
  aiFields?: (keyof VehicleDraft)[]; aiNotes?: string[];
}) {
  const [aiSet, setAiSet] = useState<Set<keyof VehicleDraft>>(() => new Set(aiFields || []));
  const isAi = (k: keyof VehicleDraft) => aiSet.has(k);
  const [d, setD] = useState<VehicleDraft>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [uploading, setUploading] = useState(false);
  const [vinNote, setVinNote] = useState<{ ok: boolean; text: string } | null>(null);

  const set = <K extends keyof VehicleDraft>(k: K, v: VehicleDraft[K]) => {
    setD((cur) => ({ ...cur, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
    // edited by hand: no longer "AI filled"
    if (aiSet.has(k)) setAiSet((cur) => new Set([...cur].filter((x) => x !== k)));
  };

  // POST /dealer/ai/decode-vin { vin } → { fields, warnings, checkDigitOk }
  const decode = useMutation({
    mutationFn: (vin: string) => api<VinDecode>('/dealer/ai/decode-vin', { body: { vin }, timeout: 45_000 }),
    onSuccess: (r) => {
      setD((cur) => applyVin(cur, r));
      const name = [r.fields?.year, r.fields?.make, r.fields?.model, r.fields?.trim].filter(Boolean).join(' ');
      const warn = [...(r.checkDigitOk ? [] : ['The VIN check digit does not match — please re-read the VIN.']), ...(r.warnings || [])];
      setVinNote({ ok: !warn.length, text: [name ? `Decoded: ${name}.` : 'The VIN database had no details for this VIN.', ...warn].join(' ') });
      notify(!!name);
    },
    onError: (e) => {
      setVinNote({ ok: false, text: (e as Error).message });
      notify(false);
    },
  });

  const vin = cleanVin(d.vin);
  const runDecode = () => {
    if (!VIN_RE.test(vin)) {
      setErrors((e) => ({ ...e, vin: 'A VIN has exactly 17 letters and numbers, and never I, O or Q.' }));
      return;
    }
    setVinNote(null);
    decode.mutate(vin);
  };
  const paste = async () => {
    const t = cleanVin((await Clipboard.getStringAsync()) || '').slice(0, 17);
    if (t) set('vin', t);
  };

  const submit = () => {
    if (uploading) {
      Alert.alert('Photos are still uploading', 'Wait until every photo has finished uploading, then save.');
      return;
    }
    const e = validate(d);
    setErrors(e);
    const list = Object.values(e).filter(Boolean) as string[];
    if (list.length) {
      notify(false);
      Alert.alert('Please check the form', list.join('\n'));
      return;
    }
    onSubmit(d);
  };

  const cgMiss = d.status === 'PUBLISHED' && d.syndicateCargurus ? cargurusMissing(d) : [];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Screen>
        {aiFields ? (
          <Notice tone="info">
            {aiFields.length ? '✦ The AI filled in the highlighted fields. Check them, add the price, then save.' : 'The AI could not read details from these pictures. Fill in the form by hand.'}
            {aiNotes?.length ? `\n\n• ${aiNotes.join('\n• ')}` : ''}
          </Notice>
        ) : null}
        <Card>
          <SectionTitle>VIN decoder</SectionTitle>
          <Field label="VIN (17 characters)" ai={isAi('vin')} error={errors.vin} hint={`${vin.length}/17`}>
            <View style={st.row}>
              <Input
                value={d.vin}
                onChangeText={(t) => set('vin', cleanVin(t).slice(0, MAXLEN.vin))}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={MAXLEN.vin}
                placeholder="1HGCM82633A004352"
                invalid={!!errors.vin}
                style={{ flex: 1, letterSpacing: 1 }}
              />
              <Button title="Paste" small variant="secondary" icon={<ClipboardPaste size={18} color={C.ink} />} onPress={paste} style={{ minHeight: 48 }} />
            </View>
          </Field>
          <Button title="Decode VIN" icon={<ScanLine size={20} color="#FFFFFF" />} onPress={runDecode} loading={decode.isPending} disabled={vin.length !== 17} />
          {vinNote ? (
            <View style={{ marginTop: 12, marginBottom: -14 }}>
              <Notice tone={vinNote.ok ? 'ok' : 'warn'}>{vinNote.text}</Notice>
            </View>
          ) : null}
        </Card>

        <Card>
          <SectionTitle right={isAi('images') ? <Badge label="✦ attached by AI" tone="info" /> : undefined}>Photos</SectionTitle>
          <PhotoManager value={d.images} onChange={(urls) => set('images', urls)} onBusyChange={setUploading} error={errors.images} />
        </Card>

        <Card>
          <SectionTitle>Vehicle</SectionTitle>
          <Field label="Stock #">
            <Input value={d.stockNumber} onChangeText={(t) => set('stockNumber', t)} maxLength={MAXLEN.stockNumber} autoCapitalize="characters" autoCorrect={false} />
          </Field>
          <View style={st.row}>
            <View style={{ flex: 1 }}>
              <Field label="Year" ai={isAi('year')} error={errors.year} required={d.status === 'PUBLISHED'}>
                <Input value={d.year} onChangeText={(t) => set('year', t.replace(/[^0-9]/g, '').slice(0, 4))} keyboardType="number-pad" invalid={!!errors.year} placeholder="2021" />
              </Field>
            </View>
            <View style={{ flex: 2 }}>
              <Field label="Make" ai={isAi('make')} error={errors.make} required>
                <Input value={d.make} onChangeText={(t) => set('make', t)} maxLength={MAXLEN.make} invalid={!!errors.make} placeholder="Ford" />
              </Field>
            </View>
          </View>
          <Field label="Model" ai={isAi('model')} error={errors.model} required={d.status === 'PUBLISHED'}>
            <Input value={d.model} onChangeText={(t) => set('model', t)} maxLength={MAXLEN.model} invalid={!!errors.model} placeholder="F-150" />
          </Field>
          <Field label="Trim" ai={isAi('trim')}>
            <Input value={d.trim} onChangeText={(t) => set('trim', t)} maxLength={MAXLEN.trim} placeholder="XLT SuperCrew" />
          </Field>
          <View style={st.row}>
            <View style={{ flex: 1 }}>
              <Field label="Price ($)" error={errors.price} required={d.status === 'PUBLISHED'}>
                <Input value={d.price} onChangeText={(t) => set('price', t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" invalid={!!errors.price} placeholder="24995" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Mileage" ai={isAi('mileage')} error={errors.mileage} required={d.status === 'PUBLISHED'}>
                <Input value={d.mileage} onChangeText={(t) => set('mileage', t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" invalid={!!errors.mileage} placeholder="45210" />
              </Field>
            </View>
          </View>
          <Field label="Condition">
            <Select value={d.condition} options={CONDITIONS} onChange={(v) => set('condition', v)} title="Condition" allowEmpty />
          </Field>
          <Field label="Certified Pre-Owned" hint="Yes only if it passed a manufacturer's certified pre-owned programme.">
            <Select value={d.certified} options={CERTIFIED} onChange={(v) => set('certified', v as VehicleDraft['certified'])} title="Certified Pre-Owned" allowEmpty />
          </Field>
        </Card>

        <Card>
          <SectionTitle>Specs</SectionTitle>
          <Field label="Exterior Color" ai={isAi('exteriorColor')}>
            <Select value={d.exteriorColor} options={COLORS} onChange={(v) => set('exteriorColor', v)} title="Exterior Color" allowEmpty />
          </Field>
          <Field label="Interior Color" ai={isAi('interiorColor')}>
            <Select value={d.interiorColor} options={COLORS} onChange={(v) => set('interiorColor', v)} title="Interior Color" allowEmpty />
          </Field>
          <Field label="Body Style" ai={isAi('bodyStyle')}>
            <Select value={d.bodyStyle} options={BODY_STYLES} onChange={(v) => set('bodyStyle', v)} title="Body Style" allowEmpty />
          </Field>
          <Field label="Vehicle Type" ai={isAi('vehicleType')}>
            <Select value={d.vehicleType} options={VEHICLE_TYPES} onChange={(v) => set('vehicleType', v)} title="Vehicle Type" allowEmpty />
          </Field>
          <Field label="Transmission" ai={isAi('transmission')}>
            <Select value={d.transmission} options={TRANSMISSIONS} onChange={(v) => set('transmission', v)} title="Transmission" allowEmpty />
          </Field>
          <Field label="Drivetrain" ai={isAi('drivetrain')}>
            <Select value={d.drivetrain} options={DRIVETRAINS} onChange={(v) => set('drivetrain', v)} title="Drivetrain" allowEmpty />
          </Field>
          <Field label="Fuel Type" ai={isAi('fuelType')}>
            <Select value={d.fuelType} options={FUEL_TYPES} onChange={(v) => set('fuelType', v)} title="Fuel Type" allowEmpty />
          </Field>
          <Field label="Engine" ai={isAi('engine')}>
            <Input value={d.engine} onChangeText={(t) => set('engine', t)} maxLength={MAXLEN.engine} placeholder="3.5L V6 Turbo" />
          </Field>
        </Card>

        <Card>
          <SectionTitle>Features & description</SectionTitle>
          <Field label="Features" ai={isAi('features')} hint="One feature per line.">
            <Input value={d.features} onChangeText={(t) => set('features', t)} multiline placeholder={'Backup camera\nHeated seats\nApple CarPlay'} />
          </Field>
          <Field label="Description" ai={isAi('description')}>
            <Input value={d.description} onChangeText={(t) => set('description', t)} multiline maxLength={MAXLEN.description} style={{ minHeight: 150 }} />
          </Field>
        </Card>

        <Card>
          <SectionTitle>Status & where it is sent</SectionTitle>
          <View style={[st.row, { flexWrap: 'wrap', marginBottom: 6 }]}>
            {STATUSES.map((x: VehicleStatus) => (
              <Chip key={x} label={STATUS_LABEL[x]} active={d.status === x} onPress={() => set('status', x)} />
            ))}
          </View>
          <Text style={st.small}>
            {d.status === 'PUBLISHED' ? 'Available: shown on your website and sent to your feeds.' : d.status === 'DRAFT' ? 'Pending: saved, hidden from your website.' : 'Sold: kept in your records, removed from sale.'}
          </Text>
          <View style={st.sw}>
            <Text style={st.swText}>Send to CarGurus</Text>
            <Switch value={d.syndicateCargurus} onValueChange={(v) => set('syndicateCargurus', v)} />
          </View>
          <View style={st.sw}>
            <Text style={st.swText}>Facebook & Marketplace</Text>
            <Switch value={d.syndicateFacebook} onValueChange={(v) => set('syndicateFacebook', v)} />
          </View>
          {cgMiss.length ? (
            <View style={{ marginTop: 12, marginBottom: -14 }}>
              <Notice tone="warn">CarGurus will skip this vehicle until these are filled in: {cgMiss.join(', ')}. You can still save it.</Notice>
            </View>
          ) : null}
        </Card>

        <Button title={uploading ? 'Uploading photos…' : submitLabel} onPress={submit} loading={saving} disabled={uploading} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  small: { fontSize: 13, color: C.muted, marginBottom: 6 },
  sw: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, marginTop: 6 },
  swText: { fontSize: 15, color: C.ink, fontWeight: '600' },
});
