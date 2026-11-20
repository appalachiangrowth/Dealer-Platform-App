import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CarFront, Eye, EyeOff, Server } from 'lucide-react-native';
import { useSession } from '../src/lib/session';
import { ApiError } from '../src/lib/api';
import { ENV_API_URL, getApiUrl, setApiUrl } from '../src/lib/config';
import { C, R } from '../src/lib/theme';
import { Button, Field, Input, notify } from '../src/components/ui';

export default function Login() {
  const { login, ready } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string; tenant?: string }>({});
  const [choices, setChoices] = useState<{ id: string; name: string }[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [platform, setPlatform] = useState(false);
  const [tenant, setTenant] = useState('');
  const [server, setServer] = useState(getApiUrl());

  // the saved server address is loaded together with the session
  useEffect(() => {
    if (ready) setServer(getApiUrl());
  }, [ready]);

  async function submit(tenantId?: string) {
    const fe: typeof fieldErr = {};
    if (!email.trim()) fe.email = 'Enter your email or login.';
    if (!password) fe.password = 'Enter your password.';
    if (platform && !tenant.trim()) fe.tenant = 'Enter the dealership ID to work in.';
    setFieldErr(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    setError('');
    try {
      await setApiUrl(server);
      await login({ login: email, password, tenantId, platform, supportTenantId: platform ? tenant.trim() : undefined });
      notify(true);
    } catch (e) {
      const err = e as ApiError;
      const list = (err.data as { dealerships?: { id: string; name: string }[] } | null)?.dealerships;
      // 409: the same login exists in several dealerships → choose one
      if (err.status === 409 && Array.isArray(list)) setChoices(list);
      else {
        setError(err.message || 'Could not log in');
        notify(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={st.wrap}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">
          <View style={st.brand}>
            <View style={st.logo}>
              <CarFront size={34} color="#FFFFFF" />
            </View>
            <Text style={st.title}>Dealership Portal</Text>
            <Text style={st.sub}>Log in to manage your vehicles, photos and listings.</Text>
          </View>

          <View style={st.card}>
            {choices.length > 0 ? (
              <View>
                <Text style={st.choose}>This login belongs to several dealerships. Which one?</Text>
                {choices.map((c) => (
                  <Button key={c.id} title={c.name} variant="secondary" onPress={() => void submit(c.id)} loading={busy} style={{ marginBottom: 10 }} />
                ))}
                <Button title="Back" variant="ghost" onPress={() => setChoices([])} />
              </View>
            ) : (
              <View>
                <Field label="Email or login" error={fieldErr.email}>
                  <Input
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    autoComplete="username"
                    textContentType="username"
                    invalid={!!fieldErr.email}
                    returnKeyType="next"
                  />
                </Field>
                <Field label="Password" error={fieldErr.password}>
                  <View style={st.pwRow}>
                    <Input
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!show}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="current-password"
                      textContentType="password"
                      invalid={!!fieldErr.password}
                      style={{ flex: 1 }}
                      returnKeyType="go"
                      onSubmitEditing={() => void submit()}
                    />
                    <Pressable onPress={() => setShow((v) => !v)} style={st.eye} hitSlop={8} accessibilityLabel={show ? 'Hide password' : 'Show password'}>
                      {show ? <EyeOff size={20} color={C.muted} /> : <Eye size={20} color={C.muted} />}
                    </Pressable>
                  </View>
                </Field>

                {error ? (
                  <View style={st.errBox}>
                    <Text style={st.errText}>{error}</Text>
                  </View>
                ) : null}

                <Button title="Log in" onPress={() => void submit()} loading={busy} />

                <Pressable onPress={() => setAdvanced((v) => !v)} style={st.advBtn} hitSlop={8}>
                  <Server size={15} color={C.muted} />
                  <Text style={st.advText}>{advanced ? 'Hide server settings' : 'Server settings'}</Text>
                </Pressable>

                {advanced ? (
                  <View style={st.adv}>
                    <Field label="API server" hint={`Default: ${ENV_API_URL}`}>
                      <Input value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder={ENV_API_URL} />
                    </Field>
                    <View style={st.swRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={st.swTitle}>Platform Admin login</Text>
                        <Text style={st.swSub}>For platform owners working inside one dealership (support mode).</Text>
                      </View>
                      <Switch value={platform} onValueChange={setPlatform} />
                    </View>
                    {platform ? (
                      <Field label="Dealership ID" error={fieldErr.tenant} hint="Sent as the X-Tenant-Id header.">
                        <Input value={tenant} onChangeText={setTenant} autoCapitalize="none" autoCorrect={false} invalid={!!fieldErr.tenant} />
                      </Field>
                    ) : null}
                  </View>
                ) : null}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.navy },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  brand: { alignItems: 'center', marginBottom: 22 },
  logo: { width: 68, height: 68, borderRadius: 20, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { color: '#FFFFFF', fontSize: 26, fontWeight: '800' },
  sub: { color: '#CBD5E1', fontSize: 15, marginTop: 6, textAlign: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20 },
  choose: { fontSize: 15, color: C.text, marginBottom: 14 },
  pwRow: { flexDirection: 'row', alignItems: 'center' },
  eye: { position: 'absolute', right: 12, height: 48, justifyContent: 'center' },
  errBox: { backgroundColor: C.badSoft, borderRadius: R.md, padding: 12, marginBottom: 14 },
  errText: { color: C.bad, fontSize: 14 },
  advBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 18 },
  advText: { color: C.muted, fontSize: 13, fontWeight: '600' },
  adv: { marginTop: 14, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14 },
  swRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  swTitle: { fontSize: 14, fontWeight: '700', color: C.ink },
  swSub: { fontSize: 12, color: C.muted, marginTop: 2 },
});
