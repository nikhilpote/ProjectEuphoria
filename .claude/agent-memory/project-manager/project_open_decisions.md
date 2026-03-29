---
name: Project Euphoria Locked Decisions
description: All 5 original open decisions locked by Nikhil on 2026-03-27 — no open decisions remain
type: project
---

All 5 decisions that were previously unresolved have been locked as of 2026-03-27. They are recorded in the Decisions Log section at the top of `docs/project-plan.md`.

**D1 — Social auth scope:** Sign in with Apple + Google is IN P1. Required for the first demo. Use Passport.js with Apple + Google strategies. Added P1-T23 (backend) and P1-T24 (frontend). Guest auth (P1-T18) remains the default fallback.

**Why:** CEO demo requires named users, not anonymous guests.
**How to apply:** Any auth-related work in P1 must account for both guest and social login paths sharing the same `users` table via `social_provider` + `social_id` columns.

---

**D2 — PlayClips media format:** VIDEO (not static images). AWS MediaConvert pipeline transcodes raw uploads to HLS (3 renditions), S3 storage, CloudFront CDN delivery. Added P3-T27. Clip coordinates (for Spot the Difference / Find Items) are normalized 0–1 relative to video frame dimensions.

**Why:** Video clips are a core part of the product identity — the "TikTok-style" feel requires real video.
**How to apply:** Any task referencing PlayClips content must use `hls_manifest_cloudfront_url` and `expo-av` for playback, not static images. Admin clip upload must go through the MediaConvert pipeline.

---

**D3 — Soft launch scale:** 10K CONCURRENT players (not 10K total). This is a real engineering target: all 10K players are connected simultaneously via WebSocket at peak. Redis connection pool sized to max 200 connections. WebSocket pods sized for max 1,500 connections each (minimum 8 pods pre-warmed before show start to cover 10K).

**Why:** This is the CEO demo metric — "10K players" means live at the same time, not over the course of the show.
**How to apply:** Every load test, capacity calculation, and auto-scaling rule must use "concurrent" as the unit of measure.

---

**D4 — Find Items game placement:** BOTH engines. Find Items runs in PlayClips (P3-T05) and in Live Shows (P4-T23). The P4-T23 frontend component accepts a `mode` prop (`playclips | liveshow`) to branch submission between REST and WebSocket paths.

**Why:** Find Items is in the core MVP game library, which spans both engines.
**How to apply:** Do not treat Find Items as PlayClips-only. P4-T23 must be wired to both submission paths.

---

**D5 — Admin dashboard:** Responsive web app (React + TailwindCSS), served separately from the mobile Expo app. Accessible from phone browser at 375px viewport. All layouts use TailwindCSS responsive prefixes. Minimum 44px touch targets throughout. Not a native app.

**Why:** Operators will access the dashboard from their phones during live shows.
**How to apply:** All admin dashboard tasks (P2-T16, P2-T24, P4-T19, P4-T24) must deliver responsive designs and implementations. No fixed-width layouts. No hover-only affordances.
