# Euphoria — AI Agent Instructions

## Before Creating or Modifying Games

Read `docs/CreateGameUsingAI.md` — it covers every file, registration point, and validation step for the game system. Follow it linearly.

Read `game-packages/README.md` — it covers bundle constraints, the native bridge protocol, and the game HTML template.

## Critical Rules

- **Always validate game JS before uploading:** `sed -n '/<script>/,/<\/script>/p' web/index.html | sed '1d;$d' > /tmp/check.js && node --check /tmp/check.js` — a single syntax error silently kills the entire game with zero WebView error feedback.
- **app.config.js is authoritative for mobile API URL** — not config.ts. Always update it first when the IP changes.
- **Use `var` in game HTML** — not `const`/`let`. Some Android WebViews have block scoping edge cases.
- **Three data channels in game HTML** — always implement URL hash + `__EUPHORIA_GAME__` global + message event listener. See the template in CreateGameUsingAI.md.
