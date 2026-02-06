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
  diamite: { fill: '#787878', stroke: '#909090' },
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
  },
  selectedObject: null
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
    state.level.structures = levelData.structures || [];
    state.level.spawnSettings = levelData.spawnSettings || {
      initialDelay: 120,
      waveIntervalMin: 60,
      waveIntervalMax: 100,
      waveSizeMin: 2,
      waveSizeMax: 4
    };
    
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

  // Draw selection highlight
  if (state.selectedObject) {
    const sel = state.selectedObject;
    const s = worldToScreen(sel.x, sel.y);
    let r = 20;
    if (sel.radius) r = sel.radius * state.camera.zoom + 10;
    else r = CONSTANTS.STRUCTURE_SIZE * state.camera.zoom + 10;
    
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
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

function handleSelectObject(world) {
  let bestDist = Infinity;
  let bestObj = null;

  // Check structures first (priority)
  const structHalfW = CONSTANTS.STRUCTURE_SIZE;
  const structHalfH = CONSTANTS.STRUCTURE_SIZE * 0.6;
  for (const st of state.level.structures) {
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
    } else if (obj.type === 'piratebase') {
      renderPirateBaseProperties(content, obj);
    } else if (obj.type === 'warpgate') {
      renderWarpGateProperties(content, obj);
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
  ['small energy cell', 'medium energy cell', 'fuel tank', 'oxygen canister', 'light blaster', 'medium mining laser'].forEach(i => {
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
    else if (name.includes('fuel')) { newItem.fuel = 10; newItem.maxFuel = 10; }
    else if (name.includes('oxygen')) { newItem.oxygen = 10; newItem.maxOxygen = 10; }
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
  ['small energy cell', 'medium energy cell', 'fuel tank', 'oxygen canister', 'light blaster', 'medium mining laser', 'cuprite', 'hematite', 'aurite', 'diamite', 'platinite', 'scrap', 'warp key'].forEach(i => {
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

function renderPirateBaseProperties(parent, obj) {
  addPropInput(parent, 'Health', obj.health || 150, (v) => { obj.health = parseInt(v); saveLevel(); });
  addPropInput(parent, 'Defense Count', obj.defenseCount || 8, (v) => { obj.defenseCount = parseInt(v); saveLevel(); });
  addPropInput(parent, 'Spawn Rate (s)', obj.spawnRate || 30, (v) => { obj.spawnRate = parseInt(v); saveLevel(); });
  
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
  ['scrap', 'warp key', 'cuprite', 'hematite', 'aurite', 'diamite', 'platinite', 'fuel tank'].forEach(i => {
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
    if (state.tool.selected === 'select') {
      handleSelectObject(world);
    } else {
      handlePlaceObject(world);
    }
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
      state.level.spawnSettings = levelData.spawnSettings || {
        initialDelay: 120,
        waveIntervalMin: 60,
        waveIntervalMax: 100,
        waveSizeMin: 2,
        waveSizeMax: 4
      };
      
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
  if (!state.level.spawnSettings) {
    state.level.spawnSettings = {
      initialDelay: 120,
      waveIntervalMin: 60,
      waveIntervalMax: 100,
      waveSizeMin: 2,
      waveSizeMax: 4,
      tiers: []
    };
  }
  const s = state.level.spawnSettings;
  if (!s.tiers) s.tiers = [];
  
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
      waveSizeMax: 6
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
