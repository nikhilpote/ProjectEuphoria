import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth.store';
import { useShowSocket } from '@/hooks/useShowSocket';
import type { GameAnswer } from '@euphoria/types';
import { GameRenderer } from '@/games/GameRenderer';

const COLORS = {
  bg: '#0A0A0F',
  surface: '#13131A',
  surfaceHigh: '#1C1C28',
  border: '#2A2A3D',
  accent: '#7C3AED',
  accentGlow: '#A855F7',
  accentDim: '#3D1A7A',
  green: '#10B981',
  greenDim: '#064E3B',
  red: '#EF4444',
  redDim: '#450A0A',
  gold: '#F59E0B',
  white: '#FFFFFF',
  offWhite: '#E8E8F0',
  muted: '#6B6B8A',
} as const;

// ---------------------------------------------------------------------------
// Connecting screen
// ---------------------------------------------------------------------------
function ConnectingScreen({ error }: { error: string | null }) {
  return (
    <View style={styles.centerContainer}>
      {error ? (
        <>
          <Text style={styles.errorIcon}>!</Text>
          <Text style={styles.phaseTitle}>Connection Error</Text>
          <Text style={styles.phaseSubtitle}>{error}</Text>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={[styles.phaseSubtitle, { marginTop: 20 }]}>Joining show...</Text>
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Lobby screen
// ---------------------------------------------------------------------------
function LobbyScreen({
  playersConnected,
  scheduledAt,
  lobbyDurationMs,
  isPreBuffering,
}: {
  playersConnected: number;
  scheduledAt: string | null;
  lobbyDurationMs: number;
  isPreBuffering: boolean;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const startAt = scheduledAt
    ? new Date(scheduledAt).getTime() + lobbyDurationMs
    : null;
  const msLeft = startAt ? Math.max(0, startAt - now) : null;

  const formatCountdown = (ms: number) => {
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  };

  return (
    <View style={styles.centerContainer}>
      <View style={styles.lobbyBadge}>
        <Animated.View style={[styles.pulseDot, { opacity: pulseAnim }]} />
        <Text style={styles.lobbyLiveText}>LIVE LOBBY</Text>
      </View>
      <Text style={styles.playerCount}>{playersConnected}</Text>
      <Text style={styles.playerCountLabel}>players connected</Text>

      {msLeft !== null && msLeft > 0 ? (
        <View style={styles.lobbyCountdownBox}>
          <Text style={styles.lobbyCountdownLabel}>Show starts in</Text>
          <Text style={styles.lobbyCountdownValue}>{formatCountdown(msLeft)}</Text>
        </View>
      ) : (
        <Text style={[styles.phaseSubtitle, { marginTop: 32 }]}>Starting soon...</Text>
      )}

      {isPreBuffering && (
        <View style={styles.bufferingRow}>
          <ActivityIndicator size="small" color={COLORS.accent} />
          <Text style={styles.bufferingText}>Loading video...</Text>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Countdown screen
// ---------------------------------------------------------------------------
function CountdownScreen({ secondsRemaining }: { secondsRemaining: number }) {
  const scaleAnim  = useRef(new Animated.Value(1)).current;
  const ringAnim   = useRef(new Animated.Value(0)).current;
  const glowAnim   = useRef(new Animated.Value(0)).current;
  const [localSeconds, setLocalSeconds] = useState(secondsRemaining);
  const isNear = localSeconds <= 10 && localSeconds > 0;

  // Sync from server
  useEffect(() => {
    setLocalSeconds(secondsRemaining);
    scaleAnim.setValue(1.4);
    Animated.spring(scaleAnim, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }).start();
  }, [secondsRemaining, scaleAnim]);

  // Local tick
  useEffect(() => {
    if (localSeconds <= 0) return;
    const t = setInterval(() => setLocalSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [localSeconds]);

  // Per-tick pulse when ≤ 10s
  useEffect(() => {
    if (localSeconds > 10 || localSeconds <= 0) return;
    // Number bounce
    scaleAnim.setValue(1.25);
    Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
    // Expanding ring
    ringAnim.setValue(0);
    Animated.timing(ringAnim, { toValue: 1, duration: 900, useNativeDriver: true }).start();
  }, [localSeconds, scaleAnim, ringAnim]);

  // Fade glow in once we enter final 10s
  useEffect(() => {
    Animated.timing(glowAnim, {
      toValue: isNear ? 1 : 0,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [isNear, glowAnim]);

  const ringScale   = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.2] });
  const ringOpacity = ringAnim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.7, 0.3, 0] });

  return (
    <View style={styles.centerContainer}>
      {/* Ambient glow */}
      <Animated.View style={[styles.countdownGlow, { opacity: Animated.multiply(glowAnim, 0.18) }]} />

      {/* Expanding ring on each tick */}
      {isNear && (
        <Animated.View
          style={[
            styles.countdownRing,
            { opacity: ringOpacity, transform: [{ scale: ringScale }] },
          ]}
        />
      )}

      <Text style={[styles.countdownLabel, isNear && { color: COLORS.accent, letterSpacing: 3 }]}>
        {isNear ? 'GET READY' : 'Show starts in'}
      </Text>

      <Animated.Text
        style={[
          styles.countdownNumber,
          { transform: [{ scale: scaleAnim }] },
          isNear && { color: COLORS.accent },
        ]}
      >
        {localSeconds}
      </Animated.Text>

      <Text style={[styles.countdownSuffix, isNear && { color: COLORS.accent }]}>
        {localSeconds === 1 ? 'second' : 'seconds'}
      </Text>

      {isNear && (
        <Animated.Text style={[styles.countdownStarting, { opacity: glowAnim }]}>
          Show is about to start!
        </Animated.Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Round HUD — transparent overlay on top of video
// ---------------------------------------------------------------------------
function RoundHUD({
  roundIndex,
  totalRounds,
  gameType,
  playersRemaining,
  isBuffering,
}: {
  roundIndex: number;
  totalRounds: number;
  gameType: string;
  playersRemaining: number;
  isBuffering: boolean;
}) {
  return (
    <View style={styles.videoHud}>
      <Text style={styles.roundLabel}>
        ROUND {roundIndex + 1} / {totalRounds}
      </Text>
      <Text style={styles.roundGameType}>{gameType.replace('_', ' ').toUpperCase()}</Text>
      <View style={styles.hudRight}>
        {isBuffering && <ActivityIndicator size="small" color={COLORS.muted} style={{ marginRight: 8 }} />}
        <Text style={styles.hudPlayers}>{playersRemaining} players</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Round Result screen
// ---------------------------------------------------------------------------
function RoundResultScreen({
  playerCorrect,
  correctAnswer,
  playersEliminated,
  playersRemaining,
}: {
  playerCorrect: boolean;
  correctAnswer: unknown;
  playersEliminated: number;
  playersRemaining: number;
}) {
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 100,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const correctAnswerStr =
    typeof correctAnswer === 'string' ? correctAnswer : JSON.stringify(correctAnswer);

  return (
    <View style={[styles.centerContainer, { backgroundColor: 'rgba(10,10,15,0.95)' }]}>
      <Animated.View
        style={[
          styles.resultIcon,
          playerCorrect ? styles.resultIconCorrect : styles.resultIconWrong,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Text style={styles.resultIconText}>{playerCorrect ? '✓' : '✗'}</Text>
      </Animated.View>

      <Text style={[styles.phaseTitle, { marginTop: 24 }]}>
        {playerCorrect ? 'Correct!' : 'Wrong Answer'}
      </Text>

      {correctAnswerStr && (
        <View style={styles.correctAnswerCard}>
          <Text style={styles.correctAnswerLabel}>Correct answer</Text>
          <Text style={styles.correctAnswerValue}>{correctAnswerStr}</Text>
        </View>
      )}

      <View style={styles.resultStats}>
        <View style={styles.resultStat}>
          <Text style={[styles.resultStatNumber, { color: COLORS.red }]}>{playersEliminated}</Text>
          <Text style={styles.resultStatLabel}>eliminated</Text>
        </View>
        <View style={styles.resultStatDivider} />
        <View style={styles.resultStat}>
          <Text style={[styles.resultStatNumber, { color: COLORS.green }]}>{playersRemaining}</Text>
          <Text style={styles.resultStatLabel}>remaining</Text>
        </View>
      </View>

      <Text style={styles.advanceHint}>Next round starting soon...</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Eliminated screen
// ---------------------------------------------------------------------------
function EliminatedScreen({
  coinsEarned,
  onWatchRest,
}: {
  coinsEarned: number;
  onWatchRest: () => void;
}) {
  return (
    <View style={[styles.centerContainer, { backgroundColor: 'rgba(10,10,15,0.97)' }]}>
      <Text style={styles.eliminatedIcon}>☠</Text>
      <Text style={styles.phaseTitle}>You've been eliminated</Text>
      <Text style={styles.phaseSubtitle}>Better luck next time!</Text>
      <View style={styles.coinsEarnedCard}>
        <Text style={styles.coinsEarnedIcon}>◈</Text>
        <Text style={styles.coinsEarnedAmount}>{coinsEarned.toLocaleString()}</Text>
        <Text style={styles.coinsEarnedLabel}>coins earned</Text>
      </View>
      <Pressable style={styles.watchButton} onPress={onWatchRest} accessibilityRole="button">
        <Text style={styles.watchButtonText}>Watch the Rest</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Finished screen
// ---------------------------------------------------------------------------
function FinishedScreen({
  winners,
  totalPlayers,
  playerResult,
  onExit,
  topPadding = 40,
}: {
  winners: Array<{ user: { displayName: string; id: string }; coinsEarned: number }>;
  totalPlayers: number;
  playerResult: { status: string; roundReached: number; coinsEarned: number };
  onExit: () => void;
  topPadding?: number;
}) {
  const podiumOrder = [1, 0, 2];
  const podiumHeights = [80, 120, 60];

  return (
    <ScrollView
      contentContainerStyle={[styles.finishedContainer, { paddingTop: topPadding }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.finishedTitle}>Show Over!</Text>
      <Text style={styles.phaseSubtitle}>{totalPlayers} players competed</Text>

      <View style={styles.podium}>
        {podiumOrder.map((idx, position) => {
          const winner = winners[idx];
          if (!winner) return null;
          const height = podiumHeights[position] ?? 60;
          const rank = idx + 1;
          return (
            <View key={winner.user.id} style={styles.podiumColumn}>
              <Text style={styles.podiumName} numberOfLines={1}>{winner.user.displayName}</Text>
              <Text style={styles.podiumCoins}>◈ {winner.coinsEarned.toLocaleString()}</Text>
              <View style={[styles.podiumBlock, { height }, rank === 1 && styles.podiumBlockFirst]}>
                <Text style={styles.podiumRank}>#{rank}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.playerResultCard}>
        <Text style={styles.playerResultStatus}>
          {playerResult.status === 'winner' ? 'You won!' : 'You were eliminated'}
        </Text>
        <Text style={styles.playerResultDetail}>
          Reached round {playerResult.roundReached} · Earned ◈ {playerResult.coinsEarned.toLocaleString()}
        </Text>
      </View>

      <Pressable style={styles.exitButton} onPress={onExit} accessibilityRole="button">
        <Text style={styles.exitButtonText}>Back to Home</Text>
      </Pressable>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Main Show Screen
// ---------------------------------------------------------------------------
export default function ShowScreen() {
  const { showId } = useLocalSearchParams<{ showId: string }>();
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // PIP circle — fits within the top 20% zone, centered horizontally
  const TOP_ZONE = SCREEN_H * 0.20;
  const PIP_SIZE = Math.max(64, Math.min(Math.round(SCREEN_W * 0.22), Math.round(TOP_ZONE - insets.top - 16)));
  const PIP_TOP = insets.top + Math.round((TOP_ZONE - insets.top - PIP_SIZE) / 2); // vertically centered in top zone
  const PIP_LEFT = (SCREEN_W - PIP_SIZE) / 2; // horizontally centered

  // Animated values for the video container
  const pipAnim = useRef({
    width:        new Animated.Value(SCREEN_W),
    height:       new Animated.Value(SCREEN_H),
    borderRadius: new Animated.Value(0),
    top:          new Animated.Value(0),
    left:         new Animated.Value(0),
  }).current;

  const {
    phase,
    showState,
    showStarted,
    countdown,
    currentRound,
    questionOverlay,
    roundResult,
    eliminated,
    showEnded,
    showContent,
    submitAnswer,
    error,
    pendingQuestion,
    pendingQuestionRef,
    triggerPendingQuestion,
  } = useShowSocket(showId ?? '', accessToken);

  const videoRef = useRef<Video>(null);
  const [videoShouldPlay, setVideoShouldPlay] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isPreBuffering, setIsPreBuffering] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<GameAnswer | null>(null);
  const [answerLocked, setAnswerLocked] = useState(false);
  const [isObserver, setIsObserver] = useState(false);
  // Track playerCorrect locally since server broadcasts false by default
  const [playerCorrect, setPlayerCorrect] = useState(false);
  // Auto-dismiss round result after 3s and return to video
  const [resultDismissed, setResultDismissed] = useState(false);

  // Pre-buffer single show video during lobby
  useEffect(() => {
    const videoUrl = showState?.videoUrl;
    if (!videoUrl || !videoRef.current) return;
    if (phase !== 'lobby' && phase !== 'connecting') return;

    setIsPreBuffering(true);
    videoRef.current
      .loadAsync({ uri: videoUrl }, { shouldPlay: false }, false)
      .then(() => setIsPreBuffering(false))
      .catch(() => setIsPreBuffering(false));
  }, [showState?.videoUrl, phase]);

  // When show_started fires: start playing the single show video
  useEffect(() => {
    if (!showStarted || !videoRef.current) return;
    const { videoUrl, startedAt } = showStarted;
    if (!videoUrl) return;

    // Compensate for socket delivery latency
    const seekMs = Math.max(0, Date.now() - startedAt);

    videoRef.current
      .loadAsync({ uri: videoUrl }, { positionMillis: seekMs, shouldPlay: false }, false)
      .then(() => {
        setVideoShouldPlay(true);
        return videoRef.current?.playAsync();
      })
      .catch((err: Error) => console.warn('Video start error:', err.message));
  }, [showStarted]);

  // Clear answer state on each new round marker
  useEffect(() => {
    if (phase === 'round_active') {
      setSelectedAnswer(null);
      setAnswerLocked(false);
      setPlayerCorrect(false);
    }
  }, [currentRound?.roundIndex]);

  // Pause video only when eliminated — show_ended arrives before the video ends
  // (server fires 5s after last marker, not at actual video end), so let the
  // video play through naturally. The FinishedScreen overlays it.
  useEffect(() => {
    if (phase === 'eliminated') {
      setVideoShouldPlay(false);
      videoRef.current?.pauseAsync().catch(() => {});
    }
  }, [phase]);

  // Resume video when observer mode is activated
  useEffect(() => {
    if (isObserver && videoRef.current) {
      videoRef.current.playAsync().catch(() => {});
      setVideoShouldPlay(true);
    }
  }, [isObserver]);

  const handlePlaybackStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setIsBuffering(status.isBuffering);

    if (status.didJustFinish) {
      setVideoEnded(true);
    }

    // Use the ref (not state) so this callback is never recreated and never
    // misses the window between setPendingQuestion and the next re-render.
    if (
      pendingQuestionRef.current !== null &&
      status.positionMillis >= pendingQuestionRef.current.spawnAtVideoSeconds * 1000
    ) {
      triggerPendingQuestion();
    }
  }, [triggerPendingQuestion]); // stable — reads ref, not state

  const handleSubmit = useCallback(
    (answer: GameAnswer) => {
      if (answerLocked) return;
      setSelectedAnswer(answer);
      setAnswerLocked(true);
      submitAnswer(answer);
    },
    [answerLocked, submitAnswer],
  );

  // Derive playerCorrect from elimination: if round_result fires and no elimination received, they got it right
  useEffect(() => {
    if (phase === 'round_result' && roundResult) {
      // If we haven't been eliminated (phase is still round_result, not eliminated), we're correct
      setPlayerCorrect(true);
    }
  }, [phase, roundResult]);

  useEffect(() => {
    if (phase === 'eliminated') {
      setPlayerCorrect(false);
    }
  }, [phase]);

  const [videoEnded, setVideoEnded] = useState(false);

  // Auto-dismiss round result after 3s — returns to video until next round
  useEffect(() => {
    if (phase === 'round_result') {
      setResultDismissed(false);
      const t = setTimeout(() => setResultDismissed(true), 3000);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const effectivePhase = isObserver && phase === 'eliminated' ? 'round_active' : phase;
  // After 3s result dismiss, treat as round_active so video expands back to fullscreen
  const displayPhase =
    effectivePhase === 'round_result' && resultDismissed ? 'round_active' : effectivePhase;
  const isVideoPhase =
    displayPhase === 'round_active' ||
    displayPhase === 'round_question_overlay' ||
    (displayPhase === 'finished' && !videoEnded);
  const isQuestionPhase = displayPhase === 'round_question_overlay';
  // PIP while question is active, or while video is still playing at show end
  const isPipPhase = isQuestionPhase || (displayPhase === 'finished' && !videoEnded);

  // Animate video between fullscreen and PIP circle
  useEffect(() => {
    const { width, height, borderRadius, top, left } = pipAnim;
    const cfg = { duration: 320, useNativeDriver: false } as const;

    if (isPipPhase) {
      Animated.parallel([
        Animated.timing(width,        { toValue: PIP_SIZE,     ...cfg }),
        Animated.timing(height,       { toValue: PIP_SIZE,     ...cfg }),
        Animated.timing(borderRadius, { toValue: PIP_SIZE / 2, ...cfg }),
        Animated.timing(top,          { toValue: PIP_TOP,      ...cfg }),
        Animated.timing(left,         { toValue: PIP_LEFT,     ...cfg }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(width,        { toValue: SCREEN_W,     ...cfg }),
        Animated.timing(height,       { toValue: SCREEN_H,     ...cfg }),
        Animated.timing(borderRadius, { toValue: 0,            ...cfg }),
        Animated.timing(top,          { toValue: 0,            ...cfg }),
        Animated.timing(left,         { toValue: 0,            ...cfg }),
      ]).start();
    }
  }, [isPipPhase, PIP_SIZE, PIP_TOP, PIP_LEFT, SCREEN_W, SCREEN_H, pipAnim]);

  return (
    <View style={styles.container}>
      {/* ----------------------------------------------------------------- */}
      {/* Phase-specific UI layers (rendered first — behind the video)      */}
      {/* ----------------------------------------------------------------- */}

      {displayPhase === 'connecting' && (
        <View style={StyleSheet.absoluteFillObject}>
          <SafeAreaView style={styles.safeContainer}>
            <ConnectingScreen error={error} />
          </SafeAreaView>
        </View>
      )}

      {displayPhase === 'lobby' && (
        <View style={StyleSheet.absoluteFillObject}>
          <SafeAreaView style={styles.safeContainer}>
            <LobbyScreen
              playersConnected={showState?.playersConnected ?? 0}
              scheduledAt={showState?.scheduledAt ?? null}
              lobbyDurationMs={showState?.lobbyDurationMs ?? 60000}
              isPreBuffering={isPreBuffering}
            />
          </SafeAreaView>
        </View>
      )}

      {displayPhase === 'countdown' && countdown && (
        <View style={StyleSheet.absoluteFillObject}>
          <SafeAreaView style={styles.safeContainer}>
            <CountdownScreen secondsRemaining={countdown.secondsRemaining} />
          </SafeAreaView>
        </View>
      )}

      {/* Round active — transparent HUD over video */}
      {displayPhase === 'round_active' && currentRound && (
        <SafeAreaView style={styles.hudSafe} pointerEvents="none">
          <RoundHUD
            roundIndex={currentRound.roundIndex}
            totalRounds={currentRound.totalRounds}
            gameType={currentRound.gameType}
            playersRemaining={currentRound.playersRemaining}
            isBuffering={isBuffering}
          />
        </SafeAreaView>
      )}

      {/* Question overlay — game fullscreen base layer, host PIP renders on top after */}
      {displayPhase === 'round_question_overlay' && questionOverlay && (() => {
        // Use questionOverlay directly for gameType/totalRounds — avoids depending on
        // currentRound which may arrive slightly after triggerPendingQuestion fires.
        const roundContent = showContent?.rounds[questionOverlay.roundIndex];
        // Spread the full overlay as payload — each game component reads only the
        // fields it needs (trivia → question/options, quick_math → expression/options, etc.)
        const gamePayload = roundContent?.gamePayload ?? (questionOverlay as unknown as Record<string, unknown>);

        return (
          // Bottom 80% of screen, full width — top 20% reserved for host PIP
          <View style={styles.gamePanelQuestion}>
            <GameRenderer
              roundIndex={questionOverlay.roundIndex}
              totalRounds={questionOverlay.totalRounds}
              gameType={questionOverlay.gameType}
              payload={gamePayload}
              timeLimitMs={Math.max(0, questionOverlay.deadlineEpochMs - Date.now())}
              playersRemaining={currentRound?.playersRemaining ?? 0}
              onSubmit={handleSubmit}
              selectedAnswer={selectedAnswer}
              isLocked={answerLocked}
              bundleUrl={roundContent?.bundleUrl ?? null}
            />
          </View>
        );
      })()}

      {/* ----------------------------------------------------------------- */}
      {/* Video layer — always on top. Fullscreen during play, PIP during Q  */}
      {/* ----------------------------------------------------------------- */}
      <Animated.View
        style={[
          styles.videoContainer,
          !isVideoPhase && styles.hidden,
          {
            width:        pipAnim.width,
            height:       pipAnim.height,
            borderRadius: pipAnim.borderRadius,
            top:          pipAnim.top,
            left:         pipAnim.left,
          },
        ]}
      >
        <Video
          ref={videoRef}
          style={styles.videoFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={videoShouldPlay}
          isLooping={false}
          onPlaybackStatusUpdate={handlePlaybackStatus}
        />
        {/* White ring visible in PIP state (question overlay + show end) */}
        {isPipPhase && (
          <Animated.View
            pointerEvents="none"
            style={[styles.pipRing, { borderRadius: pipAnim.borderRadius }]}
          />
        )}
      </Animated.View>

      {/* Round result */}
      {displayPhase === 'round_result' && roundResult && (
        <View style={StyleSheet.absoluteFillObject}>
          <SafeAreaView style={styles.safeContainer}>
            <RoundResultScreen
              playerCorrect={playerCorrect}
              correctAnswer={roundResult.correctAnswer}
              playersEliminated={roundResult.playersEliminated}
              playersRemaining={roundResult.playersRemaining}
            />
          </SafeAreaView>
        </View>
      )}

      {/* Eliminated */}
      {displayPhase === 'eliminated' && eliminated && (
        <View style={StyleSheet.absoluteFillObject}>
          <SafeAreaView style={styles.safeContainer}>
            <EliminatedScreen
              coinsEarned={eliminated.coinsEarned}
              onWatchRest={() => setIsObserver(true)}
            />
          </SafeAreaView>
        </View>
      )}

      {/* Finished */}
      {displayPhase === 'finished' && showEnded && (
        <View style={StyleSheet.absoluteFillObject}>
          <SafeAreaView style={styles.safeContainer}>
            <FinishedScreen
              winners={showEnded.winners}
              totalPlayers={showEnded.totalPlayers}
              playerResult={showEnded.playerResult}
              onExit={() => router.back()}
              topPadding={videoEnded ? 40 : PIP_TOP + PIP_SIZE + 20}
            />
          </SafeAreaView>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  safeContainer: {
    flex: 1,
  },
  hidden: {
    opacity: 0,
    position: 'absolute',
    width: 1,
    height: 1,
  },

  // Video container — animated between fullscreen and PIP circle
  videoContainer: {
    position: 'absolute',
    backgroundColor: '#000',
    overflow: 'hidden',
    // Shadow so PIP circle floats above game content
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 12,
    zIndex: 10,
  },

  // Video fills its animated container
  videoFill: {
    width: '100%',
    height: '100%',
  },

  // White ring around PIP circle
  pipRing: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },

  // Game panel during question phase — bottom 80%, full width
  gamePanelQuestion: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '80%',
    overflow: 'hidden',
  },

  // HUD safe area — just the HUD bar, not blocking taps on video
  hudSafe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },

  // Round HUD
  videoHud: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  roundLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 1.5,
  },
  roundGameType: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.muted,
    letterSpacing: 1,
  },
  hudRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hudPlayers: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.offWhite,
    letterSpacing: 0.5,
  },

  // Center container (connecting, lobby, countdown, result screens)
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: COLORS.bg,
  },
  phaseTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.white,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  phaseSubtitle: {
    fontSize: 15,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorIcon: {
    fontSize: 48,
    color: COLORS.red,
    marginBottom: 16,
  },

  // Lobby
  lobbyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 32,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.green,
  },
  lobbyLiveText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.green,
    letterSpacing: 2,
  },
  playerCount: {
    fontSize: 72,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -2,
  },
  playerCountLabel: {
    fontSize: 16,
    color: COLORS.muted,
    fontWeight: '500',
    marginTop: -4,
  },
  lobbyCountdownBox: {
    marginTop: 32,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 36,
  },
  lobbyCountdownLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  lobbyCountdownValue: {
    fontSize: 42,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -1,
  },
  bufferingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  bufferingText: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: '500',
  },

  // Countdown
  countdownLabel: {
    fontSize: 16,
    color: COLORS.muted,
    fontWeight: '500',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  countdownNumber: {
    fontSize: 120,
    fontWeight: '900',
    color: COLORS.white,
    lineHeight: 130,
    letterSpacing: -4,
  },
  countdownSuffix: {
    fontSize: 18,
    color: COLORS.muted,
    fontWeight: '500',
    marginTop: 8,
  },
  countdownGlow: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: COLORS.accent,
  },
  countdownRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2.5,
    borderColor: COLORS.accentGlow,
  },
  countdownStarting: {
    marginTop: 28,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // Round result
  resultIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultIconCorrect: {
    backgroundColor: COLORS.greenDim,
    borderWidth: 2,
    borderColor: COLORS.green,
  },
  resultIconWrong: {
    backgroundColor: COLORS.redDim,
    borderWidth: 2,
    borderColor: COLORS.red,
  },
  resultIconText: {
    fontSize: 48,
    color: COLORS.white,
    fontWeight: '900',
  },
  correctAnswerCard: {
    marginTop: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    width: '100%',
  },
  correctAnswerLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.muted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  correctAnswerValue: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.white,
    textAlign: 'center',
  },
  resultStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
  },
  resultStat: {
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  resultStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.border,
  },
  resultStatNumber: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
  },
  resultStatLabel: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '500',
    marginTop: 2,
  },
  advanceHint: {
    marginTop: 32,
    fontSize: 13,
    color: COLORS.muted,
  },

  // Eliminated
  eliminatedIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  coinsEarnedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 28,
    marginBottom: 8,
    backgroundColor: '#1C1505',
    borderWidth: 1,
    borderColor: '#3D2D00',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 20,
  },
  coinsEarnedIcon: {
    fontSize: 18,
    color: COLORS.gold,
  },
  coinsEarnedAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.gold,
  },
  coinsEarnedLabel: {
    fontSize: 14,
    color: '#92700A',
    fontWeight: '500',
  },
  watchButton: {
    marginTop: 20,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 36,
  },
  watchButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 0.5,
  },

  // Finished
  finishedContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 60,
    backgroundColor: COLORS.bg,
  },
  finishedTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -1,
    marginBottom: 8,
  },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
    marginTop: 40,
    marginBottom: 32,
    height: 200,
  },
  podiumColumn: {
    alignItems: 'center',
    width: 96,
  },
  podiumName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 4,
    maxWidth: 88,
    textAlign: 'center',
  },
  podiumCoins: {
    fontSize: 11,
    color: COLORS.gold,
    fontWeight: '600',
    marginBottom: 4,
  },
  podiumBlock: {
    width: '100%',
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumBlockFirst: {
    backgroundColor: COLORS.accentDim,
    borderColor: COLORS.accent,
  },
  podiumRank: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.white,
  },
  playerResultCard: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  playerResultStatus: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 6,
  },
  playerResultDetail: {
    fontSize: 14,
    color: COLORS.muted,
  },
  exitButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    width: '100%',
    alignItems: 'center',
  },
  exitButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 0.5,
  },
});
