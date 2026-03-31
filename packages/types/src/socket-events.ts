/**
 * WebSocket event contracts for the Euphoria platform.
 *
 * Naming convention:
 *   - Server -> Client: descriptive past-tense or noun events
 *   - Client -> Server: imperative verb events
 *
 * SECURITY NOTE: round_start events NEVER contain encrypted answer fields.
 * round_result events contain plaintext correct answer ONLY after submission window.
 */

import type { RoundStartPayload } from './show.js';
import type { GameAnswer, GameLayout } from './games.js';
import type { PublicUser } from './user.js';

// ---------------------------------------------------------------------------
// OTA content delivery — pre-loads all round assets in lobby
// ---------------------------------------------------------------------------

/**
 * Client-safe display data for a single round. Sent on join so clients can
 * pre-load videos and game assets before the round begins.
 * NEVER includes correct answers.
 */
export interface RoundClientContent {
  roundIndex: number;
  gameType: string;
  videoUrl: string | null;
  videoDurationMs: number;
  /** Seconds into video when the question overlay spawns */
  questionSpawnAt: number;
  /** Answer window duration in ms (videoDurationMs − questionSpawnAt * 1000) */
  timeLimitMs: number;
  /** Game-type-specific display data. Null in lobby — only populated once the round is live. */
  gamePayload: Record<string, unknown> | null;
  /** CloudFront URL to the game WebView bundle (web/index.html). Null for native-only games. */
  bundleUrl: string | null;
  /** How the game panel is positioned over the video. Defaults to overlay_bottom. */
  layout: GameLayout;
}

export interface ShowContentEvent {
  showId: string;
  rounds: RoundClientContent[];
}

// ---------------------------------------------------------------------------
// Show WebSocket Events (Live Show Gateway)
// ---------------------------------------------------------------------------

/** Events the server emits to the client (show namespace) */
export interface ShowServerEvents {
  /** Initial state sync on join */
  show_state: ShowStateEvent;
  /** Pre-loaded round assets for all rounds — sent once on join, only to the joining client */
  show_content: ShowContentEvent;
  /** Countdown before show starts */
  show_countdown: ShowCountdownEvent;
  /** Show has started — first round incoming */
  show_started: ShowStartedEvent;
  /** Round is beginning — game config delivered */
  round_start: RoundStartPayload;
  /** Submission window has closed — correct answer revealed */
  round_result: RoundResultEvent;
  /** Player was eliminated this round */
  player_eliminated: PlayerEliminatedEvent;
  /** Show is over — winners announced */
  show_ended: ShowEndedEvent;
  /** Live leaderboard update (throttled, not every submission) */
  leaderboard_update: LeaderboardUpdateEvent;
  /** Server error scoped to this show */
  show_error: ShowErrorEvent;
}

/** Events the client sends to the server (show namespace) */
export interface ShowClientEvents {
  /** Register intent to play (sent on connection, before show starts) */
  join_show: JoinShowPayload;
  /** Submit answer for current round */
  submit_answer: SubmitAnswerPayload;
  /** Client ping for RTT measurement */
  ping: PingPayload;
}

// --- Server event payloads ---

export interface ShowStateEvent {
  showId: string;
  status: string;
  currentRound: number | null;
  playersConnected: number;
  scheduledAt: string;
  lobbyDurationMs: number;
  /** Single show video URL — sent early so clients can pre-buffer */
  videoUrl: string | null;
}

export interface ShowCountdownEvent {
  showId: string;
  /** Unix ms of scheduled start */
  startsAt: number;
  /** Seconds remaining */
  secondsRemaining: number;
  /**
   * Signed/expiring video URL — only sent when secondsRemaining ≤ PREBUFFER_THRESHOLD.
   * Null before that window to prevent early video access (video may contain question hints).
   * Clients should start buffering as soon as this becomes non-null.
   */
  videoUrl: string | null;
}

export interface ShowStartedEvent {
  showId: string;
  totalRounds: number;
  /** Unix ms — server-authoritative */
  startedAt: number;
  /** Single video that plays end-to-end. Clients start playing immediately on receipt. */
  videoUrl: string | null;
}

export interface RoundResultEvent {
  showId: string;
  roundIndex: number;
  /** Plaintext correct answer (only revealed after submission window) */
  correctAnswer: unknown;
  playersCorrect: number;
  playersEliminated: number;
  playersRemaining: number;
  /** Whether the authenticated player answered correctly */
  playerCorrect: boolean;
}

export interface PlayerEliminatedEvent {
  showId: string;
  roundIndex: number;
  coinsEarned: number;
}

export interface ShowEndedEvent {
  showId: string;
  winners: Array<{ user: PublicUser; coinsEarned: number }>;
  totalPlayers: number;
  playerResult: {
    status: 'winner' | 'eliminated';
    roundReached: number;
    coinsEarned: number;
  };
}

export interface LeaderboardUpdateEvent {
  showId: string;
  entries: Array<{
    rank: number;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    responseTimeMs: number;
  }>;
  totalRemaining: number;
}

export interface ShowErrorEvent {
  code: string;
  message: string;
}

// --- Client event payloads ---

export interface JoinShowPayload {
  showId: string;
}

export interface SubmitAnswerPayload {
  showId: string;
  roundIndex: number;
  /** Client timestamp — stored for anti-cheat, NEVER used as authoritative time */
  clientTs: number;
  answer: GameAnswer;
}

export interface PingPayload {
  clientTs: number;
}

// ---------------------------------------------------------------------------
// PlayClips WebSocket Events (Clips Gateway — async/solo play)
// ---------------------------------------------------------------------------

/** Events the server emits to the client (clips namespace) */
export interface ClipServerEvents {
  /** Clip session initialized — bundleUrl delivered for WebView pre-load */
  clip_ready: ClipReadyEvent;
  /** Server fires the game at gameOffsetMs — mirrors live show round_question */
  round_question: ClipRoundQuestionEvent;
  /** Result of submitted clip answer */
  clip_result: ClipResultEvent;
  /** Error scoped to this clip session */
  clip_error: ClipErrorEvent;
}

/** Events the client sends to the server (clips namespace) */
export interface ClipClientEvents {
  /** Request next unseen clip — server selects based on user's watch history */
  next_clip: Record<string, never>;
  /** Submit answer for a clip session */
  submit_clip_answer: SubmitClipAnswerPayload;
}

// --- Clip server event payloads ---

export interface ClipReadyEvent {
  clipId: string;
  sessionId: string;
  gameType: string;
  /** WebView bundle URL — pre-load while video starts buffering */
  bundleUrl: string | null;
  /** Video URL to play */
  mediaUrl: string;
  /** Ms from clip start when server will fire round_question */
  gameOffsetMs: number;
  /** Clip video duration in ms */
  clipDurationMs: number;
  playCount: number;
}

export interface ClipRoundQuestionEvent {
  clipId: string;
  sessionId: string;
  gameType: string;
  bundleUrl: string | null;
  /** Flat game payload — same shape as live show round_question gamePayload */
  gamePayload: Record<string, unknown>;
  timeLimitMs: number;
  /** Unix ms — server-authoritative round deadline */
  deadlineEpochMs: number;
}

export interface ClipResultEvent {
  clipId?: string;
  sessionId?: string;
  correct: boolean;
  correctAnswer: string | null;
  responseTimeMs: number;
  score: number;
  percentile: number;
  totalPlayers: number;
}

export interface ClipErrorEvent {
  code: string;
  message: string;
}

// --- Clip client event payloads ---

export interface SubmitClipAnswerPayload {
  sessionId: string;
  /** Client timestamp — stored for anti-cheat comparison only */
  clientTs: number;
  answer: GameAnswer;
}
