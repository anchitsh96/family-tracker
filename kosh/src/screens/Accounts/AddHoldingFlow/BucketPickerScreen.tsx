import React from 'react';
import { View, Text, Pressable, StyleSheet, FlatList } from 'react-native';
import { Screen } from '@/components/Screen';
import { BUCKETS, BUCKET_LABELS, BUCKET_ICONS, Bucket } from '@/types/account';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { typography } from '@/theme/typography';

interface Props {
  onPick: (bucket: Bucket) => void;
}

export function BucketPickerScreen({ onPick }: Props) {
  return (
    <Screen scroll={false}>
      <Text style={styles.h1}>Add holding</Text>
      <Text style={styles.sub}>What kind of asset is this?</Text>
      <FlatList
        style={{ marginTop: spacing.lg }}
        data={[...BUCKETS]}
        keyExtractor={(b) => b}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.md }}
        contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xxl }}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => onPick(item)}>
            <Text style={styles.icon}>{BUCKET_ICONS[item]}</Text>
            <Text style={styles.label}>{BUCKET_LABELS[item]}</Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { ...typography.h1, color: colors.textPrimary },
  sub: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    minHeight: 110,
    justifyContent: 'center',
  },
  icon: { fontSize: 32 },
  label: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', marginTop: spacing.sm, textAlign: 'center' },
});
