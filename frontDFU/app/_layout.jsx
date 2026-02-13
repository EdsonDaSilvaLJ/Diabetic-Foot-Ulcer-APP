// app/_layout.jsx - VERSÃO SIMPLIFICADA

import { Stack } from 'expo-router';

export default function RootLayout() {
  console.log('🏗️ RootLayout carregado');

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="logup" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="paciente" />
    </Stack>
  );
}