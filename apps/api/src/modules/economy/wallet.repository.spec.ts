/**
 * WalletRepository unit tests — creditBatch idempotency.
 *
 * These tests mock Kysely entirely to avoid needing a live DB connection in
 * unit test mode. The ON CONFLICT DO NOTHING semantics are verified by
 * controlling the mock return value from the insertInto chain.
 *
 * For integration tests against a real DB, see test/economy.e2e-spec.ts.
 */

import { WalletRepository, BatchCreditEntry } from './wallet.repository';
import { KYSELY_TOKEN } from '../../database/database.module';
import { Test, TestingModule } from '@nestjs/testing';

// ---------------------------------------------------------------------------
// Kysely mock builder
//
// We need to simulate:
//   trx.insertInto(...).values(...).onConflict(...).returning(...).execute()
//   trx.updateTable(...).set(...).where(...).execute()
//
// The builder pattern returns `this` from every chained call except the
// terminal execute / executeTakeFirst / executeTakeFirstOrThrow.
// ---------------------------------------------------------------------------

function buildKyselyTransactionMock(insertedRows: Array<{ idempotency_key: string }>) {
  const executeMock = jest.fn().mockResolvedValue(insertedRows);
  const updateExecuteMock = jest.fn().mockResolvedValue(undefined);

  // After onConflict(cb).doNothing() we need .returning().execute() to work.
  // Build the "post-conflict" builder first (it is what doNothing() returns).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const postConflictBuilder: any = {
    returning: jest.fn().mockReturnThis(),
    execute: executeMock,
    returningAll: jest.fn().mockReturnThis(),
  };

  // The object passed to the onConflict callback — oc.column(...).doNothing()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conflictOc: any = {
    column: jest.fn().mockReturnValue({
      doNothing: jest.fn().mockReturnValue(postConflictBuilder),
    }),
    columns: jest.fn().mockReturnValue({
      doNothing: jest.fn().mockReturnValue(postConflictBuilder),
    }),
  };

  // insertInto builder — onConflict receives the callback and calls it with conflictOc
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertBuilder: any = {
    values: jest.fn().mockReturnThis(),
    onConflict: jest.fn().mockImplementation((cb: (oc: typeof conflictOc) => unknown) => {
      cb(conflictOc);
      return postConflictBuilder;
    }),
    returning: jest.fn().mockReturnThis(),
    execute: executeMock,
    returningAll: jest.fn().mockReturnThis(),
    executeTakeFirstOrThrow: jest.fn().mockResolvedValue(undefined),
  };

  const updateBuilder = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: updateExecuteMock,
  };

  const trx = {
    insertInto: jest.fn().mockReturnValue(insertBuilder),
    updateTable: jest.fn().mockReturnValue(updateBuilder),
    selectFrom: jest.fn().mockReturnValue({
      selectAll: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      executeTakeFirst: jest.fn().mockResolvedValue(undefined),
      executeTakeFirstOrThrow: jest.fn().mockResolvedValue({
        coin_balance: 100,
        updated_at: new Date(),
      }),
      forUpdate: jest.fn().mockReturnThis(),
    }),
  };

  return { trx, insertBuilder, postConflictBuilder, updateBuilder, executeMock, updateExecuteMock };
}

function buildKyselyMock(insertedRows: Array<{ idempotency_key: string }>) {
  const { trx, ...rest } = buildKyselyTransactionMock(insertedRows);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = {
    transaction: jest.fn().mockReturnValue({
      execute: jest.fn().mockImplementation((fn: (trx: any) => Promise<void>) =>
        fn(trx),
      ),
    }),
  };

  return { db, trx, ...rest };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WalletRepository — creditBatch', () => {
  let repository: WalletRepository;

  async function buildModule(insertedRows: Array<{ idempotency_key: string }>) {
    const { db } = buildKyselyMock(insertedRows);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletRepository,
        { provide: KYSELY_TOKEN, useValue: db },
      ],
    }).compile();

    repository = module.get<WalletRepository>(WalletRepository);
    return db;
  }

  it('returns immediately without DB call when entries array is empty', async () => {
    const db = await buildModule([]);

    await repository.creditBatch('show_winnings', 10, []);

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('inserts all entries and updates balances for fully-new batch', async () => {
    const entries: BatchCreditEntry[] = [
      { userId: 'u1', amount: 500, idempotencyKey: 'show:s1:winner:u1', referenceId: 's1' },
      { userId: 'u2', amount: 500, idempotencyKey: 'show:s1:winner:u2', referenceId: 's1' },
      { userId: 'u3', amount: 500, idempotencyKey: 'show:s1:winner:u3', referenceId: 's1' },
    ];

    // All 3 rows inserted (no conflicts)
    const { db, trx, updateExecuteMock } = buildKyselyMock(
      entries.map((e) => ({ idempotency_key: e.idempotencyKey })),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletRepository,
        { provide: KYSELY_TOKEN, useValue: db },
      ],
    }).compile();

    repository = module.get<WalletRepository>(WalletRepository);

    await repository.creditBatch('show_winnings', 500, entries);

    // insertInto called once for the batch
    expect(trx.insertInto).toHaveBeenCalledWith('coin_transactions');
    // updateTable called once to bump balances for all 3 users
    expect(trx.updateTable).toHaveBeenCalledWith('users');
    expect(updateExecuteMock).toHaveBeenCalled();
  });

  it('skips balance update when all entries are duplicates (inserted = empty)', async () => {
    const entries: BatchCreditEntry[] = [
      { userId: 'u1', amount: 10, idempotencyKey: 'show:s1:elim:0:u1', referenceId: 's1' },
    ];

    // No rows inserted (all conflict/skipped)
    const { db, trx, updateExecuteMock } = buildKyselyMock([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletRepository,
        { provide: KYSELY_TOKEN, useValue: db },
      ],
    }).compile();

    repository = module.get<WalletRepository>(WalletRepository);

    await repository.creditBatch('show_winnings', 10, entries);

    // Insert attempted
    expect(trx.insertInto).toHaveBeenCalled();
    // But updateTable must NOT be called — no balances to update
    expect(trx.updateTable).not.toHaveBeenCalled();
    expect(updateExecuteMock).not.toHaveBeenCalled();
  });

  it('updates balances only for users whose rows were actually inserted (partial conflict)', async () => {
    const entries: BatchCreditEntry[] = [
      { userId: 'u1', amount: 10, idempotencyKey: 'key-u1', referenceId: 's1' },
      { userId: 'u2', amount: 10, idempotencyKey: 'key-u2', referenceId: 's1' },
      { userId: 'u3', amount: 10, idempotencyKey: 'key-u3', referenceId: 's1' },
    ];

    // Only u1 and u3 were inserted; u2's key already existed
    const insertedRows = [
      { idempotency_key: 'key-u1' },
      { idempotency_key: 'key-u3' },
    ];

    const { db, trx } = buildKyselyMock(insertedRows);

    // Capture the where() call to verify only 2 userIds are passed
    const whereArgs: unknown[] = [];
    trx.updateTable.mockReturnValue({
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockImplementation((...args: unknown[]) => {
        whereArgs.push(...args);
        return { execute: jest.fn().mockResolvedValue(undefined) };
      }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletRepository,
        { provide: KYSELY_TOKEN, useValue: db },
      ],
    }).compile();

    repository = module.get<WalletRepository>(WalletRepository);

    await repository.creditBatch('show_winnings', 10, entries);

    // updateTable was called (some rows were inserted)
    expect(trx.updateTable).toHaveBeenCalledWith('users');

    // where() args: ('id', 'in', ['u1', 'u3']) — u2 excluded
    const userIdsArg = whereArgs[2] as string[];
    expect(userIdsArg).toEqual(expect.arrayContaining(['u1', 'u3']));
    expect(userIdsArg).not.toContain('u2');
    expect(userIdsArg).toHaveLength(2);
  });
});
