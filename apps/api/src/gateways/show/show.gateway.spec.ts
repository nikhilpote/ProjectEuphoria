/**
 * ShowGateway unit tests.
 *
 * Tests cover handleSubmitAnswer security checks in exact gate order:
 *   1. Room membership check (WsException)
 *   2. Status check — show must be 'live' (WsException)
 *   3. Round index mismatch (WsException)
 *   4. Rate limit — 500 ms in-memory cooldown (silent drop)
 *   5. Survivor check — eliminated players get show_error ELIMINATED
 *   6. Deadline enforcement — late answers get show_error ANSWER_LATE
 *   7. Happy path — hsetnx called with correct key and value
 *
 * Note on gate order: rate limit fires BEFORE survivor/deadline checks so
 * rate-limited submissions never hit Redis at all (by design in the source).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ShowGateway } from './show.gateway';
import { ShowRepository } from '../../modules/show/show.repository';
import { ShowOrchestrator } from '../../modules/show/show.orchestrator';
import { ShowSchedulerService } from '../../modules/show/show.scheduler';
import { GameRegistry } from '../../modules/games/game-registry.service';
import { GamePackagesService } from '../../modules/game-packages/game-packages.service';
import { REDIS_CLIENT } from '../../database/redis.module';
import { WsException } from '@nestjs/websockets';
import type { SubmitAnswerPayload } from '@euphoria/types';
import type { Socket } from 'socket.io';

// ---------------------------------------------------------------------------
// Mock factory helpers
// ---------------------------------------------------------------------------

function makeMockRedis() {
  return {
    get: jest.fn(),
    set: jest.fn(),
    sismember: jest.fn(),
    hsetnx: jest.fn(),
    sadd: jest.fn(),
    scard: jest.fn(),
    smembers: jest.fn(),
    srem: jest.fn(),
  };
}

function makeMockSocket(overrides: Partial<{
  rooms: Set<string>;
  userId: string;
  showId: string | null;
}> = {}): Partial<Socket> & { emit: jest.Mock; data: { userId: string; showId: string | null } } {
  return {
    id: 'socket-test-1',
    rooms: overrides.rooms ?? new Set(['show:test-show']),
    data: {
      userId: overrides.userId ?? 'user-1',
      showId: overrides.showId ?? null,
    },
    emit: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShowGateway — handleSubmitAnswer', () => {
  let gateway: ShowGateway;
  let mockRedis: ReturnType<typeof makeMockRedis>;

  const basePayload: SubmitAnswerPayload = {
    showId: 'test-show',
    roundIndex: 2,
    clientTs: Date.now(),
    answer: { selectedIndex: 1 } as unknown as SubmitAnswerPayload['answer'],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis = makeMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShowGateway,
        { provide: REDIS_CLIENT, useValue: mockRedis },
        {
          provide: JwtService,
          useValue: { verify: jest.fn().mockReturnValue({ sub: 'user-1', email: '' }) },
        },
        {
          provide: ShowRepository,
          useValue: { findById: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: ShowOrchestrator,
          useValue: { setGateway: jest.fn() },
        },
        {
          provide: ShowSchedulerService,
          useValue: { setGateway: jest.fn(), setOrchestrator: jest.fn() },
        },
        {
          provide: GameRegistry,
          useValue: { get: jest.fn(), isCorrect: jest.fn(), buildQuestionEvent: jest.fn() },
        },
        {
          provide: GamePackagesService,
          useValue: { getEnabled: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    gateway = module.get<ShowGateway>(ShowGateway);

    // Attach a fake server so broadcastToShow / emitToUser don't crash
    (gateway as unknown as { server: unknown }).server = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    };

    // Clear the in-memory rate-limit map between tests
    (gateway as unknown as { recentSubmissions: Map<string, number> }).recentSubmissions.clear();
  });

  // -------------------------------------------------------------------------
  // Gate 1: room membership
  // -------------------------------------------------------------------------

  it('throws WsException when client is not in the show room', async () => {
    const client = makeMockSocket({ rooms: new Set() }); // not in any room

    await expect(
      gateway.handleSubmitAnswer(basePayload, client as unknown as Socket),
    ).rejects.toThrow(WsException);

    expect(mockRedis.get).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Gate 2: show status
  // -------------------------------------------------------------------------

  it('throws WsException when show status is not live', async () => {
    const client = makeMockSocket({ rooms: new Set(['show:test-show']) });
    mockRedis.get.mockResolvedValueOnce('scheduled'); // status = not live

    await expect(
      gateway.handleSubmitAnswer(basePayload, client as unknown as Socket),
    ).rejects.toThrow(WsException);

    expect(mockRedis.hsetnx).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Gate 3: round index mismatch
  // -------------------------------------------------------------------------

  it('throws WsException when roundIndex does not match currentRound', async () => {
    const client = makeMockSocket({ rooms: new Set(['show:test-show']) });

    // status = live, currentRound = 1 (payload has roundIndex=2)
    mockRedis.get
      .mockResolvedValueOnce('live')   // status
      .mockResolvedValueOnce('1');      // current_round

    await expect(
      gateway.handleSubmitAnswer(basePayload, client as unknown as Socket),
    ).rejects.toThrow(WsException);

    expect(mockRedis.hsetnx).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Gate 4: in-memory rate limit (fires BEFORE Redis survivor/deadline checks)
  // -------------------------------------------------------------------------

  it('silently drops duplicate submission within 500 ms cooldown (no Redis write)', async () => {
    const client = makeMockSocket({ rooms: new Set(['show:test-show']) });

    // status = live, currentRound = 2
    mockRedis.get
      .mockResolvedValue('live')
      .mockResolvedValueOnce('live')
      .mockResolvedValueOnce('2');

    // Prime the rate-limit map to simulate a submission 100 ms ago
    const submitKey = `user-1:test-show:${basePayload.roundIndex}`;
    (gateway as unknown as { recentSubmissions: Map<string, number> })
      .recentSubmissions.set(submitKey, Date.now() - 100);

    // Need fresh redis mock state for the second call
    mockRedis.get.mockResolvedValueOnce('live').mockResolvedValueOnce('2');

    const result = await gateway.handleSubmitAnswer(
      basePayload,
      client as unknown as Socket,
    );

    // Should return undefined (silent drop) and NOT call sismember or hsetnx
    expect(result).toBeUndefined();
    expect(mockRedis.sismember).not.toHaveBeenCalled();
    expect(mockRedis.hsetnx).not.toHaveBeenCalled();
  });

  it('allows submission after 500 ms cooldown window has expired', async () => {
    const client = makeMockSocket({ rooms: new Set(['show:test-show']) });

    // Prime the rate-limit map to simulate a submission 600 ms ago (past cooldown)
    const submitKey = `user-1:test-show:${basePayload.roundIndex}`;
    (gateway as unknown as { recentSubmissions: Map<string, number> })
      .recentSubmissions.set(submitKey, Date.now() - 600);

    // status = live, currentRound = 2, survivor = 1, no deadline
    mockRedis.get
      .mockResolvedValueOnce('live')  // status
      .mockResolvedValueOnce('2')     // current_round
      .mockResolvedValueOnce(null);   // deadline (none set)
    mockRedis.sismember.mockResolvedValueOnce(1); // is a survivor
    mockRedis.hsetnx.mockResolvedValueOnce(1);

    await gateway.handleSubmitAnswer(basePayload, client as unknown as Socket);

    expect(mockRedis.sismember).toHaveBeenCalled();
    expect(mockRedis.hsetnx).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Gate 5: survivor check
  // -------------------------------------------------------------------------

  it('emits show_error ELIMINATED when user is not a survivor', async () => {
    const client = makeMockSocket({ rooms: new Set(['show:test-show']) });

    mockRedis.get
      .mockResolvedValueOnce('live')  // status
      .mockResolvedValueOnce('2')     // current_round
    mockRedis.sismember.mockResolvedValueOnce(0); // NOT a survivor

    await gateway.handleSubmitAnswer(basePayload, client as unknown as Socket);

    expect(client.emit).toHaveBeenCalledWith('show_error', {
      code: 'ELIMINATED',
      message: 'You have been eliminated.',
    });
    expect(mockRedis.hsetnx).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Gate 6: deadline enforcement
  // -------------------------------------------------------------------------

  it('emits show_error ANSWER_LATE when answer arrives after deadline + 200 ms grace', async () => {
    const client = makeMockSocket({ rooms: new Set(['show:test-show']) });

    // Deadline was 1 second ago (well past the 200 ms grace window)
    const deadlineEpoch = Date.now() - 1000;

    mockRedis.get
      .mockResolvedValueOnce('live')              // status
      .mockResolvedValueOnce('2')                 // current_round
      .mockResolvedValueOnce(String(deadlineEpoch)); // deadline
    mockRedis.sismember.mockResolvedValueOnce(1); // is a survivor

    await gateway.handleSubmitAnswer(basePayload, client as unknown as Socket);

    expect(client.emit).toHaveBeenCalledWith('show_error', {
      code: 'ANSWER_LATE',
      message: 'Answer submitted after the round closed.',
    });
    expect(mockRedis.hsetnx).not.toHaveBeenCalled();
  });

  it('allows submission within the 200 ms grace window after deadline', async () => {
    const client = makeMockSocket({ rooms: new Set(['show:test-show']) });

    // Deadline was 100 ms ago — still within the 200 ms grace
    const deadlineEpoch = Date.now() - 100;

    mockRedis.get
      .mockResolvedValueOnce('live')              // status
      .mockResolvedValueOnce('2')                 // current_round
      .mockResolvedValueOnce(String(deadlineEpoch)); // deadline
    mockRedis.sismember.mockResolvedValueOnce(1); // is a survivor
    mockRedis.hsetnx.mockResolvedValueOnce(1);

    await gateway.handleSubmitAnswer(basePayload, client as unknown as Socket);

    expect(client.emit).not.toHaveBeenCalledWith(
      'show_error',
      expect.objectContaining({ code: 'ANSWER_LATE' }),
    );
    expect(mockRedis.hsetnx).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('writes answer to Redis with correct key and JSON structure on happy path', async () => {
    const client = makeMockSocket({ rooms: new Set(['show:test-show']) });

    // No deadline set, is a survivor, status live, round matches
    mockRedis.get
      .mockResolvedValueOnce('live')  // status
      .mockResolvedValueOnce('2')     // current_round
      .mockResolvedValueOnce(null);   // no deadline
    mockRedis.sismember.mockResolvedValueOnce(1); // is a survivor
    mockRedis.hsetnx.mockResolvedValueOnce(1);

    await gateway.handleSubmitAnswer(basePayload, client as unknown as Socket);

    expect(mockRedis.hsetnx).toHaveBeenCalledTimes(1);

    const [key, field, value] = mockRedis.hsetnx.mock.calls[0] as [string, string, string];

    // Key format: show:{showId}:round:{roundIndex}:answers
    expect(key).toBe(`show:test-show:round:2:answers`);
    // Field = userId
    expect(field).toBe('user-1');

    // Value is JSON with answer, serverTs, clientTs
    const parsed = JSON.parse(value) as { answer: unknown; serverTs: number; clientTs: number };
    expect(parsed.answer).toEqual(basePayload.answer);
    expect(typeof parsed.serverTs).toBe('number');
    expect(parsed.clientTs).toBe(basePayload.clientTs);
  });

  it('does not overwrite a pre-existing answer (hsetnx semantics — first write wins)', async () => {
    const client = makeMockSocket({ rooms: new Set(['show:test-show']) });

    mockRedis.get
      .mockResolvedValueOnce('live')
      .mockResolvedValueOnce('2')
      .mockResolvedValueOnce(null);
    mockRedis.sismember.mockResolvedValueOnce(1);
    // hsetnx returns 0 when key already exists — simulates second submission
    mockRedis.hsetnx.mockResolvedValueOnce(0);

    // Should not throw; the call completes without error
    await expect(
      gateway.handleSubmitAnswer(basePayload, client as unknown as Socket),
    ).resolves.toBeUndefined();

    expect(mockRedis.hsetnx).toHaveBeenCalledTimes(1);
  });
});
