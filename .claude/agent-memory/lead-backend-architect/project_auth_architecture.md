---
name: Euphoria Auth Architecture
description: Social auth (Apple/Google), guest accounts, token strategy, and key design decisions for the auth module
type: project
---

## Auth module is at `apps/api/src/modules/auth/` (not `src/auth/`)

Two parallel flows coexist:
- **Mobile SDK id_token flow** — `POST /auth/apple` and `POST /auth/google` accept an `idToken` from the client SDK; verified server-side via JWKS (jwks-rsa + jsonwebtoken). This is the primary mobile path.
- **OAuth redirect flow** — `GET /auth/google/oauth` and `POST /auth/apple/callback` use passport-apple / passport-google-oauth20 strategies for server-side/web flows.

## Guest accounts

- `POST /auth/guest` creates a user with `is_guest = true`, `social_provider = 'guest'`, `email = NULL`, and a random `display_name` like `Player_x7k2`.
- `POST /auth/upgrade` (JWT-protected) links Apple or Google identity to an existing guest account via `upgradeGuestToSocial()`. Throws `ConflictException` if the social ID is already owned by a different account.

## JWT strategy allows empty email

Guest tokens have `email = ''` in the payload. `JwtStrategy.validate()` only checks `payload.sub` — do NOT add an `email` check.

## Token secrets

- Access tokens: signed with `JWT_SECRET`
- Refresh tokens: signed with `JWT_REFRESH_SECRET` (falls back to `JWT_SECRET` if unset)
- Both expire config from `JWT_ACCESS_EXPIRES_IN` (15m) and `JWT_REFRESH_EXPIRES_IN` (30d)

## Database

Migration 002 adds `social_provider TEXT` and `is_guest BOOLEAN` to `users`, and makes `email` nullable for guest rows. The migration runner at `src/database/migrate.ts` auto-discovers files by sorted filename.

## Why JWKS-based id_token verification (not google-auth-library)

Using `jwks-rsa` + `jsonwebtoken` for both Apple and Google avoids an extra heavy SDK dependency and keeps the verification pattern symmetric for both providers. Apple's JWKS endpoint is `https://appleid.apple.com/auth/keys`; Google's is `https://www.googleapis.com/oauth2/v3/certs`.

**Why:** Mobile SDK flow is standard for React Native apps — the client gets an id_token from the OS-level Apple/Google SDK and posts it directly; no OAuth redirect needed.
**How to apply:** When adding new auth providers (e.g. Facebook), follow the same JWKS pattern in AuthService rather than adding a new Passport strategy.
