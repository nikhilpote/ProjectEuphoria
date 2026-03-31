# Euphoria — Game Creator Guide

Games in Euphoria run inside a **WebView** embedded in the mobile app. Each game is a self-contained ZIP bundle uploaded to the admin panel and streamed to players' devices before their round begins. This document is everything you need to build, test, and ship a new game.

---

## How Games Work (Architecture)

```
Admin Panel
  └─ Upload ZIP ──► API stores bundle ──► CDN / R2

Mobile App (during lobby)
  └─ Downloads bundle URL ──► WebView pre-loads index.html

Show starts → Round opens
  └─ Native app injects GAME_INIT message into WebView
  └─ Game renders, player taps answer
  └─ Game posts SUBMIT_ANSWER back to native
  └─ Native forwards answer to server via WebSocket
```

The **game never talks to the server directly**. All communication goes through the native bridge. The game only needs to render, accept input, and post one message.

---

## Bundle Structure

Every game is a ZIP file containing exactly:

```
your-game-name/
  manifest.json       ← metadata + config schema
  web/
    index.html        ← entire game (HTML + CSS + JS, all inlined)
```

**No subdirectories inside `web/`. No external files. Single `index.html` only.**

ZIP it as:
```bash
cd game-packages/
zip -r your-game-name.zip your-game-name/
```

> **Versioning:** Keep version numbers **inside `manifest.json`** only. The zip filename never includes a version (`trivia.zip`, not `trivia-v1.0.0.zip`). Re-uploading the same zip name replaces the previous bundle.

---

## Size Constraints

India is the primary market. Tier 2/3 cities average **5–15 Mbps on mobile data** with real-world throughput closer to 2–4 Mbps.

| Constraint | Limit | Reason |
|---|---|---|
| **ZIP bundle (compressed)** | **≤ 150 KB** hard limit | Must download before round starts (~2s on 2 Mbps) |
| **Unzipped `index.html`** | ≤ 300 KB | WebView parse + paint time on mid-range Android |
| **Inlined images (base64)** | ≤ 50 KB total | Sprite sheets only — no photos |
| **Inlined fonts** | 0 KB | Use system fonts only (see list below) |
| **External network calls** | **NONE** | WebView has no network access in production |
| **External CDN scripts** | **NONE** | Will fail — everything must be inlined |

### Staying under limits

- Write vanilla JS — no frameworks, no build step needed
- If you use a library, inline the minified source directly in the HTML
- Compress images before base64: use TinyPNG → export as WebP → then base64
- `gzip -9` your HTML before checking size: `gzip -c web/index.html | wc -c`
- The trivia game (reference implementation) is **12 KB unzipped** — that's the target range for simple games

---

## Allowed Game Engines

All engines must produce a **single self-contained `index.html`** with no runtime CDN dependencies.

| Engine | Bundle overhead | Use when |
|---|---|---|
| **Vanilla JS + Canvas** | 0 KB | All simple games — timers, buttons, counters. First choice. |
| **LittleJS** | ~5 KB minified | Needs sprites, particles, simple physics |
| **Kaboom.js** (self-hosted, minified) | ~200 KB minified | Platformers, collision — only if you inline + gzip stays under 150 KB |
| **PixiJS** (self-hosted, minified) | ~400 KB minified | **Too heavy on its own** — only viable with aggressive tree-shaking |
| **Phaser 3** | ~1 MB minified | **Banned** — exceeds size limit |
| **Phaser Nano** | ~100 KB minified | Borderline — measure after gzip before using |
| **Three.js** | ~600 KB minified | **Banned** — no 3D games in this format |
| **React / Vue / Angular** | ~40 KB+ | **Banned** — startup cost too high for 30s rounds |

**Recommendation:** Start with vanilla JS + Canvas. Every existing Euphoria game uses it. Only reach for a library if vanilla cannot do what you need.

---

## System Fonts (No Download Required)

Use these — they are available on all iOS and Android devices:

```css
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif;
```

For monospace (counters, scores):
```css
font-family: 'SF Mono', 'Roboto Mono', monospace;
```

---

## Native Bridge Protocol

### Receiving data from the native app

The native app delivers game data through **three channels**. Your game must handle all of them — place this bootstrap at the **end** of your `<script>` block:

```javascript
// ── Message listener (dev testing + fallback) ───────────────────────────
window.addEventListener('message', function(e) {
  var msg;
  try { msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
  if (msg.type === 'GAME_INIT') init(msg.payload);
});

// ── Auto-init: URL hash (primary) → global (fallback) ──────────────────
(function() {
  function go(g) {
    init(g.payload ? Object.assign({}, g.payload, { timeLimitMs: g.timeLimitMs }) : g);
  }
  // Path 1: data encoded in URL hash by the native bridge
  if (location.hash && location.hash.length > 1) {
    try { go(JSON.parse(decodeURIComponent(location.hash.slice(1)))); return; } catch(e) {}
  }
  // Path 2: pre-injected global (set before page content loads)
  if (window.__EUPHORIA_GAME__) { go(window.__EUPHORIA_GAME__); }
})();
```

> **Why three channels?** Different WebView implementations handle JS injection differently. The URL hash is the most reliable (data travels with the URL itself). The `__EUPHORIA_GAME__` global is set via `injectedJavaScriptBeforeContentLoaded`. The message listener handles dev testing and edge cases. All three resolve to the same `init(payload)` call.

### `GAME_INIT` payload shape

```typescript
{
  type: 'GAME_INIT',
  payload: {
    // Always present
    timeLimitMs: number,        // How long the round lasts (e.g. 30000)
    roundIndex: number,         // 0-based round number
    totalRounds: number,        // Total rounds in show

    // Game-specific fields — defined by your manifest.json configSchema
    // Examples for trivia:
    question: string,
    options: string[],          // 4 options
    correctIndex: number,       // 0-3 (DO NOT use for pre-reveal — server checks)

    // Optional
    questionImageUrl?: string,
    optionImageUrls?: string[],
    category?: string,
    difficulty?: string,
  }
}
```

> **Security note:** `correctIndex` / correct answer data is in the payload because the game needs to show results after submission. The server independently validates the answer — the game cannot manipulate the outcome.

### Sending data to the native app

Use `postToNative()`:

```javascript
function postToNative(msg) {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  } else {
    // Dev browser fallback
    window.parent.postMessage(JSON.stringify(msg), '*');
  }
}
```

#### Message types you must send:

**1. READY** — send as soon as the game has rendered and is ready for input:
```javascript
postToNative({ type: 'READY' });
```
The native app shows a loading spinner until it receives this.

**2. SUBMIT_ANSWER** — send exactly once when the player makes their choice:
```javascript
postToNative({
  type: 'SUBMIT_ANSWER',
  payload: {
    gameType: 'your-game-id',   // must match manifest.json id
    selectedOptionId: '2',      // string identifier of the chosen answer
    // Include any extra data your game's isAnswerCorrect needs:
    value: 42,                  // e.g. for number-input games
  }
});
```

After submitting, lock all inputs. The native app handles everything else — the game just waits for the WebView to be hidden (round ends).

---

## `manifest.json` Spec

```json
{
  "id": "your-game-id",           // kebab-case, unique, matches ZIP folder name
  "name": "Human Readable Name",
  "version": "1.0.0",             // semver — bump minor on content change, major on breaking config change
  "description": "One sentence describing what the player does",
  "layout": "overlay_bottom",     // see Layouts below

  "configSchema": {
    // Fields the show editor fills in when configuring a round
    // These become the gamePayload sent to clients
    "fieldName": {
      "type": "string | number | boolean | string[]",
      "label": "Label shown in admin UI",
      "required": true,           // optional, defaults to true
      "min": 0,                   // for number types
      "max": 100,                 // for number types
      "options": ["a","b","c"]    // for enum-like string fields
    }
  }
}
```

### Layouts

| Value | Description |
|---|---|
| `overlay_bottom` | Game occupies bottom 80% of screen. Host video PIP shows in top 20% circle. Standard for question games. |
| `fullscreen` | Game takes entire screen. Host video is hidden. Use for immersive games where tapping the full screen is required. |

---

## Complete Minimal Game Template

Copy this as your starting point:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>My Game</title>
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

    /* Timer bar */
    #timer-track { width: 100%; height: 4px; background: #2A2A4A; border-radius: 2px; }
    #timer-fill  { height: 100%; background: #7C3AED; border-radius: 2px; transform-origin: left; }
    #timer-fill.urgent { background: #EF4444; }

    /* Your game UI here */
  </style>
</head>
<body>
<div id="root">
  <div id="timer-track"><div id="timer-fill"></div></div>
  <!-- Your game markup -->
</div>
<script>
  let timeLimitMs = 30000;
  let startTs = null;
  let rafId = null;
  let answered = false;

  // ── Timer ─────────────────────────────────────────────────────────────────
  const $fill = document.getElementById('timer-fill');

  function startTimer() {
    startTs = Date.now();
    (function tick() {
      const remaining = Math.max(0, timeLimitMs - (Date.now() - startTs));
      $fill.style.transform = `scaleX(${remaining / timeLimitMs})`;
      $fill.classList.toggle('urgent', remaining < 6000);
      if (remaining > 0 && !answered) rafId = requestAnimationFrame(tick);
    })();
  }

  // ── Answer submission ─────────────────────────────────────────────────────
  function submitAnswer(selectedOptionId, extra) {
    if (answered) return;
    answered = true;
    cancelAnimationFrame(rafId);
    postToNative({
      type: 'SUBMIT_ANSWER',
      payload: { gameType: 'your-game-id', selectedOptionId: String(selectedOptionId), ...extra }
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function init(payload) {
    if (!payload) return;
    timeLimitMs = payload.timeLimitMs || 30000;
    // TODO: render your game using payload fields
    startTimer();
    postToNative({ type: 'READY' });
  }

  // ── Native bridge ─────────────────────────────────────────────────────────
  function postToNative(msg) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    } else {
      window.parent.postMessage(JSON.stringify(msg), '*');
    }
  }

  // ── Bootstrap (copy this exactly — handles all WebView data channels) ──
  window.addEventListener('message', function(e) {
    var msg;
    try { msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
    if (msg.type === 'GAME_INIT') init(msg.payload);
  });

  (function() {
    function go(g) {
      init(g.payload ? Object.assign({}, g.payload, { timeLimitMs: g.timeLimitMs }) : g);
    }
    if (location.hash && location.hash.length > 1) {
      try { go(JSON.parse(decodeURIComponent(location.hash.slice(1)))); return; } catch(e) {}
    }
    if (window.__EUPHORIA_GAME__) { go(window.__EUPHORIA_GAME__); }
  })();
</script>
</body>
</html>
```

---

## Testing Your Game in a Browser

Before uploading, open `index.html` in Chrome DevTools and inject the init event:

```javascript
// Paste in Chrome console after opening index.html
window.dispatchEvent(new MessageEvent('message', {
  data: JSON.stringify({
    type: 'GAME_INIT',
    payload: {
      timeLimitMs: 30000,
      roundIndex: 0,
      totalRounds: 5,
      // your game-specific fields:
      question: "What is 7 × 8?",
      options: ["54", "56", "58", "64"],
      correctIndex: 1
    }
  })
}));
```

To simulate the native `postMessage` listener, add this before testing:
```javascript
window.ReactNativeWebView = { postMessage: (msg) => console.log('→ Native:', JSON.parse(msg)) };
```

---

## Pre-Upload Validation (REQUIRED)

**Every game must pass JS syntax validation before uploading.** A single syntax error in your `<script>` block silently kills all JavaScript — the HTML renders (spinner shows) but no game logic runs. The WebView gives zero error feedback, making this extremely hard to debug.

### Run this before every upload:

```bash
# Extract inline JS and validate with Node
sed -n '/<script>/,/<\/script>/p' web/index.html | sed '1d;$d' > /tmp/check.js && node --check /tmp/check.js
```

If it prints nothing, you're good. If it prints a `SyntaxError`, fix it before uploading.

### Common pitfalls that cause silent failures:

| Bug | Example | Fix |
|---|---|---|
| **Apostrophe in single-quoted string** | `'Time's up!'` | Use double quotes: `"Time's up!"` |
| **Template literal in old WebView** | `` `Score: ${x}` `` | Use concatenation: `'Score: ' + x` |
| **Trailing comma in array/object** | `[1, 2, 3,]` | Remove trailing comma: `[1, 2, 3]` |
| **`const`/`let` in strict mode edge cases** | Redeclaring in switch | Use `var` for maximum compatibility |
| **Optional chaining `?.`** | `obj?.prop` | Use `obj && obj.prop` for older WebViews |
| **Nullish coalescing `??`** | `x ?? 0` | Use `x != null ? x : 0` |

> **Why not use `try/catch`?** A syntax error prevents the JS engine from *parsing* the script at all. `try/catch` only handles *runtime* errors. If the script can't parse, nothing inside it executes — not even error handlers.

### Full upload workflow:

```bash
cd game-packages/your-game/

# 1. Validate JS syntax
sed -n '/<script>/,/<\/script>/p' web/index.html | sed '1d;$d' > /tmp/check.js \
  && node --check /tmp/check.js \
  && echo "✓ JS OK" || { echo "✗ FIX SYNTAX ERRORS"; exit 1; }

# 2. Check bundle size
gzip -c web/index.html | wc -c   # must be ≤ 150 KB

# 3. Zip and upload
cd .. && zip -r your-game.zip your-game/
curl -X POST http://localhost:3000/api/v1/admin/games/upload -F "file=@your-game.zip"
```

---

## Design Rules

1. **Dark background only** — the game floats over a video feed. Use `#0D0D1A` or darker.
2. **Tap targets ≥ 48×48px** — players are on phones, often in a hurry.
3. **No scrolling** — the entire game must fit in the WebView height. Use `overflow: hidden` on `body`.
4. **Timer is mandatory** — every game must show a visual countdown matching `timeLimitMs`.
5. **Lock on answer** — once `SUBMIT_ANSWER` is posted, disable all inputs immediately.
6. **No text smaller than 13px** — readability on small screens.
7. **Colour scheme** — match the Euphoria palette or use your own, but never white backgrounds.

### Euphoria Palette Reference
```
Background:   #0D0D1A
Surface:      #1A1A2E
Border:       #2A2A4A
Accent:       #7C3AED
Accent glow:  rgba(124,58,237,0.25)
Green:        #10B981
Red:          #EF4444
Gold:         #F59E0B
Muted text:   #9CA3AF
White:        #FFFFFF
```

---

## Uploading a Game

1. Build your game, zip it: `zip -r fruit-cutter.zip fruit-cutter/`
2. Open Admin Panel → **Game Packages** → Upload
3. The API transcodes nothing (games aren't video) — it stores the ZIP and extracts `manifest.json`
4. The `bundleUrl` is now available to assign to show rounds
5. In the Show Editor, pick your game for a round — the config fields from `configSchema` appear as a form

---

## Existing Games (Reference)

| Game ID | File | What it does |
|---|---|---|
| `trivia` | `game-packages/trivia/web/index.html` | 4-option MCQ, 2-column grid, timer bar |
| `quick-math` | `game-packages/quick-math/web/index.html` | Math equation, 4 numeric options |

Study `trivia` first — it is the canonical reference implementation for the bridge protocol.

---

## Game Ideas for Future Rounds

| Game | Mechanic | Engine |
|---|---|---|
| Fruit Cutter | Swipe SVG fruits before they fall | Vanilla JS + SVG |
| Spin the Wheel | Tap to stop a spinning wheel on a segment | Canvas |
| Reaction Time | Tap when the colour changes | Vanilla JS |
| Word Unscramble | Drag letters to form a word | Vanilla JS + touch events |
| Number Slider | Slide to the correct value | Vanilla JS range input styled |
| Emoji Match | Match pairs in a grid | Vanilla JS |
| Hot or Not | Swipe cards left/right | Vanilla JS + touch events |
| Beat the Clock | Type the answer before timer | Vanilla JS + keyboard input |

---

## Checklist Before Uploading

- [ ] ZIP is ≤ 150 KB compressed
- [ ] `index.html` has no external `<script src="">` or `<link>` tags
- [ ] `READY` is posted after render
- [ ] `SUBMIT_ANSWER` fires exactly once per round
- [ ] All inputs are locked after submission
- [ ] Timer counts down from `timeLimitMs`
- [ ] Tested in Chrome with the console injection above
- [ ] Tested on a mid-range Android screen (360×800) — use Chrome DevTools device toolbar
- [ ] `manifest.json` version bumped if config schema changed
- [ ] Dark background, no white backgrounds
- [ ] Touch targets ≥ 48×48px
