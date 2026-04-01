# Creating a New Euphoria Game — Complete AI Agent Guide

This document is the single source of truth for building and integrating a new game into the Euphoria platform. It covers every file, every registration point, and every validation step. Follow it linearly — the phases are ordered by dependency.

---

## Architecture Overview

```
game-packages/your-game/
  manifest.json               <- game metadata + config schema
  web/index.html              <- self-contained game (HTML+CSS+JS, all inlined)

                    ZIP upload
                       |
                       v
apps/api/
  modules/games/handlers/     <- server-side answer validation
  modules/game-packages/      <- stores bundle in S3, manages levels
  modules/show/               <- live show orchestration
  modules/playclips/           <- async clip play
  gateways/show/              <- WebSocket for live shows
  gateways/clips/             <- WebSocket for PlayClips

apps/admin/
  pages/ShowsPage.tsx          <- show editor (game type dropdowns, config forms)
  pages/GamesPage.tsx          <- game package management + level editor

apps/mobile/
  src/games/GameWebViewBridge  <- loads game HTML in WebView, passes data
  src/games/registry.ts        <- native game renderers (optional)

packages/types/
  src/games.ts                 <- shared TypeScript types
```

**Data flow during a live show:**
1. Admin creates show with `game_sequence` markers (game type + config per round)
2. Player joins -> server sends `show_content` with `bundleUrl` per round (for pre-download)
3. Round starts -> orchestrator resolves levels (if any), calls handler's `buildQuestionEvent()`
4. Server broadcasts `round_question` via WebSocket
5. Mobile renders `GameWebViewBridge` -> WebView loads bundle HTML -> game data passed via URL hash
6. Player interacts -> game posts `SUBMIT_ANSWER` -> native forwards via WebSocket
7. Server validates answer using handler's `isCorrect()` -> broadcasts `round_result`

---

## Phase 1: Game Package (the game itself)

This is the actual game that runs in the player's WebView. Start here.

### 1.1 Create the directory

```bash
mkdir -p game-packages/your-game/web
```

### 1.2 Create `manifest.json`

```json
{
  "id": "your_game",
  "name": "Your Game Name",
  "version": "1.0.0",
  "description": "One sentence — what the player does",
  "layout": "overlay_bottom",
  "configSchema": {
    "question": { "type": "string", "label": "Question text" },
    "options": { "type": "string[]", "label": "Answer options (4)" },
    "correctIndex": { "type": "number", "label": "Correct option (0-3)", "min": 0, "max": 3 }
  }
}
```

**Fields:**
- `id` — snake_case, unique, must match the folder name and all server-side references
- `layout` — `"overlay_bottom"` (bottom 80%, host PIP in top 20%) or `"fullscreen"` (entire screen)
- `configSchema` — defines what fields the admin fills in when configuring a round. These become the `gamePayload` sent to the game

### 1.3 Create `web/index.html`

The entire game must be a single self-contained HTML file. No external scripts, no external CSS, no network calls. Everything inlined.

**Constraints:**
- ZIP bundle: <= 150 KB compressed
- Unzipped index.html: <= 300 KB
- Vanilla JS only (no React/Vue/Angular)
- System fonts only (no custom font downloads)
- All images must be base64-inlined (<= 50 KB total)

**Use this template as your starting point:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Your Game</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body {
      background: #0D0D1A;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      height: 100%;
      overflow: hidden;
    }
    #root { display: flex; flex-direction: column; height: 100vh; padding: 16px; gap: 12px; }
    #loading {
      position: fixed; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; background: #0D0D1A; z-index: 100;
    }
    #loading.hidden { display: none; }
    .spinner {
      width: 32px; height: 32px; border: 3px solid #2A2A4A;
      border-top-color: #7C3AED; border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Timer bar */
    #timer-track { width: 100%; height: 4px; background: #2A2A4A; border-radius: 2px; }
    #timer-fill  { height: 100%; background: #7C3AED; border-radius: 2px; transform-origin: left; }
    #timer-fill.urgent { background: #EF4444; }

    /* Your game styles here */
  </style>
</head>
<body>
  <div id="loading">
    <div class="spinner"></div>
    <p id="load-status" style="color:#9CA3AF;font-size:12px;margin-top:12px">Loading...</p>
  </div>

  <div id="root">
    <div id="timer-track"><div id="timer-fill"></div></div>
    <!-- Your game markup here -->
  </div>

<script>
// ── State ──────────────────────────────────────────────────────────────────
var timeLimitMs = 30000;
var startTs = null;
var rafId = null;
var answered = false;

var $loading = document.getElementById('loading');
var $fill = document.getElementById('timer-fill');

// ── Timer ──────────────────────────────────────────────────────────────────
function startTimer() {
  startTs = Date.now();
  (function tick() {
    var remaining = Math.max(0, timeLimitMs - (Date.now() - startTs));
    $fill.style.transform = 'scaleX(' + (remaining / timeLimitMs) + ')';
    $fill.classList.toggle('urgent', remaining < 6000);
    if (remaining > 0 && !answered) rafId = requestAnimationFrame(tick);
    else if (remaining <= 0 && !answered) submitAnswer('timeout', {});
  })();
}

// ── Answer submission (call exactly once) ──────────────────────────────────
function submitAnswer(selectedOptionId, extra) {
  if (answered) return;
  answered = true;
  cancelAnimationFrame(rafId);
  postToNative({
    type: 'SUBMIT_ANSWER',
    payload: Object.assign({ gameType: 'your_game', selectedOptionId: String(selectedOptionId) }, extra || {})
  });
}

// ── Init (called when game data arrives) ───────────────────────────────────
function init(payload) {
  if (!payload) return;
  timeLimitMs = Number(payload.timeLimitMs || 30000);

  // TODO: read your config fields from payload and render the game
  // Example: var question = payload.question;
  //          var options = payload.options;

  $loading.classList.add('hidden');
  startTimer();
  postToNative({ type: 'READY' });
}

// ── Native bridge ──────────────────────────────────────────────────────────
function postToNative(msg) {
  var str = JSON.stringify(msg);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(str);
  else window.parent.postMessage(str, '*');
}

// ── Data reception (3 channels — copy this exactly) ────────────────────────
window.addEventListener('message', function(e) {
  var msg;
  try { msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch(err) { return; }
  if (msg.type === 'GAME_INIT' && msg.payload) init(msg.payload);
});

(function() {
  function go(g) {
    init(g.payload ? Object.assign({}, g.payload, { timeLimitMs: g.timeLimitMs }) : g);
  }
  // Path 1: URL hash (most reliable — data travels with the URL)
  if (location.hash && location.hash.length > 1) {
    try { go(JSON.parse(decodeURIComponent(location.hash.slice(1)))); return; } catch(e) {}
  }
  // Path 2: pre-injected global
  if (window.__EUPHORIA_GAME__) { go(window.__EUPHORIA_GAME__); }
})();
</script>
</body>
</html>
```

### 1.4 CRITICAL: Validate JavaScript before uploading

A syntax error in the `<script>` block silently kills ALL JavaScript. The HTML still renders (spinner shows), but the game is completely dead. The WebView gives zero error feedback.

```bash
# Extract JS from HTML and check syntax
sed -n '/<script>/,/<\/script>/p' web/index.html | sed '1d;$d' > /tmp/check.js \
  && node --check /tmp/check.js \
  && echo "JS OK" || echo "FIX SYNTAX ERRORS"
```

**Common pitfalls:**

| Bug | Example | Fix |
|---|---|---|
| Apostrophe in single-quoted string | `'Time's up!'` | `"Time's up!"` |
| Template literals | `` `Score: ${x}` `` | `'Score: ' + x` |
| Optional chaining | `obj?.prop` | `obj && obj.prop` |
| Nullish coalescing | `x ?? 0` | `x != null ? x : 0` |
| `const`/`let` edge cases | Redeclaring in switch | Use `var` |

### 1.5 Upload the game package

```bash
cd game-packages/your-game
zip -r ../your-game.zip manifest.json web/

# Upload via API
curl -X POST http://localhost:3000/api/v1/admin/games/upload \
  -F "file=@../your-game.zip"

# Then enable in admin UI: Games page -> toggle "Enabled"
```

---

## Phase 2: Type Definitions

### 2.1 Add to shared types

**File: `packages/types/src/games.ts`**

Add your game to the `GameType` union:
```typescript
export type GameType =
  | 'trivia'
  | 'spot_difference'
  | 'quick_math'
  | 'your_game';          // <-- ADD
```

Add config and answer interfaces:
```typescript
export interface YourGameConfig {
  gameType: 'your_game';
  question: string;
  options: string[];
  correctIndex: number;
  timeLimitMs: number;
}

export interface YourGameAnswer {
  gameType: 'your_game';
  selectedOptionId: string;
}
```

Add to the union types:
```typescript
export type GameConfig = TriviaConfig | QuickMathConfig | SpotDifferenceConfig | YourGameConfig;
export type GameAnswer = TriviaAnswer | QuickMathAnswer | SpotDifferenceAnswer | YourGameAnswer;
```

### 2.2 Update database schema types

**File: `apps/api/src/database/schema.ts`**

Add to the `GameType` union in the database schema (mirrors the shared types):
```typescript
export type GameType =
  | 'trivia'
  | 'spot_difference'
  | 'quick_math'
  | 'your_game';          // <-- ADD
```

---

## Phase 3: Server-Side Game Handler

The handler is the server's brain for your game. It builds payloads, validates answers, and generates result text.

### 3.1 Create the handler

**File: `apps/api/src/modules/games/handlers/your-game.handler.ts`**

```typescript
import { BaseGameHandler } from '../base-game-handler';
import type { GameAnswer } from '@euphoria/types';

interface InlineYourGame {
  question: string;
  options: string[];
  correctIndex: number;
}

export class YourGameHandler extends BaseGameHandler {
  readonly type = 'your_game';

  /**
   * Extract display-safe data for the client.
   * Called by PlayClips gateway to build gamePayload.
   * NEVER include correct answers here.
   */
  buildClientPayload(config: Record<string, unknown>): Record<string, unknown> {
    const yg = config['yourGame'] as InlineYourGame | undefined;
    if (!yg) return {};
    return {
      question: yg.question,
      options: yg.options,
      // DO NOT include correctIndex
    };
  }

  /**
   * Build the round_question event for live shows.
   * Broadcast to all connected players when the round opens.
   * NEVER include correct answers here.
   */
  buildQuestionEvent(
    config: Record<string, unknown>,
    { showId, roundIndex, timeLimitMs }: { showId: string; roundIndex: number; timeLimitMs: number },
  ): Record<string, unknown> {
    const yg = config['yourGame'] as InlineYourGame | undefined;
    if (!yg) return {};
    return {
      showId,
      roundIndex,
      timeLimitMs,
      question: yg.question,
      options: yg.options,
      // DO NOT include correctIndex
    };
  }

  /**
   * Server-authoritative answer validation.
   * Called after submission window closes to determine who got it right.
   * This is the ONLY place where the correct answer is checked.
   */
  isCorrect(config: Record<string, unknown>, answer: GameAnswer): boolean {
    const yg = config['yourGame'] as InlineYourGame | undefined;
    if (!yg) return false;
    const submitted = answer as { selectedOptionId?: string } | null;
    if (!submitted?.selectedOptionId) return false;
    return parseInt(submitted.selectedOptionId, 10) === yg.correctIndex;
  }

  /**
   * Human-readable correct answer text for the round_result event.
   * Shown to players after the round closes.
   */
  getCorrectAnswerText(config: Record<string, unknown>): string {
    const yg = config['yourGame'] as InlineYourGame | undefined;
    if (!yg) return '';
    return yg.options[yg.correctIndex] ?? '';
  }
}
```

### 3.2 Register the handler

**File: `apps/api/src/modules/games/games.module.ts`**

```typescript
import { YourGameHandler } from './handlers/your-game.handler';

// In the onModuleInit method, add:
this.registry.register(new YourGameHandler());
```

---

## Phase 4: Admin UI Integration

### 4.1 Show editor — game type registration

**File: `apps/admin/src/pages/ShowsPage.tsx`**

Add to these arrays/maps near the top of the file:

```typescript
// 1. Game type list (dropdown options)
const GAME_TYPES = [
  'trivia',
  'quick_math',
  'spot_difference',
  'your_game',              // <-- ADD
];

// 2. Human-readable labels
const GAME_TYPE_LABELS: Record<string, string> = {
  trivia: 'Trivia',
  quick_math: 'Quick Math',
  spot_difference: 'Spot the Difference',
  your_game: 'Your Game Name',  // <-- ADD
};

// 3. Short codes (shown in compact timeline views)
const GAME_TYPE_SHORT: Record<string, string> = {
  trivia: 'TRV',
  quick_math: 'QM',
  spot_difference: 'SPD',
  your_game: 'YG',             // <-- ADD
};
```

### 4.2 Default config builder

In the `defaultConfig()` function in ShowsPage.tsx:

```typescript
if (gameType === 'your_game')
  return {
    yourGame: { question: '', options: ['', '', '', ''], correctIndex: 0 }
  };
```

### 4.3 Game-specific config form (optional)

If your game needs a custom admin form (like spot_difference has a level picker), create a React component in ShowsPage.tsx following the `SpotDifferenceConfigForm` or `TriviaConfigForm` pattern:

```typescript
function YourGameConfigForm({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const yg = (config['yourGame'] as { question: string; options: string[]; correctIndex: number } | undefined)
    ?? { question: '', options: ['', '', '', ''], correctIndex: 0 };

  const update = (patch: Partial<typeof yg>) =>
    onChange({ yourGame: { ...yg, ...patch } });

  return (
    <div className="flex flex-col gap-3">
      {/* Your form fields */}
    </div>
  );
}
```

Then wire it in the `MarkerCard` component's `renderConfigForm` section:

```typescript
if (marker.gameType === 'your_game') {
  return <YourGameConfigForm config={marker.config} onChange={(c) => onUpdate({ config: c })} />;
}
```

### 4.4 Show template (optional)

Add a template entry to `GAME_TEMPLATE` array for quick show creation:

```typescript
{
  at: 120,
  duration: 15,
  gameType: 'your_game',
  config: {
    yourGame: {
      question: 'Sample question?',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 0,
    },
  },
  timeLimitMs: 15000,
},
```

---

## Phase 5: Level System (only for level-based games)

Skip this phase if your game has all config inline (like trivia/quick_math). Only needed for games where config references reusable levels (like spot_difference).

### 5.1 Create levels via admin API

Levels are stored in the `game_levels` table, linked to a `game_packages` row via FK.

```bash
# Create a level
curl -X POST http://localhost:3000/api/v1/admin/games/your_game/levels \
  -H "Content-Type: application/json" \
  -d '{
    "name": "level-1",
    "config": {
      "imageA": "https://cdn.example.com/a.png",
      "imageB": "https://cdn.example.com/b.png",
      "customField": "value"
    }
  }'
```

### 5.2 Add level resolution to show orchestrator

**File: `apps/api/src/modules/show/show.orchestrator.ts`**

In the `startShow()` method, inside the markers loop (around line 194), add level resolution before `buildQuestionEvent`:

```typescript
if (marker.gameType === 'your_game') {
  const yg = (marker.config['yourGame'] ?? marker.config) as Record<string, unknown>;
  const levelId = yg['levelId'] as string | undefined;
  if (levelId) {
    const level = await this.gamePackagesService.getLevelCached('your_game', levelId);
    if (level) {
      questionConfig = {
        ...marker.config,
        yourGame: {
          ...yg,
          // Inject resolved level data
          resolvedField: level.config['someField'],
        },
      };
    }
  }
}
```

Also add resolution in the `closeSubmissions()` method (around line 350) for answer evaluation.

### 5.3 Add level resolution to clips gateway

**File: `apps/api/src/gateways/clips/clips.gateway.ts`**

In `handleNextClip()` (around line 126), add the same level resolution pattern before `buildClientPayload`.

### 5.4 Add level resolution to PlayClips service

**File: `apps/api/src/modules/playclips/playclips.service.ts`**

In `submitAnswer()` (around line 87), add level resolution for server-side validation.

---

## Phase 6: Mobile App (usually no changes needed)

Most games render in the WebView via the game package bundle. The mobile app automatically:
1. Pre-downloads the bundle URL during lobby (from `show_content` event)
2. Loads it in `GameWebViewBridge` when the round starts
3. Passes game data via URL hash + `__EUPHORIA_GAME__` global + message event
4. Receives `SUBMIT_ANSWER` and forwards to server

**No mobile code changes needed** unless you want a native renderer (rare).

### 6.1 Native renderer (optional, rare)

Only if WebView performance is insufficient. Create:

```
apps/mobile/src/games/your-game/YourGame.tsx
```

Implement the `GameRendererComponent` interface:

```typescript
export function YourGame({
  payload,
  timeLimitMs,
  onSubmit,
  isLocked,
  selectedAnswer,
}: GameRendererProps) {
  // Native React Native implementation
}
```

Register in `apps/mobile/src/games/registry.ts`:

```typescript
import { YourGame } from './your-game/YourGame';

const GAME_REGISTRY: Record<string, GameRendererComponent> = {
  trivia: TriviaGame,
  quick_math: QuickMathGame,
  your_game: YourGame,
};
```

---

## Phase 7: Validation & Upload

### 7.1 Pre-upload checklist

```bash
cd game-packages/your-game

# 1. Validate JS syntax (CRITICAL — prevents silent failures)
sed -n '/<script>/,/<\/script>/p' web/index.html | sed '1d;$d' > /tmp/check.js \
  && node --check /tmp/check.js \
  && echo "JS OK" || { echo "FIX SYNTAX ERRORS"; exit 1; }

# 2. Check bundle size
gzip -c web/index.html | wc -c   # must be <= 153600 (150 KB)

# 3. Verify manifest
cat manifest.json | python3 -m json.tool > /dev/null && echo "JSON OK"
```

### 7.2 Upload

```bash
cd game-packages
zip -r your-game.zip your-game/
curl -X POST http://localhost:3000/api/v1/admin/games/upload \
  -F "file=@your-game.zip"
```

### 7.3 Enable the game

Go to Admin UI -> Games page -> find your game -> toggle "Enabled".

### 7.4 Test in a live show

1. Admin UI -> Shows -> Create new show
2. Add a round with your game type
3. Configure the game (fill in config fields)
4. Schedule and start the show
5. Join from the mobile app and verify the game loads, accepts input, and scores correctly

---

## Full Integration Checklist

Copy this into your task tracker when adding a new game:

```
GAME: [your_game_name]

Phase 1: Game Package
[ ] game-packages/your-game/manifest.json created
[ ] game-packages/your-game/web/index.html created
[ ] 3-channel bootstrap in HTML (hash + global + message)
[ ] postToNative bridge for READY + SUBMIT_ANSWER
[ ] Timer bar with urgent state
[ ] Input locking after submission
[ ] JS syntax validated with node --check
[ ] Bundle size <= 150 KB compressed

Phase 2: Types
[ ] GameType union updated (packages/types/src/games.ts)
[ ] Config interface created
[ ] Answer interface created
[ ] Added to GameConfig + GameAnswer unions
[ ] Database schema GameType updated (apps/api/src/database/schema.ts)

Phase 3: Server Handler
[ ] Handler file created (apps/api/src/modules/games/handlers/)
[ ] buildClientPayload — no secrets exposed
[ ] buildQuestionEvent — no secrets exposed
[ ] isCorrect — server-authoritative validation
[ ] getCorrectAnswerText — human-readable result
[ ] Registered in games.module.ts onModuleInit

Phase 4: Admin UI
[ ] Added to GAME_TYPES array (ShowsPage.tsx)
[ ] Added to GAME_TYPE_LABELS
[ ] Added to GAME_TYPE_SHORT
[ ] defaultConfig builder added
[ ] Config form component created (if custom UI needed)
[ ] Template entry added (optional)

Phase 5: Level System (skip if inline config)
[ ] Level resolution in show.orchestrator.ts (startShow)
[ ] Level resolution in show.orchestrator.ts (closeSubmissions)
[ ] Level resolution in clips.gateway.ts
[ ] Level resolution in playclips.service.ts
[ ] Level editor UI in GamesPage.tsx

Phase 6: Upload & Test
[ ] ZIP uploaded via admin API
[ ] Game enabled in admin UI
[ ] Tested in live show (loads, accepts input, scores)
[ ] Tested in PlayClips (if clips are extracted for this game)
```

---

## Reference: Existing Games

| Game | Handler | Layout | Config Style | Answer Type |
|---|---|---|---|---|
| Trivia | `trivia.handler.ts` | overlay_bottom | Inline (question + 4 options) | selectedOptionId (0-3) |
| Quick Math | `quick-math.handler.ts` | overlay_bottom | Inline (expression + 4 options) | selectedOptionId (0-3) |
| Spot Difference | `spot-difference.handler.ts` | fullscreen | Level-based (levelId -> images) | taps [{x,y}] with server-side distance validation |

---

## Key Rules

1. **Server is always authoritative** — `isCorrect()` in the handler is the single source of truth. The client can never cheat.
2. **Never expose answers in payloads** — `buildClientPayload` and `buildQuestionEvent` must never include correct answers. `getCorrectAnswerText` is only called after the submission window closes.
3. **Config is nested** — Show configs use a wrapper key matching the game: `{ yourGame: { ... } }`. The handler reads `config['yourGame']`.
4. **Always validate JS** — Run `node --check` before every upload. A single syntax error silently kills the entire game with zero WebView error feedback.
5. **Use `var` not `const`/`let`** — Some Android WebViews have edge cases with block scoping. `var` is safest.
6. **No network calls from game HTML** — The WebView has no guaranteed network access. All data comes through the native bridge.
7. **Three data channels** — Always implement all three (URL hash, `__EUPHORIA_GAME__` global, message event). Different WebView implementations handle each differently.
