import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, FlatList } from 'react-native';
import { useActiveProfile } from '@/state/activeProfile';
import { ProfileRepository } from '@/storage/repositories/ProfileRepository';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';

export function ProfileSwitcher() {
  const activeId = useActiveProfile((s) => s.activeProfileId);
  const setActive = useActiveProfile((s) => s.setActive);
  const [open, setOpen] = useState(false);
  const profiles = activeId ? ProfileRepository.list() : [];
  const active = profiles.find((p) => p.id === activeId);

  if (!active) return null;

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.pill}>
        <View style={[styles.dot, { backgroundColor: active.accentColor }]} />
        <Text style={styles.name}>{active.displayName}</Text>
        <Text style={styles.chev}>▾</Text>
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Switch profile</Text>
            <FlatList
              data={profiles}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.row}
                  onPress={() => {
                    setActive(item.id);
                    setOpen(false);
                  }}
                >
                  <View style={[styles.dot, { backgroundColor: item.accentColor }]} />
                  <Text style={styles.rowName}>{item.displayName}</Text>
                  {item.id === activeId ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  chev: { color: colors.textSecondary, fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sheetTitle: { color: colors.textSecondary, fontSize: 13, marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowName: { color: colors.textPrimary, fontSize: 16, flex: 1 },
  check: { color: colors.accent, fontSize: 18 },
});
