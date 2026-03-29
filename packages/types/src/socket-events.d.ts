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
import type { GameAnswer } from './games.js';
import type { PublicUser } from './user.js';
/** Events the server emits to the client (show namespace) */
export interface ShowServerEvents {
    /** Initial state sync on join */
    show_state: ShowStateEvent;
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
export interface ShowStateEvent {
    showId: string;
    status: string;
    currentRound: number | null;
    playersConnected: number;
    scheduledAt: string;
}
export interface ShowCountdownEvent {
    showId: string;
    /** Unix ms of scheduled start */
    startsAt: number;
    /** Seconds remaining */
    secondsRemaining: number;
}
export interface ShowStartedEvent {
    showId: string;
    totalRounds: number;
    /** Unix ms — server-authoritative */
    startedAt: number;
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
    winners: Array<{
        user: PublicUser;
        coinsEarned: number;
    }>;
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
/** Events the server emits to the client (clips namespace) */
export interface ClipServerEvents {
    /** Clip session initialized — config delivered */
    clip_ready: ClipReadyEvent;
    /** Result of submitted clip answer */
    clip_result: ClipResultEvent;
    /** Error scoped to this clip session */
    clip_error: ClipErrorEvent;
}
/** Events the client sends to the server (clips namespace) */
export interface ClipClientEvents {
    /** Start a clip play session */
    start_clip: StartClipPayload;
    /** Submit answer for a clip session */
    submit_clip_answer: SubmitClipAnswerPayload;
}
export interface ClipReadyEvent {
    sessionId: string;
    clipId: string;
    /** Unix ms — server-authoritative serve time */
    servedAt: number;
    config: RoundStartPayload;
}
export interface ClipResultEvent {
    sessionId: string;
    correct: boolean;
    correctAnswer: unknown;
    responseTimeMs: number;
    score: number;
}
export interface ClipErrorEvent {
    code: string;
    message: string;
}
export interface StartClipPayload {
    clipId: string;
}
export interface SubmitClipAnswerPayload {
    sessionId: string;
    /** Client timestamp — stored for anti-cheat comparison only */
    clientTs: number;
    answer: GameAnswer;
}
//# sourceMappingURL=socket-events.d.ts.map