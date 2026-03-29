/**
 * Show and ShowParticipant domain types
 */
import type { GameType, GameConfig } from './games.js';
export type ShowStatus = 'scheduled' | 'lobby' | 'live' | 'completed' | 'cancelled';
export type ParticipantStatus = 'registered' | 'active' | 'eliminated' | 'winner';
export interface ShowRound {
    roundIndex: number;
    gameType: GameType;
    gameDefinitionId: string;
}
export interface Show {
    id: string;
    title: string;
    scheduledAt: string;
    status: ShowStatus;
    /** Ordered sequence of rounds */
    gameSequence: ShowRound[];
    playerCount: number;
    prizePool: number;
    createdAt: string;
    updatedAt: string;
}
/** Show summary for listing endpoints */
export interface ShowSummary {
    id: string;
    title: string;
    scheduledAt: string;
    status: ShowStatus;
    playerCount: number;
    prizePool: number;
    roundCount: number;
}
export interface ShowParticipant {
    id: string;
    userId: string;
    showId: string;
    status: ParticipantStatus;
    roundReached: number;
    coinsEarned: number;
    joinedAt: string;
}
/** Payload sent to client on round_start event */
export interface RoundStartPayload {
    showId: string;
    roundIndex: number;
    totalRounds: number;
    gameType: GameType;
    /** Client-facing game config — never contains encrypted answers */
    config: Omit<GameConfig, 'correctAnswerEncrypted' | 'differencesEncrypted' | 'itemLocationsEncrypted'>;
    /** Unix ms timestamp — server-authoritative round start */
    startsAt: number;
    timeLimitMs: number;
    playersRemaining: number;
}
export interface CreateShowPayload {
    title: string;
    scheduledAt: string;
    gameSequence: ShowRound[];
    prizePool: number;
}
//# sourceMappingURL=show.d.ts.map