/**
 * ClipsGateway — WebSocket gateway for async PlayClip sessions.
 *
 * Namespace: /clips
 *
 * Simpler than ShowGateway — solo play, no synchronization needed.
 * Server timestamp (servedAt) is captured on start_clip, used as
 * the authoritative reference for response_time_ms calculation.
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type { StartClipPayload, SubmitClipAnswerPayload } from '@euphoria/types';

@WebSocketGateway({
  namespace: '/clips',
  cors: { origin: '*' },
  transports: ['websocket'],
})
export class ClipsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ClipsGateway.name);

  handleConnection(client: Socket): void {
    this.logger.debug(`Clip client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Clip client disconnected: ${client.id}`);
  }

  @SubscribeMessage('start_clip')
  async handleStartClip(
    @MessageBody() payload: StartClipPayload,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const servedAt = Date.now(); // server-authoritative serve timestamp

    this.logger.debug(`Clip started: clipId=${payload.clipId} servedAt=${servedAt}`);

    // TODO: Phase 2 — load clip config, create session, emit clip_ready event
    client.emit('clip_ready', {
      sessionId: 'placeholder',
      clipId: payload.clipId,
      servedAt,
      config: null,
    });
  }

  @SubscribeMessage('submit_clip_answer')
  async handleSubmitAnswer(
    @MessageBody() payload: SubmitClipAnswerPayload,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    // clientTs is stored for anti-cheat, not used as authoritative time
    const _serverReceiptTime = Date.now();

    this.logger.debug(`Clip answer received: sessionId=${payload.sessionId}`);

    // TODO: Phase 2 — evaluate answer, compute score, emit clip_result
    client.emit('clip_result', {
      sessionId: payload.sessionId,
      correct: false,
      correctAnswer: null,
      responseTimeMs: 0,
      score: 0,
    });
  }
}
