import { Injectable, NotFoundException } from '@nestjs/common';
import { PlayClipsRepository } from './playclips.repository';
import type { PlayClipSummary, ClipPlaySession } from '@euphoria/types';

@Injectable()
export class PlayClipsService {
  constructor(private readonly playClipsRepository: PlayClipsRepository) {}

  async listReady(page: number = 1, limit: number = 20): Promise<PlayClipSummary[]> {
    const offset = (page - 1) * limit;
    return this.playClipsRepository.findReady(limit, offset);
  }

  async startSession(userId: string, clipId: string): Promise<ClipPlaySession> {
    const clip = await this.playClipsRepository.findById(clipId);
    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found or not ready`);
    }

    // Server-authoritative serve timestamp
    const servedAt = Date.now();

    return this.playClipsRepository.createSession(userId, clipId, servedAt);
  }

  async submitAnswer(
    sessionId: string,
    clientTs: number,
    _answer: unknown,
  ): Promise<{ correct: boolean; score: number; responseTimeMs: number }> {
    // TODO: Implement answer evaluation.
    // 1. Load session to get served_at (server-authoritative)
    // 2. Load clip config, decrypt correct answer from game_definitions
    // 3. Compare submitted answer against correct answer
    // 4. response_time_ms = Date.now() - session.served_at (server-side)
    // 5. Score based on response time
    // 6. Complete session

    const score = 0;
    const responseTimeMs = 0;

    await this.playClipsRepository.completeSession(sessionId, score, clientTs);

    return { correct: false, score, responseTimeMs };
  }
}
