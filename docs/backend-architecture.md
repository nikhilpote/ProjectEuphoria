# Euphoria — Backend Architecture Plan (MVP Phase 1)

> Authored: 2026-03-27
> Scope: Backend systems for Live Shows and PlayClips, MVP through Year 5 scale path
> Design target: 0.5M DAU at launch, 20M DAU at Year 5, 1M concurrent during peak shows

---

## Table of Contents

1. [High-Level System Architecture](#1-high-level-system-architecture)
2. [Service Boundaries and Responsibilities](#2-service-boundaries-and-responsibilities)
3. [Technology Recommendations](#3-technology-recommendations)
4. [Data Model Highlights](#4-data-model-highlights)
5. [Real-Time Infrastructure for Live Shows](#5-real-time-infrastructure-for-live-shows)
6. [PlayClips Service Design](#6-playclips-service-design)
7. [Economy and Wallet Service](#7-economy-and-wallet-service)
8. [Anti-Cheat Architecture](#8-anti-cheat-architecture)
9. [API Design](#9-api-design)
10. [Infrastructure and Deployment](#10-infrastructure-and-deployment)

---

## 1. High-Level System Architecture

### Overview

Euphoria's backend is organized around two separate real-time engines with shared supporting services. The Live Show engine is a scheduled, high-fan-out broadcast system. The PlayClips engine is an always-on async matchmaking system. They share Auth, Economy, User Profile, Notification, and Analytics infrastructure.

### System Diagram

```
                          ┌─────────────────────────────────────────────┐
                          │                 Client Layer                  │
                          │         React Native (iOS / Android)          │
                          └────────────┬──────────────┬───────────────────┘
                                       │              │
                              REST/HTTP│        WSS   │(Socket.io)
                                       │              │
                          ┌────────────▼──────────────▼───────────────────┐
                          │                  API Gateway                   │
                          │   (Kong / AWS API GW — auth, rate-limit, TLS) │
                          └──┬──────────┬──────────────┬───────────────────┘
                             │          │              │
              ┌──────────────▼─┐  ┌─────▼────────┐  ┌─▼──────────────────┐
              │  REST API       │  │  Show WS     │  │  Clips WS          │
              │  Service        │  │  Gateway     │  │  Gateway           │
              │  (NestJS)       │  │  (Node.js)   │  │  (Node.js)         │
              └──┬──────────────┘  └─────┬────────┘  └─┬──────────────────┘
                 │                       │              │
    ┌────────────┼───────────────────────┼──────────────┼──────────────────┐
    │            │     Internal Service Mesh (gRPC)     │                  │
    │            │                       │              │                  │
    │  ┌─────────▼──┐  ┌──────────────┐  │  ┌───────────▼────────────┐   │
    │  │  Auth      │  │  Show        │  │  │  Clips                 │   │
    │  │  Service   │  │  Orchestrator│  │  │  Service               │   │
    │  └─────────┬──┘  └──────┬───────┘  │  └───────────┬────────────┘   │
    │            │            │          │              │                  │
    │  ┌─────────▼──┐  ┌──────▼───────┐  │  ┌───────────▼────────────┐   │
    │  │  User/     │  │  Game        │  │  │  Matchmaking           │   │
    │  │  Profile   │  │  Logic       │  │  │  Service               │   │
    │  │  Service   │  │  Workers     │  │  └───────────┬────────────┘   │
    │  └────────────┘  └──────┬───────┘  │              │                  │
    │                         │          │  ┌───────────▼────────────┐   │
    │  ┌──────────────────┐   │          │  │  Feed / Recommendation │   │
    │  │  Economy /       │   │          │  │  Service               │   │
    │  │  Wallet Service  │   │          │  └────────────────────────┘   │
    │  └──────────────────┘   │          │                                │
    │                         │          │                                │
    │  ┌──────────────────┐   │          │                                │
    │  │  Anti-Cheat      │◄──┘──────────┘                               │
    │  │  Service         │                                               │
    │  └──────────────────┘                                               │
    │                                                                     │
    │  ┌──────────────────┐  ┌──────────────┐  ┌────────────────────┐   │
    │  │  Notification    │  │  Analytics   │  │  AI Host           │   │
    │  │  Service         │  │  Pipeline    │  │  Integration       │   │
    │  └──────────────────┘  └──────────────┘  └────────────────────┘   │
    └─────────────────────────────────────────────────────────────────────┘

                         ┌──────────────────────────────────────┐
                         │           Data Layer                  │
                         │                                       │
                         │  PostgreSQL    Redis Cluster          │
                         │  (primary DB)  (session, pub/sub,     │
                         │                leaderboard, wallet)   │
                         │                                       │
                         │  Redis Streams  S3 / CDN               │
                         │  (answer pipe)  (assets, replays)     │
                         │                                       │
                         │  ClickHouse    ElasticSearch          │
                         │  (analytics)   (search, anti-cheat)   │
                         └──────────────────────────────────────┘
```

### Key Architectural Properties

**Separation of concerns between the two engines.** Live Show WebSocket gateways and Clips WebSocket gateways are separate Node.js processes with independent scaling. A high-traffic show cannot starve PlayClips sessions of resources.

**Stateless HTTP services with stateful real-time gateways.** The REST API service is fully stateless and horizontally scalable. Real-time gateways are stateful (socket connections), but all shared state is externalized to Redis — any gateway node can handle any client after reconnect.

**Economy service as a synchronous, serializable bottleneck.** All coin debits go through a single serialized path with optimistic locking. This is intentionally simpler than an eventually-consistent CRDT model; it is easier to audit and harder to exploit. The performance cost is acceptable because coin transactions are low-frequency relative to gameplay events.

**Event-driven audit trail.** Every meaningful state transition (round start, answer submitted, coin deducted, player eliminated) is written to Redis Streams. This decouples anti-cheat, analytics, and notification services from the hot path and provides a complete ordered event log for dispute resolution.

---

## 2. Service Boundaries and Responsibilities

### 2.1 API Gateway

**Responsibility:** TLS termination, JWT validation, rate limiting, request routing, DDoS protection.

**Does NOT own:** Business logic of any kind. Routing decisions are path-based only.

Rate limit tiers:
- Unauthenticated: 20 req/min per IP
- Authenticated (REST): 300 req/min per user
- Show answer submission: 60 req/min per user (further limited by game logic)
- IAP endpoints: 10 req/min per user

### 2.2 Auth Service

**Responsibility:** User registration, login, JWT issuance, refresh token rotation, OAuth social login (Apple, Google), guest account creation and upgrade.

**Key design:** JWTs are short-lived (15 min access, 30-day refresh). The refresh token is stored in the database with device fingerprint binding to detect token theft. Guest accounts are created silently on first app open — users can play immediately and link an identity later. This removes the signup-wall friction.

**Owns:** `users` table (identity only — no game data), refresh token store (Redis with database backup).

### 2.3 User / Profile Service

**Responsibility:** User profiles, display names, avatars, history summaries, friend relationships, statistics aggregation.

**Deliberately separated from Auth Service** to allow independent scaling. Auth is on the critical login path (high QPS); profile reads are less frequent but may involve aggregation queries that benefit from read replicas.

**Owns:** `user_profiles`, `friendships`, `user_stats` tables.

### 2.4 Show Orchestrator

**Responsibility:** The central brain for a live show. Manages show lifecycle — scheduling, lobby countdown, round sequencing, answer collection windows, elimination calculation, result broadcasting, prize distribution.

**Critical constraint:** This service is the single authority for round timing. All clients synchronize clocks against this service. No client-side timing is trusted for answer acceptance.

**Owns:** `shows`, `show_rounds`, `show_player_sessions` tables. Maintains active show state in Redis.

**Scaling model:** One Show Orchestrator process per active show. At MVP (2-3 shows/day) this is trivially manageable. At 24+ daily shows, each show gets its own isolated orchestrator instance (Kubernetes pod), eliminating cross-show interference.

### 2.5 Game Logic Workers

**Responsibility:** Stateless workers that evaluate submitted answers for correctness, calculate scores, and apply anti-cheat rules for each game type.

**Deliberately separated from Show Orchestrator** because answer validation is compute-intensive and game-type-specific. Workers consume from a Redis Stream `show:{showId}:answers` via consumer group `game-logic-workers` and write results directly to Redis. The Orchestrator never does validation inline.

**Owns:** No persistent state. All game definitions (correct answers, scoring rules) are loaded from the database at show start and cached in-process.

### 2.6 Show WebSocket Gateway

**Responsibility:** Maintains WebSocket connections for show participants. Bridges between Socket.io client protocol and the internal event bus (Redis Streams / Redis pub/sub). Translates internal events into client-facing socket messages.

**Does NOT own:** Game state, player state, or business logic. It is a pure message relay with connection management.

**Scaling:** Horizontal. Multiple gateway nodes behind a load balancer with sticky sessions (based on showId for co-location). Redis pub/sub used for cross-node fan-out.

### 2.7 Clips Service

**Responsibility:** PlayClips CRUD, clip metadata, clip asset management, per-clip game payload storage, historical performance stats.

**Owns:** `clips`, `clip_game_payloads`, `clip_performance_stats` tables. Read-heavy; write happens only when a show ends and clips are extracted.

### 2.8 Matchmaking Service

**Responsibility:** Groups PlayClips players into waves (50-200 players per wave). Assigns start timestamps. Tracks wave results. Manages solo-mode fallback (auto-start after 3s if wave is undersized).

**State model:** Wave lifecycle is entirely in Redis (TTL-based). A Redis Streams entry is written when a wave completes for async leaderboard updates.

**Owns:** No durable tables. Wave metadata is ephemeral (Redis, 10-minute TTL after wave completes).

### 2.9 Feed / Recommendation Service

**Responsibility:** Generates the ordered PlayClips feed for each user. Phase 1: game-type preference ranking. Phase 2: difficulty matching. Phase 3: social signals.

**Owns:** `user_clip_interactions` table (for preference model training). Feed generation is cursor-paginated and pre-computed into Redis sorted sets per user (refreshed on interaction).

### 2.10 Economy / Wallet Service

**Responsibility:** Single source of truth for coin balances. Processes all credits (show rewards, PlayClips earnings, daily rewards, IAP) and debits (retries, streak protection, powerups, cosmetics). Idempotent transaction processing.

**Critical design constraint:** All wallet mutations are serialized per user via database-level row locking. No optimistic concurrency — the risk of a negative balance exploit outweighs the latency cost. See Section 7 for full design.

**Owns:** `wallets`, `wallet_transactions` tables.

### 2.11 Clips WebSocket Gateway

**Responsibility:** WebSocket connections for PlayClips sessions. Manages wave join/start/result socket messaging. Separate process from Show WS Gateway to prevent resource contention.

### 2.12 Anti-Cheat Service

**Responsibility:** Async anomaly detection on submitted answers. Consumes from Redis Streams `show:{showId}:answers` and `clips:{clipId}:answers`. Maintains per-user trust scores. Triggers soft flags (monitoring) and hard flags (answer void, account suspension).

**Owns:** `player_trust_scores`, `cheat_flags` tables. Writes anomaly events to ElasticSearch for pattern analysis.

### 2.13 Notification Service

**Responsibility:** Push notification scheduling and delivery (APNs, FCM). Consumes show scheduling events to enqueue show-start notifications. Handles streak reminders, daily reward nudges, and transactional messages.

**Owns:** `notification_preferences`, `scheduled_notifications` tables. Uses a job queue (BullMQ on Redis) for timed delivery.

### 2.14 Analytics Pipeline

**Responsibility:** Consumes from Redis Streams event feeds and writes to ClickHouse for business analytics, retention metrics, funnel analysis, and A/B test evaluation. Does not serve the application runtime — analytics queries never touch the operational database.

### 2.15 AI Host Integration Service

**Responsibility:** Manages pre-generation of HeyGen video segments for each show's host sequences. Stores generated video URLs, triggers ElevenLabs for audio generation, and assembles the final host video manifest that the Show Orchestrator includes in the show manifest payload.

---

## 3. Technology Recommendations

### 3.1 Primary Language: TypeScript / Node.js

**Justification:** The frontend is React Native (TypeScript). Sharing TypeScript types between client and server for socket event payloads, game definitions, and API contracts eliminates an entire class of integration bugs. A shared `@euphoria/types` package defines all socket event interfaces, and any server-side schema change that breaks the client contract fails at compile time, not in production during a live show.

Node.js's event-loop model is well-suited for the WebSocket gateway tier, which is I/O-bound (relaying messages between clients and Redis Streams) rather than CPU-bound. The Game Logic Workers, which are CPU-bound, run as separate processes.

For CPU-intensive workloads (anti-cheat anomaly scoring, recommendation model inference), selectively use Go or Python microservices as the team grows. At MVP, TypeScript everywhere is the right tradeoff for velocity.

### 3.2 HTTP Framework: NestJS

**Justification:** NestJS provides dependency injection, decorators, built-in validation (class-validator), OpenAPI generation, and WebSocket support (socket.io adapter) in a single framework. It enforces architectural patterns (modules, controllers, services) that matter as the team scales from 3 to 30 engineers. The alternative (raw Express) produces inconsistent patterns at team scale.

### 3.3 Primary Database: PostgreSQL 16

**Justification:** PostgreSQL's ACID guarantees are non-negotiable for the Economy service. Row-level locking for wallet serialization, advisory locks for wave claim operations, and full serializable isolation are all available natively. The `LISTEN/NOTIFY` mechanism provides lightweight pub/sub for internal coordination without additional infrastructure.

PostgreSQL's JSONB columns are used for game payload storage (different game types have different schemas) — this avoids EAV hell without requiring a document database for what is fundamentally relational data.

**Scaling path:** Read replicas from MVP (analytics queries, feed generation, leaderboard reads). Horizontal sharding is not needed until well past 10M DAU — PostgreSQL at 5-10TB with proper indexing handles Euphoria's write volume. When sharding becomes necessary, the primary shard key is `user_id`.

**Connection pooling:** PgBouncer in transaction mode sits between all application services and PostgreSQL. Each service is allocated a fixed pool size based on its query profile. This prevents connection exhaustion during show peaks.

### 3.4 Cache and Pub/Sub: Redis 7 (Redis Cluster)

**Justification:** Redis serves four distinct roles in this architecture, all suited to its data model:

1. **Session cache:** Active show state, round state, player session lookup (O(1) hash gets)
2. **Pub/Sub bus:** Cross-node WebSocket fan-out for show broadcasts. Redis pub/sub delivers a message to a show channel and all gateway nodes subscribed to that channel relay it to their connected clients. At 1M concurrent players across 50 gateway nodes, this is the most efficient topology.
3. **Leaderboard:** Sorted sets for real-time leaderboard ranking. `ZADD` + `ZRANK` give O(log N) ranking updates suitable for per-clip and per-show leaderboards.
4. **Wallet optimistic lock coordination:** `SET NX EX` (SET if Not eXists with expiry) for distributed lock acquisition before wallet mutations.

**Redis Cluster** is used from MVP to avoid a single-point-of-failure and to allow horizontal scaling of pub/sub channels. Show channels are hashed to consistent nodes.

### 3.5 Answer Pipeline: Redis Streams

**Justification:** Redis Streams (XADD/XREADGROUP/XACK) provide durable, ordered, consumer-group-based message delivery without any additional infrastructure. Redis is already in the stack for pub/sub, leaderboards, and session state. At MVP scale (~100K concurrent players per show), a Redis Cluster comfortably handles the answer throughput. Kafka would add ~$300/month (MSK) and significant operational complexity with no material benefit at this scale.

The migration path to Kafka is straightforward if needed post-MVP: the producer/consumer interface is nearly identical and the stream key naming convention maps directly to Kafka topic naming.

**Key streams and consumer groups:**

| Stream key | Producers | Consumer group | Consumers |
|---|---|---|---|
| `show:{showId}:answers` | Show WS Gateway (`XADD`) | `game-logic-workers` | Game Logic Workers (`XREADGROUP`) |
| `show:{showId}:events` | Show Orchestrator (`XADD`) | `analytics-consumer` | Analytics Pipeline |
| `clips:{clipId}:answers` | Clips WS Gateway (`XADD`) | `game-logic-workers` | Game Logic Workers, Anti-Cheat |
| `economy:transactions` | Economy Service (`XADD`) | `analytics-consumer` | Analytics Pipeline |

**Answer stream pattern (per show):**

```
# Gateway writes an answer
XADD show:{showId}:answers * userId {userId} answer {answer} roundId {roundId} clientTs {timestamp}

# Consumer group created when show starts
XGROUP CREATE show:{showId}:answers game-logic-workers $ MKSTREAM

# Workers consume and ACK
XREADGROUP GROUP game-logic-workers worker-1 COUNT 100 BLOCK 500 STREAMS show:{showId}:answers >
XACK show:{showId}:answers game-logic-workers {messageId}

# Stream trimmed after show ends (no retention needed)
XTRIM show:{showId}:answers MAXLEN 0
```

**Throughput capacity:** Redis Streams sustain 100K+ writes/second per shard on a c6g.xlarge node. At 100K concurrent players with a 60% answer rate over a 15-second window, peak ingestion is ~4K answers/second — well within a single Redis shard's capacity. Consumer group fan-out to multiple worker pods is built-in.

### 3.6 Analytics Store: ClickHouse

**Justification:** ClickHouse's columnar storage and vectorized query execution handles the analytical query patterns (funnel analysis, retention cohorts, per-show aggregates) orders of magnitude faster than PostgreSQL for read-heavy aggregate queries over billions of events. At 1M+ daily active players each submitting 50-100 events per session, the event volume within 6 months will exhaust any OLTP database for analytics.

ClickHouse is kept strictly separate from the operational database. Application services never query ClickHouse at runtime. Analytics events are written via the Redis Streams analytics consumer.

### 3.7 Object Storage and CDN: AWS S3 + CloudFront

**Justification:** Game assets (Spot the Difference images, Find Items scenes, AI host video segments) are large binary blobs that belong in object storage, not a database. CloudFront's global edge network ensures sub-100ms asset delivery globally — critical for the show manifest preload sequence described in the frontend architecture.

**Asset pipeline:**
- Show creators upload raw assets to S3 via presigned URLs (never through the application server)
- Lambda triggers process uploads: image optimization, WebP conversion, generating multiple resolution variants
- CloudFront distribution serves all client-facing assets with 1-year cache headers on content-hashed URLs

### 3.8 Search and Anti-Cheat Pattern Store: OpenSearch (AWS)

**Justification:** Anti-cheat anomaly detection requires querying complex patterns across millions of answer submission events (e.g., "users who answered 12/12 rounds correctly in under 1 second each, from IP ranges overlapping known bot farms"). OpenSearch's full-text and aggregation capabilities handle these queries without adding load to PostgreSQL.

At MVP, a single OpenSearch domain with 3 nodes is sufficient. It also provides application log aggregation as a secondary benefit.

### 3.9 Infrastructure: AWS (primary), Kubernetes (EKS)

See Section 10 for full infrastructure design.

### Technology Decision Summary

| Component | Choice | Key Reason |
|---|---|---|
| Primary language | TypeScript / Node.js | Shared types with client; I/O bound gateway workloads |
| HTTP framework | NestJS | DI, validation, WebSocket, scales with team |
| Relational DB | PostgreSQL 16 | ACID for wallet; JSONB for game payloads |
| Cache / Pub-Sub | Redis 7 Cluster | Fan-out, leaderboard sorted sets, distributed locks |
| Answer pipeline | Redis Streams | Already in stack; handles MVP scale; zero additional cost |
| Analytics | ClickHouse | Columnar aggregation at billions-of-events scale |
| Object storage | S3 + CloudFront | Asset delivery; CDN edge for global latency |
| Anomaly search | OpenSearch | Pattern queries for anti-cheat across event history |
| Containerization | Kubernetes (EKS) | Horizontal scaling, isolated show instances |

---

## 4. Data Model Highlights

### Design Principles

- `user_id` is UUID v7 (time-ordered) — sortable by creation time, globally unique, safe for shard keys
- All timestamps are stored as `TIMESTAMPTZ` in UTC
- Soft deletes (`deleted_at`) on user-owned records; hard deletes on ephemeral records
- JSONB for polymorphic payloads (game definitions differ by type); strongly typed at application layer
- No ORM at the database layer — raw SQL via a query builder (Kysely) for full control over query plans on hot paths

### Core Entities

#### users (Auth Service)
```sql
users
  id              UUID PRIMARY KEY  -- v7, time-ordered
  phone           TEXT UNIQUE
  email           TEXT UNIQUE
  apple_id        TEXT UNIQUE
  google_id       TEXT UNIQUE
  is_guest        BOOLEAN DEFAULT TRUE
  created_at      TIMESTAMPTZ
  last_active_at  TIMESTAMPTZ
  -- No profile data here. Auth only.
```

#### user_profiles (Profile Service)
```sql
user_profiles
  user_id         UUID PRIMARY KEY REFERENCES users(id)
  display_name    TEXT NOT NULL
  avatar_id       TEXT               -- references cosmetics catalog
  country_code    CHAR(2)
  total_shows_played   INT DEFAULT 0
  total_shows_won      INT DEFAULT 0
  best_show_rank       INT
  all_time_coins_earned BIGINT DEFAULT 0
  updated_at      TIMESTAMPTZ
```

#### shows
```sql
shows
  id              UUID PRIMARY KEY
  title           TEXT
  scheduled_at    TIMESTAMPTZ NOT NULL
  started_at      TIMESTAMPTZ
  ended_at        TIMESTAMPTZ
  status          TEXT -- 'scheduled' | 'lobby' | 'live' | 'completed' | 'cancelled'
  game_sequence   JSONB NOT NULL     -- ordered array of round definitions
  -- Example: [{"round": 1, "game_type": "trivia", "duration_ms": 15000, ...}, ...]
  prize_pool_coins BIGINT DEFAULT 0
  total_entrants  INT DEFAULT 0
  final_survivor_count INT
  ai_host_manifest JSONB             -- HeyGen video URLs per show phase
  created_at      TIMESTAMPTZ
```

#### show_rounds
```sql
show_rounds
  id              UUID PRIMARY KEY
  show_id         UUID REFERENCES shows(id)
  round_number    INT NOT NULL       -- 1-12
  game_type       TEXT NOT NULL      -- 'trivia' | 'spot_difference' | 'quick_math' | ...
  game_payload    JSONB NOT NULL     -- game-type-specific content
  correct_answer  TEXT NOT NULL      -- stored encrypted in DB, decrypted at round start
  duration_ms     INT NOT NULL
  started_at      TIMESTAMPTZ
  ended_at        TIMESTAMPTZ
  player_count_start   INT
  survivor_count       INT
  eliminated_count     INT
  UNIQUE (show_id, round_number)
```

**Note on `correct_answer` encryption:** Answers are AES-256 encrypted at rest with a show-specific key. The decryption key is stored in AWS Secrets Manager and fetched by the Show Orchestrator at show start time. This prevents database read access from revealing answers to anyone with DB credentials.

#### show_player_sessions
```sql
show_player_sessions
  id              UUID PRIMARY KEY
  show_id         UUID REFERENCES shows(id)
  user_id         UUID REFERENCES users(id)
  joined_at       TIMESTAMPTZ
  eliminated_at   TIMESTAMPTZ
  eliminated_round INT
  final_round_reached INT
  retry_count     INT DEFAULT 0
  coins_earned    INT DEFAULT 0
  coins_spent_retries INT DEFAULT 0
  trust_score_snapshot NUMERIC(5,2)  -- anti-cheat score at show end
  UNIQUE (show_id, user_id)
```

#### show_answers
```sql
show_answers
  id              UUID PRIMARY KEY
  show_id         UUID REFERENCES shows(id)
  round_id        UUID REFERENCES show_rounds(id)
  user_id         UUID REFERENCES users(id)
  answer          TEXT NOT NULL
  submitted_at    TIMESTAMPTZ NOT NULL
  client_ts       BIGINT              -- client-side epoch ms (anti-cheat comparison)
  is_correct      BOOLEAN
  response_time_ms INT                -- ms from round_start to submission
  powerup_used    TEXT                -- 'extra_time' | 'reveal' | null
  is_voided       BOOLEAN DEFAULT FALSE  -- anti-cheat void flag

  INDEX (show_id, round_id)           -- query pattern: all answers for a round
  INDEX (user_id, show_id)            -- query pattern: a user's answers in a show
```

**Partitioning:** `show_answers` is partitioned by `show_id` range (monthly show cohorts). Each partition is an independent table segment. Post-show, partitions are compressed and archived to S3-backed Parquet via ClickHouse ingestion.

#### clips
```sql
clips
  id              UUID PRIMARY KEY
  source_show_id  UUID REFERENCES shows(id)
  source_round_id UUID REFERENCES show_rounds(id)
  game_type       TEXT NOT NULL
  game_payload    JSONB NOT NULL
  correct_answer  TEXT NOT NULL       -- not encrypted (no pre-game secrecy needed)
  duration_ms     INT NOT NULL
  thumbnail_url   TEXT
  players_when_live INT               -- display stat: "847K played this"
  total_plays     BIGINT DEFAULT 0
  avg_response_time_ms INT
  correct_rate    NUMERIC(5,4)        -- 0.0-1.0
  difficulty_score NUMERIC(5,2)       -- computed by anti-cheat / ML
  created_at      TIMESTAMPTZ
  is_active       BOOLEAN DEFAULT TRUE

  INDEX (game_type, difficulty_score)   -- feed recommendation queries
  INDEX (source_show_id)
```

#### clip_plays
```sql
clip_plays
  id              UUID PRIMARY KEY
  clip_id         UUID REFERENCES clips(id)
  user_id         UUID REFERENCES users(id)
  wave_id         TEXT               -- ephemeral wave identifier
  answer          TEXT
  is_correct      BOOLEAN
  response_time_ms INT
  coins_earned    INT DEFAULT 0
  streak_at_time  INT                -- user's streak when this was played
  played_at       TIMESTAMPTZ

  INDEX (user_id, played_at DESC)    -- user history queries
  INDEX (clip_id, played_at DESC)    -- clip leaderboard queries
```

#### wallets
```sql
wallets
  user_id         UUID PRIMARY KEY REFERENCES users(id)
  balance         BIGINT NOT NULL DEFAULT 0   -- in coins, never negative
  version         BIGINT NOT NULL DEFAULT 0   -- optimistic lock version
  updated_at      TIMESTAMPTZ

  CONSTRAINT balance_non_negative CHECK (balance >= 0)
```

#### wallet_transactions
```sql
wallet_transactions
  id              UUID PRIMARY KEY
  user_id         UUID REFERENCES users(id)
  amount          BIGINT NOT NULL          -- positive = credit, negative = debit
  type            TEXT NOT NULL
  -- 'show_reward' | 'clip_reward' | 'daily_reward' | 'iap_purchase'
  -- 'retry_cost' | 'streak_protection' | 'powerup' | 'cosmetic'
  reference_id    UUID                     -- show_id, clip_id, iap_receipt_id, etc.
  idempotency_key TEXT UNIQUE NOT NULL     -- prevents double-processing
  balance_before  BIGINT NOT NULL
  balance_after   BIGINT NOT NULL
  created_at      TIMESTAMPTZ NOT NULL

  INDEX (user_id, created_at DESC)
```

#### player_trust_scores
```sql
player_trust_scores
  user_id         UUID PRIMARY KEY REFERENCES users(id)
  score           NUMERIC(5,2) DEFAULT 100.0   -- 0-100, starts at 100
  total_answers   INT DEFAULT 0
  suspicious_answers INT DEFAULT 0
  hard_flags      INT DEFAULT 0
  last_evaluated_at TIMESTAMPTZ
  account_status  TEXT DEFAULT 'normal'
  -- 'normal' | 'monitored' | 'restricted' | 'banned'
  updated_at      TIMESTAMPTZ
```

### Key Relationships

```
users ──────────── user_profiles (1:1)
users ──────────── wallets (1:1)
users ──────────── player_trust_scores (1:1)
shows ──────────── show_rounds (1:many)
shows ──────────── show_player_sessions (1:many, via users)
show_rounds ─────── show_answers (1:many, via users)
show_rounds ─────── clips (1:1, a clip is one round extracted)
clips ──────────── clip_plays (1:many, via users)
wallet_transactions ─ wallets (many:1)
```

---

## 5. Real-Time Infrastructure for Live Shows

### The Core Challenge

A live show with 1M concurrent players, 10-20 second game windows, requires:
1. Broadcasting a round start event to 1M clients within 1-2 seconds
2. Receiving up to ~600K answer submissions in a 10-20s window (not every player answers every round; assume 60% submission rate)
3. Evaluating all answers and calculating eliminations before the next round starts
4. Broadcasting round results to all remaining players

This section describes the architecture to achieve this reliably.

### 5.1 Pre-Show Preparation

**Show manifest pre-computation (T-30 minutes before show):**

The Show Orchestrator builds the complete show manifest 30 minutes before start:
- Fetches and validates all game payloads for all 12 rounds
- Encrypts correct answers with a show-specific AES-256 key stored in Secrets Manager
- Generates CDN-hosted asset URLs for all image-heavy rounds
- Assembles HeyGen AI host video segment URLs from the AI Host Service
- Writes the manifest to Redis with a 2-hour TTL (available for lobby delivery)
- Triggers CloudFront cache warm for all asset URLs

**Player pre-subscription (T-5 minutes):**

When push notification is delivered (T-5 min), the client silently opens a WebSocket connection to the Show WS Gateway and authenticates. This means by show start, all 1M connections are already established — there is no connection surge at T-0.

Gateway nodes create a Redis pub/sub subscription to the show's broadcast channel. All 1M clients are distributed across ~50 gateway pods (20K clients/pod).

### 5.2 Connection Architecture

```
1M players
  │
  ├── 50 Show WS Gateway pods (20K connections each)
  │      │
  │      └── Subscribe to Redis pub/sub channel: show:{showId}
  │
  └── Show Orchestrator (1 instance per show)
         │
         └── Publishes to Redis pub/sub channel: show:{showId}
             → All 50 gateway pods receive the message simultaneously
             → Each pod fans out to its 20K connected clients
```

**Total broadcast latency target:** Orchestrator publishes → all clients receive = under 2 seconds at 1M scale.

**Redis pub/sub throughput:** A single Redis pub/sub channel can deliver ~100K messages/second per node. A broadcast message to 1M clients is one message from the Orchestrator to Redis, then each of the 50 gateway pods handles local fan-out. Redis delivers the message to 50 subscribers (gateway pods), not 1M — this is the key scaling property.

**Socket.io adapter:** `@socket.io/redis-adapter` is used on all gateway pods. This makes Socket.io's room broadcasts (which normally work within a single Node.js process) work across pods via Redis pub/sub. All 1M clients join the room `show:{showId}`, and a single `io.to(showId).emit(event)` from any orchestrator or gateway pod reaches all 1M clients.

### 5.3 Round Lifecycle

```
T-0: Show Orchestrator publishes round_start event
  → Payload: { round, gameType, encryptedPayload, endsAt, serverTime }
  → Redis pub/sub → 50 gateway pods → 1M clients (target: <1.5s delivery)

T+0 to T+15s: Answer submission window
  → Clients submit answers via WebSocket to their connected gateway pod
  → Gateway pod validates JWT, rate-limits, writes to Redis Stream:
    XADD show:{showId}:answers * userId {userId} answer {answer} roundId {roundId} clientTs {ts}
  → Game Logic Workers (XREADGROUP from game-logic-workers consumer group) validate answers,
    write results to Redis hash: answers:{showId}:{roundId}
    XACK show:{showId}:answers game-logic-workers {messageId}
  → Orchestrator reads accumulated evaluated answers from Redis hash

T+15s: Round end (Orchestrator timer)
  → Orchestrator reads all accumulated answers from Redis
  → Calculates eliminations (answer != correct_answer OR no answer submitted)
  → Writes round result to PostgreSQL (async, non-blocking)
  → Publishes round_result event to Redis pub/sub → all clients
  → Clears answers hash from Redis

T+17s (2s buffer): Pre-load next round
  → Orchestrator sends a preview hint to clients ("next game: trivia")
  → Clients preload assets for next round (already done via manifest, but re-confirm)

T+20s: Next round starts
```

### 5.4 Answer Submission Pipeline

```
Client ──── WS ──── Gateway Pod
                        │
                        ├── Validate: JWT, session in Redis, round still open
                        ├── Dedup: SETNX Redis key answers:dedup:{userId}:{roundId}
                        │   (prevents double-submission across reconnects)
                        └── XADD show:{showId}:answers * userId {userId} answer {answer} ...
                                │
                                ├── Game Logic Worker (XREADGROUP, stateless, scalable)
                                │     ├── Fetch round definition from Redis
                                │     ├── Validate answer (game-type-specific logic)
                                │     ├── Calculate response_time_ms
                                │     ├── Write result to Redis hash: answers:{showId}:{roundId}
                                │     └── XACK show:{showId}:answers game-logic-workers {msgId}
                                │
                                └── Anti-Cheat Service (XREADGROUP, async, non-blocking)
                                      ├── Response time anomaly check
                                      ├── Device fingerprint cross-reference
                                      └── Trust score update
```

**Deduplication strategy:** The `SETNX answers:dedup:{userId}:{roundId}` operation in Redis (TTL: 60s) ensures that even if a client submits the same answer multiple times due to network retries, only the first submission is written to the stream. The Orchestrator never sees duplicate answers.

**Gateway pod answer acknowledgement:** The gateway pod responds to the client's socket emit with an ack immediately upon successful XADD to the stream (not upon evaluation). The ack confirms receipt. The round result broadcast later confirms whether the answer was correct.

### 5.5 Elimination Calculation at Scale

At round end, the Show Orchestrator must calculate which players are eliminated. With 1M players in round 1:

- Orchestrator reads a Redis hash `answers:{showId}:{roundId}` containing all validated answers (~600K entries assuming 60% answer rate)
- Players with no entry in the hash are automatically eliminated (no answer = wrong)
- Players with incorrect answers are eliminated
- This is a set difference operation: `{all active players} - {players with correct answers}`

**Active player tracking:** Redis set `active_players:{showId}` (SADD on join, SREM on eliminate). At 1M players this set uses ~50MB in Redis — acceptable.

**Elimination batch write:** The resulting eliminated player IDs are written to PostgreSQL as a bulk INSERT in a single transaction (batch size: 10K rows, executed in parallel batches). Using `COPY` for bulk writes where possible.

**Progressive elimination expected curve:**
- Round 1: ~1M players → ~400K survive (40% correct)
- Round 6: ~50K players → ~30K survive
- Round 12: ~5-50K final survivors

The set operations scale linearly and the peak work is at round 1 — subsequent rounds process progressively fewer players.

### 5.6 Show State in Redis

```
show:{showId}:state         HASH  { status, currentRound, startedAt }
show:{showId}:active_players  SET   { userId, userId, ... }
show:{showId}:player_count    STRING  "1000000"          (updated every 500ms)
answers:{showId}:{roundId}    HASH  { userId: answer, ... }
answers:dedup:{userId}:{roundId}  STRING (SETNX, TTL 60s)
show:{showId}:manifest        STRING  (JSON, set at T-30min)
```

**Redis memory estimate at 1M concurrent:**
- Active players SET: ~50MB (UUID strings, ~50 bytes each)
- Answers hash (peak round 1): ~60MB (~600K answer entries)
- Total per show: ~120MB — well within a Redis Cluster node's capacity

### 5.7 Player Reconnection

When a player reconnects mid-show:

```
Client emits: show:rejoin { showId, lastKnownRound }

Gateway pod:
  1. Validates JWT
  2. Checks Redis: is player in active_players set? (still alive?)
  3. Gets current show state from Redis
  4. Responds with show:state_sync {
       currentRound, phase, roundPayload (if round active),
       roundEndsAt, playerCount, survivorCount,
       isEliminated: false/true
     }
```

The reconnecting client re-renders the correct game state without any show restart. If the player was eliminated while disconnected, `isEliminated: true` is returned and the client renders the elimination screen.

---

## 6. PlayClips Service Design

### 6.1 Clip Lifecycle

**Clip creation (post-show):**

After a show completes, a background job (triggered by the Show Orchestrator writing a `show.completed` entry to the `show:{showId}:events` Redis Stream) extracts each of the 12 rounds as individual clips:

```
Show completes
  → Redis Stream: XADD show:{showId}:events * type show.completed
  → Clip Extractor Job (XREADGROUP consumer):
      - For each show_round: create clip record in DB
      - Copy game payload (no re-encryption needed — clips are already-played)
      - Set players_when_live from show_round.player_count_start
      - Compute initial difficulty_score from correct_rate
      - Set is_active = true
```

**Clip moderation:** A moderation queue reviews AI-host video segments and game content before clips go live. At MVP, moderation is manual with a 4-hour SLA. Content is staged to `is_active = false` until approved.

### 6.2 Matchmaking Service

**Wave formation:**

When a player opens a clip, the Clips WS Gateway calls the Matchmaking Service:

```
POST /internal/waves/join
  { clipId, userId, joinedAt }

Response:
  { waveId, startAt, position }
```

Matchmaking uses a Redis sorted set `wave_queue:{clipId}` where the score is join timestamp. Every 500ms, a wave formation job:

1. Reads all users in `wave_queue:{clipId}`
2. If count >= 10: form a wave (up to 200 players), assign waveId, set startAt = now + 2s
3. If count < 10 but oldest entry is > 3s old: form a solo/small wave (1-9 players), startAt = now + 1s
4. All assigned players are moved from queue to `wave:{waveId}:players`
5. Wave state stored in Redis: `wave:{waveId}:state` { clipId, startAt, endAt, status }

**Wave result collection:**

```
wave:{waveId}:answers   HASH { userId: {answer, responseTimeMs, submittedAt} }
```

When wave `endAt` passes, the Matchmaking Service:
1. Reads all answers from Redis
2. Scores each answer (correct/incorrect + speed bonus)
3. Writes `XADD clips:waves:events * type wave.completed waveId {waveId}` to Redis Streams
4. Clips WS Gateway fans out `clips:wave_result` to all connected players in the wave
5. Economy Service consumes from `clips:waves:events` stream (XREADGROUP) to award coins (streaks applied)

**Wave cleanup:** All wave Redis keys have a 10-minute TTL. Wave results are persisted to `clip_plays` table by the stream consumer before TTL expiry.

### 6.3 Feed / Recommendation Service

**Phase 1 (MVP): Game-type preference ranking**

Each user has a preference vector in Redis:

```
user:{userId}:game_prefs   HASH {
  trivia: 0.4,
  spot_difference: 0.2,
  quick_math: 0.3,
  spelling_bee: 0.1,
  ...
}
```

Updated after each `clip_plays` record:
- If played (even incorrectly): slight preference increase for that game type
- If skipped without answering: slight preference decrease

**Feed generation:**

```sql
-- Simplified feed query (executed at session start, results cached in Redis)
SELECT c.id, c.game_type, c.difficulty_score, c.total_plays, ...
FROM clips c
WHERE c.is_active = true
  AND c.id NOT IN (
    SELECT clip_id FROM clip_plays
    WHERE user_id = $userId
    AND played_at > NOW() - INTERVAL '30 days'
  )
ORDER BY (
  user_game_pref_score(c.game_type, $userId)  * 0.4 +
  CASE WHEN ABS(c.difficulty_score - $userAvgDifficulty) < 0.2 THEN 1.0 ELSE 0.5 END * 0.3 +
  freshness_score(c.created_at) * 0.2 +
  popularity_score(c.total_plays) * 0.1
) DESC
LIMIT 50
```

The 50-clip result is serialized to Redis as `feed:{userId}:cursor:{cursor}` with a 15-minute TTL. The client's cursor-paginated feed requests hit Redis first, PostgreSQL only on cache miss or TTL expiry.

**Phase 2 (6 months post-launch): Difficulty matching** — track user's rolling correct rate over last 100 plays and match clips within ±0.15 difficulty score. Update difficulty_score on clips weekly using actual play data.

**Phase 3 (Year 2): Social signals** — boost clips played by friends, clips trending in the user's country. Requires friend graph materialization.

### 6.4 Streak Management

**Streak state:** Lives in Redis (`user:{userId}:streak`) and is durably mirrored to PostgreSQL `user_profiles` on every change. Redis is the authoritative real-time source; PostgreSQL is the backup.

```
user:{userId}:streak  HASH {
  count: 12,
  multiplier: "2x",
  protection_active: false,
  last_played_clip_id: "...",
  session_started_at: 1743082800
}
```

**Streak rules:**
- Streak increments on each correct answer within a PlayClips session
- A session is defined as continuous play (no gap > 10 minutes between clips)
- Incorrect answer: streak breaks UNLESS `protection_active = true`
- Streak protection: consumed on first break (one-time shield), then cleared
- Streak multiplier tiers: 0-4 (1x), 5-9 (1.5x), 10-14 (2x), 15+ (3x)

**Session boundary:** The Clips WS Gateway tracks last activity timestamp per user. A `session_check` job runs every 60 seconds — any user with last activity > 10 minutes ago has their session closed and streak reset to 0 (unless protection active, which cannot stop a session timeout break by design).

**Coin calculation:**
```
coins_earned = base_reward * multiplier
base_reward = max(1, floor(10 / clip.difficulty_score))  -- harder clips = more base coins
```

---

## 7. Economy and Wallet Service

### 7.1 Design Principles

The wallet service is the highest-trust component in the system. The design priorities in order are: **correctness**, **auditability**, **idempotency**, **performance**. Performance optimizations that sacrifice correctness are not acceptable.

**Why not eventually consistent?** Euphoria's economy has real money behind it (IAP purchases). An eventually consistent wallet could momentarily allow a user to spend coins they have already spent (if a debit is queued but not yet applied). Even brief windows of negative-balance exploitation are unacceptable. PostgreSQL row-level locking on `wallets.user_id` provides the serialization guarantee with a transaction latency of 2-5ms — acceptable.

### 7.2 Wallet Transaction Processing

**All wallet mutations follow the same pattern:**

```typescript
// Economy Service - wallet mutation (TypeScript pseudocode)
async function processTransaction(
  userId: UUID,
  amount: bigint,            // positive = credit, negative = debit
  type: TransactionType,
  referenceId: UUID,
  idempotencyKey: string     // caller-generated, prevents double-processing
): Promise<WalletTransaction> {

  return await db.transaction(async (trx) => {
    // 1. Idempotency check — if already processed, return existing result
    const existing = await trx
      .selectFrom('wallet_transactions')
      .where('idempotency_key', '=', idempotencyKey)
      .selectAll()
      .executeTakeFirst();
    if (existing) return existing;

    // 2. Lock the wallet row (FOR UPDATE — blocks concurrent mutations)
    const wallet = await trx
      .selectFrom('wallets')
      .where('user_id', '=', userId)
      .selectAll()
      .forUpdate()           // row-level exclusive lock
      .executeTakeFirstOrThrow();

    // 3. Validate balance for debits
    const newBalance = wallet.balance + amount;
    if (newBalance < 0n) {
      throw new InsufficientFundsError(wallet.balance, -amount);
    }

    // 4. Update wallet balance
    await trx
      .updateTable('wallets')
      .set({ balance: newBalance, updated_at: new Date() })
      .where('user_id', '=', userId)
      .execute();

    // 5. Write immutable transaction record
    const tx = await trx
      .insertInto('wallet_transactions')
      .values({
        id: uuidv7(),
        user_id: userId,
        amount,
        type,
        reference_id: referenceId,
        idempotency_key: idempotencyKey,
        balance_before: wallet.balance,
        balance_after: newBalance,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return tx;
  });
}
```

**Idempotency key construction by caller:**
- Show reward: `show_reward:{showId}:{userId}:{roundNumber}`
- Clip reward: `clip_reward:{clipId}:{waveId}:{userId}`
- IAP: `iap:{appStoreReceiptId}`
- Retry purchase: `retry:{showId}:{userId}:{retryAttemptNumber}`

If a network error causes a client to retry a coin deduction, the idempotency check ensures the deduction happens exactly once regardless of retry count.

### 7.3 IAP Processing

**Flow:**

```
Client purchases coins via App Store / Google Play
  → Client receives purchase receipt
  → Client calls REST API: POST /economy/iap/validate
      { platform: 'ios' | 'android', receipt, productId, idempotencyKey }

Server (Economy Service):
  1. Validates receipt with Apple/Google server-to-server API
  2. Confirms productId matches expected coin package
  3. Calls processTransaction(userId, coinsForProduct, 'iap_purchase', receiptId, idempotencyKey)
  4. Returns { success: true, newBalance }
```

**IAP receipt validation is synchronous** — the client waits for server confirmation before showing coins. Never trust client-reported purchase completion.

**IAP catalog (coin packages):**

| Product ID | Price | Coins | Bonus |
|---|---|---|---|
| `coins_100` | $0.99 | 100 | — |
| `coins_500` | $4.99 | 500 | 50 bonus |
| `coins_1200` | $9.99 | 1200 | 200 bonus |
| `coins_2600` | $19.99 | 2600 | 600 bonus |
| `coins_7000` | $49.99 | 7000 | 2000 bonus |
| `coins_15000` | $99.99 | 15000 | 5000 bonus |

Coin package definitions live in the database (not hard-coded) to allow price changes without a server deploy.

### 7.4 Retry Pricing (Show)

Progressive retry cost prevents unlimited retries from devaluing show competition:

| Retry # | Cost (Coins) | Notes |
|---|---|---|
| 1st | 50 | Entry-level cost |
| 2nd | 150 | 3x scaling |
| 3rd | 400 | |
| 4th+ | Not available | 3 retries maximum per show |

Retry count is tracked in `show_player_sessions.retry_count`. The Show Orchestrator enforces the maximum — the Economy Service only enforces the balance check.

### 7.5 Daily Reward System

Daily rewards are computed server-side, not client-side. The reward calendar is a deterministic function of the user's consecutive login streak:

```typescript
function getDailyReward(loginStreak: number): number {
  const base = 10;
  const streakBonus = Math.floor(loginStreak / 7) * 20;  // +20 every 7 days
  const dayBonus = (loginStreak % 7) * 5;                // +5 each day
  return Math.min(base + streakBonus + dayBonus, 200);   // cap at 200
}
```

Daily reward is claimed via `POST /economy/daily-reward/claim` with an idempotency key of `daily_reward:{userId}:{ISODateUTC}`. Claiming twice on the same UTC day returns the existing transaction record.

---

## 8. Anti-Cheat Architecture

### 8.1 Threat Model

The primary threats in Euphoria's economy:

1. **Scripted answer bots:** Automated clients that submit answers faster than human reaction time
2. **Answer sharing networks:** Groups of players communicating answers in real-time via side channels
3. **Client-side manipulation:** Tampered clients that submit answers after seeing the correct answer revealed
4. **IAP fraud:** Receipt replay attacks to duplicate coin credits
5. **Wallet exploitation:** Race conditions or API abuse to obtain negative-balance exploits

Each threat has a different mitigation:

| Threat | Primary Mitigation | Secondary Mitigation |
|---|---|---|
| Answer bots | Response time anomaly detection | Device fingerprint clustering |
| Answer sharing | Statistical accuracy analysis per user cohort | Progressive trust scoring |
| Client manipulation | Server-side answer authority (client never sees correct answer until reveal) | Answer encrypted at rest, decrypted at round start only |
| IAP fraud | Server-to-server receipt validation | Idempotency keys on all IAP transactions |
| Wallet exploitation | Row-level locking, balance constraint | Full transaction audit log |

### 8.2 Server-Side Answer Authority

This is the most important anti-cheat property. **The correct answer is never in the client's hands until after the submission window closes.**

Show manifest flow:
```
Show Orchestrator → Show manifest contains:
  - Game payloads (question text, images, options) ✓ VISIBLE to client
  - Correct answers: AES-256 ENCRYPTED ✗ NOT visible to client

At round start + duration_ms (round end):
  - Orchestrator publishes correct_answer in plaintext in round_result event
  - This is after the submission window has closed
```

For Trivia: the option labels (A/B/C/D) are shuffled per-user using a seeded random with `userId + roundId` as the seed. Even if correct answer is leaked (e.g., via answer sharing), users need to know which option maps to the correct answer for their specific shuffle.

### 8.3 Response Time Anomaly Detection

The Anti-Cheat Service consumes from `show:{showId}:answers` (via its own `XREADGROUP` consumer group) and flags anomalous response times:

**Human reaction time baseline (from game type):**
| Game Type | Minimum Human RT | Suspicious Threshold |
|---|---|---|
| Trivia | 500ms | < 300ms |
| Spot the Difference | 1000ms | < 600ms |
| Quick Math | 300ms | < 200ms |
| Spelling Bee | 2000ms | < 1000ms |
| Fruit Cutting | 1500ms | < 800ms |
| Knife at Center | 500ms | < 250ms |
| Find Items | 2000ms | < 800ms |

A single response below threshold is a soft flag (score -2). Consistent sub-threshold responses across a show are a hard flag (score -20, answer voiding triggered).

**Response time calculation uses server-side timestamps only:**
```
response_time_ms = answer.submitted_at (server receipt time) - round.started_at
```

Client-reported `client_ts` is stored for comparison but never used as the authoritative timestamp. If `client_ts` differs from server receipt time by more than 5 seconds in either direction, it is flagged as clock manipulation.

### 8.4 Statistical Accuracy Analysis

For each show, the Anti-Cheat Service computes the expected accuracy rate per round (based on historical aggregate data for that game type and question). Players whose accuracy profile significantly exceeds the population are flagged for review:

```
expected_accuracy_rate = historical_correct_rate for similar questions
user_accuracy_rate = user's correct_rate over the show

z_score = (user_accuracy_rate - expected_accuracy_rate) / population_std_dev
if z_score > 3.0: soft flag (monitoring)
if z_score > 5.0 AND response_time_avg < threshold: hard flag
```

This catches answer-sharing networks: a group submitting identical answers faster than human-possible time will all cluster in the same statistical anomaly band.

### 8.5 Trust Score System

Every user starts with a trust score of 100.0. The score gates actions:

| Score Range | Status | Actions |
|---|---|---|
| 80-100 | Normal | All features available |
| 60-79 | Monitored | All features, enhanced logging, answers held 500ms before commit |
| 40-59 | Restricted | Cannot participate in shows, PlayClips only |
| 0-39 | Banned | Account suspended, pending manual review |

Trust score adjustments:
- Correct answer in < min human RT: -5
- Consistent accuracy 3+ std deviations above population: -10
- IAP fraud detected: -50 (immediate ban threshold)
- 10 clean shows with no anomalies: +2 (max 100)
- Manual review cleared: +20

Trust score changes are written synchronously to PostgreSQL and also written to the analytics Redis Stream for downstream consumption.

### 8.6 Device Fingerprinting

At app registration, the client collects a device fingerprint (hardware identifiers, screen metrics, installed fonts, GPU renderer string) and sends it to the Auth Service. The fingerprint is hashed server-side and stored on the user record.

Multiple active accounts sharing a device fingerprint are soft-flagged. The same fingerprint across more than 5 accounts within a month triggers a hard review flag.

### 8.7 Anti-Cheat for PlayClips

PlayClips anti-cheat is lighter than Live Shows (lower stakes):

- Response time thresholds apply identically
- No statistical population analysis per-wave (wave sizes too small for significance)
- Trust score changes from PlayClips carry 50% of the weight of show changes
- A user at "Restricted" status can still play PlayClips but cannot earn coins (streak multiplier locked at 0x)

---

## 9. API Design

### 9.1 REST vs WebSocket Decision Matrix

| Use Case | Protocol | Reason |
|---|---|---|
| Authentication (login, register, refresh) | REST | Request-response, not real-time |
| User profile reads and updates | REST | Infrequent, cacheable |
| Show schedule listing | REST | Cacheable, low update frequency |
| PlayClips feed pagination | REST | Cursor-paginated, cacheable |
| Leaderboard reads (post-show, per-clip) | REST | Request-response, cacheable |
| IAP validation | REST | Synchronous, critical path |
| Economy balance read | REST | Point-in-time query |
| Daily reward claim | REST | Single request-response |
| **Live show game events** | **WebSocket** | Bi-directional, sub-second latency required |
| **PlayClips wave coordination** | **WebSocket** | Synchronized start, real-time result |
| **Player count updates** | **WebSocket** | High-frequency push during lobby |
| Show join / lobby entry | REST (then WS upgrade) | Initial join via REST, then WebSocket for events |

### 9.2 REST API Conventions

**Base URL:** `https://api.euphoria.gg/v1`

**Authentication:** Bearer JWT in Authorization header on all authenticated endpoints.

**Response envelope:**

All REST responses follow a consistent envelope:

```json
{
  "data": { ... },          // present on success
  "error": null,            // present on error: { "code": "INSUFFICIENT_FUNDS", "message": "..." }
  "meta": {                 // present when relevant
    "cursor": "...",
    "hasMore": true,
    "total": 1000
  }
}
```

**Error codes** are machine-readable constants (never raw HTTP status text):

```
UNAUTHORIZED            → 401
FORBIDDEN               → 403
NOT_FOUND               → 404
RATE_LIMITED            → 429
INSUFFICIENT_FUNDS      → 422  (wallet)
SHOW_ALREADY_STARTED    → 422
RETRY_LIMIT_REACHED     → 422
IAP_RECEIPT_INVALID     → 422
INTERNAL_ERROR          → 500
```

**Pagination:** Cursor-based for all lists. No offset-based pagination (avoids duplicates on high-insert-rate tables).

```json
GET /v1/clips/feed?cursor=eyJpZCI6ImFiYyIsInNjb3JlIjowLjh9&limit=20

{
  "data": [ ... ],
  "meta": { "cursor": "eyJpZCI6InhtLi4uIn0=", "hasMore": true }
}
```

### 9.3 Key REST Endpoints

```
Auth
  POST   /v1/auth/register          Create account (phone/email/social)
  POST   /v1/auth/login
  POST   /v1/auth/refresh           Refresh access token
  POST   /v1/auth/guest             Create guest account (no credentials required)
  DELETE /v1/auth/session           Logout

User
  GET    /v1/users/me               Current user profile + balance
  PATCH  /v1/users/me               Update display name, avatar
  GET    /v1/users/:userId          Public profile

Shows
  GET    /v1/shows                  Upcoming and recent shows
  GET    /v1/shows/:showId          Show detail + game sequence (no answers)
  POST   /v1/shows/:showId/join     Join show lobby (returns WS token)
  GET    /v1/shows/:showId/results  Post-show results and leaderboard
  GET    /v1/shows/:showId/replay   Highlight reel URL

Clips
  GET    /v1/clips/feed             Personalized feed (cursor paginated)
  GET    /v1/clips/:clipId          Clip detail
  GET    /v1/clips/:clipId/leaderboard  Per-clip top scores

Economy
  GET    /v1/economy/balance        Current coin balance
  GET    /v1/economy/transactions   Transaction history (cursor paginated)
  POST   /v1/economy/iap/validate   Validate and apply IAP purchase
  POST   /v1/economy/daily-reward/claim  Claim daily reward
  GET    /v1/economy/daily-reward/status  Check if claimed today + next reward info

Catalog (for shop)
  GET    /v1/catalog/coin-packages  Available IAP coin packages
  GET    /v1/catalog/powerups       Available powerup items + coin prices
  GET    /v1/catalog/cosmetics      Available cosmetic items
  POST   /v1/catalog/purchase       Purchase catalog item with coins
```

### 9.4 WebSocket Event Contract

This section defines the server-authoritative socket events. The client-side frontend architecture doc describes how the client handles these; this section defines what the backend emits and accepts.

**Show WebSocket (namespace: /show)**

Connection: `wss://ws.euphoria.gg/show?token={wsToken}&showId={showId}`
The `wsToken` is a short-lived (5 min) token returned by `POST /v1/shows/:showId/join`.

**Server → Client events:**

```typescript
// Broadcast to all players in show room
'show:lobby_update'   { playerCount: number; hostVideoTimestamp: number }
'show:round_start'    {
  round: number;
  gameType: GameType;
  payload: EncryptedRoundPayload;   // encrypted JSON, game assets
  startsAt: number;                 // server epoch ms
  endsAt: number;                   // server epoch ms
  serverTime: number;               // server's current epoch ms (for clock sync)
}
'show:round_result'   {
  correctAnswer: string;
  survivorCount: number;
  eliminatedCount: number;
  myResult: 'correct' | 'incorrect' | 'no_answer';
}
'show:player_eliminated' {
  retryAvailable: boolean;
  retryCostCoins: number;
  retryNumber: number;              // 1, 2, or 3
}
'show:round_end_soon' { secondsRemaining: 3 }
'show:show_complete'  {
  winnersCount: number;
  prizePerWinner: number;
  highlightReelUrl: string;
}
'show:player_count'   { count: number }  // 500ms cadence during lobby
'show:state_sync'     { ... }           // full state for reconnection (see Section 5.7)
```

**Client → Server events:**

```typescript
'show:answer_submit'  { roundId: string; answer: string; clientTimestamp: number }
  → ack: { received: true; serverTimestamp: number }
      | { received: false; reason: 'round_closed' | 'already_submitted' | 'not_in_show' }

'show:request_retry'  { showId: string; roundId: string }
  → ack: { approved: true; coinsDeducted: number; newBalance: number }
      | { approved: false; reason: 'insufficient_funds' | 'retry_limit' | 'round_mismatch' }

'show:spectate'       { showId: string }
  → ack: { ok: true }

'ping_time'           {}
  → ack: number  // server epoch ms (for clock sync)
```

**Clips WebSocket (namespace: /clips)**

Connection: `wss://ws.euphoria.gg/clips?token={accessJwt}`

```typescript
// Client → Server
'clips:join_clip'    { clipId: string }
  → ack: { waveId: string; startAt: number; participantCount: number }

'clips:answer_submit' { clipId: string; waveId: string; answer: string; clientTimestamp: number }
  → ack: { received: true }

// Server → Client
'clips:wave_ready'   { waveId: string; startAt: number; participantCount: number }
'clips:wave_result'  {
  correctAnswer: string;
  myResult: 'correct' | 'incorrect';
  myScore: number;
  coinsEarned: number;
  newBalance: number;
  streakCount: number;
  streakMultiplier: number;
  leaderboard: Array<{ rank: number; displayName: string; score: number; responseTimeMs: number }>;
}
'clips:streak_update' { streakCount: number; multiplier: number; protectionActive: boolean }
```

### 9.5 Internal gRPC APIs

Services communicate internally via gRPC (not REST) for latency and strong typing:

```protobuf
// economy.proto
service EconomyService {
  rpc GetBalance (GetBalanceRequest) returns (BalanceResponse);
  rpc ProcessTransaction (TransactionRequest) returns (TransactionResponse);
  rpc ValidateIAP (ValidateIAPRequest) returns (ValidateIAPResponse);
}

// auth.proto
service AuthService {
  rpc ValidateToken (ValidateTokenRequest) returns (ValidateTokenResponse);
  rpc GetUserContext (GetUserContextRequest) returns (UserContextResponse);
}

// anticheat.proto
service AntiCheatService {
  rpc GetTrustScore (GetTrustScoreRequest) returns (TrustScoreResponse);
  rpc CheckRestricted (CheckRestrictedRequest) returns (RestrictionResponse);
}
```

gRPC is used only for synchronous service-to-service calls where the caller needs a response. Asynchronous coordination uses Redis Streams.

---

## 10. Infrastructure and Deployment

### 10.1 Cloud Provider: AWS

AWS is chosen for its breadth of managed services that reduce operational overhead at MVP scale. Key services in use:

- **EKS** (Elastic Kubernetes Service): Container orchestration
- **RDS PostgreSQL** (Multi-AZ): Managed database with automated failover
- **ElastiCache Redis** (Cluster Mode): Managed Redis with automatic sharding
- **ElastiCache Redis Streams** (answer pipeline and event fan-out, built on existing Redis Cluster)
- **S3 + CloudFront**: Asset storage and global CDN
- **OpenSearch Service**: Managed OpenSearch for anti-cheat and logging
- **ECR** (Elastic Container Registry): Container image storage
- **Secrets Manager**: API keys, encryption keys, database credentials
- **SQS** (for Notification Service dead-letter queues)
- **SNS** (for mobile push fan-out via APNs/FCM)

### 10.2 Kubernetes Architecture

**Cluster topology (MVP):**

```
EKS Cluster: us-east-1 (primary)
  Node pools:
    general-purpose:  m6i.xlarge × 6    (REST API, Auth, Profile, etc.)
    websocket:        c6i.2xlarge × 8   (Show WS Gateway, Clips WS Gateway)
    show-orchestrator: c6i.4xlarge × 2  (Show Orchestrator — CPU/memory intensive)
    workers:          c6i.xlarge × 4    (Game Logic Workers)

EKS Cluster: eu-west-1 (secondary, read-replica routing for EU users)
```

**Pod scaling:**

```yaml
# Show WS Gateway — scales on connected client count
HorizontalPodAutoscaler:
  minReplicas: 4
  maxReplicas: 60
  metrics:
    - type: External
      external:
        metric:
          name: websocket_connections_per_pod
        target:
          type: AverageValue
          averageValue: "25000"   # scale up when avg pod reaches 25K connections

# REST API — scales on RPS
HorizontalPodAutoscaler:
  minReplicas: 3
  maxReplicas: 30
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
```

**Show Orchestrator isolation:** Each active show runs in its own Kubernetes namespace with dedicated CPU/memory limits. Pod anti-affinity rules prevent two show orchestrators from landing on the same node. This ensures a buggy show cannot OOM-kill another show's orchestrator.

### 10.3 Database Infrastructure

**PostgreSQL (RDS):**

```
MVP:
  Primary: db.r6g.2xlarge (8 vCPU, 64GB RAM) — Multi-AZ
  Read replica × 2: db.r6g.xlarge — for analytics queries, feed generation
  PgBouncer: deployed as a DaemonSet alongside application pods

Year 2+:
  Primary: db.r6g.4xlarge
  Read replicas × 4
  Consider Aurora PostgreSQL (auto-scaling storage, faster failover)
```

**Connection pool sizing:** Each application service gets a named PgBouncer pool:
- Economy Service: 20 connections (serialized wallet ops are slow)
- Show Orchestrator: 10 connections per show (round writes are batched)
- REST API: 50 connections (high request volume, short transactions)
- Analytics reads: 5 connections (low priority, read replica only)

**Redis (ElastiCache Cluster Mode):**

```
MVP: 3 shards × 2 nodes (primary + replica per shard) = 6 nodes, r6g.large
   → ~18GB usable memory across cluster
   → Handles 1M+ concurrent show connections comfortably

Year 2+: Scale to 6 shards × 2 nodes as pub/sub channel count grows
```

### 10.4 Network Architecture

```
Internet → AWS WAF → CloudFront (edge)
                          │
              ┌───────────┴───────────┐
              │                       │
          /api/*                  /ws/*
         (REST)               (WebSocket)
              │                       │
     Application Load Balancer   Network Load Balancer
     (HTTP/HTTPS)                (TCP, lower latency)
              │                       │
         EKS: REST pods          EKS: WS Gateway pods
```

The Network Load Balancer (NLB) is used for WebSocket traffic because it operates at Layer 4 (TCP), providing lower latency and better connection persistence than ALB for long-lived WebSocket connections. The ALB (Layer 7) is used for REST traffic where HTTP routing and SSL offload are beneficial.

**WebSocket sticky sessions:** NLB with target group stickiness based on client IP + port hash. This is a best-effort hint — the application is designed to function correctly without sticky sessions (state is in Redis, not in-process).

### 10.5 Deployment Strategy

**CI/CD:** GitHub Actions → build Docker images → push to ECR → update Helm charts → rolling deploy to EKS.

**Deployment safety for Live Shows:**

A live show cannot tolerate disruption during its 15-minute window. The deployment pipeline enforces a **show safety window**:

```yaml
# deploy.yml
- name: Check show safety window
  run: |
    NEXT_SHOW_IN_MINUTES=$(curl -s $API/internal/shows/next-start-minutes)
    if [ "$NEXT_SHOW_IN_MINUTES" -lt "30" ]; then
      echo "Show starts in $NEXT_SHOW_IN_MINUTES minutes — deployment blocked"
      exit 1
    fi
    ACTIVE_SHOWS=$(curl -s $API/internal/shows/active-count)
    if [ "$ACTIVE_SHOWS" -gt "0" ]; then
      echo "Show in progress — deployment blocked"
      exit 1
    fi
```

Deployments of the Show WS Gateway and Show Orchestrator are blocked within 30 minutes of a scheduled show. Hotfixes bypass this gate only with a manual override + on-call engineer approval.

**Rolling deploys for WebSocket gateways:**

Gateway pod termination uses a graceful drain with a 60-second SIGTERM → SIGKILL window. On SIGTERM:
1. Stop accepting new WebSocket connections (health check returns 503)
2. Wait for active show round to complete (max 30s)
3. Emit `show:state_sync` to all connected clients (prompts reconnect to a healthy pod)
4. Close all connections

This ensures no client is mid-round when their gateway pod terminates.

### 10.6 Observability

**Three pillars: Metrics, Logs, Traces**

**Metrics (Prometheus + Grafana):**

Critical dashboards:
- Active WebSocket connections per pod (show + clips)
- Redis Streams consumer group pending count per stream (show:{showId}:answers is the most critical — PEL > 1000 entries is an alert)
- Wallet transaction p99 latency (alert if > 100ms)
- Answer submission end-to-end latency (submission → evaluation → result)
- Redis pub/sub message delivery latency
- Show round start delivery time (how long for round_start to reach all clients)

Key alerting thresholds:

| Metric | Warning | Critical |
|---|---|---|
| WS connections per pod | > 22K | > 28K |
| Redis Streams PEL size (answers) | > 500 entries | > 1000 entries |
| Wallet tx p99 latency | > 50ms | > 100ms |
| PostgreSQL replication lag | > 5s | > 30s |
| Redis memory utilization | > 70% | > 85% |
| Pod restart count | > 2/hour | > 5/hour |

**Structured logging (Winston → OpenSearch):**

All services emit JSON logs with a consistent schema:
```json
{
  "timestamp": "2026-03-27T20:00:00.000Z",
  "level": "info",
  "service": "show-orchestrator",
  "traceId": "abc123",
  "showId": "show_20260327_evening",
  "userId": "user_xyz",
  "event": "round_start",
  "roundNumber": 1,
  "playerCount": 1000000
}
```

`traceId` propagates across service boundaries via gRPC metadata and Redis Streams message fields, enabling distributed trace reconstruction for a single user's show session.

**Distributed tracing (OpenTelemetry → Jaeger):**

Critical traces instrumented:
- Show join → lobby → round 1 start (full join latency)
- Answer submit → evaluate → round result (answer pipeline latency)
- Wallet transaction (lock acquisition → commit)

### 10.7 Scaling Path: MVP to Year 5

| Metric | MVP (Year 1) | Year 3 | Year 5 |
|---|---|---|---|
| DAU | 500K | 5M | 20M |
| Peak concurrent (show) | 500K–1M | 3M | 8M |
| Shows/day | 2-3 | 12 | 24+ |
| WebSocket gateway pods | 20-50 | 100-200 | 400+ |
| PostgreSQL tier | r6g.2xlarge | r6g.8xlarge | Aurora Global |
| Redis cluster | 3 shards | 9 shards | 18 shards |
| Answer stream throughput | 100K msg/s (Redis Streams) | 1M msg/s (migrate to Kafka if needed) | 5M msg/s (Kafka) |
| Game Logic Workers | 4 pods | 20 pods | 80 pods |

**Year 2 inflection: Regional distribution**

When DAU exceeds 3M, a second AWS region (eu-west-1 or ap-southeast-1 depending on user geography) should serve users in that region. Each region gets a full stack. Shows are either region-specific or globally broadcast via cross-region Redis pub/sub (acceptable for shows — latency between regions is 50-150ms, within the 2-second delivery budget).

**Year 3 inflection: Database sharding**

At 10M+ DAU, `show_answers` and `clip_plays` tables will have billions of rows. Partition `show_answers` by show date (already designed). For `clip_plays`, partition by `user_id` range — consistent with the planned `user_id` shard key.

**Year 4 inflection: Dedicated ML infrastructure**

The PlayClips recommendation engine Phase 3 (social signals) requires real-time feature computation and model serving. At this scale, a dedicated ML serving layer (SageMaker or Triton) replaces the in-service scoring logic.

---

## Appendix A: Key Architectural Decisions Log

| Decision | Chosen | Rejected | Reason |
|---|---|---|---|
| Primary language | TypeScript / Node.js | Go, Python | Shared types with frontend; I/O bound gateway tier |
| HTTP framework | NestJS | Express, Fastify | DI + validation + WebSocket in one framework; scales with team |
| Primary database | PostgreSQL | MongoDB, CockroachDB | ACID for wallet; JSONB for polymorphic game payloads; avoid distributed transactions |
| Cache / pub-sub | Redis | Memcached, Kafka for pub-sub | Sorted sets for leaderboard; SETNX for dedup; native pub/sub for WS fan-out |
| Answer pipeline | Redis Streams | Kafka, RabbitMQ, SQS | Already in stack; zero additional cost; XREADGROUP consumer groups match Kafka consumer group semantics; sufficient throughput for MVP (100K concurrent) |
| Show fan-out topology | Redis pub-sub + WS gateway pods | Direct stream to client, SSE | Redis fan-out scales to 1M via 50 gateway subscribers; Streams not suited for direct client delivery |
| Wallet concurrency | Row-level lock (FOR UPDATE) | Optimistic concurrency, event sourcing | Correctness over performance; exploitability risk too high with optimistic approach |
| Answer validation location | Stateless Game Logic Workers (Redis Streams XREADGROUP consumers) | Inline in WS Gateway | Separation of concerns; compute-intensive validation isolated from I/O-bound gateway |
| Correct answer storage | AES-256 encrypted in DB | Plaintext in DB | Prevents DB read access from leaking answers; decryption key in Secrets Manager |
| IAP processing | Server-to-server receipt validation | Client-reported | Never trust client purchase confirmation; receipt validation is non-negotiable |
| WS load balancer | NLB (Layer 4) | ALB (Layer 7) | Lower latency, better long-lived connection persistence for WebSocket |
| Show Orchestrator topology | 1 instance per show (isolated pod) | Shared multi-show orchestrator | Blast radius isolation; one buggy show cannot affect another |

---

## Appendix B: MVP Deployment Checklist

Before first live show:

- [ ] Redis Cluster with minimum 3 shards provisioned and cluster mode verified
- [ ] PostgreSQL Multi-AZ with at least 1 read replica
- [ ] PgBouncer deployed as DaemonSet, pool sizes tuned per service
- [ ] Redis Streams consumer groups created for each show at start (`XGROUP CREATE` per show, `MKSTREAM` flag)
- [ ] CloudFront distribution configured with S3 origins and correct cache policies
- [ ] Secrets Manager populated with DB credentials, AES show key master key, IAP shared secrets
- [ ] Load testing: 100K simulated concurrent WebSocket connections on WS gateway
- [ ] Load testing: 50K simulated answer submissions/second on Game Logic Workers
- [ ] Wallet transaction idempotency verified under concurrent load test
- [ ] Anti-cheat service Redis Streams consumer PEL verified < 100 entries at 50K answers/s
- [ ] Show deployment safety gate tested (blocks deploys within 30 min of show)
- [ ] Grafana dashboards for critical show metrics live and alerting configured
- [ ] Runbook for show incident response documented and distributed to on-call

---

*Next phase considerations: gRPC service mesh (Istio) for mTLS between services at Year 2 scale; dedicated ML feature store for recommendation engine Phase 3; global CDN expansion to PoPs in SEA and LATAM for Year 3 regional expansion; migrate answer pipeline from Redis Streams to Kafka at Year 2+ if throughput exceeds Redis Cluster capacity (~500K concurrent players per show); event replay infrastructure for anti-cheat retrospective analysis.*
