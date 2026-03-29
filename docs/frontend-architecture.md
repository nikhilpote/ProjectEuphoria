# Euphoria — Frontend Architecture Plan (MVP Phase 1)

> Authored: 2026-03-27
> Scope: Mobile-first MVP covering Live Shows and PlayClips feed
> Target persona: Thrill Seekers aged 18–35, heavy TikTok/Reels users, mid-range Android + iOS

---

## Table of Contents

1. [Technology Stack](#1-technology-stack)
2. [App Structure and Navigation](#2-app-structure-and-navigation)
3. [State Management](#3-state-management)
4. [Game Engine / Renderer Approach](#4-game-engine--renderer-approach)
5. [Real-Time Communication Layer](#5-real-time-communication-layer)
6. [PlayClips Feed Architecture](#6-playclips-feed-architecture)
7. [Animation and Effects System](#7-animation-and-effects-system)
8. [Offline and Poor Connectivity Handling](#8-offline-and-poor-connectivity-handling)
9. [Push Notification Strategy](#9-push-notification-strategy)
10. [Performance Budget and Optimization](#10-performance-budget-and-optimization)

---

## 1. Technology Stack

### Recommendation: React Native (Expo SDK 53+) with selective native modules

**Decision summary:**

| Criterion | React Native (Expo) | Flutter | Native (Swift/Kotlin) |
|---|---|---|---|
| Code sharing | ~85–90% shared | ~85–90% shared | 0% |
| Hire-ability | Large talent pool | Growing, smaller | Separate iOS + Android teams |
| Animation fidelity | Reanimated 3 (UI thread) | Impeller (very good) | Best |
| Game rendering | Skia (react-native-skia) | Canvas/CustomPaint | Metal/Vulkan |
| OTA updates | Expo Updates (critical) | Shorebird (third-party) | App Store only |
| Ecosystem fit | Strong (TikTok-style feeds well-proven) | Moderate | Excellent |
| WebSocket ecosystem | Battle-tested | Moderate | Excellent |

**Why React Native over Flutter:**

The two primary drivers are **OTA (over-the-air) hot updates** and **team velocity**.

During a live show with 1M concurrent players, a critical bug fix must ship in seconds — not hours through app store review. Expo's EAS Update allows silent OTA patches to JS bundles. This capability is architecturally non-negotiable for a live event product.

React Native's ecosystem also maps more directly to this product's needs: `react-native-skia` gives a production-ready 2D canvas on the UI thread for all 7 game types, `react-native-reanimated` v3 enables 60fps animations driven from the JS or worklet thread, and `react-native-video` handles HeyGen AI host streams.

**Core dependency list:**

```
Expo SDK 53 (managed workflow, bare ejection path available)
React Native 0.77
React Native Skia 1.x          — game canvas rendering
React Native Reanimated 3.x    — 60fps animations, worklets
React Native Gesture Handler 2.x — touch input for all games
React Native Video 6.x         — AI host stream (HLS/DASH)
Expo Router 4.x                — file-based navigation
Expo Notifications             — push notification handling
Expo AV                        — sound effects, elimination audio
Expo Updates                   — OTA hot patching
Zustand 5.x                    — global state (lightweight, no boilerplate)
TanStack Query 5.x             — server state, API layer caching
Socket.io-client 4.x           — WebSocket transport with fallback
MMKV (react-native-mmkv)       — fast synchronous local storage (coins, streak, prefs)
React Native FlashList 1.x     — high-perf virtualized list for PlayClips
Shopify/react-native-skia      — shared canvas with React Native Skia (same lib)
React Native IAP 12.x          — in-app purchases (coins)
Sentry React Native            — error tracking + session replays
```

**Ejection strategy:** Start with Expo managed workflow. Eject to bare workflow only if a native module requires it (e.g., custom audio routing for show SFX, Bluetooth controller support). The Skia and Reanimated requirements are satisfied within managed workflow.

---

## 2. App Structure and Navigation

### Navigation library: Expo Router 4 (file-based, built on React Navigation 7)

Expo Router gives deep-link URLs out of the box, which is required for push notification tap-to-screen routing (e.g., tapping a "show starts in 5 min" notification opens `/show/[showId]/lobby` directly).

### Directory structure

```
src/
  app/                          # Expo Router file-based routes
    _layout.tsx                 # Root layout: auth gate, global providers
    index.tsx                   # Entry: redirects to /clips or /show depending on context
    (tabs)/
      _layout.tsx               # Bottom tab navigator
      clips/
        index.tsx               # PlayClips main feed
        [clipId].tsx            # Deep-linked single clip (share target)
      show/
        index.tsx               # Show schedule / next show countdown
      leaderboard/
        index.tsx               # Global + friend leaderboard
      profile/
        index.tsx               # Profile, coins, history
    show/
      [showId]/
        _layout.tsx             # Show session provider
        lobby.tsx               # Waiting room, player count, host intro
        game.tsx                # Active game screen (routes sub-game by type)
        spectator.tsx           # Post-elimination spectator view
        results.tsx             # Prize distribution, highlight reel
    onboarding/
      index.tsx                 # FTUE: 10-second signup
      simulation.tsx            # 3-game mini simulation
    auth/
      login.tsx
      register.tsx
    store/
      index.tsx                 # Coin shop / IAP
    modals/
      daily-reward.tsx          # Daily reward calendar (presented as modal)
      elimination.tsx           # Elimination overlay (full-screen modal)
      retry.tsx                 # Retry offer overlay
      streak-protection.tsx     # Streak protection purchase prompt

  components/
    games/                      # Game renderers (see Section 4)
      GameCanvas.tsx            # Shared Skia canvas wrapper
      Trivia.tsx
      SpotTheDifference.tsx
      QuickMath.tsx
      SpellingBee.tsx
      FruitCutting.tsx
      KnifeAtCenter.tsx
      FindItems.tsx
    feed/                       # PlayClips feed components
      ClipPlayer.tsx
      ClipOverlay.tsx           # Like, share, streak UI over clip
      FeedList.tsx
    show/
      GameTimer.tsx             # Countdown ring, ticking
      PlayerCount.tsx           # Live player count badge
      HostVideo.tsx             # HeyGen AI host stream
      EliminationOverlay.tsx
      PowerupBar.tsx
    ui/                         # Design system primitives
      CoinBalance.tsx
      StreakBadge.tsx
      Button.tsx
      ...

  store/                        # Zustand slices
    useAuthStore.ts
    useShowStore.ts
    useClipsStore.ts
    useEconomyStore.ts          # Coins, streaks, powerups

  hooks/
    useShowSocket.ts            # WebSocket lifecycle for live show
    useClipSocket.ts            # Async matchmaking socket for PlayClips
    useGameTimer.ts             # Shared countdown hook (Reanimated driven)
    useHaptics.ts               # Haptic feedback wrapper
    useSound.ts                 # Expo AV sound preloading + playback

  lib/
    socket.ts                   # Socket.io singleton + reconnect logic
    api.ts                      # TanStack Query axios client
    mmkv.ts                     # MMKV instance + typed accessors
    analytics.ts                # Event tracking wrapper

  constants/
    games.ts                    # Game type enum, timing constants
    economy.ts                  # Coin costs, streak thresholds
    theme.ts                    # Colors, typography, spacing
```

### Navigation flow diagram

```
App Launch
  └─ Auth gate (_layout.tsx)
       ├─ Not authed → /onboarding
       │     └─ /onboarding/simulation → /clips (with push permission request)
       └─ Authed
             ├─ Show time (push tap) → /show/[id]/lobby
             └─ Default → /(tabs)/clips (PlayClips feed)

/(tabs) — persistent bottom nav
  ├─ Clips        (home, default)
  ├─ Shows        (schedule + countdown)
  ├─ Leaderboard
  └─ Profile

/show/[showId]/ — modal stack over tabs (covers full screen)
  lobby → game → [elimination modal] → spectator OR game (continues)
                └─ [retry modal] → game (if retried)
       └─ results
```

The show flow is rendered as a **full-screen modal stack** that slides over the tab navigator. This allows the tab bar to be instantly accessible when the show ends without a navigator reset.

---

## 3. State Management

### Layered approach: Zustand (client state) + TanStack Query (server state) + MMKV (persistent local state)

The reasoning is separation of concerns: server-fetched data that can be stale is owned by TanStack Query. Ephemeral, synchronous in-session state (game round, player count, current game type) lives in Zustand. Anything that must survive an app kill (coin balance, streak count, user prefs) is committed to MMKV synchronously after each mutation.

### Zustand stores

**`useShowStore`** — the most critical store during a live event:

```typescript
interface ShowState {
  showId: string | null;
  phase: 'idle' | 'lobby' | 'game' | 'eliminated' | 'spectating' | 'results';
  currentRound: number;           // 1-12
  totalRounds: number;
  currentGameType: GameType | null;
  roundStartsAt: number | null;   // server epoch ms (for timer sync)
  roundEndsAt: number | null;
  playerCount: number;            // live count from server
  survivorCount: number;
  myAnswer: string | null;        // submitted answer this round
  answerLocked: boolean;
  isEliminated: boolean;
  retryCount: number;             // escalating cost gate
  retryAvailable: boolean;
  spectatorMode: boolean;

  // Actions
  setPhase: (phase: ShowState['phase']) => void;
  enterRound: (round: RoundPayload) => void;
  submitAnswer: (answer: string) => void;
  triggerElimination: () => void;
  retryWithCoins: () => void;
  enterSpectator: () => void;
}
```

**`useEconomyStore`** — persisted to MMKV on every write:

```typescript
interface EconomyState {
  coins: number;
  streakCount: number;            // PlayClips session streak
  streakMultiplier: 1 | 1.5 | 2 | 3;
  streakProtectionActive: boolean;
  lastDailyRewardDate: string | null;

  addCoins: (amount: number) => void;
  spendCoins: (amount: number) => boolean; // returns false if insufficient
  incrementStreak: () => void;
  breakStreak: () => void;
  activateStreakProtection: () => void;
}
```

**`useClipsStore`** — PlayClips session state (not persisted):

```typescript
interface ClipsState {
  activeClipId: string | null;
  myAnswer: string | null;
  roundResult: 'correct' | 'incorrect' | null;
  setActiveClip: (clipId: string) => void;
  submitClipAnswer: (answer: string) => void;
}
```

### Server state (TanStack Query)

- `useShowSchedule()` — upcoming shows, polling every 60s
- `useShowLeaderboard(showId)` — post-show prize distribution
- `useClipFeed(cursor)` — paginated PlayClips feed (infinite query)
- `useClipLeaderboard(clipId)` — per-clip leaderboard
- `useProfile()` — user profile, coin history

TanStack Query's `staleTime` and `gcTime` are tuned per query. The clip feed uses `infiniteQuery` with cursor-based pagination and prefetches the next page when the user is 3 clips from the end.

### Real-time state updates

During a live show, WebSocket events from the server drive `useShowStore` mutations directly. The store is the single source of truth — the socket handler calls store actions, and React components re-render reactively. There is no intermediate event bus.

```
Socket event received → showSocket handler → zustand action → component re-render
```

---

## 4. Game Engine / Renderer Approach

### Core principle: shared Skia canvas, game-type-specific logic modules

All 7 game types render inside a single `GameCanvas` component backed by `react-native-skia`. This gives us:
- Consistent 60fps rendering on the UI thread (Skia runs natively, not in JS)
- Shared timer ring, feedback flash, and result overlay — implemented once
- Gesture handler integration via `react-native-gesture-handler` composited directly into the Skia layer
- No WebView, no Expo GL — pure native 2D

### `GameCanvas` wrapper

```typescript
// components/games/GameCanvas.tsx
// Renders the shared chrome (timer ring, player count bar, answer feedback flash)
// and delegates the inner game area to the active game renderer.

interface GameCanvasProps {
  gameType: GameType;
  roundPayload: RoundPayload;     // server-sent game data (question, image URLs, etc.)
  onAnswer: (answer: string) => void;
  timeRemaining: SharedValue<number>; // Reanimated shared value from useGameTimer
}
```

The `timeRemaining` is a Reanimated `SharedValue<number>` that drives the timer ring arc on the UI thread without any JS involvement. This is critical for visual accuracy when the JS thread is busy (network events, elimination logic).

### Per-game implementation strategy

| Game Type | Rendering approach | Input mechanism | Key challenge |
|---|---|---|---|
| Trivia/Quiz | Skia text + Skia RoundedRect buttons | Tap (Gesture Handler TapGesture) | Animate correct/wrong flash at answer lock |
| Spot the Difference | Two Skia Image layers + hit-area overlays | Tap at coordinates | Image preloading, difference circle reveal |
| Quick Math | Skia text rendering | Tap on answer tiles | Speed: disable JS re-renders during 10s window |
| Spelling Bee | React Native TextInput + Skia decorative layer | Native keyboard | Keyboard avoidance on small screens |
| Fruit Cutting | Skia Path drawing (trail) + fruit sprites | Pan gesture (velocity tracking) | Trail rendering at 60fps, collision detection in worklet |
| Knife at Center | Skia animated spinning disc, knife throw | Tap (timing-based) | Precise timing: measure tap latency compensation |
| Find Items | Skia Image + tap-to-mark interaction | Tap at coordinates | Scrollable/zoomable canvas (Pinch + Pan) |

### Shared game infrastructure

```
hooks/useGameTimer.ts
  — Creates a Reanimated SharedValue countdown from roundEndsAt (server epoch)
  — Corrects for local clock drift against server time (see Section 5)
  — Emits 'timeup' event via runOnJS when it reaches 0

hooks/useGameInput.ts
  — Wraps the submission pipeline: answer → lock UI immediately → queue for socket send
  — Prevents double-submission
  — Triggers haptic feedback on submission

lib/gameAssets.ts
  — Preloads all image assets for the next round while current round is active
  — Uses Expo Image (Expo SDK 53) which has a persistent disk cache
  — Assets for the current show are bundled as part of the show manifest
    received in the lobby phase
```

### Show manifest preloading

When a player enters the show lobby, the server sends a `show_manifest` payload containing:
- Ordered list of game types for all 12 rounds
- Asset URLs for image-heavy games (Spot the Difference images, Find Items scenes)
- Question text (encrypted, decrypted client-side 500ms before round starts)

The client immediately starts background-downloading all assets. By round 1, rounds 2-12 assets are fully cached. This eliminates mid-show loading delays entirely.

---

## 5. Real-Time Communication Layer

### Transport: Socket.io client v4 over WebSocket (WSS), HTTP long-poll fallback

Socket.io is chosen over raw WebSocket for its automatic reconnection, namespace support, and acknowledgement mechanism. The acknowledgement system is used for answer submission to guarantee the server received the answer before the round ends — raw fire-and-forget is not acceptable when coins are at stake.

### Socket architecture

```
lib/socket.ts — singleton Socket.io client

Namespaces:
  /show     — live show events (high-priority, dedicated connection)
  /clips    — PlayClips matchmaking and scoring
  /presence — player count updates (can be lower frequency)
```

Two separate socket connections (/show and /clips) ensure that PlayClips traffic does not interfere with show latency.

### Show socket event contract

**Inbound (server → client):**

```
show:lobby_update    { playerCount, hostVideoTimestamp }
show:round_start     { round, gameType, payload, startsAt, endsAt, serverTime }
show:round_result    { correctAnswer, survivorCount, eliminatedCount }
show:player_eliminated { retryAvailable, retryCostCoins }
show:round_end_soon  { secondsRemaining: 3 }   // final countdown pulse
show:show_complete   { winnersCount, prizePool, highlightReelUrl }
show:player_count    { count }                  // 500ms cadence during lobby
```

**Outbound (client → server):**

```
show:answer_submit   { roundId, answer, clientTimestamp }
  → ack: { received: true, serverTimestamp }

show:request_retry   { showId, roundId }
  → ack: { approved: true, coinsDeducted: number } | { approved: false, reason }

show:spectate        { showId }
```

### Clock synchronization and latency compensation

The most dangerous UX failure in a live show is a player submitting an answer they believe is on time, only to have it rejected server-side because of clock drift or network latency. The mitigation:

**NTP-style offset calculation at session start:**

```typescript
// On show socket connect, perform 3 round-trip measurements
async function syncServerClock(socket: Socket): Promise<number> {
  const measurements: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const serverTime: number = await socket.emitWithAck('ping_time', {});
    const t1 = Date.now();
    const rtt = t1 - t0;
    const offset = serverTime + rtt / 2 - t1;
    measurements.push(offset);
  }
  // Use median to eliminate outliers
  measurements.sort((a, b) => a - b);
  return measurements[1]; // median of 3
}

// Store as serverClockOffset in showStore
// All timer calculations use: Date.now() + serverClockOffset
```

**Answer submission grace window:** The server accepts answers up to 300ms past `roundEndsAt` to accommodate legitimate network delay. The client locks input UI at `roundEndsAt - 100ms` (server time adjusted) so the player cannot see a "submit" interaction that the server will reject.

**Reconnection strategy:**

```typescript
const socket = io(SHOW_ENDPOINT, {
  transports: ['websocket', 'polling'],
  reconnectionDelay: 500,
  reconnectionDelayMax: 2000,
  reconnectionAttempts: 10,
  timeout: 5000,
});

socket.on('reconnect', () => {
  // Immediately re-emit current show join + request current round state
  socket.emit('show:rejoin', { showId, lastKnownRound: showStore.currentRound });
  // Server responds with show:state_sync to bring client back in sync
});
```

### Backpressure and message flooding

During mass elimination events (e.g., 200K players eliminated simultaneously), the server should batch `show:player_count` updates to 1-second intervals rather than per-elimination events. The client-side `PlayerCount` component uses a spring animation to smoothly count down — it does not need per-elimination precision.

---

## 6. PlayClips Feed Architecture

### Component: FlashList-based infinite vertical scroll

`@shopify/flash-list` is used instead of `FlatList` because it recycles item views (like RecyclerView on Android) rather than unmounting/remounting them. For a TikTok-style feed where items are heavy (video/canvas), this is essential to maintain 60fps scrolling.

### Feed data model

```typescript
interface Clip {
  id: string;
  gameType: GameType;
  gamePayload: RoundPayload;     // the actual game data
  videoThumbnailUrl: string;     // static preview before interaction
  creatorDisplayName: string;    // "From last night's show"
  playerCountWhenLive: number;   // "Played by 847K people"
  clipLeaderboardEntry: { rank: number; score: number } | null;
  duration: number;              // seconds (10-20)
}
```

### Preloading strategy

The feed maintains a **3-clip window** of pre-rendered game canvases:

- Current clip: fully interactive, timer running
- Next clip (+1): game canvas mounted, assets loaded, timer paused
- Previous clip (-1): kept mounted for backwards swipe (users do go back)

Clips outside this window are unmounted. The FlashList `overrideItemLayout` is used to enforce full-screen item height, preventing partial renders.

```typescript
// hooks/useClipPreloader.ts
// Watches activeIndex from FlashList scroll events
// When activeIndex changes, preloads index+1 and +2 game assets
// Disposes index-2 and below from asset cache
```

### Async matchmaking for PlayClips

Each clip has its own micro-lobby. When a player opens a clip, they join the clip's matchmaking room:

```
clips:join_clip    { clipId }
  → server assigns to a "wave" (group of 50-200 concurrent players)
  → clips:wave_ready { waveId, startAt, participantCount }
  → all players in wave see synchronized countdown
  → clip plays simultaneously
  → clips:wave_result { leaderboard: top10, myScore, myRank }
```

If fewer than 10 players are available for a wave, the server starts the clip anyway (solo mode) within 3 seconds of joining. The leaderboard still shows historical top scores for that clip.

### Swipe mechanics

Swipe-up to advance, swipe-down to go back. Swipe is only registered after the current clip's interaction window closes (answer submitted or timed out). During active play, vertical swipes are consumed by the game canvas (e.g., FruitCutting uses vertical swipes).

The feed scroll is **programmatic** (not free-scroll) — the user cannot scroll mid-game. After game resolution, the feed unlocks for 2 seconds to allow natural swipe, then auto-advances if no swipe is detected.

### Coin multiplier and streak UI

The streak counter and multiplier badge sit in a fixed overlay above the feed (not inside the FlashList items). This prevents the badge from jumping during list recycling.

```
Streak tiers:
  0-4 correct:   1x  (no badge shown)
  5-9 correct:   1.5x (bronze badge, subtle pulse)
  10-14 correct: 2x  (silver badge, glow animation)
  15+ correct:   3x  (gold badge, particle effect)
```

Streak break animation: the badge shatters (Skia path fragmentation) before the prompt for streak protection appears.

---

## 7. Animation and Effects System

### Tools: Reanimated 3 (layout/spring), Skia (canvas effects), Expo AV (sound sync)

The guiding principle: **animations must not block gameplay input**. All animations run either on the UI thread (Reanimated worklets, Skia) or as detached background tasks. The JS thread handles game logic and socket events.

### Elimination sequence (the most important animation in the app)

The elimination moment must be visceral, unavoidable, and completed in under 2 seconds so the retry offer appears while emotion is highest.

**Sequence (total: 1.8s):**

```
0ms:    Screen flash to red (Reanimated opacity overlay, UI thread)
0ms:    Haptic: heavy impact (notificationAsync HEAVY)
0ms:    Sound: elimination sting (Expo AV, preloaded)
150ms:  "YOU'RE OUT" text crashes in from top (spring: mass 0.5, damping 8)
150ms:  Screen edges vignette darkens
400ms:  Player avatar shatters (Skia path decomposition into ~20 shards, physics worklet)
600ms:  Shards fall off screen (gravity simulation in Reanimated worklet)
1000ms: Background dims to 30% opacity
1200ms: Retry offer card slides up from bottom (spring animation)
1800ms: Auto-transition to spectator if no interaction
```

The shard physics simulation runs entirely in a Reanimated worklet — no JS involvement after initialization:

```typescript
// Worklet-based shard physics (runs on UI thread)
const shardWorklet = useAnimatedReaction(
  () => triggerElimination.value,
  (triggered) => {
    if (triggered) {
      // Initialize shard positions, velocities, and rotation
      // Run gravity integration at 60fps
      // No JS thread involvement
    }
  }
);
```

### Streak celebration

On reaching a new streak tier (5, 10, 15):
- Coin multiplier badge scales up (spring) and emits particle burst (Skia confetti — 30 particles, 800ms lifetime)
- Screen edge briefly glows in tier color
- Sound: ascending tone (preloaded)

### Round timer animations

The timer ring is a `Skia Arc` driven by `timeRemaining` SharedValue:
- Green to yellow at 50% remaining (interpolated color in worklet)
- Yellow to red at 25% remaining
- Red + pulsing at 10% remaining (scale oscillation, worklet)
- Final 3 seconds: ring pulses with haptic tick each second

### Transition animations

- PlayClips swipe: iOS-style spring snap (no custom animation needed — FlashList paging handles this)
- Show phase transitions (lobby → game → results): full-screen crossfade with 200ms duration
- Modal presentations (retry, daily reward): slide-up sheet with spring physics
- Coin increment: number rolls up (Reanimated interpolation) + coin sprite burst from tap point

---

## 8. Offline and Poor Connectivity Handling

### Context: live show vs. PlayClips require different strategies

**PlayClips (async):** Gracefully degrade. If the socket disconnects mid-clip, the game still plays locally. The score is submitted optimistically and reconciled when connectivity restores. Streak state is committed to MMKV immediately on each correct answer — a crash or disconnect cannot erase a streak.

**Live Show (synchronous):** Degradation is not possible — a show is inherently networked. The goal is to inform the player clearly and reconnect as fast as possible.

### Connectivity monitoring

```typescript
// lib/networkMonitor.ts
import NetInfo from '@react-native-community/netinfo';

// Subscribe on app start — updates a Zustand connectivity slice
// connectionType: 'wifi' | 'cellular' | 'none'
// effectiveType: '2g' | '3g' | '4g' | '5g'
```

If `effectiveType` drops to `2g` while in a live show:
- Reduce server polling cadence
- Pause host video stream (audio only)
- Warn user with a subtle banner: "Slow connection — your answers are still reaching us"

### Show disconnection handling

```
During active game round:
  - Socket disconnect detected → immediate local timer freeze (player sees timer paused)
  - Reconnect attempt begins immediately (500ms interval, max 10 attempts = 10s window)
  - If reconnection succeeds within round duration → resume, server catchup via show:state_sync
  - If reconnection fails after round ends → show "Connection lost — checking your score..."
  - Server holds the player's submitted answer (if any) for 30s pending reconnect
  - On reconnect: if answer was submitted before disconnect, it counts
  - If no answer was submitted: marked as no-answer (treated as wrong)

Player is NOT eliminated solely due to disconnect IF they had submitted an answer.
```

### Optimistic UI for answer submission

```typescript
// When answer is tapped:
// 1. Lock UI immediately (no double-submit)
// 2. Show "Answer submitted" visual confirmation
// 3. Add answer to local pending queue (MMKV)
// 4. Emit to socket with acknowledgement
// 5. If ack received: clear from pending queue
// 6. If socket times out: retry on reconnect
// Server deduplicates by (playerId, roundId)
```

### Asset availability offline

The show manifest assets are cached by Expo's image cache. For PlayClips, the top 10 upcoming clips (by recommendation score) are preloaded when the user is on WiFi. A "No internet" state is shown only if the clip feed has zero cached items — otherwise stale cached clips play normally.

---

## 9. Push Notification Strategy

### Library: Expo Notifications (wraps APNs + FCM)

### Notification types and timing

| Notification | Trigger | Timing | Action on tap |
|---|---|---|---|
| Show starting soon | Server-scheduled | 30 min, 5 min before | Opens `/show/[id]/lobby` |
| Show starting NOW | Server-scheduled | Show T-0 | Opens `/show/[id]/lobby` |
| Streak reminder | Server (if streak > 5, no activity 12h) | Personalized | Opens PlayClips feed |
| Daily reward ready | Server daily at user's local morning | 9am local | Opens daily reward modal |
| Show results | Server post-show | Immediately post | Opens `/show/[id]/results` |
| Coin offer (IAP) | Server (A/B tested cadence) | Max 1/week | Opens `/store` |
| Friend joined | Friend activity | Real-time (batched, max 3/day) | Opens leaderboard |

### Permission request placement

Permission is requested at the end of the FTUE simulation, immediately after the "That was from last night's show with 800K players" screen. The framing: "Get notified when the next live show starts — you won't want to miss it."

This is the highest-intent moment in the onboarding funnel. Do not ask at app launch.

### Notification deep-link routing

Expo Router handles deep links natively. Each notification carries a `url` field in the data payload:

```json
{
  "title": "Show starts in 5 minutes!",
  "body": "800,000 players are warming up. Get in now.",
  "data": {
    "url": "/show/show_20260327_evening/lobby"
  }
}
```

On tap (foreground or background), Expo Router navigates to the URL. The show lobby screen reads the `showId` from route params and initiates socket connection.

### Foreground notification handling

When the app is foregrounded and a show notification arrives:
- Do not display the OS banner (it looks cheap and breaks immersion)
- Instead, display an in-app `HostVideo`-themed banner at the top of the screen with "Join Now" CTA

---

## 10. Performance Budget and Optimization Strategy

### Target: 60fps sustained during gameplay, <200ms answer submission feedback, <2s cold start

### Performance budget table

| Metric | Target | Alert threshold |
|---|---|---|
| JS bundle size (initial) | < 2MB gzipped | > 3MB |
| Cold start (JS load → interactive) | < 2s on mid-range device | > 3s |
| Frame rate during game | 60fps (no drops below 50) | Any frame > 33ms |
| Answer tap → visual feedback | < 100ms | > 150ms |
| PlayClips swipe → next clip interactive | < 300ms | > 500ms |
| WebSocket message → UI update | < 50ms | > 100ms |
| Show manifest preload completion | Before round 1 starts | Still loading at round 1 |
| Memory footprint | < 200MB during show | > 300MB |

**Mid-range device target:** Qualcomm Snapdragon 665 / Apple A14 — this covers ~60th percentile of active TikTok user devices.

### JS bundle strategy

```
Metro bundler with Hermes engine (default in Expo SDK 53)
Hermes compiles to bytecode at build time — eliminates JS parse time on cold start

Bundle splitting strategy:
  - Core bundle: auth, tabs, PlayClips (~600KB gzipped)
  - Lazy chunk: show logic + game renderers (loaded on first show entry)
  - Lazy chunk: store / IAP (loaded on first store open)

Avoid in the critical path:
  - moment.js → use date-fns (tree-shakeable)
  - lodash → use lodash-es or inline utilities
  - Any library that polyfills browser APIs unnecessarily
```

### Render performance

**Rule: no component re-renders during active game rounds.**

Game components are memoized with `React.memo`. The `timeRemaining` SharedValue is read directly by Skia/Reanimated worklets — it never causes a React re-render. The only React re-render during an active round should be answer submission locking the input.

```typescript
// All game components receive props at round start only
// Timer is a Reanimated SharedValue — not React state
// Player count updates are batched and applied between rounds
```

**FlatList / FlashList tuning for PlayClips:**

```typescript
<FlashList
  data={clips}
  estimatedItemSize={screenHeight}
  pagingEnabled
  decelerationRate="fast"
  showsVerticalScrollIndicator={false}
  removeClippedSubviews={false}  // false because we maintain 3-clip window explicitly
  maxToRenderPerBatch={1}        // render one at a time, we preload manually
  windowSize={3}                 // keep 3 clips in memory
  getItemType={() => 'clip'}     // single type, optimal recycling
/>
```

### Memory management

- Game assets (images for Spot the Difference, Find Items) are loaded into Expo Image's disk cache, not memory. They are fetched into memory only when the round starts and explicitly purged after round end.
- Skia surfaces are destroyed between games by unmounting `<Canvas>` — Skia does not automatically GC GPU surfaces.
- Reanimated shared values are cleaned up in `useEffect` return functions.

### Profiling tooling

- **Flipper + React DevTools profiler** during development
- **Sentry Performance** in production: transaction tracing for show join → round 1 start
- **Expo's built-in perf overlay** enabled in staging builds
- Custom performance marks:

```typescript
// Track critical user-facing moments
performance.mark('show:lobby_entered');
performance.mark('show:manifest_loaded');
performance.mark('show:round_1_interactive');
performance.measure('lobby_to_interactive', 'show:lobby_entered', 'show:round_1_interactive');
// Sent to Sentry as custom measurement
```

### Network optimization

- All game assets served from CDN with far-future cache headers + content-hashed URLs
- Show manifest uses gzip over the socket (Socket.io `perMessageDeflate: true`)
- PlayClips clip metadata paginated with cursor — no offset pagination (avoids duplicates on insert)
- Socket.io ping interval: 25s (keep-alive), ping timeout: 5s

### Battery and thermal throttling

A live show running for 15 minutes with a 60fps canvas, open socket, and video stream can trigger thermal throttling on older devices, dropping to 30fps. Mitigations:

- Disable `requestAnimationFrame` calls between rounds (Skia `<Canvas>` paused)
- Host video stream drops to audio-only if battery < 15% OR device reports thermal state > fair (via `react-native-device-info`)
- Particle effects (celebrations) have a reduced-particle mode triggered by frame rate monitoring: if 3 consecutive frames exceed 25ms, switch to low-effects mode for the session

---

## Appendix: Key Architectural Decisions Log

| Decision | Chosen | Rejected | Reason |
|---|---|---|---|
| Cross-platform framework | React Native (Expo) | Flutter, Native | OTA updates critical for live events; larger talent pool |
| Game rendering | react-native-skia | Expo GL / Three.js / WebView | 2D only, UI thread, no WebGL context overhead |
| State management | Zustand + TanStack Query | Redux Toolkit, MobX | Minimal boilerplate; Zustand works well with Reanimated worklets |
| Local persistence | MMKV | AsyncStorage | Synchronous reads needed for coin balance checks during gameplay |
| Navigation | Expo Router 4 | React Navigation bare | Deep-link push routing built-in; file-based is maintainable at scale |
| Feed virtualization | FlashList | FlatList | RecyclerView-style recycling; proven in high-item-count feeds |
| WebSocket client | Socket.io | raw WebSocket, Ably | Built-in reconnection, ack mechanism, namespace isolation |
| Animation | Reanimated 3 + Skia | Animated API, Lottie | Worklet-based UI thread execution; Lottie cannot be parameterized at runtime |

---

*Next phase considerations (not in MVP scope): Web client (React + same Zustand stores via platform-agnostic packages), spectator web embed for streaming platforms, tournament bracket mode, friend groups/parties, real-time chat overlay.*
