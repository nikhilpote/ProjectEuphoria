# Security Backlog

Items deferred from the initial security pass. Revisit before scaling beyond early users.

---

## 1. CORS — WebSocket Gateway Wide Open

**File:** `apps/api/src/gateways/show/show.gateway.ts`

**Current:**
```typescript
@WebSocketGateway({
  namespace: '/show',
  cors: { origin: '*' },
})
```

**Risk:** Any website can open a WebSocket connection to the show gateway. If an attacker obtains a valid JWT (e.g. via phishing), they can connect from any origin.

**Fix:** Replace `origin: '*'` with the actual client domains:
```typescript
cors: {
  origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['https://yourapp.com'],
}
```

---

## 2. Show Scheduler — No Redis Lock for Multi-Instance Safety

**File:** `apps/api/src/modules/show/show.scheduler.ts`

**Current:** Uses an in-memory `pendingStarts` Set to prevent double-starting a show. This only works on a single server instance.

**Risk:** If two API instances run simultaneously (which they will with horizontal scaling), both schedulers fire every 10 seconds. Both see the same show in lobby, both attempt `startShow()` — show starts twice, players get duplicate events, timers double-fire.

**Fix:** Replace in-memory Set with a Redis `SET NX EX` lock:
```typescript
const lockKey = `show:${show.id}:start_lock`;
const acquired = await this.redis.set(lockKey, '1', 'NX', 'EX', 30);
if (!acquired) return; // another instance got it
```

---

## 3. WebSocket Message Payload Validation

**File:** `apps/api/src/gateways/show/show.gateway.ts`

**Current:** `submit_answer` and `join_show` payloads are cast directly with no schema validation:
```typescript
const { showId, roundIndex, clientTs, answer } = payload as SubmitAnswerPayload;
```

**Risk:** Malformed payloads (wrong types, missing fields, extra-large strings) could cause unexpected behavior or errors deep in the stack.

**Fix:** Use `class-validator` DTOs on WebSocket message bodies via a `ValidationPipe` bound to the gateway, same as HTTP controllers. Alternatively add a lightweight manual check at the top of each handler.

---

## 4. DB Pool Size Not Set in Environment

**File:** `apps/api/src/database/database.module.ts`

**Current default:** `DATABASE_POOL_MAX = 50` in code.

**Risk:** On production deployments, if the env var is not explicitly set, the default silently applies. If PostgreSQL's `max_connections` is lower than `instances × 50`, connections will be rejected.

**Fix:** Explicitly set `DATABASE_POOL_MAX` in the production `.env` / deployment config based on:
```
DATABASE_POOL_MAX = floor(postgres_max_connections / api_instance_count) - 5
```
Document this formula in the deployment runbook.

---

## Already Closed (for reference)

- Eliminated players re-answering after reconnect — **fixed** (survivor set check)
- Late answer submission — **fixed** (server-side deadline in Redis)
- Answer spam / brute force — **fixed** (500ms cooldown + HSETNX)
- Game logic hardcoded in orchestrator — **fixed** (fails closed, delegates to GameRegistry)
- Video URL exposed in lobby — **fixed** (signed URL sent 60s before start via show_countdown)
- Game questions exposed in lobby — **fixed** (gamePayload always null until round_question)
- show detail endpoint public — **fixed** (JwtAuthGuard + AdminGuard)
- Client-trusted game accuracy values — **fixed** (removed, GameRegistry owns correctness logic)
