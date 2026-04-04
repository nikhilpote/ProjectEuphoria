# Euphoria Game Design System
## Version 1.0 — Definitive Reference for AI Game Agents

Read this document **before writing any game**. Every decision here is derived from three sources: the three existing games (trivia, quick-math, spot-difference), the WebView constraints documented in README.md, and the platform's target (India, tier 2/3 cities, mid-range Android). Where the existing games have inconsistencies, this document is the authority — new games follow the spec, existing games will be brought into alignment over time.

---

## 1. Art Style Direction

### The Style: Neon-Dark Arcade with Restraint

Euphoria games are **not** flat, **not** glassmorphic, **not** neo-brutalist. They are **neon-dark arcade** — the visual language of premium mobile game UIs (BGMI, among us, Dream11) translated to the constraints of a single HTML file. Think: deep space background, glowing accent lines, colored tile options, tabular-numeric scores. It should feel like a TV game show beamed through a phone — familiar to a Kaun Banega Crorepati viewer but native to a mobile screen.

### Three pillars of the style

**1. Dark depth, not flat dark.** The background is near-black (`#0D0D1A`). Surfaces sit one level above (`#1A1A2E`). Borders are barely-there deep-navy (`#2A2A4A`). This three-layer system creates visible depth without shadows or blur, which are expensive on Snapdragon 665.

**2. Color from accent, not from noise.** One primary accent color (violet) unifies all games. Per-game accent overrides are allowed but tightly constrained (see Section 9). The four option slots in MCQ games each have their own fixed color identity (violet, blue, amber, red) — these are the only decorative colors allowed inside a game. No rainbow gradients, no random splashes of color.

**3. Motion earns attention.** Animations exist only at state-change moments: tap, correct, wrong, time-up, result. Idle UI must be static (timer bar excluded). This is a performance requirement and a UX principle — micro-games are 10-20 seconds; ambient animation wastes both frames and player attention.

### Premium vs. budget trade-off

Do not use: `box-shadow` on large surfaces, `backdrop-filter: blur()`, CSS `filter`, multiple layered gradients, `border-image`, SVG filters, WebGL, or animated backgrounds. These cause GPU jank on Snapdragon 665 and Helio G85 chips.

Do use: single-layer linear gradients on small elements (timer bar, badges), `transform: scale()` for tap feedback (GPU-composited), `opacity` transitions (GPU-composited), canvas for particle effects, `border` color transitions.

---

## 2. Typography System

### Font Stack

```css
/* Primary — all UI text */
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif;

/* Numeric — scores, timers, math expressions */
font-family: 'SF Mono', 'Roboto Mono', monospace;
/* Always pair with: font-variant-numeric: tabular-nums; */
```

Never inline a custom font. Never use `@font-face`. The WebView on a ₹8,000 Android phone has the system sans-serif and nothing else reliable.

### Type Scale

| Role | Size | Weight | Letter-spacing | Use |
|---|---|---|---|---|
| **micro-label** | 9px | 700 | 0.12em | Panel labels, "ORIGINAL", "TAP HERE" — uppercase only |
| **caption** | 10px | 700 | 0.10em | Section labels above cards ("QUESTION", "SOLVE") — uppercase only |
| **body** | 13px | 500–600 | 0 | Timer text, instruction bar, submitted banner, error messages |
| **option-text** | 14px | 500 | 0 | Text inside option buttons (trivia answer text) |
| **question** | 17px | 600 | 0 | Question card main text, line-height: 1.45 |
| **display** | 26–28px | 800 | -0.02em | Math expressions, game prompts requiring instant legibility |
| **result-title** | 22px | 800 | -0.02em | "Found it!", "Time's Up!", result banners |
| **countdown** | 72px | 900 | -0.04em | Pre-game 3-2-1 countdown |
| **score-number** | 32–48px | 800 | -0.03em | Coin amounts, streak numbers — always monospace + tabular-nums |

### Rules

- Minimum rendered size: **13px**. Never go below even in labels — use uppercase + letter-spacing to compensate for visual weight at small sizes.
- Line-height for multi-line text (questions): `1.45`. All single-line UI elements: `1` or explicit pixel height.
- `font-variant-numeric: tabular-nums` is mandatory on any element that shows numbers that change (timer, score, expression).
- Do not mix weights within a single UI region. A card uses one weight for its label, one for its content.

---

## 3. Color System

### Core Palette (non-negotiable across all games)

```css
:root {
  /* Backgrounds — the layered dark system */
  --bg:          #0D0D1A;   /* Page background / deepest layer */
  --card:        #1A1A2E;   /* Card surfaces, option buttons at rest */
  --border:      #2A2A4A;   /* Borders, inactive timer track, dividers */

  /* Primary accent */
  --accent:      #7C3AED;   /* Violet — primary interactive color */
  --accent-soft: rgba(124, 58, 237, 0.15);  /* Accent fill for selected states */
  --accent-glow: rgba(124, 58, 237, 0.25);  /* Accent glow for focus rings */

  /* Text */
  --text:        #FFFFFF;   /* Primary text — headings, option values */
  --muted:       #9CA3AF;   /* Secondary text — labels, instructions, idle timer */

  /* Semantic — feedback states */
  --success:     #10B981;   /* Correct answer, found, complete */
  --danger:      #EF4444;   /* Wrong answer, time-up, error */
  --warning:     #F59E0B;   /* Gold — coins, rewards, streak */
  --urgent:      #F97316;   /* Timer urgent gradient end (orange) */
}
```

### Option Color Identity (MCQ games only)

These four colors are fixed. Option A is always violet, B is always blue, C is always amber, D is always red. This is a cognitive anchor for players who will play dozens of rounds — they build a muscle memory association with position + color.

```css
/* Option A */
--opt-a-border: #7C3AED;
--opt-a-fill:   rgba(124, 58, 237, 0.15);
--opt-a-label:  #A78BFA;   /* lighter violet for the A/B/C/D badge text */
--opt-a-badge:  rgba(124, 58, 237, 0.20);

/* Option B */
--opt-b-border: #2563EB;
--opt-b-fill:   rgba(37, 99, 235, 0.15);
--opt-b-label:  #60A5FA;
--opt-b-badge:  rgba(37, 99, 235, 0.20);

/* Option C */
--opt-c-border: #D97706;
--opt-c-fill:   rgba(217, 119, 6, 0.15);
--opt-c-label:  #FCD34D;
--opt-c-badge:  rgba(217, 119, 6, 0.20);

/* Option D */
--opt-d-border: #DC2626;
--opt-d-fill:   rgba(220, 38, 38, 0.15);
--opt-d-label:  #FCA5A5;
--opt-d-badge:  rgba(220, 38, 38, 0.20);
```

### Semantic Color Usage Rules

- **--success** (#10B981): found circles, correct border glow, submitted banner, checkmarks. Never use it for decorative purposes.
- **--danger** (#EF4444): wrong tap ripple, timer urgent fill-start, error states, "TIME'S UP" text. Never use it for emphasis.
- **--warning** (#F59E0B): coin icons, streak fire badge, gold reward numbers. Never use it for negative states.
- Result overlay background: `rgba(10, 10, 26, 0.88)` — not `--bg` directly; the opacity matters.

### Glow and Shadow Standards

Glows are applied with `box-shadow`, not CSS `filter: drop-shadow()` (too expensive). Use only on small elements. Never stack multiple box-shadows.

```css
/* Correct/success border glow — applied to panels, cards */
box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);

/* Accent glow — for focused/selected interactive elements */
box-shadow: 0 0 10px rgba(124, 58, 237, 0.35);

/* Warning/coin glow */
box-shadow: 0 0 8px rgba(245, 158, 11, 0.4);

/* Danger glow (use sparingly, e.g. urgent timer border) */
box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
```

No `text-shadow`. No `filter: blur()`. No `backdrop-filter`.

### Gradient Rules

Gradients are allowed on: the timer bar fill, small badge backgrounds, countdown number fills (optional). Never on: card backgrounds, the page background, option buttons, or any element larger than 60px in either dimension.

```css
/* Timer bar — idle state */
background: linear-gradient(90deg, #7C3AED, #A855F7);

/* Timer bar — urgent state (swap in via class) */
background: linear-gradient(90deg, #EF4444, #F97316);

/* Countdown number (optional accent fill) */
background: linear-gradient(180deg, #A855F7, #7C3AED);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
/* NOTE: Only use text-gradient if performance profiling shows it's fine.
   Fallback: just use --text (#FFFFFF) for the countdown number. */
```

Direction is always `90deg` (horizontal) for bar fills, `135deg` or `180deg` for decorative badges/text. Never radial gradients — they are computationally heavier.

---

## 4. Layout Patterns

### Shared Layout Foundation

All games share this outer structure:

```css
* { margin: 0; padding: 0; box-sizing: border-box;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation; }

html, body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif;
  height: 100%;
  overflow: hidden;
  user-select: none;
}

#root {
  display: flex;
  flex-direction: column;
  height: 100%;
}
```

The `#root` is a flex column. Every layout defines how it fills that column. No scrolling anywhere.

---

### Layout A: "Options" (trivia, quick_math, spelling_bee)

Used for: any game where the player reads a prompt and taps one of 4 choices.

```
┌────────────────────────────────────┐
│ [Timer bar ████████░░░░░░░]  [14s] │  ← HUD row, flex-shrink: 0
│ ┌──────────────────────────────┐   │
│ │ LABEL                        │   │
│ │ Question / Expression text   │   │  ← Prompt card, flex-shrink: 0
│ └──────────────────────────────┘   │
│ ┌──────────┐  ┌──────────┐         │
│ │  A        │  │  B        │        │
│ │  Option   │  │  Option   │        │  ← Options grid, flex: 1
│ └──────────┘  └──────────┘         │
│ ┌──────────┐  ┌──────────┐         │
│ │  C        │  │  D        │        │
│ │  Option   │  │  Option   │        │
│ └──────────┘  └──────────┘         │
│ [Answer submitted ✓]               │  ← Submitted banner, hidden until tap
└────────────────────────────────────┘
```

**Spec:**

```css
#root { padding: 12px 14px; gap: 10px; }

/* Timer row — always first child */
#hud { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
#timer-track { flex: 1; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
#timer-fill  { height: 100%; border-radius: 2px; transform-origin: left;
               background: linear-gradient(90deg, var(--accent), #A855F7);
               transition: background 0.3s; }
#timer-fill.urgent { background: linear-gradient(90deg, var(--danger), var(--urgent)); }
#timer-text  { font-size: 13px; font-weight: 700; color: var(--muted); min-width: 28px;
               text-align: right; font-variant-numeric: tabular-nums; flex-shrink: 0; }
#timer-text.urgent { color: var(--danger); }

/* Prompt card */
#prompt-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 16px 18px;
  flex-shrink: 0;
}
#prompt-label { font-size: 10px; font-weight: 700; letter-spacing: 0.10em;
                text-transform: uppercase; color: var(--accent); margin-bottom: 8px; }
#prompt-text  { font-size: 17px; font-weight: 600; line-height: 1.45; color: var(--text); }

/* For math/display expressions — use instead of #prompt-text */
#prompt-display { font-size: 28px; font-weight: 800; letter-spacing: -0.02em;
                  text-align: center; color: var(--text); font-variant-numeric: tabular-nums; }

/* Options grid */
#options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; flex: 1; }
```

**Option button states:**

```css
.option-btn {
  display: flex; flex-direction: column; align-items: flex-start;
  gap: 6px; padding: 14px; border-radius: 14px;
  border: 1.5px solid var(--border); background: var(--card);
  cursor: pointer; -webkit-user-select: none; user-select: none;
  transition: transform 0.1s, border-color 0.15s, background 0.15s;
  /* Minimum touch target: padding ensures the button fills its grid cell */
  min-height: 48px;
}

/* Tap feedback — GPU-composited, zero paint cost */
.option-btn:active { transform: scale(0.96); }

/* A/B/C/D badge */
.option-btn .badge {
  width: 26px; height: 26px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 800; flex-shrink: 0;
}

/* Per-option color — apply via data-idx attribute */
.option-btn[data-idx="0"] { border-color: rgba(124,58,237,0.4); }
.option-btn[data-idx="0"] .badge { background: var(--opt-a-badge); color: var(--opt-a-label); }
.option-btn[data-idx="1"] { border-color: rgba(37,99,235,0.4); }
.option-btn[data-idx="1"] .badge { background: var(--opt-b-badge); color: var(--opt-b-label); }
.option-btn[data-idx="2"] { border-color: rgba(217,119,6,0.4); }
.option-btn[data-idx="2"] .badge { background: var(--opt-c-badge); color: var(--opt-c-label); }
.option-btn[data-idx="3"] { border-color: rgba(220,38,38,0.4); }
.option-btn[data-idx="3"] .badge { background: var(--opt-d-badge); color: var(--opt-d-label); }

/* Selected state — replaces border color and fills background */
.option-btn[data-idx="0"].selected { border-color: var(--opt-a-border); border-width: 2px;
  background: var(--opt-a-fill); }
.option-btn[data-idx="1"].selected { border-color: var(--opt-b-border); border-width: 2px;
  background: var(--opt-b-fill); }
.option-btn[data-idx="2"].selected { border-color: var(--opt-c-border); border-width: 2px;
  background: var(--opt-c-fill); }
.option-btn[data-idx="3"].selected { border-color: var(--opt-d-border); border-width: 2px;
  background: var(--opt-d-fill); }

/* Selected badge — override to solid fill */
.option-btn[data-idx="0"].selected .badge { background: var(--opt-a-border); color: #fff; }
.option-btn[data-idx="1"].selected .badge { background: var(--opt-b-border); color: #fff; }
.option-btn[data-idx="2"].selected .badge { background: var(--opt-c-border); color: #fff; }
.option-btn[data-idx="3"].selected .badge { background: var(--opt-d-border); color: #fff; }

/* Correct reveal (shown after SUBMIT_ANSWER returns correctIndex) */
.option-btn.correct { border-color: var(--success); border-width: 2px;
  background: rgba(16,185,129,0.15); }
.option-btn.correct .badge { background: var(--success); color: #fff; }

/* Wrong reveal */
.option-btn.wrong { border-color: var(--danger); border-width: 2px;
  background: rgba(239,68,68,0.10); }

/* Locked (non-selected after answer) */
.option-btn.locked { opacity: 0.45; cursor: not-allowed; pointer-events: none; }
.option-btn.locked.selected { opacity: 1; }
```

**Answer text inside option:**

```css
/* For trivia — left-aligned text below the badge */
.option-btn .text { font-size: 14px; font-weight: 500; color: var(--text); line-height: 1.3; }

/* For quick-math — large centered number */
.option-btn .value { font-size: 26px; font-weight: 800; color: var(--text);
                     font-variant-numeric: tabular-nums; }
.option-btn .label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
                     text-transform: uppercase; color: var(--muted); }
```

---

### Layout B: "Fullscreen Interactive" (spot_difference, find_items)

Used for: games where the player taps directly on visual content (images, grids, hidden object scenes).

```
┌────────────────────────────────────┐
│ [Timer bar ████████░░░░░░░]  [14s] │  ← HUD row
│ ┌──────────────────────────────┐   │
│ │ ORIGINAL                     │   │
│ │  (image/canvas — 45% height) │   │  ← Panel A — static/reference
│ └──────────────────────────────┘   │
│ ┌──────────────────────────────┐   │
│ │ TAP THE DIFFERENCE BELOW     │   │
│ │  (image/canvas — 45% height) │   │  ← Panel B — interactive
│ └──────────────────────────────┘   │
│ [instruction text]                 │  ← 1-line instruction
└────────────────────────────────────┘
```

```css
#root { padding: 10px 12px 12px; gap: 8px; }

#hud { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
/* Timer in Layout B has height: 5px (1px taller than Layout A) for fullscreen presence */
#timer-track { flex: 1; height: 5px; background: var(--border); border-radius: 3px; overflow: hidden; }
#timer-fill  { height: 100%; border-radius: 3px; transform-origin: left;
               background: linear-gradient(90deg, var(--accent), #A855F7);
               transition: transform 0.25s linear, background 0.4s; }
#timer-fill.urgent { background: linear-gradient(90deg, var(--danger), var(--urgent)); }
#timer-text  { font-size: 13px; font-weight: 700; color: var(--muted);
               min-width: 28px; text-align: right; font-variant-numeric: tabular-nums; }
#timer-text.urgent { color: var(--danger); }

#panels { display: flex; flex-direction: column; flex: 1; gap: 6px; min-height: 0; }

.panel { flex: 1; display: flex; flex-direction: column; gap: 4px; min-height: 0; }

.panel-label {
  text-align: center; font-size: 9px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--muted); flex-shrink: 0;
}
.panel-label.interactive { color: var(--accent); }  /* "TAP HERE" style label */

.canvas-wrap {
  flex: 1; position: relative; border-radius: 12px; overflow: hidden;
  background: var(--card); border: 1.5px solid var(--border); min-height: 0;
}
.canvas-wrap.interactive { border-color: var(--accent); cursor: crosshair; }
.canvas-wrap.state-found  { border-color: var(--success); box-shadow: 0 0 12px rgba(16,185,129,0.4); }
.canvas-wrap.state-wrong  { border-color: var(--danger); }

/* Overlay canvas — always on top, pointer-events: none */
.canvas-overlay { position: absolute; inset: 0; pointer-events: none; }

#instruction {
  flex-shrink: 0; text-align: center; font-size: 12px; font-weight: 600;
  color: var(--muted); letter-spacing: 0.03em; padding: 2px 0;
}
```

**Touch target rule for canvas games:** The entire canvas element is the touch target. On the canvas side, hit-zone circles must have a minimum radius of 24px in screen-pixel space (not image-normalized space) regardless of image size. Map coordinates correctly using `getBoundingClientRect()`.

---

### Layout C: "Skill / Action" (knife_at_center, fruit_cutting, spin_wheel)

Used for: games with a single primary action (tap timing, swipe gesture, aim and release). No option grid — one action zone, one score area.

```
┌────────────────────────────────────┐
│ [Timer bar ████████░░░░░░░]  [14s] │  ← HUD row
│ ┌──────────────────────────────┐   │
│ │  Score / Streak              │   │  ← Score strip, flex-shrink: 0
│ └──────────────────────────────┘   │
│                                    │
│         [Game canvas]              │  ← Main action area, flex: 1
│                                    │     (Canvas or SVG — fills space)
│                                    │
│ ┌──────────────────────────────┐   │
│ │  Feedback: "PERFECT!" "MISS!"│   │  ← Feedback strip, flex-shrink: 0
│ └──────────────────────────────┘   │
└────────────────────────────────────┘
```

```css
#root { padding: 12px 14px 16px; gap: 8px; }

/* Score strip */
#score-strip {
  display: flex; align-items: center; justify-content: center; gap: 16px;
  flex-shrink: 0; padding: 8px 0;
}
#score-coins { font-family: 'SF Mono', 'Roboto Mono', monospace;
               font-size: 24px; font-weight: 800; color: var(--warning);
               font-variant-numeric: tabular-nums; }
#score-streak { font-size: 13px; font-weight: 700; color: var(--muted); }

/* Main canvas area */
#game-canvas-wrap { flex: 1; position: relative; min-height: 0; }
#game-canvas { width: 100%; height: 100%; display: block; touch-action: none; }

/* Feedback strip */
#feedback-strip {
  flex-shrink: 0; text-align: center;
  font-size: 20px; font-weight: 800; letter-spacing: -0.01em;
  height: 32px; /* fixed height prevents layout shift */
  display: flex; align-items: center; justify-content: center;
}
```

**Action zone definition:** The tappable game area should have no visual boundary (the canvas fills its wrapper). For games like knife-throwing, the target/wheel should be centered in the canvas with a clear visual affordance (rotating element, colored zone). Never add a visible "tap here" border on the action canvas itself — the game content communicates interaction.

---

## 5. Common UI Components

These must look **identical** across all games. Copy them verbatim.

---

### 5.1 Timer Bar

The timer bar is the single most important UI element. It appears in every game, at the top of the layout.

**Behavior spec:**
- Starts full-width (scaleX 1.0), shrinks to scaleX 0 over `timeLimitMs`
- Updated every rAF frame via `transform: scaleX()` — never change `width`
- Transitions: `transition: transform 0.25s linear` keeps it smooth without over-smoothing
- Urgent state triggers at `<= 5 seconds` remaining
- The text counter shows `Math.ceil(remaining / 1000)` — so it reads "20" when there is any portion of the 20th second left
- Text color shifts to `var(--danger)` in urgent state

```css
#timer-track {
  flex: 1; height: 4px;       /* Layout A: 4px; Layout B: 5px */
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}
#timer-fill {
  height: 100%; width: 100%;
  background: linear-gradient(90deg, #7C3AED, #A855F7);
  border-radius: 2px;
  transform-origin: left;
  transition: background 0.3s;
  /* DO NOT add transform transition here — it fights the rAF loop */
}
#timer-fill.urgent { background: linear-gradient(90deg, #EF4444, #F97316); }

#timer-text {
  font-size: 13px; font-weight: 700; color: var(--muted);
  min-width: 28px; text-align: right;
  font-variant-numeric: tabular-nums; flex-shrink: 0;
}
#timer-text.urgent { color: var(--danger); }
```

**JS implementation (canonical):**

```javascript
var $fill = document.getElementById('timer-fill');
var $text = document.getElementById('timer-text');
var startTs, rafId, timeLimitMs;

function startTimer() {
  startTs = performance.now();
  rafId = requestAnimationFrame(tickTimer);
}

function tickTimer() {
  var elapsed = performance.now() - startTs;
  var remaining = Math.max(0, timeLimitMs - elapsed);
  var secs = Math.ceil(remaining / 1000);

  $fill.style.transform = 'scaleX(' + (remaining / timeLimitMs) + ')';
  $text.textContent = secs;

  var urgent = secs <= 5;
  $fill.classList.toggle('urgent', urgent);
  $text.classList.toggle('urgent', urgent);

  if (remaining > 0 && !answered) {
    rafId = requestAnimationFrame(tickTimer);
  } else if (remaining <= 0 && !answered) {
    timeUp();
  }
}

function stopTimer() { cancelAnimationFrame(rafId); }
```

---

### 5.2 Result Banner

The result banner overlays the entire game surface. It appears at end-of-round (correct, wrong, time-up, partial-complete). It must be consistent across all games.

```css
#result-banner {
  position: fixed; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px;
  background: rgba(10, 10, 26, 0.88);
  opacity: 0; pointer-events: none;
  transition: opacity 0.25s ease;
  z-index: 100;
}
#result-banner.visible { opacity: 1; pointer-events: all; }

#result-icon {
  width: 72px; height: 72px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 36px; line-height: 1;
}
#result-icon.success { background: rgba(16,185,129,0.15); border: 2px solid var(--success); }
#result-icon.fail    { background: rgba(239,68,68,0.15);  border: 2px solid var(--danger); }
#result-icon.warning { background: rgba(245,158,11,0.15); border: 2px solid var(--warning); }

#result-title { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
#result-title.success { color: var(--success); }
#result-title.fail    { color: var(--danger); }
#result-title.warning { color: var(--warning); }

#result-sub { font-size: 13px; color: var(--muted); text-align: center; }

#result-coins {
  font-family: 'SF Mono', 'Roboto Mono', monospace;
  font-size: 28px; font-weight: 800; color: var(--warning);
  font-variant-numeric: tabular-nums;
}
```

**Result states and content:**

| Outcome | Icon text | Title text | Title class | Sub text |
|---|---|---|---|---|
| Correct | ✓ | "Correct!" | success | "Well done" or category-specific |
| Wrong (answered) | ✗ | "Wrong!" | fail | "The answer was [X]" |
| Time's up (no answer) | ✗ | "Time's Up!" | fail | "The answer has been revealed" |
| Partial found | ~ | "Almost!" | warning | "[N] found — [M] to go" |
| All found | ✓ | "Found It!" | success | "Great eye!" |
| Perfect (skill game) | ✓ | "Perfect!" | success | "+[N] coins" |
| Miss (skill game) | ✗ | "Miss!" | fail | "So close!" |

**Show the banner:** `setTimeout(() => { $banner.classList.add('visible'); }, 300);` — the 300ms delay lets the tap animation complete before the overlay appears. Do not show it immediately.

---

### 5.3 Score Display (in-round)

Coins and streak are shown during Layout C games (skill games). For Layout A/B games, they are shown only on the result banner (not in-round, as the question/canvas takes priority).

```css
/* Coin display */
.coins-display {
  display: flex; align-items: center; gap: 6px;
}
.coins-icon { font-size: 18px; line-height: 1; }  /* use ◆ or a coin emoji */
.coins-value {
  font-family: 'SF Mono', 'Roboto Mono', monospace;
  font-size: 24px; font-weight: 800; color: var(--warning);
  font-variant-numeric: tabular-nums;
}

/* Streak display */
.streak-display {
  display: flex; align-items: center; gap: 4px;
}
.streak-fire { font-size: 16px; }  /* use 🔥 — this is game UI, emoji is fine */
.streak-value { font-size: 16px; font-weight: 700; color: var(--warning); }
```

---

### 5.4 Loading State

Every game that fetches data (like spot-difference fetching level config) must show a loading state. Games that receive all data via `GAME_INIT` can skip this.

```css
#loading {
  position: fixed; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 14px;
  background: var(--bg);
  z-index: 200;
  transition: opacity 0.3s;
}
#loading.hidden { opacity: 0; pointer-events: none; }

.spinner {
  width: 36px; height: 36px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

#load-status { font-size: 12px; font-weight: 500; color: var(--muted); text-align: center; }
```

Hide the loading screen: `$loading.classList.add('hidden');` then after the transition: remove from DOM or leave hidden.

---

### 5.5 Pre-Game Countdown (3-2-1)

Used when the native shell signals a round is about to start but hasn't sent `GAME_INIT` yet. Optional — only implement if the game has a complex setup that benefits from the player seeing a countdown.

```css
#countdown-overlay {
  position: fixed; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(10, 10, 26, 0.92);
  z-index: 150;
  opacity: 0; pointer-events: none;
  transition: opacity 0.2s;
}
#countdown-overlay.visible { opacity: 1; pointer-events: all; }

#countdown-number {
  font-size: 88px; font-weight: 900; letter-spacing: -0.04em;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  /* Pulse animation — transform is GPU-composited */
  animation: countPulse 0.8s ease-out;
}

@keyframes countPulse {
  0%   { transform: scale(1.4); opacity: 0.4; }
  40%  { transform: scale(1.0); opacity: 1; }
  100% { transform: scale(1.0); opacity: 1; }
}
```

Each digit swap: update `textContent`, re-trigger animation by removing/re-adding the element (or toggle a class that applies the animation with `animation-name: none` first).

**JS countdown pattern:**

```javascript
function runCountdown(from, onComplete) {
  var $num = document.getElementById('countdown-number');
  var $overlay = document.getElementById('countdown-overlay');
  var count = from;
  $overlay.classList.add('visible');

  var tick = setInterval(function() {
    $num.textContent = count;
    // Re-trigger animation
    $num.style.animationName = 'none';
    $num.offsetHeight; // reflow
    $num.style.animationName = '';
    count--;
    if (count < 1) {
      clearInterval(tick);
      setTimeout(function() {
        $overlay.classList.remove('visible');
        if (onComplete) onComplete();
      }, 900);
    }
  }, 1000);
}
```

---

### 5.6 Submitted/Confirmed Banner (Layout A inline state)

After a player taps an option in Layout A, before the result banner appears, show a small confirmation strip. This replaces the submitted banner in existing games.

```css
#submitted-strip {
  display: none; /* shown via .visible */
  background: rgba(16,185,129,0.12);
  border: 1px solid var(--success);
  border-radius: 10px;
  padding: 10px 16px;
  text-align: center;
  font-size: 13px; font-weight: 600;
  color: var(--success);
  flex-shrink: 0;
}
#submitted-strip.visible { display: block; }
```

Content: `"Answer locked in ✓"` — not just "Answer submitted ✓". The phrasing should feel like confirmation, not a system log.

---

## 6. Animation Standards

### Easing Curves

```css
/* Fast interactions — tap feedback, state switches */
--ease-snap:    cubic-bezier(0.25, 0.46, 0.45, 0.94);  /* ~0.1s */

/* UI element entry — cards sliding in, banners appearing */
--ease-out:     cubic-bezier(0.22, 1, 0.36, 1);         /* ~0.25–0.35s */

/* Feedback bounce — "correct" icon pop */
--ease-spring:  cubic-bezier(0.34, 1.56, 0.64, 1);      /* ~0.3–0.4s, slight overshoot */

/* Gentle fade — overlays, dimming */
--ease-linear:  linear;                                  /* timer bar, opacity fades */
```

Since CSS custom properties don't work inside `cubic-bezier()` references in all WebViews, write the values inline in each rule rather than via var().

### Duration Budget

| Category | Duration | What uses it |
|---|---|---|
| Micro | 80–120ms | Button scale on tap (`:active` / JS-triggered) |
| Fast | 150–200ms | State color transitions, border changes |
| Medium | 250–350ms | Banner entry (opacity), card pop (scale+opacity) |
| Slow | 400–600ms | Result overlay fade-in, wrong-flash decay |
| Very slow | 700ms+ | Spinner rotation — the only continuous animation allowed |

Never animate more than 3 elements simultaneously. Never use `transition: all` — it catches expensive properties like `width`, `height`, and `padding`.

### Tap Feedback (buttons)

The only tap animation on clickable elements. Apply via `:active` for CSS or via a short JS class toggle.

```css
.tappable:active { transform: scale(0.96); }
/* transition on parent — applied globally */
.tappable { transition: transform 0.1s cubic-bezier(0.25, 0.46, 0.45, 0.94); }
```

For immediate game actions (knife-throw, fruit-cut): go to `scale(0.93)` for a stronger feel.

### Screen Shake (wrong answer, miss, game fail)

Use CSS keyframe on `#root` or the relevant container. Apply via a JS class toggle, remove after animation ends.

```css
@keyframes shake {
  0%   { transform: translateX(0); }
  15%  { transform: translateX(-6px); }
  30%  { transform: translateX(5px); }
  45%  { transform: translateX(-4px); }
  60%  { transform: translateX(3px); }
  75%  { transform: translateX(-2px); }
  100% { transform: translateX(0); }
}

.shaking { animation: shake 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94); }
```

```javascript
function triggerShake(el) {
  el.classList.remove('shaking');
  el.offsetHeight; // reflow to restart
  el.classList.add('shaking');
  setTimeout(function() { el.classList.remove('shaking'); }, 360);
}
```

Apply shake to: the interactive panel border/wrapper (spot-difference wrong tap), the game canvas wrapper (miss in skill games), never to `body` or `#root` directly (causes scroll/repaint issues).

### Particle Effects (canvas only)

Implement particles entirely on the overlay canvas. Never use DOM elements for particles. Keep the total particle count under 40 at any instant.

**Correct-answer particle burst pattern:**

```javascript
var particles = [];

function spawnCorrectBurst(cx, cy) {
  var colors = ['#10B981', '#A855F7', '#FFFFFF', '#F59E0B'];
  for (var i = 0; i < 20; i++) {
    var angle = (Math.PI * 2 * i) / 20;
    var speed = 2 + Math.random() * 3;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      alpha: 1,
      size: 3 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      born: performance.now()
    });
  }
}

function updateParticles(ctx, now) {
  particles = particles.filter(function(p) {
    var age = now - p.born;
    if (age > 600) return false;
    p.x  += p.vx;
    p.y  += p.vy;
    p.vy += 0.15; // gravity
    p.alpha = 1 - (age / 600);
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    return true;
  });
  ctx.globalAlpha = 1;
}
```

### Entry / Exit Transitions

**Game entering (after loading):** Fade in `#root` from `opacity: 0` to `opacity: 1` over 200ms. Do not slide in — vertical slides fight the mobile OS chrome.

**Result banner entering:** Fade in the overlay (`opacity: 0 → 1`) over 250ms. The icon inside can do a scale spring: `transform: scale(0.7) → scale(1)` with `cubic-bezier(0.34, 1.56, 0.64, 1)` over 300ms.

**Result banner exiting:** The native shell hides the WebView — you don't need to animate out.

---

## 7. Sound Design Direction

(Implementation in future — design direction established now so all games are consistent when audio is added.)

### Vibe: Playful Arcade, Never Harsh

Reference: Dream11 pregame audio, Ludo King tap sounds, KBC "lock kiya jaye" energy but faster/lighter. The audience is casual mobile gamers in India — they know arcade sounds, they like satisfying taps, and they hate jarring alerts.

### Key Sound Moments

| Moment | Character | Duration |
|---|---|---|
| Option tap (neutral) | Soft "tok" — like a plastic tile click | 50–80ms |
| Answer locked (selected) | Slightly deeper "thunk" — confirms commitment | 80–100ms |
| Correct answer | Ascending 3-note chime ("ding-ding-dong") + light particle whoosh | 400–600ms |
| Wrong answer | Single low descending tone ("bwong") — not a buzzer, not harsh | 200–300ms |
| Timer urgent (≤5s) | Soft periodic tick, every 1s — not beeping, just a metronomic tap | 80ms each |
| Time's up | Single midrange gong-like fade — resolves downward | 600ms |
| Round countdown (3-2-1) | Three identical ticks with final slightly louder on "GO" | 80ms each |
| Coin earned | Rising two-tone jingle ("ding-dong") — warm and light | 300ms |
| Streak achieved | Fast ascending triplet + sustained ring | 400ms |
| Perfect hit (skill game) | Sharp "crack" + ascending whoosh | 200ms |
| Miss (skill game) | Soft "swish" — air without impact | 150ms |

### Implementation notes (for when audio arrives)

- All sounds should be short WAV or MP3, base64-encoded inline in the HTML (adds to the 150KB budget — plan accordingly, target 20–40 KB for the full sound set)
- Use the Web Audio API, not `<audio>` elements — lower latency on Android WebView
- Preload all sounds on `GAME_INIT`, not on first tap
- Respect OS silent mode — do not auto-play audio, only play on direct user interaction (the tap itself)
- Never loop any sound except background ambience (and do not implement background ambience for micro-games)

---

## 8. Spacing and Sizing

### Spacing Scale

Use this scale for all padding, margin, and gap values. Not Tailwind — just these raw values.

```
2px   — micro gap (badge internals, icon-to-text spacing)
4px   — tight gap (label-to-content within a component)
6px   — inner panel gap, canvas-wrap label gap
8px   — component gap within a zone (hud gap, panel gap)
10px  — grid gap (options grid), standard component spacing
12px  — container padding (spot-difference style)
14px  — container horizontal padding (trivia style)
16px  — card internal padding (standard)
18px  — card internal padding (generous, for question cards)
20px  — card internal padding (large question cards)
24px  — section separation, banner internal gap
32px  — major zone separation
```

Do not invent intermediate values. Pick the nearest value from the scale. Consistency is more important than pixel-perfect alignment.

### Border Radius Scale

```
4px  — badges, micro pills
10px — small banners, instruction strips
12px — canvas wraps, panels
14px — option buttons
16px — prompt cards, major cards
50%  — circular elements (result icon, badge indicators)
```

### Touch Target Minimum

**Absolute minimum: 44×44px** (Apple HIG). **Target: 48×48px** (Material Design, better for Indian market with budget touchscreens that have lower touch sensitivity).

For the option grid: each button fills its grid cell via `flex: 1`. With `gap: 10px` and `padding: 12px 14px`, the minimum button height on a 360px-wide screen is approximately 85px — well above minimum. Do not reduce padding to fit more content; reduce content instead.

For canvas tap targets: minimum hit-zone radius 24px in screen-pixel space. Map from normalized image coordinates to pixel space before testing — a zone that looks big in a small image may be tiny on screen.

### Scaling Across Screen Widths (320px to 430px)

Do not use media queries for game layout. Use the flex system as defined — it is inherently adaptive. The only values that need clamping are font sizes and canvas-derived hit zones.

```css
/* Clamp font sizes for very small screens (320px wide) */
#prompt-text { font-size: clamp(15px, 4.5vw, 19px); }
#expression-text { font-size: clamp(24px, 7vw, 32px); }
#countdown-number { font-size: clamp(72px, 20vw, 96px); }
```

For everything else: the flex layout handles it. Test at `360×800` (reference device) and `320×568` (minimum supported).

---

## 9. Game-Specific Theming

### Can individual games have their own accent color?

Yes, with strict constraints.

**The override:** Replace `--accent` in the game's `:root` block. This changes: the timer bar gradient start, prompt card label color, active border color on the interactive panel, the spinner border-top color.

**What does NOT change:** The option color identities (A=violet, B=blue, C=amber, D=red), semantic colors (success/danger/warning), background layers, text colors.

**Allowed accent overrides:**

```css
/* Math / Logic games */
--accent: #0EA5E9;    /* Sky blue — cold, precise */
--accent-soft: rgba(14, 165, 233, 0.15);
--accent-glow: rgba(14, 165, 233, 0.25);

/* Action / Skill games */
--accent: #F59E0B;    /* Gold/amber — energy, speed */
--accent-soft: rgba(245, 158, 11, 0.15);
--accent-glow: rgba(245, 158, 11, 0.25);

/* Wordplay / Language games */
--accent: #10B981;    /* Green — knowledge, language */
--accent-soft: rgba(16, 185, 129, 0.15);
--accent-glow: rgba(16, 185, 129, 0.25);

/* Default (trivia, quiz, all others) */
--accent: #7C3AED;    /* Violet — the Euphoria brand default */
--accent-soft: rgba(124, 58, 237, 0.15);
--accent-glow: rgba(124, 58, 237, 0.25);
```

Do not create new accent colors outside this approved list. A new game picks from these four or uses the default violet.

### Game-Specific Flair Within the System

These are allowed decorations that add personality without breaking system coherence:

1. **Themed panel label icons:** "SOLVE" can become "= ?" for quick-math, "FIND" for spot-difference. The typography spec stays the same (10px/700/uppercase/letter-spacing).

2. **Canvas content:** The imagery, particles, shapes on canvas are fully game-specific. The canvas wrapper follows the system; what's drawn inside is yours.

3. **Result icon:** The circular icon can contain an emoji or text glyph instead of ✓/✗. The circle dimensions and border style remain fixed.

4. **Submitted banner copy:** Game-specific wording ("Tap locked in!", "Spotted!", "Knife thrown!") is fine. The component style (green, border, 13px/600) stays fixed.

5. **Instruction bar copy:** Fully game-specific. Component style is fixed.

**Not allowed as game-specific flair:**
- Different background colors or gradients for `--bg`, `--card`, `--border`
- Different timer bar heights or positions
- Custom fonts or font sizes outside the type scale
- Removing the timer bar (it is mandatory)
- Adding UI regions not defined in the layout pattern (e.g., a sidebar, a bottom nav)

---

## 10. Performance Budget

### DOM Element Budget

| Game layout | Max DOM elements | Notes |
|---|---|---|
| Layout A (Options) | ≤ 40 elements | Timer (3), prompt card (3), 4 options × 3 elements each, submitted banner, result banner (4). Total well under budget. |
| Layout B (Fullscreen) | ≤ 25 elements + canvas | 2 canvases + 1 overlay canvas. Visual feedback is on canvas, not DOM. |
| Layout C (Skill) | ≤ 20 elements + canvas | Score strip (4), canvas (1), feedback strip (1), result banner (4). |

**Do not create DOM elements during gameplay.** All elements should exist in the initial HTML, hidden until needed (`display: none` or `opacity: 0 / pointer-events: none`). The one exception: dynamically rendering option buttons from the `GAME_INIT` payload is acceptable because it happens once before the timer starts.

### Canvas vs DOM Guidelines

Use **Canvas** when:
- You need per-frame animation (particles, tap feedback ripples, smooth motion)
- Content is image-based (spot-difference, find-items)
- You have more than 10 simultaneously animated elements
- You need pixel-level hit testing

Use **DOM** when:
- Content is text (questions, options, scores, labels)
- State changes happen at human timescales (tap → selected, answer → result)
- You need system accessibility (though note: game WebViews don't expose a11y tree to players)

**Never mix:** Do not put text in canvas and interactive controls in DOM for the same logical element. The question is always DOM. The feedback circles are always canvas.

### Animation Frame Budget (60fps = 16.67ms per frame)

On Snapdragon 665 / Helio G85, budget your frame work as follows:

| Task | Budget |
|---|---|
| Timer bar update (scaleX) | ~0.1ms — transform change on GPU-composited layer |
| Overlay canvas draw (no particles) | ~1–2ms |
| Overlay canvas draw (20 particles) | ~3–5ms |
| DOM class toggle (state change) | ~0.5–1ms |
| Layout recalculation (avoid) | ~5–15ms — do not trigger during active game |

**Never trigger layout during the rAF loop.** This means:
- No reading of `offsetWidth`, `clientHeight`, `getBoundingClientRect()` inside `tickTimer()` or the overlay draw loop (cache these values on init)
- No adding/removing elements inside the rAF loop
- No `classList.add()` that causes a layout-triggering style change (e.g., `display: block` on a flex child)

**The only rAF loops allowed to run simultaneously:**
- Timer loop (always)
- Overlay canvas draw loop (only in Layout B fullscreen interactive games)

Do not run two canvas animation loops at once.

### Memory Limits

Target: < 40MB JavaScript heap on a 3GB RAM device (Galaxy A52, Redmi Note 11).

- Images: Use `Image()` objects loaded once, never reload
- Canvas contexts: Create once in `init`, never create new canvas elements mid-game
- Event listeners: Use maximum 3 touch/click listeners per game. Remove them after `answered = true` if possible (add `{ once: true }` to submission listeners)
- Particle arrays: Filter expired particles every frame (as shown in Section 6). Never let the array grow unbounded.
- `requestAnimationFrame`: Every rAF callback must store its ID and cancel it on game end. Uncanceled rAF loops leak after the round ends and the native app hides the WebView (the WebView stays in memory, the loop keeps running).

### Size Budget Allocation

ZIP ≤ 150KB compressed. Allocate as follows:

| Component | Budget |
|---|---|
| HTML structure + CSS | 8–15 KB |
| Game JS logic | 10–20 KB |
| Inlined sprite/image assets (base64) | 0–50 KB |
| Sound assets (future) | 0–40 KB |
| Game library (LittleJS only if needed) | 0–5 KB |
| **Total (uncompressed)** | **≤ 300 KB** |

The trivia reference game is 12 KB uncompressed. Every addition beyond that must justify its size. A full-featured skill game with canvas, particles, and sprites should stay under 80 KB uncompressed.

---

## Appendix A: CSS Variable Cheat Sheet

Copy this `:root` block into every new game:

```css
:root {
  /* Layers */
  --bg:          #0D0D1A;
  --card:        #1A1A2E;
  --border:      #2A2A4A;

  /* Accent (override per game — see Section 9) */
  --accent:      #7C3AED;
  --accent-soft: rgba(124, 58, 237, 0.15);
  --accent-glow: rgba(124, 58, 237, 0.25);

  /* Text */
  --text:        #FFFFFF;
  --muted:       #9CA3AF;

  /* Semantic */
  --success:     #10B981;
  --danger:      #EF4444;
  --warning:     #F59E0B;
  --urgent:      #F97316;

  /* Option identities */
  --opt-a-border: #7C3AED; --opt-a-fill: rgba(124,58,237,0.15); --opt-a-label: #A78BFA; --opt-a-badge: rgba(124,58,237,0.20);
  --opt-b-border: #2563EB; --opt-b-fill: rgba(37,99,235,0.15);  --opt-b-label: #60A5FA; --opt-b-badge: rgba(37,99,235,0.20);
  --opt-c-border: #D97706; --opt-c-fill: rgba(217,119,6,0.15);  --opt-c-label: #FCD34D; --opt-c-badge: rgba(217,119,6,0.20);
  --opt-d-border: #DC2626; --opt-d-fill: rgba(220,38,38,0.15);  --opt-d-label: #FCA5A5; --opt-d-badge: rgba(220,38,38,0.20);
}
```

---

## Appendix B: Quick-Reference Checklist for New Games

Before writing a line of CSS or JS, answer:

1. Which layout pattern does this game use? (A / B / C) — Pick the pattern, do not invent a new one.
2. Which accent color does this game use? (violet / sky-blue / gold / green)
3. Does this game need a loading state? (only if it fetches data after `GAME_INIT`)
4. Does this game need particles? (only if a correct/miss moment benefits from it)
5. Does this game need screen shake? (wrong/miss moments only)
6. Which result states are possible? (correct / wrong / time-up / partial / perfect / miss)

Then validate before upload:
- [ ] Timer bar present, using scaleX (not width), urgent state at ≤5s
- [ ] Result banner uses the standard component spec
- [ ] Option colors follow A=violet / B=blue / C=amber / D=red
- [ ] Touch targets ≥ 48px
- [ ] No `transition: all`, no `backdrop-filter`, no `filter`
- [ ] rAF loops all have stored IDs and are cancelled on `answered = true`
- [ ] Particles stay under 40 simultaneous
- [ ] Font sizes all ≥ 13px
- [ ] `font-variant-numeric: tabular-nums` on all numeric displays
- [ ] No external scripts, fonts, or network calls (except explicit level-fetch pattern like spot-difference)
- [ ] ZIP ≤ 150KB, uncompressed ≤ 300KB
- [ ] JS validated: `node --check /tmp/check.js`
- [ ] No optional chaining `?.`, no nullish coalescing `??`, no template literals (WebView compatibility)

---

## Appendix C: Inconsistencies in Existing Games to Fix

The three existing games were built before this design system existed. They are mostly correct but have these deviations from spec:

| Game | Deviation | Correct per this spec |
|---|---|---|
| trivia | `#timer-text` uses `margin-top: -8px` to tuck under timer bar — hacky | Use `#hud` flexrow with `gap: 8px` as defined in Section 4 Layout A |
| trivia | `#submitted-banner` text reads "Answer submitted ✓" | Should read "Answer locked in ✓" |
| trivia | No `font-variant-numeric: tabular-nums` on timer text | Add it |
| quick-math | Timer text appends "s" (e.g. "14s") | Timer text should be bare number ("14") — the unit is implied by the bar |
| quick-math | `#timer-bar` has no `transition: background` | Add `transition: background 0.3s` for urgent state transition |
| spot-difference | `#banner-title` font-size: 22px, matches spec | |
| spot-difference | `#banner-icon` uses ✓/✗ as text — no emoji | Correct per spec |
| spot-difference | Result banner `#banner-sub` for time-up reads "The difference has been revealed" | Should read "The difference has been revealed" — this is fine, keep as-is |
| All games | No pre-game countdown implemented | Optional — do not add retroactively, only in new games that need it |
| All games | No correct/wrong reveal after answer (just "submitted") | This is intentional — the server drives reveal via the show orchestrator |
