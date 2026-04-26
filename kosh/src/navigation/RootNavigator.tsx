import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { useAuth } from '@/state/auth';
import { isFirstRun } from '@/crypto/keystore';
import { OnboardingFlow } from '@/screens/Onboarding/OnboardingFlow';
import { LockScreen } from '@/screens/Auth/LockScreen';
import { TabNavigator } from './TabNavigator';
import { SplashView } from '@/components/SplashView';
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
    return <SplashView />;
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
