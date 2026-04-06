# Adding a Construct 3 Game to Euphoria

This guide covers how to take a Construct 3 (C3) game from the web, strip it down, wire up the Euphoria bridge, and deploy it as a playable game in live shows.

**Reference implementation:** `game-packages/tap_tap_shoot/`

---

## Architecture Overview

```
Mobile App (built once):
  assets/c3-sdk/          ← C3 runtime + Box2D (shared across all C3 games)

Game Package on S3 (per game, uploaded via admin):
  tap_tap_shoot/
    index.html            ← Euphoria bridge + C3 bootstrap
    data.json             ← C3 project data (layouts, events, objects)
    manifest.json         ← Euphoria game metadata
    images/*.png           ← sprite sheets
    scripts/
      c3runtime.js        ← C3 engine (duplicated from SDK for now)
      main.js             ← C3 DOM handler
      supportcheck.js
      offlineclient.js
      project/
        main.js           ← stubbed (no CrazyGames SDK)
        scriptsInEvents.js ← stubbed SDK calls
    box2d.wasm.js + .wasm  ← physics engine
    style.css
```

> **Note:** Currently the SDK files are duplicated in each game package (for Expo Go dev compatibility). When doing native builds, the SDK in `apps/mobile/assets/c3-sdk/` will be used instead via `C3GameWebViewBridge`.

---

## Step-by-Step Process

### 1. Download the C3 Game Export

Find the game's CDN URL (e.g., from CrazyGames). Download the C3 web export files:

```bash
BASE="https://example.game-files.crazygames.com/game-name/version"
mkdir -p game-packages/my_game/{images,scripts/project,media,fonts}

# Core C3 files
curl -sL "$BASE/data.json" -o game-packages/my_game/data.json
curl -sL "$BASE/scripts/c3runtime.js" -o game-packages/my_game/scripts/c3runtime.js
curl -sL "$BASE/scripts/main.js" -o game-packages/my_game/scripts/main.js
curl -sL "$BASE/scripts/supportcheck.js" -o game-packages/my_game/scripts/supportcheck.js
curl -sL "$BASE/scripts/offlineclient.js" -o game-packages/my_game/scripts/offlineclient.js
curl -sL "$BASE/scripts/dispatchworker.js" -o game-packages/my_game/scripts/dispatchworker.js
curl -sL "$BASE/scripts/jobworker.js" -o game-packages/my_game/scripts/jobworker.js
curl -sL "$BASE/style.css" -o game-packages/my_game/style.css
curl -sL "$BASE/box2d.wasm.js" -o game-packages/my_game/box2d.wasm.js
curl -sL "$BASE/box2d.wasm" -o game-packages/my_game/box2d.wasm

# Game scripts
curl -sL "$BASE/scripts/project/main.js" -o game-packages/my_game/scripts/project/main.js
curl -sL "$BASE/scripts/project/scriptsInEvents.js" -o game-packages/my_game/scripts/project/scriptsInEvents.js

# Sprite sheets (find names in data.json or offline.json)
for f in shared-0-sheet0.png shared-0-sheet1.png ...; do
  curl -sL "$BASE/images/$f" -o "game-packages/my_game/images/$f"
done

# Optional: fonts, media (skip audio if not needed)
```

### 2. Fetch the Original index.html

```bash
curl -sL "$BASE/index.html" -H "Referer: https://www.crazygames.com/" -o /tmp/original_index.html
```

This shows you the exact C3 bootstrap structure — which scripts load, in what order.

### 3. Strip CrazyGames SDK

**`scripts/project/main.js`** — Replace with stub:
```js
// CrazyGames SDK not needed for standalone play
```

**`scripts/project/scriptsInEvents.js`** — Stub the SDK calls:
```js
var crazysdk = {
    gameplayStart: function() {},
    gameplayStop: function() {},
    displayAd: function() { return Promise.resolve(); }
};

// Keep the rest of the file as-is (the const scriptsInEvents = { ... } block)
```

### 4. Remove Domain Lock from data.json

C3 games often check `Browser.Domain` against a whitelist. Find and remove the check:

```python
import json

with open('data.json', 'r') as f:
    data = json.load(f)

# The domain check is typically in the Preloader event sheet
# Find the sub-event with OR conditions checking domain strings
# and clear its conditions array:
#   sub_event[6] = []    # clear conditions
#   sub_event[2] = False # clear OR flag

with open('data.json', 'w') as f:
    json.dump(data, f, separators=(',', ':'))
```

**How to find it:** Search `c3runtime.js` for strings like `"crazygames"`, `"speelspellestjes"` etc. These are the whitelisted domains. The event that uses `find(Domain, "crazygames")` is the one to disable.

### 5. Modify data.json for Euphoria

```python
import json

with open('data.json', 'r') as f:
    data = json.load(f)

# a) Skip splash/preloader — go straight to Game layout
data['project'][1] = "Game"

# b) Skip menu — start gameplay immediately
for ev in data['project'][6][0][1]:  # eGame events
    if isinstance(ev, list) and ev[0] == 1 and ev[1] == 'ShowMenu':
        ev[3] = 0  # initial value = 0

# c) Remove ad/analytics event sheet includes
for es in data['project'][6]:
    es[1] = [ev for ev in es[1]
             if not (isinstance(ev, list) and ev[0] == 2
                     and ev[1] in ("eQkyAds", "eSplashQKY"))]

# d) Disable ad groups
for es in data['project'][6]:
    for ev in es[1]:
        if isinstance(ev, list) and ev[0] == 3:
            group = ev[1]
            if isinstance(group, list) and group[1] in ("ADS_EVENTS", "CRAZYGAMES"):
                group[0] = False

# e) Remove splash/preloader layouts (keep Game + Cosas)
data['project'][5] = [l for l in data['project'][5] if l[0] in ("Game", "Cosas")]

# f) Clear UI elements we don't need (menu, pause, complete, sound buttons)
game_layout = data['project'][5][0]
layers = game_layout[9]

# Find object names for reference
obj_types = data['project'][3]
obj_names = {}
for i, ot in enumerate(obj_types):
    if isinstance(ot, list) and len(ot) > 0:
        obj_names[i] = ot[0]

# Clear layers: menu (3), pausa/pause (4), complete (5)
for layer_idx in [3, 4, 5]:
    if layer_idx < len(layers):
        layers[layer_idx][14] = []

# Remove specific buttons from remaining layers (sound, pause)
for layer in layers:
    layer[14] = [ig for ig in layer[14]
                 if not (isinstance(ig, list) and len(ig) >= 2
                         and obj_names.get(ig[1], '') in ('btnParlante', 'btnPausa'))]

# g) Optionally clear UI layer (timer bar, score text) if using HTML HUD
# layers[2][14] = []

with open('data.json', 'w') as f:
    json.dump(data, f, separators=(',', ':'))
```

### 6. Remove External URLs from c3runtime.js

```bash
# Check for any external URLs
grep -oP 'https?://[^\s"'\''<>\\]+' scripts/c3runtime.js | sort -u

# Only comment/attribution URLs should remain (construct.net, github.com)
# If there are actual network calls, replace them:
sed -i "s|window.open('https://www.crazygames.com/')|void 0|g" scripts/c3runtime.js
```

### 7. Delete Unnecessary Assets

```bash
# Remove audio (not needed for Euphoria games)
rm -rf media/ fonts/

# Remove icons, service worker, offline files
rm -f sw.js offline.json appmanifest.json
rm -rf icons/
```

### 8. Create the Euphoria Bridge (index.html)

This is the key file. It loads the C3 runtime and monitors the game's `score` variable:

```html
<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="style.css">
<style>
/* HUD styling */
#euphoria-hud {
  position:fixed; top:8px; left:50%; transform:translateX(-50%);
  z-index:2147483646; pointer-events:none; display:flex; align-items:center; gap:8px;
  background:rgba(13,13,26,0.9); border:1px solid #2A2A4A; border-radius:20px;
  padding:6px 14px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  font-size:14px; font-weight:700; color:#9CA3AF; opacity:0; transition:opacity 0.4s;
}
#euphoria-hud.visible { opacity:1; }
#hud-status { display:none; font-size:11px; font-weight:800; letter-spacing:1px; padding:2px 8px; border-radius:10px; }
#hud-status.passed { display:inline; background:#10B981; color:#fff; }
canvas { z-index:1 !important; }
</style>
</head>
<body>

<div id="euphoria-hud">
  <span id="hud-score">0 / 4</span>
  <span id="hud-status"></span>
</div>

<!-- C3 Runtime -->
<script src="box2d.wasm.js"></script>
<script src="scripts/supportcheck.js"></script>
<script src="scripts/offlineclient.js" type="module"></script>
<script src="scripts/main.js" type="module"></script>

<script>
(function() {
  var submitted = false;
  var startTs = Date.now();
  var required = 4;  // default, overridden by config
  var passed = false;

  var $hud = document.getElementById('euphoria-hud');
  var $score = document.getElementById('hud-score');
  var $status = document.getElementById('hud-status');

  // ── Config from native bridge ──
  function parseInit(g) {
    if (g && g.requiredScore) required = Number(g.requiredScore);
    $score.textContent = '0 / ' + required;
  }

  // 3-channel reception (URL hash, global, message)
  if (location.hash && location.hash.length > 1) {
    try { parseInit(JSON.parse(decodeURIComponent(location.hash.slice(1)))); } catch(e) {}
  }
  if (window.__EUPHORIA_GAME__) parseInit(window.__EUPHORIA_GAME__.payload || window.__EUPHORIA_GAME__);
  window.addEventListener('message', function(e) {
    var msg;
    try { msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch(err) { return; }
    if (msg && msg.type === 'GAME_INIT' && msg.payload) parseInit(msg.payload);
  });

  // ── Native bridge ──
  function postToNative(msg) {
    var str = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(str);
    else window.parent.postMessage(str, '*');
  }

  // ── Monitor C3 runtime — ALWAYS USE 'score' VARIABLE ──
  // The C3 'score' variable is the universal pass/fail metric.
  // It increments per basket (+1 normal, +2 perfect shot).
  // Admin sets requiredScore in the show config.
  // Player keeps playing until round timer expires.
  // Score >= required = PASSED (survived).
  setInterval(function() {
    var rt = window.c3_runtimeInterface;
    if (!rt) return;
    var localRt = rt._localRuntime;
    if (!localRt) return;
    var esm = localRt._eventSheetManager;
    if (!esm) return;
    var globals = esm._allGlobalVars;
    if (!globals || !globals.length) return;
    $hud.classList.add('visible');

    // Read C3 'score' global variable
    var score = 0;
    for (var i = 0; i < globals.length; i++) {
      var v = globals[i];
      if ((v._name || '') === 'score') { score = v._value; break; }
    }

    // Update HUD
    $score.textContent = score + ' / ' + required;

    // PASSED — submit answer but don't stop the game
    if (score >= required && !passed) {
      passed = true;
      $status.textContent = 'PASSED';
      $status.className = 'passed';
      if (!submitted) {
        submitted = true;
        postToNative({
          type: 'SUBMIT_ANSWER',
          payload: {
            gameType: 'MY_GAME_ID',  // ← change this
            correct: true,
            score: score,
            timeTakenMs: Date.now() - startTs
          }
        });
      }
    }
  }, 300);

  // Notify native when C3 runtime is ready
  var readyCheck = setInterval(function() {
    if (window.c3_runtimeInterface && window.c3_runtimeInterface._localRuntime) {
      clearInterval(readyCheck);
      postToNative({ type: 'READY' });
    }
  }, 200);
})();
</script>
</body></html>
```

**Key points:**
- **Always use the `score` variable** as the pass/fail metric across all C3 games
- The admin sets `requiredScore` — player must reach this score to survive
- The game **never stops** — player keeps playing until the round timer expires
- `SUBMIT_ANSWER` is sent once when score >= required, with `correct: true`
- If the timer expires without reaching the score, no answer = eliminated

### 9. Create manifest.json

```json
{
  "id": "my_game_id",
  "name": "My Game Name",
  "version": "1.0.0",
  "description": "Short description of the game",
  "engine": "construct3",
  "layout": "fullscreen",
  "configSchema": {
    "requiredScore": {
      "type": "number",
      "label": "Score to reach",
      "required": false,
      "min": 1,
      "max": 50
    }
  }
}
```

### 10. Register in the Backend

**a) Add game type** — `packages/types/src/games.ts`:
```ts
export type GameType = '...' | 'my_game_id';
```

**b) Create handler** — `apps/api/src/modules/games/handlers/my-game.handler.ts`:
```ts
import { BaseGameHandler } from '../base-game-handler';
import type { GameAnswer } from '@euphoria/types';

export class MyGameHandler extends BaseGameHandler {
  readonly type = 'my_game_id';

  private unwrap(config: Record<string, unknown>): Record<string, unknown> {
    return (config['myGame'] as Record<string, unknown>) ?? config;
  }

  buildClientPayload(config: Record<string, unknown>): Record<string, unknown> {
    const g = this.unwrap(config);
    return { requiredScore: g['requiredScore'] ?? 4 };
  }

  buildQuestionEvent(
    config: Record<string, unknown>,
    { showId, roundIndex, timeLimitMs }: { showId: string; roundIndex: number; timeLimitMs: number },
  ): Record<string, unknown> {
    const g = this.unwrap(config);
    return { showId, roundIndex, timeLimitMs, requiredScore: g['requiredScore'] ?? 4 };
  }

  isCorrect(_config: Record<string, unknown>, answer: GameAnswer): boolean {
    return (answer as any).correct === true;
  }

  getCorrectAnswerText(config: Record<string, unknown>): string {
    const g = this.unwrap(config);
    return `Score ${g['requiredScore'] ?? 4} points`;
  }
}
```

**c) Register handler** — `apps/api/src/modules/games/games.module.ts`:
```ts
import { MyGameHandler } from './handlers/my-game.handler';
// In onModuleInit():
this.registry.register(new MyGameHandler());
```

**d) Add to mobile registry** — `apps/mobile/src/games/c3-games.ts`:
```ts
export const C3_GAME_TYPES: Record<string, boolean> = {
  tap_tap_shoot: true,
  my_game_id: true,  // ← add here
};
```

### 11. Update Admin

In `apps/admin/src/pages/ShowsPage.tsx`:

- Add to `GAME_TYPES` array
- Add to `GAME_TYPE_LABELS` and `GAME_TYPE_SHORT`
- Add default config in `defaultConfig()`
- Add to `GAME_TEMPLATE`
- Add config form in `renderConfigForm()`

### 12. Build, Upload, Test

```bash
# Zip the game package
cd game-packages/
zip -r my_game.zip my_game/

# Upload via admin panel or API
curl -X POST http://localhost:3000/api/v1/admin/games/upload -F "file=@my_game.zip"

# Enable in admin, add to a live show, test on mobile
```

---

## Verify No External Network Calls

Before shipping, always verify:

```bash
# Check all shipped files for external URLs
grep -rhoP 'https?://[^\s"'\''<>\\]+' game-packages/my_game/ | sort -u
```

Only comment/attribution URLs should appear (e.g., `construct.net`, `github.com`). No CrazyGames, analytics, Facebook, or ad network URLs.

---

## C3 Runtime Access Pattern

To read game variables from the bridge JavaScript:

```js
var rt = window.c3_runtimeInterface;
var localRt = rt._localRuntime;
var esm = localRt._eventSheetManager;
var globals = esm._allGlobalVars;

for (var i = 0; i < globals.length; i++) {
  var v = globals[i];
  var name = v._name;   // variable name string
  var val = v._value;    // current value
}
```

**Always use `score` as the pass/fail variable.** It's the most reliable metric across C3 games — it increments on meaningful game actions (baskets, hits, catches, etc.).

---

## Checklist

- [ ] C3 export downloaded (data.json, c3runtime.js, sprites, etc.)
- [ ] CrazyGames SDK stubbed (project/main.js, scriptsInEvents.js)
- [ ] Domain lock removed from data.json
- [ ] First layout set to "Game", ShowMenu = 0
- [ ] Splash/menu/pause/complete layers cleared
- [ ] Sound/pause buttons removed
- [ ] Ad groups disabled
- [ ] Audio files deleted (unless needed)
- [ ] External URLs removed from c3runtime.js
- [ ] index.html created with Euphoria bridge (monitors `score`, shows HUD)
- [ ] manifest.json created with `engine: "construct3"` and `requiredScore` config
- [ ] Handler registered in API
- [ ] Game type added to admin show editor
- [ ] No external network calls (verified with grep)
- [ ] ZIP uploaded and tested in live show
