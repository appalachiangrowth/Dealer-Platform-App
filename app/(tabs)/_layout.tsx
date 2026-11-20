import React from 'react';
import { Tabs } from 'expo-router';
import { Building2, Car, Facebook, Home, RefreshCw } from 'lucide-react-native';
import { C } from '../../src/lib/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.navy },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
      <Tabs.Screen name="inventory" options={{ title: 'Inventory', tabBarIcon: ({ color, size }) => <Car color={color} size={size} /> }} />
      <Tabs.Screen name="cargurus" options={{ title: 'CarGurus', tabBarIcon: ({ color, size }) => <RefreshCw color={color} size={size} /> }} />
      <Tabs.Screen name="facebook" options={{ title: 'Facebook', tabBarIcon: ({ color, size }) => <Facebook color={color} size={size} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Business', tabBarIcon: ({ color, size }) => <Building2 color={color} size={size} /> }} />
    </Tabs>
  );
}
