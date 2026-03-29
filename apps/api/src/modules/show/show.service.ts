import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ShowRepository } from './show.repository';
import type { ShowSummary, CreateShowPayload, ShowParticipant } from '@euphoria/types';

@Injectable()
export class ShowService {
  constructor(private readonly showRepository: ShowRepository) {}

  async getUpcoming(): Promise<ShowSummary[]> {
    return this.showRepository.findUpcoming();
  }

  async getById(id: string): Promise<ShowSummary> {
    const show = await this.showRepository.findById(id);
    if (!show) {
      throw new NotFoundException(`Show ${id} not found`);
    }
    return {
      id: show.id,
      title: show.title,
      scheduledAt: show.scheduled_at.toISOString(),
      status: show.status,
      playerCount: show.player_count,
      prizePool: show.prize_pool,
      roundCount: (show.game_sequence as { roundIndex: number }[]).length,
      lobbyDurationMs: show.lobby_duration_ms,
    };
  }

  async create(payload: CreateShowPayload): Promise<ShowSummary> {
    const show = await this.showRepository.create(payload);
    return {
      id: show.id,
      title: show.title,
      scheduledAt: show.scheduled_at.toISOString(),
      status: show.status,
      playerCount: show.player_count,
      prizePool: show.prize_pool,
      roundCount: (show.game_sequence as { roundIndex: number }[]).length,
      lobbyDurationMs: show.lobby_duration_ms,
    };
  }

  async update(id: string, payload: { title?: string; scheduledAt?: string; gameSequence?: unknown[]; lobbyDurationMs?: number; videoUrl?: string | null }): Promise<ShowSummary> {
    const show = await this.showRepository.findById(id);
    if (!show) throw new NotFoundException(`Show ${id} not found`);
    const updated = await this.showRepository.update(id, payload);
    return {
      id: updated.id,
      title: updated.title,
      scheduledAt: updated.scheduled_at.toISOString(),
      status: updated.status,
      playerCount: updated.player_count,
      prizePool: updated.prize_pool,
      roundCount: (updated.game_sequence as unknown[]).length,
      lobbyDurationMs: updated.lobby_duration_ms,
    };
  }

  async delete(id: string): Promise<void> {
    const show = await this.showRepository.findById(id);
    if (!show) throw new NotFoundException(`Show ${id} not found`);
    if (['live'].includes(show.status)) {
      throw new BadRequestException(`Cannot delete a live show`);
    }
    await this.showRepository.delete(id);
  }

  async getAll(): Promise<ShowSummary[]> {
    return this.showRepository.findAll();
  }

  async getFullDetail(id: string) {
    const show = await this.showRepository.findById(id);
    if (!show) throw new NotFoundException(`Show ${id} not found`);
    return {
      id: show.id,
      title: show.title,
      scheduledAt: show.scheduled_at.toISOString(),
      status: show.status,
      playerCount: show.player_count,
      prizePool: show.prize_pool,
      gameSequence: show.game_sequence as unknown[],
      lobbyDurationMs: show.lobby_duration_ms,
      videoUrl: show.video_url ?? null,
    };
  }

  async registerForShow(userId: string, showId: string): Promise<ShowParticipant> {
    // Verify show exists and is accepting registrations
    const show = await this.showRepository.findById(showId);
    if (!show) {
      throw new NotFoundException(`Show ${showId} not found`);
    }
    if (!['scheduled', 'lobby'].includes(show.status)) {
      throw new NotFoundException(`Show ${showId} is not accepting registrations`);
    }
    return this.showRepository.registerParticipant(userId, showId);
  }
}
