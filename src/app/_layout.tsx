import { DarkTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CloudOverlay } from '../components/CloudOverlay';
import { startAutoUpdate } from '../lib/autoUpdate';
import { CloudProvider } from '../lib/cloud';
import { StoreProvider } from '../lib/store';
import { TimerProvider } from '../lib/timer';
import { colors } from '../theme';

startAutoUpdate();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, primary: colors.accent, text: colors.text, border: colors.border },
};

// У браузері модальні вікна Expo Router показуються як «аркуш», який на деяких телефонах
// не відкривається; тому на вебі відкриваємо екрани як звичайні сторінки.
const sheet = Platform.OS === 'web' ? { animation: 'slide_from_bottom' as const } : { presentation: 'modal' as const, animation: 'slide_from_bottom' as const };

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <CloudProvider>
        <ThemeProvider value={theme}>
        <TimerProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="recipe/[id]" options={sheet} />
            <Stack.Screen name="filters" options={sheet} />
            <Stack.Screen name="search" />
            <Stack.Screen name="tonight" />
            <Stack.Screen name="fridge" />
            <Stack.Screen name="obsidian" />
          </Stack>
          <CloudOverlay />
        </TimerProvider>
        </ThemeProvider>
        </CloudProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
