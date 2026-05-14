import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DashboardScreen } from '@/screens/Dashboard/DashboardScreen';
import { AccountsStack } from './AccountsStack';
import { DocumentsScreen } from '@/screens/Documents/DocumentsScreen';
import { SettingsScreen } from '@/screens/Settings/SettingsScreen';
import { ProfileSwitcher } from '@/components/ProfileSwitcher';
import { PrivacyToggle } from '@/components/PrivacyToggle';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

const Tab = createBottomTabNavigator();

function TopBar() {
  return (
    <SafeAreaView edges={['top']} style={styles.topBar}>
      <View style={styles.topBarInner}>
        <ProfileSwitcher />
        <View style={{ flex: 1 }} />
        <PrivacyToggle />
      </View>
    </SafeAreaView>
  );
}

function withTopBar<T extends object>(Comp: React.ComponentType<T>) {
  const Wrapper = (props: T) => (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar />
      <View style={{ flex: 1 }}>
        <Comp {...props} />
      </View>
    </View>
  );
  return Wrapper;
}

const DashboardWithBar = withTopBar(DashboardScreen);
const AccountsWithBar = withTopBar(AccountsStack);
const DocumentsWithBar = withTopBar(DocumentsScreen);
const SettingsWithBar = withTopBar(SettingsScreen);

export function TabNavigator() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.textPrimary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          height: 56 + Math.max(insets.bottom, 8),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        tabBarItemStyle: { paddingVertical: 4 },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardWithBar}
        options={{
          tabBarIcon: ({ color, focused }) => <TabIcon glyph="◉" color={color} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Accounts"
        component={AccountsWithBar}
        options={{
          tabBarIcon: ({ color, focused }) => <TabIcon glyph="◫" color={color} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Documents"
        component={DocumentsWithBar}
        options={{
          tabBarIcon: ({ color, focused }) => <TabIcon glyph="◰" color={color} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsWithBar}
        options={{
          tabBarIcon: ({ color, focused }) => <TabIcon glyph="◍" color={color} focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

function TabIcon({ glyph, color, focused }: { glyph: string; color: string; focused: boolean }) {
  return (
    <Text style={{ color, fontSize: 20, fontWeight: focused ? '700' : '500' }}>{glyph}</Text>
  );
}

const styles = StyleSheet.create({
  topBar: { backgroundColor: colors.bg },
  topBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 8,
    paddingBottom: 8,
  },
});
