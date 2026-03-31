import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Animated,
  PanResponder,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth.store';
import { GameRenderer } from '@/games/GameRenderer';
import {
  usePlayClipsSocket,
  type ClipResult,
} from '@/hooks/usePlayClipsSocket';
import type { GameAnswer } from '@euphoria/types';

const COLORS = {
  bg: '#0A0A0F',
  surface: '#13131A',
  border: '#2A2A3D',
  accent: '#7C3AED',
  green: '#10B981',
  red: '#EF4444',
  gold: '#F59E0B',
  white: '#FFFFFF',
  muted: '#6B6B8A',
} as const;

const GAME_TYPE_LABELS: Record<string, string> = {
  trivia: 'Trivia',
  quick_math: 'Quick Math',
  spot_difference: 'Spot the Difference',
};

const GAME_TYPE_COLORS: Record<string, string> = {
  trivia: '#7C3AED',
  quick_math: '#3B82F6',
  spot_difference: '#10B981',
};

type CardState = 'loading' | 'playing' | 'submitting' | 'result';

// ─── Compact result bar (slides up from bottom, video plays behind it) ─────────

function ResultBar({
  result,
  streak,
  onNext,
  insetBottom,
}: {
  result: ClipResult;
  streak: number;
  onNext: () => void;
  insetBottom: number;
}) {
  const slideAnim = useRef(new Animated.Value(120)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 100,
      friction: 12,
    }).start();
  }, []);

  const multiplier = streak >= 15 ? '3×' : streak >= 10 ? '2×' : streak >= 5 ? '1.5×' : null;

  return (
    <Animated.View
      style={[
        styles.resultBar,
        { paddingBottom: insetBottom + 16, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.resultBarInner}>
        {/* Left: verdict + answer + meta */}
        <View style={styles.resultBarLeft}>
          <Text style={[styles.resultVerdict, { color: result.correct ? COLORS.green : COLORS.red }]}>
            {result.correct ? '✓ Correct!' : '✗ Wrong'}
          </Text>
          {!result.correct && result.correctAnswer && (
            <Text style={styles.resultCorrectAnswer}>Answer: {result.correctAnswer}</Text>
          )}
          <Text style={styles.resultMeta}>
            {result.score > 0 ? `+${result.score} pts  ·  ` : ''}
            {result.totalPlayers > 1
              ? `Beat ${result.percentile}% of ${result.totalPlayers.toLocaleString()}`
              : 'First to play!'}
            {`  ·  ${(result.responseTimeMs / 1000).toFixed(2)}s`}
          </Text>
        </View>

        {/* Right: streak + next button */}
        <View style={styles.resultBarRight}>
          {streak > 0 && (
            <View style={styles.streakPillSmall}>
              <Text style={styles.streakPillSmallText}>🔥 {streak}</Text>
              {multiplier && <Text style={styles.multiplierSmall}>{multiplier}</Text>}
            </View>
          )}
          <Pressable style={styles.nextBtnSmall} onPress={onNext}>
            <Text style={styles.nextBtnSmallText}>Next →</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PlayClipsScreen() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const videoRef = useRef<Video>(null);

  const [cardState, setCardState] = useState<CardState>('loading');
  const [videoReady, setVideoReady] = useState(false);
  const [gameActive, setGameActive] = useState(false);
  const [answerLocked, setAnswerLocked] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<GameAnswer | null>(null);
  const [streak, setStreak] = useState(0);

  // Keep latest handleNext in a ref so PanResponder always calls fresh version
  const handleNextRef = useRef<() => void>(() => {});

  const {
    nextClip,
    submitAnswer,
    sessionId,
    clipData,
    roundQuestion,
    result,
    isConnected,
    noMoreClips,
  } = usePlayClipsSocket(accessToken);

  // ── PiP geometry ────────────────────────────────────────────────────────────
  const TOP_ZONE = SCREEN_H * 0.20;
  const PIP_SIZE = Math.max(64, Math.min(Math.round(SCREEN_W * 0.22), Math.round(TOP_ZONE - insets.top - 16)));
  const PIP_TOP = insets.top + Math.round((TOP_ZONE - insets.top - PIP_SIZE) / 2);
  const PIP_LEFT = (SCREEN_W - PIP_SIZE) / 2;

  const pipAnim = useRef({
    width:        new Animated.Value(SCREEN_W),
    height:       new Animated.Value(SCREEN_H),
    borderRadius: new Animated.Value(0),
    top:          new Animated.Value(0),
    left:         new Animated.Value(0),
  }).current;

  const animatePip = useCallback((active: boolean) => {
    const { width, height, borderRadius, top, left } = pipAnim;
    const cfg = { duration: 320, useNativeDriver: false } as const;
    if (active) {
      Animated.parallel([
        Animated.timing(width,        { toValue: PIP_SIZE,     ...cfg }),
        Animated.timing(height,       { toValue: PIP_SIZE,     ...cfg }),
        Animated.timing(borderRadius, { toValue: PIP_SIZE / 2, ...cfg }),
        Animated.timing(top,          { toValue: PIP_TOP,      ...cfg }),
        Animated.timing(left,         { toValue: PIP_LEFT,     ...cfg }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(width,        { toValue: SCREEN_W, ...cfg }),
        Animated.timing(height,       { toValue: SCREEN_H, ...cfg }),
        Animated.timing(borderRadius, { toValue: 0,        ...cfg }),
        Animated.timing(top,          { toValue: 0,        ...cfg }),
        Animated.timing(left,         { toValue: 0,        ...cfg }),
      ]).start();
    }
  }, [pipAnim, PIP_SIZE, PIP_TOP, PIP_LEFT, SCREEN_W, SCREEN_H]);

  const resetPip = useCallback(() => {
    const { width, height, borderRadius, top, left } = pipAnim;
    width.setValue(SCREEN_W); height.setValue(SCREEN_H);
    borderRadius.setValue(0); top.setValue(0); left.setValue(0);
  }, [pipAnim, SCREEN_W, SCREEN_H]);

  // ── Swipe-up to skip ────────────────────────────────────────────────────────
  const gameActiveRef = useRef(false);
  const cardStateRef = useRef<CardState>('loading');
  useEffect(() => { gameActiveRef.current = gameActive; }, [gameActive]);
  useEffect(() => { cardStateRef.current = cardState; }, [cardState]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, gs) =>
        !gameActiveRef.current &&
        cardStateRef.current !== 'loading' &&
        gs.dy < -10 &&
        Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderRelease: (_e, gs) => {
        if (!gameActiveRef.current && gs.dy < -60) {
          handleNextRef.current();
        }
      },
    }),
  ).current;

  // ── Socket event effects ─────────────────────────────────────────────────────

  // Once connected, request first clip
  useEffect(() => {
    if (isConnected) nextClip();
  }, [isConnected]);

  // clip_ready → start playing
  useEffect(() => {
    if (!clipData) return;
    setCardState('playing');
    setVideoReady(false);
    setGameActive(false);
    setAnswerLocked(false);
    setSelectedAnswer(null);
    resetPip();
  }, [clipData?.clipId]);

  // round_question → shrink video to PiP, show game
  useEffect(() => {
    if (!roundQuestion) return;
    setGameActive(true);
    animatePip(true);
  }, [roundQuestion]);

  // clip_result → expand video back to fullscreen, show result bar
  useEffect(() => {
    if (!result) return;
    setCardState('result');
    setGameActive(false);
    animatePip(false);   // video grows back to fullscreen
    setStreak((s) => result.correct ? s + 1 : 0);
  }, [result]);

  // ── Playback handler ─────────────────────────────────────────────────────────

  const handleNext = useCallback(() => {
    setCardState('loading');
    setGameActive(false);
    setAnswerLocked(false);
    setSelectedAnswer(null);
    resetPip();
    nextClip();
  }, [resetPip, nextClip]);

  // Keep ref in sync so PanResponder always has the latest version
  useEffect(() => { handleNextRef.current = handleNext; }, [handleNext]);

  const handlePlaybackStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    if (!status.didJustFinish) return;

    if (cardStateRef.current === 'result') {
      // Video finished after game — auto-advance to next clip
      handleNextRef.current();
    } else if (cardStateRef.current === 'playing' && !gameActiveRef.current) {
      // Still waiting for round_question — loop the clip
      videoRef.current?.replayAsync().catch(() => {});
    }
  }, []);

  const handleSubmit = useCallback((answer: GameAnswer) => {
    if (answerLocked || !sessionId) return;
    setSelectedAnswer(answer);
    setAnswerLocked(true);
    setCardState('submitting');
    submitAnswer(sessionId, answer);
  }, [answerLocked, sessionId, submitAnswer]);

  // ── Derived ───────────────────────────────────────────────────────────────────

  const gameColor = GAME_TYPE_COLORS[clipData?.gameType ?? ''] ?? COLORS.accent;
  const clipDurSec = clipData ? Math.round(clipData.clipDurationMs / 1000) : 0;
  const isPip = gameActive && (cardState === 'playing' || cardState === 'submitting');
  const multiplier = streak >= 15 ? '3×' : streak >= 10 ? '2×' : streak >= 5 ? '1.5×' : null;

  // ── Screens ───────────────────────────────────────────────────────────────────

  if (noMoreClips) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyIcon}>✓</Text>
        <Text style={styles.emptyTitle}>All caught up!</Text>
        <Text style={styles.emptySubtitle}>You've played every clip. Check back after the next live show.</Text>
        <Pressable style={styles.retryBtn} onPress={() => router.back()}>
          <Text style={styles.retryText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (cardState === 'loading' || !clipData) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.loadingText}>Loading clip…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: SCREEN_W, height: SCREEN_H }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        {streak > 0 ? (
          <View style={styles.streakPill}>
            <Text style={styles.streakPillText}>🔥 {streak}</Text>
            {multiplier && <Text style={styles.multiplierInHeader}>{multiplier}</Text>}
          </View>
        ) : (
          <View style={styles.headerSpacer} />
        )}
        {/* Swipe hint — only during playing, before game starts */}
        {cardState === 'playing' && !gameActive && (
          <Text style={styles.swipeHint}>↑ swipe to skip</Text>
        )}
      </View>

      {/* Game panel — bottom 80%, shown only during active game */}
      {isPip && clipData.bundleUrl && roundQuestion && (
        <View
          style={[styles.gamePanelQuestion, { height: SCREEN_H * 0.8 }]}
          pointerEvents={answerLocked ? 'none' : 'auto'}
        >
          <GameRenderer
            roundIndex={0}
            totalRounds={1}
            gameType={clipData.gameType}
            payload={roundQuestion.gamePayload}
            timeLimitMs={roundQuestion.timeLimitMs}
            playersRemaining={0}
            onSubmit={handleSubmit}
            selectedAnswer={selectedAnswer}
            isLocked={answerLocked}
            bundleUrl={clipData.bundleUrl}
          />
        </View>
      )}

      {/* Video — animated between fullscreen and PiP circle, swipe-up to skip */}
      <Animated.View
        style={[
          styles.videoContainer,
          {
            width:        pipAnim.width,
            height:       pipAnim.height,
            borderRadius: pipAnim.borderRadius,
            top:          pipAnim.top,
            left:         pipAnim.left,
          },
        ]}
        {...(!isPip ? panResponder.panHandlers : {})}
      >
        <Video
          ref={videoRef}
          source={{ uri: clipData.mediaUrl }}
          style={styles.videoFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          onReadyForDisplay={() => setVideoReady(true)}
          onPlaybackStatusUpdate={handlePlaybackStatus}
        />
        {isPip && (
          <Animated.View
            pointerEvents="none"
            style={[styles.pipRing, { borderRadius: pipAnim.borderRadius }]}
          />
        )}
      </Animated.View>

      {/* Loading spinner while video buffers */}
      {!videoReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      )}

      {/* Top metadata — only while watching (not during game, not during result) */}
      {!gameActive && cardState === 'playing' && (
        <View style={[styles.topMeta, { paddingTop: insets.top + 60 }]}>
          <View style={[styles.gameBadge, { backgroundColor: gameColor + '30', borderColor: gameColor + '70' }]}>
            <Text style={[styles.gameBadgeText, { color: gameColor }]}>
              {GAME_TYPE_LABELS[clipData.gameType] ?? clipData.gameType}
            </Text>
          </View>
          <Text style={styles.clipDurText}>{clipDurSec}s · {clipData.playCount.toLocaleString()} plays</Text>
        </View>
      )}

      {/* Compact result bar — slides up while video plays fullscreen */}
      {cardState === 'result' && result && (
        <ResultBar
          result={result}
          streak={streak}
          onNext={handleNext}
          insetBottom={insets.bottom}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', position: 'relative' },
  center: {
    flex: 1, backgroundColor: COLORS.bg,
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },

  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    paddingHorizontal: 20, paddingBottom: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backButton: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: { fontSize: 18, color: COLORS.white, lineHeight: 20 },
  headerSpacer: { width: 34 },
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
  },
  streakPillText: { fontSize: 13, fontWeight: '700', color: COLORS.gold },
  multiplierInHeader: { fontSize: 11, fontWeight: '800', color: COLORS.gold },
  swipeHint: {
    fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: '500',
  },

  videoContainer: {
    position: 'absolute',
    backgroundColor: '#000',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 12,
    zIndex: 10,
  },
  videoFill: { width: '100%', height: '100%' },
  pipRing: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },

  gamePanelQuestion: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    overflow: 'hidden',
    zIndex: 5,
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 15,
  },
  topMeta: {
    position: 'absolute', left: 20, right: 20, gap: 6,
    zIndex: 15,
  },
  gameBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  gameBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  clipDurText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },

  // ── Compact result bar ──────────────────────────────────────────────────────
  resultBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    zIndex: 20,
    backgroundColor: 'rgba(10,10,15,0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  resultBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  resultBarLeft: { flex: 1, gap: 3 },
  resultVerdict: { fontSize: 20, fontWeight: '900', letterSpacing: 0.3 },
  resultCorrectAnswer: { fontSize: 13, color: COLORS.muted },
  resultMeta: { fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: '500' },

  resultBarRight: { alignItems: 'flex-end', gap: 8 },
  streakPillSmall: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
  },
  streakPillSmallText: { fontSize: 12, fontWeight: '700', color: COLORS.gold },
  multiplierSmall: { fontSize: 10, fontWeight: '800', color: COLORS.gold },
  nextBtnSmall: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  nextBtnSmallText: { fontSize: 14, fontWeight: '800', color: COLORS.white },

  loadingText: { color: COLORS.muted, fontSize: 14 },
  emptyIcon: { fontSize: 40, color: COLORS.green },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.white },
  emptySubtitle: { fontSize: 14, color: COLORS.muted, textAlign: 'center', paddingHorizontal: 40 },
  retryBtn: {
    marginTop: 8, paddingHorizontal: 24, paddingVertical: 10,
    borderRadius: 10, backgroundColor: COLORS.accent + '20',
    borderWidth: 1, borderColor: COLORS.accent + '50',
  },
  retryText: { color: COLORS.accent, fontWeight: '700', fontSize: 14 },
});
