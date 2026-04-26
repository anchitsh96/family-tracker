import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing } from '@/theme/spacing';

// In-app splash shown while we're booting (waiting on the keystore lookup
// to decide first_run vs locked, etc). Sits on top of the white native
// splash so the visual stays continuous from cold start to first JS frame.
//
// Shows the Kosh wordmark plus a slow, breathing accent dot — calmer than
// a chunky spinner, more intentional than a bare ActivityIndicator.

interface Props {
  message?: string;
}

export function SplashView({ message }: Props) {
  const breath = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const breathLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    breathLoop.start();
    // The progress bar fills indeterminately — left to right, then resets.
    const progressLoop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      })
    );
    progressLoop.start();
    return () => {
      breathLoop.stop();
      progressLoop.stop();
    };
  }, [breath, progress]);

  const dotScale = breath.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] });
  const dotOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const barTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['-60%', '160%'],
  });

  return (
    <View style={styles.root}>
      <View style={styles.center}>
        <Animated.View
          style={[
            styles.dot,
            { transform: [{ scale: dotScale }], opacity: dotOpacity },
          ]}
        />
        <Text style={styles.brand}>Kosh</Text>
      </View>

      <View style={styles.bottom}>
        <View style={styles.barTrack}>
          <Animated.View
            style={[styles.barFill, { transform: [{ translateX: barTranslate as unknown as number }] }]}
          />
        </View>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingTop: 120,
    paddingBottom: 80,
  },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    marginBottom: spacing.lg,
  },
  brand: {
    ...typography.headline,
    color: colors.textPrimary,
    fontSize: 40,
    letterSpacing: -1,
  },
  bottom: { alignItems: 'center', gap: spacing.md },
  barTrack: {
    width: '60%',
    height: 3,
    backgroundColor: colors.surface,
    borderRadius: 999,
    overflow: 'hidden',
  },
  barFill: {
    width: '40%',
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 999,
  },
  message: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
