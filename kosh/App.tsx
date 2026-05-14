import 'react-native-gesture-handler';
import 'react-native-get-random-values';
// Side-effect import: hooks RN Text to map fontWeight → matching Inter
// PostScript family. Must come before any module that renders Text.
import '@/theme/installInterFont';
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { RootNavigator } from '@/navigation/RootNavigator';
import { SplashView } from '@/components/SplashView';

// Hard cap on how long we'll wait for Inter to load before rendering the
// app anyway. If the font assets fail to bundle or load, the app must
// still be usable — it'll just fall back to the system font (SF Pro),
// which is perfectly legible. Never let a font load hang the whole app.
const FONT_LOAD_TIMEOUT_MS = 3000;

export default function App() {
  // Wise's design system uses Inter as the primary typeface. We load
  // Regular/Medium/SemiBold/Bold up front.
  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  });

  // Failsafe timeout — proceed even if fonts never resolve.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), FONT_LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  const ready = fontsLoaded || !!fontError || timedOut;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {ready ? <RootNavigator /> : <SplashView />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
