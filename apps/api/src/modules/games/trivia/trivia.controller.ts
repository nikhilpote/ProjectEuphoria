import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiBody } from '@nestjs/swagger';
import { TriviaService } from './trivia.service';
import { Public } from '../../../common/decorators/public.decorator';
import type { TriviaQuestionPublic, TriviaAnswerResult, TriviaValidatePayload } from '@euphoria/types';

@ApiTags('games / trivia')
@ApiBearerAuth()
@Controller('games/trivia')
export class TriviaController {
  constructor(private readonly triviaService: TriviaService) {}

  /**
   * GET /games/trivia/questions — full list for admin show builder
   */
  @Get('questions')
  @ApiOperation({ summary: 'List all trivia questions (admin)' })
  listAll() {
    return this.triviaService.listAll();
  }

  /**
   * GET /games/trivia/questions/random?count=5&difficulty=1
   *
   * Serves random trivia questions for PlayClips and practice mode.
   * Public — no auth required so unauthenticated users can practice.
   */
  @Public()
  @Get('questions/random')
  @ApiOperation({ summary: 'Get random trivia questions (no auth required)' })
  @ApiQuery({ name: 'count', required: false, type: Number, description: 'Number of questions (default 5, max 50)' })
  @ApiQuery({ name: 'difficulty', required: false, type: Number, description: 'Filter by difficulty 1-5' })
  getRandomQuestions(
    @Query('count') countRaw?: string,
    @Query('difficulty') difficultyRaw?: string,
  ): Promise<TriviaQuestionPublic[]> {
    const count = countRaw !== undefined ? parseInt(countRaw, 10) : 5;
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      throw new BadRequestException('count must be an integer between 1 and 50');
    }

    let difficulty: number | undefined;
    if (difficultyRaw !== undefined) {
      difficulty = parseInt(difficultyRaw, 10);
      if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
        throw new BadRequestException('difficulty must be an integer between 1 and 5');
      }
    }

    return this.triviaService.getRandomQuestions(count, difficulty);
  }

  /**
   * POST /games/trivia/validate
   *
   * Validates a player's answer against the server-authoritative correct_index.
   * JWT required — ties into authenticated sessions for score tracking.
   *
   * Body: { questionId, selectedIndex, clientTimestamp }
   * Returns: { correct, correctIndex, pointsEarned, responseTimeMs }
   */
  @Post('validate')
  @ApiOperation({ summary: 'Validate a trivia answer (JWT required)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['questionId', 'selectedIndex', 'clientTimestamp'],
      properties: {
        questionId:      { type: 'string', format: 'uuid' },
        selectedIndex:   { type: 'integer', minimum: 0, maximum: 3 },
        clientTimestamp: { type: 'integer', description: 'Unix ms when the client submitted the answer' },
      },
    },
  })
  validate(@Body() body: TriviaValidatePayload): Promise<TriviaAnswerResult> {
    const { questionId, selectedIndex, clientTimestamp } = body;

    if (!questionId || typeof questionId !== 'string') {
      throw new BadRequestException('questionId must be a non-empty string');
    }
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 3) {
      throw new BadRequestException('selectedIndex must be an integer 0-3');
    }
    if (!Number.isInteger(clientTimestamp) || clientTimestamp <= 0) {
      throw new BadRequestException('clientTimestamp must be a positive Unix ms integer');
    }

    // serverReceivedAt is captured here — before async operations — to give
    // the most accurate latency measurement from the client's perspective.
    const serverReceivedAt = Date.now();

    return this.triviaService.validateAnswer(
      questionId,
      selectedIndex,
      serverReceivedAt,
      clientTimestamp,
    );
  }
}
