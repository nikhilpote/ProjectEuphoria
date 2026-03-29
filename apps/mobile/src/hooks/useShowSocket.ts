import { useEffect, useRef, useState, useCallback } from 'react';
import type React from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  ShowStateEvent,
  ShowCountdownEvent,
  ShowStartedEvent,
  RoundResultEvent,
  PlayerEliminatedEvent,
  ShowEndedEvent,
  GameAnswer,
  ShowContentEvent,
} from '@euphoria/types';

import { SOCKET_URL } from '../config';

export type ShowPhase =
  | 'connecting'
  | 'lobby'
  | 'countdown'
  | 'round_active'
  | 'round_question_overlay'
  | 'round_result'
  | 'eliminated'
  | 'finished';

export interface RoundQuestionOverlay {
  showId: string;
  roundIndex: number;
  gameType: string;
  totalRounds: number;
  question: string;
  /** Present for quick_math — the math expression string e.g. "12 × 7 = ?" */
  expression?: string;
  options: string[];
  questionImageUrl: string | null;
  optionImageUrls: (string | null)[];
  category: string | null;
  difficulty: number;
  timeLimitMs: number;
  /** Video position (seconds) at which to display this question. Drive from onPlaybackStatusUpdate. */
  spawnAtVideoSeconds: number;
  /** Server-authoritative deadline (Unix ms). Use for countdown timer — counts down to this. */
  deadlineEpochMs: number;
}

/** Actual payload sent by server for round_start (extends base type with video fields) */
export interface RoundStartData {
  showId: string;
  roundIndex: number;
  totalRounds: number;
  gameType: string;
  videoUrl?: string;
  videoDurationMs: number;
  questionSpawnAt: number;
  playersRemaining: number;
  /** Unix ms — server-authoritative round start. Use to seek video: seekMs = Date.now() - startsAt */
  startsAt: number;
}

export interface UseShowSocketReturn {
  phase: ShowPhase;
  showState: ShowStateEvent | null;
  showStarted: ShowStartedEvent | null;
  countdown: ShowCountdownEvent | null;
  currentRound: RoundStartData | null;
  questionOverlay: RoundQuestionOverlay | null;
  roundResult: RoundResultEvent | null;
  eliminated: PlayerEliminatedEvent | null;
  showEnded: ShowEndedEvent | null;
  showContent: ShowContentEvent | null;
  submitAnswer: (answer: GameAnswer) => void;
  isConnected: boolean;
  error: string | null;
  /** Pending question waiting for video position to reach spawnAtVideoSeconds. */
  pendingQuestion: RoundQuestionOverlay | null;
  /** Ref to pendingQuestion — stable reference for use inside video playback callbacks. */
  pendingQuestionRef: React.MutableRefObject<RoundQuestionOverlay | null>;
  /** Promotes pendingQuestion to visible overlay and transitions phase to round_question_overlay. */
  triggerPendingQuestion: () => void;
}

export function useShowSocket(
  showId: string,
  accessToken: string | null,
): UseShowSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [phase, setPhase] = useState<ShowPhase>('connecting');
  const [isConnected, setIsConnected] = useState(false);
  const [showState, setShowState] = useState<ShowStateEvent | null>(null);
  const [showStarted, setShowStarted] = useState<ShowStartedEvent | null>(null);
  const [countdown, setCountdown] = useState<ShowCountdownEvent | null>(null);
  const [currentRound, setCurrentRound] = useState<RoundStartData | null>(null);
  const [questionOverlay, setQuestionOverlay] = useState<RoundQuestionOverlay | null>(null);
  const [roundResult, setRoundResult] = useState<RoundResultEvent | null>(null);
  const [eliminated, setEliminated] = useState<PlayerEliminatedEvent | null>(null);
  const [showEnded, setShowEnded] = useState<ShowEndedEvent | null>(null);
  const [showContent, setShowContent] = useState<ShowContentEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<RoundQuestionOverlay | null>(null);
  const pendingQuestionRef = useRef<RoundQuestionOverlay | null>(null);

  // Keep ref in sync with state for safe access inside callbacks
  useEffect(() => {
    pendingQuestionRef.current = pendingQuestion;
  }, [pendingQuestion]);

  useEffect(() => {
    if (!accessToken) return;

    const socket = io(`${SOCKET_URL}/show`, {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnectionAttempts: 3,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
      socket.emit('join_show', { showId });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      setError(`Connection failed: ${err.message}`);
    });

    socket.on('show_content', (payload: ShowContentEvent) => {
      setShowContent(payload);
    });

    socket.on('show_state', (payload: ShowStateEvent) => {
      setShowState(payload);
      if (payload.status === 'lobby' || payload.status === 'scheduled') {
        setPhase('lobby');
      } else if (payload.status === 'live') {
        setPhase('round_active');
      } else if (payload.status === 'completed') {
        setPhase('finished');
      } else {
        setPhase('lobby');
      }
    });

    socket.on('show_countdown', (payload: ShowCountdownEvent) => {
      setCountdown(payload);
      setPhase('countdown');
    });

    socket.on('show_started', (payload: ShowStartedEvent) => {
      setShowStarted(payload);
      setPhase('round_active');
    });

    socket.on('round_start', (payload: RoundStartData) => {
      setCurrentRound(payload);
      setRoundResult(null);
      // Do NOT clear questionOverlay here — round_question fires 500ms before round_start,
      // so the overlay may already be active. Clearing it here would wipe the game UI.
      // Do NOT reset phase if already showing the question overlay.
      setPhase((prev) =>
        prev === 'round_question_overlay' ? 'round_question_overlay' : 'round_active',
      );
    });

    socket.on('round_question', (payload: RoundQuestionOverlay) => {
      // Don't show immediately — store as pending.
      // The screen promotes it to visible when video.currentTime >= spawnAtVideoSeconds.
      setPendingQuestion(payload);
      // Don't set phase here — screen controls phase transition via triggerPendingQuestion
    });

    socket.on('round_result', (payload: RoundResultEvent) => {
      setRoundResult(payload);
      setPhase('round_result');
    });

    socket.on('player_eliminated', (payload: PlayerEliminatedEvent) => {
      setEliminated(payload);
      setPhase('eliminated');
    });

    socket.on('show_ended', (payload: ShowEndedEvent) => {
      setShowEnded(payload);
      setPendingQuestion(null);
      setPhase('finished');
    });

    socket.on('show_error', (payload: { code: string; message: string }) => {
      setError(payload.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [showId, accessToken]);

  const triggerPendingQuestion = useCallback(() => {
    const pending = pendingQuestionRef.current;
    if (!pending) return;
    setQuestionOverlay(pending);
    setPendingQuestion(null);
    setPhase('round_question_overlay');
  }, []);

  const submitAnswer = useCallback(
    (answer: GameAnswer) => {
      if (!socketRef.current) return;
      // Prefer currentRound.roundIndex; fall back to questionOverlay for the
      // ~100ms race window before round_start arrives after round_question fires.
      const roundIndex = currentRound?.roundIndex ?? questionOverlay?.roundIndex;
      if (roundIndex === undefined) return;
      socketRef.current.emit('submit_answer', {
        showId,
        roundIndex,
        clientTs: Date.now(),
        answer,
      });
    },
    [showId, currentRound, questionOverlay],
  );

  return {
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
    isConnected,
    error,
    pendingQuestion,
    pendingQuestionRef,
    triggerPendingQuestion,
  };
}
