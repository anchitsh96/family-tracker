import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DashboardScreen } from '@/screens/Dashboard/DashboardScreen';
import { AccountsStack } from './AccountsStack';
import { DocumentsScreen } from '@/screens/Documents/DocumentsScreen';
import { SettingsScreen } from '@/screens/Settings/SettingsScreen';
import { ProfileSwitcher } from '@/components/ProfileSwitcher';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

const Tab = createBottomTabNavigator();

function TopBar() {
  return (
    <SafeAreaView edges={['top']} style={styles.topBar}>
      <View style={styles.topBarInner}>
        <ProfileSwitcher />
        <View style={{ flex: 1 }} />
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
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardWithBar}
        options={{ tabBarIcon: ({ color }) => <TabIcon glyph="●" color={color} /> }}
      />
      <Tab.Screen
        name="Accounts"
        component={AccountsWithBar}
        options={{ tabBarIcon: ({ color }) => <TabIcon glyph="▤" color={color} /> }}
      />
      <Tab.Screen
        name="Documents"
        component={DocumentsWithBar}
        options={{ tabBarIcon: ({ color }) => <TabIcon glyph="▵" color={color} /> }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsWithBar}
        options={{ tabBarIcon: ({ color }) => <TabIcon glyph="◐" color={color} /> }}
      />
    </Tab.Navigator>
  );
}

function TabIcon({ glyph, color }: { glyph: string; color: string }) {
  return <Text style={{ color, fontSize: 18, fontWeight: '600' }}>{glyph}</Text>;
}

const styles = StyleSheet.create({
  topBar: { backgroundColor: colors.bg },
  topBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
