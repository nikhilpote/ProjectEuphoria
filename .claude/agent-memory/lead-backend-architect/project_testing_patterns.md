---
name: Euphoria Testing Patterns
description: Jest config, supertest import pattern, Kysely mock pattern, known caveats discovered while building test suite
type: project
---

Jest configs are plain `.js` files (not `.ts`) — ts-node is not installed in the monorepo.
Unit tests: `jest.config.js` with `rootDir: 'src'`, `testRegex: '.*\\.spec\\.ts$'`.
E2E tests: `jest.e2e.config.js` with `rootDir: '.'`, `testRegex: '\\.e2e-spec\\.ts$'`, `forceExit: true`.

**Why:** ts-node is absent and the open-handle warning from Redis connections requires forceExit.
**How to apply:** When adding new test configs, use .js not .ts. Always include forceExit in E2E configs.

Supertest import pattern in E2E files (TypeScript strict mode):
```typescript
const request = require('supertest') as import('supertest').SuperTestStatic;
```
`import * as request from 'supertest'` fails TS2349 because supertest uses `export =` CommonJS style.

Kysely mock builder pattern for `insertInto(...).onConflict(cb).returning().execute()`:
- `onConflict` must be mocked as `jest.fn().mockImplementation(cb => { cb(conflictOc); return postConflictBuilder; })`
- `postConflictBuilder` holds `.returning().execute()` chain
- Simple `mockReturnThis()` on onConflict breaks because `.returning()` is never on the builder

Known behavioral caveats discovered during testing:
1. `POST /api/v1/shows/:id/register` has NO `@UseGuards(JwtAuthGuard)` — unauthenticated requests reach the handler and crash with 500 (TypeError: Cannot read properties of undefined 'sub'). This is a bug to fix.
2. `GET /api/v1/shows/:id/detail` correctly returns 401 (no token) and 403 (non-admin token).
3. `ADMIN_EMAILS` env var is not set in `.env` — admin endpoint test auto-skips when not configured.
4. The show ID column is UUID — passing non-UUID strings to `join_show` causes a Postgres parse error logged as `[WsExceptionsHandler] ERROR`. Server-side the error surfaces as a WsException but the error message includes the raw Postgres error. UUID validation should be added.
