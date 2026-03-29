# Project Euphoria — Phased Project Plan

**Last Updated:** 2026-03-27
**Version:** 2.1 (Decisions Locked)
**PM:** Nikhil (human) + project-manager agent
**Build Team:** AI agents (lead-backend-architect, frontend-nodejs-engineer, ui-ux-designer)

---

## Decisions Log

Locked decisions are listed here with dates so all agents know what has been resolved and need not revisit them.

| # | Decision | Resolution | Date Locked |
|---|---|---|---|
| D1 | Social login (Apple/Google OAuth) in P1 or later? | **IN P1.** Required for first demo. Use Passport.js with Apple + Google strategies. Added P1-T23. | 2026-03-27 |
| D2 | PlayClips media: static images or video? | **VIDEO.** AWS MediaConvert pipeline for transcoding show clips to HLS, S3 storage, CloudFront CDN delivery. Added P3-T27. | 2026-03-27 |
| D3 | Soft launch scale: 10K total or 10K concurrent? | **10K CONCURRENT players.** Load tests, WebSocket connection targets, and Redis pool sizing are all calibrated to 10K concurrent. | 2026-03-27 |
| D4 | Find Items game engine placement: PlayClips only or both engines? | **BOTH.** Find Items is available in PlayClips (P3-T05) and in Live Shows (P4-T23 wires it to the show WebSocket flow). | 2026-03-27 |
| D5 | Admin dashboard: mobile-native, or responsive web? | **Responsive web app** (React + TailwindCSS), served separately from the mobile app, accessible from phone browser. Not a native app. | 2026-03-27 |

---

## Overview

Project Euphoria is a live interactive game show platform with two content engines:

- **Live Shows** — Synchronous elimination game show, up to 1M concurrent players, 10-12 micro-games per show, 10-20 seconds per game, progressive elimination
- **PlayClips** — TikTok-style async playable clip feed with matchmaking, session streaks, and social mechanics

**Stack:** React Native Expo (mobile), NestJS (backend), TypeScript everywhere, AWS managed infra (RDS PostgreSQL, ElastiCache Redis + Streams, S3/CDN)

**Monetization:** Coins (earned via gameplay, purchased via IAP), retries on elimination, streak protection, powerups

**Build model:** Entirely AI-agent driven. No human developers. All implementation tasks are executed by agents with scoped, unambiguous instructions.

---

## AI-Agent Timeline Model

This plan uses AI-agent development assumptions throughout. All time estimates reflect **calendar time** (wall-clock duration), not person-hours.

**Compression factors:**
- A task a human engineer would spend a full day on, an AI agent completes in 30–60 minutes
- Tasks without dependencies run in TRUE parallel across agents — backend, frontend, and design execute simultaneously
- No standups, PR reviews, communication overhead, or context-switching fatigue
- Boilerplate, tests, and documentation generate as part of task execution, not in addition to it

**Remaining real bottlenecks:**
- Sequential dependencies (WS client cannot be built before WS server contract exists)
- AWS infrastructure provisioning (services take real time to provision regardless of who runs the command)
- Integration testing and debugging loops (these are inherently sequential)
- Nikhil's review/approval between phases: **1 day per phase**

**Effort labels (AI-adjusted):**

| Label | Human estimate | AI agent estimate |
|---|---|---|
| S | 0.5–1 day | 1–2 hours |
| M | 1–3 days | 2–4 hours |
| L | 3–5 days | 4–8 hours |
| XL | 5+ days | 1–2 days |

---

## Agent Roster

| Handle | Role | Primary Responsibilities |
|---|---|---|
| `backend-architect` | Lead Backend Architect | NestJS services, DB schema, Redis Streams pipelines, WebSocket infra, AWS config, admin APIs |
| `frontend-engineer` | Frontend/Node Engineer | React Native Expo screens, game engine client, state management, API integration, Expo config |
| `ui-ux-designer` | UI/UX Designer | Screen designs, component library, design tokens, motion specs, asset production |

---

## Demo Progression Narrative

Each phase ends with a CEO-demoable artifact. The arc is designed to build confidence progressively — from "it works" to "it scales" to "it monetizes" to "it runs itself."

| Phase | Demo Artifact | Confidence Signal |
|---|---|---|
| P1 | A fully playable single-player Trivia game on mobile, backed by a live server | "The core loop is real and running" |
| P2 | A 4-player synchronized live show with elimination, host controls, and a basic admin panel | "It's a real game show, not a prototype" |
| P3 | PlayClips feed live alongside the show engine, with coins and a working IAP purchase | "The second engine is running and it monetizes" |
| P4 | A full 50-100 player dress rehearsal show, with monitoring dashboards and feature flags live | "We can operate this at scale, not just demo it" |
| P5 | A soft-launch show at real scale (10K+ **concurrent** players) with analytics proving engagement | "The numbers are real. We're ready to grow." |

---

## Complexity Key

| Label | Meaning |
|---|---|
| S | 0.5–1 day (human) → 1–2 hours (AI) |
| M | 1–3 days (human) → 2–4 hours (AI) |
| L | 3–5 days (human) → 4–8 hours (AI) |
| XL | 5+ days (human) → 1–2 days (AI); likely needs a spike or subtask breakdown |

---

## Phase 1 — Foundation + First Playable

**Human estimate:** 3 weeks
**AI-agent estimate: 3–4 days calendar time**
**Goal:** Get one playable micro-game (Trivia) running end-to-end on mobile, backed by a live NestJS server with a working content pipeline and basic observability. Establish LiveOps scaffolding from day one.

**CEO Demo:** A real device running the Euphoria app, playing a live-server-backed Trivia question with timer, answer selection, correct/incorrect feedback, and a score screen. Admin can push a new question set without a code deploy.

### Phase 1 Parallelism Map

```
DAY 1
├── [backend-architect]  P1-T01: Bootstrap NestJS monorepo
├── [ui-ux-designer]     P1-T12: Design system foundations
└── [frontend-engineer]  P1-T16: Bootstrap Expo project

DAY 1 → DAY 2 (after P1-T01 completes — ~2 hours in)
├── [backend-architect]  P1-T02: Provision RDS PostgreSQL  ← AWS provisioning takes real time (~1–2 hrs)
├── [backend-architect]  P1-T03: Provision ElastiCache Redis  ← runs concurrently with P1-T02
├── [backend-architect]  P1-T08: Structured logging (no DB dependency)
├── [ui-ux-designer]     P1-T13: Trivia game screen design  ← runs after P1-T12
├── [ui-ux-designer]     P1-T14: Post-game result screen     ← runs after P1-T12
└── [ui-ux-designer]     P1-T15: App shell design            ← runs after P1-T12

DAY 2 (after P1-T02 completes)
├── [backend-architect]  P1-T04: Base DB schema + migrations  ← gated on RDS being live
├── [backend-architect]  P1-T09: X-Ray tracing                ← after P1-T08
└── [frontend-engineer]  P1-T17: Theme system                 ← after P1-T12 + P1-T16

DAY 2 → DAY 3 (after P1-T04 completes)
├── [backend-architect]  P1-T05: JWT auth module
├── [backend-architect]  P1-T06: Feature flag service         ← after P1-T03 + P1-T04
├── [backend-architect]  P1-T07: Remote config service
├── [backend-architect]  P1-T10: Trivia game engine
└── [backend-architect]  P1-T11: Content pipeline v1

DAY 3 (after P1-T05 + P1-T16)
├── [backend-architect]  P1-T23: Social auth (Passport.js Apple + Google)  ← after P1-T05
├── [frontend-engineer]  P1-T18: Guest auth flow
├── [frontend-engineer]  P1-T22: App shell (can start after P1-T15 + P1-T18)
└── [frontend-engineer]  P1-T19: Feature flag + remote config client  ← after P1-T06 + P1-T07 + P1-T18

DAY 3 → DAY 4
├── [frontend-engineer]  P1-T20: Trivia game screen           ← after P1-T10 + P1-T13 + P1-T18
├── [frontend-engineer]  P1-T21: Post-game result screen      ← after P1-T14 + P1-T20
└── [frontend-engineer]  P1-T24: Social login screens         ← after P1-T23 + P1-T15

DAY 4: Integration testing, end-to-end validation, Nikhil review
```

**Sequential bottleneck chain:** P1-T01 → AWS provisioning (P1-T02/T03, real infra time ~2 hrs) → P1-T04 → P1-T05 → P1-T23 (social auth) / P1-T18 (guest auth) → P1-T20/T24 → P1-T21

**Total calendar time: 3–4 days** (including 1 day Nikhil review + integration testing)

### Phase 1 Tasks

#### Infrastructure & Backend Foundation

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P1-T01 | Bootstrap NestJS monorepo with module structure: `core`, `games`, `liveops`, `admin`, `auth`, `realtime`. Include ESLint, Prettier, Jest config, and a Dockerfile. | `backend-architect` | None | M |
| P1-T02 | Provision AWS RDS PostgreSQL (db.t3.medium, Multi-AZ disabled for MVP). Configure VPC, security groups, and connection pooling via PgBouncer on ECS. | `backend-architect` | P1-T01 | M |
| P1-T03 | Provision AWS ElastiCache Redis cluster (cache.t3.micro, single-node for MVP). Add Redis client module to NestJS. | `backend-architect` | P1-T01 | S |
| P1-T04 | Design and implement the base database schema: `users`, `sessions`, `games`, `questions`, `answers`, `coin_ledger`, `feature_flags`. Include migration tooling via TypeORM. | `backend-architect` | P1-T02 | L |
| P1-T05 | Implement JWT-based auth module: guest account creation (auto UUID), anonymous session. Expose `POST /auth/guest` and `POST /auth/refresh`. Design the `users` table to support a `social_provider` column from day one so P1-T23 social accounts share the same user record. | `backend-architect` | P1-T04 | M |
| P1-T06 | Implement feature flag service: store flags in `feature_flags` table, expose `GET /config/flags` endpoint, add per-user and global flag evaluation. Cache flag reads in Redis with 30s TTL. | `backend-architect` | P1-T03, P1-T04 | M |
| P1-T07 | Implement remote config service: key-value store in Postgres, expose `GET /config/remote` endpoint with version hash for client-side diffing. Admin endpoint to update values. | `backend-architect` | P1-T04 | S |
| P1-T08 | Set up structured logging with Winston (JSON format), correlation IDs on all requests, and ship logs to AWS CloudWatch Logs via the ECS log driver. | `backend-architect` | P1-T01 | S |
| P1-T09 | Integrate AWS X-Ray tracing into NestJS. Add trace IDs to all HTTP responses and WebSocket events. | `backend-architect` | P1-T08 | M |
| P1-T10 | Implement the Trivia game engine (server-side): question delivery, answer validation, per-player scoring (100 base - time_elapsed * 5), result calculation. Expose REST endpoints: `POST /games/trivia/start`, `POST /games/trivia/answer`. | `backend-architect` | P1-T04 | M |
| P1-T11 | Build content pipeline v1: admin REST API for CRUD on question sets (title, difficulty, category, questions[], correct_answer, distractors[]). Include bulk import via JSON upload to S3. | `backend-architect` | P1-T04 | M |
| P1-T23 | Implement social auth via Passport.js (Apple + Google strategies). Expose `POST /auth/apple` and `POST /auth/google` — each accepts the provider token from the client, validates it with the respective provider, and upserts a user record (linked by `social_provider` + `social_id`). Return a Euphoria JWT on success. Requires Apple Services ID and Google OAuth client credentials in AWS Secrets Manager. | `backend-architect` | P1-T05 | M |

#### Design

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P1-T12 | Define design system foundations: color palette (dark-first), typography scale (3 sizes), spacing grid (4px base), border radii, shadow tokens. Deliver as a Figma token file and a `theme.ts` export for React Native. | `ui-ux-designer` | None | M |
| P1-T13 | Design Trivia game screen: question card, 4 answer buttons, countdown timer ring, correct/incorrect state animation spec, score delta overlay. Deliver as Figma frames + motion spec doc. | `ui-ux-designer` | P1-T12 | M |
| P1-T14 | Design post-game result screen: score, rank indicator (stub), coins earned, CTA to play again. | `ui-ux-designer` | P1-T12 | S |
| P1-T15 | Design app shell: splash screen, home screen stub, bottom nav bar (Home, Live, Play, Profile). | `ui-ux-designer` | P1-T12 | M |

#### Mobile Frontend

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P1-T16 | Bootstrap Expo project with TypeScript template. Configure EAS Build, set up folder structure (`screens/`, `components/`, `hooks/`, `store/`, `api/`, `theme/`), integrate React Navigation v6. | `frontend-engineer` | None | M |
| P1-T17 | Implement theme system: import design tokens from P1-T12 into `theme.ts`, wrap app in ThemeProvider, expose `useTheme` hook. | `frontend-engineer` | P1-T12, P1-T16 | S |
| P1-T18 | Implement guest auth flow: call `POST /auth/guest` on first launch, persist JWT in SecureStore, auto-refresh on expiry. Guest account is the default; social login is an optional upgrade presented on the home screen. | `frontend-engineer` | P1-T05, P1-T16 | M |
| P1-T19 | Implement feature flag + remote config client: fetch on app launch, store in Zustand, re-fetch on foreground resume. Expose `useFlag(key)` and `useConfig(key)` hooks. | `frontend-engineer` | P1-T06, P1-T07, P1-T18 | S |
| P1-T20 | Build Trivia game screen: implement designs from P1-T13. Wire to REST game API. Implement countdown timer (client-side), optimistic answer selection, server-validated result. | `frontend-engineer` | P1-T10, P1-T13, P1-T18 | L |
| P1-T21 | Build post-game result screen: implement designs from P1-T14. Display score, coins earned (stub), replay CTA. | `frontend-engineer` | P1-T14, P1-T20 | S |
| P1-T22 | Build app shell: splash screen, home screen with a "Play Trivia" entry point, bottom nav bar. | `frontend-engineer` | P1-T15, P1-T18 | M |
| P1-T24 | Implement social login screens (Apple + Google): use `expo-apple-authentication` for Sign in with Apple and `@react-native-google-signin/google-signin` for Google. On success, call the corresponding `POST /auth/apple` or `POST /auth/google` backend endpoint, persist the returned JWT in SecureStore, and transition to the home screen. Present as a sign-in screen before guest fallback, with a "Continue as Guest" option below the social buttons. | `frontend-engineer` | P1-T23, P1-T15 | M |

### Phase 1 Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| AWS provisioning delays (IAM, VPC misconfiguration) block backend agents | Medium | High | backend-architect runs infra as first task; use Terraform or CDK scripts so re-provisioning is fast |
| Design-to-code handoff ambiguity slows frontend-engineer | Medium | Medium | ui-ux-designer delivers motion spec doc alongside Figma; frontend-engineer unblocked by implementing skeleton UI before final designs land |
| TypeORM migration conflicts if schema changes during P1 | High | Low | Run migrations in CI; treat schema as append-only in P1; no destructive changes without PM sign-off |
| Feature flag service underscoped (becomes a blocker in later phases) | Low | High | Implement per P1-T06 spec with user targeting now; avoid rebuilding in P3 |

### Phase 1 Definition of Done

- [ ] A physical or simulator device can cold-start the app, receive a guest JWT, and play a full Trivia round against a live NestJS server
- [ ] Sign in with Apple and Sign in with Google both complete successfully and return a valid Euphoria JWT (tested in sandbox/dev)
- [ ] A new question set can be created via admin API without a code deploy
- [ ] Feature flags and remote config endpoints are live and returning values
- [ ] Structured logs are flowing to CloudWatch
- [ ] All P1 tasks merged, CI green

---

## Phase 2 — Live Show Engine (Synchronized Multi-Player)

**Human estimate:** 4 weeks
**AI-agent estimate: 4–5 days calendar time**
**Goal:** Build the full synchronous Live Show loop: lobby, show schedule, real-time game state broadcast via WebSocket, progressive elimination, host controls, and a basic admin show management dashboard.

**CEO Demo:** A scheduled show appears in the app. Multiple devices join the lobby, see a countdown, play synchronized Trivia and Quick Math rounds, get eliminated as rounds progress, see a leaderboard, and a winner is crowned. The admin panel shows a live player count and can trigger round transitions manually.

### Phase 2 Parallelism Map

```
DAY 1 (immediately after P1 review — all agents start concurrently)
├── [backend-architect]  P2-T01: Configure Redis Streams consumer groups  ← builds on P1-T03, no AWS provisioning needed
├── [backend-architect]  P2-T03: Show scheduler service     ← only needs P1 DB (P1-T04 ✓)
├── [backend-architect]  P2-T07: Quick Math game engine     ← only needs P1 engine pattern (P1-T10 ✓)
├── [ui-ux-designer]     P2-T12: Lobby screen design
├── [ui-ux-designer]     P2-T13: In-show HUD design
├── [ui-ux-designer]     P2-T14: Quick Math screen design
├── [ui-ux-designer]     P2-T15: End-of-show screen design
└── [ui-ux-designer]     P2-T16: Admin dashboard web UI design

DAY 1 → DAY 2 (after P2-T01 Redis Streams config is complete)
├── [backend-architect]  P2-T02: WebSocket gateway + Redis adapter   ← XL, gated on T01
└── [backend-architect]  P2-T11: CloudWatch metrics dashboard        ← runs in parallel with T02

DAY 2 → DAY 3 (after P2-T02 + P2-T03 complete)
├── [backend-architect]  P2-T04: Show lifecycle state machine        ← XL, gated on T02 + T03
├── [backend-architect]  P2-T05: Player answer ingestion pipeline    ← gated on T01 + T02
└── [frontend-engineer]  P2-T17: Socket.IO client integration        ← gated on P2-T02 contract

DAY 3 (after P2-T05 complete)
├── [backend-architect]  P2-T06: Elimination engine                  ← gated on T05
├── [backend-architect]  P2-T08: Leaderboard service                 ← gated on T05
├── [backend-architect]  P2-T09: Admin show management API           ← gated on T03 + T04
├── [frontend-engineer]  P2-T18: Lobby screen                        ← gated on T03 + T12 + T17
└── [frontend-engineer]  P2-T19: Show HUD wrapper                    ← gated on T13 + T17

DAY 3 → DAY 4 (after P2-T09 complete)
├── [backend-architect]  P2-T10: Host controls WebSocket channel     ← gated on T04 + T09
├── [frontend-engineer]  P2-T20: Trivia in live show flow            ← gated on T05 + T17 + T19
├── [frontend-engineer]  P2-T21: Quick Math screen                   ← gated on T07 + T14 + T19
├── [frontend-engineer]  P2-T22: Elimination state                   ← gated on T17 + T19
└── [frontend-engineer]  P2-T24: Admin dashboard (React web)         ← gated on T09 + T16

DAY 4 → DAY 5
├── [frontend-engineer]  P2-T23: End-of-show screen                  ← gated on T08 + T15
└── Integration testing: 4-device synchronized show run-through

DAY 5: Bug fixes, end-to-end validation, Nikhil review
```

**Sequential bottleneck chain:** P2-T01 (Redis Streams config) → P2-T02 (XL, WebSocket gateway) → P2-T04 (XL, state machine) → P2-T05 → P2-T06 → integration

**Total calendar time: 4–5 days** (including 1 day Nikhil review + multi-device integration testing)

### Phase 2 Tasks

#### Backend — Real-Time Infrastructure

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P2-T01 | Configure Redis Streams for the answer pipeline: create stream key schema `show:{showId}:answers`, define consumer group `game-logic-workers` (created per show at start via `XGROUP CREATE ... MKSTREAM`), add stream helper module to NestJS. No new AWS infrastructure — uses the ElastiCache Redis cluster provisioned in P1-T03. | `backend-architect` | P1-T03 | S |
| P2-T02 | Implement NestJS WebSocket gateway using Socket.IO with Redis adapter (for multi-pod scaling). Rooms model: one room per show, players join on lobby entry. Emit events: `show:countdown`, `game:start`, `game:question`, `game:result`, `player:eliminated`, `show:end`. | `backend-architect` | P1-T03, P2-T01 | XL |
| P2-T03 | Implement show scheduler service: `shows` table with `scheduled_at`, `status` (scheduled/live/ended), `game_sequence` (ordered JSON array of game configs). Expose `GET /shows/upcoming` and `GET /shows/:id`. | `backend-architect` | P1-T04 | M |
| P2-T04 | Implement show lifecycle state machine: states are `lobby → countdown → game_active → game_result → next_game → show_end`. Each transition writes to `show:{showId}:events` Redis Stream (`XADD`) and triggers a WebSocket broadcast. Transition timing is configurable via remote config. | `backend-architect` | P2-T02, P2-T03 | XL |
| P2-T05 | Implement player answer ingestion pipeline: answers arrive via WebSocket `show:answer_submit`, gateway writes `XADD show:{showId}:answers * userId {userId} answer {answer} roundId {roundId} clientTs {ts}`, Game Logic Workers consume via `XREADGROUP GROUP game-logic-workers`, results aggregated in Redis hash `answers:{showId}:{roundId}`. | `backend-architect` | P2-T01, P2-T02 | L |
| P2-T06 | Implement elimination engine: after each round, bottom N% of players (configurable per show via admin) are marked `eliminated` in Redis. Eliminated players receive `player:eliminated` WebSocket event and are blocked from answering subsequent rounds. | `backend-architect` | P2-T05 | M |
| P2-T07 | Implement Quick Math game engine (server-side): generate arithmetic problems (add/subtract/multiply, operands 1-20) server-side, validate answers, score same as Trivia. | `backend-architect` | P1-T10 | S |
| P2-T08 | Implement leaderboard service: maintain top-100 per show in Redis sorted set, expose `GET /shows/:id/leaderboard` (paginated), WebSocket push of top-10 after each round. | `backend-architect` | P2-T05 | M |
| P2-T09 | Build admin show management API: `POST /admin/shows` (create show with game sequence), `PATCH /admin/shows/:id/status` (force transition), `GET /admin/shows/:id/stats` (live player count, elimination count, current round). Require admin JWT scope. | `backend-architect` | P2-T03, P2-T04 | M |
| P2-T10 | Implement host controls WebSocket channel: authenticated host socket can emit `host:force_next`, `host:pause`, `host:announce` — these override the state machine timer. | `backend-architect` | P2-T04, P2-T09 | M |
| P2-T11 | Add CloudWatch metrics: publish custom metrics for active_connections, answers_per_second, elimination_rate, show_state. Create a CloudWatch dashboard. Set alarms for active_connections > 5000 (P2 scale) and error_rate > 1%. | `backend-architect` | P1-T08 | M |

#### Design

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P2-T12 | Design lobby screen: show card (name, scheduled time, prize), player count live counter, countdown timer, "You're in" confirmation state. | `ui-ux-designer` | P1-T12 | M |
| P2-T13 | Design in-show HUD: persistent top bar (round number, players remaining, your status: active/eliminated), round transition animation spec (swoosh in/out), elimination screen (big X, eliminated player count). | `ui-ux-designer` | P1-T12 | L |
| P2-T14 | Design Quick Math game screen: equation display, numeric keypad, submit button, timer ring. Reuse Trivia result overlay. | `ui-ux-designer` | P1-T13 | S |
| P2-T15 | Design end-of-show screen: winner reveal animation, final leaderboard top-10, "Watch Replay" stub, coin reward display. | `ui-ux-designer` | P1-T12 | M |
| P2-T16 | Design admin show dashboard web UI: show list, create show form, live stats panel (player count, round, eliminations), force-next button. **Must be designed as a responsive web UI** — all layouts must be usable on a phone browser (min viewport 375px) as well as desktop. Use a single-column stacked layout on mobile, two-column on desktop. Minimal but functional — this is an internal tool. Deliver as Figma frames at both 375px and 1280px breakpoints. | `ui-ux-designer` | None | M |

#### Mobile Frontend

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P2-T17 | Integrate Socket.IO client into Expo app. Implement connection lifecycle: connect on show join, auto-reconnect with exponential backoff (max 5 retries), disconnect on show end. Store socket state in Zustand. | `frontend-engineer` | P1-T19, P2-T02 | L |
| P2-T18 | Build lobby screen: fetch upcoming shows via `GET /shows/upcoming`, display show card, join show (REST call + socket room join), live player count (WebSocket update), countdown to show start. | `frontend-engineer` | P2-T03, P2-T12, P2-T17 | M |
| P2-T19 | Build show HUD wrapper: persistent overlay component that reads show state from Zustand (round, players_remaining, my_status). Renders round transition animations per P2-T13 spec on `game:start` events. | `frontend-engineer` | P2-T13, P2-T17 | L |
| P2-T20 | Wire Trivia game screen into live show flow: replace REST start/answer calls with WebSocket-synchronized version — wait for `game:question` event to show question, submit answer via `POST /games/:showId/answer`, animate result on `game:result` event. | `frontend-engineer` | P2-T05, P2-T17, P2-T19 | L |
| P2-T21 | Build Quick Math game screen per P2-T14 design. Wire to show WebSocket flow same as P2-T20. | `frontend-engineer` | P2-T07, P2-T14, P2-T19 | M |
| P2-T22 | Implement elimination state: on `player:eliminated` event, show elimination overlay (P2-T13), transition player to spectator mode (can see rounds, cannot answer), offer "retry" CTA (stub for P3 coins). | `frontend-engineer` | P2-T17, P2-T19 | M |
| P2-T23 | Build end-of-show screen per P2-T15 design. Fetch leaderboard top-10 via API. Animate winner reveal. | `frontend-engineer` | P2-T08, P2-T15 | M |
| P2-T24 | Build admin show dashboard as a **responsive React web app** using React + TailwindCSS, served separately from the mobile app (standalone Vite build, served via NestJS static files or a separate S3/CloudFront origin — not bundled into the Expo app). Must be fully usable on a phone browser (375px viewport) — operators will access this from their phones during live shows. Implement show list, create form, live stats panel fetched via polling (5s interval). Add force-next button wired to `PATCH /admin/shows/:id/status`. Use TailwindCSS responsive prefixes (`sm:`, `md:`) throughout — no fixed-width layouts. | `frontend-engineer` | P2-T09, P2-T16 | L |

### Phase 2 Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| WebSocket scaling under load — single-pod Socket.IO breaks when NestJS scales horizontally | High | High | P2-T02 mandates Redis adapter from day one; stress test with 100 simulated connections before demo |
| Redis Streams consumer group PEL growth causes answer processing delays visible to users | Low | High | Instrument PEL size as a CloudWatch metric in P2-T11; add PEL alarm; if PEL > 500 entries, scale Game Logic Worker pods |
| State machine timing drift — client timer and server state get out of sync | High | Medium | Server is authoritative; client timer is display-only; on `game:result` event client immediately snaps to result state regardless of timer |
| Admin dashboard scope creep (becomes a full product) | Medium | Medium | P2 admin dashboard is internal tooling only; zero design polish required beyond usability |
| Quick Math engine on server creates bottleneck at scale | Low | Medium | Problem generation is O(1); risk is low in P2; document that at 1M scale this moves to pre-generated pools |

### Phase 2 Definition of Done

- [ ] 4+ simulated devices can join a lobby, play 3 synchronized rounds (Trivia + Quick Math), experience elimination, and see a winner crowned
- [ ] Admin can create a show, schedule it, and force-advance rounds from the dashboard
- [ ] WebSocket connection uses Redis adapter (multi-pod ready)
- [ ] Redis Streams consumer groups are live and answer events flowing through the pipeline (verified via `XPENDING` and `XINFO GROUPS`)
- [ ] CloudWatch dashboard shows active connections and answers/sec metrics
- [ ] All P2 tasks merged, CI green

---

## Phase 3 — PlayClips Engine + Monetization

**Human estimate:** 4 weeks
**AI-agent estimate: 4–5 days calendar time**
**Goal:** Launch the PlayClips engine (async feed of playable clips), implement the full coin economy (earn, spend, IAP purchase), and add retries-on-elimination and streak mechanics. Both engines are now live simultaneously.

**CEO Demo:** Swipe through a PlayClips feed, play a Spot the Difference clip, earn coins, get eliminated in a Live Show, spend coins on a retry, and demonstrate an in-app purchase flow completing successfully with coins credited to the wallet.

### Phase 3 Parallelism Map

```
DAY 1 (all agents start concurrently after P2 review)
├── [backend-architect]  P3-T01: PlayClips data model         ← new schema, no P2 dependency
├── [backend-architect]  P3-T08: Coin ledger service           ← L task, start immediately (P1-T04 ✓)
├── [ui-ux-designer]     P3-T13: PlayClips feed screen design
├── [ui-ux-designer]     P3-T14: Spot the Difference screen design
├── [ui-ux-designer]     P3-T15: Match result screen design
├── [ui-ux-designer]     P3-T16: Coin wallet UI design
├── [ui-ux-designer]     P3-T17: Retry-on-elimination modal design
└── [ui-ux-designer]     P3-T18: Streak screen design

DAY 1 → DAY 2 (after P3-T01 complete)
├── [backend-architect]  P3-T02: Clip feed service
├── [backend-architect]  P3-T03: Async matchmaking service     ← L task
├── [backend-architect]  P3-T04: Spot the Difference engine
├── [backend-architect]  P3-T05: Find Items game engine
├── [backend-architect]  P3-T27: MediaConvert transcode pipeline  ← L task, start ASAP; AWS Lambda + MediaConvert provisioning takes real time
└── [backend-architect]  P3-T06: Streak service

DAY 2 (after P3-T08 complete)
├── [backend-architect]  P3-T09: Coin earn rates via remote config  ← after T08 + P1-T07 + P1-T10
├── [backend-architect]  P3-T10: Retry-on-elimination              ← after P2-T06 + T08
├── [backend-architect]  P3-T11: IAP validation service            ← after T08 (L task, start ASAP)
└── [backend-architect]  P3-T12: Powerup inventory                 ← after T08

DAY 2 → DAY 3 (after P3-T06 complete)
└── [backend-architect]  P3-T07: Streak protection                 ← after T06

DAY 2 → DAY 3 (frontend unblocked as backend contracts are committed to /docs/api/)
├── [frontend-engineer]  P3-T19: PlayClips feed screen             ← after T02 + T13
├── [frontend-engineer]  P3-T22: Coin wallet                       ← after T08 + T16
└── [frontend-engineer]  P3-T26: Streak screen                     ← after T06 + T18

DAY 3 (frontend continues)
├── [frontend-engineer]  P3-T20: Spot the Difference screen        ← after T04 + T14 (L task)
├── [frontend-engineer]  P3-T23: Coin earn animations              ← after T16 + T22
└── [frontend-engineer]  P3-T25: Retry-on-elimination modal        ← after T10 + T17

DAY 3 → DAY 4
├── [frontend-engineer]  P3-T21: Match result screen               ← after T03 + T15
└── [frontend-engineer]  P3-T24: IAP purchase flow                 ← L task, after T11 + T16
                                                                       NOTE: Apple/Google sandbox
                                                                       debugging adds real time here

DAY 4 → DAY 5: Integration testing (dual-engine simultaneous run), IAP sandbox validation, Nikhil review
```

**Sequential bottleneck chain:** P3-T08 (coin ledger) → P3-T09/T10/T11/T12 → P3-T24 (IAP, Apple/Google sandbox adds real latency)

**Note on IAP:** Apple/Google sandbox environments are external dependencies with real latency. Budget half a day for sandbox account setup and receipt validation debugging. This is the highest-risk real-time bottleneck in P3.

**Note on MediaConvert (P3-T27):** AWS MediaConvert and the Lambda triggers require IAM role setup and MediaConvert queue provisioning. Start P3-T27 at the same time as the game engines. The admin UI cannot upload clips until this pipeline is live. Budget 2–4 hours for AWS provisioning on top of implementation time.

**Total calendar time: 4–5 days** (including IAP sandbox buffer + 1 day Nikhil review)

### Phase 3 Tasks

#### Backend — PlayClips Engine

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P3-T01 | Design PlayClips data model: `clips` table (game_type, source_video_s3_key, hls_manifest_cloudfront_url, thumbnail_cloudfront_url, transcode_status ENUM[pending/processing/ready/failed], difficulty, metadata JSONB, play_count, avg_score), `clip_sessions` (user_id, clip_id, score, duration_ms, completed_at), `clip_feed_cursor` (user_id, last_seen_clip_ids[]). The `hls_manifest_cloudfront_url` field is populated by the MediaConvert pipeline (P3-T27) and is the URL served to clients. | `backend-architect` | P1-T04 | M |
| P3-T02 | Implement clip feed service: `GET /clips/feed` returns next 10 clips for a user using a cursor-based algorithm (de-duplicate last 50 seen, weight by difficulty progression, random shuffle remainder). | `backend-architect` | P3-T01 | M |
| P3-T03 | Implement async matchmaking service: when a user completes a PlayClip, find the best available opponent score for that clip within a 30s window (Redis sorted set by score), create a `match` record, return result comparison. If no opponent in 30s, use a ghost score from the clip's avg_score. | `backend-architect` | P1-T03, P3-T01 | L |
| P3-T04 | Implement Spot the Difference game engine (server-side): store difference coordinates as JSONB in `clips.metadata` (coordinates are normalized 0–1 relative to video frame dimensions, not pixel-absolute), validate tap coordinates within a 0.03 normalized-radius tolerance, score = 1000 - (10 * misses) - (5 * elapsed_seconds). Game is played against a paused video frame or a looping clip. | `backend-architect` | P3-T01 | M |
| P3-T05 | Implement Find Items game engine (server-side): store item bounding boxes as normalized JSONB in `clips.metadata`, validate tap within bounding box, score by items found * 100 - time penalty. Playable in both PlayClips and Live Show contexts (see P4-T23). | `backend-architect` | P3-T01 | M |
| P3-T06 | Implement streak service: track `user_streaks` table (current_streak, longest_streak, last_play_date). Increment on daily PlayClip session, reset on missed day, emit `streak:updated` event. Expose `GET /streaks/me`. | `backend-architect` | P3-T01 | M |
| P3-T07 | Implement streak protection: deduct coins to shield a broken streak. Logic: if last_play_date = today - 2 and user has streak_shield powerup, restore streak and deduct cost from coin_ledger. | `backend-architect` | P3-T06 | S |
| P3-T27 | Build the video transcode pipeline using AWS MediaConvert. Admin uploads a raw video to the S3 `clips-raw/` prefix via a presigned URL (exposed by `POST /admin/clips/upload-url`). An S3 event notification triggers a Lambda that submits a MediaConvert job: transcode to HLS (three renditions: 1080p/4Mbps, 720p/2Mbps, 360p/800Kbps), extract thumbnail at 2s, output to `clips-hls/` and `clips-thumbs/` S3 prefixes served via CloudFront. Lambda writes job ID to the `clips` row; a second Lambda on MediaConvert job completion updates `transcode_status = ready` and populates `hls_manifest_cloudfront_url` and `thumbnail_cloudfront_url`. Admin content pipeline (P1-T11) must be extended to include clip upload and transcode-status polling. | `backend-architect` | P3-T01 | L |

#### Backend — Coin Economy & Monetization

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P3-T08 | Implement coin ledger service: `coin_ledger` table (user_id, delta, reason ENUM, reference_id, created_at). All coin mutations go through `CoinService.credit(userId, amount, reason)` and `CoinService.debit(userId, amount, reason)` — never direct SQL. Add balance cache in Redis with write-through. | `backend-architect` | P1-T04 | L |
| P3-T09 | Define coin earn rates via remote config: Trivia correct answer = 10 coins, Quick Math = 8, Spot the Difference complete = 15, streak day = 25, show survivor bonus = 50. Wire these into game engine result handlers. | `backend-architect` | P1-T07, P3-T08, P1-T10 | M |
| P3-T10 | Implement retry-on-elimination: when a player is eliminated, offer a retry for N coins (N configurable via remote config, default 50). `POST /shows/:id/retry` validates coin balance, calls debit, re-admits player to current round with a 5-second late-join window. | `backend-architect` | P2-T06, P3-T08 | M |
| P3-T11 | Implement IAP validation service: receive receipt from client (`POST /payments/iap/validate`), validate with Apple App Store Receipt API or Google Play Developer API, credit coins to user on success, record transaction in `iap_transactions` table. Idempotent on transaction ID. | `backend-architect` | P3-T08 | L |
| P3-T12 | Implement powerup inventory: `user_powerups` table (user_id, powerup_type ENUM, quantity). Expose `POST /powerups/purchase` (deduct coins) and `POST /powerups/use` (deduct inventory). P3 powerups: streak_shield, extra_time. | `backend-architect` | P3-T08 | M |

#### Design

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P3-T13 | Design PlayClips feed screen: vertical scroll feed, clip card with game type badge, play button, opponent avatar + score (ghost/real), streak counter in header. | `ui-ux-designer` | P1-T12 | L |
| P3-T14 | Design Spot the Difference game screen: side-by-side or stacked image pair, tap-to-mark UI, miss flash, found confirmation animation, timer. | `ui-ux-designer` | P1-T12 | M |
| P3-T15 | Design match result screen: your score vs opponent score, win/loss/draw treatment, coins earned, "Play Again" and "Next Clip" CTAs. | `ui-ux-designer` | P1-T12 | S |
| P3-T16 | Design coin wallet UI: balance display in header (persistent), earn animation (coins flying to wallet), spend confirmation modal, coin package purchase sheet (3 tiers: 500/1200/3000 coins). | `ui-ux-designer` | P1-T12 | M |
| P3-T17 | Design retry-on-elimination modal: "You've been eliminated" + retry CTA showing coin cost, current balance, confirm/decline. Animate retry re-entry. | `ui-ux-designer` | P2-T13 | S |
| P3-T18 | Design streak screen: streak flame counter, calendar heatmap (last 30 days), streak shield powerup purchase button, longest streak record. | `ui-ux-designer` | P1-T12 | M |

#### Mobile Frontend

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P3-T19 | Build PlayClips feed screen: infinite-scroll vertical FlatList fetching from `GET /clips/feed` with cursor. Render clip card per P3-T13 design. Prefetch next 3 clips on scroll. | `frontend-engineer` | P3-T02, P3-T13 | L |
| P3-T20 | Build Spot the Difference game screen: stream the HLS clip via `expo-av` Video component using the `hls_manifest_cloudfront_url` from the clip record (pause at the designated frame for the "find the difference" moment, or loop a short segment). Implement tap detection with coordinate normalization (0–1 relative to rendered video dimensions), submit normalized coordinates to server, animate found/miss states per P3-T14. | `frontend-engineer` | P3-T04, P3-T14, P3-T27 | L |
| P3-T21 | Build match result screen per P3-T15. Poll `GET /clips/:id/match/:matchId` until result resolves (max 35s), then display outcome. | `frontend-engineer` | P3-T03, P3-T15 | M |
| P3-T22 | Implement coin wallet in frontend: persist balance in Zustand (hydrated from `GET /users/me`), update optimistically on earn events from WebSocket, add balance display to app header. | `frontend-engineer` | P3-T08, P3-T16 | M |
| P3-T23 | Implement coin earn animations: on `coins:earned` WebSocket event, trigger flying-coin animation from action point to header wallet. Use Reanimated 2. | `frontend-engineer` | P3-T16, P3-T22 | M |
| P3-T24 | Build IAP purchase flow: use `expo-in-app-purchases`, display coin package sheet per P3-T16 design, handle purchase lifecycle (pending/fulfilled/failed), call `POST /payments/iap/validate` on receipt, update wallet balance. | `frontend-engineer` | P3-T11, P3-T16 | L |
| P3-T25 | Build retry-on-elimination modal per P3-T17 design. Wire to `POST /shows/:id/retry`, deduct coins in Zustand, re-connect socket to active round on success. | `frontend-engineer` | P3-T10, P3-T17 | M |
| P3-T26 | Build streak screen per P3-T18. Fetch streak data from `GET /streaks/me`, render calendar heatmap (custom component, 30-day rolling window), wire streak shield purchase. | `frontend-engineer` | P3-T06, P3-T18 | M |

### Phase 3 Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Apple/Google IAP sandbox environment friction delays testing | High | Medium | Start IAP integration in day 1 of P3; use sandbox accounts; budget half a day of debugging IAP flows |
| Async matchmaking feels fake to users (always ghost scores) | Medium | Medium | Ghost scores should be drawn from real historical distributions, not fixed values; tune P3-T03 ghost score algorithm with realistic variance |
| Coin economy balance wrong — too easy or too hard to earn | High | Low | Remote config controls all earn rates (P3-T09); tune post-launch without a deploy; log all coin events with reason codes for analysis |
| S3 image delivery too slow for PlayClips (perceived lag) | Medium | High | Pre-sign CDN URLs, use CloudFront with edge caching; images must be < 200KB; add image preloading in feed scroll handler |
| PlayClips and Live Show engines share the WebSocket gateway, creating coupling | Low | Medium | Socket namespaces must be separate: `/live-show` and `/playclips`; enforce this in P2-T02 |

### Phase 3 Definition of Done

- [ ] A raw video can be uploaded by admin, transcoded to HLS by MediaConvert, and delivered via CloudFront to the mobile client
- [ ] A user can swipe through a PlayClips feed, play Spot the Difference against a video clip, and receive a match result with opponent comparison
- [ ] Coins are earned from gameplay and persisted in the ledger with reason codes
- [ ] A successful IAP purchase credits coins to the wallet (tested in sandbox)
- [ ] Retry-on-elimination deducts coins and re-admits player in a live show
- [ ] Streak increments on daily play and can be protected with a coin purchase
- [ ] Both engines (Live Show + PlayClips) run simultaneously without interference
- [ ] All P3 tasks merged, CI green

---

## Phase 4 — Full Game Library + Scale Hardening + LiveOps Maturity

**Human estimate:** 4 weeks
**AI-agent estimate: 4–5 days calendar time**
**Goal:** Complete the full MVP game library (all 7 game types), run a 50-100 player internal dress rehearsal show, harden the system for 10K+ concurrent players, and bring LiveOps tooling to operational maturity (full admin dashboard, analytics pipeline, alerting runbooks).

**CEO Demo:** A fully-produced 50-100 player show with all game types, a live monitoring dashboard showing player counts and system health, an analyst pulling a post-show engagement report, and a product change (elimination rate) being pushed live via feature flags without a deploy.

### Phase 4 Parallelism Map

```
DAY 1 (all agents start concurrently after P3 review)
├── [backend-architect]  P4-T01: Spelling Bee engine          ← independent of P3
├── [backend-architect]  P4-T02: Fruit Cutting engine
├── [backend-architect]  P4-T03: Knife at Center engine
├── [backend-architect]  P4-T09: DB read replicas             ← AWS provisioning, start early
├── [backend-architect]  P4-T10: Analytics event schema       ← no code dependencies
├── [ui-ux-designer]     P4-T16: Spelling Bee screen design
├── [ui-ux-designer]     P4-T17: Fruit Cutting screen design   ← L task
├── [ui-ux-designer]     P4-T18: Knife at Center screen design
└── [ui-ux-designer]     P4-T19: Admin dashboard v2 design    ← L task

DAY 1 → DAY 2 (after P4-T01/T02/T03 complete)
└── [backend-architect]  P4-T04: Extend game sequence schema  ← after T01 + T02 + T03

DAY 2 (scale hardening runs in parallel with game engines)
├── [backend-architect]  P4-T05: k6 load test + optimization   ← L task
├── [backend-architect]  P4-T06: WebSocket connection sharding
├── [backend-architect]  P4-T07: Rate limiting on answer endpoints
└── [backend-architect]  P4-T08: Circuit breaker on external calls

DAY 2 (analytics pipeline, after P4-T10)
├── [backend-architect]  P4-T11: Analytics event emitter service   ← L task, after T10
└── [backend-architect]  P4-T13: Admin show creation v2            ← after T04 + P2-T09

DAY 2 → DAY 3 (after P4-T11)
├── [backend-architect]  P4-T12: Analytics consumer + show summary API   ← L task
└── [backend-architect]  P4-T14: Show scheduling automation cron

DAY 2 → DAY 3 (frontend, designs land ~end of day 1)
├── [frontend-engineer]  P4-T20: Spelling Bee screen          ← after T01 + T16
├── [frontend-engineer]  P4-T22: Knife at Center screen       ← after T03 + T18 (L task)
└── [frontend-engineer]  P4-T23: Find Items game screen       ← after P3-T05 + T17

DAY 3 (Fruit Cutting is XL — give it dedicated time)
└── [frontend-engineer]  P4-T21: Fruit Cutting screen (Skia canvas)  ← XL, after T02 + T17

DAY 3 → DAY 4 (admin dashboard upgrade, after P4-T12 + T13 + T19)
├── [frontend-engineer]  P4-T24: Admin dashboard v2           ← XL, after T12 + T13 + T19
└── [frontend-engineer]  P4-T25: Feature flag + remote config editor  ← after P1-T06 + T07 + T24

DAY 4: Documentation
└── [backend-architect]  P4-T15: CloudWatch alerting runbook

DAY 4 → DAY 5: Dress rehearsal (50-100 simulated players), bug fixes, Nikhil review
```

**Sequential bottleneck chain:** P4-T10 → P4-T11 (L) → P4-T12 (L) → P4-T24 (XL) is the longest chain. P4-T21 (Fruit Cutting, XL) is the highest-risk frontend task and should be started as early as designs allow.

**Note on dress rehearsal:** Running a real 50-100 player test requires coordinating a test session. This is a real-time event that takes a fixed amount of calendar time regardless of AI speed.

**Total calendar time: 4–5 days** (including dress rehearsal coordination + 1 day Nikhil review)

### Phase 4 Tasks

#### Backend — Remaining Game Engines

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P4-T01 | Implement Spelling Bee game engine: server sends a word prompt with a category hint, client submits the spelled word, validate with a dictionary lookup (in-memory word list loaded from S3 JSON), score by correctness + time. | `backend-architect` | P1-T10 | M |
| P4-T02 | Implement Fruit Cutting game engine: server sends a sequence of N fruit items to cut within T seconds (configurable), client sends an ordered list of cut timestamps and positions, server validates count and timing, scores by count * accuracy_multiplier. | `backend-architect` | P1-T10 | M |
| P4-T03 | Implement Knife at Center game engine: server sends a target position and a moving range, client sends a stop timestamp, server calculates deviation from center at that timestamp using the deterministic oscillation formula (position = amplitude * sin(2π * frequency * t + phase)), scores by 1000 - (deviation * 100). | `backend-architect` | P1-T10 | M |
| P4-T04 | Extend show game sequence schema to support all 7 game types. Add game config validation (reject shows with unknown game types at creation time). | `backend-architect` | P2-T03, P4-T01, P4-T02, P4-T03 | S |

#### Backend — Scale Hardening

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P4-T05 | Load test the answer ingestion pipeline (P2-T05) at 10K simulated **concurrent** connections using k6. This is an engineering target: 10K players connected simultaneously, all submitting answers within a round window. Measure and optimize: Redis Streams `XREADGROUP` batch size (`COUNT` parameter), consumer worker concurrency, and Redis connection pool sizing (target pool: minimum 50 connections, max 200 to headroom for burst). Target: < 200ms p99 answer processing latency at 10K concurrent, < 500ms p99 elimination broadcast time. Document bottlenecks and configuration in `/docs/ops/load-test-results-p4.md`. | `backend-architect` | P2-T05 | L |
| P4-T06 | Implement WebSocket connection sharding: assign players to one of N WebSocket pods based on `user_id % num_pods`. Each pod handles a maximum of 1,500 concurrent WebSocket connections (leaving headroom for reconnects and burst). At 10K concurrent players, minimum 7 pods required — auto-scaling (P5-T17) handles this dynamically. Publish show events to all pods via Redis pub/sub. Document the sharding scheme. | `backend-architect` | P2-T02 | L |
| P4-T07 | Implement rate limiting on answer endpoints: max 1 answer per player per round (enforced in Redis with NX SET), max 10 req/s per IP on public endpoints (Redis token bucket). Return HTTP 429 with retry-after header. | `backend-architect` | P1-T03, P2-T05 | M |
| P4-T08 | Implement circuit breaker pattern on external calls (IAP validation, any third-party). Use `opossum` library. Add fallback behaviors: IAP validation failure queues for async retry, not immediate credit. | `backend-architect` | P3-T11 | M |
| P4-T09 | Add database read replicas for leaderboard and analytics queries. Route all read-heavy endpoints (`/leaderboard`, `/analytics/*`, `/clips/feed`) to replica. Write operations stay on primary. | `backend-architect` | P1-T02 | M |

#### Backend — Analytics Pipeline

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P4-T10 | Design analytics event schema: define 20 core events (show_joined, round_started, answer_submitted, player_eliminated, retry_purchased, clip_played, match_completed, coin_earned, coin_spent, iap_initiated, iap_completed, streak_updated, session_started, session_ended, powerup_used, show_ended, leaderboard_viewed, feed_scrolled, clip_skipped, show_scheduled). Each event has: event_name, user_id, session_id, timestamp, properties JSONB. | `backend-architect` | None | M |
| P4-T11 | Implement analytics event emitter service: batch events in memory (max 100 events or 5s), flush via `XADD analytics:events * ...` to a dedicated Redis Stream. Add event emission calls to all relevant game engine and lifecycle handlers. | `backend-architect` | P2-T01, P4-T10 | L |
| P4-T12 | Build analytics consumer: `XREADGROUP` from `analytics:events` stream, write to `analytics_events` Postgres table (partitioned by day). Expose `GET /analytics/shows/:id/summary` (total_players, avg_rounds_survived, elimination_by_round[], total_retries, coins_distributed) for the admin dashboard. | `backend-architect` | P4-T11 | L |

#### Backend — LiveOps Maturity

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P4-T13 | Extend admin show creation to support full game sequences: select game types from the library, configure per-game elimination rate, time limit, coin reward, and order. Preview the full show flow in the API response. | `backend-architect` | P4-T04, P2-T09 | M |
| P4-T14 | Implement show scheduling automation: a cron job (NestJS `@Cron`) checks for shows with `scheduled_at` within the next 5 minutes and transitions them to `lobby_open` state, triggering WebSocket lobby open event. | `backend-architect` | P2-T03 | S |
| P4-T15 | Create CloudWatch alerting runbook: document alert triggers (active_connections > 50K, error_rate > 2%, consumer_lag > 1000ms, p99_latency > 500ms), escalation steps, and common mitigations. Store in `/docs/ops/alert-runbook.md`. | `backend-architect` | P2-T11 | S |

#### Design

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P4-T16 | Design Spelling Bee game screen: word prompt card, letter input keyboard (custom or native), submit button, correct/incorrect animation, difficulty badge. | `ui-ux-designer` | P1-T12 | M |
| P4-T17 | Design Fruit Cutting game screen: fruits falling/flying on canvas, swipe gesture trail animation spec, cut confirmation particle effect, score counter. | `ui-ux-designer` | P1-T12 | L |
| P4-T18 | Design Knife at Center game screen: oscillating blade visual (pendulum arc), stop button, deviation feedback (bullseye rings), score pop. | `ui-ux-designer` | P1-T12 | M |
| P4-T19 | Design full admin dashboard v2: tabbed layout with Shows (list + create + live stats), Content (question sets, clips with transcode status, game configs), Analytics (show summaries, retention charts stub), Config (feature flags editor, remote config editor). **Responsive at 375px and 1280px** — all tabs must be navigable and all forms usable on a phone browser. Tab navigation collapses to a bottom nav bar on mobile. Deliver Figma frames at both breakpoints for each tab. | `ui-ux-designer` | P2-T16 | L |

#### Mobile Frontend — Remaining Games

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P4-T20 | Build Spelling Bee game screen per P4-T16. Implement custom letter input, submission, and feedback animations. Wire to show WebSocket flow. | `frontend-engineer` | P4-T01, P4-T16 | M |
| P4-T21 | Build Fruit Cutting game screen per P4-T17. Implement Canvas-based fruit rendering (React Native Skia), swipe gesture detection (react-native-gesture-handler), and cut animation using Reanimated 2. Submit cut data to server. | `frontend-engineer` | P4-T02, P4-T17 | XL |
| P4-T22 | Build Knife at Center game screen per P4-T18. Implement oscillating blade animation using Reanimated 2 with a deterministic oscillation formula (matching server). Submit stop timestamp to server for scoring. | `frontend-engineer` | P4-T03, P4-T18 | L |
| P4-T23 | Build Find Items game screen: stream the scene video via `expo-av` using the HLS URL from P3-T27 (same pattern as P3-T20), overlay hidden item tap targets (normalized bounding boxes from clip metadata), implement tap detection with coordinate normalization per P3-T20 pattern. **Wire to BOTH engines:** (a) PlayClips async flow — submit taps to REST game endpoint; (b) Live Show WebSocket flow — wait for `game:question` event to reveal the scene, submit answers via `POST /games/:showId/answer`, animate result on `game:result`. The game screen component accepts a `mode` prop (`playclips | liveshow`) to branch the submission path. | `frontend-engineer` | P3-T05, P3-T27, P4-T17 | L |

#### Admin Dashboard Upgrade

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P4-T24 | Upgrade admin dashboard to v2 per P4-T19: implement tabbed layout (bottom nav bar on mobile, sidebar on desktop via TailwindCSS responsive classes), show builder with game sequence drag-and-drop ordering (`@dnd-kit/core` with touch support for mobile use), live stats panel with WebSocket push (use the admin socket from P2-T10), analytics summary tab, Content tab showing clip list with transcode status from P3-T27. **All interactions must work on a touch screen at 375px** — buttons minimum 44px tap targets, no hover-only affordances. This is a **React + TailwindCSS** app continuing from P2-T24. | `frontend-engineer` | P4-T12, P4-T13, P4-T19 | XL |
| P4-T25 | Build feature flag and remote config editor in admin dashboard: list all flags/configs with current values, inline edit + save (calls admin API), show last-modified user and timestamp. | `frontend-engineer` | P1-T06, P1-T07, P4-T24 | M |

### Phase 4 Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Fruit Cutting Canvas performance on low-end Android devices | High | Medium | Use React Native Skia (GPU-accelerated); profile on a Moto G class device; simplify particle effects if < 30fps |
| Knife at Center client/server timing divergence causes unfair scoring | High | High | Both client and server use the same deterministic formula with the same seed from the `game:start` event; server result is authoritative but deviation > 50ms is flagged for audit |
| Analytics pipeline becomes a scope sink | Medium | Medium | Analytics in P4 is write-only (emit and store); no dashboards in the app; only admin-facing show summary |
| k6 load test reveals Redis Streams consumer workers are the bottleneck | Low | High | Pre-mitigate by running multiple XREADGROUP workers per pod; scale Game Logic Worker pods horizontally; if throughput ceiling is hit, Redis Streams supports 100K+ writes/s per shard |
| Admin dashboard v2 scope too large for one phase | Medium | Medium | P4-T24 is XL; if it slips, defer analytics tab to P5 — the show builder and live stats are the must-haves for the demo |

### Phase 4 Definition of Done

- [ ] All 7 game types are playable end-to-end; Find Items is verified in **both** Live Show and PlayClips contexts (P4-T23)
- [ ] A 50-100 player internal dress rehearsal show has been run with no critical failures
- [ ] k6 load test shows < 200ms p99 answer processing at 10K **concurrent** simulated players (all connected simultaneously, not sequentially)
- [ ] Analytics events are flowing and the post-show summary API returns accurate data
- [ ] Feature flags and remote config are editable via the admin dashboard without a deploy
- [ ] Alert runbook is documented
- [ ] All P4 tasks merged, CI green

---

## Phase 5 — Soft Launch + Growth Mechanics

**Human estimate:** 3 weeks
**AI-agent estimate: 3–4 days calendar time**
**Goal:** Run a real soft-launch show with 10K+ external players, complete the social and growth loops (profiles, sharing, referrals), and validate engagement metrics. Platform is now operationally monitored and ready for scaling to 100K+.

**CEO Demo:** A live soft-launch show with real player counts visible on the monitoring dashboard, a post-show analytics report showing retention and coin spend data, a replay clip shared from the app opening in a browser, and a referral link tracked end-to-end.

### Phase 5 Parallelism Map

```
DAY 1 (all agents start concurrently after P4 review)
├── [backend-architect]  P5-T01: User profile service         ← independent, only needs P1-T04
├── [backend-architect]  P5-T02: Share clip feature
├── [backend-architect]  P5-T03: Referral system              ← after P3-T08 (coin ledger)
├── [backend-architect]  P5-T04: Push notification service    ← L task, start immediately
├── [backend-architect]  P5-T05: Show replay storage          ← after P2-T01 (Redis Streams)
├── [ui-ux-designer]     P5-T07: User profile screen design
├── [ui-ux-designer]     P5-T08: Share card design
├── [ui-ux-designer]     P5-T09: Referral screen design
└── [ui-ux-designer]     P5-T10: Notification permission prompt design

DAY 1 → DAY 2 (after P5-T04 complete, and designs land)
├── [frontend-engineer]  P5-T11: User profile screen          ← after T01 + T07
├── [frontend-engineer]  P5-T12: Share clip feature           ← after T02 + T08
├── [frontend-engineer]  P5-T13: Referral screen              ← after T03 + T09
├── [frontend-engineer]  P5-T14: Push notification registration  ← after T04 + T10
└── [frontend-engineer]  P5-T15: Deep link handling           ← after T02 + T03

DAY 2 (scale validation runs in parallel with frontend)
├── [backend-architect]  P5-T16: Staged load test 1K→5K→10K   ← L task
└── [backend-architect]  P5-T17: ECS auto-scaling config

DAY 2 → DAY 3 (after P4-T15)
└── [backend-architect]  P5-T06: Show operational runbook

DAY 3: Pre-launch checklist execution, staging environment validation
DAY 3 → DAY 4: Soft launch show (real 10K players — fixed calendar event), post-show analytics review, Nikhil review
```

**Sequential bottleneck chain:** P5-T16 (staged load test, must run sequentially 1K → 5K → 10K) and the soft launch show itself are real-time events with minimum durations. The actual show cannot be compressed regardless of agent speed.

**Note on the soft launch:** The show itself takes real calendar time to run and recover from. Budget a full day for pre-show prep, the show, and post-show analysis.

**Total calendar time: 3–4 days** (including soft launch show day + 1 day Nikhil review)

### Phase 5 Tasks

#### Backend — Growth & Social

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P5-T01 | Implement user profile service: `user_profiles` table (display_name, avatar_url, coins_earned_lifetime, shows_played, best_rank, current_streak). Expose `GET /users/:id/profile` and `PATCH /users/me/profile`. | `backend-architect` | P1-T04 | M |
| P5-T02 | Implement share clip feature: generate a short-lived signed URL for a PlayClip result (score, clip thumbnail, match outcome) hosted on a `/share/:token` web page served by NestJS. URL expires after 7 days. Include Open Graph meta tags for link previews. | `backend-architect` | P3-T03 | M |
| P5-T03 | Implement referral system: generate unique referral codes per user, store in `referral_codes` table, track conversion in `referral_conversions` (referrer_id, referred_id, converted_at, reward_credited). Credit both parties on referred user's first IAP. | `backend-architect` | P3-T08 | M |
| P5-T04 | Implement push notification service: integrate AWS SNS for mobile push (APNs + FCM). Events that trigger push: show_starting_in_15min, streak_at_risk (23h since last play), you_were_mentioned. Respect opt-out preferences. | `backend-architect` | P1-T04 | L |
| P5-T05 | Implement show replay storage: after show ends, a Redis Streams consumer reads the full `show:{showId}:events` stream, materializes an ordered JSON event log, and stores it in S3. Expose `GET /shows/:id/replay` returning the S3 presigned URL. | `backend-architect` | P2-T01 | M |
| P5-T06 | Build operational runbook for a 10K player show: pre-show checklist (Redis warm-up, Streams PEL check, connection pool headroom), during-show monitoring steps, post-show cleanup (flush leaderboard to DB, XTRIM answer streams, archive Redis keys). Store in `/docs/ops/show-runbook.md`. | `backend-architect` | P4-T15 | S |

#### Design

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P5-T07 | Design user profile screen: avatar, display name, stats (shows played, best rank, lifetime coins, streak), recent game history list. | `ui-ux-designer` | P1-T12 | M |
| P5-T08 | Design share card: landscape card template for PlayClip results — game type icon, score, vs opponent score, win/loss badge, Euphoria logo, deep link URL. Renders as a static image for share sheet. | `ui-ux-designer` | P1-T12 | M |
| P5-T09 | Design referral screen: your referral code display, share button, referred friends list (name, status: invited/joined/converted), your pending reward indicator. | `ui-ux-designer` | P1-T12 | S |
| P5-T10 | Design notification permission prompt: custom pre-permission screen explaining value (never miss a show, streak reminders), accept/decline CTAs. | `ui-ux-designer` | P1-T12 | S |

#### Mobile Frontend

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P5-T11 | Build user profile screen per P5-T07 design. Add avatar picker (select from preset library, upload from camera roll via expo-image-picker, upload to S3). | `frontend-engineer` | P5-T01, P5-T07 | M |
| P5-T12 | Implement share clip: on match result screen, add "Share" button. Use `expo-sharing` to share the signed URL from P5-T02. Render a static share card image (using react-native-view-shot) per P5-T08 design. | `frontend-engineer` | P5-T02, P5-T08 | M |
| P5-T13 | Build referral screen per P5-T09. Display code, wire share button to native share sheet. Fetch referred friends list from API. | `frontend-engineer` | P5-T03, P5-T09 | M |
| P5-T14 | Implement push notification registration: request permission with custom pre-prompt screen per P5-T10, register device token with `POST /notifications/register`, handle foreground notification display. | `frontend-engineer` | P5-T04, P5-T10 | M |
| P5-T15 | Implement deep link handling: configure Expo `scheme` and Universal Links. Handle inbound deep links for: share clip (`/share/:token` → open PlayClips with result), show invite (`/shows/:id` → open lobby), referral (`/r/:code` → register referral). | `frontend-engineer` | P5-T02, P5-T03 | M |

#### Scale Validation

| Task ID | Description | Agent | Dependencies | Complexity |
|---|---|---|---|---|
| P5-T16 | Run a staged load test targeting **10K concurrent players** (not 10K total): 1K → 5K → 10K concurrent WebSocket connections on staging environment, all connections live simultaneously at each tier. Measure: connection establishment time at peak, p50/p95/p99 answer processing latency, elimination broadcast propagation time across all pods, Redis connection pool utilization (must stay below 80% of max pool size of 200), memory per pod at 1,500 connections. Pass criteria: all 10K players receive the elimination broadcast within 1 second. Document results in `/docs/ops/load-test-results-p5.md`. | `backend-architect` | P4-T05, P4-T06 | L |
| P5-T17 | Implement auto-scaling: configure ECS service auto-scaling on `active_connections_per_pod > 1,200` (scale out, leaving 300-connection headroom per pod before hitting the 1,500 limit) and `active_connections_per_pod < 300` (scale in, with 10-min cooldown). Pre-warm: scale to minimum 8 pods 10 minutes before any scheduled show (automate via the show lifecycle cron in P4-T14) to handle 10K concurrent from show open. Test scale-out triggers in staging with simulated connection ramp. | `backend-architect` | P2-T11 | M |

### Phase 5 Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Push notification permission rates too low to matter | High | Low | The pre-permission screen (P5-T10) is specifically designed to improve opt-in rates; do not request without the pre-prompt |
| Soft launch show attracts coordinated cheating (answer bots) | Medium | High | Rate limiting (P4-T07) is the first line of defense; add a honeypot: inject 1 impossible question per show and flag users who answer it correctly |
| Deep link handling fails on cold-start (Expo limitation) | Medium | Medium | Test cold-start deep link flow explicitly on both iOS and Android before soft launch; known Expo issue with Universal Links on iOS cold start |
| ECS auto-scaling too slow for sudden show spike | Medium | High | Pre-warm: scale to minimum 5 pods 10 minutes before scheduled show start (automate this as part of the show lifecycle cron in P4-T14) |
| Share URL generates low viral coefficient | Medium | Low | Share card design must show a compelling score ("I scored 8,420 — beat me!"); tune copy post-launch; not a blocking risk |

### Phase 5 Definition of Done

- [ ] A real soft-launch show with 10K+ **concurrent** players has been run without critical incidents
- [ ] Post-show analytics report generated and reviewed (retention, coins, retries)
- [ ] Share clip flow works end-to-end with correct Open Graph preview
- [ ] Referral code tracked from share → install → conversion in the database
- [ ] Push notifications delivered to iOS and Android test devices
- [ ] Auto-scaling tested in staging: pods scale out under simulated load
- [ ] All P5 tasks merged, CI green

---

## Cross-Cutting Concerns (All Phases)

These are ongoing responsibilities, not one-time tasks. They apply throughout every phase.

### Security
- All admin endpoints require an `admin` JWT scope checked server-side. Never trust the client.
- All user-submitted coordinates, answers, and timestamps are validated server-side. The client is untrusted.
- S3 buckets are private; all content is served via signed CDN URLs.
- No secrets in code or environment variables in the repo. Use AWS Secrets Manager.

### Testing Standards
- Unit tests for all game engine scoring functions (deterministic input → expected output).
- Integration tests for all Redis Streams producer/consumer flows (XADD → XREADGROUP → XACK round-trip).
- E2E test for the critical path: guest auth → join show → play round → answer → receive result.
- All tests must pass in CI before any merge to main.

### Agent Execution Rules
- Each task is designed to be executed by a single agent without ambiguity. If an agent needs information from another agent's output (e.g., an API contract), that contract must be committed to `/docs/api/` before the dependent task begins.
- Design tasks must produce both Figma frames and a written spec. The written spec is the authoritative handoff document for the frontend-engineer agent.
- The backend-architect must document all new API endpoints in `/docs/api/` using OpenAPI 3.0 format before marking a task done.

---

## Dependency Graph Summary

```
P1 (Foundation)
├── All auth, DB, feature flags, remote config, Trivia + basic shell
└── Feeds into every subsequent phase

P2 (Live Show Engine)
├── Requires P1 auth, DB, Redis
├── WebSocket + Redis Streams consumer groups are new infrastructure introduced here
└── Admin dashboard v1 introduced here

P3 (PlayClips + Monetization)
├── Requires P1 coin ledger foundation
├── Requires P2 WebSocket (retry flow)
└── IAP is independent but depends on coin ledger

P4 (Full Library + Hardening)
├── Remaining games require P1 engine pattern
├── Scale hardening builds on P2 pipeline
├── Analytics builds on P2 Redis Streams
└── Admin v2 builds on P2 admin v1

P5 (Soft Launch + Growth)
├── Social features are independent of game engines
├── Push notifications require P1 auth
├── Auto-scaling requires P2 CloudWatch metrics
└── Scale validation requires P4 load test baseline
```

---

## Milestone Summary

| Milestone | Phase | Human Target | AI-Agent Target | Demo Artifact |
|---|---|---|---|---|
| M1: First Playable | P1 | Week 3 | **Day 4** | Live Trivia on device, admin-managed content |
| M2: Live Show Beta | P2 | Week 7 | **Day 10** | 4-player synchronized show with host controls |
| M3: Dual Engine + Monetization | P3 | Week 11 | **Day 16** | PlayClips + IAP + coin retry working together |
| M4: Full Game Library + Scale | P4 | Week 15 | **Day 22** | All 7 games, 50-player dress rehearsal, live monitoring |
| M5: Soft Launch | P5 | Week 18 | **Day 27** | Real 10K **concurrent** player show, analytics, growth loops live |

**Total compressed timeline: ~27 calendar days** (vs. 18 human weeks = 126 calendar days)
**Compression ratio: approximately 4.7x**

### What accounts for the remaining calendar time at AI speed
The plan does not compress to zero because of five categories of irreducible real-world latency:

1. **AWS infrastructure provisioning** — RDS, ElastiCache, ECS, and auto-scaling configurations take real time to provision regardless of who runs the commands. Estimated 2–4 hours per phase for new infra. (No MSK provisioning needed — Redis Streams runs on the existing ElastiCache cluster.)
2. **Integration testing and multi-device test runs** — Synchronized multi-player flows require real devices running real connections. These sessions have minimum durations.
3. **IAP sandbox environment** — Apple and Google review and sandbox environments operate on their own clocks. Budget half a day in P3 for this.
4. **Nikhil review between phases** — 1 day per phase (5 days total across 5 phases) for human approval before proceeding.
5. **The soft launch show itself** — A real 10K player show is a real-time event. It cannot be simulated faster than it runs.

---

## Open Decisions (Must Resolve Before Execution)

All five original open decisions have been locked as of 2026-03-27. See the **Decisions Log** at the top of this file.

No open decisions remain at this time. If new decisions arise during execution, add them here with a status of OPEN and the phase they block.
