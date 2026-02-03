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
  diamite: { fill: '#A9A9A9', stroke: '#C0C0C0' },
  platinite: { fill: '#D3D3D3', stroke: '#E5E4E2' }
};

const STRUCTURE_STYLES = {
  shop: { fill: '#446688', stroke: '#6699bb' },
  shipyard: { fill: '#664466', stroke: '#886688' },
  refinery: { fill: '#666644', stroke: '#888866' },
  fueling: { fill: '#446644', stroke: '#668866' },
  warpgate: { fill: '#6644aa', stroke: '#8866cc' },
  piratebase: { fill: '#884422', stroke: '#aa6644' }
};

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
    panStart: { x: 0, y: 0 },
    panCamStart: { x: 0, y: 0 }
  },
  tool: {
    selected: 'asteroid_cuprite',
    asteroidSize: 40
  }
};

// --- Core Functions ---

function saveLevel() {
  const levelData = {
    width: state.level.width,
    height: state.level.height,
    seed: state.level.seed,
    asteroids: state.level.asteroids,
    structures: state.level.structures
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
    state.level.structures = levelData.structures || [];
    
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

function drawStructure(ctx, x, y, type, isPreview = false) {
  const s = worldToScreen(x, y);
  const r = CONSTANTS.STRUCTURE_SIZE * state.camera.zoom;
  const style = STRUCTURE_STYLES[type] || STRUCTURE_STYLES.shop;
  
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
  if (type === 'piratebase') label = 'P';
  
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
    drawStructure(ctx, st.x, st.y, st.type);
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
  
  if (state.tool.selected.startsWith('asteroid_')) {
    const type = state.tool.selected.replace('asteroid_', '');
    drawAsteroid(ctx, world.x, world.y, state.tool.asteroidSize, type, true);
  } else if (STRUCTURE_STYLES[state.tool.selected]) {
    drawStructure(ctx, world.x, world.y, state.tool.selected, true);
  }
}

function drawUI() {
  ctx.fillStyle = COLORS.TEXT;
  ctx.font = '12px Arial';
  const infoText = `Asteroids: ${state.level.asteroids.length} | Structures: ${state.level.structures.length} | Zoom: ${(state.camera.zoom * 100).toFixed(0)}%`;
  ctx.fillText(infoText, 10, 20);
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

  render();
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
    state.level.structures.push({ 
      x: world.x, 
      y: world.y, 
      type: state.tool.selected 
    });
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
  const structHalfW = CONSTANTS.STRUCTURE_SIZE;
  const structHalfH = CONSTANTS.STRUCTURE_SIZE * 0.6;
  for (let i = state.level.structures.length - 1; i >= 0; i--) {
    const st = state.level.structures[i];
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
    handlePlaceObject(world);
    render();
  } else if (e.button === 2) { // Right click
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
canvas.addEventListener('mouseup', (e) => { if (e.button === 1) state.mouse.isPanning = false; });
canvas.addEventListener('mouseenter', () => { state.mouse.inCanvas = true; render(); });
canvas.addEventListener('mouseleave', () => { state.mouse.inCanvas = false; state.mouse.isPanning = false; render(); });
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
  }
});

// UI Controls
document.getElementById('asteroid-size').addEventListener('input', (e) => {
  updateAsteroidSize(parseInt(e.target.value));
});

document.querySelectorAll('.palette-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.tool.selected = btn.dataset.tool;
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
    structures: state.level.structures
  };
  const json = JSON.stringify(levelData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'level.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('import-level').addEventListener('click', () => {
  document.getElementById('import-file').click();
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
      state.level.structures = levelData.structures || [];
      
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

// Window events
window.addEventListener('resize', resizeCanvas);
window.addEventListener('load', resizeCanvas);
setTimeout(resizeCanvas, 100);

// Start
loadLevel();
resizeCanvas();
