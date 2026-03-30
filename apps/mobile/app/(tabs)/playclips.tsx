import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
  Pressable,
  ActivityIndicator,
  ViewToken,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth.store';
import {
  getPlayClips,
  startClipSession,
  submitClipAnswer,
  type PlayClipSummary,
  type ClipResult,
} from '@/api/playclips.api';
import { getGamePackages } from '@/api/games.api';
import { GameRenderer } from '@/games/GameRenderer';
import type { GameAnswer } from '@euphoria/types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

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

const GAME_TYPE_LABELS: Record<string, string> = {
  trivia: 'Trivia',
  quick_math: 'Quick Math',
  number_dash: 'Number Dash',
};

const GAME_TYPE_COLORS: Record<string, string> = {
  trivia: '#7C3AED',
  quick_math: '#3B82F6',
  number_dash: '#F59E0B',
};

type CardState = 'playing' | 'submitting' | 'result';

// ─── Result overlay ───────────────────────────────────────────────────────────

function ResultOverlay({
  result,
  streak,
  onNext,
}: {
  result: ClipResult;
  streak: number;
  onNext: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  const percentileText =
    result.totalPlayers <= 1
      ? 'First to play!'
      : `Beat ${result.percentile}% of ${result.totalPlayers.toLocaleString()} players`;

  return (
    <View style={styles.resultContainer}>
      <View style={styles.overlayBackdrop} />
      <Animated.View style={[styles.resultPanel, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
        {/* Correct / wrong */}
        <Text style={[styles.resultVerdict, { color: result.correct ? COLORS.green : COLORS.red }]}>
          {result.correct ? '✓ Correct!' : '✗ Wrong'}
        </Text>

        {/* Correct answer if wrong */}
        {!result.correct && result.correctAnswer && (
          <Text style={styles.correctAnswerText}>Answer: {result.correctAnswer}</Text>
        )}

        {/* Score */}
        <View style={styles.resultScoreRow}>
          <Text style={styles.resultScoreValue}>{result.score}</Text>
          <Text style={styles.resultScoreLabel}>pts</Text>
        </View>

        {/* Percentile */}
        <View style={[styles.percentilePill, { backgroundColor: result.correct ? COLORS.green + '20' : COLORS.surface }]}>
          <Text style={[styles.percentileText, { color: result.correct ? COLORS.green : COLORS.muted }]}>
            {percentileText}
          </Text>
        </View>

        {/* Response time */}
        <Text style={styles.responseTimeText}>
          {(result.responseTimeMs / 1000).toFixed(2)}s response
        </Text>

        {/* Streak */}
        {streak > 0 && (
          <View style={styles.streakRow}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <Text style={styles.streakText}>{streak} streak</Text>
            {streak >= 5 && (
              <View style={styles.multiplierBadge}>
                <Text style={styles.multiplierText}>
                  {streak >= 15 ? '3×' : streak >= 10 ? '2×' : '1.5×'}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Next button */}
        <Pressable style={styles.nextBtn} onPress={onNext}>
          <Text style={styles.nextBtnText}>Next Clip ↑</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// Extract game-specific payload from clip config.
// clip.config stores: { trivia: {...}, timeLimitMs } or { quickMath: {...}, timeLimitMs } etc.
// Each game HTML's init() expects the fields flat at the top level.
function extractGamePayload(gameType: string, config: Record<string, unknown>): Record<string, unknown> {
  const timeLimitMs = config['timeLimitMs'];
  const keyMap: Record<string, string> = {
    trivia: 'trivia',
    quick_math: 'quickMath',
    number_dash: 'numberDash',
  };
  const key = keyMap[gameType];
  const inner = key ? (config[key] as Record<string, unknown> | undefined) : undefined;
  return { ...(inner ?? config), timeLimitMs };
}

// ─── Single clip card ─────────────────────────────────────────────────────────

function ClipCard({
  clip,
  isVisible,
  streak,
  bundleUrlMap,
  onResult,
}: {
  clip: PlayClipSummary;
  isVisible: boolean;
  streak: number;
  bundleUrlMap: Map<string, string>;
  onResult: (correct: boolean) => void;
}) {
  const { accessToken } = useAuthStore();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const videoRef = useRef<Video>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [cardState, setCardState] = useState<CardState>('playing');
  const [gameActive, setGameActive] = useState(false);
  const [answerLocked, setAnswerLocked] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<GameAnswer | null>(null);
  const [result, setResult] = useState<ClipResult | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const gameTriggeredRef = useRef(false);
  const timeLimitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Same PiP geometry as live show — circle centered in top 20% zone
  const TOP_ZONE = SCREEN_H * 0.20;
  const PIP_SIZE = Math.max(64, Math.min(Math.round(SCREEN_W * 0.22), Math.round(TOP_ZONE - insets.top - 16)));
  const PIP_TOP = insets.top + Math.round((TOP_ZONE - insets.top - PIP_SIZE) / 2);
  const PIP_LEFT = (SCREEN_W - PIP_SIZE) / 2;

  // Animated values — same structure as live show
  const pipAnim = useRef({
    width:        new Animated.Value(SCREEN_W),
    height:       new Animated.Value(SCREEN_H),
    borderRadius: new Animated.Value(0),
    top:          new Animated.Value(0),
    left:         new Animated.Value(0),
  }).current;

  const bundleUrl = bundleUrlMap.get(clip.gameType) ?? null;
  const timeLimitMs: number =
    (clip.config['timeLimitMs'] as number | undefined) ??
    (clip.clipEndMs - clip.clipStartMs || 20000);
  const gamePayload = extractGamePayload(clip.gameType, clip.config);

  // Animate video between fullscreen and PiP circle — mirrors live show exactly
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

  const triggerGame = useCallback(() => {
    if (gameTriggeredRef.current) return;
    gameTriggeredRef.current = true;
    setGameActive(true);
    animatePip(true);
    timeLimitTimerRef.current = setTimeout(() => {
      setAnswerLocked(true);
    }, timeLimitMs);
  }, [animatePip, timeLimitMs]);

  // Reset on visibility change
  useEffect(() => {
    if (!isVisible || !accessToken) return;
    setCardState('playing');
    setGameActive(false);
    setAnswerLocked(false);
    setSelectedAnswer(null);
    setResult(null);
    gameTriggeredRef.current = false;
    const { width, height, borderRadius, top, left } = pipAnim;
    width.setValue(SCREEN_W); height.setValue(SCREEN_H);
    borderRadius.setValue(0); top.setValue(0); left.setValue(0);
    if (timeLimitTimerRef.current) clearTimeout(timeLimitTimerRef.current);
    startClipSession(clip.id, accessToken)
      .then((s) => { sessionIdRef.current = s.id; })
      .catch(() => {});
  }, [isVisible, clip.id, accessToken]);

  useEffect(() => () => {
    if (timeLimitTimerRef.current) clearTimeout(timeLimitTimerRef.current);
  }, []);

  // Video playback control
  useEffect(() => {
    if (!videoRef.current) return;
    if (isVisible) {
      videoRef.current.playAsync().catch(() => {});
    } else {
      videoRef.current.pauseAsync().catch(() => {});
      videoRef.current.setPositionAsync(0).catch(() => {});
    }
  }, [isVisible]);

  const handlePlaybackStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    if (status.didJustFinish && !gameActive && cardState === 'playing') {
      videoRef.current?.replayAsync().catch(() => {});
    }
    if (!gameTriggeredRef.current && cardState === 'playing') {
      if (clip.gameOffsetMs === 0 && status.isPlaying) {
        triggerGame();
      } else if (clip.gameOffsetMs > 0 && status.positionMillis >= clip.gameOffsetMs) {
        triggerGame();
      }
    }
  }, [cardState, gameActive, clip.gameOffsetMs, triggerGame]);

  const handleSubmit = useCallback(async (answer: GameAnswer) => {
    if (answerLocked || !sessionIdRef.current || !accessToken) return;
    if (timeLimitTimerRef.current) clearTimeout(timeLimitTimerRef.current);
    setSelectedAnswer(answer);
    setAnswerLocked(true);
    setCardState('submitting');
    try {
      const res = await submitClipAnswer(sessionIdRef.current, answer, accessToken);
      setResult(res);
      setCardState('result');
      setGameActive(false);
      animatePip(false);
      onResult(res.correct);
    } catch {
      setCardState('playing');
      setAnswerLocked(false);
    }
  }, [answerLocked, accessToken, animatePip, onResult]);

  const handleNext = useCallback(() => {
    setCardState('playing');
    setGameActive(false);
    setAnswerLocked(false);
    setSelectedAnswer(null);
    setResult(null);
    gameTriggeredRef.current = false;
    const { width, height, borderRadius, top, left } = pipAnim;
    width.setValue(SCREEN_W); height.setValue(SCREEN_H);
    borderRadius.setValue(0); top.setValue(0); left.setValue(0);
  }, [pipAnim, SCREEN_W, SCREEN_H]);

  const gameColor = GAME_TYPE_COLORS[clip.gameType] ?? COLORS.accent;
  const clipDurSec = Math.round((clip.clipEndMs - clip.clipStartMs) / 1000);
  const isPip = gameActive && (cardState === 'playing' || cardState === 'submitting');

  return (
    <View style={[styles.card, { height: SCREEN_H }]}>

      {/* Game panel — bottom 80%, same as live show */}
      {isPip && bundleUrl && (
        <View style={[styles.gamePanelQuestion, { height: SCREEN_H * 0.8 }]} pointerEvents={answerLocked ? 'none' : 'auto'}>
          <GameRenderer
            roundIndex={0}
            totalRounds={1}
            gameType={clip.gameType}
            payload={gamePayload}
            timeLimitMs={timeLimitMs}
            playersRemaining={0}
            onSubmit={handleSubmit}
            selectedAnswer={selectedAnswer}
            isLocked={answerLocked}
            bundleUrl={bundleUrl}
          />
        </View>
      )}

      {/* Video — animated between fullscreen and PiP circle (top center) */}
      <Animated.View style={[
        styles.videoContainer,
        !isVisible && !gameActive && styles.hidden,
        {
          width:        pipAnim.width,
          height:       pipAnim.height,
          borderRadius: pipAnim.borderRadius,
          top:          pipAnim.top,
          left:         pipAnim.left,
        },
      ]}>
        <Video
          ref={videoRef}
          source={{ uri: clip.mediaUrl }}
          style={styles.videoFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isVisible}
          onReadyForDisplay={() => setVideoReady(true)}
          onPlaybackStatusUpdate={handlePlaybackStatus}
        />
        {/* White ring when in PiP — same as live show */}
        {isPip && (
          <Animated.View
            pointerEvents="none"
            style={[styles.pipRing, { borderRadius: pipAnim.borderRadius }]}
          />
        )}
      </Animated.View>

      {/* Loading */}
      {!videoReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      )}

      {/* Top metadata — only while watching */}
      {!gameActive && cardState === 'playing' && (
        <View style={[styles.topMeta, { paddingTop: insets.top + 60 }]}>
          <View style={[styles.gameBadge, { backgroundColor: gameColor + '30', borderColor: gameColor + '70' }]}>
            <Text style={[styles.gameBadgeText, { color: gameColor }]}>
              {GAME_TYPE_LABELS[clip.gameType] ?? clip.gameType}
            </Text>
          </View>
          <Text style={styles.clipDurText}>{clipDurSec}s · {clip.playCount.toLocaleString()} plays</Text>
        </View>
      )}

      {/* Result overlay */}
      {cardState === 'result' && result && (
        <ResultOverlay result={result} streak={streak} onNext={handleNext} />
      )}

      {/* Swipe hint */}
      {cardState === 'result' && (
        <View style={[styles.swipeHint, { bottom: insets.bottom + 80 }]} pointerEvents="none">
          <Text style={styles.swipeHintText}>↑ swipe for next</Text>
        </View>
      )}
    </View>
  );
}

// ─── Main feed screen ─────────────────────────────────────────────────────────

export default function PlayClipsScreen() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const insets = useSafeAreaInsets();

  const [clips, setClips] = useState<PlayClipSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [visibleId, setVisibleId] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [bundleUrlMap, setBundleUrlMap] = useState<Map<string, string>>(new Map());

  const PAGE_SIZE = 8;

  const fetchClips = useCallback(async (pageNum: number, append = false) => {
    try {
      const data = await getPlayClips(pageNum, PAGE_SIZE, accessToken);
      if (data.length < PAGE_SIZE) setHasMore(false);
      setClips((prev) => (append ? [...prev, ...data] : data));
      if (!append && data.length > 0) setVisibleId(data[0].id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clips');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchClips(0);
    getGamePackages()
      .then((pkgs) => {
        const map = new Map<string, string>();
        pkgs.forEach((p) => { if (p.isEnabled) map.set(p.id, p.bundleUrl); });
        setBundleUrlMap(map);
      })
      .catch(() => {});
  }, [fetchClips]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) setVisibleId((viewableItems[0].item as PlayClipSummary).id);
  }, []);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const onEndReached = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const next = page + 1;
    setPage(next);
    fetchClips(next, true);
  }, [loadingMore, hasMore, page, fetchClips]);

  const handleResult = useCallback((correct: boolean) => {
    setStreak((s) => correct ? s + 1 : 0);
  }, []);

  const multiplier = streak >= 15 ? '3×' : streak >= 10 ? '2×' : streak >= 5 ? '1.5×' : null;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.loadingText}>Loading clips…</Text>
      </View>
    );
  }

  if (error || clips.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyIcon}>▶</Text>
        <Text style={styles.emptyTitle}>{error ? 'Something went wrong' : 'No clips yet'}</Text>
        <Text style={styles.emptySubtitle}>
          {error ?? 'Clips from completed live shows will appear here'}
        </Text>
        {error && (
          <Pressable style={styles.retryBtn} onPress={() => { setLoading(true); fetchClips(0); }}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
      </View>

      <FlatList
        data={clips}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ClipCard
            clip={item}
            isVisible={visibleId === item.id}
            streak={streak}
            bundleUrlMap={bundleUrlMap}
            onResult={handleResult}
          />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_H}
        snapToAlignment="start"
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        getItemLayout={(_, index) => ({ length: SCREEN_H, offset: SCREEN_H * index, index })}
        ListFooterComponent={
          loadingMore ? (
            <View style={[styles.center, { height: SCREEN_H }]}>
              <ActivityIndicator color={COLORS.accent} />
            </View>
          ) : !hasMore ? (
            <View style={[styles.center, { height: SCREEN_H }]}>
              <Text style={styles.endText}>You've seen all clips</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: {
    flex: 1, backgroundColor: COLORS.bg,
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    paddingHorizontal: 20, paddingBottom: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backButton: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: {
    fontSize: 18, color: COLORS.white, lineHeight: 20,
  },
  headerSpacer: { width: 34 },
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
  },
  streakPillText: { fontSize: 13, fontWeight: '700', color: COLORS.gold },
  multiplierInHeader: { fontSize: 11, fontWeight: '800', color: COLORS.gold },

  // Card
  card: { backgroundColor: '#000', position: 'relative' },
  hidden: { opacity: 0, position: 'absolute', width: 1, height: 1 },

  // Video container — animated between fullscreen and PiP circle (mirrors live show)
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

  // Game panel — bottom 80%, same as live show (height overridden inline with px value)
  gamePanelQuestion: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    overflow: 'hidden',
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  topMeta: {
    position: 'absolute', left: 20, right: 20, gap: 6,
  },
  gameBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  gameBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  clipDurText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },

  // Result overlay
  overlayBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  resultContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  resultPanel: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 1, borderColor: COLORS.border,
    padding: 24, paddingBottom: 36,
    alignItems: 'center', gap: 12,
  },
  resultVerdict: { fontSize: 28, fontWeight: '900', letterSpacing: 0.5 },
  correctAnswerText: { fontSize: 14, color: COLORS.muted, textAlign: 'center' },
  resultScoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  resultScoreValue: { fontSize: 48, fontWeight: '900', color: COLORS.white },
  resultScoreLabel: { fontSize: 18, color: COLORS.muted, fontWeight: '600' },
  percentilePill: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: 'transparent',
  },
  percentileText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  responseTimeText: { fontSize: 12, color: COLORS.muted },
  streakRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
  },
  streakEmoji: { fontSize: 16 },
  streakText: { fontSize: 14, fontWeight: '700', color: COLORS.gold },
  multiplierBadge: {
    backgroundColor: COLORS.gold, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  multiplierText: { fontSize: 11, fontWeight: '900', color: COLORS.bg },
  nextBtn: {
    marginTop: 4, width: '100%',
    backgroundColor: COLORS.accent, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  nextBtnText: { fontSize: 16, fontWeight: '800', color: COLORS.white, letterSpacing: 0.5 },

  // Swipe hint
  swipeHint: { position: 'absolute', alignSelf: 'center' },
  swipeHintText: {
    fontSize: 11, color: 'rgba(255,255,255,0.35)',
    fontWeight: '600', letterSpacing: 1,
  },

  // Feed footer
  loadingText: { color: COLORS.muted, fontSize: 14 },
  emptyIcon: { fontSize: 40, color: COLORS.muted },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.white },
  emptySubtitle: { fontSize: 14, color: COLORS.muted, textAlign: 'center', paddingHorizontal: 40 },
  retryBtn: {
    marginTop: 8, paddingHorizontal: 24, paddingVertical: 10,
    borderRadius: 10, backgroundColor: COLORS.accent + '20',
    borderWidth: 1, borderColor: COLORS.accent + '50',
  },
  retryText: { color: COLORS.accent, fontWeight: '700', fontSize: 14 },
  endText: { color: COLORS.muted, fontSize: 13 },
});
