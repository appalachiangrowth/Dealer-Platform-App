import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { C } from '../lib/theme';
import type { DayKey, Hours } from '../lib/types';
import { Input } from './ui';

export const DAYS: [DayKey, string][] = [
  ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday'],
];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Every day present, with the backend defaults (09:00 – 18:00). */
export function fullHours(h: Hours | null | undefined): Required<Hours> {
  const out = {} as Required<Hours>;
  for (const [d] of DAYS) {
    const x = h?.[d];
    out[d] = x ? { s: x.s === 'closed' ? 'closed' : 'open', o: x.o || '09:00', c: x.c || '18:00' } : { s: d === 'sun' ? 'closed' : 'open', o: '09:00', c: '18:00' };
  }
  return out;
}

/** Days whose times are not HH:MM (24-hour), e.g. ['Monday'] */
export function hoursProblems(h: Hours): string[] {
  return DAYS.filter(([d]) => h[d]?.s === 'open' && (!TIME_RE.test(h[d]?.o || '') || !TIME_RE.test(h[d]?.c || ''))).map(([, n]) => n);
}

const fmt = (t: string) => {
  const digits = t.replace(/[^0-9]/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
};

/** Business hours — the backend's shape: { mon: { s: 'open' | 'closed', o: '09:00', c: '18:00' }, … } */
export function HoursEditor({ value, onChange }: { value: Required<Hours>; onChange: (h: Required<Hours>) => void }) {
  const set = (d: DayKey, p: Partial<{ s: 'open' | 'closed'; o: string; c: string }>) => onChange({ ...value, [d]: { ...value[d], ...p } });
  return (
    <View>
      {DAYS.map(([d, name]) => {
        const x = value[d];
        const open = x.s === 'open';
        return (
          <View key={d} style={st.row}>
            <View style={st.day}>
              <Text style={st.dayText}>{name}</Text>
              <Switch value={open} onValueChange={(v) => set(d, { s: v ? 'open' : 'closed' })} />
            </View>
            {open ? (
              <View style={st.times}>
                <Input value={x.o} onChangeText={(t) => set(d, { o: fmt(t) })} keyboardType="number-pad" maxLength={5} placeholder="09:00" invalid={!TIME_RE.test(x.o)} style={st.time} />
                <Text style={st.to}>to</Text>
                <Input value={x.c} onChangeText={(t) => set(d, { c: fmt(t) })} keyboardType="number-pad" maxLength={5} placeholder="18:00" invalid={!TIME_RE.test(x.c)} style={st.time} />
              </View>
            ) : (
              <Text style={st.closed}>Closed</Text>
            )}
          </View>
        );
      })}
      <Text style={st.note}>Times use the 24-hour clock (for example 18:00 = 6 PM).</Text>
    </View>
  );
}

const st = StyleSheet.create({
  row: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  day: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayText: { fontSize: 15, fontWeight: '600', color: C.ink },
  times: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  time: { flex: 1, textAlign: 'center' },
  to: { color: C.muted, fontSize: 14 },
  closed: { color: C.muted, fontSize: 14, marginTop: 4 },
  note: { fontSize: 12, color: C.muted, marginTop: 10 },
});
