/**
 * usePlayClipsSocket — WebSocket hook for server-driven PlayClip sessions.
 *
 * One socket per user (created at screen level, not per card).
 * The server picks the next unseen clip on each next_clip request.
 *
 * Flow:
 *  nextClip()         → emits next_clip (no clipId — server decides)
 *  ← clip_ready       → clipData available (mediaUrl, gameType, bundleUrl, etc.)
 *  ← round_question   → game payload delivered at server-scheduled gameOffsetMs
 *  submitAnswer(...)  → emits submit_clip_answer
 *  ← clip_result      → correct/score/percentile to show result overlay
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config';
import type { GameAnswer } from '@euphoria/types';

export interface ClipData {
  clipId: string;
  gameType: string;
  bundleUrl: string | null;
  mediaUrl: string;
  gameOffsetMs: number;
  clipDurationMs: number;
  playCount: number;
}

export interface ClipRoundQuestion {
  clipId: string;
  sessionId: string;
  gameType: string;
  bundleUrl: string | null;
  gamePayload: Record<string, unknown>;
  timeLimitMs: number;
  deadlineEpochMs: number;
}

export interface ClipResult {
  correct: boolean;
  score: number;
  responseTimeMs: number;
  percentile: number;
  totalPlayers: number;
  correctAnswer: string | null;
}

export interface UsePlayClipsSocketReturn {
  nextClip: () => void;
  submitAnswer: (sessionId: string, answer: GameAnswer) => void;
  sessionId: string | null;
  clipData: ClipData | null;
  roundQuestion: ClipRoundQuestion | null;
  result: ClipResult | null;
  isConnected: boolean;
  noMoreClips: boolean;
}

export function usePlayClipsSocket(
  accessToken: string | null,
): UsePlayClipsSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [clipData, setClipData] = useState<ClipData | null>(null);
  const [roundQuestion, setRoundQuestion] = useState<ClipRoundQuestion | null>(null);
  const [result, setResult] = useState<ClipResult | null>(null);
  const [noMoreClips, setNoMoreClips] = useState(false);

  useEffect(() => {
    if (!accessToken) return;

    const socket = io(`${SOCKET_URL}/clips`, {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('clip_ready', (data: ClipData & { sessionId: string }) => {
      setSessionId(data.sessionId);
      setClipData({
        clipId: data.clipId,
        gameType: data.gameType,
        bundleUrl: data.bundleUrl,
        mediaUrl: data.mediaUrl,
        gameOffsetMs: data.gameOffsetMs,
        clipDurationMs: data.clipDurationMs,
        playCount: data.playCount,
      });
      setRoundQuestion(null);
      setResult(null);
    });

    socket.on('round_question', (data: ClipRoundQuestion) => {
      setRoundQuestion(data);
    });

    socket.on('clip_result', (data: ClipResult) => {
      setResult(data);
    });

    socket.on('clip_error', (data: { code: string; message: string }) => {
      if (data.code === 'NO_CLIPS_AVAILABLE') {
        setNoMoreClips(true);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken]);

  const nextClip = useCallback(() => {
    setClipData(null);
    setRoundQuestion(null);
    setResult(null);
    setSessionId(null);
    setNoMoreClips(false);
    socketRef.current?.emit('next_clip', {});
  }, []);

  const submitAnswer = useCallback((sid: string, answer: GameAnswer) => {
    socketRef.current?.emit('submit_clip_answer', {
      sessionId: sid,
      answer,
      clientTs: Date.now(),
    });
  }, []);

  return {
    nextClip,
    submitAnswer,
    sessionId,
    clipData,
    roundQuestion,
    result,
    isConnected,
    noMoreClips,
  };
}
