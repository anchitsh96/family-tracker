import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  FlatList,
  PanResponder,
} from 'react-native';
import { useActiveProfile } from '@/state/activeProfile';
import { ProfileRepository } from '@/storage/repositories/ProfileRepository';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';

// Profile switcher: a circular avatar (profile initial on the profile's
// accent color) + name + chevron.
//   • Tap        → opens the profile picker bottom sheet
//   • Swipe up   → next profile
//   • Swipe down → previous profile
//
// Swipe detection uses RN core's PanResponder (pure JS) rather than
// react-native-gesture-handler + reanimated worklets — the worklet path
// crashed natively on this RN/New-Architecture combo.
export function ProfileSwitcher() {
  const activeId = useActiveProfile((s) => s.activeProfileId);
  const setActive = useActiveProfile((s) => s.setActive);
  const [open, setOpen] = useState(false);
  const profiles = activeId ? ProfileRepository.list() : [];
  const active = profiles.find((p) => p.id === activeId);

  // PanResponder is created once; it must always see the latest activeId /
  // setActive, so route through a ref that we refresh every render.
  const handlersRef = useRef({ activeId, setActive, openSheet: () => setOpen(true) });
  handlersRef.current = { activeId, setActive, openSheet: () => setOpen(true) };

  const cycle = (dir: 1 | -1) => {
    const { activeId: id, setActive: set } = handlersRef.current;
    const list = ProfileRepository.list();
    if (list.length < 2 || !id) return;
    const idx = list.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const next = list[(idx + dir + list.length) % list.length];
    if (next) set(next.id);
  };

  const panResponder = useRef(
    PanResponder.create({
      // Only claim the gesture once it's clearly a vertical drag.
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dy) > 10 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_e, g) => {
        const tap = Math.abs(g.dy) < 8 && Math.abs(g.dx) < 8;
        if (tap) {
          handlersRef.current.openSheet();
        } else if (g.dy < -20) {
          cycle(1); // swipe up → next
        } else if (g.dy > 20) {
          cycle(-1); // swipe down → previous
        }
      },
      // A quick tap never triggers onMove, so handle it on release here too.
      onStartShouldSetPanResponder: () => true,
    })
  ).current;

  if (!active) return null;

  const initial = active.displayName.charAt(0).toUpperCase();

  return (
    <>
      <View style={styles.pill} {...panResponder.panHandlers}>
        <View style={[styles.avatar, { backgroundColor: active.accentColor }]}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
        <Text style={styles.name}>{active.displayName}</Text>
        <Text style={styles.chev}>▾</Text>
      </View>

      <Modal
        transparent
        visible={open}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Switch profile</Text>
            <FlatList
              data={profiles}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => {
                const isActive = item.id === activeId;
                return (
                  <Pressable
                    style={styles.row}
                    onPress={() => {
                      setActive(item.id);
                      setOpen(false);
                    }}
                  >
                    <View
                      style={[styles.rowAvatar, { backgroundColor: item.accentColor }]}
                    >
                      <Text style={styles.avatarInitial}>
                        {item.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.rowName}>{item.displayName}</Text>
                    {isActive ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                );
              }}
            />
            <Text style={styles.hint}>
              Tip: swipe up or down on the avatar to switch quickly
            </Text>
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
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 4,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '700',
  },
  name: { color: colors.textPrimary, fontSize: 15, fontWeight: '600', letterSpacing: -0.1 },
  chev: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', marginLeft: -2 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sheetTitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: spacing.md,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: { color: colors.textPrimary, fontSize: 16, flex: 1, fontWeight: '500' },
  check: { color: colors.accent, fontSize: 18 },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
