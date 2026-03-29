import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
} from 'react-native';
import type { GameRendererProps } from '../types';

const COLORS = {
  bg: '#0A0A0F',
  surface: '#13131A',
  surfaceHigh: '#1C1C28',
  border: '#2A2A3D',
  accent: '#7C3AED',
  accentDim: '#3D1A7A',
  green: '#10B981',
  red: '#EF4444',
  gold: '#F59E0B',
  white: '#FFFFFF',
  offWhite: '#E8E8F0',
  muted: '#6B6B8A',
} as const;

export function QuickMathGame({
  roundIndex,
  totalRounds,
  payload,
  timeLimitMs,
  playersRemaining,
  onSubmit,
  selectedAnswer,
  isLocked,
}: GameRendererProps) {
  const expression = payload['expression'] as string;
  const options = payload['options'] as string[];

  const timerAnim = useRef(new Animated.Value(1)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const startedAt = useRef(Date.now());
  const [timeLeftMs, setTimeLeftMs] = useState(timeLimitMs);

  useEffect(() => {
    const endAt = startedAt.current + timeLimitMs;
    const remaining = endAt - Date.now();

    if (remaining > 0) {
      timerAnim.setValue(remaining / timeLimitMs);
      animRef.current = Animated.timing(timerAnim, {
        toValue: 0,
        duration: remaining,
        useNativeDriver: false,
      });
      animRef.current.start();
    } else {
      timerAnim.setValue(0);
    }

    const tick = setInterval(() => {
      const left = endAt - Date.now();
      setTimeLeftMs(Math.max(0, left));
      if (left <= 0) clearInterval(tick);
    }, 250);

    return () => {
      clearInterval(tick);
      if (animRef.current) animRef.current.stop();
    };
  }, [timeLimitMs, timerAnim]);

  const timerColor = timerAnim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [COLORS.red, COLORS.gold, COLORS.green],
  });

  const timeLeftSec = Math.ceil(timeLeftMs / 1000);

  const selectedOptionId =
    selectedAnswer && 'selectedOptionId' in selectedAnswer
      ? (selectedAnswer as { selectedOptionId: string }).selectedOptionId
      : null;

  return (
    <View style={styles.questionOverlayContainer}>
      {/* Dim the video behind */}
      <View style={styles.questionBackdrop} />

      {/* Question panel */}
      <View style={styles.questionPanel}>
        {/* Header row */}
        <View style={styles.questionHeader}>
          <Text style={styles.roundLabel}>ROUND {roundIndex + 1}/{totalRounds}</Text>
          <Text style={styles.timerText}>{timeLeftSec}s</Text>
          <Text style={styles.hudPlayers}>{playersRemaining} left</Text>
        </View>

        {/* Timer bar */}
        <View style={styles.timerBarTrack}>
          <Animated.View
            style={[styles.timerBarFill, { flex: timerAnim, backgroundColor: timerColor }]}
          />
        </View>

        {/* Expression */}
        <View style={styles.expressionContainer}>
          <Text style={styles.expression}>{expression}</Text>
        </View>

        {/* Options grid — 2x2 */}
        <View style={styles.optionsGrid}>
          {options.map((optText, idx) => {
            const isSelected = selectedOptionId === String(idx);
            const isOptionLocked = isLocked && !isSelected;
            return (
              <Pressable
                key={idx}
                style={[
                  styles.optionCard,
                  isSelected && styles.optionCardSelected,
                  isOptionLocked && styles.optionCardLocked,
                ]}
                onPress={() =>
                  !isLocked &&
                  onSubmit({ gameType: 'quick_math', selectedOptionId: String(idx) })
                }
                accessibilityRole="button"
                accessibilityLabel={`Option ${idx + 1}: ${optText}`}
                accessibilityState={{ selected: isSelected, disabled: isLocked }}
              >
                <Text style={[
                  styles.optionText,
                  isSelected && styles.optionTextSelected,
                  isOptionLocked && styles.optionTextLocked,
                ]}>
                  {optText}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {isLocked && (
          <View style={styles.lockedBanner}>
            <Text style={styles.lockedBannerText}>Answer locked. Waiting for result...</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  questionOverlayContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  questionBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  questionPanel: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '72%',
    borderTopWidth: 1,
    borderColor: COLORS.border,
    paddingBottom: 36,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  roundLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 1.5,
  },
  timerText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
    minWidth: 32,
    textAlign: 'center',
  },
  hudPlayers: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.offWhite,
    letterSpacing: 0.5,
  },
  timerBarTrack: {
    height: 4,
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
  },
  timerBarFill: {
    height: 4,
    borderRadius: 2,
  },
  expressionContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  expression: {
    fontSize: 42,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -1,
    textAlign: 'center',
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 20,
  },
  optionCard: {
    width: '47.5%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 14,
  },
  optionCardSelected: {
    backgroundColor: COLORS.accentDim,
    borderColor: COLORS.accent,
  },
  optionCardLocked: {
    opacity: 0.4,
  },
  optionText: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.offWhite,
    textAlign: 'center',
  },
  optionTextSelected: {
    color: COLORS.white,
  },
  optionTextLocked: {
    color: COLORS.muted,
  },
  lockedBanner: {
    marginTop: 16,
    marginHorizontal: 20,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  lockedBannerText: {
    fontSize: 14,
    color: COLORS.muted,
    fontWeight: '500',
  },
});
