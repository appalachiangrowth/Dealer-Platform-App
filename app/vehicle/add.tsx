import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, PenLine, Sparkles } from 'lucide-react-native';
import { api } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { AiStatus } from '../../src/lib/ai';
import { C, R } from '../../src/lib/theme';
import { Notice, Screen, tap } from '../../src/components/ui';

/** "+ Add Vehicle" asks first: with AI, or by hand? (like the web portal's AddVehicleChooser) */
export default function AddVehicle() {
  const router = useRouter();
  const { me } = useSession();
  // GET /dealer/ai/status → { hasKey, video, … }
  const status = useQuery({ queryKey: ['ai-status'], queryFn: () => api<AiStatus>('/dealer/ai/status'), staleTime: 5 * 60_000, retry: false });
  const featureOff = me?.tenant?.features?.ai === false;
  const aiOff = featureOff || status.data?.hasKey === false;

  const Option = ({ title, text, icon, onPress, disabled, accent }: { title: string; text: string; icon: React.ReactNode; onPress: () => void; disabled?: boolean; accent?: boolean }) => (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [st.opt, accent && st.optAccent, disabled && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
    >
      <View style={[st.icon, accent && { backgroundColor: '#EDE9FE' }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={st.title}>{title}</Text>
        <Text style={st.text}>{text}</Text>
      </View>
      <ChevronRight size={20} color={C.faint} />
    </Pressable>
  );

  return (
    <Screen>
      <Text style={st.h}>How do you want to add it?</Text>
      <Option
        accent
        title="Add with AI"
        text="Take photos or a walkaround video. The AI reads the VIN, colours, mileage and features, and writes the description. You check it and save."
        icon={<Sparkles size={24} color="#6D28D9" />}
        onPress={() => router.replace('/vehicle/ai')}
        disabled={aiOff}
      />
      {aiOff ? <Notice tone="warn">{featureOff ? 'AI is not switched on for your dealership.' : 'AI is not set up on the server yet (no AI key in the backend .env).'}</Notice> : null}
      <Option title="Add Manually" text="Type the details yourself. The VIN decoder fills in year, make, model and engine." icon={<PenLine size={24} color={C.primary} />} onPress={() => router.replace('/vehicle/new')} />
    </Screen>
  );
}

const st = StyleSheet.create({
  h: { fontSize: 20, fontWeight: '800', color: C.ink, marginBottom: 14 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 16, marginBottom: 14 },
  optAccent: { borderColor: '#C4B5FD' },
  icon: { width: 52, height: 52, borderRadius: 14, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: C.ink },
  text: { fontSize: 13, color: C.muted, marginTop: 3, lineHeight: 19 },
});
