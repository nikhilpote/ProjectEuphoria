import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  ScrollView,
  Image,
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

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

interface TriviaPayload {
  question: string;
  questionImageUrl: string | null;
  options: string[];
  optionImageUrls: (string | null)[];
  category: string | null;
  difficulty: number;
}

export function TriviaGame({
  roundIndex,
  totalRounds,
  payload,
  timeLimitMs,
  playersRemaining,
  onSubmit,
  selectedAnswer,
  isLocked,
}: GameRendererProps) {
  const trivia = payload as unknown as TriviaPayload;
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

        <ScrollView
          contentContainerStyle={styles.questionContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Question */}
          {trivia.questionImageUrl ? (
            <Image
              source={{ uri: trivia.questionImageUrl }}
              style={styles.questionImage}
              resizeMode="contain"
            />
          ) : null}
          <Text style={styles.question}>{trivia.question}</Text>

          {/* Options */}
          <View style={styles.optionsGrid}>
            {trivia.options.map((optText, idx) => {
              const label = OPTION_LABELS[idx] ?? String(idx);
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
                    onSubmit({ gameType: 'trivia', selectedOptionId: String(idx) })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Option ${label}: ${optText}`}
                  accessibilityState={{ selected: isSelected, disabled: isLocked }}
                >
                  <View style={[styles.optionBadge, isSelected && styles.optionBadgeSelected]}>
                    <Text style={[styles.optionBadgeText, isSelected && styles.optionBadgeTextSelected]}>
                      {label}
                    </Text>
                  </View>
                  <View style={styles.optionTextColumn}>
                    {trivia.optionImageUrls?.[idx] ? (
                      <Image
                        source={{ uri: trivia.optionImageUrls[idx]! }}
                        style={styles.optionImage}
                        resizeMode="cover"
                      />
                    ) : null}
                    <Text style={[
                      styles.optionText,
                      isSelected && styles.optionTextSelected,
                      isOptionLocked && styles.optionTextLocked,
                    ]}>
                      {optText}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {isLocked && (
            <View style={styles.lockedBanner}>
              <Text style={styles.lockedBannerText}>Answer locked. Waiting for result...</Text>
            </View>
          )}
        </ScrollView>
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
  questionContent: {
    padding: 20,
    paddingBottom: 36,
  },
  questionImage: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: COLORS.surface,
  },
  question: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.white,
    lineHeight: 28,
    marginBottom: 20,
    textAlign: 'center',
  },
  optionsGrid: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  optionCardSelected: {
    backgroundColor: COLORS.accentDim,
    borderColor: COLORS.accent,
  },
  optionCardLocked: {
    opacity: 0.4,
  },
  optionBadge: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: COLORS.surfaceHigh,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  optionBadgeSelected: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  optionBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.muted,
  },
  optionBadgeTextSelected: {
    color: COLORS.white,
  },
  optionTextColumn: {
    flex: 1,
    gap: 6,
  },
  optionImage: {
    width: '100%',
    height: 80,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceHigh,
  },
  optionText: {
    fontSize: 15,
    color: COLORS.offWhite,
    fontWeight: '500',
    lineHeight: 21,
  },
  optionTextSelected: {
    color: COLORS.white,
    fontWeight: '600',
  },
  optionTextLocked: {
    color: COLORS.muted,
  },
  lockedBanner: {
    marginTop: 16,
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
