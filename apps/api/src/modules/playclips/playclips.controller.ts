import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PlayClipsService } from './playclips.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import type { PlayClipSummary, ClipPlaySession } from '@euphoria/types';

class SubmitClipAnswerDto {
  sessionId!: string;
  clientTs!: number;
  answer!: unknown;
}

@ApiTags('playclips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('playclips')
export class PlayClipsController {
  constructor(private readonly playClipsService: PlayClipsService) {}

  @Get()
  @ApiOperation({ summary: 'List available play clips (excludes already-played)' })
  list(
    @Query('page') page: number = 0,
    @Query('limit') limit: number = 20,
    @CurrentUser() user: JwtPayload,
  ): Promise<PlayClipSummary[]> {
    return this.playClipsService.listReady(page, limit, user.sub);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Start a clip play session' })
  start(
    @Param('id') clipId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ClipPlaySession> {
    return this.playClipsService.startSession(user.sub, clipId);
  }

  @Post('submit')
  @ApiOperation({ summary: 'Submit answer for a clip session' })
  submit(
    @Body() body: SubmitClipAnswerDto,
    @CurrentUser() _user: JwtPayload,
  ): Promise<{ correct: boolean; score: number; responseTimeMs: number; percentile: number; totalPlayers: number; correctAnswer: string | null }> {
    return this.playClipsService.submitAnswer(
      body.sessionId,
      body.clientTs,
      body.answer,
    );
  }
}
