/**
 * PlayClips — the async on-demand mini-game engine.
 * Clips are recordings of live show rounds repackaged for solo play.
 */
import type { GameType, GameConfig } from './games.js';
export type ClipStatus = 'processing' | 'ready' | 'archived';
export interface PlayClip {
    id: string;
    showId: string;
    roundIndex: number;
    gameType: GameType;
    /** HLS stream URL for video playback */
    hlsUrl: string | null;
    /** Fallback direct media URL */
    mediaUrl: string;
    status: ClipStatus;
    config: GameConfig;
    playCount: number;
    createdAt: string;
}
export interface PlayClipSummary {
    id: string;
    showId: string;
    gameType: GameType;
    hlsUrl: string | null;
    status: ClipStatus;
    playCount: number;
}
export interface ClipPlaySession {
    id: string;
    userId: string;
    clipId: string;
    /** Unix ms timestamp when the clip was served — server-authoritative */
    servedAt: number;
    completedAt: string | null;
    score: number | null;
}
export interface ClipSubmitPayload {
    sessionId: string;
    /** Client timestamp — stored for anti-cheat comparison, never used as authoritative */
    clientTs: number;
    answer: unknown;
}
//# sourceMappingURL=playclips.d.ts.map