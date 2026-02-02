const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const WIDTH = 1200;
const HEIGHT = 900;

const ACCEL = 150;
const FRICTION = 0.15;
const MAX_SPEED = 175;
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

// Player stats
const player = {
  health: 50.0,
  maxHealth: 50.0,
  fuel: 25.0,
  maxFuel: 25.0,
  oxygen: 30.0,
  maxOxygen: 30.0,
  credits: 0
};
const OXYGEN_DEPLETION_RATE = 1 / 10; // 1 per 10 seconds

// Inventory hotbar (9 slots, each can hold { item, quantity?, energy?, maxEnergy? } or null)
const hotbar = [
  { item: 'mining laser', heat: 0, overheated: false }, // heat 0-1, overheated locks until cooled to 0
  { item: 'energy cell', energy: 10, maxEnergy: 10 },
  { item: 'energy cell', energy: 10, maxEnergy: 10 },
  null, null, null, null, null, null
];
const LASER_HEAT_RATE = 1;    // per second when firing (full in 1 sec)
const LASER_COOL_RATE = 1 / 3; // per second when not firing (empty in 3 sec)
let selectedSlot = 0;

function getFirstChargedCell() {
  for (let i = 0; i < hotbar.length; i++) {
    const cell = hotbar[i];
    if (cell && cell.item === 'energy cell' && cell.energy != null && cell.energy > 0) return cell;
  }
  return null;
}
const WEAPON_ENERGY_DRAIN = 1; // per second when firing

// Mouse state
let mouseX = WIDTH / 2;
let mouseY = HEIGHT / 2;
let rightMouseDown = false;
let leftMouseDown = false;
let ctrlBrake = false;

let gamePaused = false;
let warpMenuOpen = false;
let shopMenuOpen = false;

// Bullets
const bullets = [];
let fireCooldown = 0;

// Asteroids (loaded from level)
let asteroids = [];
let structures = [];
let levelWidth = 10000;
let levelHeight = 10000;

// Floating items in space (dropped/jettisoned)
const floatingItems = [];

// Spark particles for laser impact
const particles = [];
let sparkCarry = 0; // fractional sparks accumulator (FPS independent)

function spawnSparks(x, y, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 150;
    const life = 0.2 + Math.random() * 0.3; // 0.2-0.5 seconds
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size: 1 + Math.random() * 2
    });
  }
}

// Drag state for hotbar
let draggingSlot = null;
let draggingItem = null;

const MAX_ORE_STACK = 5;
const ORE_ITEMS = ['cuprite']; // items that stack up to MAX_ORE_STACK

function getMaxStack(itemName) {
  return ORE_ITEMS.includes(itemName) ? MAX_ORE_STACK : 1;
}

// Add item to inventory (find matching stack or first empty slot)
function addToInventory(itemName, quantity) {
  const maxStack = getMaxStack(itemName);

  while (quantity > 0) {
    // First try to stack with existing item (up to maxStack)
    let added = false;
    for (let i = 0; i < hotbar.length && quantity > 0; i++) {
      if (hotbar[i] && hotbar[i].item === itemName && hotbar[i].quantity != null && hotbar[i].quantity < maxStack) {
        const space = maxStack - hotbar[i].quantity;
        const add = Math.min(quantity, space);
        hotbar[i].quantity += add;
        quantity -= add;
        added = true;
      }
    }
    if (quantity <= 0) return true;
    // Otherwise find first empty slot
    for (let i = 0; i < hotbar.length; i++) {
      if (!hotbar[i]) {
        const add = Math.min(quantity, maxStack);
        hotbar[i] = { item: itemName, quantity: add };
        quantity -= add;
        added = true;
        break;
      }
    }
    if (!added) return false; // Inventory full, quantity left is lost
  }
  return true;
}

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

// Laser raycast: find closest asteroid hit by a ray from (ox, oy) in direction (dx, dy)
function laserHitAsteroid(ox, oy, dx, dy, maxLen) {
  let closest = null;
  let closestDist = maxLen;
  
  for (const ast of asteroids) {
    // Vector from ray origin to asteroid center
    const fx = ast.x - ox;
    const fy = ast.y - oy;
    
    // Project asteroid center onto ray
    const t = fx * dx + fy * dy;
    if (t < 0) continue; // Behind ray origin
    
    // Closest point on ray to asteroid center
    const cx = ox + dx * t;
    const cy = oy + dy * t;
    
    // Distance from closest point to asteroid center
    const distSq = (ast.x - cx) * (ast.x - cx) + (ast.y - cy) * (ast.y - cy);
    const radiusSq = ast.radius * ast.radius;
    
    if (distSq < radiusSq) {
      // Ray hits asteroid - calculate entry distance
      const offset = Math.sqrt(radiusSq - distSq);
      const hitDist = t - offset;
      
      if (hitDist > 0 && hitDist < closestDist) {
        closest = ast;
        closestDist = hitDist;
      }
    }
  }
  
  return closest ? { asteroid: closest, distance: closestDist } : null;
}

const SHIP_SIZE = 10;
const SHIP_COLLISION_RADIUS = 8;

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
  // Ship movement (right-click) - only if there's a direction to move
  if (rightMouseDown && player.fuel > 0) {
    const dx = mouseX - WIDTH / 2;
    const dy = mouseY - HEIGHT / 2;
    const dir = normalize(dx, dy);
    // Only apply thrust and consume fuel if there's a direction
    if (dir.x !== 0 || dir.y !== 0) {
      ship.vx += dir.x * ACCEL * dt;
      ship.vy += dir.y * ACCEL * dt;
      player.fuel = Math.max(0, player.fuel - 1 * dt);
    }
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

  // Ship–asteroid collision: bounce and damage from perpendicular impact speed
  const BOUNCE_RESTITUTION = 0.3;
  const MAX_COLLISION_DAMAGE = 20;
  const DAMAGE_PER_SPEED = 0.1; // 200 units/sec impact => 20 damage
  for (const ast of asteroids) {
    const dx = ship.x - ast.x;
    const dy = ship.y - ast.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = SHIP_COLLISION_RADIUS + ast.radius;
    if (dist < minDist && dist > 0) {
      const nx = dx / dist;
      const ny = dy / dist;
      // Push ship out of overlap
      const overlap = minDist - dist;
      ship.x += nx * overlap;
      ship.y += ny * overlap;
      // Perpendicular impact speed (into asteroid is negative)
      const normalSpeed = ship.vx * nx + ship.vy * ny;
      if (normalSpeed < 0) {
        // Ship is moving into asteroid
        const impactSpeed = -normalSpeed; // positive value
        // Bounce: cancel inward velocity and add small outward push
        const bounce = impactSpeed * (1 + BOUNCE_RESTITUTION);
        ship.vx += nx * bounce;
        ship.vy += ny * bounce;
        // Damage from impact speed, max 20
        const damage = Math.min(MAX_COLLISION_DAMAGE, impactSpeed * DAMAGE_PER_SPEED);
        player.health = Math.max(0, player.health - damage);
      }
    }
  }

  // Ship–warp gate and shop collision (same logic as asteroids, radius 40)
  const STRUCTURE_SIZE_COLL = 40;
  for (const st of structures) {
    if (st.type !== 'warpgate' && st.type !== 'shop') continue;
    const dx = ship.x - st.x;
    const dy = ship.y - st.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = SHIP_COLLISION_RADIUS + STRUCTURE_SIZE_COLL;
    if (dist < minDist && dist > 0) {
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;
      ship.x += nx * overlap;
      ship.y += ny * overlap;
      const normalSpeed = ship.vx * nx + ship.vy * ny;
      if (normalSpeed < 0) {
        const impactSpeed = -normalSpeed;
        const bounce = impactSpeed * (1 + BOUNCE_RESTITUTION);
        ship.vx += nx * bounce;
        ship.vy += ny * bounce;
        const damage = Math.min(MAX_COLLISION_DAMAGE, impactSpeed * DAMAGE_PER_SPEED);
        player.health = Math.max(0, player.health - damage);
      }
    }
  }

  // Oxygen depletion
  player.oxygen = Math.max(0, player.oxygen - OXYGEN_DEPLETION_RATE * dt);
  
  // No oxygen: drain health at 1 per second
  if (player.oxygen <= 0) {
    player.health = Math.max(0, player.health - 1 * dt);
  }

  // Fire only when mining laser (slot 0) is selected; drain energy; heat blocks fire when full
  const hasEnergy = getFirstChargedCell() != null;
  const miningLaser = hotbar[0] && hotbar[0].item === 'mining laser' ? hotbar[0] : null;
  const miningLaserSelected = selectedSlot === 0 && miningLaser;

  if (miningLaser && miningLaser.heat != null) {
    // Set overheated when heat reaches 1
    if (miningLaser.heat >= 1) {
      miningLaser.overheated = true;
    }
    // Clear overheated only when fully cooled
    if (miningLaser.heat <= 0) {
      miningLaser.overheated = false;
    }

    const canFire = !miningLaser.overheated;
    if (miningLaserSelected && leftMouseDown && hasEnergy && canFire) {
      miningLaser.heat = Math.min(1, miningLaser.heat + LASER_HEAT_RATE * dt);
      const cell = getFirstChargedCell();
      if (cell) cell.energy = Math.max(0, cell.energy - WEAPON_ENERGY_DRAIN * dt);
      
      // Laser damage to asteroids: 5 DPS
      const dx = mouseX - WIDTH / 2;
      const dy = mouseY - HEIGHT / 2;
      const dir = normalize(dx, dy);
      if (dir.x !== 0 || dir.y !== 0) {
        const hit = laserHitAsteroid(ship.x, ship.y, dir.x, dir.y, 1500);
        if (hit) {
          hit.asteroid.health -= 5 * dt;
          // Spawn sparks at impact point
          const hitX = ship.x + dir.x * hit.distance;
          const hitY = ship.y + dir.y * hit.distance;
          // ~60 sparks per second, frame-rate independent
          sparkCarry += 60 * dt;
          const n = Math.floor(sparkCarry);
          if (n > 0) {
            spawnSparks(hitX, hitY, n);
            sparkCarry -= n;
          }
        }
      }
    } else {
      miningLaser.heat = Math.max(0, miningLaser.heat - LASER_COOL_RATE * dt);
    }
  }

  // Bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.lifespan -= dt;
    if (b.lifespan <= 0) bullets.splice(i, 1);
  }

  // Particles (sparks)
  const PARTICLE_DRAG = 6; // per-second velocity decay
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const damp = Math.exp(-PARTICLE_DRAG * dt);
    p.vx *= damp;
    p.vy *= damp;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // Check for destroyed asteroids and drop ore
  for (let i = asteroids.length - 1; i >= 0; i--) {
    if (asteroids[i].health <= 0) {
      const ast = asteroids[i];
      const oreCount = Math.floor(ast.radius / 10);
      if (oreCount > 0) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 30 + Math.random() * 50;
        floatingItems.push({
          x: ast.x,
          y: ast.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          item: 'cuprite',
          quantity: oreCount
        });
      }
      asteroids.splice(i, 1);
    }
  }

  // Floating items: magnet + movement + drag
  const MAGNET_RADIUS = 80;
  const MAGNET_STRENGTH = 250; // acceleration (units/sec^2) near ship
  const FLOAT_DRAG = 2.0; // velocity damping per second
  const FLOAT_STOP_SPEED = 0.05;
  for (const item of floatingItems) {
    if (item.vx == null) item.vx = 0;
    if (item.vy == null) item.vy = 0;

    // Magnet attraction (accumulates smoothly; no "speed < 1 => zero" bug)
    const dx = ship.x - item.x;
    const dy = ship.y - item.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0 && dist < MAGNET_RADIUS && dist > SHIP_COLLISION_RADIUS) {
      const inv = 1 / dist;
      const pull = MAGNET_STRENGTH * (1 - dist / MAGNET_RADIUS);
      item.vx += dx * inv * pull * dt;
      item.vy += dy * inv * pull * dt;
    }

    // Integrate movement
    item.x += item.vx * dt;
    item.y += item.vy * dt;

    // Collision with asteroids and warp gates: push out so items don't overlap
    const FLOAT_ITEM_RADIUS = 10;
    const STRUCTURE_SIZE_COLL = 40;
    for (const ast of asteroids) {
      const dx = item.x - ast.x;
      const dy = item.y - ast.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = ast.radius + FLOAT_ITEM_RADIUS;
      if (dist < minDist && dist > 0) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;
        item.x += nx * overlap;
        item.y += ny * overlap;
      }
    }
    for (const st of structures) {
      if (st.type !== 'warpgate' && st.type !== 'shop') continue;
      const dx = item.x - st.x;
      const dy = item.y - st.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = STRUCTURE_SIZE_COLL + FLOAT_ITEM_RADIUS;
      if (dist < minDist && dist > 0) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;
        item.x += nx * overlap;
        item.y += ny * overlap;
      }
    }

    // Apply drag (exponential decay)
    const damp = Math.max(0, 1 - FLOAT_DRAG * dt);
    item.vx *= damp;
    item.vy *= damp;

    // Stop tiny drift
    const sp = Math.sqrt(item.vx * item.vx + item.vy * item.vy);
    if (sp < FLOAT_STOP_SPEED) {
      item.vx = 0;
      item.vy = 0;
    }
  }

  // Pickup floating items only when within ship collision radius
  for (let i = floatingItems.length - 1; i >= 0; i--) {
    const item = floatingItems[i];
    const dx = item.x - ship.x;
    const dy = item.y - ship.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < SHIP_COLLISION_RADIUS) {
      // Energy cells restore their charge - find empty slot
      if (item.energy != null) {
        let added = false;
        for (let j = 0; j < hotbar.length; j++) {
          if (!hotbar[j]) {
            hotbar[j] = { item: item.item, energy: item.energy, maxEnergy: item.maxEnergy };
            added = true;
            break;
          }
        }
        if (added) floatingItems.splice(i, 1);
      } else if (item.item === 'mining laser' && item.heat != null) {
        // Mining laser: restore heat/overheated
        let added = false;
        for (let j = 0; j < hotbar.length; j++) {
          if (!hotbar[j]) {
            hotbar[j] = { item: item.item, heat: item.heat, overheated: !!item.overheated };
            added = true;
            break;
          }
        }
        if (added) floatingItems.splice(i, 1);
      } else if (addToInventory(item.item, item.quantity)) {
        floatingItems.splice(i, 1);
      }
    }
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

  // Floating items in space
  for (const item of floatingItems) {
    const { x, y } = worldToScreen(item.x, item.y);
    if (x < -20 || x > WIDTH + 20 || y < -20 || y > HEIGHT + 20) continue;
    const icon = item.item === 'cuprite' ? 'C' : (item.item === 'energy cell' ? 'E' : (item.item === 'mining laser' ? 'L' : item.item.charAt(0).toUpperCase()));
    // Draw small glowing circle - energy cells green, mining laser orange, ore default
    ctx.fillStyle = item.energy != null ? '#448844' : (item.heat != null ? '#884422' : '#aa8844');
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = item.energy != null ? '#66cc66' : (item.heat != null ? '#cc6633' : '#ccaa66');
    ctx.lineWidth = 2;
    ctx.stroke();
    // Item icon
    ctx.fillStyle = '#fff';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, x, y);
    // Quantity if > 1
    if (item.quantity > 1) {
      ctx.fillStyle = '#ffcc00';
      ctx.font = '8px Arial';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(item.quantity, x + 12, y + 12);
    }
  }

  // Structures (render as circles)
  const STRUCTURE_SIZE = 40;
  const WARP_GATE_DASHED_EXTRA = 80;
  const SHOP_DASHED_EXTRA = 80;
  const STRUCTURE_STYLES = { shop: '#446688', shipyard: '#664466', refinery: '#666644', fueling: '#446644', warpgate: '#6644aa', piratebase: '#884422' };
  for (const st of structures) {
    const { x, y } = worldToScreen(st.x, st.y);
    const r = STRUCTURE_SIZE;
    const cullR = st.type === 'warpgate' ? STRUCTURE_SIZE + WARP_GATE_DASHED_EXTRA : (st.type === 'shop' ? STRUCTURE_SIZE + SHOP_DASHED_EXTRA : r);
    if (x + cullR < 0 || x - cullR > WIDTH || y + cullR < 0 || y - cullR > HEIGHT) continue;
    ctx.fillStyle = STRUCTURE_STYLES[st.type] || '#446688';
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (st.type === 'warpgate') {
      ctx.stroke();
      const dashedR = STRUCTURE_SIZE + WARP_GATE_DASHED_EXTRA;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.arc(x, y, dashedR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (st.type === 'shop') {
      ctx.stroke();
      const dashedR = STRUCTURE_SIZE + SHOP_DASHED_EXTRA;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.arc(x, y, dashedR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.stroke();
    }
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

  // Spark particles
  for (const p of particles) {
    const { x, y } = worldToScreen(p.x, p.y);
    if (x < -10 || x > WIDTH + 10 || y < -10 || y > HEIGHT + 10) continue;
    const alpha = p.life / p.maxLife;
    const r = 255;
    const g = Math.round(150 + 105 * alpha); // yellow to orange
    const b = Math.round(50 * alpha);
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size);
  }

  // Ship
  drawShip();

  // Mining laser (orange-red line) - only when selected, firing, has energy, and not overheated
  const hasEnergy = getFirstChargedCell() != null;
  const miningLaser = hotbar[0] && hotbar[0].item === 'mining laser' ? hotbar[0] : null;
  const miningLaserSelected = selectedSlot === 0 && miningLaser;
  const canFire = miningLaser && !miningLaser.overheated;
  if (miningLaserSelected && leftMouseDown && hasEnergy && canFire) {
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    const dx = mouseX - cx;
    const dy = mouseY - cy;
    const dir = normalize(dx, dy);
    let laserLength = 1500;
    
    // Check for asteroid hit and shorten laser (stop 10 units before surface)
    if (dir.x !== 0 || dir.y !== 0) {
      const hit = laserHitAsteroid(ship.x, ship.y, dir.x, dir.y, 1500);
      if (hit) {
        laserLength = Math.max(0, hit.distance - 10);
      }
    }
    
    const x1 = cx + dir.x * SHIP_SIZE;
    const y1 = cy + dir.y * SHIP_SIZE;
    const x2 = x1 + dir.x * laserLength;
    const y2 = y1 + dir.y * laserLength;
    // Interpolate color based on heat: orange when cool, deep red when hot
    const heat = miningLaser.heat || 0;
    const outerR = Math.round(255 - heat * 55); // 255 -> 200
    const outerG = Math.round(102 - heat * 102); // 102 -> 0
    const outerB = 0;
    const innerR = Math.round(255 - heat * 55); // 255 -> 200
    const innerG = Math.round(136 - heat * 136); // 136 -> 0
    const innerB = Math.round(68 - heat * 68); // 68 -> 0
    ctx.strokeStyle = `rgb(${outerR},${outerG},${outerB})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = `rgb(${innerR},${innerG},${innerB})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Player stats meters (bottom right) - bar height in pixels = max value in units
  const meterWidth = 20;
  const meterSpacing = 30;
  const meterY = HEIGHT - 20;

  function drawMeter(x, value, max, color, label) {
    const barHeight = max * 2; // 2 pixels per unit
    const fillH = (value / max) * barHeight;
    // Background
    ctx.fillStyle = '#222';
    ctx.fillRect(x - meterWidth / 2, meterY - barHeight, meterWidth, barHeight);
    // Fill
    ctx.fillStyle = color;
    ctx.fillRect(x - meterWidth / 2, meterY - fillH, meterWidth, fillH);
    // Border
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - meterWidth / 2, meterY - barHeight, meterWidth, barHeight);
    // Label
    ctx.fillStyle = '#aaa';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x, meterY + 4);
    // Value
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'bottom';
    ctx.fillText(value.toFixed(1), x, meterY - barHeight - 2);
  }

  const rightmost = WIDTH - 30;
  drawMeter(rightmost - 60, player.oxygen, player.maxOxygen, '#44aaff', 'O2');
  drawMeter(rightmost - 30, player.fuel, player.maxFuel, '#ffaa44', 'Fuel');
  drawMeter(rightmost, player.health, player.maxHealth, '#ff4444', 'HP');

  // Hotbar (9 slots, bottom center)
  const slotSize = 40;
  const slotSpacing = 0;
  const hotbarWidth = 9 * slotSize;
  const hotbarX = (WIDTH - hotbarWidth) / 2;
  const hotbarY = HEIGHT - slotSize;

  for (let i = 0; i < 9; i++) {
    const sx = hotbarX + i * (slotSize + slotSpacing);
    // Slot background
    ctx.fillStyle = i === selectedSlot ? '#444' : '#222';
    ctx.fillRect(sx, hotbarY, slotSize, slotSize);
    // Slot border
    ctx.strokeStyle = i === selectedSlot ? '#fff' : '#555';
    ctx.lineWidth = i === selectedSlot ? 2 : 1;
    ctx.strokeRect(sx, hotbarY, slotSize, slotSize);
    // Slot number
    ctx.fillStyle = '#666';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(i + 1, sx + 2, hotbarY + 2);
    // Item (if any)
    if (hotbar[i]) {
      const it = hotbar[i];
      const icon = it.item === 'mining laser' ? 'L' : (it.item === 'energy cell' ? 'E' : it.item.charAt(0).toUpperCase());
      ctx.fillStyle = '#fff';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, sx + slotSize / 2, hotbarY + slotSize / 2 - 4);
      // Mining laser heat bar (red, right side)
      if (it.item === 'mining laser' && it.heat != null) {
        const barWidth = 5;
        const barX = sx + slotSize - barWidth - 2;
        const barY = hotbarY + 2;
        const barHeight = slotSize - 4;
        ctx.fillStyle = '#222';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle = '#cc2222';
        ctx.fillRect(barX, barY + barHeight * (1 - it.heat), barWidth, barHeight * it.heat);
      }
      // Quantity or energy
      if (it.energy != null) {
        ctx.fillStyle = '#aaffaa';
        ctx.font = '9px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(it.energy.toFixed(1), sx + slotSize / 2, hotbarY + slotSize / 2 + 2);
        // Vertical charge bar on right side of slot
        const barWidth = 5;
        const barX = sx + slotSize - barWidth - 2;
        const barY = hotbarY + 2;
        const barHeight = slotSize - 4;
        ctx.fillStyle = '#222';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        const charge = it.maxEnergy > 0 ? it.energy / it.maxEnergy : 0;
        ctx.fillStyle = charge > 0.5 ? '#66ff66' : (charge > 0.25 ? '#ffff66' : '#ff6666');
        ctx.fillRect(barX, barY + barHeight * (1 - charge), barWidth, barHeight * charge);
      } else if (it.quantity > 1) {
        ctx.fillStyle = '#aaa';
        ctx.font = '10px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(it.quantity, sx + slotSize - 2, hotbarY + slotSize - 2);
      }
    }
  }

  // Credits counter (to the right of hotbar, touching)
  const creditsX = hotbarX + hotbarWidth;
  ctx.fillStyle = '#222';
  ctx.fillRect(creditsX, hotbarY, 80, slotSize);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(creditsX, hotbarY, 80, slotSize);
  ctx.fillStyle = '#ffcc00';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Credits', creditsX + 40, hotbarY + 4);
  ctx.fillStyle = '#fff';
  ctx.font = '14px Arial';
  ctx.textBaseline = 'bottom';
  ctx.fillText(player.credits, creditsX + 40, hotbarY + slotSize - 4);

  // Dragged item following cursor
  if (draggingItem) {
    const icon = draggingItem.item === 'mining laser' ? 'L' : (draggingItem.item === 'energy cell' ? 'E' : draggingItem.item.charAt(0).toUpperCase());
    ctx.fillStyle = 'rgba(40, 40, 40, 0.8)';
    ctx.fillRect(mouseX - 20, mouseY - 20, 40, 40);
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 2;
    ctx.strokeRect(mouseX - 20, mouseY - 20, 40, 40);
    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, mouseX, mouseY);
  }
}

// Hotbar slot detection helper
function getHotbarSlotAt(mx, my) {
  const slotSize = 40;
  const hotbarWidth = 9 * slotSize;
  const hotbarX = (WIDTH - hotbarWidth) / 2;
  const hotbarY = HEIGHT - slotSize;
  if (my >= hotbarY && my < hotbarY + slotSize) {
    const relX = mx - hotbarX;
    if (relX >= 0 && relX < hotbarWidth) {
      return Math.floor(relX / slotSize);
    }
  }
  return -1;
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
  if (e.button === 0) {
    // Check if clicking on hotbar slot with item to start dragging
    const slot = getHotbarSlotAt(mouseX, mouseY);
    if (slot >= 0 && hotbar[slot]) {
      draggingSlot = slot;
      draggingItem = hotbar[slot];
    } else {
      leftMouseDown = true;
    }
  } else if (e.button === 2) {
    rightMouseDown = true;
  }
});

canvas.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    // Handle drag end
    if (draggingSlot !== null && draggingItem) {
      const targetSlot = getHotbarSlotAt(mouseX, mouseY);
      if (targetSlot >= 0 && targetSlot !== draggingSlot) {
        // Swap items between slots
        const temp = hotbar[targetSlot];
        hotbar[targetSlot] = hotbar[draggingSlot];
        hotbar[draggingSlot] = temp;
      } else if (targetSlot < 0) {
        // Jettison item in front of ship
        const dx = mouseX - WIDTH / 2;
        const dy = mouseY - HEIGHT / 2;
        const dir = normalize(dx, dy);
        if (dir.x !== 0 || dir.y !== 0) {
          const jettSpeed = 240;
          const floatItem = {
            x: ship.x + dir.x * 20,
            y: ship.y + dir.y * 20,
            vx: dir.x * jettSpeed + ship.vx * 0.3,
            vy: dir.y * jettSpeed + ship.vy * 0.3,
            item: draggingItem.item,
            quantity: draggingItem.quantity || 1
          };
          // Preserve energy cell charge
          if (draggingItem.energy != null) {
            floatItem.energy = draggingItem.energy;
            floatItem.maxEnergy = draggingItem.maxEnergy;
          }
          // Preserve mining laser heat/overheated
          if (draggingItem.heat != null) {
            floatItem.heat = draggingItem.heat;
            floatItem.overheated = !!draggingItem.overheated;
          }
          floatingItems.push(floatItem);
          hotbar[draggingSlot] = null;
        }
      }
      draggingSlot = null;
      draggingItem = null;
    }
    leftMouseDown = false;
  }
  if (e.button === 2) rightMouseDown = false;
});

canvas.addEventListener('mouseleave', () => {
  rightMouseDown = false;
  leftMouseDown = false;
  // Cancel drag on leave
  draggingSlot = null;
  draggingItem = null;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.deltaY > 0) {
    selectedSlot = (selectedSlot + 1) % 9;
  } else {
    selectedSlot = (selectedSlot - 1 + 9) % 9;
  }
});

function isShipInWarpGate() {
  const STRUCTURE_SIZE = 40;
  const WARP_GATE_DASHED_EXTRA = 80;
  const interactRadius = STRUCTURE_SIZE + WARP_GATE_DASHED_EXTRA;
  for (const st of structures) {
    if (st.type !== 'warpgate') continue;
    const dx = ship.x - st.x;
    const dy = ship.y - st.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < interactRadius) return true;
  }
  return false;
}

function isShipInShop() {
  const STRUCTURE_SIZE = 40;
  const SHOP_DASHED_EXTRA = 80;
  const interactRadius = STRUCTURE_SIZE + SHOP_DASHED_EXTRA;
  for (const st of structures) {
    if (st.type !== 'shop') continue;
    const dx = ship.x - st.x;
    const dy = ship.y - st.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < interactRadius) return true;
  }
  return false;
}

function hasCuprite() {
  for (let i = 0; i < hotbar.length; i++) {
    if (hotbar[i] && hotbar[i].item === 'cuprite' && hotbar[i].quantity > 0) return true;
  }
  return false;
}

function hasEmptyHotbarSlot() {
  for (let i = 0; i < hotbar.length; i++) {
    if (!hotbar[i]) return true;
  }
  return false;
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Control') ctrlBrake = true;
  // Hotbar slot selection (1-9)
  if (e.key >= '1' && e.key <= '9') {
    selectedSlot = parseInt(e.key) - 1;
  }
  // Key in E position (KeyE): open warp gate or shop menu when inside (warp has priority)
  if (e.code === 'KeyE') {
    if (!warpMenuOpen && !shopMenuOpen && !gamePaused && isShipInWarpGate()) {
      e.preventDefault();
      gamePaused = true;
      warpMenuOpen = true;
      const overlay = document.getElementById('warp-menu-overlay');
      if (overlay) overlay.style.display = 'flex';
      const payBtn = document.getElementById('warp-pay-btn');
      if (payBtn) payBtn.disabled = player.credits < 100;
    } else if (!warpMenuOpen && !shopMenuOpen && !gamePaused && isShipInShop()) {
      e.preventDefault();
      gamePaused = true;
      shopMenuOpen = true;
      const overlay = document.getElementById('shop-menu-overlay');
      if (overlay) overlay.style.display = 'flex';
      const buyBtn = document.getElementById('shop-buy-btn');
      if (buyBtn) buyBtn.disabled = player.credits < 3 || !hasEmptyHotbarSlot();
      const sell1Btn = document.getElementById('shop-sell1-btn');
      if (sell1Btn) sell1Btn.disabled = !hasCuprite();
    }
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'Control') ctrlBrake = false;
});

// Load level from JSON file
function loadLevel(levelData) {
  levelWidth = levelData.width || 10000;
  levelHeight = levelData.height || 10000;
  asteroids = (levelData.asteroids || []).map(ast => ({
    ...ast,
    health: ast.health ?? ast.radius // health defaults to radius if not specified
  }));
  structures = levelData.structures || [];
  floatingItems.length = 0; // Clear floating items on level load
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

function closeWarpMenu() {
  warpMenuOpen = false;
  gamePaused = warpMenuOpen || shopMenuOpen;
  const overlay = document.getElementById('warp-menu-overlay');
  if (overlay) overlay.style.display = 'none';
}

function closeShopMenu() {
  shopMenuOpen = false;
  gamePaused = warpMenuOpen || shopMenuOpen;
  const overlay = document.getElementById('shop-menu-overlay');
  if (overlay) overlay.style.display = 'none';
}

const warpMenuOverlay = document.getElementById('warp-menu-overlay');
const warpPayBtn = document.getElementById('warp-pay-btn');
const warpCancelBtn = document.getElementById('warp-cancel-btn');
if (warpCancelBtn) {
  warpCancelBtn.addEventListener('click', () => closeWarpMenu());
}
if (warpPayBtn) {
  warpPayBtn.addEventListener('click', () => {
    if (player.credits >= 100) {
      player.credits -= 100;
      closeWarpMenu();
    }
  });
}

const shopCloseBtn = document.getElementById('shop-close-btn');
const shopSell1Btn = document.getElementById('shop-sell1-btn');
const shopBuyBtn = document.getElementById('shop-buy-btn');
if (shopCloseBtn) {
  shopCloseBtn.addEventListener('click', () => closeShopMenu());
}
if (shopSell1Btn) {
  shopSell1Btn.addEventListener('click', () => {
    for (let j = 0; j < hotbar.length; j++) {
      if (hotbar[j] && hotbar[j].item === 'cuprite' && hotbar[j].quantity > 0) {
        hotbar[j].quantity--;
        if (hotbar[j].quantity <= 0) hotbar[j] = null;
        player.credits += 1;
        shopSell1Btn.disabled = !hasCuprite();
        break;
      }
    }
  });
}
if (shopBuyBtn) {
  shopBuyBtn.addEventListener('click', () => {
    if (player.credits >= 3 && hasEmptyHotbarSlot()) {
      for (let j = 0; j < hotbar.length; j++) {
        if (!hotbar[j]) {
          hotbar[j] = { item: 'energy cell', energy: 10, maxEnergy: 10 };
          player.credits -= 3;
          shopBuyBtn.disabled = player.credits < 3 || !hasEmptyHotbarSlot();
          break;
        }
      }
    }
  });
}

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

  if (!gamePaused) update(dt);
  render();

  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
