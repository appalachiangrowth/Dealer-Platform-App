import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider, useSession } from '../src/lib/session';
import { ApiError } from '../src/lib/api';
import { C } from '../src/lib/theme';

/** Sends the user to Login when there is no session (first launch, logout, expired token → 401) and back in after login. */
function AuthGate() {
  const { ready, me, dealership } = useSession();
  const segments = useSegments() as string[];
  const router = useRouter();
  const authed = !!me && !!dealership;
  const first = segments[0];

  useEffect(() => {
    if (!ready) return;
    const onLogin = first === 'login';
    if (!authed && !onLogin) router.replace('/login');
    else if (authed && (onLogin || first === undefined)) router.replace('/(tabs)');
  }, [ready, authed, first, router]);

  return null;
}

export default function RootLayout() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            // never retry a "please log in" / "not allowed" / validation answer
            retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
          },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <SessionProvider>
          <StatusBar style="light" />
          <AuthGate />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: C.navy },
              headerTintColor: '#FFFFFF',
              headerTitleStyle: { fontWeight: '700' },
              headerBackTitle: 'Back',
              contentStyle: { backgroundColor: C.bg },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="vehicle/add" options={{ title: 'Add Vehicle' }} />
            <Stack.Screen name="vehicle/new" options={{ title: 'Add Manually' }} />
            <Stack.Screen name="vehicle/ai" options={{ title: 'Add with AI' }} />
            <Stack.Screen name="design" options={{ title: 'Design & Colors' }} />
            <Stack.Screen name="vehicle/[id]" options={{ title: 'Vehicle' }} />
            <Stack.Screen name="vehicle/edit/[id]" options={{ title: 'Edit Vehicle' }} />
          </Stack>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
