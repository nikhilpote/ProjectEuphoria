/**
 * ShowGateway — WebSocket gateway for live show play.
 *
 * Namespace: /show
 *
 * Architecture notes:
 * - JWT is verified on connection via handshake.auth.token. Invalid tokens
 *   result in immediate disconnection. userId is stored on socket.data.
 * - Answer submissions are timestamped server-side immediately on receipt.
 *   Client-reported clientTs is stored for anti-cheat but NEVER authoritative.
 * - Redis SET show:{showId}:players tracks connected players per show.
 * - ShowOrchestrator drives the round loop and calls broadcastToShow /
 *   emitToUser on this gateway.
 * - The gateway holds a Map<userId, socketId> per show for targeted emission.
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Logger, Injectable, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../database/redis.module';
import { ShowRepository } from '../../modules/show/show.repository';
import { ShowOrchestrator } from '../../modules/show/show.orchestrator';
import { ShowSchedulerService } from '../../modules/show/show.scheduler';
import { GameRegistry } from '../../modules/games/game-registry.service';
import { GamePackagesService } from '../../modules/game-packages/game-packages.service';
import type {
  JoinShowPayload,
  SubmitAnswerPayload,
  ShowStateEvent,
  ShowContentEvent,
} from '@euphoria/types';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

/** Socket data attached after successful JWT auth */
interface ShowSocketData {
  userId: string;
  showId: string | null;
}

/** Redis key helpers (must match ShowOrchestrator) */
const rk = {
  players: (showId: string) => `show:${showId}:players`,
  answers: (showId: string, roundIndex: number) =>
    `show:${showId}:round:${roundIndex}:answers`,
  status: (showId: string) => `show:${showId}:status`,
  currentRound: (showId: string) => `show:${showId}:current_round`,
  survivors: (showId: string) => `show:${showId}:survivors`,
  roundDeadline: (showId: string, roundIndex: number) =>
    `show:${showId}:round:${roundIndex}:deadline`,
};

@Injectable()
@WebSocketGateway({
  namespace: '/show',
  cors: { origin: '*' }, // Tighten in production
  transports: ['websocket'],
})
export class ShowGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ShowGateway.name);

  /**
   * Per-show user→socket map for targeted emission.
   * Outer key: showId. Inner key: userId. Value: socket.id.
   */
  private readonly showUserSockets = new Map<string, Map<string, string>>();

  /**
   * In-memory cooldown guard to silently drop duplicate/spam submissions
   * within a 500 ms window before they reach Redis.
   * Key format: `${userId}:${showId}:${roundIndex}` → last submission epoch ms.
   */
  private readonly recentSubmissions = new Map<string, number>();

  /**
   * Tracks showIds for which a debounced show_state broadcast is already
   * scheduled. Prevents N broadcasts on a 10k-user join spike — collapses all
   * joins within a 200 ms window into a single room-wide emission.
   */
  private readonly showStateBroadcastPending = new Set<string>();

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly jwtService: JwtService,
    private readonly showRepository: ShowRepository,
    private readonly showOrchestrator: ShowOrchestrator,
    private readonly showScheduler: ShowSchedulerService,
    private readonly gameRegistry: GameRegistry,
    private readonly gamePackagesService: GamePackagesService,
  ) {}

  /** Register this gateway with the orchestrator and scheduler after init to break circular deps */
  onModuleInit(): void {
    this.showOrchestrator.setGateway(this);
    this.showScheduler.setGateway(this);
    this.showScheduler.setOrchestrator(this.showOrchestrator);
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;

    if (!token) {
      this.logger.warn(`Connection rejected — no token: ${client.id}`);
      client.disconnect(true);
      return;
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      this.logger.warn(`Connection rejected — invalid token: ${client.id}`);
      client.disconnect(true);
      return;
    }

    if (!payload.sub) {
      this.logger.warn(`Connection rejected — missing sub: ${client.id}`);
      client.disconnect(true);
      return;
    }

    (client.data as ShowSocketData) = { userId: payload.sub, showId: null };
    this.logger.debug(`Client connected: socketId=${client.id} userId=${payload.sub}`);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const data = client.data as ShowSocketData | undefined;
    if (!data?.userId) return;

    const { userId, showId } = data;
    this.logger.debug(`Client disconnected: socketId=${client.id} userId=${userId}`);

    if (showId) {
      await this.redis.srem(rk.players(showId), userId);

      // Remove from per-show user→socket map
      const userMap = this.showUserSockets.get(showId);
      if (userMap) {
        userMap.delete(userId);
        if (userMap.size === 0) {
          this.showUserSockets.delete(showId);
        }
      }
    }

    // Clean up in-memory rate-limit entries for this user to prevent memory leak
    for (const key of this.recentSubmissions.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.recentSubmissions.delete(key);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Client → Server event handlers
  // ---------------------------------------------------------------------------

  @SubscribeMessage('join_show')
  async handleJoinShow(
    @MessageBody() payload: JoinShowPayload,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const data = client.data as ShowSocketData;
    if (!data?.userId) {
      throw new WsException('Unauthenticated');
    }

    const { showId } = payload;

    // Validate UUID format before hitting Postgres — malformed IDs cause raw DB errors
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!showId || !UUID_RE.test(showId)) {
      throw new WsException('Invalid show ID');
    }

    // Validate show exists
    const show = await this.showRepository.findById(showId);
    if (!show) {
      throw new WsException(`Show ${showId} not found`);
    }

    const userId = data.userId;

    // Join socket.io room
    await client.join(`show:${showId}`);

    // Track in Redis player set
    await this.redis.sadd(rk.players(showId), userId);

    // Track in local user→socket map
    if (!this.showUserSockets.has(showId)) {
      this.showUserSockets.set(showId, new Map());
    }
    this.showUserSockets.get(showId)!.set(userId, client.id);

    // Update socket data so disconnect can clean up
    (client.data as ShowSocketData) = { userId, showId };

    const playersConnected = await this.redis.scard(rk.players(showId));

    // Read current round from Redis (may not exist yet)
    const currentRoundRaw = await this.redis.get(rk.currentRound(showId));
    const currentRoundNum = currentRoundRaw !== null ? parseInt(currentRoundRaw, 10) : null;
    const currentRound = currentRoundNum !== null && currentRoundNum >= 0 ? currentRoundNum : null;

    const state: ShowStateEvent = {
      showId,
      status: show.status,
      currentRound,
      playersConnected,
      scheduledAt: show.scheduled_at.toISOString(),
      lobbyDurationMs: show.lobby_duration_ms,
      // Video URL is NOT sent here — it arrives via show_countdown (signed, time-limited)
      // 60s before start so clients can pre-buffer without exposing the video early.
      videoUrl: null,
    };

    // Markers: each has { at, duration, gameType, config }
    const markers = show.game_sequence as unknown as Array<{
      at?: number;
      duration?: number;
      gameType: string;
      config?: Record<string, unknown>;
    }>;

    // Pre-fetch enabled game packages once to avoid N+1 per round
    const enabledPackages = await this.gamePackagesService.getEnabled();
    const packageMap = new Map(enabledPackages.map((p) => [p.id, p]));

    // Build show_content: send bundle URLs for pre-downloading game engines in lobby.
    // gamePayload (questions, correct answers) is always null here —
    // it is only sent per-round via round_question once the round actually opens.
    const showContent: ShowContentEvent = {
      showId,
      rounds: markers.map((r, idx) => {
        const durationSec = typeof r.duration === 'number' ? r.duration : 30;
        const timeLimitMs = durationSec * 1000;
        const pkg = packageMap.get(r.gameType);
        return {
          roundIndex: idx,
          gameType: r.gameType,
          videoUrl: null,
          videoDurationMs: timeLimitMs,
          questionSpawnAt: 0,
          timeLimitMs,
          gamePayload: null, // never sent in lobby — questions pushed via round_question
          bundleUrl: pkg?.bundleUrl ?? null, // pre-download game engine while waiting
          layout: pkg?.manifest?.layout ?? 'overlay_bottom',
        };
      }),
    };

    this.logger.debug(`User ${userId} joined show ${showId}`);

    // Always send show_state directly to the joining client so they get immediate feedback.
    client.emit('show_state', state);
    // Debounce the room-wide show_state broadcast to collapse join spikes (e.g. 10k joins
    // in 1 second) into a single emission per 200 ms window.
    this.scheduleBroadcastShowState(showId, state);
    // Send content only to the joining client — others already have it from their own join
    client.emit('show_content', showContent);
  }

  @SubscribeMessage('submit_answer')
  async handleSubmitAnswer(
    @MessageBody() payload: SubmitAnswerPayload,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const serverTs = Date.now(); // AUTHORITATIVE — captured immediately

    const data = client.data as ShowSocketData;
    if (!data?.userId) {
      throw new WsException('Unauthenticated');
    }

    const { showId, roundIndex, clientTs, answer } = payload;
    const userId = data.userId;

    // Verify the client is in the correct room
    if (!client.rooms.has(`show:${showId}`)) {
      throw new WsException('Not joined to this show');
    }

    // Verify show is in_progress (live)
    const status = await this.redis.get(rk.status(showId));
    if (status !== 'live') {
      throw new WsException('Show is not in progress');
    }

    // Verify the roundIndex matches the current active round
    const currentRoundRaw = await this.redis.get(rk.currentRound(showId));
    const currentRound =
      currentRoundRaw !== null ? parseInt(currentRoundRaw, 10) : -1;

    if (roundIndex !== currentRound) {
      throw new WsException(
        `Round ${roundIndex} is not active (current: ${currentRound})`,
      );
    }

    // Fix 3: In-memory rate-limit guard — silently drop submissions within 500 ms cooldown
    const submitKey = `${userId}:${showId}:${roundIndex}`;
    const lastSubmit = this.recentSubmissions.get(submitKey);
    if (lastSubmit !== undefined && serverTs - lastSubmit < 500) {
      return; // silently ignore spam
    }
    this.recentSubmissions.set(submitKey, serverTs);

    // Fix 1: Survivor check — reject answers from eliminated players
    const isSurvivor = await this.redis.sismember(rk.survivors(showId), userId);
    if (!isSurvivor) {
      client.emit('show_error', { code: 'ELIMINATED', message: 'You have been eliminated.' });
      return;
    }

    // Fix 2: Deadline enforcement — reject answers received after round closed (200 ms grace)
    const deadlineStr = await this.redis.get(rk.roundDeadline(showId, roundIndex));
    if (deadlineStr) {
      const deadline = parseInt(deadlineStr, 10);
      if (serverTs > deadline + 200) {
        client.emit('show_error', { code: 'ANSWER_LATE', message: 'Answer submitted after the round closed.' });
        return;
      }
    }

    // Write answer to Redis hash — key=userId, value=JSON
    const answerData = JSON.stringify({ answer, serverTs, clientTs });
    // HSETNX — only record first submission per round (prevents re-submission)
    await this.redis.hsetnx(
      rk.answers(showId, roundIndex),
      userId,
      answerData,
    );

    this.logger.debug(
      `Answer recorded show=${showId} round=${roundIndex} userId=${userId} serverTs=${serverTs}`,
    );
  }

  @SubscribeMessage('ping')
  handlePing(
    @MessageBody() payload: { clientTs: number },
  ): { clientTs: number; serverTs: number } {
    return { clientTs: payload.clientTs, serverTs: Date.now() };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Debounced room-wide show_state broadcast.
   *
   * On each join we emit show_state directly to the joining client (immediate,
   * above). This method batches the room-wide re-broadcast so that a spike of
   * 10 000 joins within 200 ms produces a single emission with the final
   * player count rather than 10 000 emissions.
   */
  private scheduleBroadcastShowState(showId: string, state: ShowStateEvent): void {
    if (this.showStateBroadcastPending.has(showId)) return;

    this.showStateBroadcastPending.add(showId);
    setTimeout(() => {
      this.showStateBroadcastPending.delete(showId);
      // Fetch fresh player count so the broadcast reflects the fully-settled
      // player set rather than the count captured at join time.
      this.redis
        .scard(`show:${showId}:players`)
        .then((count) => {
          this.server
            .to(`show:${showId}`)
            .emit('show_state', { ...state, playersConnected: count });
        })
        .catch(() => {
          // Best-effort — swallow errors so a Redis hiccup cannot break joins
        });
    }, 200);
  }

  // ---------------------------------------------------------------------------
  // Called by ShowOrchestrator
  // ---------------------------------------------------------------------------

  /** Broadcast an event to all clients in a show room */
  broadcastToShow(showId: string, event: string, data: unknown): void {
    this.server.to(`show:${showId}`).emit(event, data);
  }

  /**
   * Emit an event to a specific user's socket in a show room.
   * Used for targeted events like player_eliminated.
   */
  emitToUser(
    showId: string,
    userId: string,
    event: string,
    data: unknown,
  ): void {
    const userMap = this.showUserSockets.get(showId);
    if (!userMap) return;

    const socketId = userMap.get(userId);
    if (!socketId) return;

    this.server.to(socketId).emit(event, data);
  }
}
