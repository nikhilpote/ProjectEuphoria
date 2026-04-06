/**
 * Match 3 – Gem Blitz
 * PixiJS 7.x  |  No external tween library  |  No sounds
 */

'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CANVAS_W      = window.innerWidth;
const CANVAS_H      = window.innerHeight;
const COLS          = 8;
const ROWS          = 8;
const GEM_SIZE      = Math.floor((CANVAS_W - 40) / COLS - 4); // fit screen width with padding
const GEM_GAP       = 4;           // gap between cells
const CELL          = GEM_SIZE + GEM_GAP;
const GEM_TYPES     = 8;           // gem_2.png … gem_9.png
const GEM_OFFSET    = 2;           // first file index

const GRID_W        = COLS * CELL - GEM_GAP;
const GRID_H        = ROWS * CELL - GEM_GAP;
const GRID_X        = Math.floor((CANVAS_W - GRID_W) / 2);
const GRID_Y        = Math.max(50, Math.floor((CANVAS_H - GRID_H) / 2 - 20));

const DUR_SWAP      = 0.18;        // seconds
const DUR_SHRINK    = 0.16;        // removal scale-down
const DUR_DROP      = 0.26;        // fall duration base
const SCORE_STEP    = 500;         // score needed per level
const MOVES_START   = 30;

// ---------------------------------------------------------------------------
// PixiJS App
// ---------------------------------------------------------------------------
const app = new PIXI.Application({
  width:           CANVAS_W,
  height:          CANVAS_H,
  backgroundColor: 0x080812,
  antialias:       true,
  resolution:      window.devicePixelRatio || 1,
  autoDensity:     true,
});
document.body.appendChild(app.view);

function fitCanvas() {
  Object.assign(app.view.style, {
    width:    '100%',
    height:   '100%',
    position: 'absolute',
    left:     '0px',
    top:      '0px',
  });
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

// ---------------------------------------------------------------------------
// Scene layers
// ---------------------------------------------------------------------------
const lyrBG   = new PIXI.Container();   // static background
const lyrGrid = new PIXI.Container();   // gems
const lyrFX   = new PIXI.Container();   // HUD + popups + overlays
app.stage.addChild(lyrBG, lyrGrid, lyrFX);

// ---------------------------------------------------------------------------
// Tween engine
// ---------------------------------------------------------------------------
// tween record: { obj, prop, from, to, dur, elapsed, ease, resolve }
const _tweens = [];

function easeCubicOut(t) { return 1 - (1 - t) ** 3; }
function easeCubicIn(t)  { return t * t * t; }
function easeBounceOut(t) {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1)       return n1 * t * t;
  if (t < 2 / d1)       return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1)     return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

function tween(obj, prop, to, dur, ease) {
  return new Promise(resolve => {
    _tweens.push({ obj, prop, from: obj[prop], to, dur, elapsed: 0, ease: ease || easeCubicOut, resolve });
  });
}

function tickTweens(dt) {
  for (let i = _tweens.length - 1; i >= 0; i--) {
    const tw = _tweens[i];
    tw.elapsed += dt;
    const t = Math.min(tw.elapsed / tw.dur, 1);
    tw.obj[tw.prop] = tw.from + (tw.to - tw.from) * tw.ease(t);
    if (t >= 1) {
      tw.obj[tw.prop] = tw.to;
      _tweens.splice(i, 1);
      tw.resolve();
    }
  }
}

// Run many tweens concurrently, resolve when all done.
// Handles empty list gracefully.
function parallel(...promises) {
  const flat = promises.flat();
  return flat.length > 0 ? Promise.all(flat) : Promise.resolve();
}

// Delay (seconds). A delay of 0 resolves immediately (no ticker overhead).
function wait(sec) {
  if (sec <= 0) return Promise.resolve();
  return new Promise(resolve => {
    let elapsed = 0;
    const tick  = (deltaFrames) => {
      elapsed += deltaFrames / 60;
      if (elapsed >= sec) { app.ticker.remove(tick); resolve(); }
    };
    app.ticker.add(tick);
  });
}

app.ticker.add((delta) => tickTweens(delta / 60));

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
let textures   = [];              // textures[0..7]
let board      = [];              // board[r][c] = 0-7 gem type, or -1
let sprites    = [];              // sprites[r][c] = PIXI.Container | null
let score      = 0;
let level      = 1;
let movesLeft  = MOVES_START;
let target     = SCORE_STEP;
let combo      = 0;
let busy       = false;           // blocks input while animating
let selected   = null;            // { r, c } | null
let overlay    = null;            // active overlay container

// HUD references
let txtScore, txtLevel, txtMoves, txtTarget;

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------
function cellXY(r, c) {
  return {
    x: GRID_X + c * CELL + GEM_SIZE / 2,
    y: GRID_Y + r * CELL + GEM_SIZE / 2,
  };
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------
function buildBG() {
  const g = new PIXI.Graphics();

  // Base fill
  g.beginFill(0x080812); g.drawRect(0, 0, CANVAS_W, CANVAS_H); g.endFill();

  // Subtle center glow
  for (let i = 3; i >= 0; i--) {
    g.beginFill(0x1122aa, 0.015 + i * 0.008);
    g.drawCircle(CANVAS_W / 2, CANVAS_H / 2, 250 + i * 160);
    g.endFill();
  }
  lyrBG.addChild(g);

  // Board panel
  const pad = 16;
  const p   = new PIXI.Graphics();
  p.lineStyle(2, 0x22245a, 1);
  p.beginFill(0x0b0b20, 0.92);
  p.drawRoundedRect(GRID_X - pad, GRID_Y - pad, GRID_W + pad * 2, GRID_H + pad * 2, 14);
  p.endFill();
  lyrBG.addChild(p);

  // Subtle cell shading alternation
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if ((r + c) % 2 === 0) {
        const cell = new PIXI.Graphics();
        cell.beginFill(0xffffff, 0.015);
        cell.drawRect(GRID_X + c * CELL, GRID_Y + r * CELL, GEM_SIZE, GEM_SIZE);
        cell.endFill();
        lyrBG.addChild(cell);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function buildHUD() {
  // Bar background
  const bar = new PIXI.Graphics();
  bar.beginFill(0x04040f, 0.95);
  bar.drawRect(0, 0, CANVAS_W, 98);
  bar.endFill();
  bar.lineStyle(1, 0x1e1e44);
  bar.moveTo(0, 98); bar.lineTo(CANVAS_W, 98);
  lyrFX.addChild(bar);

  // Game title
  const title = new PIXI.Text('GEM BLITZ', new PIXI.TextStyle({
    fontFamily: '"Arial Black", sans-serif',
    fontSize: 30, fontWeight: '900',
    fill: ['#ffd060', '#ff7722'],
    fillGradientType: 0,
    stroke: '#2a1000', strokeThickness: 5,
    dropShadow: true, dropShadowColor: '#ff6600',
    dropShadowBlur: 8, dropShadowDistance: 2,
  }));
  title.anchor.set(0.5, 0.5);
  title.position.set(CANVAS_W / 2, 49);
  lyrFX.addChild(title);

  const lblStyle = new PIXI.TextStyle({
    fontFamily: 'Arial, sans-serif', fontSize: 12,
    fill: 0x5566aa, letterSpacing: 2,
  });
  const valStyle = new PIXI.TextStyle({
    fontFamily: '"Arial Black", sans-serif', fontSize: 34, fontWeight: '900',
    fill: ['#ffffff', '#99bbff'],
    fillGradientType: 1,
    dropShadow: true, dropShadowColor: '#000040', dropShadowDistance: 2,
  });

  var movesY = GRID_Y + GRID_H + 15;

  function addHudGroup(label, x, y) {
    var ly = y || 12;
    const lbl = new PIXI.Text(label, lblStyle);
    lbl.anchor.set(0.5, 0);
    lbl.position.set(x, ly);
    lyrFX.addChild(lbl);

    const val = new PIXI.Text('0', valStyle.clone());
    val.anchor.set(0.5, 0);
    val.position.set(x, ly + 18);
    lyrFX.addChild(val);
    return val;
  }

  txtScore  = addHudGroup('',  -100);
  txtLevel  = addHudGroup('',  -100);
  txtTarget = addHudGroup('',  -100);
  txtMoves  = addHudGroup('MOVES LEFT', CANVAS_W / 2, movesY);
}

function refreshHUD() {
  txtScore.text  = String(score);
  txtLevel.text  = String(level);
  txtMoves.text  = String(movesLeft);
  txtTarget.text = String(target);
  txtMoves.style.fill = movesLeft <= 5 ? ['#ff5533', '#ff1100'] : ['#ffffff', '#99bbff'];
}

// ---------------------------------------------------------------------------
// Gem sprites
// ---------------------------------------------------------------------------
function makeGemSprite(type) {
  const c = new PIXI.Container();
  c._type = type;

  // Drop shadow
  const shadow = new PIXI.Graphics();
  shadow.beginFill(0x000000, 0.35);
  shadow.drawEllipse(GEM_SIZE / 2, GEM_SIZE - 5, GEM_SIZE * 0.38, 7);
  shadow.endFill();
  c.addChild(shadow);

  // Main sprite
  const sp = new PIXI.Sprite(textures[type]);
  sp.width  = GEM_SIZE;
  sp.height = GEM_SIZE;
  c.addChild(sp);

  // Selection ring (hidden by default)
  const ring = new PIXI.Graphics();
  ring.lineStyle(4, 0xffffff, 1);
  ring.drawRoundedRect(3, 3, GEM_SIZE - 6, GEM_SIZE - 6, 10);
  ring.visible = false;
  ring.name    = 'ring';
  c.addChild(ring);

  // Selection inner glow (hidden by default)
  const glow = new PIXI.Graphics();
  glow.beginFill(0xffffff, 0.22);
  glow.drawRoundedRect(3, 3, GEM_SIZE - 6, GEM_SIZE - 6, 10);
  glow.endFill();
  glow.visible = false;
  glow.name    = 'glow';
  c.addChild(glow);

  // Pivot at visual center
  c.pivot.set(GEM_SIZE / 2, GEM_SIZE / 2);
  return c;
}

function setSelected(r, c, on) {
  const sp = sprites[r][c];
  if (!sp) return;
  sp.getChildByName('ring').visible = on;
  sp.getChildByName('glow').visible = on;
}

function bindClick(sp, r, c) {
  sp.eventMode = 'static';
  sp.cursor    = 'pointer';
  sp.hitArea   = new PIXI.Rectangle(0, 0, GEM_SIZE, GEM_SIZE);
  sp.removeAllListeners();
  sp.on('pointerdown', (e) => handlePointerDown(r, c, e));
  sp.on('pointerup',   (e) => handlePointerUp(r, c, e));
  sp.on('pointerupoutside', (e) => handlePointerUp(r, c, e));
}

// ---------------------------------------------------------------------------
// Board initialisation — no initial matches
// ---------------------------------------------------------------------------
function initBoard() {
  board   = Array.from({ length: ROWS }, () => new Array(COLS).fill(-1));
  sprites = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let t, tries = 0;
      do {
        t = Math.floor(Math.random() * GEM_TYPES);
        tries++;
      } while (tries < 200 && wouldMatch(r, c, t));
      board[r][c] = t;
    }
  }
}

function wouldMatch(r, c, t) {
  // Two left
  if (c >= 2 && board[r][c - 1] === t && board[r][c - 2] === t) return true;
  // Two above
  if (r >= 2 && board[r - 1][c] === t && board[r - 2][c] === t) return true;
  return false;
}

function spawnSprites() {
  lyrGrid.removeChildren();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) sprites[r][c] = null;
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const sp  = makeGemSprite(board[r][c]);
      const pos = cellXY(r, c);
      sp.position.set(pos.x, pos.y);
      sp.scale.set(1);
      sp.alpha = 1;
      sprites[r][c] = sp;
      lyrGrid.addChild(sp);
      bindClick(sp, r, c);
    }
  }
}

// ---------------------------------------------------------------------------
// Input — click-to-select + swipe/drag support
// ---------------------------------------------------------------------------
let dragStart = null;  // { r, c, x, y } while pointer is down
const SWIPE_THRESHOLD = 20; // pixels to register a swipe direction

function handlePointerDown(r, c, event) {
  if (busy || overlay) return;
  const pos = event.data ? event.data.global : event.global;
  dragStart = { r, c, x: pos.x, y: pos.y };
}

function handlePointerUp(r, c, event) {
  if (busy || overlay || !dragStart) return;
  const pos = event.data ? event.data.global : event.global;
  const dx = pos.x - dragStart.x;
  const dy = pos.y - dragStart.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const startR = dragStart.r;
  const startC = dragStart.c;
  dragStart = null;

  if (dist >= SWIPE_THRESHOLD) {
    // Swipe detected — determine direction
    let tr, tc;
    if (Math.abs(dx) > Math.abs(dy)) {
      tr = startR;
      tc = startC + (dx > 0 ? 1 : -1);
    } else {
      tr = startR + (dy > 0 ? 1 : -1);
      tc = startC;
    }
    // Validate target is on the board
    if (tr >= 0 && tr < ROWS && tc >= 0 && tc < COLS) {
      clearSel();
      doSwap(startR, startC, tr, tc);
    }
  } else {
    // Tap — use click-to-select logic
    handleClick(startR, startC);
  }
}

function handleClick(r, c) {
  if (busy || overlay) return;

  if (!selected) {
    selected = { r, c };
    setSelected(r, c, true);
    return;
  }

  if (selected.r === r && selected.c === c) {
    setSelected(r, c, false);
    selected = null;
    return;
  }

  const { r: sr, c: sc } = selected;
  const adjacent = (Math.abs(sr - r) + Math.abs(sc - c)) === 1;

  setSelected(sr, sc, false);
  selected = null;

  if (adjacent) {
    doSwap(sr, sc, r, c);
  } else {
    selected = { r, c };
    setSelected(r, c, true);
  }
}

// ---------------------------------------------------------------------------
// Swap
// ---------------------------------------------------------------------------
async function doSwap(r1, c1, r2, c2) {
  busy = true;

  applyBoardSwap(r1, c1, r2, c2);
  await animSwap(r1, c1, r2, c2);

  const matches = findMatches();
  if (matches.length > 0) {
    movesLeft--;
    refreshHUD();
    combo = 0;
    await resolveMatches(matches);
    if (!overlay) checkLevelUp();
    if (!overlay) checkGameOver();
  } else {
    // Undo — swap back
    applyBoardSwap(r1, c1, r2, c2);
    await animSwap(r1, c1, r2, c2);
  }

  busy = false;
}

function applyBoardSwap(r1, c1, r2, c2) {
  [board[r1][c1], board[r2][c2]]   = [board[r2][c2], board[r1][c1]];
  [sprites[r1][c1], sprites[r2][c2]] = [sprites[r2][c2], sprites[r1][c1]];
  if (sprites[r1][c1]) bindClick(sprites[r1][c1], r1, c1);
  if (sprites[r2][c2]) bindClick(sprites[r2][c2], r2, c2);
}

function animSwap(r1, c1, r2, c2) {
  const pos1 = cellXY(r1, c1);
  const pos2 = cellXY(r2, c2);
  const s1   = sprites[r1][c1];
  const s2   = sprites[r2][c2];
  if (!s1 || !s2) return Promise.resolve();

  return parallel(
    tween(s1, 'x', pos1.x, DUR_SWAP),
    tween(s1, 'y', pos1.y, DUR_SWAP),
    tween(s2, 'x', pos2.x, DUR_SWAP),
    tween(s2, 'y', pos2.y, DUR_SWAP),
  );
}

// ---------------------------------------------------------------------------
// Match finding
// ---------------------------------------------------------------------------
function findMatches() {
  const matched = new Set();

  // Horizontal runs
  for (let r = 0; r < ROWS; r++) {
    let run = 1;
    for (let c = 1; c <= COLS; c++) {
      const same = c < COLS && board[r][c] !== -1 && board[r][c] === board[r][c - 1];
      if (same) {
        run++;
      } else {
        if (run >= 3) for (let k = c - run; k < c; k++) matched.add(r * COLS + k);
        run = 1;
      }
    }
  }

  // Vertical runs
  for (let c = 0; c < COLS; c++) {
    let run = 1;
    for (let r = 1; r <= ROWS; r++) {
      const same = r < ROWS && board[r][c] !== -1 && board[r][c] === board[r - 1][c];
      if (same) {
        run++;
      } else {
        if (run >= 3) for (let k = r - run; k < r; k++) matched.add(k * COLS + c);
        run = 1;
      }
    }
  }

  return [...matched].map(idx => ({ r: Math.floor(idx / COLS), c: idx % COLS }));
}

// ---------------------------------------------------------------------------
// Match resolution cascade
// ---------------------------------------------------------------------------
async function resolveMatches(matches) {
  combo++;
  const multiplier = combo;
  const pts        = matches.length * 10 * multiplier;
  score           += pts;
  window._gemBlitzScore = score;
  refreshHUD();

  // Score popup near match centroid
  const cx = matches.reduce((s, m) => s + cellXY(m.r, m.c).x, 0) / matches.length;
  const cy = matches.reduce((s, m) => s + cellXY(m.r, m.c).y, 0) / matches.length;
  spawnScorePopup(pts, cx, cy);

  if (combo > 1) spawnComboText(combo);

  // Animate removal (scale + fade)
  await animRemove(matches);

  // Clear board entries and destroy sprites
  matches.forEach(({ r, c }) => {
    board[r][c] = -1;
    const sp    = sprites[r][c];
    if (sp) { lyrGrid.removeChild(sp); sp.destroy({ children: true }); }
    sprites[r][c] = null;
  });

  // Drop gems and fill
  await animDrop();
  await animFill();

  // Cascade
  const next = findMatches();
  if (next.length > 0) {
    await resolveMatches(next);
  } else {
    combo = 0;
  }
}

// ---------------------------------------------------------------------------
// Remove animation
// ---------------------------------------------------------------------------
function animRemove(matches) {
  return parallel(...matches.flatMap(({ r, c }) => {
    const sp = sprites[r][c];
    if (!sp) return [];
    return [
      tween(sp.scale, 'x', 0, DUR_SHRINK, easeCubicIn),
      tween(sp.scale, 'y', 0, DUR_SHRINK, easeCubicIn),
      tween(sp, 'alpha', 0, DUR_SHRINK, easeCubicIn),
    ];
  }));
}

// ---------------------------------------------------------------------------
// Drop gems (gravity)
// ---------------------------------------------------------------------------
function animDrop() {
  const promises = [];

  for (let c = 0; c < COLS; c++) {
    let writeRow = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c] !== -1) {
        if (r !== writeRow) {
          board[writeRow][c]   = board[r][c];
          board[r][c]          = -1;
          sprites[writeRow][c] = sprites[r][c];
          sprites[r][c]        = null;
          bindClick(sprites[writeRow][c], writeRow, c);

          const sp  = sprites[writeRow][c];
          const pos = cellXY(writeRow, c);
          const dur = DUR_DROP + (writeRow - r) * 0.03;
          promises.push(tween(sp, 'y', pos.y, dur, easeBounceOut));
        }
        writeRow--;
      }
    }
  }

  return parallel(promises);
}

// ---------------------------------------------------------------------------
// Fill new gems from above
// ---------------------------------------------------------------------------
function animFill() {
  const promises = [];

  for (let c = 0; c < COLS; c++) {
    let newCount = 0;
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c] === -1) {
        const type    = Math.floor(Math.random() * GEM_TYPES);
        board[r][c]   = type;

        const pos     = cellXY(r, c);
        const startY  = GRID_Y - (newCount + 1) * CELL - GEM_SIZE / 2;
        const stagger = newCount * 0.05;
        const dur     = DUR_DROP + 0.06 + newCount * 0.03;

        const sp      = makeGemSprite(type);
        sp.position.set(pos.x, startY);
        sp.scale.set(1);
        sp.alpha = 1;
        sprites[r][c] = sp;
        lyrGrid.addChild(sp);
        bindClick(sp, r, c);

        // Staggered drop via a small delay then tween
        promises.push(
          wait(stagger).then(() => tween(sp, 'y', pos.y, dur, easeBounceOut))
        );

        newCount++;
      }
    }
  }

  return parallel(promises);
}

// ---------------------------------------------------------------------------
// Score popup
// ---------------------------------------------------------------------------
function spawnScorePopup(pts, wx, wy) {
  const t = new PIXI.Text('+' + pts, new PIXI.TextStyle({
    fontFamily: 'Arial, sans-serif', fontSize: 28, fontWeight: 'bold',
    fill: ['#ffff88', '#ffbb00'],
    stroke: '#443300', strokeThickness: 4,
    dropShadow: true, dropShadowColor: '#000000', dropShadowDistance: 2,
  }));
  t.anchor.set(0.5, 0.5);
  t.position.set(wx, wy);
  t.alpha = 1;
  lyrFX.addChild(t);

  let e = 0;
  const dur = 0.95;
  const sy  = wy;
  const ey  = wy - 65;

  const tick = (df) => {
    e += df / 60;
    const p = Math.min(e / dur, 1);
    t.y     = sy + (ey - sy) * easeCubicOut(p);
    t.alpha = p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45;
    if (p >= 1) {
      app.ticker.remove(tick);
      lyrFX.removeChild(t);
      t.destroy();
    }
  };
  app.ticker.add(tick);
}

// ---------------------------------------------------------------------------
// Combo text
// ---------------------------------------------------------------------------
function spawnComboText(n) {
  const t = new PIXI.Text(`COMBO ×${n}!`, new PIXI.TextStyle({
    fontFamily: '"Arial Black", sans-serif',
    fontSize: 50, fontWeight: '900',
    fill: ['#ffff00', '#ff8800'],
    stroke: '#440000', strokeThickness: 6,
    dropShadow: true, dropShadowColor: '#ff4400',
    dropShadowBlur: 14, dropShadowDistance: 3,
  }));
  t.anchor.set(0.5, 0.5);
  t.position.set(CANVAS_W / 2, GRID_Y + GRID_H / 2);
  t.alpha = 0;
  t.scale.set(0.4);
  lyrFX.addChild(t);

  let e = 0;
  const dur = 1.3;
  const tick = (df) => {
    e += df / 60;
    const p = Math.min(e / dur, 1);
    if (p < 0.25) {
      const q = p / 0.25;
      t.scale.set(0.4 + 0.85 * easeCubicOut(q));
      t.alpha = easeCubicOut(q);
    } else if (p < 0.65) {
      t.scale.set(1.25 - 0.25 * easeCubicOut((p - 0.25) / 0.4));
      t.alpha = 1;
    } else {
      t.alpha = 1 - (p - 0.65) / 0.35;
      t.scale.set(1);
    }
    if (p >= 1) {
      app.ticker.remove(tick);
      lyrFX.removeChild(t);
      t.destroy();
    }
  };
  app.ticker.add(tick);
}

// ---------------------------------------------------------------------------
// Level complete
// ---------------------------------------------------------------------------
function checkLevelUp() {
  if (score >= target) showLevelOverlay();
}

function showLevelOverlay() {
  busy = true;
  clearSel();

  overlay = new PIXI.Container();

  const dim = new PIXI.Graphics();
  dim.beginFill(0x000000, 0.72);
  dim.drawRect(0, 0, CANVAS_W, CANVAS_H);
  dim.endFill();
  overlay.addChild(dim);

  var pw = Math.min(CANVAS_W - 40, 360);
  var ph = 200;
  const panel = new PIXI.Graphics();
  panel.beginFill(0x0e1f40, 0.97);
  panel.lineStyle(2, 0x3366cc);
  panel.drawRoundedRect(CANVAS_W / 2 - pw / 2, CANVAS_H / 2 - ph / 2, pw, ph, 16);
  panel.endFill();
  overlay.addChild(panel);

  addOverlayText(overlay, 'LEVEL COMPLETE!', CANVAS_W / 2, CANVAS_H / 2 - 55, {
    fontFamily: 'Arial, sans-serif', fontSize: 24, fontWeight: '900',
    fill: ['#fff799', '#ffaa22'],
    stroke: '#442200', strokeThickness: 3,
  });

  addOverlayText(overlay, 'Score: ' + score + '  •  Next: Lv ' + (level + 1), CANVAS_W / 2, CANVAS_H / 2 - 5, {
    fontFamily: 'Arial, sans-serif', fontSize: 16, fill: 0x88aadd,
  });

  const btn = makeButton('CONTINUE', () => advanceLevel());
  btn.position.set(CANVAS_W / 2, CANVAS_H / 2 + 55);
  overlay.addChild(btn);

  overlay.alpha = 0;
  overlay.scale.set(0.82);
  lyrFX.addChild(overlay);

  parallel(
    tween(overlay, 'alpha', 1, 0.28),
    tween(overlay.scale, 'x', 1, 0.28),
    tween(overlay.scale, 'y', 1, 0.28),
  );
}

function advanceLevel() {
  level++;
  target    += SCORE_STEP;
  movesLeft  = MOVES_START;
  combo      = 0;
  dismissOverlay();
  resetBoard();
  refreshHUD();
}

// ---------------------------------------------------------------------------
// Game over
// ---------------------------------------------------------------------------
function checkGameOver() {
  if (movesLeft <= 0) showGameOverOverlay();
}

function showGameOverOverlay() {
  busy = true;
  clearSel();

  overlay = new PIXI.Container();

  const dim = new PIXI.Graphics();
  dim.beginFill(0x000000, 0.78);
  dim.drawRect(0, 0, CANVAS_W, CANVAS_H);
  dim.endFill();
  overlay.addChild(dim);

  var pw2 = Math.min(CANVAS_W - 40, 360);
  var ph2 = 220;
  const panel = new PIXI.Graphics();
  panel.beginFill(0x220010, 0.97);
  panel.lineStyle(2, 0xff2255);
  panel.drawRoundedRect(CANVAS_W / 2 - pw2 / 2, CANVAS_H / 2 - ph2 / 2, pw2, ph2, 16);
  panel.endFill();
  overlay.addChild(panel);

  addOverlayText(overlay, 'NO MOVES LEFT', CANVAS_W / 2, CANVAS_H / 2 - 65, {
    fontFamily: 'Arial, sans-serif', fontSize: 22, fontWeight: '900',
    fill: ['#ff8888', '#ff1133'],
    stroke: '#330010', strokeThickness: 3,
  });

  addOverlayText(overlay, 'Score: ' + score, CANVAS_W / 2, CANVAS_H / 2 - 15, {
    fontFamily: 'Arial, sans-serif', fontSize: 20, fontWeight: '900',
    fill: 0xffaaaa,
  });

  addOverlayText(overlay, 'Level: ' + level, CANVAS_W / 2, CANVAS_H / 2 + 20, {
    fontFamily: 'Arial, sans-serif', fontSize: 16, fill: 0xdd8888,
  });

  addOverlayText(overlay, 'Restarting...', CANVAS_W / 2, CANVAS_H / 2 + 65, {
    fontFamily: 'Arial, sans-serif', fontSize: 14, fill: 0xdd8888,
  });
  // Auto-restart after 2 seconds
  setTimeout(function() { restartGame(); }, 2000);

  overlay.alpha = 0;
  overlay.scale.set(0.82);
  lyrFX.addChild(overlay);

  parallel(
    tween(overlay, 'alpha', 1, 0.28),
    tween(overlay.scale, 'x', 1, 0.28),
    tween(overlay.scale, 'y', 1, 0.28),
  );
}

function restartGame() {
  // Keep score across restarts for Euphoria — player accumulates
  level     = 1;
  movesLeft = MOVES_START;
  target    = score + SCORE_STEP;
  combo     = 0;
  dismissOverlay();
  resetBoard();
  refreshHUD();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function dismissOverlay() {
  if (overlay) {
    lyrFX.removeChild(overlay);
    overlay.destroy({ children: true });
    overlay = null;
  }
  busy = false;
}

function clearSel() {
  if (selected) { setSelected(selected.r, selected.c, false); selected = null; }
}

function resetBoard() {
  lyrGrid.removeChildren();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) sprites[r][c] = null;
  initBoard();
  spawnSprites();
}

function addOverlayText(container, str, x, y, styleProps) {
  const t = new PIXI.Text(str, new PIXI.TextStyle(styleProps));
  t.anchor.set(0.5, 0.5);
  t.position.set(x, y);
  container.addChild(t);
  return t;
}

function makeButton(label, onClick, color = 0x1a4499) {
  const c = new PIXI.Container();
  c.eventMode = 'static';
  c.cursor    = 'pointer';

  const bg = new PIXI.Graphics();
  bg.beginFill(color);
  bg.lineStyle(2, 0xffffff, 0.4);
  bg.drawRoundedRect(-100, -22, 200, 44, 12);
  bg.endFill();
  c.addChild(bg);

  const t = new PIXI.Text(label, new PIXI.TextStyle({
    fontFamily: 'Arial, sans-serif',
    fontSize: 18, fontWeight: '900',
    fill: 0xffffff,
    dropShadow: true, dropShadowDistance: 2,
  }));
  t.anchor.set(0.5, 0.5);
  c.addChild(t);

  c.on('pointerdown', ()  => c.scale.set(0.94));
  c.on('pointerup',   ()  => { c.scale.set(1); onClick(); });
  c.on('pointerout',  ()  => { c.scale.set(1); bg.tint = 0xffffff; });
  c.on('pointerover', ()  => (bg.tint = 0xddeeff));

  return c;
}

// ---------------------------------------------------------------------------
// Asset loading
// ---------------------------------------------------------------------------
async function loadAssets() {
  textures = [];
  for (let i = 0; i < GEM_TYPES; i++) {
    const path = `resources/images/gems/gem_${GEM_OFFSET + i}.png`;
    const tex = await PIXI.Assets.load(path);
    textures.push(tex);
    console.log(`[GemBlitz] Loaded gem_${GEM_OFFSET + i}: ${tex.width}x${tex.height}`);
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
// Global pointerup to catch swipes that end outside any gem
app.stage.eventMode = 'static';
app.stage.hitArea   = new PIXI.Rectangle(0, 0, CANVAS_W, CANVAS_H);
app.stage.on('pointerup', (event) => {
  if (!dragStart) return;
  const pos = event.data ? event.data.global : event.global;
  const dx  = pos.x - dragStart.x;
  const dy  = pos.y - dragStart.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const startR = dragStart.r;
  const startC = dragStart.c;
  dragStart = null;

  if (dist >= SWIPE_THRESHOLD) {
    let tr, tc;
    if (Math.abs(dx) > Math.abs(dy)) {
      tr = startR;
      tc = startC + (dx > 0 ? 1 : -1);
    } else {
      tr = startR + (dy > 0 ? 1 : -1);
      tc = startC;
    }
    if (tr >= 0 && tr < ROWS && tc >= 0 && tc < COLS) {
      clearSel();
      doSwap(startR, startC, tr, tc);
    }
  }
});

async function boot() {
  buildBG();
  buildHUD();

  // Loading text
  const loadTxt = new PIXI.Text('Loading assets…', new PIXI.TextStyle({
    fontFamily: 'Arial, sans-serif', fontSize: 28, fill: 0x6677aa,
  }));
  loadTxt.anchor.set(0.5, 0.5);
  loadTxt.position.set(CANVAS_W / 2, CANVAS_H / 2);
  lyrFX.addChild(loadTxt);

  await loadAssets();

  lyrFX.removeChild(loadTxt);
  loadTxt.destroy();

  initBoard();
  spawnSprites();
  refreshHUD();
}

boot().catch(err => console.error('[GemBlitz] Boot failed:', err));
