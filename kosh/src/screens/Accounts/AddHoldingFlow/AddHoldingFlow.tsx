import React, { useState } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { Screen } from '@/components/Screen';
import { BucketPickerScreen } from './BucketPickerScreen';
import { pickFormFor } from './forms';
import { Bucket } from '@/types/account';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

interface Props {
  onClose: () => void;
}

export function AddHoldingFlow({ onClose }: Props) {
  const [bucket, setBucket] = useState<Bucket | null>(null);

  if (!bucket) {
    return (
      <>
        <BucketPickerScreen onPick={setBucket} />
        <Pressable onPress={onClose} style={styles.cancel}>
          <Text style={styles.cancelTxt}>Cancel</Text>
        </Pressable>
      </>
    );
  }

  const FormComponent = pickFormFor(bucket);
  return (
    <Screen>
      <Pressable onPress={() => setBucket(null)}><Text style={styles.back}>‹ Back</Text></Pressable>
      <FormComponent onSaved={onClose} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.accent, fontSize: 14, marginBottom: spacing.md },
  cancel: { position: 'absolute', top: 60, right: spacing.lg, padding: spacing.sm },
  cancelTxt: { color: colors.textSecondary, fontWeight: '500' },
});
