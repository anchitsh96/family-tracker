import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { useAuth } from '@/state/auth';
import { usePrivacy } from '@/state/privacy';
import { useFx } from '@/state/fx';
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
    // Restore the persisted privacy-mode preference at boot — fire and
    // forget. It resolves long before the user unlocks and the dashboard
    // appears, and the store defaults to `hidden` until it does.
    usePrivacy.getState().hydrate();
    // Hydrate the last cached USD/INR rate so the very first dashboard
    // paint after unlock can render with a real rate. The live refresh
    // happens lazily on dashboard mount via refreshIfStale().
    useFx.getState().hydrate();
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
