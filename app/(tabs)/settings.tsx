import React, { useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronRight, ExternalLink, LogOut, Palette, Shield, Trash2, Upload } from 'lucide-react-native';
import { api, ApiError, mediaUrl, uploadPhoto } from '../../src/lib/api';
import { ENV_API_URL, getApiUrl, setApiUrl } from '../../src/lib/config';
import { useSession } from '../../src/lib/session';
import { C, R } from '../../src/lib/theme';
import type { Hours, SettingsAnswer } from '../../src/lib/types';
import { Button, Card, ErrorView, Field, Input, Loading, Notice, Screen, SectionTitle, notify } from '../../src/components/ui';
import { fullHours, HoursEditor, hoursProblems } from '../../src/components/HoursEditor';

/** Business details synced with GET / PATCH /dealer/settings (backend/src/tenants/settings.fields.ts) */
type Form = { name: string; phone: string; email: string; siteUrl: string; street: string; city: string; state: string; zip: string; logo: string; hours: Required<Hours> };
const TEXT_KEYS = ['name', 'phone', 'email', 'siteUrl', 'street', 'city', 'state', 'zip', 'logo'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formFrom(a: SettingsAnswer): Form {
  const s = a.settings;
  const t = (k: (typeof TEXT_KEYS)[number]) => (typeof s[k] === 'string' ? (s[k] as string) : '');
  return { name: t('name'), phone: t('phone'), email: t('email'), siteUrl: t('siteUrl'), street: t('street'), city: t('city'), state: t('state'), zip: t('zip'), logo: t('logo'), hours: fullHours(s.hours) };
}

export default function BusinessTab() {
  const qc = useQueryClient();
  const router = useRouter();
  const { me, dealership, logout, reload, can, isOwner } = useSession();
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [logoPct, setLogoPct] = useState<number | null>(null);
  const [server, setServer] = useState(getApiUrl());

  const q = useQuery({ queryKey: ['settings'], queryFn: () => api<SettingsAnswer>('/dealer/settings') });
  const data = q.data;
  useEffect(() => {
    if (!data) return;
    const f = formFrom(data);
    setForm(f);
    setSaved(f);
  }, [data]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const dirtyKeys = (f: Form, base: Form) => (Object.keys(f) as (keyof Form)[]).filter((k) => JSON.stringify(f[k]) !== JSON.stringify(base[k]));
  const dirty = !!form && !!saved && dirtyKeys(form, saved).length > 0;

  // PATCH /dealer/settings — only the changed keys are sent; the answer is the same shape as GET
  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api<SettingsAnswer>('/dealer/settings', { method: 'PATCH', body: patch }),
    onSuccess: (r) => {
      qc.setQueryData(['settings'], r);
      const f = formFrom(r);
      setForm(f);
      setSaved(f);
      notify(true);
      void reload().catch(() => undefined); // header name / logo
      void qc.invalidateQueries({ queryKey: ['cg-monitor'] });
    },
    onError: (e) => {
      notify(false);
      const err = e as ApiError;
      const fields = (err.data as { fields?: string[] } | null)?.fields;
      Alert.alert('Could not save', fields?.length ? `${err.message}: ${fields.join(', ')}` : err.message);
    },
  });

  const submit = () => {
    if (!form || !saved) return;
    const e: Partial<Record<keyof Form, string>> = {};
    if (!form.name.trim()) e.name = 'Enter your dealership name.';
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) e.email = 'This email address does not look right.';
    if (form.siteUrl.trim() && !/^https?:\/\/\S+\.\S+/i.test(form.siteUrl.trim())) e.siteUrl = 'Start the website address with https://';
    const bad = hoursProblems(form.hours);
    if (bad.length) e.hours = `Use HH:MM (24-hour) times for: ${bad.join(', ')}.`;
    setErrors(e);
    if (Object.keys(e).length) {
      notify(false);
      return;
    }
    const patch: Record<string, unknown> = {};
    for (const k of dirtyKeys(form, saved)) patch[k] = typeof form[k] === 'string' ? (form[k] as string).trim() : form[k];
    save.mutate(patch);
  };

  // Logo: POST /dealer/media?folder=site (field "files") → url, then PATCH /dealer/settings { logo }
  const pickLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo access needed', 'Allow photo access in your phone settings to choose a logo.');
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (r.canceled || !r.assets?.length) return;
    const a = r.assets[0];
    setLogoPct(0);
    try {
      const f = await uploadPhoto({ uri: a.uri, name: a.fileName, mimeType: a.mimeType }, { folder: 'site', onProgress: setLogoPct });
      await api<SettingsAnswer>('/dealer/settings', { method: 'PATCH', body: { logo: f.url } });
      // only the logo changes here: text typed in the form but not saved yet stays as it is
      setForm((cur) => (cur ? { ...cur, logo: f.url } : cur));
      setSaved((cur) => (cur ? { ...cur, logo: f.url } : cur));
      notify(true);
      void reload().catch(() => undefined);
    } catch (e) {
      notify(false);
      Alert.alert('Logo not uploaded', (e as Error).message);
    } finally {
      setLogoPct(null);
    }
  };

  const changeServer = () =>
    Alert.alert('Change the API server?', 'You will be logged out and log in again on the new server.', [
      { text: 'Cancel', style: 'cancel', onPress: () => setServer(getApiUrl()) },
      {
        text: 'Change',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await setApiUrl(server);
            await logout();
          })();
        },
      },
    ]);

  const confirmLogout = () =>
    Alert.alert('Log out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void logout() },
    ]);

  const designLink = can('design') ? (
    <Pressable onPress={() => router.push('/design')} style={st.link} accessibilityRole="button">
      <Palette size={22} color={C.primary} />
      <View style={{ flex: 1 }}>
        <Text style={st.linkTitle}>Design & Colors</Text>
        <Text style={st.small}>Website design and brand colours</Text>
      </View>
      <ChevronRight size={20} color={C.faint} />
    </Pressable>
  ) : null;

  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      // Attempt endpoint variants for account deletion
      let deleted = false;
      try {
        await api('/dealer/auth/account', { method: 'DELETE' });
        deleted = true;
      } catch (err: unknown) {
        if (err instanceof ApiError && (err.status === 404 || err.status === 405 || err.status === 501)) {
          await api('/dealer/account', { method: 'DELETE' });
          deleted = true;
        } else {
          throw err;
        }
      }
      notify(true);
      Alert.alert('Account Deleted', 'Your account and associated data have been permanently removed.', [
        {
          text: 'OK',
          onPress: () => {
            void logout();
          },
        },
      ]);
    } catch (e: unknown) {
      notify(false);
      const msg = (e as Error)?.message || 'Unable to delete account. Please contact support.';
      Alert.alert('Could Not Delete Account', msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmDeleteAccount = () =>
    Alert.alert(
      'Delete Account & Dealership?',
      'This will permanently delete your user account, dealership profile, and associated inventory. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: () => void handleDeleteAccount(),
        },
      ]
    );

  const appInfo = (
    <Card>
      <SectionTitle>App info</SectionTitle>
      <View style={st.kv}>
        <Text style={st.k}>Signed in as</Text>
        <Text style={st.v}>{me?.user.name || me?.user.login}{isOwner ? ' (Platform Admin)' : ''}</Text>
      </View>
      <View style={st.kv}>
        <Text style={st.k}>Dealership</Text>
        <Text style={st.v}>{dealership?.name} · {dealership?.id}</Text>
      </View>
      <View style={st.kv}>
        <Text style={st.k}>App version</Text>
        <Text style={st.v}>{Constants.expoConfig?.version || '1.0.0'}</Text>
      </View>
      <View style={{ marginTop: 12 }}>
        <Field label="Connected API server" hint={`Built-in address: ${ENV_API_URL}`}>
          <Input value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        </Field>
        {server.trim().replace(/\/+$/, '') !== getApiUrl() ? <Button small variant="secondary" title="Use this server" onPress={changeServer} style={{ marginBottom: 12 }} /> : null}
      </View>
      <Button title="Logout" variant="danger" icon={<LogOut size={18} color="#FFFFFF" />} onPress={confirmLogout} />
    </Card>
  );

  const PRIVACY_POLICY_URL = 'https://revixasolutions.com/privacy-policy';

  const openPrivacyPolicy = async () => {
    try {
      const supported = await Linking.canOpenURL(PRIVACY_POLICY_URL).catch(() => false);
      if (supported) {
        await Linking.openURL(PRIVACY_POLICY_URL);
      } else {
        await Linking.openURL(PRIVACY_POLICY_URL).catch(() => {
          Alert.alert('Unable to open browser', `Please open this address in your browser:\n\n${PRIVACY_POLICY_URL}`);
        });
      }
    } catch {
      Alert.alert('Unable to open browser', `Please open this address in your browser:\n\n${PRIVACY_POLICY_URL}`);
    }
  };

  const privacyPolicyLink = (
    <Pressable onPress={openPrivacyPolicy} style={st.link} accessibilityRole="button">
      <Shield size={22} color={C.primary} />
      <View style={{ flex: 1 }}>
        <Text style={st.linkTitle}>Privacy Policy</Text>
        <Text style={st.small}>How we handle and protect your data</Text>
      </View>
      <ExternalLink size={18} color={C.faint} />
    </Pressable>
  );

  const dangerZone = (
    <Card style={{ borderColor: 'rgba(239, 68, 68, 0.3)', borderWidth: 1, marginTop: 14 }}>
      <SectionTitle>Danger Zone</SectionTitle>
      <Text style={[st.small, { marginBottom: 12, color: C.muted }]}>
        Permanently remove your account, active login sessions, and all dealership data.
      </Text>
      <Button
        title="Delete Account"
        variant="danger"
        icon={<Trash2 size={18} color="#FFFFFF" />}
        loading={isDeleting}
        onPress={confirmDeleteAccount}
      />
    </Card>
  );

  if (q.isLoading) return <Loading />;
  if (q.error || !form) {
    const denied = q.error instanceof ApiError && q.error.status === 403;
    if (!denied && q.error) return <ErrorView message={(q.error as Error).message} onRetry={() => void q.refetch()} />;
    return (
      <Screen>
        {denied ? <Notice tone="warn">Your login does not have the “Business details” permission. Ask your dealership admin.</Notice> : null}
        {designLink}
        {privacyPolicyLink}
        {appInfo}
        {dangerZone}
      </Screen>
    );
  }

  const canEdit = can('business');

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
        {!canEdit ? <Notice tone="warn">You can view these details, but your login may not change them.</Notice> : null}

        <Card>
          <SectionTitle>Dealership logo</SectionTitle>
          <View style={st.logoRow}>
            {form.logo ? (
              <Image source={{ uri: mediaUrl(form.logo) }} style={st.logo} resizeMode="contain" />
            ) : (
              <View style={[st.logo, { alignItems: 'center', justifyContent: 'center' }]}>
                <Building2 size={30} color={C.faint} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Button
                small
                variant="secondary"
                title={logoPct !== null ? `Uploading ${Math.round(logoPct * 100)}%` : form.logo ? 'Replace logo' : 'Upload logo'}
                icon={<Upload size={16} color={C.ink} />}
                onPress={pickLogo}
                disabled={!canEdit || logoPct !== null}
              />
              <Text style={st.small}>PNG with a transparent background works best.</Text>
            </View>
          </View>
        </Card>

        <Card>
          <SectionTitle>Business details</SectionTitle>
          <Field label="Dealership Name" error={errors.name} required>
            <Input value={form.name} onChangeText={(t) => set('name', t)} maxLength={120} invalid={!!errors.name} editable={canEdit} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChangeText={(t) => set('phone', t)} maxLength={40} keyboardType="phone-pad" editable={canEdit} />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input value={form.email} onChangeText={(t) => set('email', t)} maxLength={160} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} invalid={!!errors.email} editable={canEdit} />
          </Field>
          <Field label="Website" error={errors.siteUrl}>
            <Input value={form.siteUrl} onChangeText={(t) => set('siteUrl', t)} maxLength={200} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="https://" invalid={!!errors.siteUrl} editable={canEdit} />
          </Field>
          <Field label="Street Address">
            <Input value={form.street} onChangeText={(t) => set('street', t)} maxLength={160} editable={canEdit} />
          </Field>
          <Field label="City">
            <Input value={form.city} onChangeText={(t) => set('city', t)} maxLength={80} editable={canEdit} />
          </Field>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label="State">
                <Input value={form.state} onChangeText={(t) => set('state', t)} maxLength={40} autoCapitalize="characters" editable={canEdit} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="ZIP Code">
                <Input value={form.zip} onChangeText={(t) => set('zip', t)} maxLength={20} keyboardType="numbers-and-punctuation" editable={canEdit} />
              </Field>
            </View>
          </View>
        </Card>

        <Card>
          <SectionTitle>Business Hours</SectionTitle>
          <HoursEditor value={form.hours} onChange={(h) => set('hours', h)} />
          {errors.hours ? <Text style={st.err}>{errors.hours}</Text> : null}
        </Card>

        <Button title={dirty ? 'Save Changes' : 'Saved'} onPress={submit} loading={save.isPending} disabled={!dirty || !canEdit} style={{ marginBottom: 14 }} />

        {designLink}

        {privacyPolicyLink}

        {appInfo}

        {dangerZone}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 16, marginBottom: 14 },
  linkTitle: { fontSize: 16, fontWeight: '700', color: C.ink },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logo: { width: 96, height: 72, borderRadius: R.md, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line },
  small: { fontSize: 12, color: C.muted, marginTop: 6 },
  err: { color: C.bad, fontSize: 13, marginTop: 8 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  k: { fontSize: 14, color: C.muted },
  v: { fontSize: 14, color: C.ink, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
