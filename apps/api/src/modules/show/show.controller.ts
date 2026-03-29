import { Controller, Get, Post, Patch, Delete, Param, Body, ValidationPipe, HttpCode, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ShowService } from './show.service';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import type { ShowSummary, ShowParticipant, CreateShowPayload } from '@euphoria/types';

@ApiTags('shows')
@ApiBearerAuth()
@Controller('shows')
export class ShowController {
  constructor(private readonly showService: ShowService) {}

  @Get()
  @ApiOperation({ summary: 'List all shows' })
  listAll(): Promise<ShowSummary[]> {
    return this.showService.getAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new show (admin)' })
  createShow(
    @Body(new ValidationPipe({ whitelist: false, transform: false })) payload: CreateShowPayload,
  ): Promise<ShowSummary> {
    return this.showService.create(payload);
  }

  @Get(':id/detail')
  @ApiOperation({ summary: 'Get full show detail — admin only' })
  async getShowDetail(@Param('id') id: string) {
    return this.showService.getFullDetail(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get show by ID' })
  getShow(@Param('id') id: string): Promise<ShowSummary> {
    return this.showService.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a show' })
  updateShow(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: false, transform: false })) payload: { title?: string; scheduledAt?: string; gameSequence?: unknown[]; lobbyDurationMs?: number },
  ): Promise<ShowSummary> {
    return this.showService.update(id, payload);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a show' })
  @HttpCode(204)
  deleteShow(@Param('id') id: string): Promise<void> {
    return this.showService.delete(id);
  }

  @Post(':id/register')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Register for a show' })
  register(
    @Param('id') showId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ShowParticipant> {
    return this.showService.registerForShow(user.sub, showId);
  }
}
