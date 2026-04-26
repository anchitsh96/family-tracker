import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { useAuth } from '@/state/auth';
import { isFirstRun } from '@/crypto/keystore';
import { OnboardingFlow } from '@/screens/Onboarding/OnboardingFlow';
import { LockScreen } from '@/screens/Auth/LockScreen';
import { TabNavigator } from './TabNavigator';
import { colors } from '@/theme/colors';

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
    primary: colors.accent,
    notification: colors.warning,
  },
};

export function RootNavigator() {
  const status = useAuth((s) => s.status);
  const setStatus = useAuth((s) => s.setStatus);

  useEffect(() => {
    if (status !== 'unknown') return;
    (async () => {
      const first = await isFirstRun();
      setStatus(first ? 'first_run' : 'locked');
    })();
  }, [status, setStatus]);

  if (status === 'unknown') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {status === 'first_run' ? (
        <OnboardingFlow />
      ) : status === 'locked' ? (
        <LockScreen />
      ) : (
        <TabNavigator />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
