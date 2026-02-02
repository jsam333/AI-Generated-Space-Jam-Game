const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const WIDTH = 1200;
const HEIGHT = 900;

const ACCEL = 200;
const FRICTION = 0.15;
const MAX_SPEED = 250;
const BRAKE_FRICTION = 1.5;
const BULLET_SPEED = 1000;
const FIRE_COOLDOWN = 0.03;

canvas.width = WIDTH;
canvas.height = HEIGHT;

// Ship (world coordinates, camera follows)
const ship = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0
};

// Mouse state
let mouseX = WIDTH / 2;
let mouseY = HEIGHT / 2;
let rightMouseDown = false;
let leftMouseDown = false;
let ctrlBrake = false;

// Bullets
const bullets = [];
let fireCooldown = 0;

// Asteroids (loaded from level)
let asteroids = [];
let structures = [];
let levelWidth = 10000;
let levelHeight = 10000;

// Starfield
const NUM_STARS = 2400;
const stars = [];

function initStars() {
  const spread = 5000;
  for (let i = 0; i < NUM_STARS; i++) {
    stars.push({
      x: (Math.random() - 0.5) * 2 * spread,
      y: (Math.random() - 0.5) * 2 * spread,
      size: Math.random() * 2 + 0.5,
      brightness: 0.3 + Math.random() * 0.7
    });
  }
}

function normalize(x, y) {
  const len = Math.sqrt(x * x + y * y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

function worldToScreen(wx, wy) {
  return {
    x: wx - ship.x + WIDTH / 2,
    y: wy - ship.y + HEIGHT / 2
  };
}

const SHIP_SIZE = 10;

const SHOT_SPREAD = 8;

function fireBullet() {
  const dx = mouseX - WIDTH / 2;
  const dy = mouseY - HEIGHT / 2;
  const dir = normalize(dx, dy);
  if (dir.x === 0 && dir.y === 0) return;
  const perp = { x: -dir.y, y: dir.x };
  const offsets = [-SHOT_SPREAD, 0, SHOT_SPREAD];
  for (const offset of offsets) {
    bullets.push({
      x: ship.x + dir.x * SHIP_SIZE + perp.x * offset,
      y: ship.y + dir.y * SHIP_SIZE + perp.y * offset,
      vx: dir.x * BULLET_SPEED + ship.vx,
      vy: dir.y * BULLET_SPEED + ship.vy,
      lifespan: 2
    });
  }
}

function drawShip() {
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const dx = mouseX - cx;
  const dy = mouseY - cy;
  const dir = normalize(dx, dy);
  const angle = Math.atan2(dir.y, dir.x);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(SHIP_SIZE, 0);
  ctx.lineTo(-SHIP_SIZE * 0.7, SHIP_SIZE * 0.6);
  ctx.lineTo(-SHIP_SIZE * 0.4, 0);
  ctx.lineTo(-SHIP_SIZE * 0.7, -SHIP_SIZE * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function update(dt) {
  // Ship movement (right-click)
  if (rightMouseDown) {
    const dx = mouseX - WIDTH / 2;
    const dy = mouseY - HEIGHT / 2;
    const dir = normalize(dx, dy);
    ship.vx += dir.x * ACCEL * dt;
    ship.vy += dir.y * ACCEL * dt;
  }

  // Friction (low when coasting, high when braking with Ctrl)
  const friction = ctrlBrake ? BRAKE_FRICTION : FRICTION;
  ship.vx *= Math.max(0, 1 - friction * dt);
  ship.vy *= Math.max(0, 1 - friction * dt);

  // Max speed cap
  const speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
  if (speed > MAX_SPEED) {
    const scale = MAX_SPEED / speed;
    ship.vx *= scale;
    ship.vy *= scale;
  }

  // Position
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;

  // Fire cooldown and continuous fire
  fireCooldown -= dt;
  if (leftMouseDown && fireCooldown <= 0) {
    fireBullet();
    fireCooldown = FIRE_COOLDOWN;
  }

  // Bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.lifespan -= dt;
    if (b.lifespan <= 0) bullets.splice(i, 1);
  }
}

function render() {
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Starfield (fillRect is much faster than arc for small shapes)
  for (const star of stars) {
    const sx = star.x - ship.x + WIDTH / 2;
    const sy = star.y - ship.y + HEIGHT / 2;
    if (sx < -10 || sx > WIDTH + 10 || sy < -10 || sy > HEIGHT + 10) continue;
    const s = Math.max(1, star.size);
    ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness})`;
    ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
  }

  // Asteroids
  for (const ast of asteroids) {
    const { x, y } = worldToScreen(ast.x, ast.y);
    const r = ast.radius;
    if (x + r < 0 || x - r > WIDTH || y + r < 0 || y - r > HEIGHT) continue;
    ctx.fillStyle = '#665544';
    ctx.strokeStyle = '#998877';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Structures (render as circles)
  const STRUCTURE_SIZE = 40;
  const STRUCTURE_STYLES = { shop: '#446688', shipyard: '#664466', refinery: '#666644', fueling: '#446644', warpgate: '#6644aa', piratebase: '#884422' };
  for (const st of structures) {
    const { x, y } = worldToScreen(st.x, st.y);
    const r = STRUCTURE_SIZE;
    if (x + r < 0 || x - r > WIDTH || y + r < 0 || y - r > HEIGHT) continue;
    ctx.fillStyle = STRUCTURE_STYLES[st.type] || '#446688';
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = st.type === 'warpgate' ? 'W' : (st.type === 'piratebase' ? 'P' : (st.type ? st.type.charAt(0).toUpperCase() : '?'));
    ctx.fillText(label, x, y);
  }

  // Level bounds
  const boundLeft = worldToScreen(-levelWidth / 2, 0).x;
  const boundRight = worldToScreen(levelWidth / 2, 0).x;
  const boundTop = worldToScreen(0, -levelHeight / 2).y;
  const boundBottom = worldToScreen(0, levelHeight / 2).y;
  ctx.strokeStyle = '#335';
  ctx.lineWidth = 2;
  ctx.strokeRect(boundLeft, boundTop, boundRight - boundLeft, boundBottom - boundTop);

  // Bullets (fillRect faster than arc)
  for (const b of bullets) {
    const { x, y } = worldToScreen(b.x, b.y);
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }

  // Ship
  drawShip();
}

// Input
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  mouseX = (e.clientX - rect.left) * scaleX;
  mouseY = (e.clientY - rect.top) * scaleY;
});

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) leftMouseDown = true;
  else if (e.button === 2) rightMouseDown = true;
});

canvas.addEventListener('mouseup', (e) => {
  if (e.button === 0) leftMouseDown = false;
  if (e.button === 2) rightMouseDown = false;
});

canvas.addEventListener('mouseleave', () => {
  rightMouseDown = false;
  leftMouseDown = false;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.key === 'Control') ctrlBrake = true;
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'Control') ctrlBrake = false;
});

// Load level from JSON file
function loadLevel(levelData) {
  levelWidth = levelData.width || 10000;
  levelHeight = levelData.height || 10000;
  asteroids = levelData.asteroids || [];
  structures = levelData.structures || [];
  // Regenerate stars to match level size
  stars.length = 0;
  const spread = Math.max(levelWidth, levelHeight) / 2;
  for (let i = 0; i < NUM_STARS; i++) {
    stars.push({
      x: (Math.random() - 0.5) * 2 * spread,
      y: (Math.random() - 0.5) * 2 * spread,
      size: Math.random() * 2 + 0.5,
      brightness: 0.3 + Math.random() * 0.7
    });
  }
}

// File input for loading levels
const levelInput = document.createElement('input');
levelInput.type = 'file';
levelInput.accept = '.json';
levelInput.style.display = 'none';
document.body.appendChild(levelInput);

levelInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const level = JSON.parse(ev.target.result);
      loadLevel(level);
    } catch (err) {
      console.error('Invalid level file');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// Press L to load a level file
window.addEventListener('keydown', (e) => {
  if (e.key === 'l' || e.key === 'L') {
    levelInput.click();
  }
});

// Game loop
let lastTime = performance.now();
initStars();

// Auto-load level1.json
fetch('levels/level1.json')
  .then(res => res.json())
  .then(level => loadLevel(level))
  .catch(err => console.log('No level1.json found, using default level'));

function gameLoop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  update(dt);
  render();

  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
