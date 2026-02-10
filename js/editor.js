const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');

// --- Constants ---
const CONSTANTS = {
  STORAGE_KEY: 'spacejam-level-editor',
  GRID_SIZE: 500,
  STRUCTURE_SIZE: 80,
  GAME_VIEW_WIDTH: 1200,
  GAME_VIEW_HEIGHT: 900,
  ZOOM_MIN: 0.02,
  ZOOM_MAX: 2,
  DEFAULT_LEVEL_SIZE: 5000,
  DEFAULT_SEED: 12345,
  ASTEROID_SIZE_MIN: 10,
  ASTEROID_SIZE_MAX: 300,
  ASTEROID_SIZE_STEP: 10
};

// --- Editor tool tuning ---
// Eraser is a screen-space brush (same pixel size at any zoom)
const ERASER_RADIUS_PX = 14;
const ERASE_SAVE_INTERVAL_MS = 200;

const COLORS = {
  BACKGROUND: '#0a0a12',
  GRID: '#222',
  LEVEL_BOUNDS: '#335',
  ORIGIN: '#444',
  VIEWPORT_BOX: 'rgba(100, 150, 255, 0.8)',
  TEXT: '#666',
  TEXT_WHITE: '#fff'
};

const ASTEROID_COLORS = {
  cuprite: { fill: '#665544', stroke: '#998877' },
  hematite: { fill: '#8B4513', stroke: '#A0522D' },
  aurite: { fill: '#B8860B', stroke: '#FFD700' },
  diamite: { fill: '#787878', stroke: '#909090' },
  platinite: { fill: '#D3D3D3', stroke: '#E5E4E2' }
};

const STRUCTURE_STYLES = {
  shop: { fill: '#446688', stroke: '#6699bb' },
  shipyard: { fill: '#664466', stroke: '#886688' },
  refinery: { fill: '#666644', stroke: '#888866' },
  fueling: { fill: '#446644', stroke: '#668866' },
  crafting: { fill: '#886644', stroke: '#aa8866' },
  warpgate: { fill: '#6644aa', stroke: '#8866cc' },
  piratebase: { fill: '#884422', stroke: '#aa6644' }
};

// Interact radius matches game: STRUCTURE_SIZE_COLL (54) + SHOP_DASHED_EXTRA_3D (108) = 162
const INTERACT_RADIUS = 162;
const INTERACTABLE_TYPES = new Set(['shop', 'warpgate', 'crafting', 'refinery', 'shipyard']);
// Pirate base aggro radius matches game constants.js
const PIRATE_BASE_AGGRO_RADIUS = 300;
const PIRATE_TYPE_KEYS = ['normal', 'sturdy', 'fast'];
const PIRATE_TYPE_LABELS = { normal: 'Normal', sturdy: 'Sturdy', fast: 'Fast' };
const DEFAULT_PIRATE_TYPE_PERCENTAGES = { normal: 100, sturdy: 0, fast: 0 };
const PIRATE_ARCHETYPE_KEYS = ['standard', 'shotgun', 'slowing', 'breaching', 'drone'];
const PIRATE_ARCHETYPE_LABELS = {
  standard: 'Standard',
  shotgun: 'Shotgun',
  slowing: 'Slowing',
  breaching: 'Breaching',
  drone: 'Drone'
};
const PIRATE_ARCHETYPE_OUTLINE_COLORS = Object.freeze({
  standard: '#aa6644',
  shotgun: '#d18a4f',
  slowing: '#b48cff',
  breaching: '#ff6b5d',
  drone: '#7db8ff'
});

function normalizePirateBaseTier(tier) {
  const n = Number(tier);
  if (!Number.isFinite(n)) return 2;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function getPirateBaseTierScale(tier) {
  return 0.6 + (normalizePirateBaseTier(tier) * 0.2);
}

function getStructureDrawScale(type, tier) {
  return type === 'piratebase' ? getPirateBaseTierScale(tier) : 1;
}

function getStructureStyle(type, pirateArchetype = 'standard') {
  const baseStyle = STRUCTURE_STYLES[type] || STRUCTURE_STYLES.shop;
  if (type !== 'piratebase') return baseStyle;
  const resolvedArchetype = normalizePirateArchetype(pirateArchetype);
  return {
    ...baseStyle,
    stroke: PIRATE_ARCHETYPE_OUTLINE_COLORS[resolvedArchetype] || baseStyle.stroke
  };
}

function normalizePirateTypePercentages(mix) {
  const out = { normal: 0, sturdy: 0, fast: 0 };
  for (const key of PIRATE_TYPE_KEYS) {
    const value = Number(mix?.[key]);
    out[key] = Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  const total = out.normal + out.sturdy + out.fast;
  if (total <= 0) return { ...DEFAULT_PIRATE_TYPE_PERCENTAGES };
  return out;
}

function normalizePirateArchetype(archetype) {
  return PIRATE_ARCHETYPE_KEYS.includes(archetype) ? archetype : 'standard';
}

function ensureSpawnSettingsDefaults(spawnSettings) {
  const s = spawnSettings || {};
  if (!Array.isArray(s.tiers)) s.tiers = [];
  s.initialDelay = Number.isFinite(Number(s.initialDelay)) ? Number(s.initialDelay) : 120;
  s.waveIntervalMin = Number.isFinite(Number(s.waveIntervalMin)) ? Number(s.waveIntervalMin) : 60;
  s.waveIntervalMax = Number.isFinite(Number(s.waveIntervalMax)) ? Number(s.waveIntervalMax) : 100;
  s.waveSizeMin = Number.isFinite(Number(s.waveSizeMin)) ? Number(s.waveSizeMin) : 2;
  s.waveSizeMax = Number.isFinite(Number(s.waveSizeMax)) ? Number(s.waveSizeMax) : 4;
  s.pirateTypePercentages = normalizePirateTypePercentages(s.pirateTypePercentages);
  for (const tier of s.tiers) {
    tier.startTime = Number.isFinite(Number(tier.startTime)) ? Number(tier.startTime) : 300;
    tier.waveIntervalMin = Number.isFinite(Number(tier.waveIntervalMin)) ? Number(tier.waveIntervalMin) : 45;
    tier.waveIntervalMax = Number.isFinite(Number(tier.waveIntervalMax)) ? Number(tier.waveIntervalMax) : 80;
    tier.waveSizeMin = Number.isFinite(Number(tier.waveSizeMin)) ? Number(tier.waveSizeMin) : 3;
    tier.waveSizeMax = Number.isFinite(Number(tier.waveSizeMax)) ? Number(tier.waveSizeMax) : 6;
    tier.pirateTypePercentages = normalizePirateTypePercentages(tier.pirateTypePercentages);
  }
  return s;
}

function ensurePirateBaseSpawnDefaults(obj) {
  obj.pirateArchetype = normalizePirateArchetype(obj.pirateArchetype);
  obj.defenseTypePercentages = normalizePirateTypePercentages(obj.defenseTypePercentages);
  obj.waveSpawnTypePercentages = normalizePirateTypePercentages(obj.waveSpawnTypePercentages);
  obj.waveSpawnCount = Math.max(1, Math.round(Number(obj.waveSpawnCount) || 4));
}

function renderPirateTypePercentagesEditor(parent, labelText, mixObj, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'prop-group';
  wrap.innerHTML = `<label>${labelText}</label>`;
  for (const type of PIRATE_TYPE_KEYS) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:4px 0;';
    const name = document.createElement('span');
    name.style.cssText = 'font-size:11px;color:#ccc;min-width:55px;';
    name.textContent = PIRATE_TYPE_LABELS[type];
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.value = mixObj[type];
    input.oninput = (e) => {
      mixObj[type] = Math.max(0, Number(e.target.value) || 0);
      onChange();
    };
    row.appendChild(name);
    row.appendChild(input);
    wrap.appendChild(row);
  }
  const note = document.createElement('div');
  note.style.cssText = 'font-size:10px;color:#888;margin-top:4px;';
  note.textContent = 'Percentages are weighted and auto-normalized in-game.';
  wrap.appendChild(note);
  parent.appendChild(wrap);
}

function normalizeStructure(st) {
  const out = { ...st };
  if (out.type === 'piratebase') {
    out.tier = normalizePirateBaseTier(out.tier);
    ensurePirateBaseSpawnDefaults(out);
  }
  return out;
}

// --- State ---
const state = {
  level: {
    width: CONSTANTS.DEFAULT_LEVEL_SIZE,
    height: CONSTANTS.DEFAULT_LEVEL_SIZE,
    seed: CONSTANTS.DEFAULT_SEED,
    asteroids: [],
    structures: []
  },
  camera: {
    x: 0,
    y: 0,
    zoom: 0.15
  },
  mouse: {
    x: 0,
    y: 0,
    inCanvas: false,
    isPanning: false,
    isErasing: false,
    isMoving: false,
    moveStartWorld: { x: 0, y: 0 },
    moveOriginalX: 0,
    moveOriginalY: 0,
    eraseNeedsSave: false,
    eraseLastSaveAt: 0,
    panStart: { x: 0, y: 0 },
    panCamStart: { x: 0, y: 0 }
  },
  tool: {
    selected: 'asteroid_cuprite',
    asteroidSize: 40,
    piratebaseTier: 2
  },
  selectedObject: null,
  clipboard: null, // { asteroids: [...], structures: [...] } with positions relative to center
  copySelectMode: false, // true when waiting for user to drag a selection rectangle
  copySelect: null, // { startX, startY } in world coords while dragging selection rect
  copySelectScreen: null, // { sx, sy } screen start for the drag
  pasteMode: false // true when in paste-preview mode
};

// --- Core Functions ---

function saveLevel() {
  const levelData = {
    width: state.level.width,
    height: state.level.height,
    seed: state.level.seed,
    asteroids: state.level.asteroids,
    structures: state.level.structures,
    spawnSettings: state.level.spawnSettings
  };
  localStorage.setItem(CONSTANTS.STORAGE_KEY, JSON.stringify(levelData));
}

function loadLevel() {
  try {
    const stored = localStorage.getItem(CONSTANTS.STORAGE_KEY);
    if (!stored) return;
    const levelData = JSON.parse(stored);
    state.level.width = levelData.width || CONSTANTS.DEFAULT_LEVEL_SIZE;
    state.level.height = levelData.height || CONSTANTS.DEFAULT_LEVEL_SIZE;
    state.level.seed = levelData.seed != null ? (levelData.seed >>> 0) : CONSTANTS.DEFAULT_SEED;
    state.level.asteroids = levelData.asteroids || [];
    state.level.structures = (levelData.structures || []).map(normalizeStructure);
    state.level.spawnSettings = ensureSpawnSettingsDefaults(levelData.spawnSettings || {
      initialDelay: 120,
      waveIntervalMin: 60,
      waveIntervalMax: 100,
      waveSizeMin: 2,
      waveSizeMax: 4,
      pirateTypePercentages: { ...DEFAULT_PIRATE_TYPE_PERCENTAGES },
      tiers: []
    });
    
    // Update UI inputs
    document.getElementById('level-width').value = state.level.width;
    document.getElementById('level-height').value = state.level.height;
  } catch (e) { /* ignore invalid stored data */ }
}

function resizeCanvas() {
  const container = document.getElementById('editor-container');
  const w = container.clientWidth || window.innerWidth - 240;
  const h = container.clientHeight || window.innerHeight;
  if (w > 0 && h > 0) {
    canvas.width = w;
    canvas.height = h;
  }
  render();
}

function screenToWorld(sx, sy) {
  return {
    x: (sx - canvas.width / 2) / state.camera.zoom + state.camera.x,
    y: (sy - canvas.height / 2) / state.camera.zoom + state.camera.y
  };
}

function worldToScreen(wx, wy) {
  return {
    x: (wx - state.camera.x) * state.camera.zoom + canvas.width / 2,
    y: (wy - state.camera.y) * state.camera.zoom + canvas.height / 2
  };
}

// --- Drawing Helpers ---

function drawAsteroid(ctx, x, y, radius, type, isPreview = false) {
  const s = worldToScreen(x, y);
  const r = radius * state.camera.zoom;
  const colors = ASTEROID_COLORS[type] || ASTEROID_COLORS.cuprite;
  
  ctx.fillStyle = isPreview ? colors.fill + '80' : colors.fill;
  ctx.strokeStyle = isPreview ? '#aaa' : colors.stroke;
  ctx.lineWidth = isPreview ? 1 : 2;
  
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawStructure(ctx, x, y, type, isPreview = false, tier = 2, pirateArchetype = 'standard') {
  const s = worldToScreen(x, y);
  const scale = getStructureDrawScale(type, tier);
  const r = CONSTANTS.STRUCTURE_SIZE * scale * state.camera.zoom;
  const style = getStructureStyle(type, pirateArchetype);

  // Draw interact/aggro radius rings (bright dashed)
  // - interactables: bright using structure stroke color
  // - piratebase: red aggro ring
  {
    const z = state.camera.zoom;
    const dashA = Math.max(2, 7 * z);
    const dashB = Math.max(2, 5 * z);

    if (INTERACTABLE_TYPES.has(type)) {
      const ir = INTERACT_RADIUS * z;
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = 2;
      ctx.globalAlpha = isPreview ? 0.65 : 0.95;
      ctx.setLineDash([dashA, dashB]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, ir, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    if (type === 'piratebase') {
      const ar = PIRATE_BASE_AGGRO_RADIUS * getPirateBaseTierScale(tier) * z;
      ctx.strokeStyle = '#ff3333';
      ctx.lineWidth = 2;
      ctx.globalAlpha = isPreview ? 0.6 : 0.95;
      ctx.setLineDash([dashA, dashB]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, ar, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }
  
  ctx.fillStyle = isPreview ? style.fill + '99' : style.fill;
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = isPreview ? 1 : 2;
  
  ctx.beginPath();
  ctx.rect(s.x - r, s.y - r * 0.6, r * 2, r * 1.2);
  ctx.fill();
  ctx.stroke();
  
  ctx.fillStyle = COLORS.TEXT_WHITE;
  ctx.font = `${Math.max(8, r * 0.4)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  let label = type.charAt(0).toUpperCase();
  if (type === 'warpgate') label = 'W';
  if (type === 'piratebase') label = `P${normalizePirateBaseTier(tier)}`;
  
  ctx.fillText(label, s.x, s.y);
}

function drawGrid(ctx) {
  ctx.strokeStyle = COLORS.GRID;
  ctx.lineWidth = 1;
  
  const startX = Math.floor(-state.level.width / 2 / CONSTANTS.GRID_SIZE) * CONSTANTS.GRID_SIZE;
  const startY = Math.floor(-state.level.height / 2 / CONSTANTS.GRID_SIZE) * CONSTANTS.GRID_SIZE;
  
  // Vertical lines
  for (let gx = startX; gx <= state.level.width / 2; gx += CONSTANTS.GRID_SIZE) {
    const s1 = worldToScreen(gx, -state.level.height / 2);
    const s2 = worldToScreen(gx, state.level.height / 2);
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();
  }
  
  // Horizontal lines
  for (let gy = startY; gy <= state.level.height / 2; gy += CONSTANTS.GRID_SIZE) {
    const s1 = worldToScreen(-state.level.width / 2, gy);
    const s2 = worldToScreen(state.level.width / 2, gy);
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();
  }
}

// --- Render Loop ---

function drawBackground() {
  ctx.fillStyle = COLORS.BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw level bounds
  const topLeft = worldToScreen(-state.level.width / 2, -state.level.height / 2);
  const bottomRight = worldToScreen(state.level.width / 2, state.level.height / 2);
  ctx.strokeStyle = COLORS.LEVEL_BOUNDS;
  ctx.lineWidth = 2;
  ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
}

function drawOrigin() {
  const origin = worldToScreen(0, 0);
  ctx.strokeStyle = COLORS.ORIGIN;
  ctx.beginPath();
  ctx.moveTo(origin.x - 15, origin.y);
  ctx.lineTo(origin.x + 15, origin.y);
  ctx.moveTo(origin.x, origin.y - 15);
  ctx.lineTo(origin.x, origin.y + 15);
  ctx.stroke();
}

function drawWorldObjects() {
  // Draw asteroids
  for (const ast of state.level.asteroids) {
    drawAsteroid(ctx, ast.x, ast.y, ast.radius, ast.oreType || 'cuprite');
  }
  
  // Draw structures
  for (const st of state.level.structures) {
    drawStructure(ctx, st.x, st.y, st.type, false, st.tier, st.pirateArchetype);
  }
}

function drawOverlay() {
  if (!state.mouse.inCanvas) return;
  
  // Draw viewport scale box
  const boxW = CONSTANTS.GAME_VIEW_WIDTH * state.camera.zoom;
  const boxH = CONSTANTS.GAME_VIEW_HEIGHT * state.camera.zoom;
  
  ctx.strokeStyle = COLORS.VIEWPORT_BOX;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(state.mouse.x - boxW / 2, state.mouse.y - boxH / 2, boxW, boxH);
  ctx.setLineDash([]);
  
  // Draw tool preview
  const world = screenToWorld(state.mouse.x, state.mouse.y);
  
  if (state.tool.selected === 'eraser') {
    // Draw eraser cursor (circle with X)
    const r = ERASER_RADIUS_PX;
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(state.mouse.x, state.mouse.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(state.mouse.x - r * 0.5, state.mouse.y - r * 0.5);
    ctx.lineTo(state.mouse.x + r * 0.5, state.mouse.y + r * 0.5);
    ctx.moveTo(state.mouse.x + r * 0.5, state.mouse.y - r * 0.5);
    ctx.lineTo(state.mouse.x - r * 0.5, state.mouse.y + r * 0.5);
    ctx.stroke();
  } else if (state.tool.selected.startsWith('asteroid_')) {
    const type = state.tool.selected.replace('asteroid_', '');
    drawAsteroid(ctx, world.x, world.y, state.tool.asteroidSize, type, true);
  } else if (STRUCTURE_STYLES[state.tool.selected]) {
    drawStructure(ctx, world.x, world.y, state.tool.selected, true, state.tool.piratebaseTier, 'standard');
  }

  // Draw selection highlight
  if (state.selectedObject) {
    const sel = state.selectedObject;
    const s = worldToScreen(sel.x, sel.y);
    let r = 20;
    if (sel.radius) r = sel.radius * state.camera.zoom + 10;
    else r = (CONSTANTS.STRUCTURE_SIZE * getStructureDrawScale(sel.type, sel.tier) * state.camera.zoom) + 10;
    
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw copy-selection rectangle while dragging
  if (state.copySelectScreen) {
    const sx = state.copySelectScreen.sx;
    const sy = state.copySelectScreen.sy;
    const ex = state.mouse.x;
    const ey = state.mouse.y;
    const rx = Math.min(sx, ex);
    const ry = Math.min(sy, ey);
    const rw = Math.abs(ex - sx);
    const rh = Math.abs(ey - sy);
    ctx.strokeStyle = '#44aaff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.fillStyle = 'rgba(68, 170, 255, 0.1)';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.setLineDash([]);

    // Draw "Select area to copy" label
    ctx.fillStyle = '#44aaff';
    ctx.font = '12px Arial';
    ctx.fillText('Drag to select area', rx, ry - 6);
  }

  // Draw paste preview (ghost outlines at cursor)
  if (state.pasteMode && state.clipboard) {
    const cx = world.x;
    const cy = world.y;
    ctx.globalAlpha = 0.5;
    for (const a of state.clipboard.asteroids) {
      const type = a.oreType || 'cuprite';
      drawAsteroid(ctx, cx + a.rx, cy + a.ry, a.radius, type, true);
    }
    for (const s of state.clipboard.structures) {
      drawStructure(ctx, cx + s.rx, cy + s.ry, s.type, true, s.tier, s.pirateArchetype);
    }
    ctx.globalAlpha = 1.0;

    // Label
    const screenPos = worldToScreen(cx, cy);
    ctx.fillStyle = '#88ff88';
    ctx.font = '12px Arial';
    ctx.fillText('Click to paste (' + (state.clipboard.asteroids.length + state.clipboard.structures.length) + ' objects) — Esc to cancel', screenPos.x - 80, screenPos.y - 20);
  }
}

function drawUI() {
  ctx.fillStyle = COLORS.TEXT;
  ctx.font = '12px Arial';
  const infoText = `Asteroids: ${state.level.asteroids.length} | Structures: ${state.level.structures.length} | Zoom: ${(state.camera.zoom * 100).toFixed(0)}%`;
  ctx.fillText(infoText, 10, 20);

  // Mode indicator
  if (state.copySelectMode && !state.copySelectScreen) {
    ctx.fillStyle = '#44aaff';
    ctx.font = '14px Arial';
    ctx.fillText('COPY: Drag a rectangle to select objects (Esc to cancel)', 10, 40);
  } else if (state.pasteMode) {
    ctx.fillStyle = '#88ff88';
    ctx.font = '14px Arial';
    ctx.fillText('PASTE: Click to place copied objects (Esc to cancel)', 10, 40);
  }
}

function render() {
  drawBackground();
  drawGrid(ctx);
  drawOrigin();
  drawWorldObjects();
  drawOverlay();
  drawUI();
}

// --- Event Handlers ---

function handleMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  state.mouse.x = e.clientX - rect.left;
  state.mouse.y = e.clientY - rect.top;

  if (state.mouse.isPanning) {
    state.camera.x = state.mouse.panCamStart.x - (state.mouse.x - state.mouse.panStart.x) / state.camera.zoom;
    state.camera.y = state.mouse.panCamStart.y - (state.mouse.y - state.mouse.panStart.y) / state.camera.zoom;
  }

  // Move tool: drag selected object
  if (state.mouse.isMoving && state.selectedObject) {
    const world = screenToWorld(state.mouse.x, state.mouse.y);
    const dx = world.x - state.mouse.moveStartWorld.x;
    const dy = world.y - state.mouse.moveStartWorld.y;
    state.selectedObject.x = state.mouse.moveOriginalX + dx;
    state.selectedObject.y = state.mouse.moveOriginalY + dy;
  }

  // Eraser brush: continuously erase while held
  if (state.mouse.isErasing && state.tool.selected === 'eraser') {
    const world = screenToWorld(state.mouse.x, state.mouse.y);
    eraseBrushAt(world);
  }

  render();
}

function flushEraseSave(force = false) {
  if (!state.mouse.eraseNeedsSave) return;
  const now = performance.now();
  if (!force && now - state.mouse.eraseLastSaveAt < ERASE_SAVE_INTERVAL_MS) return;
  saveLevel();
  state.mouse.eraseNeedsSave = false;
  state.mouse.eraseLastSaveAt = now;
}

function eraseBrushAt(world) {
  const radiusWorld = ERASER_RADIUS_PX / state.camera.zoom;
  let removedAny = false;
  let removedSelected = false;

  // Asteroids: erase if brush intersects asteroid circle
  for (let i = state.level.asteroids.length - 1; i >= 0; i--) {
    const a = state.level.asteroids[i];
    const dx = a.x - world.x;
    const dy = a.y - world.y;
    if (Math.sqrt(dx * dx + dy * dy) <= a.radius + radiusWorld) {
      if (state.selectedObject === a) removedSelected = true;
      state.level.asteroids.splice(i, 1);
      removedAny = true;
    }
  }

  // Structures: erase if brush intersects structure rect
  const hw = CONSTANTS.STRUCTURE_SIZE;
  const hh = CONSTANTS.STRUCTURE_SIZE * 0.6;
  for (let i = state.level.structures.length - 1; i >= 0; i--) {
    const st = state.level.structures[i];
    const dx = Math.abs(st.x - world.x) - hw;
    const dy = Math.abs(st.y - world.y) - hh;
    const ax = Math.max(dx, 0);
    const ay = Math.max(dy, 0);
    if (Math.sqrt(ax * ax + ay * ay) <= radiusWorld) {
      if (state.selectedObject === st) removedSelected = true;
      state.level.structures.splice(i, 1);
      removedAny = true;
    }
  }

  if (!removedAny) return false;

  if (removedSelected) {
    state.selectedObject = null;
    updatePropertiesPanel();
  }

  state.mouse.eraseNeedsSave = true;
  flushEraseSave(false);
  return true;
}

function handleSelectObject(world) {
  let bestDist = Infinity;
  let bestObj = null;

  // Check structures first (priority)
  for (const st of state.level.structures) {
    const scale = getStructureDrawScale(st.type, st.tier);
    const structHalfW = CONSTANTS.STRUCTURE_SIZE * scale;
    const structHalfH = CONSTANTS.STRUCTURE_SIZE * 0.6 * scale;
    const dx = st.x - world.x;
    const dy = st.y - world.y;
    if (Math.abs(dx) < structHalfW && Math.abs(dy) < structHalfH) {
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < bestDist) {
        bestDist = d;
        bestObj = st;
      }
    }
  }

  // Check asteroids
  if (!bestObj) {
    for (const ast of state.level.asteroids) {
      const dx = ast.x - world.x;
      const dy = ast.y - world.y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < ast.radius) {
        if (d < bestDist) {
          bestDist = d;
          bestObj = ast;
        }
      }
    }
  }

  state.selectedObject = bestObj;
  updatePropertiesPanel();
  render();
}

function updatePropertiesPanel() {
  const panel = document.getElementById('properties-panel');
  const content = document.getElementById('properties-content');
  
  if (!state.selectedObject) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'flex';
  content.innerHTML = '';
  const obj = state.selectedObject;

  // Common properties
  addPropInput(content, 'X', obj.x, (v) => { obj.x = parseInt(v); render(); saveLevel(); });
  addPropInput(content, 'Y', obj.y, (v) => { obj.y = parseInt(v); render(); saveLevel(); });

  if (obj.radius) { // Asteroid
    addPropInput(content, 'Radius', obj.radius, (v) => { obj.radius = parseInt(v); render(); saveLevel(); });
    // Ore Type
    const oreDiv = document.createElement('div');
    oreDiv.className = 'prop-group';
    oreDiv.innerHTML = `<label>Ore Type</label>`;
    const select = document.createElement('select');
    ['cuprite', 'hematite', 'aurite', 'diamite', 'platinite'].forEach(type => {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = type;
      opt.selected = obj.oreType === type;
      select.appendChild(opt);
    });
    select.onchange = (e) => { obj.oreType = e.target.value; render(); saveLevel(); };
    oreDiv.appendChild(select);
    content.appendChild(oreDiv);
  } else { // Structure
    const typeDiv = document.createElement('div');
    typeDiv.className = 'prop-group';
    typeDiv.innerHTML = `<label>Type: ${obj.type}</label>`;
    content.appendChild(typeDiv);

    if (obj.type === 'shop') {
      renderShopProperties(content, obj);
    } else if (obj.type === 'crafting') {
      renderCraftingProperties(content, obj);
    } else if (obj.type === 'shipyard') {
      renderShipyardProperties(content, obj);
    } else if (obj.type === 'piratebase') {
      renderPirateBaseProperties(content, obj);
    } else if (obj.type === 'warpgate') {
      renderWarpGateProperties(content, obj);
    } else if (obj.type === 'refinery') {
      renderRefineryProperties(content, obj);
    }
  }
}

function addPropInput(parent, label, value, onChange) {
  const div = document.createElement('div');
  div.className = 'prop-group';
  div.innerHTML = `<label>${label}</label>`;
  const input = document.createElement('input');
  input.type = 'number';
  input.value = value;
  input.oninput = (e) => onChange(e.target.value);
  div.appendChild(input);
  parent.appendChild(div);
}

function renderShopProperties(parent, obj) {
  if (!obj.inventory) obj.inventory = [];
  if (!obj.prices) obj.prices = {};

  // Inventory
  const invDiv = document.createElement('div');
  invDiv.className = 'prop-group';
  invDiv.innerHTML = `<label>Inventory</label>`;
  const invList = document.createElement('div');
  invList.className = 'prop-list';
  
  let draggedIdx = null;
  
  const renderInvList = () => {
    invList.innerHTML = '';
    obj.inventory.forEach((item, idx) => {
      const itemRow = document.createElement('div');
      itemRow.className = 'prop-list-item';
      itemRow.draggable = true;
      itemRow.dataset.idx = idx;
      
      // Drag handle
      const dragHandle = document.createElement('span');
      dragHandle.className = 'drag-handle';
      dragHandle.textContent = '≡';
      dragHandle.style.cssText = 'cursor:grab;margin-right:5px;color:#888;';
      
      const itemLabel = document.createElement('span');
      itemLabel.style.cssText = 'font-size:10px;flex:1;';
      itemLabel.textContent = item.item;
      
      const qtyInput = document.createElement('input');
      qtyInput.type = 'number';
      qtyInput.min = '1';
      qtyInput.placeholder = 'Qty';
      qtyInput.value = item.quantity || 1;
      qtyInput.onchange = (e) => {
        item.quantity = Math.max(1, parseInt(e.target.value) || 1);
        saveLevel();
      };
      
      const delBtn = document.createElement('button');
      delBtn.textContent = '×';
      delBtn.onclick = () => {
        obj.inventory.splice(idx, 1);
        renderInvList();
        saveLevel();
      };
      
      // Drag events
      itemRow.ondragstart = (e) => {
        draggedIdx = idx;
        itemRow.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
      };
      itemRow.ondragend = () => {
        itemRow.style.opacity = '1';
        draggedIdx = null;
        // Remove all drag-over styling
        invList.querySelectorAll('.prop-list-item').forEach(el => el.style.borderTop = '');
      };
      itemRow.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const targetIdx = parseInt(itemRow.dataset.idx);
        if (draggedIdx !== null && targetIdx !== draggedIdx) {
          itemRow.style.borderTop = '2px solid #6699bb';
        }
      };
      itemRow.ondragleave = () => {
        itemRow.style.borderTop = '';
      };
      itemRow.ondrop = (e) => {
        e.preventDefault();
        const targetIdx = parseInt(itemRow.dataset.idx);
        if (draggedIdx !== null && targetIdx !== draggedIdx) {
          // Reorder array
          const [moved] = obj.inventory.splice(draggedIdx, 1);
          obj.inventory.splice(targetIdx, 0, moved);
          saveLevel();
          renderInvList();
        }
      };
      
      itemRow.appendChild(dragHandle);
      itemRow.appendChild(itemLabel);
      itemRow.appendChild(qtyInput);
      itemRow.appendChild(delBtn);
      invList.appendChild(itemRow);
    });
  };
  renderInvList();
  
  // Add item
  const addItemDiv = document.createElement('div');
  addItemDiv.style.display = 'flex';
  addItemDiv.style.gap = '5px';
  const itemSelect = document.createElement('select');
  ALL_ITEM_NAMES.forEach(i => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i;
    itemSelect.appendChild(opt);
  });
  const addBtn = document.createElement('button');
  addBtn.className = 'add-btn';
  addBtn.textContent = 'Add Item';
  addBtn.onclick = () => {
    // Default objects based on type - all items have quantity (count in shop)
    const name = itemSelect.value;
    let newItem = { item: name, quantity: 1 };
    // Set full capacity for containers
    if (name === 'small energy cell') { newItem.energy = 10; newItem.maxEnergy = 10; }
    else if (name === 'medium energy cell') { newItem.energy = 30; newItem.maxEnergy = 30; }
    else if (name === 'large energy cell') { newItem.energy = 60; newItem.maxEnergy = 60; }
    else if (name === 'fuel tank') { newItem.fuel = 10; newItem.maxFuel = 10; }
    else if (name === 'medium fuel tank') { newItem.fuel = 30; newItem.maxFuel = 30; }
    else if (name === 'large fuel tank') { newItem.fuel = 60; newItem.maxFuel = 60; }
    else if (name === 'oxygen canister') { newItem.oxygen = 10; newItem.maxOxygen = 10; }
    else if (name === 'medium oxygen canister') { newItem.oxygen = 30; newItem.maxOxygen = 30; }
    else if (name === 'large oxygen canister') { newItem.oxygen = 60; newItem.maxOxygen = 60; }
    else if (name === 'health pack') { newItem.health = 10; }
    else if (name === 'medium health pack') { newItem.health = 30; }
    else if (name === 'large health pack') { newItem.health = 60; }
    else if (name.includes('laser') || name.includes('blaster')) { newItem.heat = 0; newItem.overheated = false; }
    
    obj.inventory.push(newItem);
    renderInvList();
    saveLevel();
  };
  
  addItemDiv.appendChild(itemSelect);
  addItemDiv.appendChild(addBtn);
  
  invDiv.appendChild(invList);
  invDiv.appendChild(addItemDiv);
  parent.appendChild(invDiv);

  // Prices override
  const priceDiv = document.createElement('div');
  priceDiv.className = 'prop-group';
  priceDiv.innerHTML = `<label>Price Overrides</label>`;
  const priceList = document.createElement('div');
  priceList.className = 'prop-list';
  
  const renderPriceList = () => {
    priceList.innerHTML = '';
    Object.keys(obj.prices).forEach(key => {
      const row = document.createElement('div');
      row.className = 'prop-list-item';
      row.innerHTML = `<span style="font-size:10px;flex:1;">${key}</span>`;
      const input = document.createElement('input');
      input.type = 'number';
      input.value = obj.prices[key];
      input.onchange = (e) => { obj.prices[key] = parseInt(e.target.value); saveLevel(); };
      const del = document.createElement('button');
      del.textContent = '×';
      del.onclick = () => { delete obj.prices[key]; renderPriceList(); saveLevel(); };
      row.appendChild(input);
      row.appendChild(del);
      priceList.appendChild(row);
    });
  };
  renderPriceList();

  const addPriceDiv = document.createElement('div');
  addPriceDiv.style.display = 'flex';
  addPriceDiv.style.gap = '5px';
  const priceSelect = document.createElement('select');
  // Add common items to price override list
  ALL_ITEM_NAMES.forEach(i => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i;
    priceSelect.appendChild(opt);
  });
  const addPriceBtn = document.createElement('button');
  addPriceBtn.className = 'add-btn';
  addPriceBtn.textContent = 'Add Price';
  addPriceBtn.onclick = () => {
    obj.prices[priceSelect.value] = 100;
    renderPriceList();
    saveLevel();
  };
  addPriceDiv.appendChild(priceSelect);
  addPriceDiv.appendChild(addPriceBtn);

  priceDiv.appendChild(priceList);
  priceDiv.appendChild(addPriceDiv);
  parent.appendChild(priceDiv);
}

// Master list of all items available for crafting recipe dropdowns
const ALL_ITEM_NAMES = [
  'mining laser', 'medium mining laser', 'large mining laser',
  'light blaster', 'medium blaster', 'large blaster',
  'small energy cell', 'medium energy cell', 'large energy cell',
  'oxygen canister', 'medium oxygen canister', 'large oxygen canister',
  'fuel tank', 'medium fuel tank', 'large fuel tank',
  'health pack', 'medium health pack', 'large health pack',
  'cuprite', 'hematite', 'aurite', 'diamite', 'platinite',
  'copper', 'iron', 'gold', 'diamond', 'platinum',
  'scrap', 'warp key'
];

function createItemSelect(selectedValue) {
  const sel = document.createElement('select');
  sel.style.fontSize = '10px';
  sel.style.flex = '1';
  sel.style.minWidth = '0';
  ALL_ITEM_NAMES.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === selectedValue) opt.selected = true;
    sel.appendChild(opt);
  });
  return sel;
}

function renderCraftingProperties(parent, obj) {
  if (!obj.recipes) obj.recipes = [];

  const recipesDiv = document.createElement('div');
  recipesDiv.className = 'prop-group';
  recipesDiv.innerHTML = `<label>Recipes</label>`;
  const recipesList = document.createElement('div');
  recipesList.className = 'prop-list';
  recipesList.style.maxHeight = '400px';
  
  const renderRecipes = () => {
    recipesList.innerHTML = '';
    obj.recipes.forEach((recipe, idx) => {
      const row = document.createElement('div');
      row.className = 'prop-list-item';
      row.style.flexDirection = 'column';
      row.style.alignItems = 'stretch';
      row.style.padding = '6px';
      row.style.marginBottom = '6px';
      
      // --- Recipe header with delete ---
      const headerDiv = document.createElement('div');
      headerDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;';
      const headerLabel = document.createElement('span');
      headerLabel.style.cssText = 'font-size:11px;font-weight:bold;color:#ccc;';
      headerLabel.textContent = `Recipe ${idx + 1}`;
      const delBtn = document.createElement('button');
      delBtn.textContent = '×';
      delBtn.style.cssText = 'background:#844;font-size:12px;padding:1px 5px;';
      delBtn.onclick = () => { obj.recipes.splice(idx, 1); saveLevel(); renderRecipes(); };
      headerDiv.appendChild(headerLabel);
      headerDiv.appendChild(delBtn);
      row.appendChild(headerDiv);

      // --- Inputs section ---
      const inputsLabel = document.createElement('span');
      inputsLabel.style.cssText = 'font-size:10px;color:#aaa;margin-bottom:2px;';
      inputsLabel.textContent = 'Inputs:';
      row.appendChild(inputsLabel);

      recipe.inputs.forEach((inp, iIdx) => {
        const inputRow = document.createElement('div');
        inputRow.style.cssText = 'display:flex;gap:4px;align-items:center;margin-bottom:3px;';

        const itemSel = createItemSelect(inp.item);
        itemSel.onchange = () => { inp.item = itemSel.value; saveLevel(); };

        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.min = '1';
        qtyInput.value = inp.quantity;
        qtyInput.style.cssText = 'width:40px;font-size:10px;';
        qtyInput.onchange = () => { inp.quantity = Math.max(1, parseInt(qtyInput.value) || 1); saveLevel(); };

        const removeBtn = document.createElement('button');
        removeBtn.textContent = '×';
        removeBtn.style.cssText = 'font-size:10px;padding:1px 4px;background:#a33;';
        removeBtn.onclick = () => { recipe.inputs.splice(iIdx, 1); saveLevel(); renderRecipes(); };

        inputRow.appendChild(itemSel);
        inputRow.appendChild(qtyInput);
        inputRow.appendChild(removeBtn);
        row.appendChild(inputRow);
      });

      // Add input button
      const addInputBtn = document.createElement('button');
      addInputBtn.textContent = '+ Add Input';
      addInputBtn.className = 'add-btn';
      addInputBtn.style.cssText = 'font-size:10px;padding:3px 6px;margin-bottom:6px;';
      addInputBtn.onclick = () => { recipe.inputs.push({ item: 'scrap', quantity: 1 }); saveLevel(); renderRecipes(); };
      row.appendChild(addInputBtn);

      // --- Output section ---
      const outputLabel = document.createElement('span');
      outputLabel.style.cssText = 'font-size:10px;color:#aaa;margin-bottom:2px;';
      outputLabel.textContent = 'Output:';
      row.appendChild(outputLabel);

      const outputRow = document.createElement('div');
      outputRow.style.cssText = 'display:flex;gap:4px;align-items:center;';

      const outSel = createItemSelect(recipe.output.item);
      outSel.onchange = () => { recipe.output.item = outSel.value; saveLevel(); };

      const outQty = document.createElement('input');
      outQty.type = 'number';
      outQty.min = '1';
      outQty.value = recipe.output.quantity;
      outQty.style.cssText = 'width:40px;font-size:10px;';
      outQty.onchange = () => { recipe.output.quantity = Math.max(1, parseInt(outQty.value) || 1); saveLevel(); };

      outputRow.appendChild(outSel);
      outputRow.appendChild(outQty);
      row.appendChild(outputRow);

      recipesList.appendChild(row);
    });
  };
  renderRecipes();

  const addRecipeBtn = document.createElement('button');
  addRecipeBtn.className = 'add-btn';
  addRecipeBtn.textContent = 'Add Recipe';
  addRecipeBtn.onclick = () => {
    obj.recipes.push({
      inputs: [{ item: 'scrap', quantity: 5 }],
      output: { item: 'fuel tank', quantity: 1 }
    });
    saveLevel();
    renderRecipes();
  };

  recipesDiv.appendChild(recipesList);
  recipesDiv.appendChild(addRecipeBtn);
  parent.appendChild(recipesDiv);
}

function renderShipyardProperties(parent, obj) {
  if (!obj.availableShips) obj.availableShips = ['scout']; // Default

  const shipsDiv = document.createElement('div');
  shipsDiv.className = 'prop-group';
  shipsDiv.innerHTML = `<label>Available Ships</label>`;
  
  const shipTypes = ['scout', 'cutter', 'transport'];
  
  shipTypes.forEach(type => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.style.marginBottom = '4px';
    
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = obj.availableShips.includes(type);
    cb.onchange = (e) => {
      if (e.target.checked) {
        if (!obj.availableShips.includes(type)) obj.availableShips.push(type);
      } else {
        obj.availableShips = obj.availableShips.filter(s => s !== type);
      }
      saveLevel();
    };
    
    const label = document.createElement('span');
    label.style.fontSize = '12px';
    label.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    
    row.appendChild(cb);
    row.appendChild(label);
    shipsDiv.appendChild(row);
  });
  
  parent.appendChild(shipsDiv);
}

function renderPirateBaseProperties(parent, obj) {
  obj.tier = normalizePirateBaseTier(obj.tier);
  ensurePirateBaseSpawnDefaults(obj);
  const tierDiv = document.createElement('div');
  tierDiv.className = 'prop-group';
  tierDiv.innerHTML = `<label>Tier</label>`;
  const tierSelect = document.createElement('select');
  for (let i = 1; i <= 5; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `Tier ${i}`;
    opt.selected = obj.tier === i;
    tierSelect.appendChild(opt);
  }
  tierSelect.onchange = (e) => { obj.tier = normalizePirateBaseTier(e.target.value); saveLevel(); render(); };
  tierDiv.appendChild(tierSelect);
  parent.appendChild(tierDiv);

  const archetypeDiv = document.createElement('div');
  archetypeDiv.className = 'prop-group';
  archetypeDiv.innerHTML = '<label>Pirate Archetype</label>';
  const archetypeSelect = document.createElement('select');
  const selectedArchetype = normalizePirateArchetype(obj.pirateArchetype);
  for (const archetype of PIRATE_ARCHETYPE_KEYS) {
    const opt = document.createElement('option');
    opt.value = archetype;
    opt.textContent = PIRATE_ARCHETYPE_LABELS[archetype];
    opt.selected = archetype === selectedArchetype;
    archetypeSelect.appendChild(opt);
  }
  archetypeSelect.onchange = (e) => { obj.pirateArchetype = normalizePirateArchetype(e.target.value); saveLevel(); render(); };
  archetypeDiv.appendChild(archetypeSelect);
  parent.appendChild(archetypeDiv);

  addPropInput(parent, 'Health', obj.health || 150, (v) => { obj.health = parseInt(v); saveLevel(); });
  addPropInput(parent, 'Defense Count', obj.defenseCount || 8, (v) => { obj.defenseCount = parseInt(v); saveLevel(); });
  renderPirateTypePercentagesEditor(parent, 'Defense Type Percentages', obj.defenseTypePercentages, () => { saveLevel(); });
  addPropInput(parent, 'Spawn Rate (s)', obj.spawnRate || 30, (v) => { obj.spawnRate = parseInt(v); saveLevel(); });
  addPropInput(parent, 'Wave Spawn Count', obj.waveSpawnCount || 4, (v) => { obj.waveSpawnCount = Math.max(1, parseInt(v) || 1); saveLevel(); });
  renderPirateTypePercentagesEditor(parent, 'Wave Spawn Type Percentages', obj.waveSpawnTypePercentages, () => { saveLevel(); });
  
  // Drops
  if (!obj.drops) obj.drops = [];
  const dropsDiv = document.createElement('div');
  dropsDiv.className = 'prop-group';
  dropsDiv.innerHTML = `<label>Drops</label>`;
  const dropsList = document.createElement('div');
  dropsList.className = 'prop-list';
  
  const renderDrops = () => {
    dropsList.innerHTML = '';
    obj.drops.forEach((d, idx) => {
      const row = document.createElement('div');
      row.className = 'prop-list-item';
      row.innerHTML = `<span style="font-size:10px;flex:1;">${d.item}</span>`;
      const qInput = document.createElement('input');
      qInput.type = 'number';
      qInput.value = d.quantity || 1;
      qInput.onchange = (e) => { d.quantity = parseInt(e.target.value); saveLevel(); };
      const del = document.createElement('button');
      del.textContent = '×';
      del.onclick = () => { obj.drops.splice(idx, 1); renderDrops(); saveLevel(); };
      row.appendChild(qInput);
      row.appendChild(del);
      dropsList.appendChild(row);
    });
  };
  renderDrops();

  const addDropDiv = document.createElement('div');
  addDropDiv.style.display = 'flex';
  addDropDiv.style.gap = '5px';
  const dropSelect = document.createElement('select');
  ALL_ITEM_NAMES.forEach(i => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i;
    dropSelect.appendChild(opt);
  });
  const addDropBtn = document.createElement('button');
  addDropBtn.className = 'add-btn';
  addDropBtn.textContent = 'Add Drop';
  addDropBtn.onclick = () => {
    obj.drops.push({ item: dropSelect.value, quantity: 1 });
    renderDrops();
    saveLevel();
  };
  addDropDiv.appendChild(dropSelect);
  addDropDiv.appendChild(addDropBtn);

  dropsDiv.appendChild(dropsList);
  dropsDiv.appendChild(addDropDiv);
  parent.appendChild(dropsDiv);
}

function renderWarpGateProperties(parent, obj) {
  addPropInput(parent, 'Warp Cost', obj.warpCost || 3000, (v) => { obj.warpCost = parseInt(v); saveLevel(); });
  
  const destDiv = document.createElement('div');
  destDiv.className = 'prop-group';
  destDiv.innerHTML = `<label>Destination Level</label>`;
  const destInput = document.createElement('input');
  destInput.type = 'text'; // or number
  destInput.value = obj.warpDestination || 'level2';
  destInput.onchange = (e) => { obj.warpDestination = e.target.value; saveLevel(); };
  destDiv.appendChild(destInput);
  parent.appendChild(destDiv);
}

const RAW_ORE_TYPES = ['cuprite', 'hematite', 'aurite', 'diamite', 'platinite'];
const REFINED_ORE_NAMES = { cuprite: 'Copper', hematite: 'Iron', aurite: 'Gold', diamite: 'Diamond', platinite: 'Platinum' };

function renderRefineryProperties(parent, obj) {
  if (!obj.acceptedOres) obj.acceptedOres = ['cuprite'];

  const oreDiv = document.createElement('div');
  oreDiv.className = 'prop-group';
  oreDiv.innerHTML = `<label>Accepted Ores (raw -> refined at 2:1)</label>`;

  RAW_ORE_TYPES.forEach(ore => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = obj.acceptedOres.includes(ore);
    cb.onchange = () => {
      if (cb.checked) {
        if (!obj.acceptedOres.includes(ore)) obj.acceptedOres.push(ore);
      } else {
        obj.acceptedOres = obj.acceptedOres.filter(o => o !== ore);
      }
      saveLevel();
    };

    const label = document.createElement('span');
    label.style.fontSize = '12px';
    label.textContent = `${ore.charAt(0).toUpperCase() + ore.slice(1)} → ${REFINED_ORE_NAMES[ore]}`;

    row.appendChild(cb);
    row.appendChild(label);
    oreDiv.appendChild(row);
  });

  parent.appendChild(oreDiv);
}

function handlePlaceObject(world) {
  if (state.tool.selected.startsWith('asteroid_')) {
    const oreType = state.tool.selected.replace('asteroid_', '');
    state.level.asteroids.push({ 
      x: world.x, 
      y: world.y, 
      radius: state.tool.asteroidSize, 
      oreType 
    });
  } else if (STRUCTURE_STYLES[state.tool.selected]) {
    // Initialize per-structure defaults so export/import round-trips reliably,
    // especially for multiple warp gates (each gate needs its own destination/cost).
    const type = state.tool.selected;
    const st = { x: world.x, y: world.y, type };
    if (type === 'warpgate') {
      st.warpCost = 3000;
      st.warpDestination = 'level2';
    }
    if (type === 'crafting') {
      st.recipes = [];
    }
    if (type === 'shipyard') {
      st.availableShips = ['scout', 'cutter', 'transport'];
    }
    if (type === 'refinery') {
      st.acceptedOres = ['cuprite'];
    }
    if (type === 'piratebase') {
      st.tier = normalizePirateBaseTier(state.tool.piratebaseTier);
      st.pirateArchetype = 'standard';
      ensurePirateBaseSpawnDefaults(st);
    }
    state.level.structures.push(st);
  }
  saveLevel();
}

function handleRemoveObject(world) {
  // Check asteroids
  for (let i = state.level.asteroids.length - 1; i >= 0; i--) {
    const a = state.level.asteroids[i];
    const dx = a.x - world.x;
    const dy = a.y - world.y;
    if (Math.sqrt(dx * dx + dy * dy) < a.radius) {
      state.level.asteroids.splice(i, 1);
      saveLevel();
      return;
    }
  }
  
  // Check structures
  for (let i = state.level.structures.length - 1; i >= 0; i--) {
    const st = state.level.structures[i];
    const scale = getStructureDrawScale(st.type, st.tier);
    const structHalfW = CONSTANTS.STRUCTURE_SIZE * scale;
    const structHalfH = CONSTANTS.STRUCTURE_SIZE * 0.6 * scale;
    const dx = st.x - world.x;
    const dy = st.y - world.y;
    if (Math.abs(dx) < structHalfW && Math.abs(dy) < structHalfH) {
      state.level.structures.splice(i, 1);
      saveLevel();
      return;
    }
  }
}

function handleMouseDown(e) {
  e.preventDefault();
  canvas.focus();
  
  const rect = canvas.getBoundingClientRect();
  state.mouse.x = e.clientX - rect.left;
  state.mouse.y = e.clientY - rect.top;
  
  if (e.button === 0) { // Left click
    const world = screenToWorld(state.mouse.x, state.mouse.y);

    // If in paste mode, stamp down the clipboard contents
    if (state.pasteMode && state.clipboard) {
      for (const a of state.clipboard.asteroids) {
        const clone = JSON.parse(JSON.stringify(a));
        clone.x = world.x + a.rx;
        clone.y = world.y + a.ry;
        delete clone.rx;
        delete clone.ry;
        state.level.asteroids.push(clone);
      }
      for (const s of state.clipboard.structures) {
        const clone = JSON.parse(JSON.stringify(s));
        clone.x = world.x + s.rx;
        clone.y = world.y + s.ry;
        delete clone.rx;
        delete clone.ry;
        state.level.structures.push(clone);
      }
      saveLevel();
      state.pasteMode = false;
      render();
      return;
    }

    // If in copy-select mode, start the drag rectangle
    if (state.copySelectMode) {
      state.copySelect = { startX: world.x, startY: world.y };
      state.copySelectScreen = { sx: state.mouse.x, sy: state.mouse.y };
      render();
      return;
    }

    if (state.tool.selected === 'select') {
      handleSelectObject(world);
    } else if (state.tool.selected === 'move') {
      handleSelectObject(world);
      if (state.selectedObject) {
        state.mouse.isMoving = true;
        state.mouse.moveStartWorld = { x: world.x, y: world.y };
        state.mouse.moveOriginalX = state.selectedObject.x;
        state.mouse.moveOriginalY = state.selectedObject.y;
      }
    } else if (state.tool.selected === 'eraser') {
      state.mouse.isErasing = true;
      eraseBrushAt(world);
    } else {
      handlePlaceObject(world);
    }
    render();
  } else if (e.button === 2) { // Right click
    // Cancel copy/paste modes on right click
    if (state.copySelectMode || state.pasteMode) {
      state.copySelectMode = false;
      state.copySelect = null;
      state.copySelectScreen = null;
      state.pasteMode = false;
      render();
      return;
    }
    const world = screenToWorld(state.mouse.x, state.mouse.y);
    handleRemoveObject(world);
    render();
  } else if (e.button === 1) { // Middle click
    state.mouse.isPanning = true;
    state.mouse.panStart.x = state.mouse.x;
    state.mouse.panStart.y = state.mouse.y;
    state.mouse.panCamStart.x = state.camera.x;
    state.mouse.panCamStart.y = state.camera.y;
  }
}

function handleWheel(e) {
  e.preventDefault();
  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  state.camera.zoom = Math.max(CONSTANTS.ZOOM_MIN, Math.min(CONSTANTS.ZOOM_MAX, state.camera.zoom * zoomFactor));
  render();
}

function updateAsteroidSize(newSize) {
  state.tool.asteroidSize = Math.max(CONSTANTS.ASTEROID_SIZE_MIN, Math.min(CONSTANTS.ASTEROID_SIZE_MAX, newSize));
  document.getElementById('asteroid-size').value = state.tool.asteroidSize;
  document.getElementById('size-display').textContent = state.tool.asteroidSize;
  render();
}

// --- Initialization ---

// Canvas events
canvas.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('mousedown', handleMouseDown);
canvas.addEventListener('mouseup', (e) => {
  if (e.button === 1) state.mouse.isPanning = false;
  if (e.button === 0) {
    if (state.mouse.isMoving) {
      state.mouse.isMoving = false;
      saveLevel();
      updatePropertiesPanel();
    }
    if (state.mouse.isErasing) {
      state.mouse.isErasing = false;
      flushEraseSave(true);
    }
  }
  if (e.button === 0 && state.copySelect && state.copySelectMode) {
    // Finalize copy selection rectangle
    const world = screenToWorld(state.mouse.x, state.mouse.y);
    const x1 = Math.min(state.copySelect.startX, world.x);
    const y1 = Math.min(state.copySelect.startY, world.y);
    const x2 = Math.max(state.copySelect.startX, world.x);
    const y2 = Math.max(state.copySelect.startY, world.y);

    // Don't capture if rect is too tiny (accidental click)
    if (Math.abs(x2 - x1) < 5 && Math.abs(y2 - y1) < 5) {
      state.copySelect = null;
      state.copySelectScreen = null;
      render();
      return;
    }

    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;
    const capturedAsteroids = [];
    const capturedStructures = [];

    for (const a of state.level.asteroids) {
      if (a.x >= x1 && a.x <= x2 && a.y >= y1 && a.y <= y2) {
        const clone = JSON.parse(JSON.stringify(a));
        clone.rx = a.x - centerX;
        clone.ry = a.y - centerY;
        capturedAsteroids.push(clone);
      }
    }
    for (const s of state.level.structures) {
      if (s.x >= x1 && s.x <= x2 && s.y >= y1 && s.y <= y2) {
        const clone = JSON.parse(JSON.stringify(s));
        clone.rx = s.x - centerX;
        clone.ry = s.y - centerY;
        capturedStructures.push(clone);
      }
    }

    const total = capturedAsteroids.length + capturedStructures.length;
    if (total > 0) {
      state.clipboard = { asteroids: capturedAsteroids, structures: capturedStructures };
    }

    state.copySelect = null;
    state.copySelectScreen = null;
    state.copySelectMode = false;
    render();
  }
});
canvas.addEventListener('mouseenter', () => { state.mouse.inCanvas = true; render(); });
canvas.addEventListener('mouseleave', () => {
  state.mouse.inCanvas = false;
  state.mouse.isPanning = false;
  if (state.mouse.isMoving) {
    state.mouse.isMoving = false;
    saveLevel();
    updatePropertiesPanel();
  }
  if (state.mouse.isErasing) {
    state.mouse.isErasing = false;
    flushEraseSave(true);
  }
  render();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', handleWheel);

// Keyboard events
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    updateAsteroidSize(state.tool.asteroidSize + CONSTANTS.ASTEROID_SIZE_STEP);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    updateAsteroidSize(state.tool.asteroidSize - CONSTANTS.ASTEROID_SIZE_STEP);
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    // Enter copy-select mode (drag rectangle)
    e.preventDefault();
    state.pasteMode = false;
    state.copySelectMode = true;
    state.copySelect = null;
    state.copySelectScreen = null;
    render();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
    // Enter paste mode if clipboard has content
    if (state.clipboard) {
      e.preventDefault();
      state.copySelectMode = false;
      state.copySelect = null;
      state.copySelectScreen = null;
      state.pasteMode = true;
      render();
    }
  } else if (e.key === 'Escape') {
    // Cancel copy-select or paste mode
    if (state.copySelectMode || state.pasteMode) {
      e.preventDefault();
      state.copySelectMode = false;
      state.copySelect = null;
      state.copySelectScreen = null;
      state.pasteMode = false;
      render();
    }
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    // If the user is typing in a form control, don't treat Backspace/Delete as "delete selected object"
    const ae = document.activeElement;
    const tag = ae && ae.tagName ? ae.tagName.toUpperCase() : '';
    const isTyping =
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      (ae && ae.isContentEditable);
    if (isTyping) return;

    // Delete selected object
    if (state.selectedObject) {
      e.preventDefault();
      const sel = state.selectedObject;
      // Check if it's an asteroid
      const astIdx = state.level.asteroids.indexOf(sel);
      if (astIdx !== -1) {
        state.level.asteroids.splice(astIdx, 1);
      } else {
        const stIdx = state.level.structures.indexOf(sel);
        if (stIdx !== -1) {
          state.level.structures.splice(stIdx, 1);
        }
      }
      state.selectedObject = null;
      document.getElementById('properties-panel').style.display = 'none';
      saveLevel();
      render();
    }
  }
});

// UI Controls
document.getElementById('asteroid-size').addEventListener('input', (e) => {
  updateAsteroidSize(parseInt(e.target.value));
});

const pirateTierSelect = document.getElementById('piratebase-tier-select');
if (pirateTierSelect) {
  pirateTierSelect.value = String(state.tool.piratebaseTier);
  pirateTierSelect.addEventListener('change', (e) => {
    state.tool.piratebaseTier = normalizePirateBaseTier(e.target.value);
    pirateTierSelect.value = String(state.tool.piratebaseTier);
    render();
  });
}

document.querySelectorAll('.palette-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.tool.selected = btn.dataset.tool;
    if (state.tool.selected === 'piratebase' && pirateTierSelect) {
      state.tool.piratebaseTier = normalizePirateBaseTier(pirateTierSelect.value);
    }
    document.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    render();
  });
});

document.getElementById('apply-size').addEventListener('click', () => {
  state.level.width = parseInt(document.getElementById('level-width').value) || CONSTANTS.DEFAULT_LEVEL_SIZE;
  state.level.height = parseInt(document.getElementById('level-height').value) || CONSTANTS.DEFAULT_LEVEL_SIZE;
  saveLevel();
  render();
});

document.getElementById('clear-all').addEventListener('click', () => {
  if (confirm('Clear all asteroids and structures?')) {
    state.level.asteroids = [];
    state.level.structures = [];
    saveLevel();
    render();
  }
});

document.getElementById('export-level').addEventListener('click', () => {
  const levelData = {
    width: state.level.width,
    height: state.level.height,
    seed: state.level.seed,
    asteroids: state.level.asteroids,
    structures: state.level.structures.map(s => {
      // Ensure we save all properties, not just x/y/type
      const out = { ...s };
      // Normalize warp gate defaults so exported JSON always contains them per gate.
      if (out.type === 'warpgate') {
        if (out.warpCost == null || Number.isNaN(out.warpCost)) out.warpCost = 3000;
        if (!out.warpDestination) out.warpDestination = 'level2';
      }
      return out;
    }),
    spawnSettings: state.level.spawnSettings || undefined,
  };
  const json = JSON.stringify(levelData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const shopCount = levelData.structures.filter(s => s.type === 'shop').length;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  a.download = `level-${shopCount}shops-${levelData.structures.length}structures-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  // Revoke async to avoid races in some browsers.
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
});

document.getElementById('import-level').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

document.getElementById('copy-btn').addEventListener('click', () => {
  state.pasteMode = false;
  state.copySelectMode = true;
  state.copySelect = null;
  state.copySelectScreen = null;
  render();
});

document.getElementById('paste-btn').addEventListener('click', () => {
  if (state.clipboard) {
    state.copySelectMode = false;
    state.copySelect = null;
    state.copySelectScreen = null;
    state.pasteMode = true;
    render();
  }
});

document.getElementById('remove-overlaps-btn').addEventListener('click', () => {
  const asts = state.level.asteroids;
  if (asts.length < 2) return;

  // Build a set of indices to remove: for every pair where one asteroid is
  // fully inside the other, randomly pick one to keep and mark the other.
  const remove = new Set();
  for (let i = 0; i < asts.length; i++) {
    if (remove.has(i)) continue;
    for (let j = i + 1; j < asts.length; j++) {
      if (remove.has(j)) continue;
      const dx = asts[i].x - asts[j].x;
      const dy = asts[i].y - asts[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ri = asts[i].radius;
      const rj = asts[j].radius;
      // Check if i is fully inside j  (dist + ri <= rj)
      // or if j is fully inside i      (dist + rj <= ri)
      const iInsideJ = dist + ri <= rj;
      const jInsideI = dist + rj <= ri;
      if (iInsideJ || jInsideI) {
        // Randomly pick which one to remove
        if (Math.random() < 0.5) {
          remove.add(i);
        } else {
          remove.add(j);
        }
      }
    }
  }

  if (remove.size === 0) {
    alert('No fully overlapping asteroids found.');
    return;
  }

  state.level.asteroids = asts.filter((_, idx) => !remove.has(idx));
  saveLevel();
  render();
  alert(`Removed ${remove.size} fully overlapping asteroid(s).`);
});

document.getElementById('import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const levelData = JSON.parse(ev.target.result);
      state.level.width = levelData.width || CONSTANTS.DEFAULT_LEVEL_SIZE;
      state.level.height = levelData.height || CONSTANTS.DEFAULT_LEVEL_SIZE;
      state.level.seed = levelData.seed != null ? (levelData.seed >>> 0) : CONSTANTS.DEFAULT_SEED;
      state.level.asteroids = levelData.asteroids || [];
      state.level.structures = (levelData.structures || []).map(normalizeStructure);
      state.level.spawnSettings = ensureSpawnSettingsDefaults(levelData.spawnSettings || {
        initialDelay: 120,
        waveIntervalMin: 60,
        waveIntervalMax: 100,
        waveSizeMin: 2,
        waveSizeMax: 4,
        pirateTypePercentages: { ...DEFAULT_PIRATE_TYPE_PERCENTAGES },
        tiers: []
      });
      
      document.getElementById('level-width').value = state.level.width;
      document.getElementById('level-height').value = state.level.height;
      
      saveLevel();
      render();
    } catch (err) {
      alert('Invalid level file');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('level-settings-btn').addEventListener('click', () => {
  state.selectedObject = null; // Deselect object
  render(); // Clear highlight
  
  const panel = document.getElementById('properties-panel');
  const content = document.getElementById('properties-content');
  
  panel.style.display = 'flex';
  content.innerHTML = '';
  
  // Render Spawn Settings
  state.level.spawnSettings = ensureSpawnSettingsDefaults(state.level.spawnSettings);
  const s = state.level.spawnSettings;
  
  const title = document.createElement('h4');
  title.textContent = 'Global Spawn Settings';
  title.style.color = '#fff';
  title.style.marginBottom = '10px';
  content.appendChild(title);

  // Initial Phase (Base Settings)
  const baseTitle = document.createElement('h5');
  baseTitle.textContent = 'Initial Phase (Start)';
  baseTitle.style.color = '#aaa';
  baseTitle.style.margin = '10px 0 5px 0';
  content.appendChild(baseTitle);

  addPropInput(content, 'Initial Delay (s)', s.initialDelay, (v) => { s.initialDelay = parseInt(v); saveLevel(); });
  addPropInput(content, 'Min Wave Interval (s)', s.waveIntervalMin, (v) => { s.waveIntervalMin = parseInt(v); saveLevel(); });
  addPropInput(content, 'Max Wave Interval (s)', s.waveIntervalMax, (v) => { s.waveIntervalMax = parseInt(v); saveLevel(); });
  addPropInput(content, 'Min Wave Size', s.waveSizeMin, (v) => { s.waveSizeMin = parseInt(v); saveLevel(); });
  addPropInput(content, 'Max Wave Size', s.waveSizeMax, (v) => { s.waveSizeMax = parseInt(v); saveLevel(); });
  renderPirateTypePercentagesEditor(content, 'Wave Pirate Type Percentages', s.pirateTypePercentages, () => { saveLevel(); });

  // Tiers
  const tiersTitle = document.createElement('h5');
  tiersTitle.textContent = 'Progressive Tiers';
  tiersTitle.style.color = '#aaa';
  tiersTitle.style.margin = '15px 0 5px 0';
  content.appendChild(tiersTitle);

  const tiersContainer = document.createElement('div');
  content.appendChild(tiersContainer);

  function renderTiers() {
    tiersContainer.innerHTML = '';
    s.tiers.sort((a, b) => a.startTime - b.startTime);
    
    s.tiers.forEach((tier, index) => {
      const tierBox = document.createElement('div');
      tierBox.className = 'spawn-tier';
      
      const tierHeader = document.createElement('h4');
      tierHeader.innerHTML = `<span>Phase ${index + 1}</span>`;
      
      const delBtn = document.createElement('button');
      delBtn.className = 'delete-tier-btn';
      delBtn.textContent = 'Delete';
      delBtn.onclick = () => {
        s.tiers.splice(index, 1);
        saveLevel();
        renderTiers();
      };
      tierHeader.appendChild(delBtn);
      tierBox.appendChild(tierHeader);

      addPropInput(tierBox, 'Start Time (s)', tier.startTime, (v) => { tier.startTime = parseInt(v); saveLevel(); });
      addPropInput(tierBox, 'Min Interval (s)', tier.waveIntervalMin, (v) => { tier.waveIntervalMin = parseInt(v); saveLevel(); });
      addPropInput(tierBox, 'Max Interval (s)', tier.waveIntervalMax, (v) => { tier.waveIntervalMax = parseInt(v); saveLevel(); });
      addPropInput(tierBox, 'Min Size', tier.waveSizeMin, (v) => { tier.waveSizeMin = parseInt(v); saveLevel(); });
      addPropInput(tierBox, 'Max Size', tier.waveSizeMax, (v) => { tier.waveSizeMax = parseInt(v); saveLevel(); });
      tier.pirateTypePercentages = normalizePirateTypePercentages(tier.pirateTypePercentages);
      renderPirateTypePercentagesEditor(tierBox, 'Wave Pirate Type Percentages', tier.pirateTypePercentages, () => { saveLevel(); });

      tiersContainer.appendChild(tierBox);
    });
  }
  renderTiers();

  const addTierBtn = document.createElement('button');
  addTierBtn.className = 'add-btn';
  addTierBtn.textContent = '+ Add Phase';
  addTierBtn.style.width = '100%';
  addTierBtn.onclick = () => {
    s.tiers.push({
      startTime: 300, // Default 5 mins
      waveIntervalMin: 45,
      waveIntervalMax: 80,
      waveSizeMin: 3,
      waveSizeMax: 6,
      pirateTypePercentages: { ...DEFAULT_PIRATE_TYPE_PERCENTAGES }
    });
    saveLevel();
    renderTiers();
  };
  content.appendChild(addTierBtn);
});

document.getElementById('close-properties').addEventListener('click', () => {
  document.getElementById('properties-panel').style.display = 'none';
  state.selectedObject = null;
  render();
});

// Window events
window.addEventListener('resize', resizeCanvas);
window.addEventListener('load', resizeCanvas);
setTimeout(resizeCanvas, 100);

// Start
loadLevel();
resizeCanvas();
