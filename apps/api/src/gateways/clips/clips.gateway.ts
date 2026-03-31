/**
 * ClipsGateway — WebSocket gateway for server-driven PlayClip sessions.
 *
 * Namespace: /clips
 *
 * Flow:
 *  1. Client connects with JWT token (same pattern as ShowGateway)
 *  2. Client emits next_clip {} — no clipId, server picks next unseen clip for this user
 *  3. Server creates session, emits clip_ready (media URL + bundle URL for pre-load)
 *  4. Server fires round_question after gameOffsetMs (server-authoritative timing)
 *  5. Server sets deadline timer: auto-submits score=0 if no answer by timeLimitMs
 *  6. Client emits submit_clip_answer { sessionId, answer, clientTs }
 *  7. Server evaluates, emits clip_result
 *  8. On disconnect: all pending timers cleared
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PlayClipsService } from '../../modules/playclips/playclips.service';
import { GamePackagesService } from '../../modules/game-packages/game-packages.service';
import { GameRegistry } from '../../modules/games/game-registry.service';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import type { SubmitClipAnswerPayload } from '@euphoria/types';

interface ClipSocketData {
  userId: string;
}

interface SocketTimers {
  gameTimer: ReturnType<typeof setTimeout> | null;
  deadlineTimer: ReturnType<typeof setTimeout> | null;
}

interface PendingAnswer {
  sessionId: string;
  clientTs: number;
  answer: SubmitClipAnswerPayload['answer'];
}

@WebSocketGateway({
  namespace: '/clips',
  cors: { origin: '*' },
  transports: ['websocket'],
})
export class ClipsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ClipsGateway.name);
  private readonly socketTimers = new Map<string, SocketTimers>();
  /** Stores the answer submitted early — used when deadline timer fires the reveal */
  private readonly pendingAnswers = new Map<string, PendingAnswer>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly playClipsService: PlayClipsService,
    private readonly gamePackagesService: GamePackagesService,
    private readonly gameRegistry: GameRegistry,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) { client.disconnect(true); return; }
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      if (!payload.sub) { client.disconnect(true); return; }
      (client.data as ClipSocketData) = { userId: payload.sub };
      this.socketTimers.set(client.id, { gameTimer: null, deadlineTimer: null });
      this.logger.debug(`Clips connected: ${client.id} userId=${payload.sub}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.clearTimers(client.id);
    this.socketTimers.delete(client.id);
    this.pendingAnswers.delete(client.id);
    this.logger.debug(`Clips disconnected: ${client.id}`);
  }

  @SubscribeMessage('next_clip')
  async handleNextClip(
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const data = client.data as ClipSocketData | undefined;
    if (!data?.userId) throw new WsException('Unauthenticated');

    // Cancel any running timers and clear any stored answer from a previous clip
    this.clearTimers(client.id);
    this.pendingAnswers.delete(client.id);

    const prepared = await this.playClipsService.prepareNextSession(data.userId);
    if (!prepared) {
      client.emit('clip_error', { code: 'NO_CLIPS_AVAILABLE', message: 'No unseen clips available' });
      return;
    }

    const { session, gameType, config, timeLimitMs, gameOffsetMs, mediaUrl, clipDurationMs, playCount } = prepared;

    const packages = await this.gamePackagesService.getEnabled();
    const pkg = packages.find((p) => p.id === gameType);
    const bundleUrl = pkg?.bundleUrl ?? null;

    client.emit('clip_ready', {
      clipId: session.clipId,
      sessionId: session.id,
      gameType,
      bundleUrl,
      mediaUrl,
      gameOffsetMs,
      clipDurationMs,
      playCount,
    });

    // For spot_difference: resolve level to inject imageA/imageB/differences before building payload
    let enrichedConfig = config;
    if (gameType === 'spot_difference') {
      const sd = (config['spotDifference'] ?? config) as Record<string, unknown>;
      const levelId = sd['levelId'] as string | undefined;
      if (levelId) {
        const level = await this.gamePackagesService.getLevelCached('spot_difference', levelId);
        if (level) {
          const resolvedFindCount = (sd['findCount'] as number | undefined)
            ?? (level.config['findCount'] as number | undefined) ?? 1;
          enrichedConfig = {
            ...config,
            spotDifference: {
              ...sd,
              imageA: level.config['imageA'],
              imageB: level.config['imageB'],
              differences: level.config['differences'],
              findCount: resolvedFindCount,
              imageAspectRatio: level.config['imageAspectRatio'],
            },
          };
        }
      }
    }

    const gamePayload = this.gameRegistry.buildClientPayload(gameType, enrichedConfig);

    const timers = this.socketTimers.get(client.id)!;

    const fireRoundQuestion = () => {
      const deadlineEpochMs = Date.now() + timeLimitMs;

      client.emit('round_question', {
        clipId: session.clipId,
        sessionId: session.id,
        gameType,
        bundleUrl,
        gamePayload: { ...gamePayload, timeLimitMs },
        timeLimitMs,
        deadlineEpochMs,
      });

      this.logger.debug(
        `round_question fired: clipId=${session.clipId} sessionId=${session.id} timeLimitMs=${timeLimitMs}`,
      );

      timers.deadlineTimer = setTimeout(async () => {
        // Use the player's submitted answer if they answered early, otherwise score=0
        const pending = this.pendingAnswers.get(client.id);
        this.pendingAnswers.delete(client.id);
        const answerPayload: unknown = pending ? pending.answer : { gameType, score: 0, selectedOptionId: '0' };
        const clientTs = pending ? pending.clientTs : Date.now();
        const sid = pending ? pending.sessionId : session.id;
        try {
          const result = await this.playClipsService.submitAnswer(sid, clientTs, answerPayload);
          client.emit('clip_result', { clipId: session.clipId, ...result });
        } catch {
          // Session already completed — ignore
        }
      }, timeLimitMs + 500);
    };

    if (gameOffsetMs > 0) {
      timers.gameTimer = setTimeout(fireRoundQuestion, gameOffsetMs);
    } else {
      fireRoundQuestion();
    }
  }

  @SubscribeMessage('submit_clip_answer')
  handleSubmitAnswer(
    @ConnectedSocket() client: Socket,
    payload: SubmitClipAnswerPayload,
  ): void {
    const data = client.data as ClipSocketData | undefined;
    if (!data?.userId) throw new WsException('Unauthenticated');

    // Store the answer — the deadline timer will evaluate and emit clip_result
    // when the round ends (same time for all players). This gives the live-show feel.
    this.pendingAnswers.set(client.id, {
      sessionId: payload.sessionId,
      clientTs: payload.clientTs,
      answer: payload.answer,
    });

    this.logger.debug(`Answer stored for ${client.id}, awaiting deadline timer`);
  }

  private clearTimers(socketId: string): void {
    const timers = this.socketTimers.get(socketId);
    if (!timers) return;
    if (timers.gameTimer) { clearTimeout(timers.gameTimer); timers.gameTimer = null; }
    if (timers.deadlineTimer) { clearTimeout(timers.deadlineTimer); timers.deadlineTimer = null; }
  }
}
