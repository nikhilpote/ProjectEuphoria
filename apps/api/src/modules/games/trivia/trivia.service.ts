/**
 * TriviaService — serves questions and validates answers for PlayClips
 * and practice mode.
 *
 * Security model:
 * - correct_index is NEVER included in any response to the client.
 * - Points are calculated server-side based on the server-received timestamp
 *   vs the timestamp when the question was served (tracked externally by the
 *   caller via `serverReceivedAt` parameter representing the server time
 *   the client claims to have answered).
 * - The trivia_time_limit_ms feature flag is the authoritative time budget.
 */

import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { DB } from '../../../database/schema';
import { KYSELY_TOKEN } from '../../../database/database.module';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import type { TriviaQuestionPublic, TriviaAnswerResult } from '@euphoria/types';

/** Points awarded for a correct answer at full speed. */
const BASE_POINTS = 1000;

@Injectable()
export class TriviaService {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Kysely<DB>,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  /**
   * Returns a single question WITHOUT correct_index.
   * Throws NotFoundException if the question is inactive or missing.
   */
  async getQuestion(id: string): Promise<TriviaQuestionPublic> {
    const timeLimitMs = await this.featureFlags.getNumber('trivia_time_limit_ms', 15_000);

    const row = await this.db
      .selectFrom('trivia_questions')
      .select(['id', 'question', 'options', 'category', 'difficulty'])
      .where('id', '=', id)
      .where('is_active', '=', true)
      .executeTakeFirst();

    if (!row) throw new NotFoundException(`Trivia question "${id}" not found`);

    return this.toPublic(row, timeLimitMs);
  }

  /**
   * Returns `count` random active questions, optionally filtered by difficulty.
   * If fewer questions than requested are available, returns all that exist.
   */
  async getRandomQuestions(
    count: number,
    difficulty?: number,
  ): Promise<TriviaQuestionPublic[]> {
    const timeLimitMs = await this.featureFlags.getNumber('trivia_time_limit_ms', 15_000);

    let query = this.db
      .selectFrom('trivia_questions')
      .select(['id', 'question', 'options', 'category', 'difficulty'])
      .where('is_active', '=', true)
      .orderBy(sql`random()`)
      .limit(Math.min(count, 50)); // hard cap — prevent abuse

    if (difficulty !== undefined) {
      query = query.where('difficulty', '=', difficulty);
    }

    const rows = await query.execute();

    return rows.map((r) => this.toPublic(r, timeLimitMs));
  }

  /**
   * Returns all active questions for admin use — includes correct_index.
   */
  async listAll(): Promise<Array<{ id: string; question: string; options: unknown; correctIndex: number; category: string | null; difficulty: number }>> {
    const rows = await this.db
      .selectFrom('trivia_questions')
      .select(['id', 'question', 'options', 'correct_index', 'category', 'difficulty'])
      .where('is_active', '=', true)
      .orderBy('category')
      .orderBy('difficulty')
      .execute();

    return rows.map((r) => ({
      id: r.id,
      question: r.question,
      options: r.options,
      correctIndex: r.correct_index,
      category: r.category,
      difficulty: r.difficulty,
    }));
  }

  /**
   * Validates the client's selected answer against the DB-authoritative correct_index.
   *
   * Points are awarded on a speed curve:
   *   - first 50% of time window  → full BASE_POINTS
   *   - 50–80% of time window     → half BASE_POINTS
   *   - 80–100% of time window    → quarter BASE_POINTS
   *   - over time limit           → 0 points (still returns correct/incorrect)
   *
   * @param questionId     UUID of the question
   * @param selectedIndex  0-3 index the client chose
   * @param serverReceivedAt  Unix ms timestamp when the server received the request
   *                          (caller passes Date.now() before any async work)
   * @param questionServedAt  Unix ms timestamp when the question was originally served.
   *                          Callers should track this in a session or pass it from
   *                          the client (treated as advisory for scoring only — not
   *                          used for correctness determination).
   */
  async validateAnswer(
    questionId: string,
    selectedIndex: number,
    serverReceivedAt: number,
    questionServedAt: number,
  ): Promise<TriviaAnswerResult> {
    const [row, timeLimitMs] = await Promise.all([
      this.db
        .selectFrom('trivia_questions')
        .select(['correct_index'])
        .where('id', '=', questionId)
        .where('is_active', '=', true)
        .executeTakeFirst(),
      this.featureFlags.getNumber('trivia_time_limit_ms', 15_000),
    ]);

    if (!row) throw new NotFoundException(`Trivia question "${questionId}" not found`);

    const correct = row.correct_index === selectedIndex;
    const responseTimeMs = Math.max(0, serverReceivedAt - questionServedAt);
    const pointsEarned = correct
      ? this.calculatePoints(responseTimeMs, timeLimitMs)
      : 0;

    return {
      correct,
      correctIndex: row.correct_index,
      pointsEarned,
      responseTimeMs,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private calculatePoints(responseTimeMs: number, timeLimitMs: number): number {
    if (responseTimeMs >= timeLimitMs) return 0;

    const fraction = responseTimeMs / timeLimitMs;

    if (fraction <= 0.5) return BASE_POINTS;
    if (fraction <= 0.8) return Math.floor(BASE_POINTS * 0.5);
    return Math.floor(BASE_POINTS * 0.25);
  }

  private toPublic(
    row: {
      id: string;
      question: string;
      options: string[];
      category: string | null;
      difficulty: number;
    },
    timeLimitMs: number,
  ): TriviaQuestionPublic {
    return {
      id: row.id,
      question: row.question,
      options: row.options,
      category: row.category ?? 'general',
      difficulty: row.difficulty,
      timeLimitMs,
    };
  }
}
