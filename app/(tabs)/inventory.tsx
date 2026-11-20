import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Facebook, ImageOff, Plus, Search, Sparkles, X } from 'lucide-react-native';
import { api, mediaUrl } from '../../src/lib/api';
import { C, R } from '../../src/lib/theme';
import { cover, miles, money, vehicleName } from '../../src/lib/format';
import type { AiCommand, Vehicle, VehicleList, VehicleStatus } from '../../src/lib/types';
import { looksLikeQuestion } from '../../src/lib/search';
import { Badge, Button, Chip, Empty, ErrorView, Loading, Notice, StatusBadge, tap } from '../../src/components/ui';

type Filter = '' | VehicleStatus;
const FILTERS: [Filter, string][] = [['', 'All'], ['PUBLISHED', 'Available'], ['DRAFT', 'Pending'], ['SOLD', 'Sold']];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function VehicleCard({ v, onPress }: { v: Vehicle; onPress: () => void }) {
  const img = cover(v);
  const cgIssues = v.cargurus ? v.cargurus.issues.length : -1;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [st.card, pressed && { opacity: 0.85 }]}
    >
      {img ? (
        <Image source={{ uri: mediaUrl(img) }} style={st.thumb} resizeMode="cover" />
      ) : (
        <View style={[st.thumb, st.noThumb]}>
          <ImageOff size={22} color={C.faint} />
        </View>
      )}
      <View style={st.body}>
        <Text style={st.name} numberOfLines={2}>{vehicleName(v) || 'Vehicle'}</Text>
        <Text style={st.price}>{money(v.price)}</Text>
        <Text style={st.meta} numberOfLines={1}>
          {miles(v.mileage)}
          {v.stockNumber ? ` · Stock ${v.stockNumber}` : ''}
        </Text>
        <View style={st.badges}>
          <StatusBadge status={v.status} />
          {cgIssues === 0 ? <Badge label="CarGurus ✓" tone="ok" /> : cgIssues > 0 ? <Badge label={`CarGurus: ${cgIssues} to fix`} tone="warn" /> : undefined}
          {v.status === 'PUBLISHED' && v.syndicateFacebook !== false ? (
            <View style={st.fb}>
              <Facebook size={13} color={C.fb} />
            </View>
          ) : undefined}
        </View>
      </View>
    </Pressable>
  );
}

export default function Inventory() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ask?: string }>();
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<Filter>('');
  /** keyword = instant search while typing · ai = natural language, sent when you press Search */
  const [mode, setMode] = useState<'keyword' | 'ai'>('keyword');
  const [ai, setAi] = useState<{ query: string; r: AiCommand } | null>(null);
  const q = useDebounced(mode === 'keyword' ? text.trim() : '', 250);

  // GET /dealer/vehicles?status=&q=&sort=&page=&pageSize=  (q searches make, model, trim, VIN, stock # and year)
  const list = useQuery({
    queryKey: ['vehicles', filter, q],
    queryFn: () => api<VehicleList>(`/dealer/vehicles?status=${filter}&q=${encodeURIComponent(q)}&sort=newest&page=1&pageSize=200`),
    placeholderData: keepPreviousData,
    enabled: !ai,
  });

  /**
   * AI search = the web portal's "Just tell it" bar: POST /dealer/ai/command { text, auto: false }
   *   → { intent, reply, search, car_ids, cars, noAi?, … }
   * auto: false — the server only answers; it never changes anything from this search box.
   */
  const ask = useMutation({
    mutationFn: (query: string) => api<AiCommand>('/dealer/ai/command', { method: 'POST', body: { text: query, auto: false }, timeout: 90_000 }),
    onSuccess: (r, query) => {
      // no AI key on the server, or the AI only gave a search word: fall back to the normal search
      if ((r.noAi || (r.intent === 'search' && !r.car_ids.length)) && (r.search || r.noAi)) {
        setAi(null);
        setMode('keyword');
        setText(r.noAi ? query : r.search);
        return;
      }
      setAi({ query, r });
    },
  });
  const runAsk = ask.mutate;
  const resetAsk = ask.reset;

  // every vehicle (newest 500), to show the AI's matches as normal cards
  const all = useQuery({
    queryKey: ['vehicles', '', '', 'all'],
    queryFn: () => api<VehicleList>('/dealer/vehicles?sort=newest&page=1&pageSize=500'),
    enabled: !!ai && ai.r.car_ids.length > 0,
  });
  const aiItems = useMemo(() => {
    if (!ai) return [];
    const by = new Map((all.data?.items || []).map((v) => [v.id, v]));
    return ai.r.car_ids.map((id) => by.get(id)).filter((v): v is Vehicle => !!v && (!filter || v.status === filter));
  }, [ai, all.data, filter]);

  const clear = useCallback(() => {
    setText('');
    setAi(null);
    resetAsk();
  }, [resetAsk]);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    // typed a sentence in keyword mode → it is a question for the AI
    if (mode === 'ai' || looksLikeQuestion(t)) {
      setMode('ai');
      setAi(null);
      runAsk(t);
    }
  };

  // opened from Home › "Ask AI"
  const asked = typeof params.ask === 'string' ? params.ask : '';
  useEffect(() => {
    if (!asked) return;
    setText(asked);
    setMode('ai');
    setAi(null);
    runAsk(asked);
    router.setParams({ ask: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked]);

  const counts = list.data?.counts;
  const total = counts ? counts.PUBLISHED + counts.DRAFT + counts.SOLD : undefined;
  const countOf = (f: Filter) => (ai ? undefined : f === '' ? total : counts?.[f]);
  const open = (v: Vehicle) => router.push({ pathname: '/vehicle/[id]', params: { id: v.id } });
  const aiBusy = ask.isPending;

  return (
    <View style={st.wrap}>
      <View style={st.top}>
        <View style={[st.search, mode === 'ai' && st.searchAi]}>
          {mode === 'ai' ? <Sparkles size={18} color="#6D28D9" /> : <Search size={18} color={C.muted} />}
          <TextInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              if (ai) setAi(null);
            }}
            onSubmitEditing={submit}
            placeholder={mode === 'ai' ? 'Ask: red SUV under 25000 with low mileage' : 'Search year, make, model, VIN or stock #'}
            placeholderTextColor={C.faint}
            style={st.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            editable={!aiBusy}
          />
          {text ? (
            <Pressable hitSlop={10} onPress={clear} accessibilityLabel="Clear search">
              <X size={18} color={C.muted} />
            </Pressable>
          ) : undefined}
          <Pressable
            accessibilityLabel={mode === 'ai' ? 'Switch to keyword search' : 'Switch to AI search'}
            onPress={() => {
              tap();
              setAi(null);
              resetAsk();
              setMode(mode === 'ai' ? 'keyword' : 'ai');
            }}
            style={[st.modeBtn, mode === 'ai' && st.modeBtnOn]}
          >
            <Sparkles size={14} color={mode === 'ai' ? '#FFFFFF' : '#6D28D9'} />
            <Text style={[st.modeText, mode === 'ai' && { color: '#FFFFFF' }]}>AI</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          {FILTERS.map(([f, label]) => (
            <Chip key={f || 'all'} label={label} active={filter === f} count={countOf(f)} onPress={() => setFilter(f)} />
          ))}
        </ScrollView>
      </View>

      {mode === 'ai' && !ai ? (
        aiBusy ? (
          <Loading label="AI is reading your question…" />
        ) : (
          <View style={{ padding: 16 }}>
            {ask.error ? <Notice tone="bad">{(ask.error as Error).message}</Notice> : undefined}
            <Notice tone="info">Ask in plain words, then press Search — for example “red SUV under 25000 with low mileage”, “2021 Honda Civic” or “cars listed over 60 days”.</Notice>
            <Button title="Ask AI" icon={<Sparkles size={18} color="#FFFFFF" />} onPress={submit} disabled={!text.trim()} />
          </View>
        )
      ) : ai ? (
        <FlatList
          data={aiItems}
          keyExtractor={(v) => v.id}
          renderItem={({ item }) => <VehicleCard v={item} onPress={() => open(item)} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={st.aiBox}>
              <Text style={st.aiReply}>✦ {ai.r.reply}</Text>
              <View style={st.aiChips}>
                <Badge label={`“${ai.query}”`} tone="info" />
                {ai.r.search ? <Badge label={`Search: ${ai.r.search}`} /> : undefined}
                <Badge label={`${ai.r.car_ids.length} match${ai.r.car_ids.length === 1 ? '' : 'es'}`} tone={ai.r.car_ids.length ? 'ok' : 'warn'} />
                {filter ? <Badge label={FILTERS.find(([f]) => f === filter)?.[1] || filter} /> : undefined}
              </View>
              {ai.r.intent === 'action' ? <Text style={st.aiNote}>That is a change, not a search. Nothing was changed — the search box only looks things up.</Text> : undefined}
              {ai.r.intent === 'navigate' ? <Text style={st.aiNote}>Use the tabs below to open that page.</Text> : undefined}
              <Button small variant="secondary" title="Clear" icon={<X size={15} color={C.ink} />} onPress={clear} style={{ alignSelf: 'flex-start', marginTop: 10 }} />
            </View>
          }
          ListEmptyComponent={
            all.isLoading ? (
              <Loading />
            ) : (
              <View>
                <Empty title="No vehicles match" text={ai.r.car_ids.length ? 'The matches are hidden by the status filter above.' : 'Try other words, or search by keyword.'} />
                {!ai.r.car_ids.length ? (
                  <Button
                    small
                    variant="secondary"
                    title={`Keyword search for “${ai.r.search || ai.query}”`}
                    onPress={() => {
                      const term = ai.r.search || ai.query;
                      setAi(null);
                      setMode('keyword');
                      setText(term);
                    }}
                    style={{ alignSelf: 'center' }}
                  />
                ) : undefined}
              </View>
            )
          }
        />
      ) : list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <ErrorView message={(list.error as Error).message} onRetry={() => void list.refetch()} />
      ) : (
        <FlatList
          data={list.data?.items || []}
          keyExtractor={(v) => v.id}
          renderItem={({ item }) => <VehicleCard v={item} onPress={() => open(item)} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={C.primary} />}
          ListEmptyComponent={
            <View>
              <Empty title={q || filter ? 'No vehicles match' : 'No vehicles yet'} text={q || filter ? 'Try another search or filter.' : 'Tap + to add your first vehicle.'} />
              {q ? (
                <Button
                  small
                  variant="secondary"
                  title="Ask AI instead"
                  icon={<Sparkles size={15} color={C.ink} />}
                  onPress={() => {
                    setMode('ai');
                    runAsk(q);
                  }}
                  style={{ alignSelf: 'center' }}
                />
              ) : undefined}
            </View>
          }
          ListFooterComponent={
            list.data && list.data.total > list.data.items.length ? (
              <Text style={st.more}>Showing the newest {list.data.items.length} of {list.data.total}. Use search to find older vehicles.</Text>
            ) : undefined
          }
        />
      )}

      <Pressable
        accessibilityLabel="Add vehicle"
        onPress={() => {
          tap();
          router.push('/vehicle/add');
        }}
        style={({ pressed }) => [st.fab, pressed && { opacity: 0.85 }]}
      >
        <Plus size={28} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  top: { backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.line },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, marginBottom: 10, paddingHorizontal: 12, height: 46, borderRadius: R.md, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line },
  searchInput: { flex: 1, fontSize: 16, color: C.ink, paddingVertical: 0 },
  searchAi: { borderColor: '#A78BFA', backgroundColor: '#FAF5FF' },
  modeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 9, borderRadius: 15, backgroundColor: '#EDE9FE' },
  modeBtnOn: { backgroundColor: '#6D28D9' },
  modeText: { fontSize: 12, fontWeight: '800', color: '#6D28D9' },
  aiBox: { backgroundColor: '#F5F3FF', borderRadius: R.lg, borderWidth: 1, borderColor: '#DDD6FE', padding: 14, marginBottom: 12 },
  aiReply: { fontSize: 15, fontWeight: '600', color: C.ink, lineHeight: 21 },
  aiChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  aiNote: { fontSize: 13, color: C.warn, marginTop: 8, lineHeight: 18 },
  card: { flexDirection: 'row', backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, marginBottom: 12, overflow: 'hidden' },
  thumb: { width: 118, minHeight: 104, backgroundColor: '#E2E8F0' },
  noThumb: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, padding: 12 },
  name: { fontSize: 16, fontWeight: '700', color: C.ink },
  price: { fontSize: 17, fontWeight: '800', color: C.primary, marginTop: 3 },
  meta: { fontSize: 13, color: C.muted, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 },
  fb: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#E7F0FE', alignItems: 'center', justifyContent: 'center' },
  more: { textAlign: 'center', color: C.muted, fontSize: 13, paddingVertical: 12 },
  fab: { position: 'absolute', right: 18, bottom: 22, width: 60, height: 60, borderRadius: 30, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
});
