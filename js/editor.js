const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');

// Mouse tracking (must be defined before first render)
let mouseX = 0;
let mouseY = 0;
let mouseInCanvas = false;

// Level data
let levelWidth = 5000;
let levelHeight = 5000;
let asteroids = [];

// Camera
let camX = 0;
let camY = 0;
let zoom = 0.15;

// Panning state
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panCamStartX = 0;
let panCamStartY = 0;

// Current tool
let currentAsteroidSize = 40;

// Resize canvas to fill container
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

window.addEventListener('resize', resizeCanvas);
window.addEventListener('load', resizeCanvas);
// Delay initial resize to ensure layout is ready
setTimeout(resizeCanvas, 100);
resizeCanvas();

// Convert screen to world coordinates
function screenToWorld(sx, sy) {
  return {
    x: (sx - canvas.width / 2) / zoom + camX,
    y: (sy - canvas.height / 2) / zoom + camY
  };
}

// Convert world to screen coordinates
function worldToScreen(wx, wy) {
  return {
    x: (wx - camX) * zoom + canvas.width / 2,
    y: (wy - camY) * zoom + canvas.height / 2
  };
}

// Render
function render() {
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw level bounds
  const topLeft = worldToScreen(-levelWidth / 2, -levelHeight / 2);
  const bottomRight = worldToScreen(levelWidth / 2, levelHeight / 2);
  ctx.strokeStyle = '#335';
  ctx.lineWidth = 2;
  ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);

  // Draw grid
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  const gridSize = 500;
  const startX = Math.floor(-levelWidth / 2 / gridSize) * gridSize;
  const startY = Math.floor(-levelHeight / 2 / gridSize) * gridSize;
  for (let gx = startX; gx <= levelWidth / 2; gx += gridSize) {
    const s1 = worldToScreen(gx, -levelHeight / 2);
    const s2 = worldToScreen(gx, levelHeight / 2);
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();
  }
  for (let gy = startY; gy <= levelHeight / 2; gy += gridSize) {
    const s1 = worldToScreen(-levelWidth / 2, gy);
    const s2 = worldToScreen(levelWidth / 2, gy);
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();
  }

  // Draw origin crosshair
  const origin = worldToScreen(0, 0);
  ctx.strokeStyle = '#444';
  ctx.beginPath();
  ctx.moveTo(origin.x - 15, origin.y);
  ctx.lineTo(origin.x + 15, origin.y);
  ctx.moveTo(origin.x, origin.y - 15);
  ctx.lineTo(origin.x, origin.y + 15);
  ctx.stroke();

  // Draw asteroids
  for (const ast of asteroids) {
    const s = worldToScreen(ast.x, ast.y);
    const r = ast.radius * zoom;
    ctx.fillStyle = '#665544';
    ctx.strokeStyle = '#998877';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Draw preview asteroid at mouse (if in bounds)
  if (mouseInCanvas) {
    const world = screenToWorld(mouseX, mouseY);
    const s = worldToScreen(world.x, world.y);
    const r = currentAsteroidSize * zoom;
    ctx.fillStyle = 'rgba(102, 85, 68, 0.5)';
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Info
  ctx.fillStyle = '#666';
  ctx.font = '12px Arial';
  ctx.fillText(`Asteroids: ${asteroids.length} | Zoom: ${(zoom * 100).toFixed(0)}% | Level: ${levelWidth}x${levelHeight}`, 10, 20);
}

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;

  if (isPanning) {
    camX = panCamStartX - (mouseX - panStartX) / zoom;
    camY = panCamStartY - (mouseY - panStartY) / zoom;
  }

  render();
});

canvas.addEventListener('mouseenter', () => { mouseInCanvas = true; render(); });
canvas.addEventListener('mouseleave', () => { mouseInCanvas = false; isPanning = false; render(); });

// Place/remove asteroids
canvas.addEventListener('mousedown', (e) => {
  e.preventDefault();
  canvas.focus();
  
  // Update mouse position from event
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;

  if (e.button === 0) {
    // Left click - place asteroid
    const world = screenToWorld(mouseX, mouseY);
    asteroids.push({ x: world.x, y: world.y, radius: currentAsteroidSize });
    render();
  } else if (e.button === 2) {
    // Right click - remove asteroid under cursor
    const world = screenToWorld(mouseX, mouseY);
    for (let i = asteroids.length - 1; i >= 0; i--) {
      const a = asteroids[i];
      const dx = a.x - world.x;
      const dy = a.y - world.y;
      if (Math.sqrt(dx * dx + dy * dy) < a.radius) {
        asteroids.splice(i, 1);
        break;
      }
    }
    render();
  } else if (e.button === 1) {
    // Middle click - pan
    e.preventDefault();
    isPanning = true;
    panStartX = mouseX;
    panStartY = mouseY;
    panCamStartX = camX;
    panCamStartY = camY;
  }
});

canvas.addEventListener('mouseup', (e) => {
  if (e.button === 1) isPanning = false;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Zoom
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  zoom = Math.max(0.02, Math.min(2, zoom * zoomFactor));
  render();
});

// Toolbar controls
document.getElementById('asteroid-size').addEventListener('input', (e) => {
  currentAsteroidSize = parseInt(e.target.value);
  document.getElementById('size-display').textContent = currentAsteroidSize;
  render();
});

document.getElementById('apply-size').addEventListener('click', () => {
  levelWidth = parseInt(document.getElementById('level-width').value) || 5000;
  levelHeight = parseInt(document.getElementById('level-height').value) || 5000;
  render();
});

document.getElementById('clear-all').addEventListener('click', () => {
  if (confirm('Clear all asteroids?')) {
    asteroids = [];
    render();
  }
});

document.getElementById('export-level').addEventListener('click', () => {
  const level = {
    width: levelWidth,
    height: levelHeight,
    asteroids: asteroids
  };
  const json = JSON.stringify(level, null, 2);
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
      const level = JSON.parse(ev.target.result);
      levelWidth = level.width || 5000;
      levelHeight = level.height || 5000;
      asteroids = level.asteroids || [];
      document.getElementById('level-width').value = levelWidth;
      document.getElementById('level-height').value = levelHeight;
      render();
    } catch (err) {
      alert('Invalid level file');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// Initial render
render();
