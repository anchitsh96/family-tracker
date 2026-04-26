import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Screen } from '@/components/Screen';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { generateMnemonic24 } from '@/crypto/seedPhrase';

interface Props {
  onContinue: (mnemonic: string) => void;
}

export function RecoverySeedScreen({ onContinue }: Props) {
  const [mnemonic, setMnemonic] = useState<string>('');
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [layoutHeight, setLayoutHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    setMnemonic(generateMnemonic24());
  }, []);

  // If the 24 words fit without overflow (tall phone, generous box), onScroll
  // never fires. Treat "no scrolling needed" as already-at-bottom once both
  // dimensions are known.
  useEffect(() => {
    if (
      layoutHeight > 0 &&
      contentHeight > 0 &&
      contentHeight <= layoutHeight + 40 &&
      !scrolledToBottom
    ) {
      setScrolledToBottom(true);
    }
  }, [layoutHeight, contentHeight, scrolledToBottom]);

  const words = useMemo(() => mnemonic.split(' ').filter(Boolean), [mnemonic]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const atBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
    if (atBottom && !scrolledToBottom) setScrolledToBottom(true);
  };

  const onContentSizeChange = (_w: number, h: number) => setContentHeight(h);
  const onLayout = (e: { nativeEvent: { layout: { height: number } } }) =>
    setLayoutHeight(e.nativeEvent.layout.height);

  return (
    <Screen scroll={false}>
      <View style={styles.container}>
        <Text style={styles.h1}>Recovery phrase</Text>
        <Text style={styles.sub}>
          Write these 24 words on paper, in order. Anyone with this phrase plus a backup file can
          read your data. Anyone without it cannot.
        </Text>

        <ScrollView
          style={styles.box}
          contentContainerStyle={styles.boxContent}
          onScroll={onScroll}
          onContentSizeChange={onContentSizeChange}
          onLayout={onLayout}
          scrollEventThrottle={64}
        >
          {words.map((w, i) => (
            <View key={i} style={styles.word}>
              <Text style={styles.idx}>{String(i + 1).padStart(2, '0')}</Text>
              <Text style={styles.wTxt}>{w}</Text>
            </View>
          ))}
        </ScrollView>

        <Text style={styles.warn}>
          Do not screenshot. Do not store digitally. Paper only.
        </Text>

        <PrimaryButton
          title={scrolledToBottom ? "I've saved it" : 'Scroll to bottom to continue'}
          onPress={() => onContinue(mnemonic)}
          disabled={!scrolledToBottom || !mnemonic}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg },
  h1: { ...typography.h1, color: colors.textPrimary, marginTop: spacing.lg },
  sub: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.lg },
  box: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  boxContent: {
    padding: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  word: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    width: '46%',
    paddingVertical: spacing.xs,
  },
  idx: { color: colors.textMuted, fontFamily: 'Menlo', fontSize: 12, width: 24 },
  wTxt: { color: colors.textPrimary, fontSize: 15, fontWeight: '500' },
  warn: { color: colors.warning, fontSize: 12, textAlign: 'center', marginBottom: spacing.md },
});
