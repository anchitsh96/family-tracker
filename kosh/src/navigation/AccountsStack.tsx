import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AccountsListScreen } from '@/screens/Accounts/AccountsListScreen';
import { AccountDetailScreen } from '@/screens/Accounts/AccountDetailScreen';
import { AddHoldingFlow } from '@/screens/Accounts/AddHoldingFlow/AddHoldingFlow';
import { colors } from '@/theme/colors';

export type AccountsStackParamList = {
  AccountsList: undefined;
  AccountDetail: { accountId: string };
  AddHolding: undefined;
};

const Stack = createNativeStackNavigator<AccountsStackParamList>();

export function AccountsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="AccountsList">
        {({ navigation }) => (
          <AccountsListScreen
            onAdd={() => navigation.navigate('AddHolding')}
            onPickAccount={(accountId) => navigation.navigate('AccountDetail', { accountId })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="AccountDetail">
        {({ route, navigation }) => (
          <AccountDetailScreen accountId={route.params.accountId} onBack={() => navigation.goBack()} />
        )}
      </Stack.Screen>
      <Stack.Screen name="AddHolding" options={{ presentation: 'modal' }}>
        {({ navigation }) => <AddHoldingFlow onClose={() => navigation.goBack()} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
