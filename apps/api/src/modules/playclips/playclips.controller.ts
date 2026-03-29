import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PlayClipsService } from './playclips.service';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import type { PlayClipSummary, ClipPlaySession } from '@euphoria/types';

class SubmitClipAnswerDto {
  sessionId!: string;
  clientTs!: number;
  answer!: unknown;
}

@ApiTags('playclips')
@ApiBearerAuth()
@Controller('playclips')
export class PlayClipsController {
  constructor(private readonly playClipsService: PlayClipsService) {}

  @Get()
  @ApiOperation({ summary: 'List available play clips' })
  list(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ): Promise<PlayClipSummary[]> {
    return this.playClipsService.listReady(page, limit);
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
  ): Promise<{ correct: boolean; score: number; responseTimeMs: number }> {
    return this.playClipsService.submitAnswer(
      body.sessionId,
      body.clientTs,
      body.answer,
    );
  }
}
