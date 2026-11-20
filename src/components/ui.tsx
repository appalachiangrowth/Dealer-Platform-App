import React, { useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Check, ChevronDown, X } from 'lucide-react-native';
import { C, R } from '../lib/theme';
import { STATUS_LABEL } from '../lib/format';
import type { VehicleStatus } from '../lib/types';

export const tap = () => {
  void Haptics.selectionAsync().catch(() => undefined);
};
export const notify = (ok: boolean) => {
  void Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => undefined);
};

export function Screen({ children, scroll = true, refreshing, onRefresh, style }: {
  children: React.ReactNode; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void; style?: StyleProp<ViewStyle>;
}) {
  if (!scroll) return <View style={[s.screen, style]}>{children}</View>;
  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={[s.screenPad, style]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.primary} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.section}>{children}</Text>
      {right}
    </View>
  );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'facebook';
export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, style, small }: {
  title: string; onPress?: () => void; variant?: Variant; loading?: boolean; disabled?: boolean; icon?: React.ReactNode; style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  const off = disabled || loading;
  const bg = variant === 'primary' ? C.primary : variant === 'danger' ? C.bad : variant === 'facebook' ? C.fb : variant === 'secondary' ? C.card : 'transparent';
  const fg = variant === 'secondary' ? C.ink : variant === 'ghost' ? C.primary : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={off}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        s.btn, small && s.btnSmall, { backgroundColor: bg }, variant === 'secondary' && s.btnBorder, off && { opacity: 0.5 }, pressed && { opacity: 0.8 }, style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <Text style={[s.btnText, small && { fontSize: 14 }, { color: fg }]} numberOfLines={1}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, error, hint, children, required, ai }: { label: string; error?: string; hint?: string; children: React.ReactNode; required?: boolean; ai?: boolean }) {
  return (
    <View style={[s.field, ai && s.fieldAi]}>
      <View style={s.labelRow}>
        <Text style={s.label}>
          {label}
          {required ? <Text style={{ color: C.bad }}> *</Text> : null}
        </Text>
        {ai ? (
          <View style={s.aiTag}>
            <Text style={s.aiTagText}>✦ AI filled</Text>
          </View>
        ) : null}
      </View>
      {children}
      {error ? <Text style={s.error}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Input({ invalid, style, ...p }: TextInputProps & { invalid?: boolean }) {
  return <TextInput placeholderTextColor={C.faint} {...p} style={[s.input, p.multiline && s.inputMulti, invalid && { borderColor: C.bad }, style]} />;
}

/** Dropdown: opens a bottom sheet list. `allowEmpty` adds the "Select…" (blank) choice. */
export function Select({ value, options, onChange, placeholder = 'Select…', allowEmpty, invalid, title }: {
  value: string; options: string[]; onChange: (v: string) => void; placeholder?: string; allowEmpty?: boolean; invalid?: boolean; title?: string;
}) {
  const [open, setOpen] = useState(false);
  const list = value && !options.includes(value) ? [value, ...options] : options;
  const data = allowEmpty ? ['', ...list] : list;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          tap();
          setOpen(true);
        }}
        style={[s.input, s.selectRow, invalid && { borderColor: C.bad }]}
      >
        <Text style={[s.selectText, !value && { color: C.faint }]} numberOfLines={1}>{value || placeholder}</Text>
        <ChevronDown size={18} color={C.muted} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)} />
        <SafeAreaView edges={['bottom']} style={s.sheet}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>{title || placeholder}</Text>
            <Pressable hitSlop={12} onPress={() => setOpen(false)}>
              <X size={22} color={C.muted} />
            </Pressable>
          </View>
          <FlatList
            data={data}
            keyExtractor={(x, i) => `${i}-${x}`}
            renderItem={({ item }) => (
              <Pressable
                style={s.option}
                onPress={() => {
                  tap();
                  onChange(item);
                  setOpen(false);
                }}
              >
                <Text style={[s.optionText, !item && { color: C.muted }]}>{item || placeholder}</Text>
                {item === value ? <Check size={18} color={C.primary} /> : null}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

export function Chip({ label, active, onPress, count }: { label: string; active?: boolean; onPress?: () => void; count?: number }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={[s.chip, active && s.chipOn]}
    >
      <Text style={[s.chipText, active && { color: '#FFFFFF' }]}>{label}</Text>
      {count !== undefined ? <Text style={[s.chipCount, active && { color: '#DBEAFE' }]}>{count}</Text> : null}
    </Pressable>
  );
}

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted';
const TONE: Record<Tone, [string, string]> = {
  ok: [C.okSoft, C.ok], warn: [C.warnSoft, C.warn], bad: [C.badSoft, C.bad], info: [C.primarySoft, C.primary], muted: ['#E2E8F0', C.text],
};
export function Badge({ label, tone = 'muted' }: { label: string; tone?: Tone }) {
  const [bg, fg] = TONE[tone];
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={[s.badgeText, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}
export function StatusBadge({ status }: { status: VehicleStatus }) {
  return <Badge label={STATUS_LABEL[status] || status} tone={status === 'PUBLISHED' ? 'ok' : status === 'SOLD' ? 'info' : 'warn'} />;
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={C.primary} />
      {label ? <Text style={[s.hint, { marginTop: 10 }]}>{label}</Text> : null}
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={s.center}>
      <Text style={s.errTitle}>Something went wrong</Text>
      <Text style={s.errText}>{message}</Text>
      {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} style={{ marginTop: 14 }} /> : null}
    </View>
  );
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <View style={[s.center, { paddingVertical: 40 }]}>
      <Text style={s.errTitle}>{title}</Text>
      {text ? <Text style={s.errText}>{text}</Text> : null}
    </View>
  );
}

export function Notice({ tone = 'info', children }: { tone?: Tone; children: React.ReactNode }) {
  const [bg, fg] = TONE[tone];
  return (
    <View style={[s.notice, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  screenPad: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.card, borderRadius: R.lg, padding: 16, borderWidth: 1, borderColor: C.line, marginBottom: 14 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 4 },
  section: { fontSize: 16, fontWeight: '700', color: C.ink },
  btn: { minHeight: 50, borderRadius: R.md, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnSmall: { minHeight: 40, paddingHorizontal: 12 },
  btnBorder: { borderWidth: 1, borderColor: C.line },
  btnText: { fontSize: 16, fontWeight: '700' },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  fieldAi: { backgroundColor: '#F5F3FF', borderRadius: R.md, padding: 8, marginHorizontal: -8 },
  aiTag: { backgroundColor: '#EDE9FE', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 6 },
  aiTagText: { fontSize: 11, fontWeight: '700', color: '#6D28D9' },
  input: { minHeight: 48, borderWidth: 1, borderColor: C.line, borderRadius: R.md, backgroundColor: '#FFFFFF', paddingHorizontal: 12, fontSize: 16, color: C.ink },
  inputMulti: { minHeight: 110, paddingTop: 12, textAlignVertical: 'top' },
  selectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { fontSize: 16, color: C.ink, flex: 1 },
  error: { color: C.bad, fontSize: 13, marginTop: 5 },
  hint: { color: C.muted, fontSize: 13, marginTop: 5 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '70%' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.line },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: C.ink },
  option: { minHeight: 50, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  optionText: { fontSize: 16, color: C.ink },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.line, marginRight: 8 },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: C.text },
  chipCount: { fontSize: 12, fontWeight: '700', color: C.muted },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errTitle: { fontSize: 17, fontWeight: '700', color: C.ink, textAlign: 'center' },
  errText: { fontSize: 14, color: C.muted, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  notice: { borderRadius: R.md, padding: 12, marginBottom: 14 },
});
