// #region agent log
window.onerror = function(msg, url, line, col, error) {
  fetch('http://127.0.0.1:7244/ingest/ae77f125-e06b-4be8-98c6-edf46bc847e3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.js:error',message:'Uncaught error',data:{msg,url,line,col,errorMsg:error?error.message:''},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
};
// #endregion
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Three.js ship layer (3D model from scout-ship.glb)
let shipCanvas, shipScene, shipCamera, shipRenderer, shipMesh, shipModelLoaded = false;
let shipFlames = []; // Thruster flame meshes
// Small asteroid 3D models (radius 10-30)
let smallAsteroidModels = [null, null, null];
// Medium asteroid 3D models (radius 40-90)
let mediumAsteroidModels = [null, null];
// Large asteroid 3D model (radius 100+)
let largeAsteroidModel = null;
let asteroidContainer = null;
let structureModels = { warpgate: null, shop: null, piratebase: null };
let structureContainer = null;
let levelSeed = 0;

// Pirate Globals
const pirates = [];
const PIRATE_ACCEL = 150;
const PIRATE_FRICTION = 0.15;
const PIRATE_MAX_SPEED = 160;
let levelElapsedTime = 0;
let pirateSpawnTimer = 120; // first spawn at 2 min
let levelIsDebug = false;
const PIRATE_HEALTH = 20;


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
const PIRATE_BULLET_SPEED = 250; // half of BULLET_SPEED; aim uses this for lead time
const FIRE_COOLDOWN = 0.03;

canvas.width = WIDTH;
canvas.height = HEIGHT;

let uiCanvas = document.getElementById('ui-canvas');
let uiCtx = uiCanvas ? uiCanvas.getContext('2d') : null;
if (uiCanvas) {
  uiCanvas.width = WIDTH;
  uiCanvas.height = HEIGHT;
}

// Item icon images (preloaded for floating items)
const ITEM_IMAGES = {
  'fuel tank': new Image(),
  'small energy cell': new Image(),
  'medium energy cell': new Image(),
  'oxygen canister': new Image()
};
ITEM_IMAGES['fuel tank'].src = 'assets/fuel-can.png';
ITEM_IMAGES['small energy cell'].src = 'assets/energy-cell.png';
ITEM_IMAGES['medium energy cell'].src = 'assets/energy-cell.png';
ITEM_IMAGES['oxygen canister'].src = 'assets/oxygen-can.png';

function getItemImagePath(itemName) {
  if (itemName === 'fuel tank') return 'assets/fuel-can.png';
  if (itemName === 'small energy cell' || itemName === 'medium energy cell') return 'assets/energy-cell.png';
  if (itemName === 'oxygen canister') return 'assets/oxygen-can.png';
  return null;
}

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
  credits: 0
};
const OXYGEN_DEPLETION_RATE = 1 / 25; // 1 per 25 seconds
const FUEL_DEPLETION_RATE = 1 / 3; // 1 per 3 seconds while right-clicking

// Inventory hotbar (9 slots, each can hold { item, quantity?, energy?, maxEnergy? } or null)
const hotbar = [
  { item: 'mining laser', heat: 0, overheated: false }, // heat 0-1, overheated locks until cooled to 0
  { item: 'small energy cell', energy: 10, maxEnergy: 10 },
  { item: 'small energy cell', energy: 10, maxEnergy: 10 },
  null, null, null, null, null, null
];
const LASER_HEAT_RATE = 1;    // per second when firing (full in 1 sec)
const LASER_COOL_RATE = 1 / 3; // per second when not firing (empty in 3 sec)
const WEAPON_ENERGY_DRAIN = 1; // per second when firing (light laser)
const MINING_LASER_STATS = {
  'mining laser':       { heatRate: 1, coolRate: 1 / 3, dps: 5, energyDrain: 1 },           // 1s heat, 3s cool, 5 DPS
  'medium mining laser': { heatRate: 1 / 1.5, coolRate: 1 / 3, dps: 10, energyDrain: 1.5 }  // 1.5s heat, 3s cool, 10 DPS, 50% faster energy
};
const BLASTER_ENERGY_PER_SHOT = 0.2;
const BLASTER_HEAT_PER_SHOT = 0.05;
const BLASTER_COOL_RATE = 1 / 3;
const BLASTER_FIRE_RATE = 10;  // pellets per second
let selectedSlot = 0;
let blasterFireAccum = 0;

function getFirstChargedCell() {
  for (let i = 0; i < hotbar.length; i++) {
    const cell = hotbar[i];
    if (cell && (cell.item === 'small energy cell' || cell.item === 'medium energy cell') && cell.energy != null && cell.energy > 0) return cell;
  }
  return null;
}

/** First energy cell with at least min energy (for blaster so we switch to next cell when current runs out). */
function getFirstCellWithMinEnergy(min) {
  for (let i = 0; i < hotbar.length; i++) {
    const cell = hotbar[i];
    if (cell && (cell.item === 'small energy cell' || cell.item === 'medium energy cell') && cell.energy != null && cell.energy >= min) return cell;
  }
  return null;
}

// Mouse state
let mouseX = WIDTH / 2;
let mouseY = HEIGHT / 2;
let rightMouseDown = false;
let leftMouseDown = false;
let ctrlBrake = false;

// Ship tilt (banks when turning, decays when resting)
let prevAimAngle = 0;
let shipTilt = 0;
let shipTiltInitialized = false;

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
const ORE_ITEMS = ['cuprite', 'hematite', 'aurite', 'diamite', 'platinite', 'scrap']; // items that stack up to MAX_ORE_STACK

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

// Ray vs circle for pirate base (radius 54)
function laserHitPirateBase(ox, oy, dx, dy, maxLen) {
  let closest = null;
  let closestDist = maxLen;
  const radius = 54;
  const radiusSq = radius * radius;
  for (const st of structures) {
    if (st.type !== 'piratebase' || st.dead || st.health <= 0) continue;
    const fx = st.x - ox;
    const fy = st.y - oy;
    const t = fx * dx + fy * dy;
    if (t < 0) continue;
    const cx = ox + dx * t;
    const cy = oy + dy * t;
    const distSq = (st.x - cx) * (st.x - cx) + (st.y - cy) * (st.y - cy);
    if (distSq < radiusSq) {
      const offset = Math.sqrt(radiusSq - distSq);
      const hitDist = t - offset;
      if (hitDist > 0 && hitDist < closestDist) {
        closest = st;
        closestDist = hitDist;
      }
    }
  }
  return closest ? { structure: closest, distance: closestDist } : null;
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
      lifespan: 4,
      owner: 'player'
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
    lifespan: 4,
    owner: 'player'
  });
}

function drawShip2D() {
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

function drawCrosshairAndHeatBar() {
  if (!uiCtx) return;
  uiCtx.clearRect(0, 0, WIDTH, HEIGHT);
  if (shopMenuOpen) return;
  const armLen = 6;
  const centerGap = 2;
  const crosshairX = Math.floor(mouseX) + 0.5;
  const crosshairY = Math.floor(mouseY) + 0.5;
  const armW = 2;
  uiCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  uiCtx.fillRect(crosshairX - armW / 2, crosshairY - armLen, armW, armLen - centerGap);
  uiCtx.fillRect(crosshairX - armW / 2, crosshairY + centerGap, armW, armLen - centerGap);
  uiCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  uiCtx.lineWidth = 1;
  uiCtx.lineCap = 'round';
  uiCtx.beginPath();
  uiCtx.moveTo(crosshairX - armLen, crosshairY);
  uiCtx.lineTo(crosshairX - centerGap, crosshairY);
  uiCtx.moveTo(crosshairX + centerGap, crosshairY);
  uiCtx.lineTo(crosshairX + armLen, crosshairY);
  uiCtx.stroke();
  const equipped = hotbar[selectedSlot];
  const hasHeatWeapon = equipped && equipped.heat != null && equipped.heat > 0 && (MINING_LASER_STATS[equipped.item] || equipped.item === 'light blaster');
  if (hasHeatWeapon) {
    const barW = 16;
    const barH = 4;
    const barY = mouseY + 8;
    const barX = mouseX - barW / 2;
    const isOverheated = equipped.overheated;
    uiCtx.fillStyle = isOverheated ? 'rgba(255, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)';
    uiCtx.fillRect(barX, barY, barW, barH);
    uiCtx.fillStyle = isOverheated ? 'rgba(255, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.6)';
    uiCtx.fillRect(barX, barY, barW * Math.min(1, equipped.heat), barH);
  }
}

function initShip3D() {
  if (typeof THREE === 'undefined') return;
  shipCanvas = document.getElementById('ship-canvas');
  if (!shipCanvas) return;
  const aspect = WIDTH / HEIGHT;
  shipCamera = new THREE.PerspectiveCamera(15, aspect, 1, 5000);
  shipCamera.position.set(0, 0, 3390);
  shipCamera.lookAt(0, 0, 0);
  shipScene = new THREE.Scene();
  asteroidContainer = new THREE.Group();
  shipScene.add(asteroidContainer);
  structureContainer = new THREE.Group();
  shipScene.add(structureContainer);
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(20, 20, 50);
  shipScene.add(light);
  const light2 = new THREE.DirectionalLight(0xffffff, 0.8);
  light2.position.set(-50, -30, 40);
  shipScene.add(light2);
  const topLight = new THREE.DirectionalLight(0xffffff, 3.0);
  topLight.position.set(0, 100, 20);
  shipScene.add(topLight);
  shipScene.add(new THREE.AmbientLight(0xffffff, 1.0));
  shipRenderer = new THREE.WebGLRenderer({ canvas: shipCanvas, antialias: true, alpha: true });
  shipRenderer.setPixelRatio(window.devicePixelRatio || 1);
  shipRenderer.setSize(WIDTH, HEIGHT);
  shipRenderer.setClearColor(0x000000, 0);
  const LoaderClass = (window.GLTFLoader || (THREE && THREE.GLTFLoader));
  if (!LoaderClass) return;
  const loader = new LoaderClass();
  const glbUrl = new URL('assets/scout-ship.glb', window.location.href).toString();
  loader.load(glbUrl, (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = (SHIP_SIZE * 2) / (maxDim > 0 ? maxDim : 1) * 1.2;
    model.scale.setScalar(scale);
    model.position.sub(center.multiplyScalar(scale));
    // Convert common glTF orientation (Y-up, Z-forward) into our top-down XY view.
    model.rotation.x = -Math.PI / 2;
    // Shift centerpoint up a bit for better visual alignment
    model.position.y += 3;
    shipMesh = model;
    shipScene.add(shipMesh);
    
    // Create thruster flames (two small cones at the back)
    const flameHeight = 0.42;
    const flameGeom = new THREE.ConeGeometry(0.105, flameHeight, 8);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.9 });
    const flame1 = new THREE.Mesh(flameGeom.clone(), flameMat.clone());
    const flame2 = new THREE.Mesh(flameGeom.clone(), flameMat.clone());
    flame1.rotation.x = -Math.PI / 2; // Point flames backward (horizontal)
    flame2.rotation.x = -Math.PI / 2;
    // Offset cone so base is at origin (for scaling from base)
    flame1.position.set(0, 0, -flameHeight / 2);
    flame2.position.set(0, 0, -flameHeight / 2);
    const flameGroup1 = new THREE.Group();
    const flameGroup2 = new THREE.Group();
    flameGroup1.add(flame1);
    flameGroup2.add(flame2);
    flameGroup1.position.set(-0.15, 0.3, -0.9);
    flameGroup2.position.set(0.15, 0.3, -0.9);
    flameGroup1.visible = false;
    flameGroup2.visible = false;
    shipMesh.add(flameGroup1);
    shipMesh.add(flameGroup2);
    shipFlames = [flameGroup1, flameGroup2];
    
    shipModelLoaded = true;
    // eslint-disable-next-line no-console
    console.log('[ship3d] Loaded scout-ship.glb');
  }, undefined, (err) => {
    // eslint-disable-next-line no-console
    console.error('[ship3d] Failed to load scout-ship.glb', err);
  });

  function setupAsteroidModel(model) {
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        const oldMat = child.material;
        const newMat = new THREE.MeshStandardMaterial({
          color: oldMat.color ? oldMat.color.clone() : 0x888888,
          map: oldMat.map || null,
          roughness: 0.8,
          metalness: 0.2,
          emissive: 0x333333,
          emissiveMap: oldMat.map || null,
          emissiveIntensity: 50.0
        });
        child.material = newMat;
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 1 / (maxDim > 0 ? maxDim : 1);
    model.scale.setScalar(scale);
    model.position.sub(center.multiplyScalar(scale));
    model.rotation.x = -Math.PI / 2;
  }
  let asteroidsLoaded = 0;
  const TOTAL_ASTEROID_MODELS = 6;
  const SMALL_ASTEROID_FILES = ['small-asteroid1.glb', 'small-asteroid2.glb', 'small-asteroid3.glb'];
  const MEDIUM_ASTEROID_FILES = ['medium-asteroid1.glb', 'medium-asteroid2.glb'];
  function onAsteroidLoaded() {
    asteroidsLoaded++;
    if (asteroidsLoaded === TOTAL_ASTEROID_MODELS) refreshAsteroidMeshes();
  }
  SMALL_ASTEROID_FILES.forEach((filename, i) => {
    const url = new URL('assets/' + filename, window.location.href).toString();
    loader.load(url, (gltf) => {
      const model = gltf.scene;
      setupAsteroidModel(model);
      smallAsteroidModels[i] = model;
      onAsteroidLoaded();
      console.log('[ship3d] Loaded ' + filename);
    }, undefined, (err) => console.error('[ship3d] Failed to load ' + filename, err));
  });
  MEDIUM_ASTEROID_FILES.forEach((filename, i) => {
    const url = new URL('assets/' + filename, window.location.href).toString();
    loader.load(url, (gltf) => {
      const model = gltf.scene;
      setupAsteroidModel(model);
      mediumAsteroidModels[i] = model;
      onAsteroidLoaded();
      console.log('[ship3d] Loaded ' + filename);
    }, undefined, (err) => console.error('[ship3d] Failed to load ' + filename, err));
  });
  loader.load(new URL('assets/large-asteroid1.glb', window.location.href).toString(), (gltf) => {
    const model = gltf.scene;
    setupAsteroidModel(model);
    largeAsteroidModel = model;
    onAsteroidLoaded();
    console.log('[ship3d] Loaded large-asteroid1.glb');
  }, undefined, (err) => console.error('[ship3d] Failed to load large-asteroid1.glb', err));

  function setupStructureModel(model) {
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        const oldMat = child.material;
        const newMat = new THREE.MeshStandardMaterial({
          color: oldMat.color ? oldMat.color.clone() : 0x888888,
          map: oldMat.map || null,
          roughness: 0.8,
          metalness: 0.2,
          emissive: 0x333333,
          emissiveMap: oldMat.map || null,
          emissiveIntensity: 50.0
        });
        child.material = newMat;
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 1 / (maxDim > 0 ? maxDim : 1);
    model.scale.setScalar(scale);
    model.position.sub(center.multiplyScalar(scale));
    model.rotation.x = Math.PI / 4; // 45°
    model.rotation.y = Math.PI / 4; // 45°
  }
  const STRUCTURE_FILES = [
    { type: 'warpgate', file: 'warp-gate.glb' },
    { type: 'shop', file: 'shop.glb' },
    { type: 'piratebase', file: 'pirate-base.glb' }
  ];
  STRUCTURE_FILES.forEach(({ type, file }) => {
    loader.load(new URL('assets/' + file, window.location.href).toString(), (gltf) => {
      const model = gltf.scene;
      setupStructureModel(model);
      structureModels[type] = model;
      console.log('[ship3d] Loaded ' + file);
      refreshStructureMeshes();
    }, undefined, (err) => console.error('[ship3d] Failed to load ' + file, err));
  });
}

function refreshAsteroidMeshes() {
  const smallLoaded = smallAsteroidModels.every(m => m != null);
  const mediumLoaded = mediumAsteroidModels.every(m => m != null);
  if (!asteroidContainer || !smallLoaded || !mediumLoaded || !largeAsteroidModel) return;
  while (asteroidContainer.children.length) asteroidContainer.remove(asteroidContainer.children[0]);
  const rng = createSeededRandom(levelSeed);
  for (const ast of asteroids) {
    ast._mesh = null;
    let src = null;
    if (ast.radius >= 10 && ast.radius <= 30) {
      const modelIndex = Math.floor(rng() * 3);
      src = smallAsteroidModels[modelIndex];
    } else if (ast.radius >= 40 && ast.radius <= 90) {
      const modelIndex = rng() < 0.8 ? 0 : 1; // 80% medium-asteroid1, 20% medium-asteroid2
      src = mediumAsteroidModels[modelIndex];
    } else if (ast.radius >= 100) {
      src = largeAsteroidModel;
    }
    if (!src) continue;
    ast._initialSpinPhase = rng() * Math.PI * 2;
    const spinAxis = Math.floor(rng() * 3);
    const spinDirection = rng() < 0.5 ? -1 : 1;
    ast._spinSpeed = 0.3 * (0.7 + rng() * 0.6) * (ast.radius >= 100 ? 0.7 : 1);
    ast._spinAxis = spinAxis;
    ast._spinDirection = spinDirection;
    const clone = src.clone(true);
    clone.rotation[['x', 'y', 'z'][spinAxis]] = ast._initialSpinPhase;
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const sizeMult = ast.radius >= 100 ? 1.3 : 1.2;
    const scale = ((ast.radius * 2) / maxDim) * sizeMult;
    clone.scale.setScalar(scale);
    ast._mesh = clone;
    asteroidContainer.add(clone);
  }
}

function refreshStructureMeshes() {
  if (!structureContainer) return;
  const STRUCTURE_SIZE = 40;
  const STRUCTURE_DIAMETER = STRUCTURE_SIZE * 2;
  const STRUCTURE_SCALE_MULT = 2.7; // base
  const scaleMultByType = { warpgate: 1.15, shop: 1.10, piratebase: 1.0 };
  while (structureContainer.children.length) structureContainer.remove(structureContainer.children[0]);
  for (const st of structures) {
    if (st.type !== 'warpgate' && st.type !== 'shop' && st.type !== 'piratebase') continue;
    if (st.type === 'piratebase' && (st.dead || st.health <= 0)) continue;
    const src = structureModels[st.type];
    if (!src) continue;
    const clone = src.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const typeMult = scaleMultByType[st.type] ?? 1.0;
    const scale = (STRUCTURE_DIAMETER / maxDim) * STRUCTURE_SCALE_MULT * typeMult;
    clone.scale.setScalar(scale);
    st._mesh = clone;
    structureContainer.add(clone);
  }
}

function spawnPirateGroup(minCount, maxCount) {
  const count = minCount + Math.floor(Math.random() * (maxCount - minCount + 1));
  const angle = Math.random() * Math.PI * 2;
  const dist = 1100; // Just outside view
  const cx = ship.x + Math.cos(angle) * dist;
  const cy = ship.y + Math.sin(angle) * dist;

  const spreadRadius = 50;
  for (let i = 0; i < count; i++) {
    const r = Math.random() * spreadRadius;
    const a = Math.random() * Math.PI * 2;
    pirates.push({
      x: cx + Math.cos(a) * r,
      y: cy + Math.sin(a) * r,
      vx: 0,
      vy: 0,
      health: PIRATE_HEALTH,
      maxHealth: PIRATE_HEALTH,
      state: 'chase',
      stateTimer: Math.random() * 5,
      cooldown: 1 + Math.random() * 2,
      id: Math.random(),
      facingAngle: angle // Face toward player initially
    });
  }
}

const BASE_DEFENSE_ORBIT_RADIUS = 100;
const BASE_DEFENSE_ORBIT_SPEED = 0.3;

function spawnBaseDefensePirates(st) {
  for (let i = 0; i < 8; i++) {
    const orbitAngle = (i / 8) * Math.PI * 2;
    pirates.push({
      x: st.x + Math.cos(orbitAngle) * BASE_DEFENSE_ORBIT_RADIUS,
      y: st.y + Math.sin(orbitAngle) * BASE_DEFENSE_ORBIT_RADIUS,
      vx: 0,
      vy: 0,
      health: PIRATE_HEALTH,
      maxHealth: PIRATE_HEALTH,
      state: 'chase',
      stateTimer: Math.random() * 5,
      cooldown: 1 + Math.random() * 2,
      id: Math.random(),
      facingAngle: orbitAngle + Math.PI / 2,
      defendingBase: st,
      orbitAngle,
      orbitRadius: BASE_DEFENSE_ORBIT_RADIUS
    });
  }
}

const PIRATE_BASE_AGGRO_RADIUS = 300;
const PIRATE_BASE_HIT_RADIUS = 54;

function onPirateBaseDeath(st) {
  if (st.dead) return;
  st.dead = true;
  for (let k = 0; k < 50; k++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 20 + Math.random() * 40;
    floatingItems.push({
      x: st.x,
      y: st.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      item: 'scrap',
      quantity: 1
    });
  }
  const angle = Math.random() * Math.PI * 2;
  const speed = 15 + Math.random() * 30;
  floatingItems.push({
    x: st.x,
    y: st.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    item: 'warp key',
    quantity: 1
  });
  if (st._mesh && structureContainer) structureContainer.remove(st._mesh);
  st._mesh = null;
}

function updatePirates(dt) {
  // Aggro: player entering radius 300 around any living pirate base
  for (const st of structures) {
    if (st.type !== 'piratebase' || st.dead || st.health <= 0) continue;
    const d = Math.sqrt((ship.x - st.x) ** 2 + (ship.y - st.y) ** 2);
    if (d < PIRATE_BASE_AGGRO_RADIUS) st.aggroed = true;
  }

  // Debug mode: spawn immediately every 5s; normal: wait 2 min before spawns start
  const canSpawn = levelIsDebug || levelElapsedTime >= 120;
  if (canSpawn) {
    pirateSpawnTimer -= dt;
    if (pirateSpawnTimer <= 0) {
      if (levelIsDebug) {
        spawnPirateGroup(6, 10);
        pirateSpawnTimer = 5;
      } else if (levelElapsedTime < 360) {
        // Level 1: 2-6 min — groups of 1-2 every 70-120 s
        spawnPirateGroup(1, 2);
        pirateSpawnTimer = 70 + Math.random() * 50;
      } else {
        // Level 1: after 6 min — groups of 2-4 every 60-100 s
        spawnPirateGroup(2, 4);
        pirateSpawnTimer = 60 + Math.random() * 40;
      }
    }
  }

  const STRUCTURE_SIZE_COLL = 54;
  for (let i = pirates.length - 1; i >= 0; i--) {
    const p = pirates[i];
    let inDefenseMode = false;
    if (p.defendingBase) {
      const base = p.defendingBase;
      if (base.health <= 0 || base.dead || base.aggroed) {
        // treat as normal pirate
      } else {
        inDefenseMode = true;
        p.orbitAngle += dt * BASE_DEFENSE_ORBIT_SPEED;
        p.x = base.x + Math.cos(p.orbitAngle) * (p.orbitRadius || BASE_DEFENSE_ORBIT_RADIUS);
        p.y = base.y + Math.sin(p.orbitAngle) * (p.orbitRadius || BASE_DEFENSE_ORBIT_RADIUS);
        p.vx = 0;
        p.vy = 0;
        p.facingAngle = p.orbitAngle + Math.PI / 2;
      }
    }

    const dx = ship.x - p.x;
    const dy = ship.y - p.y;
    const distToPlayer = Math.sqrt(dx*dx + dy*dy);
    const dirToPlayer = distToPlayer > 0 ? {x: dx/distToPlayer, y: dy/distToPlayer} : {x:0, y:0};

    if (!inDefenseMode) {
      // AI Target / Behavior
      p.stateTimer -= dt;
      if (p.stateTimer <= 0) {
         p.state = Math.random() < 0.6 ? 'chase' : 'circle';
         p.stateTimer = 2 + Math.random() * 4;
      }

      let ax = 0;
      let ay = 0;
      if (p.state === 'chase') {
          ax += dirToPlayer.x * PIRATE_ACCEL;
          ay += dirToPlayer.y * PIRATE_ACCEL;
      } else {
          const cw = (p.id > 0.5) ? 1 : -1;
          ax += -dirToPlayer.y * cw * PIRATE_ACCEL;
          ay += dirToPlayer.x * cw * PIRATE_ACCEL;
      }

      const lookAhead = 150;
      const lookAheadObstacle = 50;
      for (const ast of asteroids) {
          const adx = ast.x - p.x;
          const ady = ast.y - p.y;
          const adist = Math.sqrt(adx*adx + ady*ady);
          if (adist < ast.radius + lookAheadObstacle) {
              ax -= (adx / adist) * 400;
              ay -= (ady / adist) * 400;
          }
      }
      for (const st of structures) {
         if (st.type !== 'warpgate' && st.type !== 'shop' && st.type !== 'piratebase') continue;
         if (st.type === 'piratebase' && (st.dead || st.health <= 0)) continue;
         const sdx = st.x - p.x;
         const sdy = st.y - p.y;
         const sdist = Math.sqrt(sdx*sdx + sdy*sdy);
         if (sdist < STRUCTURE_SIZE_COLL + lookAheadObstacle) {
             ax -= (sdx / sdist) * 400;
             ay -= (sdy / sdist) * 400;
         }
      }
      const PLAYER_AVOID_RADIUS = 20;
      const pdx = ship.x - p.x;
      const pdy = ship.y - p.y;
      const pdist = Math.sqrt(pdx*pdx + pdy*pdy);
      if (pdist > 0 && pdist < PLAYER_AVOID_RADIUS + lookAhead) {
          ax -= (pdx / pdist) * 400;
          ay -= (pdy / pdist) * 400;
      }
      for (const other of pirates) {
          if (other === p) continue;
          const odx = other.x - p.x;
          const ody = other.y - p.y;
          const odist = Math.sqrt(odx*odx + ody*ody);
          if (odist < 40) {
              ax -= (odx / odist) * 200;
              ay -= (ody / odist) * 200;
          }
      }

      p.vx += ax * dt;
      p.vy += ay * dt;

      const thrustMag = Math.sqrt(ax * ax + ay * ay);
      if (thrustMag > 10) {
        const targetAngle = Math.atan2(ay, ax);
        let angleDiff = targetAngle - p.facingAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        p.facingAngle += angleDiff * Math.min(1, 3 * dt);
      }

      p.vx *= Math.max(0, 1 - PIRATE_FRICTION * dt);
      p.vy *= Math.max(0, 1 - PIRATE_FRICTION * dt);

      const speed = Math.sqrt(p.vx*p.vx + p.vy*p.vy);
      if (speed > PIRATE_MAX_SPEED) {
          const scale = PIRATE_MAX_SPEED / speed;
          p.vx *= scale;
          p.vy *= scale;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    // Physics Collisions (Bounce) – pirates do not damage asteroids
    // Asteroids
    for (const ast of asteroids) {
        const cdx = p.x - ast.x;
        const cdy = p.y - ast.y;
        const cdist = Math.sqrt(cdx*cdx + cdy*cdy);
        const minDist = SHIP_COLLISION_RADIUS + ast.radius;
        if (cdist < minDist) {
            const nx = cdx/cdist;
            const ny = cdy/cdist;
            const overlap = minDist - cdist;
            p.x += nx * overlap;
            p.y += ny * overlap;
            const impact = p.vx * nx + p.vy * ny;
            if (impact < 0) {
                p.vx -= 1.3 * impact * nx;
                p.vy -= 1.3 * impact * ny;
            }
        }
    }
    // Structures
    for (const st of structures) {
        if (st.type !== 'warpgate' && st.type !== 'shop' && st.type !== 'piratebase') continue;
        if (st.type === 'piratebase' && (st.dead || st.health <= 0)) continue;
        const cdx = p.x - st.x;
        const cdy = p.y - st.y;
        const cdist = Math.sqrt(cdx*cdx + cdy*cdy);
        const minDist = SHIP_COLLISION_RADIUS + STRUCTURE_SIZE_COLL;
        if (cdist < minDist) {
            const nx = cdx/cdist;
            const ny = cdy/cdist;
            const overlap = minDist - cdist;
            p.x += nx * overlap;
            p.y += ny * overlap;
            const impact = p.vx * nx + p.vy * ny;
            if (impact < 0) {
                p.vx -= 1.3 * impact * nx;
                p.vy -= 1.3 * impact * ny;
            }
        }
    }

    // Firing (defense-mode pirates do not shoot)
    if (!inDefenseMode) {
    p.cooldown -= dt;
    if (p.cooldown <= 0 && distToPlayer < 700) {
         p.cooldown = 1.0 + Math.random() * 2.0;
         
         // Anticipate: use pirate bullet speed so lead matches travel time
         const timeToHit = distToPlayer / PIRATE_BULLET_SPEED;
         const predX = ship.x + ship.vx * timeToHit;
         const predY = ship.y + ship.vy * timeToHit;
         
         const aimX = predX + (Math.random()-0.5) * 60;
         const aimY = predY + (Math.random()-0.5) * 60;
         
         const fdx = aimX - p.x;
         const fdy = aimY - p.y;
         const fdist = Math.sqrt(fdx*fdx + fdy*fdy);
         const fdir = (fdist > 0) ? {x: fdx/fdist, y: fdy/fdist} : {x:1, y:0};
         
         bullets.push({
             x: p.x + fdir.x * SHIP_SIZE,
             y: p.y + fdir.y * SHIP_SIZE,
             vx: fdir.x * PIRATE_BULLET_SPEED + p.vx,
             vy: fdir.y * PIRATE_BULLET_SPEED + p.vy,
             lifespan: 4,
             owner: 'pirate'
         });
    }
    }

    // Death: drop 3-5 scrap only if not fromBaseSpawn
    if (p.health <= 0) {
        spawnSparks(p.x, p.y, 15);
        if (!p.fromBaseSpawn) {
          const scrapCount = 3 + Math.floor(Math.random() * 3);
          for (let k = 0; k < scrapCount; k++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 20 + Math.random() * 40;
            floatingItems.push({
              x: p.x,
              y: p.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              item: 'scrap',
              quantity: 1
            });
          }
        }
        pirates.splice(i, 1);
    }
  }
}

function update(dt) {
  levelElapsedTime += dt;
  // Ship movement (right-click) - only if there's a direction to move
  if (rightMouseDown && player.fuel > 0) {
    const dx = mouseX - WIDTH / 2;
    const dy = mouseY - HEIGHT / 2;
    const dir = normalize(dx, dy);
    // Only apply thrust and consume fuel if there's a direction
    if (dir.x !== 0 || dir.y !== 0) {
      ship.vx += dir.x * ACCEL * dt;
      ship.vy += dir.y * ACCEL * dt;
      player.fuel = Math.max(0, player.fuel - FUEL_DEPLETION_RATE * dt);
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
        // Asteroid takes half the damage the player takes
        const currentHealth = ast.health ?? ast.radius;
        ast.health = Math.max(0, currentHealth - damage / 2);
      }
    }
  }

  // Ship–warp gate and shop collision (radius 35% bigger than base 40)
  const STRUCTURE_SIZE_COLL = 54;
  for (const st of structures) {
    if (st.type !== 'warpgate' && st.type !== 'shop' && st.type !== 'piratebase') continue;
    if (st.type === 'piratebase' && (st.dead || st.health <= 0)) continue;
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

  // Mining lasers (light + medium): unified logic via MINING_LASER_STATS
  const hasEnergy = getFirstChargedCell() != null;
  const selectedItem = hotbar[selectedSlot];
  const miningLaser = selectedItem && MINING_LASER_STATS[selectedItem.item] ? selectedItem : null;
  const laserStats = miningLaser ? MINING_LASER_STATS[miningLaser.item] : null;

  if (miningLaser && laserStats && miningLaser.heat != null) {
    if (miningLaser.heat >= 1) miningLaser.overheated = true;
    if (miningLaser.heat <= 0) miningLaser.overheated = false;

    const canFire = !miningLaser.overheated;
    if (miningLaser && leftMouseDown && hasEnergy && canFire) {
      miningLaser.heat = Math.min(1, miningLaser.heat + laserStats.heatRate * dt);
      const cell = getFirstChargedCell();
      if (cell) cell.energy = Math.max(0, cell.energy - laserStats.energyDrain * dt);

      const dx = mouseX - WIDTH / 2;
      const dy = mouseY - HEIGHT / 2;
      const dir = normalize(dx, dy);
      if (dir.x !== 0 || dir.y !== 0) {
        const hit = laserHitAsteroid(ship.x, ship.y, dir.x, dir.y, 1500);
        
        // Check Pirates for laser hit
        let hitPirate = null;
        let pirateDist = 1500;
        for (const p of pirates) {
             const fx = p.x - ship.x;
             const fy = p.y - ship.y;
             const t = fx * dir.x + fy * dir.y;
             if (t < 0) continue;
             const cx = ship.x + dir.x * t;
             const cy = ship.y + dir.y * t;
             const distSq = (p.x - cx)*(p.x - cx) + (p.y - cy)*(p.y - cy);
             const r = SHIP_COLLISION_RADIUS + 4;
             if (distSq < r*r) {
                 const offset = Math.sqrt(r*r - distSq);
                 const tHit = t - offset;
                 if (tHit > 0 && tHit < pirateDist) {
                     pirateDist = tHit;
                     hitPirate = p;
                 }
             }
        }

        const hitBase = laserHitPirateBase(ship.x, ship.y, dir.x, dir.y, 1500);
        const baseDist = hitBase ? hitBase.distance : 1500;

        let target = null;
        let hitDist = 1500;
        if (hit && hitPirate && hitBase) {
            if (hit.distance <= pirateDist && hit.distance <= baseDist) {
                target = hit.asteroid;
                hitDist = hit.distance;
            } else if (pirateDist <= baseDist) {
                target = hitPirate;
                hitDist = pirateDist;
            } else {
                target = hitBase.structure;
                hitDist = baseDist;
            }
        } else if (hit && hitPirate) {
            if (hit.distance < pirateDist) {
                target = hit.asteroid;
                hitDist = hit.distance;
            } else {
                target = hitPirate;
                hitDist = pirateDist;
            }
        } else if (hit && hitBase) {
            if (hit.distance < baseDist) {
                target = hit.asteroid;
                hitDist = hit.distance;
            } else {
                target = hitBase.structure;
                hitDist = baseDist;
            }
        } else if (hitPirate && hitBase) {
            if (pirateDist < baseDist) {
                target = hitPirate;
                hitDist = pirateDist;
            } else {
                target = hitBase.structure;
                hitDist = baseDist;
            }
        } else if (hit) {
            target = hit.asteroid;
            hitDist = hit.distance;
        } else if (hitPirate) {
            target = hitPirate;
            hitDist = pirateDist;
        } else if (hitBase) {
            target = hitBase.structure;
            hitDist = baseDist;
        }

        if (target) {
          target.health -= laserStats.dps * dt;
          if (target.defendingBase) target.defendingBase.aggroed = true;
          if (target.type === 'piratebase') {
            target.aggroed = true;
            if (target.health <= 0) onPirateBaseDeath(target);
          }
          const hitX = ship.x + dir.x * hitDist;
          const hitY = ship.y + dir.y * hitDist;
          sparkCarry += 60 * dt;
          const n = Math.floor(sparkCarry);
          if (n > 0) {
            spawnSparks(hitX, hitY, n);
            sparkCarry -= n;
          }
        }
      }
    } else {
      miningLaser.heat = Math.max(0, miningLaser.heat - laserStats.coolRate * dt);
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

  updatePirates(dt);

  // Pirate base: spawn 4 pirates every 30s when aggroed (orthogonal directions)
  const BASE_SPAWN_OFFSET = 80;
  const BASE_SPAWN_INTERVAL = 30;
  for (const st of structures) {
    if (st.type !== 'piratebase' || st.dead || st.health <= 0 || !st.aggroed) continue;
    st.spawnTimer -= dt;
    if (st.spawnTimer <= 0) {
      st.spawnTimer = BASE_SPAWN_INTERVAL;
      const offsets = [
        [BASE_SPAWN_OFFSET, 0],
        [-BASE_SPAWN_OFFSET, 0],
        [0, BASE_SPAWN_OFFSET],
        [0, -BASE_SPAWN_OFFSET]
      ];
      for (const [ox, oy] of offsets) {
        const angle = Math.atan2(ship.y - (st.y + oy), ship.x - (st.x + ox));
        pirates.push({
          x: st.x + ox,
          y: st.y + oy,
          vx: 0,
          vy: 0,
          health: PIRATE_HEALTH,
          maxHealth: PIRATE_HEALTH,
          state: 'chase',
          stateTimer: Math.random() * 5,
          cooldown: 1 + Math.random() * 2,
          id: Math.random(),
          facingAngle: angle,
          fromBaseSpawn: true
        });
      }
    }
  }

  // Bullets (movement + bullet-asteroid collision)
  const BULLET_DAMAGE = 4;            // pirate bullet damage to player
  const BULLET_DAMAGE_PIRATE = 2.5;  // light blaster damage per pellet to pirates
  const BULLET_DAMAGE_ASTEROID = 0.25; // pellets deal only 0.25 to asteroids
  const VIEWPORT_HALF_W = WIDTH / 2;
  const VIEWPORT_HALF_H = HEIGHT / 2;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.lifespan -= dt;
    let remove = b.lifespan <= 0;
    if (!remove) {
      const screenX = b.x - ship.x + VIEWPORT_HALF_W;
      const screenY = b.y - ship.y + VIEWPORT_HALF_H;
      if (screenX < 0 || screenX > WIDTH || screenY < 0 || screenY > HEIGHT) remove = true;
    }
    if (!remove) {
      // Check Asteroids (bullet stops on hit; only player bullets damage)
      for (const ast of asteroids) {
        const dx = b.x - ast.x;
        const dy = b.y - ast.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < ast.radius) {
          if (b.owner === 'player') ast.health -= BULLET_DAMAGE_ASTEROID;
          remove = true;
          break;
        }
      }

      // Check Pirate Base (player bullets only)
      if (!remove && b.owner === 'player') {
        for (const st of structures) {
          if (st.type !== 'piratebase' || st.dead || st.health <= 0) continue;
          const dx = b.x - st.x;
          const dy = b.y - st.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < PIRATE_BASE_HIT_RADIUS) {
            st.health -= BULLET_DAMAGE_PIRATE;
            st.aggroed = true;
            remove = true;
            spawnSparks(b.x, b.y, 4);
            if (st.health <= 0) onPirateBaseDeath(st);
            break;
          }
        }
      }

      // Check Pirates (Player bullets)
      if (!remove && b.owner === 'player') {
        for (const p of pirates) {
            const dx = b.x - p.x;
            const dy = b.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < SHIP_COLLISION_RADIUS + 4) {
                p.health -= BULLET_DAMAGE_PIRATE;
                if (p.defendingBase) p.defendingBase.aggroed = true;
                remove = true;
                spawnSparks(b.x, b.y, 2);
                break;
            }
        }
      }
      
      // Check Player (Pirate bullets)
      if (!remove && b.owner === 'pirate') {
          const dx = b.x - ship.x;
          const dy = b.y - ship.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < SHIP_COLLISION_RADIUS) {
              player.health = Math.max(0, player.health - BULLET_DAMAGE);
              remove = true;
              spawnSparks(b.x, b.y, 4);
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

  // Check for destroyed asteroids and drop ore (diminishing returns: +10 at tier 1, then decreases by 1 every 2 tiers, min +4)
  function calculateOreCount(radius) {
    const tier = Math.floor(radius / 10);
    if (tier <= 0) return 0;
    if (tier === 1) return 10;
    let ore = 10; // tier 1 base
    for (let t = 2; t <= tier; t++) {
      const increment = Math.max(4, 11 - Math.ceil(t / 2));
      ore += increment;
    }
    return ore;
  }
  for (let i = asteroids.length - 1; i >= 0; i--) {
    if (asteroids[i].health <= 0) {
      const ast = asteroids[i];
      if (ast._mesh && asteroidContainer) asteroidContainer.remove(ast._mesh);
      const oreCount = calculateOreCount(ast.radius);
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
    const STRUCTURE_SIZE_COLL = 54;
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
      if (st.type !== 'warpgate' && st.type !== 'shop' && st.type !== 'piratebase') continue;
      if (st.type === 'piratebase' && (st.dead || st.health <= 0)) continue;
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
      } else if (item.item === 'medium mining laser' && item.heat != null) {
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

function render(dt = 1 / 60) {
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

  // Asteroids (2D circles; radius 10-30 use 3D model instead)
  for (const ast of asteroids) {
    if ((ast.radius >= 10 && ast.radius <= 30) || (ast.radius >= 40 && ast.radius <= 90) || ast.radius >= 100) continue;
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

  // Pirates
  for (const p of pirates) {
      const { x, y } = worldToScreen(p.x, p.y);
      if (x < -30 || x > WIDTH+30 || y < -30 || y > HEIGHT+30) continue;
      
      // Use stored facing angle (thrust direction, not velocity)
      const angle = p.facingAngle;
      
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle + Math.PI/2); // +90° because triangle points "up" at angle 0
      
      ctx.fillStyle = '#ff4444';
      ctx.strokeStyle = '#882222';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const s = SHIP_SIZE + 2;
      ctx.moveTo(0, -s);
      ctx.lineTo(s*0.7, s);
      ctx.lineTo(0, s*0.5);
      ctx.lineTo(-s*0.7, s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      
      // Health Bar
      if (p.health < p.maxHealth) {
          const barW = 32;
          const barH = 4;
          const pct = Math.max(0, p.health / p.maxHealth);
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(x - barW/2, y - 25, barW, barH);
          ctx.fillStyle = '#ff3333';
          ctx.fillRect(x - barW/2, y - 25, barW * pct, barH);
      }
  }

  // Floating items in space
  for (const item of floatingItems) {
    const { x, y } = worldToScreen(item.x, item.y);
    if (x < -20 || x > WIDTH + 20 || y < -20 || y > HEIGHT + 20) continue;
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
                    (item.item === 'scrap' ? '#888888' : 
                    (item.item === 'warp key' ? '#B8860B' : 
                    '#aa8844'))))))))));
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = item.energy != null ? '#66cc66' : (item.fuel != null ? '#cc8844' : (item.oxygen != null ? '#6699cc' : (item.item === 'light blaster' ? '#8866dd' : (item.heat != null ? '#cc6633' : (item.item === 'scrap' ? '#aaaaaa' : (item.item === 'warp key' ? '#DAA520' : '#ccaa66'))))));
    ctx.lineWidth = 2;
    ctx.stroke();
    // Item icon: image for fuel/energy/oxygen, else letter fallback
    const img = ITEM_IMAGES[item.item];
    if (img && img.complete && img.naturalWidth > 0) {
      const size = 18;
      ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
    } else {
      const icon = item.item === 'cuprite' ? 'C' : 
                   (item.item === 'hematite' ? 'H' : 
                   (item.item === 'aurite' ? 'A' : 
                   (item.item === 'diamite' ? 'D' : 
                   (item.item === 'platinite' ? 'P' : 
                   (item.item === 'scrap' ? 'S' : 
                   (item.item === 'warp key' ? 'K' : 
                   (item.item === 'mining laser' ? 'L' : (item.item === 'medium mining laser' ? 'M' : (item.item === 'light blaster' ? 'B' : item.item.charAt(0).toUpperCase())))))))));
      ctx.fillStyle = '#fff';
      ctx.font = '10px Oxanium';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, x, y);
    }
    // Quantity if > 1
    if (item.quantity > 1) {
      ctx.fillStyle = '#ffcc00';
      ctx.font = '8px Oxanium';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(item.quantity, x + 12, y + 12);
    }
  }

  // Structures (circles underneath 3D models; 2D circles for other types)
  const STRUCTURE_RADIUS_3D = 54; // 35% bigger than 40
  const WARP_GATE_DASHED_EXTRA_3D = 108; // 80 * 1.35
  const SHOP_DASHED_EXTRA_3D = 108;
  const STRUCTURE_SIZE = 40;
  const WARP_GATE_DASHED_EXTRA = 80;
  const SHOP_DASHED_EXTRA = 80;
  const STRUCTURE_STYLES = { shop: '#446688', shipyard: '#664466', refinery: '#666644', fueling: '#446644', warpgate: '#6644aa', piratebase: '#884422' };
  for (const st of structures) {
    if (st.type === 'piratebase' && (st.dead || st.health <= 0)) continue;
    const is3D = st.type === 'warpgate' || st.type === 'shop' || st.type === 'piratebase';
    const r = is3D ? STRUCTURE_RADIUS_3D : STRUCTURE_SIZE;
    const cullR = st.type === 'warpgate' ? STRUCTURE_RADIUS_3D + WARP_GATE_DASHED_EXTRA_3D : (st.type === 'shop' ? STRUCTURE_RADIUS_3D + SHOP_DASHED_EXTRA_3D : (st.type === 'piratebase' ? PIRATE_BASE_AGGRO_RADIUS : r));
    const { x, y } = worldToScreen(st.x, st.y);
    if (x + cullR < 0 || x - cullR > WIDTH || y + cullR < 0 || y - cullR > HEIGHT) continue;
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    if (is3D) {
      if (st.type === 'warpgate') {
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.arc(x, y, STRUCTURE_RADIUS_3D + WARP_GATE_DASHED_EXTRA_3D, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (st.type === 'shop') {
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.arc(x, y, STRUCTURE_RADIUS_3D + SHOP_DASHED_EXTRA_3D, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (st.type === 'piratebase') {
        ctx.strokeStyle = STRUCTURE_STYLES.piratebase;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.arc(x, y, PIRATE_BASE_AGGRO_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // Health bar when damaged
        if (st.health < st.maxHealth) {
          const barW = 90;
          const barH = 6;
          const pct = Math.max(0, st.health / st.maxHealth);
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(x - barW/2, y - STRUCTURE_RADIUS_3D - 20, barW, barH);
          ctx.fillStyle = '#ff3333';
          ctx.fillRect(x - barW/2, y - STRUCTURE_RADIUS_3D - 20, barW * pct, barH);
        }
      }
    } else {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = STRUCTURE_STYLES[st.type] || '#446688';
      ctx.fill();
      if (st.type === 'warpgate') {
        ctx.stroke();
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.arc(x, y, STRUCTURE_SIZE + WARP_GATE_DASHED_EXTRA, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (st.type === 'shop') {
        ctx.stroke();
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.arc(x, y, STRUCTURE_SIZE + SHOP_DASHED_EXTRA, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.stroke();
      }
    }
    if (is3D) continue;
    ctx.fillStyle = '#fff';
    ctx.font = '14px Oxanium';
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

  // Update 3D asteroid positions (camera-follow coordinates; negate Y to match 2D canvas)
  for (const ast of asteroids) {
    if (ast._mesh) {
      ast._mesh.position.set(ast.x - ship.x, -(ast.y - ship.y), 0);
      const spin = (ast._spinSpeed ?? 0.3) * (ast._spinDirection ?? 1) * dt;
      if (ast._spinAxis === 0) ast._mesh.rotation.x += spin;
      else if (ast._spinAxis === 1) ast._mesh.rotation.y += spin;
      else ast._mesh.rotation.z += spin;
    }
  }

  // Update 3D structure positions (camera-follow coordinates; negate Y to match 2D canvas)
  for (const st of structures) {
    if (st._mesh) {
      const yOff = st.type === 'shop' ? 4 : 0;
      st._mesh.position.set(st.x - ship.x, -(st.y - ship.y) + yOff, 0);
    }
  }

  // Ship: 3D model if loaded, else 2D triangle
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const aimAngle = Math.atan2(mouseY - cy, mouseX - cx);
  // Always clear the ship canvas so it stays transparent before model load.
  if (shipRenderer) shipRenderer.clear();
  if (shipModelLoaded && shipMesh && shipRenderer && shipScene && shipCamera) {
    // Tilt when turning, decay when resting
    if (!shipTiltInitialized) {
      prevAimAngle = aimAngle;
      shipTiltInitialized = true;
    }
    let deltaAngle = aimAngle - prevAimAngle;
    while (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
    while (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
    prevAimAngle = aimAngle;
    const TILT_SENSITIVITY = 8;
    const TILT_DECAY = 4;
    shipTilt += deltaAngle * TILT_SENSITIVITY - shipTilt * TILT_DECAY * dt;
    shipTilt = Math.max(-0.5, Math.min(0.5, shipTilt));
    shipMesh.rotation.y = aimAngle + Math.PI / 2;
    shipMesh.rotation.z = shipTilt;
    // Show thruster flames when thrusting
    const thrustDx = mouseX - WIDTH / 2;
    const thrustDy = mouseY - HEIGHT / 2;
    const isThrusting = rightMouseDown && player.fuel > 0 && (thrustDx !== 0 || thrustDy !== 0);
    for (const flame of shipFlames) {
      flame.visible = isThrusting;
      flame.rotation.z = shipTilt; // Tilt flames with ship
      if (isThrusting) {
        // Animate flame length from base (oscillate between 0.7 and 1.3)
        const flicker = 1 + 0.3 * Math.sin(performance.now() * 0.02);
        flame.scale.set(1, 1, flicker);
      }
    }
    shipRenderer.render(shipScene, shipCamera);
  } else {
    drawShip2D();
  }
  drawCrosshairAndHeatBar();

  // Mining laser beam (orange-red line) - any mining laser in MINING_LASER_STATS
  const hasEnergy = getFirstChargedCell() != null;
  const selectedItem = hotbar[selectedSlot];
  const miningLaser = selectedItem && MINING_LASER_STATS[selectedItem.item] ? selectedItem : null;
  const canFire = miningLaser && !miningLaser.overheated;
  if (miningLaser && leftMouseDown && hasEnergy && canFire) {
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    const dx = mouseX - cx;
    const dy = mouseY - cy;
    const dir = normalize(dx, dy);
    let laserLength = 1500;
    
    // Check for asteroid or pirate hit and shorten laser (stop before surface)
    if (dir.x !== 0 || dir.y !== 0) {
      const hit = laserHitAsteroid(ship.x, ship.y, dir.x, dir.y, 1500);
      if (hit) {
        laserLength = Math.min(laserLength, Math.max(0, hit.distance - 10));
      }
      // Check pirates: ray-circle intersection, use closest hit
      const pirateRadius = SHIP_COLLISION_RADIUS + 4;
      for (const p of pirates) {
        const fx = p.x - ship.x;
        const fy = p.y - ship.y;
        const t = fx * dir.x + fy * dir.y;
        if (t < 0) continue;
        const cxW = ship.x + dir.x * t;
        const cyW = ship.y + dir.y * t;
        const distSq = (p.x - cxW) * (p.x - cxW) + (p.y - cyW) * (p.y - cyW);
        if (distSq < pirateRadius * pirateRadius) {
          const offset = Math.sqrt(pirateRadius * pirateRadius - distSq);
          const tHit = t - offset;
          if (tHit > 0 && tHit < laserLength) {
            laserLength = Math.max(0, tHit - 4);
          }
        }
      }
      // Check pirate bases: ray-circle intersection (radius 54)
      const baseHit = laserHitPirateBase(ship.x, ship.y, dir.x, dir.y, laserLength);
      if (baseHit) {
        laserLength = Math.min(laserLength, Math.max(0, baseHit.distance - 10));
      }
    }
    const x1 = cx + dir.x * SHIP_SIZE;
    const y1 = cy + dir.y * SHIP_SIZE;
    let maxL = laserLength;
    if (dir.x > 0) maxL = Math.min(maxL, (WIDTH - x1) / dir.x);
    else if (dir.x < 0) maxL = Math.min(maxL, -x1 / dir.x);
    if (dir.y > 0) maxL = Math.min(maxL, (HEIGHT - y1) / dir.y);
    else if (dir.y < 0) maxL = Math.min(maxL, -y1 / dir.y);
    laserLength = Math.max(0, Math.min(laserLength, maxL));
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
  if (uiCtx) {
    const meterWidth = 40;
    const meterSpacing = 50;
    const meterY = HEIGHT - 20;

    function drawMeter(x, value, max, color, label) {
      const barHeight = max * 2; // 2 pixels per unit
      const fillH = (value / max) * barHeight;
      // Background
      uiCtx.fillStyle = '#222';
      uiCtx.fillRect(x - meterWidth / 2, meterY - barHeight, meterWidth, barHeight);
      // Fill
      uiCtx.fillStyle = color;
      uiCtx.fillRect(x - meterWidth / 2, meterY - fillH, meterWidth, fillH);
      // Border
      uiCtx.strokeStyle = '#555';
      uiCtx.lineWidth = 1;
      uiCtx.strokeRect(x - meterWidth / 2, meterY - barHeight, meterWidth, barHeight);
      // Label
      uiCtx.fillStyle = '#aaa';
      uiCtx.font = '10px Oxanium';
      uiCtx.textAlign = 'center';
      uiCtx.textBaseline = 'top';
      uiCtx.fillText(label, x, meterY + 4);
      // Value
      uiCtx.fillStyle = '#fff';
      uiCtx.textBaseline = 'bottom';
      uiCtx.fillText(value.toFixed(1), x, meterY - barHeight - 2);
    }

    const rightmost = WIDTH - 30;
    drawMeter(rightmost - 100, player.oxygen, player.maxOxygen, '#44aaff', 'O2');
    drawMeter(rightmost - 50, player.fuel, player.maxFuel, '#ffaa44', 'Fuel');
    drawMeter(rightmost, player.health, player.maxHealth, '#ff4444', 'HP');
  }
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
  const interactRadius = 54 + 108; // base 35% bigger
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
  const interactRadius = 54 + 108; // base 35% bigger
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
  if (item.energy != null || item.fuel != null || item.oxygen != null || (item.item === 'mining laser' && item.heat != null) || (item.item === 'medium mining laser' && item.heat != null) || (item.item === 'light blaster' && item.heat != null)) {
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
const ITEM_BUY_PRICE = { 'small energy cell': 150, 'medium energy cell': 550, 'oxygen canister': 500, 'fuel tank': 300, 'light blaster': 1000, 'medium mining laser': 1500 };
const ITEM_SELL_PRICE = { cuprite: 10, 'oxygen canister': 10, hematite: 15, 'fuel tank': 20, aurite: 25, diamite: 50, platinite: 75, scrap: 25, 'warp key': 500, 'mining laser': 300, 'light blaster': 500, 'medium mining laser': 750 };
const shopBuySlots = Array(15).fill(null);
const shopSellSlots = Array(15).fill(null);

function initShopBuySlots() {
  // Slot 0: light blaster; 1: medium mining laser; 2-7: small energy cell; 8-9: medium energy cell; 10-12: fuel; 13-14: oxygen
  shopBuySlots[0] = { item: 'light blaster', heat: 0, overheated: false };
  shopBuySlots[1] = { item: 'medium mining laser', heat: 0, overheated: false };
  for (let i = 2; i < 8; i++) {
    shopBuySlots[i] = { item: 'small energy cell', energy: 10, maxEnergy: 10 };
  }
  shopBuySlots[8] = { item: 'medium energy cell', energy: 30, maxEnergy: 30 };
  shopBuySlots[9] = { item: 'medium energy cell', energy: 30, maxEnergy: 30 };
  for (let i = 10; i < 13; i++) {
    shopBuySlots[i] = { item: 'fuel tank', fuel: 10, maxFuel: 10 };
  }
  for (let i = 13; i < 15; i++) {
    shopBuySlots[i] = { item: 'oxygen canister', oxygen: 10, maxOxygen: 10 };
  }
}

function getShopItemPayload(itemKey) {
  if (itemKey === 'small energy cell') {
    return { item: 'small energy cell', energy: 10, maxEnergy: 10 };
  }
  if (itemKey === 'medium energy cell') {
    return { item: 'medium energy cell', energy: 30, maxEnergy: 30 };
  }
  if (itemKey === 'oxygen canister') {
    return { item: 'oxygen canister', oxygen: 10, maxOxygen: 10 };
  }
  if (itemKey === 'light blaster') {
    return { item: 'light blaster', heat: 0, overheated: false };
  }
  if (itemKey === 'medium mining laser') {
    return { item: 'medium mining laser', heat: 0, overheated: false };
  }
  return { item: itemKey };
}

function getItemLabel(it) {
  if (!it) return '';
  if (it.item === 'mining laser') return 'L';
  if (it.item === 'medium mining laser') return 'M';
  if (it.item === 'light blaster') return 'B';
  if (it.item === 'small energy cell') return 'E';
  if (it.item === 'medium energy cell') return 'M';
  if (it.item === 'fuel tank') return 'F';
  if (it.item === 'oxygen canister') return 'O';
  if (it.item === 'cuprite') return 'C';
  if (it.item === 'hematite') return 'H';
  if (it.item === 'aurite') return 'A';
  if (it.item === 'diamite') return 'D';
  if (it.item === 'platinite') return 'P';
  if (it.item === 'scrap') return 'S';
  if (it.item === 'warp key') return 'K';
  return (it.item && it.item.charAt(0).toUpperCase()) || '';
}

function getSlotHTML(it) {
  let html = '';
  if (it) {
    const imgPath = getItemImagePath(it.item);
    if (imgPath) {
      html += `<img src="${imgPath}" class="slot-icon slot-icon-img" alt="">`;
    } else {
      html += `<span class="slot-icon">${getItemLabel(it)}</span>`;
    }
    
    // Mining laser: heat bar (red)
    if (it.item === 'mining laser' && it.heat != null) {
      const fillH = Math.round(32 * it.heat);
      html += `<div class="slot-bar"><div class="slot-bar-fill" style="height:${fillH}px;background:#cc2222;"></div></div>`;
    }
    // Medium mining laser: heat bar (red)
    if (it.item === 'medium mining laser' && it.heat != null) {
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

const SMALL_ENERGY_CELL_FULL_SELL = 150;
const MEDIUM_ENERGY_CELL_FULL_SELL = 550;
const ENERGY_CELL_MIN_SELL = 10;

function getItemSellPrice(item) {
  if (!item) return 0;
  // Small energy cell: proportional to charge, min ENERGY_CELL_MIN_SELL cr
  if (item.item === 'small energy cell' && item.energy != null && item.maxEnergy != null) {
    const chargeRatio = item.maxEnergy > 0 ? item.energy / item.maxEnergy : 0;
    return Math.max(ENERGY_CELL_MIN_SELL, Math.round(SMALL_ENERGY_CELL_FULL_SELL * chargeRatio));
  }
  // Medium energy cell: proportional to charge, min ENERGY_CELL_MIN_SELL cr
  if (item.item === 'medium energy cell' && item.energy != null && item.maxEnergy != null) {
    const chargeRatio = item.maxEnergy > 0 ? item.energy / item.maxEnergy : 0;
    return Math.max(ENERGY_CELL_MIN_SELL, Math.round(MEDIUM_ENERGY_CELL_FULL_SELL * chargeRatio));
  }
  // Fuel cell: 2 when full, 1 when >0
  if (item.item === 'fuel tank' && item.fuel != null && item.maxFuel != null) {
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
      'small energy cell': 'Small Energy Cell',
      'medium energy cell': 'Medium Energy Cell', 
      'fuel tank': 'Fuel Tank', 
      'oxygen canister': 'Oxygen Canister',
      'light blaster': 'Light Blaster',
      'medium mining laser': 'Medium Mining Laser',
      cuprite: 'Cuprite',
      hematite: 'Hematite',
      aurite: 'Aurite',
      diamite: 'Diamite',
      platinite: 'Platinite'
    };
    let html = '';
    const sortedPrices = Object.entries(ITEM_BUY_PRICE).sort((a, b) => a[1] - b[1]);
    for (const [itemKey, price] of sortedPrices) {
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
      if (payBtn) payBtn.disabled = player.credits < 3000;
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
  structures = (levelData.structures || []).map(s => {
    const st = {
      x: Number(s.x) || 0,
      y: Number(s.y) || 0,
      type: String(s.type || 'shop')
    };
    if (st.type === 'piratebase') {
      st.health = 150;
      st.maxHealth = 150;
      st.aggroed = false;
      st.spawnTimer = 0;
    }
    return st;
  });
  floatingItems.length = 0; // Clear floating items on level load
  pirates.length = 0; // Clear pirates on level load
  for (const st of structures) {
    if (st.type === 'piratebase') spawnBaseDefensePirates(st);
  }
  levelElapsedTime = 0;
  levelIsDebug = levelData.debug === true;
  pirateSpawnTimer = levelIsDebug ? 5 : 0; // Debug: first spawn at 5s; normal: first spawn at 2 min
  // Regenerate stars: same density as a 3000x3000 level, using level seed for reproducibility
  levelSeed = typeof levelData.seed === 'number' ? levelData.seed >>> 0 : 0;
  const rng = createSeededRandom(levelSeed);
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
  refreshAsteroidMeshes();
  refreshStructureMeshes();
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
    if (player.credits >= 3000) {
      player.credits -= 3000;
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

function setDragGhostContent(it, label, qtyText) {
  const ghost = document.getElementById('shop-drag-ghost');
  if (!ghost) return;
  const imgPath = it ? getItemImagePath(it.item) : null;
  if (imgPath) {
    if (qtyText) {
      ghost.innerHTML = `<img src="${imgPath}" alt=""><span class="slot-qty">${qtyText}</span>`;
    } else {
      ghost.innerHTML = `<img src="${imgPath}" alt="">`;
    }
  } else {
    if (qtyText) {
      ghost.innerHTML = `${label}<span class="slot-qty">${qtyText}</span>`;
    } else {
      ghost.textContent = label;
    }
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
  setDragGhostContent(it, getItemLabel(it), qty);
  setDragGhostPos(clientX, clientY);
  setDragGhostVisible(true);
}

function beginDragFromBuy(buyIndex, clientX, clientY) {
  const it = shopBuySlots[buyIndex];
  if (!it) return;
  const price = ITEM_BUY_PRICE[it.item] || 0;
  inventoryDrag = { kind: 'buy', fromBuySlot: buyIndex, price };
  const qty = it.quantity != null ? String(it.quantity) : (it.energy != null ? String(Math.round(it.energy)) : (it.fuel != null ? String(Math.round(it.fuel)) : (it.oxygen != null ? String(Math.round(it.oxygen)) : (it.heat != null ? String(Math.round(it.heat * 100)) : ''))));
  setDragGhostContent(it, getItemLabel(it), qty);
  setDragGhostPos(clientX, clientY);
  setDragGhostVisible(true);
}

function beginDragFromSell(sellIndex, clientX, clientY) {
  const it = shopSellSlots[sellIndex];
  if (!it) return;
  inventoryDrag = { kind: 'sell', fromSellSlot: sellIndex };
  const qty = it.quantity != null ? String(it.quantity) : (it.energy != null ? String(Math.round(it.energy)) : (it.fuel != null ? String(Math.round(it.fuel)) : (it.oxygen != null ? String(Math.round(it.oxygen)) : (it.heat != null ? String(Math.round(it.heat * 100)) : ''))));
  setDragGhostContent(it, getItemLabel(it), qty);
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

  // Handle drop on fuel bar: fuel tank adds 10 fuel
  if (isOverFuelBar && drag.kind === 'hotbar') {
    const from = drag.fromSlot;
    const it = hotbar[from];
    if (it && it.item === 'fuel tank') {
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
      // Shift+click (with shop open): transfer item to first empty sell slot
      if (e.shiftKey && shopMenuOpen) {
        const it = hotbar[slotIndex];
        const firstEmpty = shopSellSlots.findIndex(s => !s);
        if (firstEmpty >= 0) {
          shopSellSlots[firstEmpty] = { ...it };
          hotbar[slotIndex] = null;
          syncShopSellArea();
          updateHUD();
        }
        return;
      }
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
        if (it && it.item === 'fuel tank' && under && under.closest('#fuel-bar-drop-zone')) {
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
initShip3D();
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
  render(dt);
  updateHUD(); // Sync HUD every frame (or could optimize to only when changed)

  requestAnimationFrame(gameLoop);
}
// #region agent log
fetch('http://127.0.0.1:7244/ingest/ae77f125-e06b-4be8-98c6-edf46bc847e3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.js:end',message:'Script fully parsed, starting gameLoop',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
// #endregion
requestAnimationFrame(gameLoop);
