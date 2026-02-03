// #region agent log
window.onerror = function(msg, url, line, col, error) {
  fetch('http://127.0.0.1:7244/ingest/ae77f125-e06b-4be8-98c6-edf46bc847e3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.js:error',message:'Uncaught error',data:{msg,url,line,col,errorMsg:error?error.message:''},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
};
// #endregion
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// #region agent log
fetch('http://127.0.0.1:7244/ingest/ae77f125-e06b-4be8-98c6-edf46bc847e3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.js:1',message:'Script started parsing',data:{canvasFound:!!canvas,ctxFound:!!ctx},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
// #endregion

const WIDTH = 1200;
const HEIGHT = 900;

const ACCEL = 150;
const FRICTION = 0.15;
const MAX_SPEED = 175;
const BRAKE_FRICTION = 1.5;
const BULLET_SPEED = 500;
const FIRE_COOLDOWN = 0.03;

canvas.width = WIDTH;
canvas.height = HEIGHT;

// Seeded RNG for reproducible starfield per level (mulberry32)
function createSeededRandom(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
  credits: 1000
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
const BLASTER_ENERGY_PER_SHOT = 0.2;
const BLASTER_HEAT_PER_SHOT = 0.05;
const BLASTER_COOL_RATE = 1 / 3;
const BLASTER_FIRE_RATE = 10;  // pellets per second
let selectedSlot = 0;
let blasterFireAccum = 0;

function getFirstChargedCell() {
  for (let i = 0; i < hotbar.length; i++) {
    const cell = hotbar[i];
    if (cell && cell.item === 'energy cell' && cell.energy != null && cell.energy > 0) return cell;
  }
  return null;
}

/** First energy cell with at least min energy (for blaster so we switch to next cell when current runs out). */
function getFirstCellWithMinEnergy(min) {
  for (let i = 0; i < hotbar.length; i++) {
    const cell = hotbar[i];
    if (cell && cell.item === 'energy cell' && cell.energy != null && cell.energy >= min) return cell;
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

// Drag state for hotbar (Legacy canvas drag removed)


const MAX_ORE_STACK = 10;
const ORE_ITEMS = ['cuprite', 'hematite', 'aurite', 'diamite', 'platinite']; // items that stack up to MAX_ORE_STACK

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
const SHIP_COLLECTION_RADIUS = 16;

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

function fireBlasterPellet() {
  const dx = mouseX - WIDTH / 2;
  const dy = mouseY - HEIGHT / 2;
  const dir = normalize(dx, dy);
  if (dir.x === 0 && dir.y === 0) return;
  bullets.push({
    x: ship.x + dir.x * SHIP_SIZE,
    y: ship.y + dir.y * SHIP_SIZE,
    vx: dir.x * BULLET_SPEED + ship.vx,
    vy: dir.y * BULLET_SPEED + ship.vy,
    lifespan: 2
  });
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

  if (!shopMenuOpen) {
    // Custom crosshair: vertical arms 2px wide (filled rects), horizontal arms 1px strokes
    const armLen = 6;
    const centerGap = 2;
    const crosshairX = Math.floor(mouseX) + 0.5;
    const crosshairY = Math.floor(mouseY) + 0.5;
    const armW = 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    // Top stick (2px wide)
    ctx.fillRect(crosshairX - armW / 2, crosshairY - armLen, armW, armLen - centerGap);
    // Bottom stick (2px wide)
    ctx.fillRect(crosshairX - armW / 2, crosshairY + centerGap, armW, armLen - centerGap);
    // Left/right arms (1px strokes, pixel-aligned)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(crosshairX - armLen, crosshairY);
    ctx.lineTo(crosshairX - centerGap, crosshairY);
    ctx.moveTo(crosshairX + centerGap, crosshairY);
    ctx.lineTo(crosshairX + armLen, crosshairY);
    ctx.stroke();

    // Heat bar under crosshair for mining laser or light blaster
    const equipped = hotbar[selectedSlot];
    const hasHeatWeapon = equipped && equipped.heat != null && equipped.heat > 0 && (equipped.item === 'mining laser' || equipped.item === 'light blaster');
    if (hasHeatWeapon) {
      const barW = 16;
      const barH = 4;
      const barY = mouseY + 8;
      const barX = mouseX - barW / 2;
      const isOverheated = equipped.overheated;
      ctx.fillStyle = isOverheated ? 'rgba(255, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = isOverheated ? 'rgba(255, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.6)';
      ctx.fillRect(barX, barY, barW * Math.min(1, equipped.heat), barH);
    }
  }
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

  // Fire only when mining laser is selected; drain energy; heat blocks fire when full
  const hasEnergy = getFirstChargedCell() != null;
  const miningLaser = hotbar[selectedSlot] && hotbar[selectedSlot].item === 'mining laser' ? hotbar[selectedSlot] : null;
  const miningLaserSelected = miningLaser != null;

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

  // Light blaster: 5 pellets/sec, 0.5 energy per pellet, 0.1 heat per pellet, cool 1/3 per sec
  const blaster = hotbar[selectedSlot] && hotbar[selectedSlot].item === 'light blaster' ? hotbar[selectedSlot] : null;
  if (blaster && blaster.heat != null) {
    if (blaster.heat >= 1) blaster.overheated = true;
    if (blaster.heat <= 0) blaster.overheated = false;
    const blasterCanFire = !blaster.overheated;
    const hasBlasterEnergy = getFirstCellWithMinEnergy(BLASTER_ENERGY_PER_SHOT) != null;
    if (blasterCanFire && leftMouseDown && hasBlasterEnergy) {
      blasterFireAccum += BLASTER_FIRE_RATE * dt;
      while (blasterFireAccum >= 1) {
        blasterFireAccum -= 1;
        const c = getFirstCellWithMinEnergy(BLASTER_ENERGY_PER_SHOT);
        if (!c) break;
        c.energy = Math.max(0, c.energy - BLASTER_ENERGY_PER_SHOT);
        blaster.heat = Math.min(1, blaster.heat + BLASTER_HEAT_PER_SHOT);
        fireBlasterPellet();
      }
    } else {
      blaster.heat = Math.max(0, blaster.heat - BLASTER_COOL_RATE * dt);
    }
  }

  // Bullets (movement + bullet-asteroid collision)
  const BULLET_DAMAGE = 2;            // base damage per pellet (e.g. for structures/enemies)
  const BULLET_DAMAGE_ASTEROID = 0.25; // pellets deal only 0.25 to asteroids
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.lifespan -= dt;
    let remove = b.lifespan <= 0;
    if (!remove) {
      for (const ast of asteroids) {
        const dx = b.x - ast.x;
        const dy = b.y - ast.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < ast.radius) {
          ast.health -= BULLET_DAMAGE_ASTEROID;
          remove = true;
          break;
        }
      }
    }
    if (remove) bullets.splice(i, 1);
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
      const oreCount = Math.floor(ast.radius / 10) * 10;
      if (oreCount > 0) {
        for (let j = 0; j < oreCount; j++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 30 + Math.random() * 50;
          floatingItems.push({
            x: ast.x,
            y: ast.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            item: ast.oreType || 'cuprite',
            quantity: 1
          });
        }
      }
      asteroids.splice(i, 1);
    }
  }

  // Floating items: magnet + movement + drag
  const MAGNET_RADIUS = 80;
  const MAGNET_STRENGTH = 600; // acceleration (units/sec^2) near ship
  const FLOAT_DRAG = 2.0; // velocity damping per second
  const FLOAT_STOP_SPEED = 0.05;
  for (const item of floatingItems) {
    if (item.vx == null) item.vx = 0;
    if (item.vy == null) item.vy = 0;

    // Magnet attraction (only if inventory can accept this item)
    const dx = ship.x - item.x;
    const dy = ship.y - item.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0 && dist < MAGNET_RADIUS && dist > SHIP_COLLISION_RADIUS && canAcceptFloatingItem(item)) {
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
    if (dist < SHIP_COLLECTION_RADIUS) {
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
      } else if (item.fuel != null) {
        let added = false;
        for (let j = 0; j < hotbar.length; j++) {
          if (!hotbar[j]) {
            hotbar[j] = { item: item.item, fuel: item.fuel, maxFuel: item.maxFuel };
            added = true;
            break;
          }
        }
        if (added) floatingItems.splice(i, 1);
      } else if (item.oxygen != null && item.item === 'oxygen canister') {
        let added = false;
        for (let j = 0; j < hotbar.length; j++) {
          if (!hotbar[j]) {
            hotbar[j] = { item: item.item, oxygen: item.oxygen, maxOxygen: item.maxOxygen };
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
      } else if (item.item === 'light blaster' && item.heat != null) {
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
    
    // Asteroid colors based on ore type
    let fill = '#665544';
    let stroke = '#998877';
    
    if (ast.oreType === 'hematite') { fill = '#8B4513'; stroke = '#A0522D'; }
    else if (ast.oreType === 'aurite') { fill = '#B8860B'; stroke = '#FFD700'; }
    else if (ast.oreType === 'diamite') { fill = '#A9A9A9'; stroke = '#C0C0C0'; }
    else if (ast.oreType === 'platinite') { fill = '#D3D3D3'; stroke = '#E5E4E2'; }
    
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
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
    const icon = item.item === 'cuprite' ? 'C' : 
                 (item.item === 'hematite' ? 'H' : 
                 (item.item === 'aurite' ? 'A' : 
                 (item.item === 'diamite' ? 'D' : 
                 (item.item === 'platinite' ? 'P' : 
                 (item.item === 'energy cell' ? 'E' : (item.item === 'fuel can' ? 'F' : (item.item === 'oxygen canister' ? 'O' : (item.item === 'mining laser' ? 'L' : (item.item === 'light blaster' ? 'B' : item.item.charAt(0).toUpperCase())))))))));
    // Draw small glowing circle - energy green, fuel orange, oxygen blue, laser orange, ore default
    ctx.fillStyle = item.energy != null ? '#448844' : 
                    (item.fuel != null ? '#886622' : 
                    (item.oxygen != null ? '#446688' : 
                    (item.item === 'light blaster' ? '#6644aa' : 
                    (item.heat != null ? '#884422' : 
                    (item.item === 'hematite' ? '#8B4513' : 
                    (item.item === 'aurite' ? '#FFD700' : 
                    (item.item === 'diamite' ? '#C0C0C0' : 
                    (item.item === 'platinite' ? '#E5E4E2' : 
                    '#aa8844'))))))));
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = item.energy != null ? '#66cc66' : (item.fuel != null ? '#cc8844' : (item.oxygen != null ? '#6699cc' : (item.item === 'light blaster' ? '#8866dd' : (item.heat != null ? '#cc6633' : '#ccaa66'))));
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
  const miningLaser = hotbar[selectedSlot] && hotbar[selectedSlot].item === 'mining laser' ? hotbar[selectedSlot] : null;
  const miningLaserSelected = miningLaser != null;
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
  const meterWidth = 40;
  const meterSpacing = 50;
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
  drawMeter(rightmost - 100, player.oxygen, player.maxOxygen, '#44aaff', 'O2');
  drawMeter(rightmost - 50, player.fuel, player.maxFuel, '#ffaa44', 'Fuel');
  drawMeter(rightmost, player.health, player.maxHealth, '#ff4444', 'HP');
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
  if (shopMenuOpen) return;
  if (e.button === 0) {
    leftMouseDown = true;
  } else if (e.button === 2) {
    rightMouseDown = true;
  }
});

canvas.addEventListener('mouseup', (e) => {
  if (shopMenuOpen) return;
  if (e.button === 0) {
    leftMouseDown = false;
  }
  if (e.button === 2) rightMouseDown = false;
});

canvas.addEventListener('mouseleave', () => {
  rightMouseDown = false;
  leftMouseDown = false;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (shopMenuOpen) return;
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

// Can we accept this floating item (for magnet: don't attract if inventory can't take it)
function canAcceptFloatingItem(item) {
  if (item.energy != null || item.fuel != null || item.oxygen != null || (item.item === 'mining laser' && item.heat != null) || (item.item === 'light blaster' && item.heat != null)) {
    return hasEmptyHotbarSlot();
  }
  const qty = item.quantity != null ? item.quantity : 1;
  const maxStack = getMaxStack(item.item);
  let space = 0;
  for (let i = 0; i < hotbar.length; i++) {
    const cell = hotbar[i];
    if (!cell) space += maxStack;
    else if (cell.item === item.item && cell.quantity != null && cell.quantity < maxStack) {
      space += maxStack - cell.quantity;
    }
  }
  return space >= qty;
}

// Shop: buy/sell 5x3 grid (15 slots)
const ITEM_BUY_PRICE = { 'energy cell': 30, 'oxygen canister': 40, 'fuel can': 50, 'mining laser': 200, 'light blaster': 400 };
const ITEM_SELL_PRICE = { cuprite: 10, 'oxygen canister': 10, hematite: 15, 'fuel can': 20, aurite: 25, diamite: 50, platinite: 75, 'mining laser': 100, 'light blaster': 150 };
const shopBuySlots = Array(15).fill(null);
const shopSellSlots = Array(15).fill(null);

function initShopBuySlots() {
  // Slot 0: light mining laser; 1: light blaster; 2-9: energy cells; 10-12: fuel; 13-14: oxygen
  shopBuySlots[0] = { item: 'mining laser', heat: 0, overheated: false };
  shopBuySlots[1] = { item: 'light blaster', heat: 0, overheated: false };
  for (let i = 2; i < 10; i++) {
    shopBuySlots[i] = { item: 'energy cell', energy: 10, maxEnergy: 10 };
  }
  for (let i = 10; i < 13; i++) {
    shopBuySlots[i] = { item: 'fuel can', fuel: 10, maxFuel: 10 };
  }
  for (let i = 13; i < 15; i++) {
    shopBuySlots[i] = { item: 'oxygen canister', oxygen: 10, maxOxygen: 10 };
  }
}

function getShopItemPayload(itemKey) {
  if (itemKey === 'energy cell') {
    return { item: 'energy cell', energy: 10, maxEnergy: 10 };
  }
  if (itemKey === 'oxygen canister') {
    return { item: 'oxygen canister', oxygen: 10, maxOxygen: 10 };
  }
  if (itemKey === 'light blaster') {
    return { item: 'light blaster', heat: 0, overheated: false };
  }
  return { item: itemKey };
}

function getItemLabel(it) {
  if (!it) return '';
  if (it.item === 'mining laser') return 'L';
  if (it.item === 'light blaster') return 'B';
  if (it.item === 'energy cell') return 'E';
  if (it.item === 'fuel can') return 'F';
  if (it.item === 'oxygen canister') return 'O';
  if (it.item === 'cuprite') return 'C';
  if (it.item === 'hematite') return 'H';
  if (it.item === 'aurite') return 'A';
  if (it.item === 'diamite') return 'D';
  if (it.item === 'platinite') return 'P';
  return (it.item && it.item.charAt(0).toUpperCase()) || '';
}

function getSlotHTML(it) {
  let html = '';
  if (it) {
    html += `<span class="slot-icon">${getItemLabel(it)}</span>`;
    
    // Mining laser: heat bar (red)
    if (it.item === 'mining laser' && it.heat != null) {
      const fillH = Math.round(32 * it.heat);
      html += `<div class="slot-bar"><div class="slot-bar-fill" style="height:${fillH}px;background:#cc2222;"></div></div>`;
    }
    // Light blaster: heat bar (red)
    if (it.item === 'light blaster' && it.heat != null) {
      const fillH = Math.round(32 * it.heat);
      html += `<div class="slot-bar"><div class="slot-bar-fill" style="height:${fillH}px;background:#cc2222;"></div></div>`;
    }
    
    // Energy cell: energy value + charge bar
    if (it.energy != null) {
      html += `<span class="slot-energy">${it.energy.toFixed(1)}</span>`;
      const charge = it.maxEnergy > 0 ? it.energy / it.maxEnergy : 0;
      const fillH = Math.round(32 * charge);
      const color = charge > 0.5 ? '#66ff66' : (charge > 0.25 ? '#ffff66' : '#ff6666');
      html += `<div class="slot-bar"><div class="slot-bar-fill" style="height:${fillH}px;background:${color};"></div></div>`;
    } else if (it.fuel != null) {
      // Fuel cell: fuel value + charge bar (orange)
      html += `<span class="slot-energy">${it.fuel.toFixed(1)}</span>`;
      const charge = it.maxFuel > 0 ? it.fuel / it.maxFuel : 0;
      const fillH = Math.round(32 * charge);
      const color = charge > 0.5 ? '#ffaa44' : (charge > 0.25 ? '#ffcc66' : '#ff8844');
      html += `<div class="slot-bar"><div class="slot-bar-fill" style="height:${fillH}px;background:${color};"></div></div>`;
    } else if (it.item === 'oxygen canister' && it.oxygen != null) {
      // Oxygen canister: oxygen value + charge bar (blue)
      html += `<span class="slot-energy">${it.oxygen.toFixed(1)}</span>`;
      const charge = it.maxOxygen > 0 ? it.oxygen / it.maxOxygen : 0;
      const fillH = Math.round(32 * charge);
      const color = charge > 0.5 ? '#66aaff' : (charge > 0.25 ? '#88ccff' : '#4488dd');
      html += `<div class="slot-bar"><div class="slot-bar-fill" style="height:${fillH}px;background:${color};"></div></div>`;
    } else if (it.quantity != null && it.quantity > 1) {
      html += `<span class="slot-qty">${it.quantity}</span>`;
    }
  }
  return html;
}

function getItemSellPrice(item) {
  if (!item) return 0;
  // Energy cell: 3 when full, 2 when >50%, 1 when <=50%
  if (item.item === 'energy cell' && item.energy != null && item.maxEnergy != null) {
    const chargeRatio = item.maxEnergy > 0 ? item.energy / item.maxEnergy : 0;
    if (chargeRatio >= 1) return 3;
    if (chargeRatio > 0.5) return 2;
    return 1;
  }
  // Fuel cell: 2 when full, 1 when >0
  if (item.item === 'fuel can' && item.fuel != null && item.maxFuel != null) {
    const chargeRatio = item.maxFuel > 0 ? item.fuel / item.maxFuel : 0;
    if (chargeRatio > 0.5) return 2;
    if (chargeRatio > 0) return 1;
    return 0;
  }
  // Oxygen canister: 10 when full, 5 when >0
  if (item.item === 'oxygen canister' && item.oxygen != null && item.maxOxygen != null) {
    const chargeRatio = item.maxOxygen > 0 ? item.oxygen / item.maxOxygen : 0;
    if (chargeRatio > 0.5) return 10;
    if (chargeRatio > 0) return 5;
    return 0;
  }
  // Static prices for other items
  const price = ITEM_SELL_PRICE[item.item];
  return price != null ? price : 0;
}

function getSellTotal() {
  let total = 0;
  for (const slot of shopSellSlots) {
    if (!slot) continue;
    const price = getItemSellPrice(slot);
    const qty = slot.quantity != null ? slot.quantity : 1;
    total += price * qty;
  }
  return total;
}

function syncShopBuyArea() {
  for (let i = 0; i < shopBuySlots.length; i++) {
    const el = document.querySelector(`#shop-buy-slots .shop-buy-slot[data-buy-slot="${i}"]`);
    if (!el) continue;
    const it = shopBuySlots[i];
    el.classList.toggle('has-item', !!it);
    
    // We can reuse getSlotHTML, but buy slots don't usually need dynamic heat/energy bars if they are static store items.
    // However, our shop items DO have energy/maxEnergy properties (like energy cells).
    // So getSlotHTML works fine.
    
    el.innerHTML = getSlotHTML(it);
  }
  
  // Build price list (unchanged)
  const priceList = document.getElementById('shop-price-list');
  if (priceList) {
    const itemNames = { 
      'energy cell': 'Energy Cell', 
      'fuel can': 'Fuel Can', 
      'oxygen canister': 'Oxygen Canister',
      'mining laser': 'Mining Laser',
      'light blaster': 'Light Blaster',
      cuprite: 'Cuprite',
      hematite: 'Hematite',
      aurite: 'Aurite',
      diamite: 'Diamite',
      platinite: 'Platinite'
    };
    let html = '';
    for (const [itemKey, price] of Object.entries(ITEM_BUY_PRICE)) {
      const label = itemNames[itemKey] || itemKey;
      html += `<div class="price-row"><span class="price-label">${label}</span><span class="price-value">${price} cr</span></div>`;
    }
    priceList.innerHTML = html;
  }
}


function updateHUD() {
  // Sync Hotbar
  for (let i = 0; i < 9; i++) {
    const el = document.querySelector(`#hotbar .slot[data-slot="${i}"]`);
    if (!el) continue;
    const it = hotbar[i];
    el.classList.toggle('has-item', !!it);
    el.classList.toggle('selected', i === selectedSlot);
    
    let html = `<span class="slot-num">${i + 1}</span>`;
    html += getSlotHTML(it);
    el.innerHTML = html;
  }
  
  // Sync Credits
  const valueEl = document.querySelector('.credits-value');
  if (valueEl) valueEl.textContent = player.credits;
  const shopCreditsEl = document.getElementById('shop-credits-display');
  if (shopCreditsEl) shopCreditsEl.textContent = `You have ${player.credits} credits`;
}

// Alias for compatibility if needed, or I can replace calls
const syncShopHotbar = updateHUD;
const syncShopCredits = updateHUD;

function syncShopSellArea() {
  for (let i = 0; i < shopSellSlots.length; i++) {
    const el = document.querySelector(`#shop-sell-slots .shop-sell-slot[data-sell-slot="${i}"]`);
    if (!el) continue;
    const it = shopSellSlots[i];
    el.classList.toggle('has-item', !!it);
    
    el.innerHTML = getSlotHTML(it);
  }
  const totalEl = document.getElementById('shop-sell-total');
  if (totalEl) totalEl.textContent = `Total: ${getSellTotal()} credits`;
  const sellBtn = document.getElementById('shop-sell-btn');
  if (sellBtn) sellBtn.disabled = getSellTotal() === 0;
}

// syncShopCredits merged into updateHUD


function returnSellAreaToHotbar() {
  for (let i = 0; i < shopSellSlots.length; i++) {
    const it = shopSellSlots[i];
    if (!it) continue;
    const qty = it.quantity != null ? it.quantity : 1;
    if (ORE_ITEMS.includes(it.item)) {
      addToInventory(it.item, qty);
    } else {
      for (let k = 0; k < qty; k++) {
        const payload = { ...it };
        if (payload.quantity != null) delete payload.quantity;
        for (let j = 0; j < hotbar.length; j++) {
          if (!hotbar[j]) {
            hotbar[j] = { ...payload };
            break;
          }
        }
      }
    }
    shopSellSlots[i] = null;
  }
  syncShopSellArea();
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Control') ctrlBrake = true;
  // Hotbar slot selection (1-9)
  if (e.key >= '1' && e.key <= '9') {
    selectedSlot = parseInt(e.key) - 1;
  }
  // Key in E position (KeyE): close shop, or open warp gate/shop menu when inside
  if (e.code === 'KeyE') {
    if (shopMenuOpen) {
      e.preventDefault();
      closeShopMenu();
    } else if (!warpMenuOpen && !gamePaused && isShipInWarpGate()) {
      e.preventDefault();
      gamePaused = true;
      warpMenuOpen = true;
      const overlay = document.getElementById('warp-menu-overlay');
      if (overlay) overlay.style.display = 'flex';
      const payBtn = document.getElementById('warp-pay-btn');
      if (payBtn) payBtn.disabled = player.credits < 1000;
    } else if (!warpMenuOpen && !gamePaused && isShipInShop()) {
      e.preventDefault();
      openShopMenu();
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
  // Regenerate stars: same density as a 3000x3000 level, using level seed for reproducibility
  const seed = levelData.seed != null ? levelData.seed : 0;
  const rng = createSeededRandom(typeof seed === 'number' ? seed >>> 0 : 0);
  const REFERENCE_AREA = 3000 * 3000;
  const numStars = Math.round(NUM_STARS * (levelWidth * levelHeight) / REFERENCE_AREA);
  stars.length = 0;
  const spread = Math.max(levelWidth, levelHeight) / 2;
  for (let i = 0; i < numStars; i++) {
    stars.push({
      x: (rng() - 0.5) * 2 * spread,
      y: (rng() - 0.5) * 2 * spread,
      size: rng() * 2 + 0.5,
      brightness: 0.3 + rng() * 0.7
    });
  }
}

// Level select: known levels (in levels folder) + levels loaded via file picker
const KNOWN_LEVELS = [
  { name: 'Level 1', path: 'levels/level1.json' },
  { name: 'Debug', path: 'levels/debug.json' }
];
const loadedLevels = []; // { name, data } for levels loaded via L
const LEVEL_SELECT_KEY = 'spacejam-level-select';
const LEVEL_LOADED_DATA_KEY = 'spacejam-loaded-level-data';

function refreshLevelSelect(selectedValue) {
  const sel = document.getElementById('level-select');
  if (!sel) return;
  sel.textContent = '';
  KNOWN_LEVELS.forEach((lev, i) => {
    const opt = document.createElement('option');
    opt.value = 'known-' + i;
    opt.textContent = lev.name;
    sel.appendChild(opt);
  });
  loadedLevels.forEach((lev, i) => {
    const opt = document.createElement('option');
    opt.value = 'loaded-' + i;
    opt.textContent = lev.name;
    sel.appendChild(opt);
  });
  if (selectedValue != null) sel.value = selectedValue;
}

function saveLevelSelection(value) {
  try {
    if (value.startsWith('loaded-')) {
      localStorage.setItem(LEVEL_SELECT_KEY, 'loaded');
      const i = parseInt(value.split('-')[1], 10);
      if (loadedLevels[i]) localStorage.setItem(LEVEL_LOADED_DATA_KEY, JSON.stringify(loadedLevels[i].data));
    } else {
      localStorage.setItem(LEVEL_SELECT_KEY, value);
      localStorage.removeItem(LEVEL_LOADED_DATA_KEY);
    }
  } catch (e) {}
}

function loadLevelFromSelect(value) {
  if (!value) return;
  saveLevelSelection(value);
  if (value.startsWith('loaded-')) {
    const i = parseInt(value.split('-')[1], 10);
    if (loadedLevels[i]) loadLevel(loadedLevels[i].data);
  } else if (value.startsWith('known-')) {
    const i = parseInt(value.split('-')[1], 10);
    const lev = KNOWN_LEVELS[i];
    if (lev) {
      fetch(lev.path)
        .then(res => res.json())
        .then(level => loadLevel(level))
        .catch(err => console.log('Failed to load ' + lev.path));
    }
  }
}

const levelSelect = document.getElementById('level-select');
if (levelSelect) {
  levelSelect.addEventListener('change', () => loadLevelFromSelect(levelSelect.value));
  // Restore saved level or default to Level 1
  const saved = localStorage.getItem(LEVEL_SELECT_KEY);
  if (saved === 'loaded') {
    try {
      const dataStr = localStorage.getItem(LEVEL_LOADED_DATA_KEY);
      if (dataStr) {
        const data = JSON.parse(dataStr);
        loadedLevels.push({ name: 'Saved level', data });
        refreshLevelSelect('loaded-0');
        loadLevel(data);
      } else {
        refreshLevelSelect('known-0');
        fetch('levels/level1.json').then(res => res.json()).then(level => loadLevel(level)).catch(() => {});
      }
    } catch (e) {
      refreshLevelSelect('known-0');
      fetch('levels/level1.json').then(res => res.json()).then(level => loadLevel(level)).catch(() => {});
    }
  } else if (saved === 'known-0' || saved === 'known-1') {
    refreshLevelSelect(saved);
    const i = parseInt(saved.split('-')[1], 10);
    const lev = KNOWN_LEVELS[i];
    if (lev) fetch(lev.path).then(res => res.json()).then(level => loadLevel(level)).catch(() => {});
  } else {
    refreshLevelSelect('known-0');
    fetch('levels/level1.json').then(res => res.json()).then(level => loadLevel(level)).catch(() => {});
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
      loadedLevels.push({ name: file.name.replace(/\.json$/i, '') || file.name, data: level });
      const loadedValue = 'loaded-' + (loadedLevels.length - 1);
      refreshLevelSelect(loadedValue);
      saveLevelSelection(loadedValue);
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

function openShopMenu() {
  gamePaused = true;
  shopMenuOpen = true;
  for (let i = 0; i < shopSellSlots.length; i++) shopSellSlots[i] = null;
  syncShopBuyArea();
  updateHUD();
  syncShopSellArea();
  const overlay = document.getElementById('shop-menu-overlay');
  if (overlay) overlay.style.display = 'flex';
  const ghost = document.getElementById('shop-drag-ghost');
  if (ghost) ghost.style.display = 'none';
}

function closeShopMenu() {
  returnSellAreaToHotbar();
  shopMenuOpen = false;
  gamePaused = warpMenuOpen || shopMenuOpen;
  const overlay = document.getElementById('shop-menu-overlay');
  if (overlay) overlay.style.display = 'none';
  const ghost = document.getElementById('shop-drag-ghost');
  if (ghost) ghost.style.display = 'none';
}

const warpMenuOverlay = document.getElementById('warp-menu-overlay');
const warpPayBtn = document.getElementById('warp-pay-btn');
const warpCancelBtn = document.getElementById('warp-cancel-btn');
if (warpCancelBtn) {
  warpCancelBtn.addEventListener('click', () => closeWarpMenu());
}
if (warpPayBtn) {
  warpPayBtn.addEventListener('click', () => {
    if (player.credits >= 1000) {
      player.credits -= 1000;
      closeWarpMenu();
    }
  });
}

const shopCloseBtn = document.getElementById('shop-close-btn');
if (shopCloseBtn) {
  shopCloseBtn.addEventListener('click', () => closeShopMenu());
}

const shopSellBtn = document.getElementById('shop-sell-btn');
if (shopSellBtn) {
  shopSellBtn.addEventListener('click', () => {
    const total = getSellTotal();
    if (total <= 0) return;
    player.credits += total;
    for (let i = 0; i < shopSellSlots.length; i++) shopSellSlots[i] = null;
    syncShopSellArea();
    updateHUD();
  });
}

// Inventory drag state (unified for HUD and Shop)
let inventoryDrag = null; // { kind: 'hotbar'|'buy'|'sell', fromSlot?: number, fromBuySlot?: number, fromSellSlot?: number, price?: number }

function setDragGhostVisible(visible) {
  const ghost = document.getElementById('shop-drag-ghost');
  if (!ghost) return;
  ghost.style.display = visible ? 'flex' : 'none';
}

function setDragGhostContent(label, qtyText) {
  const ghost = document.getElementById('shop-drag-ghost');
  if (!ghost) return;
  if (qtyText) {
    ghost.innerHTML = `${label}<span class="slot-qty">${qtyText}</span>`;
  } else {
    ghost.textContent = label;
  }
}

function setDragGhostPos(clientX, clientY) {
  const ghost = document.getElementById('shop-drag-ghost');
  if (!ghost) return;
  ghost.style.left = (clientX - 22) + 'px';
  ghost.style.top = (clientY - 22) + 'px';
}

function beginDragFromHotbar(slotIndex, clientX, clientY) {
  const it = hotbar[slotIndex];
  if (!it) return;
  inventoryDrag = { kind: 'hotbar', fromSlot: slotIndex };
  const qty = it.quantity != null ? String(it.quantity) : (it.energy != null ? String(Math.round(it.energy)) : (it.fuel != null ? String(Math.round(it.fuel)) : (it.oxygen != null ? String(Math.round(it.oxygen)) : (it.heat != null ? String(Math.round(it.heat * 100)) : ''))));
  setDragGhostContent(getItemLabel(it), qty);
  setDragGhostPos(clientX, clientY);
  setDragGhostVisible(true);
}

function beginDragFromBuy(buyIndex, clientX, clientY) {
  const it = shopBuySlots[buyIndex];
  if (!it) return;
  const price = ITEM_BUY_PRICE[it.item] || 0;
  inventoryDrag = { kind: 'buy', fromBuySlot: buyIndex, price };
  const qty = it.quantity != null ? String(it.quantity) : (it.energy != null ? String(Math.round(it.energy)) : (it.fuel != null ? String(Math.round(it.fuel)) : (it.oxygen != null ? String(Math.round(it.oxygen)) : (it.heat != null ? String(Math.round(it.heat * 100)) : ''))));
  setDragGhostContent(getItemLabel(it), qty);
  setDragGhostPos(clientX, clientY);
  setDragGhostVisible(true);
}

function beginDragFromSell(sellIndex, clientX, clientY) {
  const it = shopSellSlots[sellIndex];
  if (!it) return;
  inventoryDrag = { kind: 'sell', fromSellSlot: sellIndex };
  const qty = it.quantity != null ? String(it.quantity) : (it.energy != null ? String(Math.round(it.energy)) : (it.fuel != null ? String(Math.round(it.fuel)) : (it.oxygen != null ? String(Math.round(it.oxygen)) : (it.heat != null ? String(Math.round(it.heat * 100)) : ''))));
  setDragGhostContent(getItemLabel(it), qty);
  setDragGhostPos(clientX, clientY);
  setDragGhostVisible(true);
}

function endDrag(clientX, clientY) {
  const drag = inventoryDrag;
  inventoryDrag = null;
  setDragGhostVisible(false);
  // Remove fuel and O2 bar highlights
  const fuelBarEl = document.getElementById('fuel-bar-drop-zone');
  if (fuelBarEl) fuelBarEl.classList.remove('highlight');
  const oxygenBarEl = document.getElementById('oxygen-bar-drop-zone');
  if (oxygenBarEl) oxygenBarEl.classList.remove('highlight');
  if (!drag) return;

  const under = document.elementFromPoint(clientX, clientY);
  let targetSlotEl = null;
  const isOverFuelBar = under && under.closest('#fuel-bar-drop-zone');
  const isOverO2Bar = under && under.closest('#oxygen-bar-drop-zone');
  if (under) {
    targetSlotEl = under.closest('.slot') || under.closest('.shop-buy-slot') || under.closest('.shop-sell-slot');
  }

  // Handle drop on O2 bar: oxygen canister adds 10 O2
  if (isOverO2Bar && drag.kind === 'hotbar') {
    const from = drag.fromSlot;
    const it = hotbar[from];
    if (it && it.item === 'oxygen canister') {
      player.oxygen = Math.min(player.maxOxygen, player.oxygen + 10);
      hotbar[from] = null;
      updateHUD();
      return;
    }
  }

  // Handle drop on fuel bar: fuel can adds 10 fuel
  if (isOverFuelBar && drag.kind === 'hotbar') {
    const from = drag.fromSlot;
    const it = hotbar[from];
    if (it && it.item === 'fuel can') {
      player.fuel = Math.min(player.maxFuel, player.fuel + 10);
      hotbar[from] = null;
      updateHUD();
      return;
    }
  }

  // Handle Jettison if dropped outside of UI and shop is closed
  if (!targetSlotEl && !shopMenuOpen && drag.kind === 'hotbar') {
    // Drop into space
    const from = drag.fromSlot;
    const it = hotbar[from];
    if (it) {
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
          item: it.item,
          quantity: it.quantity || 1
        };
        if (it.energy != null) {
          floatItem.energy = it.energy;
          floatItem.maxEnergy = it.maxEnergy;
        }
        if (it.fuel != null) {
          floatItem.fuel = it.fuel;
          floatItem.maxFuel = it.maxFuel;
        }
        if (it.oxygen != null) {
          floatItem.oxygen = it.oxygen;
          floatItem.maxOxygen = it.maxOxygen;
        }
        if (it.heat != null) {
          floatItem.heat = it.heat;
          floatItem.overheated = !!it.overheated;
        }
        floatingItems.push(floatItem);
        hotbar[from] = null;
        updateHUD();
      }
    }
    return;
  }

  if (!targetSlotEl) return;

  // Determine target type
  const isHotbar = targetSlotEl.classList.contains('slot');
  const isSell = targetSlotEl.classList.contains('shop-sell-slot');
  const isBuy = targetSlotEl.classList.contains('shop-buy-slot'); // Can't drop onto buy slots generally

  if (drag.kind === 'hotbar') {
    const from = drag.fromSlot;
    const it = hotbar[from];
    if (!it) return;

    if (isSell && shopMenuOpen) {
      const sellIndex = parseInt(targetSlotEl.dataset.sellSlot, 10);
      if (sellIndex >= 0 && !shopSellSlots[sellIndex]) {
        shopSellSlots[sellIndex] = { ...it };
        hotbar[from] = null;
        updateHUD();
        syncShopSellArea();
        return;
      }
    } else if (isHotbar) {
      const to = parseInt(targetSlotEl.dataset.slot, 10);
      if (to >= 0 && to !== from) {
        const tmp = hotbar[to];
        hotbar[to] = hotbar[from];
        hotbar[from] = tmp;
        updateHUD();
        return;
      }
    }
  } else if (drag.kind === 'buy') {
    if (!isHotbar) return;
    const from = drag.fromBuySlot;
    const it = shopBuySlots[from];
    if (!it) return;
    const to = parseInt(targetSlotEl.dataset.slot, 10);
    if (to < 0) return;
    if (hotbar[to]) return;
    if (player.credits < drag.price) return;
    player.credits -= drag.price;
    hotbar[to] = { ...it };
    shopBuySlots[from] = null;
    syncShopBuyArea();
    updateHUD();
  } else if (drag.kind === 'sell') {
    const from = drag.fromSellSlot;
    const it = shopSellSlots[from];
    if (!it) return;
    
    if (isHotbar) {
      const to = parseInt(targetSlotEl.dataset.slot, 10);
      if (to >= 0 && !hotbar[to]) {
        hotbar[to] = { ...it };
        shopSellSlots[from] = null;
        updateHUD();
        syncShopSellArea();
        return;
      }
    } else if (isSell) {
      const toSell = parseInt(targetSlotEl.dataset.sellSlot, 10);
      if (toSell >= 0 && toSell !== from) {
        const tmp = shopSellSlots[toSell];
        shopSellSlots[toSell] = shopSellSlots[from];
        shopSellSlots[from] = tmp;
        syncShopSellArea();
        return;
      }
    }
  }
}

// UI Drag Start Listener
window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const t = e.target;
  
  const hotbarSlotEl = t.closest && t.closest('#hotbar .slot');
  const buySlotEl = t.closest && t.closest('.shop-buy-slot');
  const sellSlotEl = t.closest && t.closest('.shop-sell-slot');
  
  if (hotbarSlotEl) {
    const slotIndex = parseInt(hotbarSlotEl.dataset.slot, 10);
    if (slotIndex >= 0 && hotbar[slotIndex]) {
      e.preventDefault();
      beginDragFromHotbar(slotIndex, e.clientX, e.clientY);
    }
    return;
  }
  
  if (shopMenuOpen) {
    if (buySlotEl) {
      const buyIndex = parseInt(buySlotEl.dataset.buySlot, 10);
      if (buyIndex >= 0 && shopBuySlots[buyIndex]) {
        e.preventDefault();
        beginDragFromBuy(buyIndex, e.clientX, e.clientY);
      }
      return;
    }
    if (sellSlotEl) {
      const sellIndex = parseInt(sellSlotEl.dataset.sellSlot, 10);
      if (sellIndex >= 0 && shopSellSlots[sellIndex]) {
        e.preventDefault();
        beginDragFromSell(sellIndex, e.clientX, e.clientY);
      }
      return;
    }
  }
});

window.addEventListener('mousemove', (e) => {
  if (inventoryDrag) {
    setDragGhostPos(e.clientX, e.clientY);
    const fuelBarEl = document.getElementById('fuel-bar-drop-zone');
    const oxygenBarEl = document.getElementById('oxygen-bar-drop-zone');
    if (inventoryDrag.kind === 'hotbar') {
      const it = hotbar[inventoryDrag.fromSlot];
      const under = document.elementFromPoint(e.clientX, e.clientY);
      if (fuelBarEl) {
        if (it && it.item === 'fuel can' && under && under.closest('#fuel-bar-drop-zone')) {
          fuelBarEl.classList.add('highlight');
        } else {
          fuelBarEl.classList.remove('highlight');
        }
      }
      if (oxygenBarEl) {
        if (it && it.item === 'oxygen canister' && under && under.closest('#oxygen-bar-drop-zone')) {
          oxygenBarEl.classList.add('highlight');
        } else {
          oxygenBarEl.classList.remove('highlight');
        }
      }
    } else {
      if (fuelBarEl) fuelBarEl.classList.remove('highlight');
      if (oxygenBarEl) oxygenBarEl.classList.remove('highlight');
    }
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  if (inventoryDrag) {
    endDrag(e.clientX, e.clientY);
  }
});

// Game loop
let lastTime = performance.now();
// #region agent log
fetch('http://127.0.0.1:7244/ingest/ae77f125-e06b-4be8-98c6-edf46bc847e3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.js:init',message:'Before initStars/initShopBuySlots',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
// #endregion
initStars();
initShopBuySlots();
// #region agent log
fetch('http://127.0.0.1:7244/ingest/ae77f125-e06b-4be8-98c6-edf46bc847e3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.js:init',message:'After initStars/initShopBuySlots',data:{starsCount:stars.length,shopBuySlot0:shopBuySlots[0]},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
// #endregion

// Initial level load is handled in level select init above (restore saved or level1)

let gameLoopCount = 0;
function gameLoop(now) {
  // #region agent log
  if (gameLoopCount === 0) fetch('http://127.0.0.1:7244/ingest/ae77f125-e06b-4be8-98c6-edf46bc847e3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.js:gameLoop',message:'First gameLoop call',data:{now},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
  gameLoopCount++;
  // #endregion
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (!gamePaused) update(dt);
  render();
  updateHUD(); // Sync HUD every frame (or could optimize to only when changed)

  requestAnimationFrame(gameLoop);
}
// #region agent log
fetch('http://127.0.0.1:7244/ingest/ae77f125-e06b-4be8-98c6-edf46bc847e3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.js:end',message:'Script fully parsed, starting gameLoop',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
// #endregion
requestAnimationFrame(gameLoop);
