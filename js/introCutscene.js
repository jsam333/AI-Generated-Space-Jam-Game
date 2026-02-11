/**
 * introCutscene.js – Self-contained intro cutscene for Space Jam.
 *
 * Exports a single function:
 *   playIntroCutscene(mapCanvas, dialogueEl, overlayEl, onComplete)
 *
 * The cutscene draws a procedural stellar map on `mapCanvas`, slowly zooms
 * toward "Sector 7" in the top-right quadrant, and types dialogue lines
 * into `dialogueEl` with a typewriter effect.  When finished (or skipped)
 * it fades the overlay out and calls `onComplete`.
 */

// ─── Configuration ──────────────────────────────────────────────────────────

const MAP_W = 3200;   // offscreen map resolution
const MAP_H = 2400;

// Dialogue script: each entry is { text, preDelay (s before typing starts),
//                                    charDelay (s per character) }
const SCRIPT = [
  { text: 'Day 260.',                                          preDelay: 1.0,  charDelay: 0.06 },
  { text: 'The search continues... I need better gear.',       preDelay: 1.5,  charDelay: 0.04 },
  { text: 'Continuing in the Gamene Belt. The edge of space.', preDelay: 1.5,  charDelay: 0.04 },
  { text: 'Checking Sector 7....',                             preDelay: 1.5,  charDelay: 0.055 },
];

// Camera start/end for one clean continuous motion.
const SECTOR7_X = MAP_W * 0.78;
const SECTOR7_Y = MAP_H * 0.18;
const CAMERA_START_X = MAP_W / 2;
const CAMERA_START_Y = MAP_H / 2;
const CAMERA_END_X = SECTOR7_X;
const CAMERA_END_Y = SECTOR7_Y;
const ZOOM_START = 1.0;
const ZOOM_END = 288.0;
const PAN_EASE_OUT_POWER = 2.6;
const PAN_LOCK_SECONDS = 16.0;
const ZOOM_SPEED_MULT = 1.1;

const TOTAL_DURATION = 19; // shortened by 11 seconds total
const FINAL_LABEL_SECONDS = 10;
const FINAL_BLEND_SECONDS = 5;
const LOD_TIER_2_ZOOM = 2.2;
const LOD_TIER_3_ZOOM = 5.5;
const LOD_TIER_4_ZOOM = 11.5;
const PAN_LOCK_T = PAN_LOCK_SECONDS / TOTAL_DURATION;

// ─── Helpers ────────────────────────────────────────────────────────────────

function smoothstep(a, b, t) {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function getContinuousCameraPose(t) {
  const clamped = Math.max(0, Math.min(1, t));
  // Single global ease curve across the full intro for one continuous motion.
  const u = smoothstep(0, 1, clamped);
  // Pan fully to Sector 7 by 8 seconds; ease-out so it decelerates as it approaches.
  const panT = Math.max(0, Math.min(1, clamped / PAN_LOCK_T));
  const easedPanT = 1 - Math.pow(1 - panT, PAN_EASE_OUT_POWER);
  let panU = smoothstep(0, 1, easedPanT);
  if (clamped >= PAN_LOCK_T) panU = 1;
  // Slightly faster zoom progression so the end focuses on zoom, not pan.
  const zoomU = Math.max(0, Math.min(1, u * ZOOM_SPEED_MULT));
  return {
    cx: lerp(CAMERA_START_X, CAMERA_END_X, panU),
    cy: lerp(CAMERA_START_Y, CAMERA_END_Y, panU),
    // Exponential zoom feels more natural than linear at large zoom ranges.
    zoom: ZOOM_START * Math.pow(ZOOM_END / ZOOM_START, zoomU)
  };
}

function hash2ToUnit(x, y, seed = 0) {
  // Deterministic pseudo-random hash in [0, 1)
  const h = Math.sin((x * 127.1) + (y * 311.7) + (seed * 74.7)) * 43758.5453123;
  return h - Math.floor(h);
}

// ─── Trade Route Generation ──────────────────────────────────────────────────
// Uses same procedural star logic as drawProceduralStarLOD (Tier 1) so routes
// connect actual star positions. All hash-based; fully deterministic.

const STAR_TIER_CELL_SIZE = 85;
const STAR_TIER_DENSITY = 0.28;
const STAR_TIER_SEED = 5001;
const ROUTE_SEED = 880033;
const ROUTE_MIN_DIST = 120;
const ROUTE_MAX_DIST = 450;
const ROUTE_CONNECT_PROB = 0.24;

function generateStarNodes() {
  const nodes = [];
  const cellSize = STAR_TIER_CELL_SIZE;
  const density = STAR_TIER_DENSITY;
  const seed = STAR_TIER_SEED;
  const cellStartX = Math.floor(0 / cellSize) - 1;
  const cellEndX = Math.floor(MAP_W / cellSize) + 1;
  const cellStartY = Math.floor(0 / cellSize) - 1;
  const cellEndY = Math.floor(MAP_H / cellSize) + 1;

  for (let cxCell = cellStartX; cxCell <= cellEndX; cxCell++) {
    for (let cyCell = cellStartY; cyCell <= cellEndY; cyCell++) {
      if (hash2ToUnit(cxCell, cyCell, seed) > density) continue;
      const ox = hash2ToUnit(cxCell, cyCell, seed + 13);
      const oy = hash2ToUnit(cxCell, cyCell, seed + 29);
      const wx = (cxCell + ox) * cellSize;
      const wy = (cyCell + oy) * cellSize;
      if (wx < -20 || wx > MAP_W + 20 || wy < -20 || wy > MAP_H + 20) continue;
      nodes.push({ x: wx, y: wy });
    }
  }
  // Sector 7 is excluded from trade routes so it remains isolated.
  return nodes;
}

function generateTradeRoutes() {
  const nodes = generateStarNodes();
  const routes = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[j].x - nodes[i].x;
      const dy = nodes[j].y - nodes[i].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const connect = hash2ToUnit(i * 17, j * 31, ROUTE_SEED) < ROUTE_CONNECT_PROB;
      if (dist >= ROUTE_MIN_DIST && dist <= ROUTE_MAX_DIST && connect) {
        const lodPick = hash2ToUnit(i * 53, j * 97, ROUTE_SEED + 29);
        const lodLevel = (lodPick < 0.35) ? 1 : (lodPick < 0.62) ? 2 : (lodPick < 0.82) ? 3 : 4;
        routes.push({ ax: nodes[i].x, ay: nodes[i].y, bx: nodes[j].x, by: nodes[j].y, lodLevel });
      }
    }
  }
  return routes;
}

// ─── Offscreen Map Generation ───────────────────────────────────────────────

function generateMap() {
  const off = document.createElement('canvas');
  off.width = MAP_W;
  off.height = MAP_H;
  const ctx = off.getContext('2d');

  // Background
  ctx.fillStyle = '#050510';
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  // ── Nebulae (large soft gradients) ──
  const nebulae = [
    { x: MAP_W * 0.20, y: MAP_H * 0.35, r: 600, color: [90, 40, 140] },
    { x: MAP_W * 0.50, y: MAP_H * 0.55, r: 500, color: [30, 60, 130] },
    { x: MAP_W * 0.75, y: MAP_H * 0.25, r: 450, color: [20, 100, 100] },
    { x: MAP_W * 0.35, y: MAP_H * 0.75, r: 550, color: [110, 30, 70] },
    { x: MAP_W * 0.85, y: MAP_H * 0.65, r: 400, color: [40, 50, 120] },
    { x: MAP_W * 0.12, y: MAP_H * 0.15, r: 350, color: [60, 30, 100] },
    { x: MAP_W * 0.60, y: MAP_H * 0.12, r: 380, color: [25, 80, 90] },
  ];
  for (const n of nebulae) {
    const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    const [r, g, b] = n.color;
    grad.addColorStop(0, `rgba(${r},${g},${b},0.18)`);
    grad.addColorStop(0.4, `rgba(${r},${g},${b},0.08)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Stars (including Sector 7) are drawn in screen space per tier so they stay fixed size.

  return off;
}

// ─── Typewriter Engine ──────────────────────────────────────────────────────

function runTypewriter(el, script, onDone, onCharTyped = null) {
  let lineIdx = 0;
  let charIdx = 0;
  let waitTimer = 0;
  let phase = 'wait'; // 'wait' | 'type' | 'done'
  const lines = []; // accumulated finished lines (as plain strings)
  let cancelled = false;

  // Start with pre-delay of first line
  waitTimer = script[0].preDelay;

  function buildHTML() {
    // Finished lines as dim text, current line being typed, plus cursor
    let html = '';
    for (let i = 0; i < lines.length; i++) {
      html += lines[i] + '\n';
    }
    if (lineIdx < script.length) {
      const partial = script[lineIdx].text.slice(0, charIdx);
      html += partial;
      html += '<span class="cursor-blink"></span>';
    }
    return html;
  }

  function tick(dt) {
    if (cancelled) return true;

    if (phase === 'wait') {
      waitTimer -= dt;
      if (waitTimer <= 0) {
        phase = 'type';
        charIdx = 0;
        waitTimer = 0;
      }
    }

    if (phase === 'type') {
      waitTimer -= dt;
      if (waitTimer <= 0) {
        charIdx++;
        if (onCharTyped) onCharTyped();
        if (charIdx >= script[lineIdx].text.length) {
          // Finished this line
          lines.push(script[lineIdx].text);
          lineIdx++;
          if (lineIdx >= script.length) {
            phase = 'done';
          } else {
            phase = 'wait';
            waitTimer = script[lineIdx].preDelay;
            charIdx = 0;
          }
        } else {
          waitTimer = script[lineIdx].charDelay;
        }
      }
    }

    el.innerHTML = buildHTML();

    if (phase === 'done') {
      if (onDone) onDone();
      return true;
    }
    return false;
  }

  function skipToEnd() {
    cancelled = true;
    // Show all text immediately
    el.innerHTML = script.map(s => s.text).join('\n');
    if (onDone) onDone();
  }

  return { tick, skipToEnd };
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export function playIntroCutscene(mapCanvas, dialogueEl, overlayEl, onComplete, transitionHooks = null) {
  const tradeRoutes = generateTradeRoutes();
  const mapImage = generateMap();
  const hooks = transitionHooks || {};
  const onBlendStart = (typeof hooks.onBlendStart === 'function') ? hooks.onBlendStart : null;
  const onBlendProgress = (typeof hooks.onBlendProgress === 'function') ? hooks.onBlendProgress : null;
  const onBlendComplete = (typeof hooks.onBlendComplete === 'function') ? hooks.onBlendComplete : null;
  const onTypeChar = (typeof hooks.onTypeChar === 'function') ? hooks.onTypeChar : null;
  const onSkip = (typeof hooks.onSkip === 'function') ? hooks.onSkip : null;

  // Size the visible canvas to match its CSS layout
  const rect = mapCanvas.getBoundingClientRect();
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  mapCanvas.width = Math.floor(rect.width * dpr);
  mapCanvas.height = Math.floor(rect.height * dpr);
  const mCtx = mapCanvas.getContext('2d');
  mCtx.imageSmoothingEnabled = true;
  mCtx.imageSmoothingQuality = 'high';

  const cw = mapCanvas.width;
  const ch = mapCanvas.height;

  let elapsed = 0;
  let done = false;
  let dialogueDone = false;
  let animId = null;
  let lastNow = performance.now();
  let blendStarted = false;

  const typewriter = runTypewriter(dialogueEl, SCRIPT, () => { dialogueDone = true; }, onTypeChar);

  function clearOverlayBlendStyles() {
    overlayEl.style.opacity = '';
    overlayEl.style.transform = '';
  }

  function getLastLabelT(elapsedSeconds) {
    const start = TOTAL_DURATION - FINAL_LABEL_SECONDS;
    return Math.max(0, Math.min(1, (elapsedSeconds - start) / FINAL_LABEL_SECONDS));
  }

  function getBlendT(elapsedSeconds) {
    const start = TOTAL_DURATION - FINAL_BLEND_SECONDS;
    return Math.max(0, Math.min(1, (elapsedSeconds - start) / FINAL_BLEND_SECONDS));
  }

  function applyOverlayBlend(blendT) {
    const t = Math.max(0, Math.min(1, blendT));
    overlayEl.style.opacity = String(1 - t);
    overlayEl.style.transform = `scale(${lerp(1, 1.06, t).toFixed(4)})`;
  }

  function notifyBlendProgress(elapsedSeconds) {
    const blendT = getBlendT(elapsedSeconds);
    if (blendT > 0 && !blendStarted) {
      blendStarted = true;
      if (onBlendStart) onBlendStart();
    }
    if (onBlendProgress) onBlendProgress(blendT);
    return blendT;
  }

  function finish() {
    if (done) return;
    done = true;
    if (animId) cancelAnimationFrame(animId);
    notifyBlendProgress(TOTAL_DURATION);
    if (onBlendComplete) onBlendComplete();
    clearOverlayBlendStyles();
    overlayEl.style.display = 'none';
    if (onComplete) onComplete();
  }

  function skip() {
    if (done) return;
    if (onSkip) onSkip();
    typewriter.skipToEnd();
    // Draw final frame at the end of the single timeline.
    drawMapFrame(TOTAL_DURATION);
    applyOverlayBlend(1);
    finish();
  }

  // Skip listeners
  function onKeyDown(e) {
    // Ignore modifier-only presses
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    skip();
  }
  function onClick() { skip(); }

  window.addEventListener('keydown', onKeyDown);
  overlayEl.addEventListener('click', onClick);

  function cleanup() {
    window.removeEventListener('keydown', onKeyDown);
    overlayEl.removeEventListener('click', onClick);
  }

  // Wrap onComplete to also clean up listeners
  const originalOnComplete = onComplete;
  onComplete = () => {
    cleanup();
    if (originalOnComplete) originalOnComplete();
  };

  function mapToScreen(x, y, sx, sy, srcW, srcH) {
    return {
      x: ((x - sx) / srcW) * cw,
      y: ((y - sy) / srcH) * ch
    };
  }

  function getWorldToScreenScale(srcW) {
    return cw / srcW;
  }

  function wrapDashOffset(value, period) {
    if (!Number.isFinite(period) || period <= 0) return 0;
    const mod = value % period;
    return (mod + period) % period;
  }

  // Draw grid lines in map-anchored vector space (always solid).
  function drawGridLayer(sx, sy, srcW, srcH, step, color, lineWidth) {
    const startX = Math.floor(sx / step) * step;
    const endX = sx + srcW;
    const startY = Math.floor(sy / step) * step;
    const endY = sy + srcH;
    const scale = getWorldToScreenScale(srcW);
    const dashPx = [];

    mCtx.save();
    mCtx.strokeStyle = color;
    mCtx.lineWidth = lineWidth;
    mCtx.setLineDash(dashPx);
    mCtx.lineCap = 'butt';

    for (let gx = startX; gx <= endX; gx += step) {
      const p1 = mapToScreen(gx, sy, sx, sy, srcW, srcH);
      const p2 = mapToScreen(gx, sy + srcH, sx, sy, srcW, srcH);
      mCtx.beginPath();
      mCtx.moveTo(p1.x, p1.y);
      mCtx.lineTo(p2.x, p2.y);
      mCtx.stroke();
    }
    for (let gy = startY; gy <= endY; gy += step) {
      const p1 = mapToScreen(sx, gy, sx, sy, srcW, srcH);
      const p2 = mapToScreen(sx + srcW, gy, sx, sy, srcW, srcH);
      mCtx.beginPath();
      mCtx.moveTo(p1.x, p1.y);
      mCtx.lineTo(p2.x, p2.y);
      mCtx.stroke();
    }
    mCtx.restore();
  }

  // Draw route layer per LOD in vector space for crisp lines at all zoom levels.
  function drawTradeRoutesLayer(sx, sy, srcW, srcH, lodLevel, alpha, lineWidth) {
    const margin = 100;
    const scale = getWorldToScreenScale(srcW);
    const dashWorld = [14, 16];
    const dashPx = [dashWorld[0] * scale, dashWorld[1] * scale];
    const periodPx = dashPx[0] + dashPx[1];

    mCtx.save();
    mCtx.strokeStyle = `rgba(100,180,220,${alpha})`;
    mCtx.lineWidth = lineWidth;
    mCtx.setLineDash(dashPx);
    mCtx.lineCap = 'butt';

    for (const r of tradeRoutes) {
      if (r.lodLevel !== lodLevel) continue;
      const pa = mapToScreen(r.ax, r.ay, sx, sy, srcW, srcH);
      const pb = mapToScreen(r.bx, r.by, sx, sy, srcW, srcH);
      if (pa.x < -margin && pb.x < -margin) continue;
      if (pa.x > cw + margin && pb.x > cw + margin) continue;
      if (pa.y < -margin && pb.y < -margin) continue;
      if (pa.y > ch + margin && pb.y > ch + margin) continue;

      const dx = r.bx - r.ax;
      const dy = r.by - r.ay;
      const len = Math.hypot(dx, dy);
      if (len <= 0.0001) continue;
      const ux = dx / len;
      const uy = dy / len;
      const anchor = (r.ax * ux) + (r.ay * uy);
      mCtx.lineDashOffset = -wrapDashOffset(anchor * scale, periodPx);

      mCtx.beginPath();
      mCtx.moveTo(pa.x, pa.y);
      mCtx.lineTo(pb.x, pb.y);
      mCtx.stroke();
    }
    mCtx.restore();
  }

  function drawMapLabel(text, x, y, fontPx, color, sx, sy, srcW, srcH, align = 'center') {
    const screen = mapToScreen(x, y, sx, sy, srcW, srcH);
    if (screen.x < -140 || screen.x > cw + 140 || screen.y < -30 || screen.y > ch + 30) return;
    mCtx.save();
    mCtx.font = `${fontPx}px 'Oxanium', Arial, sans-serif`;
    mCtx.textAlign = align;
    mCtx.textBaseline = 'middle';
    mCtx.fillStyle = color;
    mCtx.fillText(text, screen.x, screen.y);
    mCtx.restore();
  }

  function drawProceduralStarLOD(sx, sy, srcW, srcH, cellSize, density, minSize, maxSize, alphaMin, alphaMax, seed) {
    const cellStartX = Math.floor(sx / cellSize) - 1;
    const cellEndX = Math.floor((sx + srcW) / cellSize) + 1;
    const cellStartY = Math.floor(sy / cellSize) - 1;
    const cellEndY = Math.floor((sy + srcH) / cellSize) + 1;

    for (let cxCell = cellStartX; cxCell <= cellEndX; cxCell++) {
      for (let cyCell = cellStartY; cyCell <= cellEndY; cyCell++) {
        const appear = hash2ToUnit(cxCell, cyCell, seed);
        if (appear > density) continue;

        const ox = hash2ToUnit(cxCell, cyCell, seed + 13);
        const oy = hash2ToUnit(cxCell, cyCell, seed + 29);
        const twinkle = hash2ToUnit(cxCell, cyCell, seed + 41);

        const wx = (cxCell + ox) * cellSize;
        const wy = (cyCell + oy) * cellSize;
        const p = mapToScreen(wx, wy, sx, sy, srcW, srcH);
        if (p.x < -6 || p.x > cw + 6 || p.y < -6 || p.y > ch + 6) continue;

        const size = minSize + (maxSize - minSize) * twinkle;
        const alpha = alphaMin + (alphaMax - alphaMin) * twinkle;
        mCtx.fillStyle = `rgba(235,245,255,${alpha})`;
        mCtx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      }
    }
  }

  // Draw three deterministic star fields per LOD tier (3x star count).
  function drawProceduralStarLODTriple(sx, sy, srcW, srcH, cellSize, density, minSize, maxSize, alphaMin, alphaMax, seed) {
    drawProceduralStarLOD(sx, sy, srcW, srcH, cellSize, density, minSize, maxSize, alphaMin, alphaMax, seed);
    drawProceduralStarLOD(sx, sy, srcW, srcH, cellSize, density, minSize, maxSize, alphaMin, alphaMax, seed + 100003);
    drawProceduralStarLOD(sx, sy, srcW, srcH, cellSize, density, minSize, maxSize, alphaMin, alphaMax, seed + 200009);
  }

  function drawStarAt(sx, sy, srcW, srcH, mapX, mapY, size, alpha) {
    const p = mapToScreen(mapX, mapY, sx, sy, srcW, srcH);
    if (p.x < -6 || p.x > cw + 6 || p.y < -6 || p.y > ch + 6) return;
    mCtx.fillStyle = `rgba(235,245,255,${alpha})`;
    mCtx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
  }

  function drawTier1Overview(sx, sy, srcW, srcH) {
    drawGridLayer(sx, sy, srcW, srcH, 420, 'rgba(70,110,150,0.12)', 1);
    drawTradeRoutesLayer(sx, sy, srcW, srcH, 1, 0.20, 1.1);
    drawProceduralStarLODTriple(sx, sy, srcW, srcH, 85, 0.28, 0.6, 1.2, 0.3, 0.65, 5001);
    drawStarAt(sx, sy, srcW, srcH, SECTOR7_X, SECTOR7_Y, 0.9, 0.5);
    drawMapLabel('CORE WORLDS', MAP_W * 0.38, MAP_H * 0.50, 26, 'rgba(140,180,220,0.20)', sx, sy, srcW, srcH);
    drawMapLabel('OUTER RIM', MAP_W * 0.15, MAP_H * 0.22, 18, 'rgba(140,180,220,0.16)', sx, sy, srcW, srcH);
    drawMapLabel('GAMENE BELT', MAP_W * 0.72, MAP_H * 0.18, 20, 'rgba(160,220,210,0.24)', sx, sy, srcW, srcH);
    drawMapLabel('FRONTIER', MAP_W * 0.55, MAP_H * 0.82, 16, 'rgba(140,180,220,0.13)', sx, sy, srcW, srcH);
  }

  function drawTier2SectorMap(sx, sy, srcW, srcH) {
    drawGridLayer(sx, sy, srcW, srcH, 220, 'rgba(90,140,190,0.18)', 1);
    drawTradeRoutesLayer(sx, sy, srcW, srcH, 2, 0.18, 1.0);
    // Higher-detail star points that stay sharp as zoom increases.
    drawProceduralStarLODTriple(sx, sy, srcW, srcH, 46, 0.34, 0.8, 1.4, 0.35, 0.7, 1001);
    drawStarAt(sx, sy, srcW, srcH, SECTOR7_X, SECTOR7_Y, 1.1, 0.55);
    const sectorDots = [
      { name: 'S-3', x: MAP_W * 0.68, y: MAP_H * 0.22 },
      { name: 'S-5', x: MAP_W * 0.73, y: MAP_H * 0.13 },
      { name: 'S-9', x: MAP_W * 0.82, y: MAP_H * 0.25 },
      { name: 'S-12', x: MAP_W * 0.70, y: MAP_H * 0.30 },
      { name: 'S-1', x: MAP_W * 0.60, y: MAP_H * 0.28 }
    ];
    mCtx.save();
    for (const s of sectorDots) {
      const p = mapToScreen(s.x, s.y, sx, sy, srcW, srcH);
      if (p.x < -30 || p.x > cw + 30 || p.y < -30 || p.y > ch + 30) continue;
      mCtx.fillStyle = 'rgba(170,210,240,0.50)';
      mCtx.beginPath();
      mCtx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      mCtx.fill();
      drawMapLabel(s.name, s.x + 20, s.y, 10, 'rgba(170,210,240,0.40)', sx, sy, srcW, srcH, 'left');
    }
    mCtx.restore();
  }

  function drawTier3LocalDetails(sx, sy, srcW, srcH) {
    drawGridLayer(sx, sy, srcW, srcH, 120, 'rgba(110,170,220,0.22)', 1);
    drawGridLayer(sx, sy, srcW, srcH, 60, 'rgba(110,170,220,0.08)', 1);
    drawTradeRoutesLayer(sx, sy, srcW, srcH, 3, 0.14, 0.95);
    drawProceduralStarLODTriple(sx, sy, srcW, srcH, 28, 0.48, 0.9, 1.7, 0.4, 0.78, 2003);
    drawStarAt(sx, sy, srcW, srcH, SECTOR7_X, SECTOR7_Y, 1.3, 0.6);

    // Local neighborhood markers around Sector 7 (still no special S7 label yet).
    const localNodes = [
      { name: 'NODE A', x: SECTOR7_X - 80, y: SECTOR7_Y + 50 },
      { name: 'NODE B', x: SECTOR7_X + 95, y: SECTOR7_Y - 45 },
      { name: 'NODE C', x: SECTOR7_X - 120, y: SECTOR7_Y - 70 },
      { name: 'NODE D', x: SECTOR7_X + 140, y: SECTOR7_Y + 65 }
    ];
    for (const node of localNodes) {
      const p = mapToScreen(node.x, node.y, sx, sy, srcW, srcH);
      if (p.x < -30 || p.x > cw + 30 || p.y < -30 || p.y > ch + 30) continue;
      mCtx.fillStyle = 'rgba(160,210,240,0.35)';
      mCtx.beginPath();
      mCtx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
      mCtx.fill();
      drawMapLabel(node.name, node.x + 16, node.y, 9, 'rgba(160,210,240,0.28)', sx, sy, srcW, srcH, 'left');
    }
  }

  function drawTier4FinalApproach(sx, sy, srcW, srcH, zoom) {
    drawGridLayer(sx, sy, srcW, srcH, 45, 'rgba(120,200,240,0.18)', 1);
    drawTradeRoutesLayer(sx, sy, srcW, srcH, 4, 0.12, 0.9);
    drawProceduralStarLODTriple(sx, sy, srcW, srcH, 18, 0.62, 1.0, 2.0, 0.45, 0.88, 3007);

    // Add dense close-up star detail only at final LOD.
    for (let i = 0; i < 70; i++) {
      const angle = i * 0.27;
      const radius = 25 + ((i * 17) % 90);
      const x = SECTOR7_X + Math.cos(angle) * radius;
      const y = SECTOR7_Y + Math.sin(angle) * radius * 0.8;
      const p = mapToScreen(x, y, sx, sy, srcW, srcH);
      if (p.x < -10 || p.x > cw + 10 || p.y < -10 || p.y > ch + 10) continue;
      const starSize = (i % 3 === 0) ? 1.5 : 1;
      mCtx.fillStyle = (i % 4 === 0) ? 'rgba(190,220,255,0.60)' : 'rgba(230,230,255,0.55)';
      mCtx.fillRect(p.x - starSize / 2, p.y - starSize / 2, starSize, starSize);
    }

    // No fixed Sector 7 marker in the final section; zoom drives the transition.
  }

  function drawMapFrame(elapsedSeconds) {
    const tNorm = Math.max(0, Math.min(1, elapsedSeconds / TOTAL_DURATION));
    const { cx, cy, zoom } = getContinuousCameraPose(tNorm);
    const lastLabelT = getLastLabelT(elapsedSeconds);
    const blendT = getBlendT(elapsedSeconds);

    // Source rect on offscreen map
    const viewW = MAP_W / zoom;
    const viewH = MAP_H / zoom;
    // Maintain aspect ratio of destination canvas
    const aspect = cw / ch;
    let srcW = viewW;
    let srcH = viewW / aspect;
    if (srcH > viewH) {
      srcH = viewH;
      srcW = viewH * aspect;
    }
    const sx = cx - srcW / 2;
    const sy = cy - srcH / 2;

    mCtx.clearRect(0, 0, cw, ch);
    mCtx.fillStyle = '#050510';
    mCtx.fillRect(0, 0, cw, ch);
    mCtx.drawImage(mapImage, sx, sy, srcW, srcH, 0, 0, cw, ch);

    // Progressive map detail levels (4 LOD tiers).
    drawTier1Overview(sx, sy, srcW, srcH);
    if (zoom >= LOD_TIER_2_ZOOM) drawTier2SectorMap(sx, sy, srcW, srcH);
    if (zoom >= LOD_TIER_3_ZOOM) drawTier3LocalDetails(sx, sy, srcW, srcH);
    if (zoom >= LOD_TIER_4_ZOOM) drawTier4FinalApproach(sx, sy, srcW, srcH, zoom);

    // Last 5s: show a basic Sector 7 label above the target star.
    if (lastLabelT > 0) {
      const labelFadeIn = smoothstep(0, 0.25, lastLabelT);
      const labelAlpha = Math.max(0, Math.min(1, labelFadeIn));
      if (labelAlpha > 0) {
        const sector7Screen = mapToScreen(SECTOR7_X, SECTOR7_Y, sx, sy, srcW, srcH);
        mCtx.save();
        mCtx.font = `16px 'Oxanium', Arial, sans-serif`;
        mCtx.textAlign = 'center';
        mCtx.textBaseline = 'bottom';
        mCtx.fillStyle = `rgba(185,245,255,${(0.84 * labelAlpha).toFixed(3)})`;
        mCtx.fillText('Sector 7', sector7Screen.x, sector7Screen.y - 14);
        mCtx.restore();
      }
    }

    // Slight scanline / vignette overlay for atmosphere
    const vigGrad = mCtx.createRadialGradient(cw / 2, ch / 2, ch * 0.3, cw / 2, ch / 2, ch * 0.8);
    vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vigGrad.addColorStop(1, 'rgba(0,0,0,0.35)');
    mCtx.fillStyle = vigGrad;
    mCtx.fillRect(0, 0, cw, ch);
  }

  function frame(now) {
    if (done) return;
    const dt = Math.min((now - lastNow) / 1000, 0.1);
    lastNow = now;
    elapsed += dt;

    // Update typewriter
    typewriter.tick(dt);

    // Draw map
    drawMapFrame(elapsed);
    const blendT = notifyBlendProgress(elapsed);
    applyOverlayBlend(blendT);

    // Auto-finish when both zoom and dialogue are done
    if (elapsed >= TOTAL_DURATION && dialogueDone) {
      finish();
      return;
    }

    animId = requestAnimationFrame(frame);
  }

  animId = requestAnimationFrame(frame);
}
