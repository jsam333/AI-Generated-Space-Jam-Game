import { WIDTH, HEIGHT, ACCEL, FRICTION, BRAKE_FRICTION, MAX_SPEED_DEFAULT, BULLET_SPEED, FIRE_COOLDOWN, PLAYER_BULLET_HIT_RADIUS, PIRATE_ACCEL, PIRATE_FRICTION, PIRATE_MAX_SPEED, PIRATE_HEALTH, PIRATE_BULLET_SPEED, PIRATE_BASE_AGGRO_RADIUS, BASE_DEFENSE_ORBIT_RADIUS, BASE_DEFENSE_ORBIT_SPEED, SHIP_SIZE, SHIP_COLLISION_RADIUS, SHIP_COLLECTION_RADIUS, LASER_HEAT_RATE, LASER_COOL_RATE, WEAPON_ENERGY_DRAIN, MINING_LASER_STATS, BLASTER_ENERGY_PER_SHOT, BLASTER_HEAT_PER_SHOT, BLASTER_COOL_RATE, BLASTER_FIRE_RATE, BLASTER_STATS, OXYGEN_DEPLETION_RATE, FUEL_DEPLETION_RATE, MAX_ORE_STACK, ORE_ITEMS, STRUCTURE_SIZE, STRUCTURE_RADIUS_3D, WARP_GATE_DASHED_EXTRA, SHOP_DASHED_EXTRA, WARP_GATE_DASHED_EXTRA_3D, SHOP_DASHED_EXTRA_3D, STRUCTURE_SIZE_COLL, PIRATE_BASE_HIT_RADIUS, STRUCTURE_STYLES, SHIP_STATS, ITEM_USAGE, ITEM_DISPLAY_NAMES, BOUNCE_RESTITUTION, MAX_COLLISION_DAMAGE, DAMAGE_PER_SPEED, MAGNET_RADIUS, MAGNET_STRENGTH, FLOAT_DRAG, FLOAT_STOP_SPEED, FLOAT_ITEM_RADIUS, FLOATING_ORE_SCALE, PARTICLE_DRAG, INTERACT_RADIUS, ITEM_BUY_PRICE, ITEM_SELL_PRICE, PIRATE_FIRE_RANGE, PIRATE_AIM_SPREAD, PIRATE_TILT_SENSITIVITY, PIRATE_TILT_DECAY, HEAT_WEAPONS, RESOURCE_BAR_CONFIG, isCollidableStructure, RAW_TO_REFINED } from './constants.js';
import { normalize, createSeededRandom, getMaxStack, getItemImagePath, getItemLabel, getItemPayload, pushOutOverlap, bounceEntity, raycastCircle } from './utils.js';
import { InputHandler } from './input.js';
import { Inventory } from './inventory.js';
import {
  PIRATE_TYPE_KEYS,
  DEFAULT_PIRATE_TYPE_PERCENTAGES,
  PIRATE_ARCHETYPE_KEYS,
  normalizePirateBaseTier,
  getPirateBaseTierScale,
  normalizePirateType,
  normalizePirateArchetype,
  normalizePirateTypePercentages,
  ensureSpawnSettingsDefaults,
  ensurePirateBaseSpawnDefaults
} from './pirateShared.js';
import { playIntroCutscene, drawStarfieldFirstFrame } from './introCutscene.js';
import { sfx } from './sfx.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Three.js ship layer (3D model from scout-ship.glb)
let shipCanvas, shipScene, shipCamera, shipRenderer, shipMesh, shipModelLoaded = false;
let shipFlames = []; // Thruster flame meshes
let shipBaseScale = 1; // Base 3D model scale (set once on load)
const SHIP_MODEL_FILES = {
  scout: 'scout-ship.glb',
  cutter: 'cutter.glb',
  transport: 'transport.glb'
};
const shipModelSources = { scout: null, cutter: null, transport: null };
const PLAYER_SHIP_Y_OFFSET_BY_TYPE = { scout: 3, cutter: 5, transport: 5, frigate: 5, carrier: 5 };
const SHIP_PREVIEW_Y_OFFSET_FACTOR = 0.15; // Scout baseline nudge factor in preview.
// Small asteroid 3D models (radius 10-30)
let smallAsteroidModels = [null, null, null];
// Medium asteroid 3D models (radius 40-90)
let mediumAsteroidModels = [null, null];
// Large asteroid 3D model (radius 100+)
let largeAsteroidModel = null;
let oreModel = null;
let scrapModel = null;
let asteroidContainer = null;
let structureModels = {
  warpgate: null,
  shop: null,
  piratebase: { 1: null, 2: null, 3: null, 4: null, 5: null }
};
const pirateModelFiles = { standard: 'pirate-standard.glb', shotgun: 'pirate-shotgun.glb', slowing: 'pirate-slowing.glb', breaching: 'pirate-breaching.glb', drone: 'pirate-drone.glb' };
let pirateModels = { standard: null, shotgun: null, slowing: null, breaching: null, drone: null };
let pirateContainer = null;
let structureContainer = null;
let floatingOreContainer = null;
let levelSeed = 0;

// Pirate Globals
const pirates = [];
const drones = [];
let levelElapsedTime = 0;
// Pirate wave spawning is scheduled against levelElapsedTime (seconds since level load).
// Keep an absolute "next wave at time T" so tier/phase changes don't reset the timer.
let pirateNextWaveTime = 120; // default; overwritten by loadLevel()
let levelIsDebug = false;
let nextDroneId = 1;
let lastPlayerHitAsteroid = null;
const shipDroneCounts = { scout: 0, cutter: 0, transport: 0, frigate: 0, carrier: 0 };

// Dynamic ship properties (updated when switching ships)
let MAX_SPEED = MAX_SPEED_DEFAULT;
let shipCollisionRadius = SHIP_COLLISION_RADIUS;
let shipScale = 1.0;
let shipDamageMult = 1.0;
let shipDamageReduction = 0;
let shipSlowTimer = 0;
let shipSlowVisualActive = false;
const SHIP_SLOW_DURATION = 3;
const SHIP_SLOW_FACTOR = 0.8;
const SHIP_SLOW_EMISSIVE_COLOR = 0xaa55ff;
const SHIP_SLOW_EMISSIVE_INTENSITY = 0.1;
const ASTEROID_VIBRATE_DURATION = 0.12;
const ASTEROID_VIBRATE_AMPLITUDE = 0.4;

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
  'large energy cell': new Image(),
  'oxygen canister': new Image()
};
ITEM_IMAGES['fuel tank'].src = 'assets/fuel-can.png';
ITEM_IMAGES['small energy cell'].src = 'assets/energy-cell.png';
ITEM_IMAGES['medium energy cell'].src = 'assets/energy-cell.png';
ITEM_IMAGES['large energy cell'].src = 'assets/energy-cell.png';
ITEM_IMAGES['oxygen canister'].src = 'assets/oxygen-can.png';
const healthPackImg = new Image();
healthPackImg.src = 'assets/health-pack.png';
ITEM_IMAGES['health pack'] = healthPackImg;
ITEM_IMAGES['medium health pack'] = healthPackImg;
ITEM_IMAGES['large health pack'] = healthPackImg;
ITEM_IMAGES['medium fuel tank'] = ITEM_IMAGES['fuel tank'];
ITEM_IMAGES['large fuel tank'] = ITEM_IMAGES['fuel tank'];
ITEM_IMAGES['medium oxygen canister'] = ITEM_IMAGES['oxygen canister'];
ITEM_IMAGES['large oxygen canister'] = ITEM_IMAGES['oxygen canister'];
const laserImg = new Image();
laserImg.src = 'assets/laser.png';
ITEM_IMAGES['mining laser'] = laserImg;
ITEM_IMAGES['medium mining laser'] = laserImg;
ITEM_IMAGES['large mining laser'] = laserImg;
const blasterImg = new Image();
blasterImg.src = 'assets/blaster.png';
ITEM_IMAGES['light blaster'] = blasterImg;
ITEM_IMAGES['medium blaster'] = blasterImg;
ITEM_IMAGES['large blaster'] = blasterImg;
const warpKeyImg = new Image();
warpKeyImg.src = 'assets/warp-key.png';
ITEM_IMAGES['warp key'] = warpKeyImg;
const warpKeyFragmentImg = new Image();
warpKeyFragmentImg.src = 'assets/warp-key-fragment.png';
ITEM_IMAGES['warp key fragment'] = warpKeyFragmentImg;
const WARP_KEY_OPPORTUNITY_ITEMS = new Set(['warp key', 'warp key fragment']);

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
  credits: 10000
};

// Inventory
const inventory = new Inventory();
inventory.set(0, { item: 'mining laser', heat: 0, overheated: false });
inventory.set(1, { item: 'small energy cell', energy: 10, maxEnergy: 10 });
inventory.set(2, { item: 'small energy cell', energy: 10, maxEnergy: 10 });
const hotbar = inventory.slots; // Alias for compatibility

let selectedSlot = 0;
let blasterFireAccum = 0;
let hudDirty = true; // When true, updateHUD() will re-render; set by any mutation
let laserWasFiring = false;
let droneLaserWasActive = false;

// Input
const input = new InputHandler(canvas);
// Aliases for compatibility where possible, but primitives must be replaced

// Ship tilt (banks when turning, decays when resting)
let prevAimAngle = 0;
let shipTilt = 0;
let shipTiltInitialized = false;

let gamePaused = true;
let warpMenuOpen = false;
let shopMenuOpen = false;
let craftingMenuOpen = false;
let shipyardMenuOpen = false;
let startScreenOpen = true;
let deathScreenOpen = false;
let pauseMenuOpen = false;
let hidePlayerShip = false;
let interactPromptAlpha = 0; // Fade alpha for interaction prompt (0-1)
let interactPromptTarget = null; // Current structure showing prompt
let tutorialTextTimer = 0; // Time remaining for tutorial text (seconds)
let tutorialTextTimerStarted = false; // True after player thrusts for the first time
let tutorialTextWorldX = 0; // World X position of tutorial text
let tutorialTextWorldY = 0; // World Y position of tutorial text
const OXYGEN_BAR_COLOR = '#44aaff';
const FUEL_BAR_COLOR = '#ffaa44';
const HEALTH_BAR_COLOR = '#ff4444';
const LOW_RESOURCE_THRESHOLD = 0.25;
const OUTSIDE_BORDER_OXYGEN_DRAIN_RATE = 1; // additive, per second
const SHIP_STATUS_TRANSIENT_DURATION = 0.75;
const SHIP_STATUS_TRANSIENT_FADE_DURATION = 0.3;
const SHIP_STATUS_PERSISTENT_FADE_DURATION = 0.225;
const SHIP_STATUS_BASE_Y_OFFSET = 72;
const SHIP_STATUS_LINE_SPACING = 16;
const shipStatusTransient = [];
const shipStatusPersistent = {
  text: '',
  color: '#fff',
  active: false,
  alpha: 0
};
const lowResourceState = {
  health: false,
  fuel: false,
  oxygen: false
};
const deathSequence = {
  active: false,
  elapsed: 0,
  menuDelay: 1.0,
  scatteredItems: []
};

function computeMenuPauseState() {
  return warpMenuOpen || shopMenuOpen || craftingMenuOpen || shipyardMenuOpen || refineryMenuOpen || pauseMenuOpen;
}

function clearLatchedGameplayInput() {
  input.leftMouseDown = false;
  input.rightMouseDown = false;
  input.ctrlBrake = false;
  sfx.stopLaserLoop();
  sfx.stopDroneLaserLoop();
  laserWasFiring = false;
  droneLaserWasActive = false;
}

function applyPlayerDamage(amount) {
  const damage = Math.max(0, Number(amount) || 0);
  if (damage <= 0) return 0;
  const reducedDamage = damage * (1 - shipDamageReduction);
  player.health = Math.max(0, player.health - reducedDamage);
  return reducedDamage;
}

function getShipCollisionRadiusByScale(stats) {
  const scoutStats = SHIP_STATS.scout || {};
  const scoutScale = Number(scoutStats.shipScale) || 1;
  const scoutRadius = Number(scoutStats.collisionRadius) || SHIP_COLLISION_RADIUS;
  const shipScaleValue = Number(stats?.shipScale) || scoutScale;
  return scoutRadius * (shipScaleValue / scoutScale);
}

function itemEntryHasWarpKeyOpportunity(entry) {
  if (!entry || typeof entry.item !== 'string') return false;
  return WARP_KEY_OPPORTUNITY_ITEMS.has(entry.item);
}

function structureHasWarpKeyOpportunity(st) {
  if (!st || typeof st !== 'object') return false;
  if (st.type === 'piratebase') {
    const drops = Array.isArray(st.drops) ? st.drops : [];
    return drops.some(itemEntryHasWarpKeyOpportunity);
  }
  if (st.type === 'shop') {
    const inventoryItems = Array.isArray(st.inventory) ? st.inventory : [];
    return inventoryItems.some(itemEntryHasWarpKeyOpportunity);
  }
  if (st.type === 'crafting') {
    const recipes = Array.isArray(st.recipes) ? st.recipes : [];
    return recipes.some(recipe => itemEntryHasWarpKeyOpportunity(recipe?.output));
  }
  return false;
}

let refineryMenuOpen = false;
let activeShopStructure = null;
let activeCraftingStructure = null;
let activeWarpStructure = null;

// Warp transition animation state (time-based, framerate-independent)
const warpTransition = {
  active: false,
  phase: 'none',   // 'bloom-in' | 'hold' | 'bloom-out' | 'none'
  elapsed: 0,       // seconds elapsed in current phase
  bloomInDuration: 0.7,
  holdDuration: 0.25,
  bloomOutDuration: 0.6,
  onLevelReady: null // callback: called once during 'hold' to load level
};

function startWarpTransition(onLevelReady) {
  warpTransition.active = true;
  warpTransition.phase = 'bloom-in';
  warpTransition.elapsed = 0;
  warpTransition.onLevelReady = onLevelReady;
  interactPromptAlpha = 0;
  interactPromptTarget = null;
}

function updateWarpTransition(dt) {
  if (!warpTransition.active) return;
  warpTransition.elapsed += dt;
  if (warpTransition.phase === 'bloom-in' && warpTransition.elapsed >= warpTransition.bloomInDuration) {
    warpTransition.phase = 'hold';
    warpTransition.elapsed = 0;
    // Fire the level-load callback during the white-out hold
    if (warpTransition.onLevelReady) {
      warpTransition.onLevelReady();
      warpTransition.onLevelReady = null;
    }
  } else if (warpTransition.phase === 'hold' && warpTransition.elapsed >= warpTransition.holdDuration) {
    warpTransition.phase = 'bloom-out';
    warpTransition.elapsed = 0;
  } else if (warpTransition.phase === 'bloom-out' && warpTransition.elapsed >= warpTransition.bloomOutDuration) {
    warpTransition.active = false;
    warpTransition.phase = 'none';
    warpTransition.elapsed = 0;
    gamePaused = false;
  }
}

function getWarpTransitionAlpha() {
  if (!warpTransition.active) return 0;
  const { phase, elapsed, bloomInDuration, bloomOutDuration } = warpTransition;
  if (phase === 'bloom-in') {
    const t = Math.min(1, elapsed / bloomInDuration);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    return 0.15 + eased * 0.85;
  } else if (phase === 'hold') {
    return 1;
  } else if (phase === 'bloom-out') {
    const t = Math.min(1, elapsed / bloomOutDuration);
    const eased = 1 - (1 - t) * (1 - t);
    return 1 - eased;
  }
  return 0;
}

function renderWarpTransitionFancy(targetCtx, w, h) {
  // Draws the radial bloom effect (for the main game canvas layer)
  if (!warpTransition.active) return;
  const { phase, elapsed, bloomInDuration, bloomOutDuration } = warpTransition;
  const maxRadius = Math.sqrt((w / 2) ** 2 + (h / 2) ** 2) * 1.15;
  const cx = w / 2;
  const cy = h / 2;
  const alpha = getWarpTransitionAlpha();
  if (alpha <= 0) return;

  targetCtx.save();
  if (phase === 'bloom-in') {
    const t = Math.min(1, elapsed / bloomInDuration);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const radius = eased * maxRadius;
    // Radial gradient bloom expanding from center
    const grad = targetCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    grad.addColorStop(0.6, `rgba(220, 240, 255, ${alpha * 0.85})`);
    grad.addColorStop(1, `rgba(180, 220, 255, 0)`);
    targetCtx.fillStyle = grad;
    targetCtx.fillRect(0, 0, w, h);
    // Core bright circle
    const coreGrad = targetCtx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.4);
    coreGrad.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, alpha * 1.2)})`);
    coreGrad.addColorStop(1, `rgba(255, 255, 255, 0)`);
    targetCtx.fillStyle = coreGrad;
    targetCtx.fillRect(0, 0, w, h);
  } else {
    // Full-screen white (hold & fade-out)
    targetCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    targetCtx.fillRect(0, 0, w, h);
  }
  targetCtx.restore();
}

function renderWarpTransitionSolid(targetCtx, w, h) {
  // Draws a solid white overlay at the transition alpha (covers 3D layer beneath)
  if (!warpTransition.active) return;
  const alpha = getWarpTransitionAlpha();
  if (alpha <= 0) return;
  targetCtx.save();
  targetCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  targetCtx.fillRect(0, 0, w, h);
  targetCtx.restore();
}

const craftingInputSlots = [null, null, null, null, null, null, null, null, null];
let craftingOutputSlot = null;
let activeRefineryStructure = null;
const refineryInputSlots = [null, null, null, null];
let refineryOutputSlot = null;

// Start screen overlay — hidden during cutscene, shown as fallback.
const startOverlayEl = document.getElementById('start-menu-overlay');

// Intro cutscene overlay (replaces click-to-start).
function beginGame() {
  if (startOverlayEl) startOverlayEl.style.display = 'none';
  startScreenOpen = false;
  gamePaused = computeMenuPauseState();
  clearLatchedGameplayInput();
  if (canvas && canvas.focus) canvas.focus();
}

const mainMenuOverlay = document.getElementById('main-menu-overlay');
const mainMenuStartBtn = document.getElementById('main-menu-start-btn');
const cutsceneOverlay = document.getElementById('intro-cutscene-overlay');
const cutsceneMapCanvas = document.getElementById('intro-map-canvas');
const cutsceneDialogue = document.getElementById('intro-dialogue-text');

if (mainMenuOverlay && mainMenuStartBtn) {
  // Show main menu; game loads in background. On Start Game, play cutscene then begin.
  mainMenuOverlay.style.display = 'flex';
  const starfieldCanvas = document.getElementById('main-menu-starfield-canvas');
  if (starfieldCanvas) {
    requestAnimationFrame(() => drawStarfieldFirstFrame(starfieldCanvas));
  }
  mainMenuStartBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sfx.unlock();
    mainMenuOverlay.style.display = 'none';
    if (cutsceneOverlay && cutsceneMapCanvas && cutsceneDialogue) {
      cutsceneOverlay.style.display = 'flex';
      playIntroCutscene(cutsceneMapCanvas, cutsceneDialogue, cutsceneOverlay, beginGame, {
        onTypeChar: () => sfx.playCutsceneTypeTick(),
        onSkip: () => {},
        onBlendStart: () => {},
        onBlendComplete: () => {}
      });
    } else {
      beginGame();
    }
  });
} else if (cutsceneOverlay && cutsceneMapCanvas && cutsceneDialogue) {
  // Fallback: no main menu — play cutscene immediately.
  cutsceneOverlay.style.display = 'flex';
  playIntroCutscene(cutsceneMapCanvas, cutsceneDialogue, cutsceneOverlay, beginGame, {
    onTypeChar: () => sfx.playCutsceneTypeTick(),
    onSkip: () => {},
    onBlendStart: () => {},
    onBlendComplete: () => {}
  });
} else if (startOverlayEl) {
  // Fallback: classic click-to-start if cutscene markup is missing.
  startOverlayEl.style.display = 'flex';
  startOverlayEl.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sfx.unlock();
    beginGame();
  });
} else {
  // No overlays at all — just start.
  startScreenOpen = false;
  gamePaused = false;
}

// Death screen overlay (shown when HP reaches 0)
const deathOverlayEl = document.getElementById('death-menu-overlay');
const deathMainMenuBtn = document.getElementById('death-main-menu-btn');
const pauseOverlayEl = document.getElementById('pause-menu-overlay');
const pauseResumeBtn = document.getElementById('pause-resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const pauseVolumeSlider = document.getElementById('pause-volume-slider');

function closePauseMenu(playCloseSfx = true) {
  if (!pauseMenuOpen) return;
  pauseMenuOpen = false;
  if (pauseOverlayEl) pauseOverlayEl.style.display = 'none';
  if (playCloseSfx) sfx.playMenuClose();
  gamePaused = computeMenuPauseState();
  if (!gamePaused && canvas && canvas.focus) canvas.focus();
}

function syncPauseVolumeUI() {
  if (!pauseVolumeSlider) return;
  pauseVolumeSlider.value = String(Math.round(sfx.getMasterVolume() * 100));
}

function openPauseMenu() {
  if (pauseMenuOpen || startScreenOpen || deathScreenOpen || deathSequence.active) return;
  pauseMenuOpen = true;
  clearLatchedGameplayInput();
  gamePaused = true;
  syncPauseVolumeUI();
  if (pauseOverlayEl) pauseOverlayEl.style.display = 'flex';
  sfx.playMenuOpen();
}

if (deathMainMenuBtn) {
  deathMainMenuBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.location.reload();
  });
}
if (pauseResumeBtn) {
  pauseResumeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sfx.unlock();
    closePauseMenu();
  });
}
if (pauseRestartBtn) {
  pauseRestartBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sfx.unlock();
    sfx.playRespawn();
    window.location.reload();
  });
}
if (pauseVolumeSlider) {
  pauseVolumeSlider.addEventListener('input', () => {
    const normalized = (Number(pauseVolumeSlider.value) || 0) / 100;
    sfx.setMasterVolume(normalized);
  });
  syncPauseVolumeUI();
}

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

function scatterInventoryOnDeath() {
  deathSequence.scatteredItems.length = 0;
  for (let i = 0; i < hotbar.length; i++) {
    const slotItem = hotbar[i];
    if (!slotItem || !slotItem.item) continue;
    const angle = Math.random() * Math.PI * 2;
    const speed = 90 + Math.random() * 180;
    const dropped = { ...slotItem };
    delete dropped._mesh;
    delete dropped._spinAxis;
    delete dropped._spinDirection;
    delete dropped._spinSpeed;
    if (dropped.quantity == null) dropped.quantity = 1;
    const scattered = {
      ...dropped,
      x: ship.x,
      y: ship.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed
    };
    floatingItems.push(scattered);
    deathSequence.scatteredItems.push(scattered);
    hotbar[i] = null;
  }
  markHUDDirty();
}

function startDeathSequence() {
  if (deathSequence.active || deathScreenOpen) return;
  if (pauseMenuOpen) closePauseMenu(false);
  sfx.playDeath();
  clearLatchedGameplayInput();
  deathSequence.active = true;
  deathSequence.elapsed = 0;
  deathSequence.scatteredItems.length = 0;
  hidePlayerShip = true;
  deathScreenOpen = false;
  inventoryDrag = null;
  try { setDragGhostVisible(false); } catch (e) {}
  if (deathOverlayEl) deathOverlayEl.style.display = 'none';
  spawnSparks(ship.x, ship.y, 65);
  scatterInventoryOnDeath();
}

function updateDeathSequence(dt) {
  if (!deathSequence.active) return;
  deathSequence.elapsed += dt;

  if (deathSequence.elapsed >= deathSequence.menuDelay) {
    deathSequence.active = false;
    deathSequence.scatteredItems.length = 0;
    gamePaused = true;
    deathScreenOpen = true;
    if (deathOverlayEl) deathOverlayEl.style.display = 'flex';
  }
}

// Drag state for hotbar (Legacy canvas drag removed)



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


function worldToScreen(wx, wy) {
  return {
    x: wx - ship.x + WIDTH / 2,
    y: wy - ship.y + HEIGHT / 2
  };
}

function pushShipStatusTransient(text, color, duration = SHIP_STATUS_TRANSIENT_DURATION, fadeDuration = SHIP_STATUS_TRANSIENT_FADE_DURATION) {
  shipStatusTransient.push({
    text,
    color,
    remaining: Math.max(0.01, duration),
    fadeDuration: Math.max(0.01, fadeDuration)
  });
}

function setShipStatusPersistent(text, color, active) {
  shipStatusPersistent.text = text;
  shipStatusPersistent.color = color;
  shipStatusPersistent.active = !!active;
}

function updateShipStatus(dt) {
  const fadeOutRate = 1 / SHIP_STATUS_PERSISTENT_FADE_DURATION;
  const fadeInRate = fadeOutRate * 0.6;
  if (shipStatusPersistent.active) {
    shipStatusPersistent.alpha = Math.min(1, shipStatusPersistent.alpha + fadeInRate * dt);
  } else {
    shipStatusPersistent.alpha = Math.max(0, shipStatusPersistent.alpha - fadeOutRate * dt);
  }
  for (let i = shipStatusTransient.length - 1; i >= 0; i--) {
    const msg = shipStatusTransient[i];
    msg.remaining -= dt;
    if (msg.remaining <= 0) {
      shipStatusTransient[i] = shipStatusTransient[shipStatusTransient.length - 1];
      shipStatusTransient.pop();
    }
  }
}

function syncLowResourceStateFromPlayer() {
  lowResourceState.health = player.maxHealth > 0 && (player.health / player.maxHealth) <= LOW_RESOURCE_THRESHOLD;
  lowResourceState.fuel = player.maxFuel > 0 && (player.fuel / player.maxFuel) <= LOW_RESOURCE_THRESHOLD;
  lowResourceState.oxygen = player.maxOxygen > 0 && (player.oxygen / player.maxOxygen) <= LOW_RESOURCE_THRESHOLD;
}

function maybeNotifyLowResource(key, value, max, text, color) {
  const below = max > 0 && (value / max) <= LOW_RESOURCE_THRESHOLD;
  if (below && !lowResourceState[key]) {
    pushShipStatusTransient(text, color);
  }
  lowResourceState[key] = below;
}

// Laser raycast: find closest asteroid hit by a ray from (ox, oy) in direction (dx, dy)
function laserHitAsteroid(ox, oy, dx, dy, maxLen) {
  let closest = null;
  let closestDist = maxLen;
  for (const ast of asteroids) {
    const d = raycastCircle(ox, oy, dx, dy, ast.x, ast.y, ast.radius, closestDist);
    if (d >= 0) { closest = ast; closestDist = d; }
  }
  return closest ? { asteroid: closest, distance: closestDist } : null;
}

// Ray vs circle for pirate base
function laserHitPirateBase(ox, oy, dx, dy, maxLen) {
  let closest = null;
  let closestDist = maxLen;
  for (const st of structures) {
    if (st.type !== 'piratebase' || st.dead || st.health <= 0) continue;
    const d = raycastCircle(ox, oy, dx, dy, st.x, st.y, getPirateBaseHitRadius(st), closestDist);
    if (d >= 0) { closest = st; closestDist = d; }
  }
  return closest ? { structure: closest, distance: closestDist } : null;
}

const SHOT_SPREAD = 8;

function fireBullet() {
  const dx = input.mouseX - WIDTH / 2;
  const dy = input.mouseY - HEIGHT / 2;
  const dir = normalize(dx, dy);
  if (dir.x === 0 && dir.y === 0) return;
  const perp = { x: -dir.y, y: dir.x };
  const offsets = [-SHOT_SPREAD, 0, SHOT_SPREAD];
  for (const offset of offsets) {
    bullets.push({
      x: ship.x + dir.x * SHIP_SIZE * shipScale + perp.x * offset,
      y: ship.y + dir.y * SHIP_SIZE * shipScale + perp.y * offset,
      vx: dir.x * BULLET_SPEED + ship.vx,
      vy: dir.y * BULLET_SPEED + ship.vy,
      lifespan: 4,
      owner: 'player'
    });
  }
}

function fireBlasterPellet(pirateDmg, asteroidDmg) {
  const dx = input.mouseX - WIDTH / 2;
  const dy = input.mouseY - HEIGHT / 2;
  const dir = normalize(dx, dy);
  if (dir.x === 0 && dir.y === 0) return;
  bullets.push({
    x: ship.x + dir.x * SHIP_SIZE * shipScale,
    y: ship.y + dir.y * SHIP_SIZE * shipScale,
    vx: dir.x * BULLET_SPEED + ship.vx,
    vy: dir.y * BULLET_SPEED + ship.vy,
    lifespan: 4,
    owner: 'player',
    pirateDmg: pirateDmg,
    asteroidDmg: asteroidDmg
  });
}

function drawShip2D() {
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const dx = input.mouseX - cx;
  const dy = input.mouseY - cy;
  const dir = normalize(dx, dy);
  const angle = Math.atan2(dir.y, dir.x);
  const S = SHIP_SIZE * shipScale;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (currentShipType === 'cutter') {
    // Wider, angular profile
    ctx.moveTo(S * 1.1, 0);
    ctx.lineTo(-S * 0.5, S * 0.8);
    ctx.lineTo(-S * 0.3, S * 0.2);
    ctx.lineTo(-S * 0.6, 0);
    ctx.lineTo(-S * 0.3, -S * 0.2);
    ctx.lineTo(-S * 0.5, -S * 0.8);
  } else if (currentShipType === 'transport') {
    // Large bulky shape
    ctx.moveTo(S * 0.9, 0);
    ctx.lineTo(S * 0.3, S * 0.7);
    ctx.lineTo(-S * 0.7, S * 0.7);
    ctx.lineTo(-S * 0.9, S * 0.3);
    ctx.lineTo(-S * 0.9, -S * 0.3);
    ctx.lineTo(-S * 0.7, -S * 0.7);
    ctx.lineTo(S * 0.3, -S * 0.7);
  } else {
    // Scout: default arrow shape
    ctx.moveTo(S, 0);
    ctx.lineTo(-S * 0.7, S * 0.6);
    ctx.lineTo(-S * 0.4, 0);
    ctx.lineTo(-S * 0.7, -S * 0.6);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function createShipFlames(shipType) {
  const flameHeight = 0.42;
  const flameGeom = new THREE.ConeGeometry(0.105, flameHeight, 8);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.9 });
  const flame1 = new THREE.Mesh(flameGeom.clone(), flameMat.clone());
  const flame2 = new THREE.Mesh(flameGeom.clone(), flameMat.clone());
  flame1.rotation.x = -Math.PI / 2;
  flame2.rotation.x = -Math.PI / 2;
  flame1.position.set(0, 0, -flameHeight / 2);
  flame2.position.set(0, 0, -flameHeight / 2);
  const flameGroup1 = new THREE.Group();
  const flameGroup2 = new THREE.Group();
  flameGroup1.add(flame1);
  flameGroup2.add(flame2);
  const flameX = shipType === 'cutter' ? 0.235 : 0.15;
  flameGroup1.position.set(-flameX, 0.3, -0.9);
  flameGroup2.position.set(flameX, 0.3, -0.9);
  flameGroup1.visible = false;
  flameGroup2.visible = false;
  return [flameGroup1, flameGroup2];
}

function attachShipModelForType(shipType) {
  if (!shipScene || typeof THREE === 'undefined') return;
  const resolvedType = SHIP_MODEL_FILES[shipType] ? shipType : 'scout';
  const source = shipModelSources[resolvedType] || shipModelSources.scout;
  if (!source) return;

  if (shipMesh) {
    shipScene.remove(shipMesh);
    shipMesh = null;
    shipFlames = [];
  }

  const model = source.clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = (SHIP_SIZE * 2) / (maxDim > 0 ? maxDim : 1) * 1.2;
  shipBaseScale = scale;
  model.scale.setScalar(scale * shipScale);
  model.position.sub(center.multiplyScalar(scale * shipScale));
  // Flip to show ship tops (not undersides) in top-down view.
  model.rotation.x = Math.PI / 2;
  model.position.y += PLAYER_SHIP_Y_OFFSET_BY_TYPE[resolvedType] ?? PLAYER_SHIP_Y_OFFSET_BY_TYPE.scout;

  const [flameGroup1, flameGroup2] = createShipFlames(resolvedType);
  model.add(flameGroup1);
  model.add(flameGroup2);
  shipFlames = [flameGroup1, flameGroup2];

  shipMesh = model;
  shipScene.add(shipMesh);
  shipModelLoaded = true;
  setShipSlowVisual(shipSlowTimer > 0);
}

function drawCrosshairAndHeatBar() {
  if (!uiCtx) return;
  uiCtx.clearRect(0, 0, WIDTH, HEIGHT);
  if (shopMenuOpen) return;
  const armLen = 6;
  const centerGap = 2;
  const crosshairX = Math.floor(input.mouseX) + 0.5;
  const crosshairY = Math.floor(input.mouseY) + 0.5;
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
  const hasHeatWeapon = equipped && equipped.heat != null && equipped.heat > 0 && (MINING_LASER_STATS[equipped.item] || BLASTER_STATS[equipped.item]);
  if (hasHeatWeapon) {
    const barW = 16;
    const barH = 4;
    const barY = input.mouseY + 8;
    const barX = input.mouseX - barW / 2;
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
  pirateContainer = new THREE.Group();
  shipScene.add(pirateContainer);
  floatingOreContainer = new THREE.Group();
  shipScene.add(floatingOreContainer);
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
  Object.entries(SHIP_MODEL_FILES).forEach(([type, file]) => {
    const glbUrl = new URL('assets/' + file, window.location.href).toString();
    loader.load(glbUrl, (gltf) => {
      shipModelSources[type] = gltf.scene;
      if (!shipMesh || type === currentShipType) {
        attachShipModelForType(currentShipType);
      }
      // eslint-disable-next-line no-console
      console.log('[ship3d] Loaded ' + file);
    }, undefined, (err) => {
      // eslint-disable-next-line no-console
      console.error('[ship3d] Failed to load ' + file, err);
    });
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

  function setupStructureModel(model, structureType) {
    const isPirateBase = structureType === 'piratebase';
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        const oldMat = child.material;
        const newMat = new THREE.MeshStandardMaterial({
          color: oldMat.color ? oldMat.color.clone() : 0x888888,
          map: oldMat.map || null,
          roughness: 0.8,
          metalness: 0.2,
          emissive: isPirateBase ? 0x882222 : 0x333333,
          emissiveMap: oldMat.map || null,
          emissiveIntensity: isPirateBase ? 0.08 : 50.0
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
    model.rotation.x = Math.PI / 4; // 45° tilt downward
    if (structureType === 'crafting') {
      model.rotation.y = (310 * Math.PI) / 180; // 310° on horizontal
    } else {
      model.rotation.y = Math.PI / 4; // 45°
    }
  }
  const STRUCTURE_FILES = [
    { type: 'warpgate', file: 'warp-gate.glb' },
    { type: 'shop', file: 'shop.glb' },
    { type: 'shipyard', file: 'shipyard.glb' },
    { type: 'refinery', file: 'refinery.glb' },
    { type: 'crafting', file: 'crafting-station.glb' }
  ];
  STRUCTURE_FILES.forEach(({ type, file }) => {
    loader.load(new URL('assets/' + file, window.location.href).toString(), (gltf) => {
      const model = gltf.scene;
      setupStructureModel(model, type);
      structureModels[type] = model;
      console.log('[ship3d] Loaded ' + file);
      refreshStructureMeshes();
    }, undefined, (err) => console.error('[ship3d] Failed to load ' + file, err));
  });

  [1, 2, 3, 4, 5].forEach((tier) => {
    const file = `pirate-base-t${tier}.glb`;
    loader.load(new URL('assets/' + file, window.location.href).toString(), (gltf) => {
      const model = gltf.scene;
      setupStructureModel(model, 'piratebase');
      structureModels.piratebase[tier] = model;
      console.log('[ship3d] Loaded ' + file);
      refreshStructureMeshes();
    }, undefined, (err) => console.error('[ship3d] Failed to load ' + file, err));
  });

  loader.load(new URL('assets/ore.glb', window.location.href).toString(), (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 1 / maxDim;
    model.scale.setScalar(scale);
    model.position.sub(center.multiplyScalar(scale));
    model.rotation.x = -Math.PI / 2;
    model.rotation.y = Math.PI; // flip 180
    oreModel = model;
    buildOreIconDataUrls();
    console.log('[ship3d] Loaded ore.glb');
  }, undefined, (err) => console.error('[ship3d] Failed to load ore.glb', err));

  loader.load(new URL('assets/scrap.glb', window.location.href).toString(), (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 1 / maxDim;
    model.scale.setScalar(scale);
    model.position.sub(center.multiplyScalar(scale));
    model.rotation.x = -Math.PI / 2;
    model.rotation.y = Math.PI; // flip 180
    scrapModel = model;
    buildScrapIconDataUrl();
    console.log('[ship3d] Loaded scrap.glb');
  }, undefined, (err) => console.error('[ship3d] Failed to load scrap.glb', err));

  const setupPirateModel = (model) => {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = (SHIP_SIZE * 2) / maxDim * 1.1;
    model.scale.setScalar(scale);
    model.position.sub(center.multiplyScalar(scale));
    model.rotation.x = -Math.PI / 2;
    model.rotation.y = Math.PI;
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        const oldMat = child.material;
        child.material = new THREE.MeshStandardMaterial({
          color: oldMat.color ? oldMat.color.clone() : 0xee9999,
          map: oldMat.map || null,
          roughness: 0.7,
          metalness: 0.3,
          emissive: 0xffffff,
          emissiveMap: oldMat.map || null,
          emissiveIntensity: 1.5
        });
      }
    });
  };
  for (const archetype of PIRATE_ARCHETYPE_KEYS) {
    const file = pirateModelFiles[archetype];
    if (!file) continue;
    loader.load(new URL('assets/' + file, window.location.href).toString(), (gltf) => {
      const model = gltf.scene;
      setupPirateModel(model);
      pirateModels[archetype] = model;
      console.log('[ship3d] Loaded ' + file);
    }, undefined, (err) => console.error('[ship3d] Failed to load ' + file, err));
  }
}

function buildOreIconDataUrls() {
  if (!oreModel || typeof THREE === 'undefined') return;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(size, size);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  camera.position.set(0, 0, 1.4);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(0.5, 0.5, 1);
  scene.add(dir);
  for (const itemKey of FLOATING_ORE_ITEMS) {
    if (itemKey === 'scrap') continue;
    const clone = oreModel.clone(true);
    applyFloatingOreMaterial(clone, itemKey);
    clone.position.set(0, 0, 0);
    clone.rotation.x = -Math.PI / 2;
    clone.rotation.y = Math.PI;
    clone.rotation.z = 0;
    scene.add(clone);
    renderer.render(scene, camera);
    try {
      ORE_ICON_DATA_URLS[itemKey] = canvas.toDataURL('image/png');
    } catch (e) { /* security / CORS */ }
    scene.remove(clone);
  }
  renderer.dispose();
}

function buildScrapIconDataUrl() {
  if (!scrapModel || typeof THREE === 'undefined') return;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(size, size);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  camera.position.set(0, 0, 1.4);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(0.5, 0.5, 1);
  scene.add(dir);
  const clone = scrapModel.clone(true);
  applyFloatingOreMaterial(clone, 'scrap');
  clone.position.set(0, 0, 0);
  clone.rotation.x = -Math.PI / 2;
  clone.rotation.y = Math.PI;
  clone.rotation.z = 0;
  scene.add(clone);
  renderer.render(scene, camera);
  try {
    ORE_ICON_DATA_URLS['scrap'] = canvas.toDataURL('image/png');
  } catch (e) { /* security / CORS */ }
  renderer.dispose();
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
    if (ast.oreType && ast.oreType !== 'cuprite') applyOreEmissiveMaterial(clone, ast.oreType);
    // Compute scale from unrotated model so same radius => same visual size (hitbox match)
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const sizeMult = 1.05;
    const scale = ((ast.radius * 2) / maxDim) * sizeMult;
    clone.scale.setScalar(scale);
    clone.rotation[['x', 'y', 'z'][spinAxis]] = ast._initialSpinPhase;
    ast._mesh = clone;
    asteroidContainer.add(clone);
  }
}

function setShipSlowVisual(active) {
  if (shipSlowVisualActive === active) return;
  shipSlowVisualActive = active;
  if (!shipMesh) return;
  shipMesh.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const applyToMaterial = (mat) => {
      if (!mat || !mat.isMaterial || !mat.emissive) return;
      if (!mat.userData._shipSlowBaseEmissive) {
        mat.userData._shipSlowBaseEmissive = mat.emissive.clone();
        mat.userData._shipSlowBaseEmissiveIntensity = mat.emissiveIntensity ?? 0;
      }
      if (active) {
        mat.emissive.setHex(SHIP_SLOW_EMISSIVE_COLOR);
        mat.emissiveIntensity = SHIP_SLOW_EMISSIVE_INTENSITY;
      } else {
        mat.emissive.copy(mat.userData._shipSlowBaseEmissive);
        mat.emissiveIntensity = mat.userData._shipSlowBaseEmissiveIntensity;
      }
      mat.needsUpdate = true;
    };
    if (Array.isArray(child.material)) {
      child.material.forEach(applyToMaterial);
    } else {
      applyToMaterial(child.material);
    }
  });
}

// Non-cuprite asteroids: emissive glow in ore color, intensity 0.06
const ORE_EMISSIVE_COLOR = { hematite: 0xA0522D, aurite: 0xFFD700, diamite: 0x909090, platinite: 0xE5E4E2 };
const ORE_EMISSIVE_INTENSITY = { hematite: 0.06, aurite: 0.02, diamite: 0.06, platinite: 0.06 };
function applyOreEmissiveMaterial(mesh, oreType) {
  const emissiveColor = ORE_EMISSIVE_COLOR[oreType] ?? 0x888888;
  const intensity = ORE_EMISSIVE_INTENSITY[oreType] ?? 0.06;
  mesh.traverse((child) => {
    if (child.isMesh && child.material) {
      const oldMat = child.material;
      child.material = new THREE.MeshStandardMaterial({
        color: oldMat.color ? oldMat.color.clone() : 0x888888,
        map: oldMat.map || null,
        roughness: oldMat.roughness ?? 0.8,
        metalness: oldMat.metalness ?? 0.2,
        emissive: emissiveColor,
        emissiveIntensity: intensity
      });
    }
  });
}

// Floating ore drops: self-lit like asteroids with ore-colored emissive tint
const FLOATING_ORE_ITEMS = new Set(['cuprite', 'hematite', 'aurite', 'diamite', 'platinite', 'scrap', 'warp key', 'warp key fragment', 'copper', 'iron', 'gold', 'diamond', 'platinum']);
const FLOATING_ORE_EMISSIVE = { cuprite: 0x7A6D5F, hematite: 0x804224, aurite: 0xCCAC00, diamite: 0x737373, platinite: 0xB7B6B5, scrap: 0x888888, 'warp key': 0xAE841A, 'warp key fragment': 0x8A7A44, copper: 0xB87333, iron: 0x696969, gold: 0xFFD700, diamond: 0xB9F2FF, platinum: 0xE5E4E2 };
const ORE_ICON_DATA_URLS = {}; // itemKey -> data URL for inventory slot (3D ore, no rotation)

function getPirateBaseHitRadius(st) {
  return PIRATE_BASE_HIT_RADIUS * getPirateBaseTierScale(st?.tier);
}

function getPirateBaseVisualRadius(st) {
  return STRUCTURE_RADIUS_3D * getPirateBaseTierScale(st?.tier);
}

function getPirateBaseAggroRadius(st) {
  return PIRATE_BASE_AGGRO_RADIUS * getPirateBaseTierScale(st?.tier);
}

function getPirateBaseDefenseOrbitRadius(st) {
  return BASE_DEFENSE_ORBIT_RADIUS * getPirateBaseTierScale(st?.tier);
}

function getStructureCollisionRadius(st) {
  if (st?.type === 'piratebase') return STRUCTURE_SIZE_COLL * getPirateBaseTierScale(st.tier);
  return STRUCTURE_SIZE_COLL;
}

const PIRATE_BASE_COLLISION_RADIUS = SHIP_COLLISION_RADIUS + 4;
const DRONE_COLLISION_RADIUS = 5;
const DRONE_ACCEL = PIRATE_ACCEL * 0.6875;
const DRONE_FRICTION = PIRATE_FRICTION;
const DRONE_MAX_SPEED = PIRATE_MAX_SPEED * 0.9;
const DRONE_IDLE_ORBIT_RADIUS = 35;
const DRONE_IDLE_ORBIT_SPEED = 1.4;
const DRONE_FIRE_PERIOD = 5.0;
const DRONE_FIRE_ACTIVE_TIME = 0.5;
const DRONE_LASER_RANGE = 300;
const DRONE_LASER_DPS = 5;
const DRONE_PURCHASE_PRICE = 1200;
const DRONE_AVOID_FORCE = 350;
const DRONE_SCREEN_MARGIN = 80;
const DRONE_STAY_ON_SCREEN_FORCE = 300;
const DRONE_PLAYER_PROXIMITY_BIAS = 120;
const DRONE_LASER_OUTER_COLOR = 'rgba(255,180,120,0.9)';
const DRONE_LASER_INNER_COLOR = 'rgba(255,220,170,0.95)';
const DRONE_LASER_SPARKS_PER_SECOND = 12.6; // time-based, ~20% of original rate

function isWorldOnScreen(x, y, padding = 0) {
  return x >= ship.x - WIDTH / 2 - padding &&
    x <= ship.x + WIDTH / 2 + padding &&
    y >= ship.y - HEIGHT / 2 - padding &&
    y <= ship.y + HEIGHT / 2 + padding;
}

function getRayMaxDistanceToScreen(wx, wy, dirX, dirY) {
  const sx = wx - ship.x + WIDTH / 2;
  const sy = wy - ship.y + HEIGHT / 2;
  let maxL = Infinity;
  if (dirX > 0) maxL = Math.min(maxL, (WIDTH - sx) / dirX);
  else if (dirX < 0) maxL = Math.min(maxL, -sx / dirX);
  if (dirY > 0) maxL = Math.min(maxL, (HEIGHT - sy) / dirY);
  else if (dirY < 0) maxL = Math.min(maxL, -sy / dirY);
  if (!Number.isFinite(maxL)) return 0;
  return Math.max(0, maxL);
}

function getShipDroneCapacity(shipType) {
  const slots = Number(SHIP_STATS?.[shipType]?.droneSlots) || 0;
  return Math.max(0, Math.round(slots));
}

function getPurchasedDroneCount(shipType) {
  return Math.max(0, Math.round(Number(shipDroneCounts[shipType]) || 0));
}

function setPurchasedDroneCount(shipType, count) {
  const cap = getShipDroneCapacity(shipType);
  shipDroneCounts[shipType] = Math.max(0, Math.min(cap, Math.round(Number(count) || 0)));
}

function createDrone(index = 0, total = 1) {
  const angle = (index / Math.max(1, total)) * Math.PI * 2;
  const radius = DRONE_IDLE_ORBIT_RADIUS;
  return {
    id: nextDroneId++,
    x: ship.x + Math.cos(angle) * radius,
    y: ship.y + Math.sin(angle) * radius,
    vx: 0,
    vy: 0,
    facingAngle: angle,
    tilt: 0,
    orbitAngle: angle,
    state: 'chase',
    stateTimer: 1 + Math.random() * 2,
    fireTimer: Math.random() * DRONE_FIRE_PERIOD,
    target: null,
    laserLength: 0,
    laserDirX: 0,
    laserDirY: 0,
    laserActive: false
  };
}

function syncActiveDronesForCurrentShip() {
  const desired = Math.min(getPurchasedDroneCount(currentShipType), getShipDroneCapacity(currentShipType));
  for (let i = drones.length - 1; i >= desired; i--) drones.pop();
  const startCount = drones.length;
  for (let i = startCount; i < desired; i++) drones.push(createDrone(i, desired));
}

function addDroneToCurrentShip(shipyardStructure) {
  const cap = getShipDroneCapacity(currentShipType);
  if (cap <= 0) return false;
  const current = getPurchasedDroneCount(currentShipType);
  if (current >= cap) return false;
  if (player.credits < DRONE_PURCHASE_PRICE) return false;
  const maxDrones = Number(shipyardStructure?.maxDrones) || 5;
  const sold = Number(shipyardStructure?.dronesSold) || 0;
  if (sold >= maxDrones) return false;
  player.credits -= DRONE_PURCHASE_PRICE;
  shipyardStructure.dronesSold = sold + 1;
  setPurchasedDroneCount(currentShipType, current + 1);
  syncActiveDronesForCurrentShip();
  updateHUD();
  sfx.playBuy();
  return true;
}

function getNearestEligiblePirateForDrone(drone) {
  let best = null;
  let bestDistSq = Infinity;
  for (const p of pirates) {
    if (p.health <= 0) continue;
    if (!isWorldOnScreen(p.x, p.y, p.collisionRadius ?? PIRATE_BASE_COLLISION_RADIUS)) continue;
    if (p.defendingBase && !p.defendingBase.aggroed) continue;
    const dx = p.x - drone.x;
    const dy = p.y - drone.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      best = p;
    }
  }
  return best;
}

function getNearestEligibleAggroBaseForDrone(drone) {
  let best = null;
  let bestDistSq = Infinity;
  for (const st of structures) {
    if (st.type !== 'piratebase' || st.dead || st.health <= 0 || !st.aggroed) continue;
    if (!isWorldOnScreen(st.x, st.y, getPirateBaseHitRadius(st))) continue;
    const dx = st.x - drone.x;
    const dy = st.y - drone.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      best = st;
    }
  }
  return best;
}

function pickDroneTarget(drone) {
  const pirateTarget = getNearestEligiblePirateForDrone(drone);
  if (pirateTarget) {
    const dx = pirateTarget.x - drone.x;
    const dy = pirateTarget.y - drone.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const distToSurface = Math.max(0, dist - getDroneTargetRadius(pirateTarget));
    if (distToSurface <= DRONE_LASER_RANGE) return pirateTarget;
    if (lastPlayerHitAsteroid && lastPlayerHitAsteroid.health > 0 && asteroids.includes(lastPlayerHitAsteroid) &&
        isWorldOnScreen(lastPlayerHitAsteroid.x, lastPlayerHitAsteroid.y, lastPlayerHitAsteroid.radius)) {
      return lastPlayerHitAsteroid;
    }
    return pirateTarget;
  }
  const baseTarget = getNearestEligibleAggroBaseForDrone(drone);
  if (baseTarget) return baseTarget;
  if (!lastPlayerHitAsteroid) return null;
  if (lastPlayerHitAsteroid.health <= 0 || !asteroids.includes(lastPlayerHitAsteroid)) {
    lastPlayerHitAsteroid = null;
    return null;
  }
  if (!isWorldOnScreen(lastPlayerHitAsteroid.x, lastPlayerHitAsteroid.y, lastPlayerHitAsteroid.radius)) return null;
  return lastPlayerHitAsteroid;
}

function getDroneTargetRadius(target) {
  return target?.type === 'piratebase'
    ? getPirateBaseHitRadius(target)
    : (target?.radius ?? target?.collisionRadius ?? PIRATE_BASE_COLLISION_RADIUS);
}

function getDroneLaserHit(drone, target, dirX, dirY, maxLen) {
  const targetRadius = getDroneTargetRadius(target);
  const d = raycastCircle(drone.x, drone.y, dirX, dirY, target.x, target.y, targetRadius, maxLen);
  if (d < 0) return null;
  return { target, distance: d };
}
const PIRATE_TYPE_CONFIG = Object.freeze({
  normal: { health: PIRATE_HEALTH, speedMult: 1, sizeMult: 1, tint: 0xff6666, emissiveIntensity: 1.5 },
  sturdy: { health: PIRATE_HEALTH * 2, speedMult: 0.7, sizeMult: 1.3, tint: 0xff6666, emissiveIntensity: 1.5 },
  fast: { health: 15, speedMult: 1.5, sizeMult: 0.8, tint: 0xff6666, emissiveIntensity: 1.5 }
});
const PIRATE_ARCHETYPE_CONFIG = Object.freeze({
  standard: { bonusHealthMult: 1, speedMult: 1, sizeMult: 1, fixedHealth: null, pelletCount: 1, pelletSpread: 0, bulletDamage: 3 },
  shotgun: { bonusHealthMult: 2, speedMult: 1, sizeMult: 1, fixedHealth: null, pelletCount: 3, pelletSpread: 0.06, bulletDamage: 2 },
  slowing: { bonusHealthMult: 2, speedMult: 1, sizeMult: 1, fixedHealth: null, pelletCount: 1, pelletSpread: 0, bulletDamage: 3 },
  breaching: { bonusHealthMult: 2, speedMult: 1, sizeMult: 1, fixedHealth: null, pelletCount: 1, pelletSpread: 0, bulletDamage: 3 },
  drone: { bonusHealthMult: 1, speedMult: 2, sizeMult: 0.5, fixedHealth: 5, pelletCount: 1, pelletSpread: 0, bulletDamage: 3 }
});
const PIRATE_ARCHETYPE_BULLET_COLORS = Object.freeze({
  standard: '#ffcc00',
  shotgun: '#ffcc00',
  slowing: '#d8a6ff',
  breaching: '#ffcc00',
  drone: '#ffcc00'
});

function pickPirateType(percentages) {
  const mix = normalizePirateTypePercentages(percentages);
  const total = mix.normal + mix.sturdy + mix.fast;
  let roll = Math.random() * total;
  for (const key of PIRATE_TYPE_KEYS) {
    roll -= mix[key];
    if (roll <= 0) return key;
  }
  return 'normal';
}

function shuffleWithSeed(arr, seed) {
  const rng = createSeededRandom(seed >>> 0);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildDeterministicPirateTypeSequence(count, percentages, shuffleSeed) {
  const n = Math.max(0, Math.round(Number(count) || 0));
  if (n <= 0) return [];
  const mix = normalizePirateTypePercentages(percentages);
  const total = mix.normal + mix.sturdy + mix.fast;
  const counts = { normal: 0, sturdy: 0, fast: 0 };
  const remainders = [];
  let assigned = 0;
  for (const key of PIRATE_TYPE_KEYS) {
    const exact = (mix[key] / total) * n;
    const base = Math.floor(exact);
    counts[key] = base;
    assigned += base;
    remainders.push({ key, frac: exact - base });
  }
  // Allocate leftovers by largest remainder; stable tie-break by PIRATE_TYPE_KEYS order.
  remainders.sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < (n - assigned); i++) {
    counts[remainders[i % remainders.length].key] += 1;
  }
  const sequence = [];
  for (const key of PIRATE_TYPE_KEYS) {
    for (let i = 0; i < counts[key]; i++) sequence.push(key);
  }
  if (shuffleSeed != null && typeof shuffleSeed === 'number') {
    return shuffleWithSeed(sequence, shuffleSeed >>> 0);
  }
  return sequence;
}

function getPirateCombatProfile(pirateType, pirateArchetype) {
  const resolvedType = normalizePirateType(pirateType);
  const resolvedArchetype = normalizePirateArchetype(pirateArchetype);
  const typeCfg = PIRATE_TYPE_CONFIG[resolvedType];
  const archetypeCfg = PIRATE_ARCHETYPE_CONFIG[resolvedArchetype];
  let health = typeCfg.health;
  if (archetypeCfg.fixedHealth != null) {
    health = archetypeCfg.fixedHealth;
  } else {
    health = Math.max(1, Math.round(health * (archetypeCfg.bonusHealthMult ?? 1)));
  }
  const speedMult = (typeCfg.speedMult ?? 1) * (archetypeCfg.speedMult ?? 1);
  const sizeMult = (typeCfg.sizeMult ?? 1) * (archetypeCfg.sizeMult ?? 1);
  return {
    pirateType: resolvedType,
    pirateArchetype: resolvedArchetype,
    health,
    speedMult,
    sizeMult
  };
}

function getPirateBulletProfile(pirateArchetype) {
  const resolvedArchetype = normalizePirateArchetype(pirateArchetype);
  const cfg = PIRATE_ARCHETYPE_CONFIG[resolvedArchetype] || PIRATE_ARCHETYPE_CONFIG.standard;
  return {
    pirateArchetype: resolvedArchetype,
    pelletCount: Math.max(1, Math.round(cfg.pelletCount || 1)),
    pelletSpread: cfg.pelletSpread || 0,
    bulletDamage: cfg.bulletDamage || 3,
    bulletColor: PIRATE_ARCHETYPE_BULLET_COLORS[resolvedArchetype] || PIRATE_ARCHETYPE_BULLET_COLORS.standard
  };
}

function rotateUnitVector(v, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: v.x * c - v.y * s,
    y: v.x * s + v.y * c
  };
}

function createPirate({
  x,
  y,
  vx = 0,
  vy = 0,
  pirateType = 'normal',
  pirateArchetype = 'standard',
  facingAngle = 0,
  defendingBase,
  orbitAngle,
  orbitRadius,
  fromBaseSpawn = false
}) {
  const profile = getPirateCombatProfile(pirateType, pirateArchetype);
  return {
    x,
    y,
    vx,
    vy,
    health: profile.health,
    maxHealth: profile.health,
    state: 'chase',
    stateTimer: Math.random() * 5,
    cooldown: 1 + Math.random() * 2,
    id: Math.random(),
    facingAngle,
    prevFacingAngle: facingAngle,
    tilt: 0,
    defendingBase,
    orbitAngle,
    orbitRadius,
    fromBaseSpawn,
    pirateType: profile.pirateType,
    pirateArchetype: profile.pirateArchetype,
    sizeMult: profile.sizeMult,
    accel: PIRATE_ACCEL * profile.speedMult,
    maxSpeed: PIRATE_MAX_SPEED * profile.speedMult,
    collisionRadius: PIRATE_BASE_COLLISION_RADIUS * profile.sizeMult
  };
}

function buildRadialSpawnOffsets(count, radius) {
  const n = Math.max(1, Math.round(Number(count) || 1));
  const offsets = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    offsets.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return offsets;
}

function applyPirateVariantVisual(clone, pirateType, sizeMult) {
  const resolvedType = normalizePirateType(pirateType);
  const cfg = PIRATE_TYPE_CONFIG[resolvedType];
  const baseVisualCfg = PIRATE_TYPE_CONFIG.normal;
  const tintColor = new THREE.Color(baseVisualCfg.tint);
  clone.scale.multiplyScalar(sizeMult || cfg.sizeMult || 1);
  clone.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const applyTint = (oldMat) => {
      const sourceColor = oldMat.color ? oldMat.color.clone() : new THREE.Color(0xee9999);
      const sourceEmissive = oldMat.emissive ? oldMat.emissive.clone() : new THREE.Color(0xff6666);
      sourceColor.lerp(tintColor, 0.35);
      sourceEmissive.lerp(tintColor, 0.25);
      return new THREE.MeshStandardMaterial({
        color: sourceColor,
        map: oldMat.map || null,
        roughness: oldMat.roughness ?? 0.7,
        metalness: oldMat.metalness ?? 0.3,
        emissive: sourceEmissive,
        emissiveMap: oldMat.emissiveMap || oldMat.map || null,
        emissiveIntensity: baseVisualCfg.emissiveIntensity ?? oldMat.emissiveIntensity ?? 1.5
      });
    };
    if (Array.isArray(child.material)) {
      child.material = child.material.map((m) => applyTint(m));
    } else {
      child.material = applyTint(child.material);
    }
  });
}

function applyFloatingOreMaterial(mesh, itemKey) {
  const emissiveColor = FLOATING_ORE_EMISSIVE[itemKey] ?? 0x888888;
  mesh.traverse((child) => {
    if (child.isMesh && child.material) {
      const oldMat = child.material;
      child.material = new THREE.MeshStandardMaterial({
        color: oldMat.color ? oldMat.color.clone() : 0x888888,
        map: oldMat.map || null,
        roughness: oldMat.roughness ?? 0.8,
        metalness: oldMat.metalness ?? 0.2,
        emissive: emissiveColor,
        emissiveMap: oldMat.map || null,
        emissiveIntensity: 5.0
      });
    }
  });
}

function refreshStructureMeshes() {
  if (!structureContainer) return;
  const STRUCTURE_SIZE = 40;
  const STRUCTURE_DIAMETER = STRUCTURE_SIZE * 2;
  const STRUCTURE_SCALE_MULT = 2.7; // base
  const scaleMultByType = { warpgate: 1.15, shop: 1.10, piratebase: 1.0, crafting: 0.75, shipyard: 0.96, refinery: 1.0 };
  const getSourceModel = (st) => {
    if (st.type === 'piratebase') {
      const tier = normalizePirateBaseTier(st.tier);
      return structureModels.piratebase?.[tier] || structureModels.piratebase?.[2] || structureModels['shop'];
    }
    return structureModels[st.type] || structureModels['shop'];
  };
  while (structureContainer.children.length) structureContainer.remove(structureContainer.children[0]);
  for (const st of structures) {
    if (!isCollidableStructure(st)) continue;
    const src = getSourceModel(st);
    if (!src) continue;
    const clone = src.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const typeMult = scaleMultByType[st.type] ?? 1.0;
    const tierMult = st.type === 'piratebase' ? getPirateBaseTierScale(st.tier) : 1.0;
    const scale = (STRUCTURE_DIAMETER / maxDim) * STRUCTURE_SCALE_MULT * typeMult * tierMult;
    clone.scale.setScalar(scale);
    st._mesh = clone;
    structureContainer.add(clone);
  }
}

function spawnPirateGroup(minCount, maxCount, typePercentages = DEFAULT_PIRATE_TYPE_PERCENTAGES) {
  const count = minCount + Math.floor(Math.random() * (maxCount - minCount + 1));
  const angle = Math.random() * Math.PI * 2;
  const dist = 1100; // Just outside view
  const cx = ship.x + Math.cos(angle) * dist;
  const cy = ship.y + Math.sin(angle) * dist;

  const spreadRadius = 50;
  for (let i = 0; i < count; i++) {
    const r = Math.random() * spreadRadius;
    const a = Math.random() * Math.PI * 2;
    pirates.push(createPirate({
      x: cx + Math.cos(a) * r,
      y: cy + Math.sin(a) * r,
      facingAngle: angle, // Face toward player initially
      pirateType: pickPirateType(typePercentages)
    }));
  }
}


function spawnBaseDefensePirates(st) {
  const count = Math.max(0, Math.round(Number(st.defenseCount ?? 8)));
  const orbitRadius = getPirateBaseDefenseOrbitRadius(st);
  const baseShuffleSeed = ((levelSeed ^ (Math.imul(Math.floor(st.x), 31) ^ Math.imul(Math.floor(st.y), 37))) >>> 0);
  const defenseTypeSequence = buildDeterministicPirateTypeSequence(count, st.defenseTypePercentages, baseShuffleSeed);
  const baseArchetype = normalizePirateArchetype(st.pirateArchetype);
  for (let i = 0; i < count; i++) {
    const orbitAngle = (i / count) * Math.PI * 2;
    pirates.push(createPirate({
      x: st.x + Math.cos(orbitAngle) * orbitRadius,
      y: st.y + Math.sin(orbitAngle) * orbitRadius,
      facingAngle: orbitAngle + Math.PI / 2,
      pirateType: defenseTypeSequence[i] || 'normal',
      pirateArchetype: baseArchetype,
      defendingBase: st,
      orbitAngle,
      orbitRadius
    }));
  }
}


function onPirateBaseDeath(st) {
  if (st.dead) return;
  st.dead = true;
  sfx.playExplosion('base');
  
  const drops = st.drops || [
    { item: 'scrap', quantity: 50 },
    { item: 'warp key', quantity: 1 }
  ];

  for (const drop of drops) {
    for (let k = 0; k < drop.quantity; k++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 40;
      const droppedItem = getItemPayload(drop.item, 1);
      floatingItems.push({
        ...droppedItem,
        quantity: 1,
        x: st.x,
        y: st.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed
      });
    }
  }

  if (st._mesh && structureContainer) structureContainer.remove(st._mesh);
  st._mesh = null;
}

function updatePirates(dt) {
  // Aggro: player entering radius 300 around any living pirate base
  for (const st of structures) {
    if (st.type !== 'piratebase' || st.dead || st.health <= 0) continue;
    const d = Math.sqrt((ship.x - st.x) ** 2 + (ship.y - st.y) ** 2);
    if (d < getPirateBaseAggroRadius(st)) st.aggroed = true;
  }

  // Spawning logic using level settings
  // Spawn based on absolute schedule (no countdown reset between tiers/phases).
  if (levelIsDebug) {
    while (levelElapsedTime >= pirateNextWaveTime) {
      spawnPirateGroup(6, 10, levelSpawnSettings.pirateTypePercentages);
      pirateNextWaveTime += 5;
    }
  } else {
    while (levelElapsedTime >= pirateNextWaveTime) {
      const t = pirateNextWaveTime;

      // Determine active tier based on the scheduled spawn time.
      let activeTier = null;
      let nextTierStart = Infinity;
      if (levelSpawnSettings.tiers && levelSpawnSettings.tiers.length > 0) {
        // Find the tier with the highest startTime that is <= current time
        // Tiers should be sorted by startTime, but we'll iterate to be safe
        let bestStart = -1;
        for (const tier of levelSpawnSettings.tiers) {
          const tierStart = Number(tier.startTime);
          if (!Number.isFinite(tierStart)) continue;
          if (t >= tierStart && tierStart > bestStart) {
            bestStart = tierStart;
            activeTier = tier;
          }
          if (tierStart > t && tierStart < nextTierStart) {
            nextTierStart = tierStart;
          }
        }
      }

      // Use active tier settings or fall back to base settings
      const minWave = activeTier ? activeTier.waveSizeMin : levelSpawnSettings.waveSizeMin;
      const maxWave = activeTier ? activeTier.waveSizeMax : levelSpawnSettings.waveSizeMax;
      const minInt = activeTier ? activeTier.waveIntervalMin : levelSpawnSettings.waveIntervalMin;
      const maxInt = activeTier ? activeTier.waveIntervalMax : levelSpawnSettings.waveIntervalMax;
      const typePercentages = activeTier?.pirateTypePercentages || levelSpawnSettings.pirateTypePercentages;

      spawnPirateGroup(minWave, maxWave, typePercentages);

      // Schedule next wave (keep time moving forward even if dt is large).
      // Clamp to the next tier boundary so phase start times are honored exactly.
      const rawInterval = minInt + Math.random() * (maxInt - minInt);
      const interval = Math.max(0.1, rawInterval);
      const nextByInterval = t + interval;
      pirateNextWaveTime = Number.isFinite(nextTierStart)
        ? Math.min(nextByInterval, nextTierStart)
        : nextByInterval;
    }
  }

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
        const orbitRadius = p.orbitRadius || getPirateBaseDefenseOrbitRadius(base);
        p.x = base.x + Math.cos(p.orbitAngle) * orbitRadius;
        p.y = base.y + Math.sin(p.orbitAngle) * orbitRadius;
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
      const pirateAccel = p.accel ?? PIRATE_ACCEL;
      if (p.state === 'chase') {
          ax += dirToPlayer.x * pirateAccel;
          ay += dirToPlayer.y * pirateAccel;
      } else {
          const cw = (p.id > 0.5) ? 1 : -1;
          ax += -dirToPlayer.y * cw * pirateAccel;
          ay += dirToPlayer.x * cw * pirateAccel;
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
         if (!isCollidableStructure(st)) continue;
         const sdx = st.x - p.x;
         const sdy = st.y - p.y;
         const sdist = Math.sqrt(sdx*sdx + sdy*sdy);
         if (sdist < getStructureCollisionRadius(st) + lookAheadObstacle) {
             ax -= (sdx / sdist) * 400;
             ay -= (sdy / sdist) * 400;
         }
      }
      const PLAYER_AVOID_RADIUS = 5;
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
      const pirateMaxSpeed = p.maxSpeed ?? PIRATE_MAX_SPEED;
      if (speed > pirateMaxSpeed) {
          const scale = pirateMaxSpeed / speed;
          p.vx *= scale;
          p.vy *= scale;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    // Physics Collisions (Bounce) – pirates do not damage asteroids
    const pirateCollRadius = p.collisionRadius ?? PIRATE_BASE_COLLISION_RADIUS;
    for (const ast of asteroids) {
        const hit = pushOutOverlap(p, ast, pirateCollRadius, ast.radius);
        if (hit) bounceEntity(p, hit.nx, hit.ny, BOUNCE_RESTITUTION);
    }
    for (const st of structures) {
        if (!isCollidableStructure(st)) continue;
        const hit = pushOutOverlap(p, st, pirateCollRadius, getStructureCollisionRadius(st));
        if (hit) bounceEntity(p, hit.nx, hit.ny, BOUNCE_RESTITUTION);
    }

    // Firing (defense-mode pirates do not shoot)
    if (!inDefenseMode) {
    p.cooldown -= dt;
    if (p.cooldown <= 0 && distToPlayer < PIRATE_FIRE_RANGE) {
         p.cooldown = 1.0 + Math.random() * 2.0;
         
         // Anticipate: use pirate bullet speed so lead matches travel time
         const timeToHit = distToPlayer / PIRATE_BULLET_SPEED;
         const predX = ship.x + ship.vx * timeToHit;
         const predY = ship.y + ship.vy * timeToHit;
         
         const aimX = predX + (Math.random()-0.5) * PIRATE_AIM_SPREAD;
         const aimY = predY + (Math.random()-0.5) * PIRATE_AIM_SPREAD;
         
         const fdx = aimX - p.x;
         const fdy = aimY - p.y;
         const fdist = Math.sqrt(fdx*fdx + fdy*fdy);
         const fdir = (fdist > 0) ? {x: fdx/fdist, y: fdy/fdist} : {x:1, y:0};
         
         const bulletProfile = getPirateBulletProfile(p.pirateArchetype);
         for (let pelletIdx = 0; pelletIdx < bulletProfile.pelletCount; pelletIdx++) {
            const centered = pelletIdx - (bulletProfile.pelletCount - 1) / 2;
            const spreadAngle = centered * bulletProfile.pelletSpread;
            const pelletDir = spreadAngle === 0 ? fdir : rotateUnitVector(fdir, spreadAngle);
            bullets.push({
              x: p.x + pelletDir.x * SHIP_SIZE * (p.sizeMult || 1),
              y: p.y + pelletDir.y * SHIP_SIZE * (p.sizeMult || 1),
              vx: pelletDir.x * PIRATE_BULLET_SPEED + p.vx,
              vy: pelletDir.y * PIRATE_BULLET_SPEED + p.vy,
              lifespan: 4,
              owner: 'pirate',
              damage: bulletProfile.bulletDamage,
              pirateArchetype: bulletProfile.pirateArchetype,
              color: bulletProfile.bulletColor
            });
         }
         sfx.playEnemyShot(p.pirateArchetype);
    }
    }

    // Update tilt (bank when turning)
    let deltaAngle = p.facingAngle - (p.prevFacingAngle !== undefined ? p.prevFacingAngle : p.facingAngle);
    while (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
    while (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
    p.prevFacingAngle = p.facingAngle;
    
    p.tilt = (p.tilt || 0) + deltaAngle * PIRATE_TILT_SENSITIVITY - (p.tilt || 0) * PIRATE_TILT_DECAY * dt;
    p.tilt = Math.max(-0.5, Math.min(0.5, p.tilt));

    // Death: drop 3-5 scrap only if not fromBaseSpawn
    if (p.health <= 0) {
        spawnSparks(p.x, p.y, 15);
        sfx.playExplosion('pirate');
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
        if (p._mesh && pirateContainer) pirateContainer.remove(p._mesh);
        pirates[i] = pirates[pirates.length - 1]; pirates.pop();
    }
  }
}

function updateDrones(dt) {
  for (let i = 0; i < drones.length; i++) {
    const drone = drones[i];
    drone.orbitAngle += DRONE_IDLE_ORBIT_SPEED * dt;
    drone.stateTimer -= dt;
    if (drone.stateTimer <= 0) {
      drone.state = drone.state === 'chase' ? 'circle' : 'chase';
      drone.stateTimer = 1.4 + Math.random() * 1.8;
    }
    drone.target = pickDroneTarget(drone);
    const target = drone.target;

    let ax = 0;
    let ay = 0;
    if (target) {
      const dx = target.x - drone.x;
      const dy = target.y - drone.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dir = dist > 0 ? { x: dx / dist, y: dy / dist } : { x: 0, y: 0 };
      if (drone.state === 'chase') {
        ax += dir.x * DRONE_ACCEL;
        ay += dir.y * DRONE_ACCEL;
      } else {
        const cw = (drone.id % 2 === 0) ? 1 : -1;
        ax += -dir.y * cw * DRONE_ACCEL;
        ay += dir.x * cw * DRONE_ACCEL;
      }
    } else {
      const orbitRadius = DRONE_IDLE_ORBIT_RADIUS + i * 4;
      const targetX = ship.x + Math.cos(drone.orbitAngle + i * 0.45) * orbitRadius;
      const targetY = ship.y + Math.sin(drone.orbitAngle + i * 0.45) * orbitRadius;
      const dx = targetX - drone.x;
      const dy = targetY - drone.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        ax += (dx / dist) * DRONE_ACCEL;
        ay += (dy / dist) * DRONE_ACCEL;
      }
    }

    const lookAhead = 20;
    for (const ast of asteroids) {
      const adx = ast.x - drone.x;
      const ady = ast.y - drone.y;
      const adist = Math.sqrt(adx * adx + ady * ady);
      if (adist > 0 && adist < ast.radius + lookAhead) {
        ax -= (adx / adist) * DRONE_AVOID_FORCE;
        ay -= (ady / adist) * DRONE_AVOID_FORCE;
      }
    }
    for (const st of structures) {
      if (!isCollidableStructure(st)) continue;
      const sdx = st.x - drone.x;
      const sdy = st.y - drone.y;
      const sdist = Math.sqrt(sdx * sdx + sdy * sdy);
      if (sdist > 0 && sdist < getStructureCollisionRadius(st) + lookAhead) {
        ax -= (sdx / sdist) * DRONE_AVOID_FORCE;
        ay -= (sdy / sdist) * DRONE_AVOID_FORCE;
      }
    }
    const pdx = ship.x - drone.x;
    const pdy = ship.y - drone.y;
    const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
    if (pdist > 0 && pdist < shipCollisionRadius + 24) {
      ax -= (pdx / pdist) * DRONE_AVOID_FORCE;
      ay -= (pdy / pdist) * DRONE_AVOID_FORCE;
    }

    // Stay-on-screen: pull toward center when near/past viewport edges
    const left = ship.x - WIDTH / 2 + DRONE_SCREEN_MARGIN;
    const right = ship.x + WIDTH / 2 - DRONE_SCREEN_MARGIN;
    const top = ship.y - HEIGHT / 2 + DRONE_SCREEN_MARGIN;
    const bottom = ship.y + HEIGHT / 2 - DRONE_SCREEN_MARGIN;
    if (drone.x < left) ax += (left - drone.x) / DRONE_SCREEN_MARGIN * DRONE_STAY_ON_SCREEN_FORCE;
    if (drone.x > right) ax -= (drone.x - right) / DRONE_SCREEN_MARGIN * DRONE_STAY_ON_SCREEN_FORCE;
    if (drone.y < top) ay += (top - drone.y) / DRONE_SCREEN_MARGIN * DRONE_STAY_ON_SCREEN_FORCE;
    if (drone.y > bottom) ay -= (drone.y - bottom) / DRONE_SCREEN_MARGIN * DRONE_STAY_ON_SCREEN_FORCE;

    // Player-proximity bias: pull toward player, stronger when farther
    if (pdist > 30) {
      const bias = DRONE_PLAYER_PROXIMITY_BIAS * Math.min(1, pdist / 150);
      ax += (pdx / pdist) * bias;
      ay += (pdy / pdist) * bias;
    }

    drone.vx += ax * dt;
    drone.vy += ay * dt;
    drone.vx *= Math.max(0, 1 - DRONE_FRICTION * dt);
    drone.vy *= Math.max(0, 1 - DRONE_FRICTION * dt);
    const speed = Math.sqrt(drone.vx * drone.vx + drone.vy * drone.vy);
    if (speed > DRONE_MAX_SPEED) {
      const s = DRONE_MAX_SPEED / speed;
      drone.vx *= s;
      drone.vy *= s;
    }

    drone.x += drone.vx * dt;
    drone.y += drone.vy * dt;

    for (const ast of asteroids) {
      const hit = pushOutOverlap(drone, ast, DRONE_COLLISION_RADIUS, ast.radius);
      if (hit) bounceEntity(drone, hit.nx, hit.ny, BOUNCE_RESTITUTION);
    }
    for (const st of structures) {
      if (!isCollidableStructure(st)) continue;
      const hit = pushOutOverlap(drone, st, DRONE_COLLISION_RADIUS, getStructureCollisionRadius(st));
      if (hit) bounceEntity(drone, hit.nx, hit.ny, BOUNCE_RESTITUTION);
    }
    const shipHit = pushOutOverlap(drone, ship, DRONE_COLLISION_RADIUS, shipCollisionRadius);
    if (shipHit) bounceEntity(drone, shipHit.nx, shipHit.ny, BOUNCE_RESTITUTION);

    const thrustMag = Math.sqrt(ax * ax + ay * ay);
    if (thrustMag > 10) {
      const targetAngle = Math.atan2(ay, ax);
      let angleDiff = targetAngle - drone.facingAngle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      drone.facingAngle += angleDiff * Math.min(1, 5 * dt);
    }

    drone.fireTimer = (drone.fireTimer + dt) % DRONE_FIRE_PERIOD;
    const fireActive = drone.fireTimer <= DRONE_FIRE_ACTIVE_TIME;
    drone.laserActive = false;
    drone.laserLength = 0;
    if (fireActive && target) {
      const dx = target.x - drone.x;
      const dy = target.y - drone.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const targetRadius = getDroneTargetRadius(target);
      const distToSurface = Math.max(0, dist - targetRadius);
      if (dist > 0 && distToSurface <= DRONE_LASER_RANGE) {
        const dirX = dx / dist;
        const dirY = dy / dist;
        const maxDist = Math.min(DRONE_LASER_RANGE, getRayMaxDistanceToScreen(drone.x, drone.y, dirX, dirY));
        if (maxDist > 0) {
          const hit = getDroneLaserHit(drone, target, dirX, dirY, maxDist);
          if (hit) {
            hit.target.health -= DRONE_LASER_DPS * dt;
            if (hit.target.type === 'piratebase' && hit.target.health <= 0) onPirateBaseDeath(hit.target);
            const laserLength = Math.max(0, hit.distance - 2);
            const hitX = drone.x + dirX * laserLength;
            const hitY = drone.y + dirY * laserLength;
            drone.sparkCarry = (drone.sparkCarry ?? 0) + DRONE_LASER_SPARKS_PER_SECOND * dt;
            const n = Math.floor(drone.sparkCarry);
            if (n > 0) {
              spawnSparks(hitX, hitY, n);
              sfx.playImpact('laser');
              drone.sparkCarry -= n;
            }
            drone.laserActive = true;
            drone.laserDirX = dirX;
            drone.laserDirY = dirY;
            drone.laserLength = laserLength;
          }
        }
      }
    }
  }
}

function update(dt) {
  levelElapsedTime += dt;
  shipSlowTimer = Math.max(0, shipSlowTimer - dt);
  const shipSlowActive = shipSlowTimer > 0;
  setShipSlowVisual(shipSlowActive);
  const effectiveAccel = shipSlowActive ? ACCEL * SHIP_SLOW_FACTOR : ACCEL;
  const effectiveMaxSpeed = shipSlowActive ? MAX_SPEED * SHIP_SLOW_FACTOR : MAX_SPEED;
  // Ship movement (right-click) - only if there's a direction to move
  if (input.rightMouseDown && player.fuel > 0 && !deathSequence.active) {
    const dx = input.mouseX - WIDTH / 2;
    const dy = input.mouseY - HEIGHT / 2;
    const dir = normalize(dx, dy);
    // Only apply thrust and consume fuel if there's a direction
    if (dir.x !== 0 || dir.y !== 0) {
      ship.vx += dir.x * effectiveAccel * dt;
      ship.vy += dir.y * effectiveAccel * dt;
      player.fuel = Math.max(0, player.fuel - FUEL_DEPLETION_RATE * dt);
      tutorialTextTimerStarted = true; // Start tutorial fade timer on first thrust
    }
  }

  // Friction / speed / position (skip when dead — ship stays in place)
  if (!deathSequence.active) {
    const friction = input.ctrlBrake ? BRAKE_FRICTION : FRICTION;
    ship.vx *= Math.max(0, 1 - friction * dt);
    ship.vy *= Math.max(0, 1 - friction * dt);

    const speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
    if (speed > effectiveMaxSpeed) {
      const scale = effectiveMaxSpeed / speed;
      ship.vx *= scale;
      ship.vy *= scale;
    }

    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
  }
  const halfLevelWidth = levelWidth * 0.5;
  const halfLevelHeight = levelHeight * 0.5;
  const outsideLevelBorder =
    ship.x < -halfLevelWidth ||
    ship.x > halfLevelWidth ||
    ship.y < -halfLevelHeight ||
    ship.y > halfLevelHeight;
  setShipStatusPersistent('oxygen---', OXYGEN_BAR_COLOR, outsideLevelBorder);

  // Ship–asteroid collision: bounce + damage (skip when dead)
  if (!deathSequence.active)
  for (const ast of asteroids) {
    const hit = pushOutOverlap(ship, ast, shipCollisionRadius, ast.radius);
    if (hit) {
      const impactSpeed = bounceEntity(ship, hit.nx, hit.ny, BOUNCE_RESTITUTION);
      if (impactSpeed > 0) {
        sfx.playShipCollision(impactSpeed / 200);
        const damage = Math.min(MAX_COLLISION_DAMAGE, impactSpeed * DAMAGE_PER_SPEED);
        const appliedDamage = applyPlayerDamage(damage);
        const currentHealth = ast.health ?? ast.radius;
        ast.health = Math.max(0, currentHealth - appliedDamage / 2);
        const sparkOffset = shipCollisionRadius * 0.7 + (SHIP_SIZE * shipScale * 0.3);
        const sparkX = ship.x - hit.nx * sparkOffset;
        const sparkY = ship.y - hit.ny * sparkOffset;
        spawnSparks(sparkX, sparkY, Math.max(2, Math.round(appliedDamage)));
      }
    }
  }

  // Ship–structure collision (skip when dead)
  if (!deathSequence.active)
  for (const st of structures) {
    if (!isCollidableStructure(st)) continue;
    const hit = pushOutOverlap(ship, st, shipCollisionRadius, getStructureCollisionRadius(st));
    if (hit) {
      const impactSpeed = bounceEntity(ship, hit.nx, hit.ny, BOUNCE_RESTITUTION);
      if (impactSpeed > 0) {
        sfx.playShipCollision(impactSpeed / 200);
        const damage = Math.min(MAX_COLLISION_DAMAGE, impactSpeed * DAMAGE_PER_SPEED);
        const appliedDamage = applyPlayerDamage(damage);
        const sparkOffset = shipCollisionRadius * 0.7 + (SHIP_SIZE * shipScale * 0.3);
        const sparkX = ship.x - hit.nx * sparkOffset;
        const sparkY = ship.y - hit.ny * sparkOffset;
        spawnSparks(sparkX, sparkY, Math.max(2, Math.round(appliedDamage)));
        if (st.type === 'piratebase') {
          st.aggroed = true;
          const currentHealth = st.health ?? 100;
          st.health = Math.max(0, currentHealth - appliedDamage / 2);
          if (st.health <= 0) onPirateBaseDeath(st);
        }
      }
    }
  }

  // Oxygen depletion (skip when dead)
  if (!deathSequence.active) {
    let oxygenDrainPerSecond = OXYGEN_DEPLETION_RATE;
    if (outsideLevelBorder) oxygenDrainPerSecond += OUTSIDE_BORDER_OXYGEN_DRAIN_RATE;
    player.oxygen = Math.max(0, player.oxygen - oxygenDrainPerSecond * dt);
    
    // No oxygen: drain health at 1 per second
    if (player.oxygen <= 0) {
      applyPlayerDamage(1 * dt);
    }
  }

  // Mining lasers (light + medium): unified logic via MINING_LASER_STATS
  const hasEnergy = inventory.getFirstChargedCell() != null;
  const selectedItem = hotbar[selectedSlot];
  const miningLaser = selectedItem && MINING_LASER_STATS[selectedItem.item] ? selectedItem : null;
  const laserStats = miningLaser ? MINING_LASER_STATS[miningLaser.item] : null;
  let laserFiringNow = false;

  if (miningLaser && laserStats && miningLaser.heat != null) {
    if (miningLaser.heat >= 1) {
      if (!miningLaser.overheated) sfx.playOverheat();
      miningLaser.overheated = true;
    }
    if (miningLaser.heat <= 0) miningLaser.overheated = false;
    if (miningLaser.heat > 0) hudDirty = true;

    const canFire = !miningLaser.overheated;
    if (miningLaser && input.leftMouseDown && hasEnergy && canFire) {
      laserFiringNow = true;
      miningLaser.heat = Math.min(1, miningLaser.heat + laserStats.heatRate * dt);
      hudDirty = true;
      const cell = inventory.getFirstChargedCell();
      if (cell) { cell.energy = Math.max(0, cell.energy - laserStats.energyDrain * dt); }

      const dx = input.mouseX - WIDTH / 2;
      const dy = input.mouseY - HEIGHT / 2;
      const dir = normalize(dx, dy);
      if (dir.x !== 0 || dir.y !== 0) {
        // Cap laser at screen edge (world units; 1:1 with screen pixels, ship at center)
        let maxLaserDist = 1500;
        if (Math.abs(dir.x) > 1e-6) maxLaserDist = Math.min(maxLaserDist, (WIDTH / 2) / Math.abs(dir.x));
        if (Math.abs(dir.y) > 1e-6) maxLaserDist = Math.min(maxLaserDist, (HEIGHT / 2) / Math.abs(dir.y));

        const hit = laserHitAsteroid(ship.x, ship.y, dir.x, dir.y, maxLaserDist);
        
        // Check Pirates for laser hit
        let hitPirate = null;
        let pirateDist = maxLaserDist;
        for (const p of pirates) {
             const fx = p.x - ship.x;
             const fy = p.y - ship.y;
             const t = fx * dir.x + fy * dir.y;
             if (t < 0) continue;
             const cx = ship.x + dir.x * t;
             const cy = ship.y + dir.y * t;
             const distSq = (p.x - cx)*(p.x - cx) + (p.y - cy)*(p.y - cy);
             const r = p.collisionRadius ?? PIRATE_BASE_COLLISION_RADIUS;
             if (distSq < r*r) {
                 const offset = Math.sqrt(r*r - distSq);
                 const tHit = t - offset;
                 if (tHit > 0 && tHit < pirateDist) {
                     pirateDist = tHit;
                     hitPirate = p;
                 }
             }
        }

        const hitBase = laserHitPirateBase(ship.x, ship.y, dir.x, dir.y, maxLaserDist);
        const baseDist = hitBase ? hitBase.distance : maxLaserDist;

        let target = null;
        let hitDist = maxLaserDist;
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
          if (target.radius != null) {
            lastPlayerHitAsteroid = target;
            target._vibrateUntil = levelElapsedTime + ASTEROID_VIBRATE_DURATION;
          }
          // Apply damage multiplier only to pirates/pirate bases, not asteroids
          const isEnemy = target.defendingBase !== undefined || target.type === 'piratebase';
          // Mining lasers deal 30% less damage to pirates than to asteroids
          const pirateDmgMult = 0.7;
          target.health -= laserStats.dps * dt * (isEnemy ? shipDamageMult * pirateDmgMult : 1);
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
            sfx.playImpact('laser');
            sparkCarry -= n;
          }
        }
      }
    } else {
      miningLaser.heat = Math.max(0, miningLaser.heat - laserStats.coolRate * dt);
    }
  }
  if (laserFiringNow) {
    if (!laserWasFiring) sfx.startLaserLoop();
    sfx.updateLaserHeat(miningLaser?.heat ?? 0);
  } else if (laserWasFiring) {
    sfx.stopLaserLoop();
  }
  laserWasFiring = laserFiringNow;

  // Blasters (light / medium / large): unified logic via BLASTER_STATS
  const blasterItem = hotbar[selectedSlot] && BLASTER_STATS[hotbar[selectedSlot].item] ? hotbar[selectedSlot] : null;
  const bStats = blasterItem ? BLASTER_STATS[blasterItem.item] : null;
  if (blasterItem && bStats && blasterItem.heat != null) {
    if (blasterItem.heat >= 1) {
      if (!blasterItem.overheated) sfx.playOverheat();
      blasterItem.overheated = true;
    }
    if (blasterItem.heat <= 0) blasterItem.overheated = false;
    if (blasterItem.heat > 0) hudDirty = true;
    const blasterCanFire = !blasterItem.overheated;
    const hasBlasterEnergy = inventory.getFirstCellWithMinEnergy(bStats.energyPerShot) != null;
    if (blasterCanFire && input.leftMouseDown && hasBlasterEnergy) {
      blasterFireAccum += bStats.fireRate * dt;
      while (blasterFireAccum >= 1) {
        blasterFireAccum -= 1;
        const c = inventory.getFirstCellWithMinEnergy(bStats.energyPerShot);
        if (!c) break;
        c.energy = Math.max(0, c.energy - bStats.energyPerShot);
        blasterItem.heat = Math.min(1, blasterItem.heat + bStats.heatPerShot);
        fireBlasterPellet(bStats.pirateDmg, bStats.asteroidDmg);
        sfx.playPlayerBlaster(blasterItem.heat);
        hudDirty = true;
      }
    } else {
      blasterItem.heat = Math.max(0, blasterItem.heat - bStats.coolRate * dt);
    }
  }

  updatePirates(dt);
  updateDrones(dt);

  const droneLaserActiveNow = drones.some(d => d.laserActive);
  if (droneLaserActiveNow) {
    if (!droneLaserWasActive) sfx.startDroneLaserLoop();
  } else if (droneLaserWasActive) {
    sfx.stopDroneLaserLoop();
  }
  droneLaserWasActive = droneLaserActiveNow;

  // Pirate base wave spawning while aggroed
  const BASE_SPAWN_OFFSET = 80;
  for (const st of structures) {
    if (st.type !== 'piratebase' || st.dead || st.health <= 0 || !st.aggroed) continue;
    st.spawnTimer -= dt;
    if (st.spawnTimer <= 0) {
      st.spawnTimer = st.spawnRate || 30; // Use instance spawn rate
      const waveCount = Math.max(1, Math.round(Number(st.waveSpawnCount) || 4));
      const spawnMix = normalizePirateTypePercentages(st.waveSpawnTypePercentages);
      const offsets = buildRadialSpawnOffsets(waveCount, BASE_SPAWN_OFFSET);
      const baseArchetype = normalizePirateArchetype(st.pirateArchetype);
      for (const [ox, oy] of offsets) {
        const angle = Math.atan2(ship.y - (st.y + oy), ship.x - (st.x + ox));
        pirates.push(createPirate({
          x: st.x + ox,
          y: st.y + oy,
          facingAngle: angle,
          pirateType: pickPirateType(spawnMix),
          pirateArchetype: baseArchetype,
          fromBaseSpawn: true
        }));
      }
    }
  }

  // Bullets (movement + bullet-asteroid collision)
  const BULLET_DAMAGE = 3;            // pirate bullet damage to player
  const BULLET_DAMAGE_PIRATE = 3;    // fallback blaster damage per pellet to pirates
  const BULLET_DAMAGE_ASTEROID = 0.5; // fallback pellet damage to asteroids
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
        const astHitRadius = ast.radius + (b.owner === 'player' ? PLAYER_BULLET_HIT_RADIUS : 0);
        if (dist < astHitRadius) {
          if (b.owner === 'player') {
            ast.health -= (b.asteroidDmg ?? BULLET_DAMAGE_ASTEROID);
            lastPlayerHitAsteroid = ast;
            ast._vibrateUntil = levelElapsedTime + ASTEROID_VIBRATE_DURATION;
          }
          remove = true;
          spawnSparks(b.x, b.y, 3);
          sfx.playImpact('bullet');
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
          if (dist < getPirateBaseHitRadius(st) + PLAYER_BULLET_HIT_RADIUS) {
            st.health -= (b.pirateDmg ?? BULLET_DAMAGE_PIRATE) * shipDamageMult;
            st.aggroed = true;
            remove = true;
            spawnSparks(b.x, b.y, 4);
            sfx.playImpact('bullet');
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
            if (dist < (p.collisionRadius ?? PIRATE_BASE_COLLISION_RADIUS) + PLAYER_BULLET_HIT_RADIUS) {
                p.health -= (b.pirateDmg ?? BULLET_DAMAGE_PIRATE) * shipDamageMult;
                if (p.defendingBase) p.defendingBase.aggroed = true;
                remove = true;
                spawnSparks(b.x, b.y, 2);
                sfx.playImpact('bullet');
                break;
            }
        }
      }
      
      // Check Player (Pirate bullets) — skip when dead
      if (!remove && b.owner === 'pirate' && !deathSequence.active) {
          const dx = b.x - ship.x;
          const dy = b.y - ship.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < shipCollisionRadius) {
              const bulletDamage = Number.isFinite(Number(b.damage)) ? Number(b.damage) : BULLET_DAMAGE;
              const bulletArchetype = normalizePirateArchetype(b.pirateArchetype);
              applyPlayerDamage(bulletDamage);
              if (bulletArchetype === 'slowing') {
                shipSlowTimer = SHIP_SLOW_DURATION;
                setShipSlowVisual(true);
              } else if (bulletArchetype === 'breaching') {
                if (Math.random() < 0.5) {
                  const prevOxygen = player.oxygen;
                  player.oxygen = Math.max(0, player.oxygen - 1);
                  if (player.oxygen < prevOxygen) pushShipStatusTransient('oxygen-', OXYGEN_BAR_COLOR);
                } else {
                  const prevFuel = player.fuel;
                  player.fuel = Math.max(0, player.fuel - 1);
                  if (player.fuel < prevFuel) pushShipStatusTransient('fuel-', FUEL_BAR_COLOR);
                }
              }
              remove = true;
              spawnSparks(b.x, b.y, 4);
              sfx.playImpact('playerHit');
          }
      }
    }
    if (remove) { bullets[i] = bullets[bullets.length - 1]; bullets.pop(); }
  }

  // Particles (sparks) — damp computed once (same for all particles)
  const particleDamp = Math.exp(-PARTICLE_DRAG * dt);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= particleDamp;
    p.vy *= particleDamp;
    p.life -= dt;
    if (p.life <= 0) { particles[i] = particles[particles.length - 1]; particles.pop(); }
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
      if (lastPlayerHitAsteroid === ast) lastPlayerHitAsteroid = null;
      sfx.playExplosion('asteroid');
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
      asteroids[i] = asteroids[asteroids.length - 1]; asteroids.pop();
    }
  }

  // Floating items: magnet + movement + drag
  for (const item of floatingItems) {
    if (item.vx == null) item.vx = 0;
    if (item.vy == null) item.vy = 0;

    // Magnet attraction (only if inventory can accept this item)
    const dx = ship.x - item.x;
    const dy = ship.y - item.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0 && dist < MAGNET_RADIUS && dist > shipCollisionRadius && canAcceptFloatingItem(item) && !deathSequence.active) {
      const inv = 1 / dist;
      const pull = MAGNET_STRENGTH * (1 - dist / MAGNET_RADIUS);
      item.vx += dx * inv * pull * dt;
      item.vy += dy * inv * pull * dt;
    }

    // Integrate movement
    item.x += item.vx * dt;
    item.y += item.vy * dt;

    // Collision with asteroids and structures: push out so items don't overlap
    for (const ast of asteroids) {
      pushOutOverlap(item, ast, FLOAT_ITEM_RADIUS, ast.radius);
    }
    for (const st of structures) {
      if (!isCollidableStructure(st)) continue;
      pushOutOverlap(item, st, FLOAT_ITEM_RADIUS, getStructureCollisionRadius(st));
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

  // Create/update 3D mesh for ore-type floating items (skip off-screen position updates)
  const CULL_MARGIN_UPDATE = 350;
  const cullLeftU   = ship.x - WIDTH / 2 - CULL_MARGIN_UPDATE;
  const cullRightU  = ship.x + WIDTH / 2 + CULL_MARGIN_UPDATE;
  const cullTopU    = ship.y - HEIGHT / 2 - CULL_MARGIN_UPDATE;
  const cullBottomU = ship.y + HEIGHT / 2 + CULL_MARGIN_UPDATE;
  if (floatingOreContainer && (oreModel || scrapModel)) {
    for (const item of floatingItems) {
      if (!FLOATING_ORE_ITEMS.has(item.item)) continue;
      const src = (item.item === 'scrap' && scrapModel) ? scrapModel : oreModel;
      if (!src) continue;
      if (!item._mesh) {
        const clone = src.clone(true);
        applyFloatingOreMaterial(clone, item.item);
        clone.scale.setScalar(FLOATING_ORE_SCALE);
        item._mesh = clone;
        floatingOreContainer.add(clone);
        item._spinAxis = Math.floor(Math.random() * 3);
        item._spinDirection = Math.random() < 0.5 ? -1 : 1;
        item._spinSpeed = 0.5 + Math.random() * 0.4;
      }
      const onScreen = item.x > cullLeftU && item.x < cullRightU && item.y > cullTopU && item.y < cullBottomU;
      item._mesh.visible = onScreen;
      if (!onScreen) continue;
      item._mesh.position.set(item.x - ship.x, -(item.y - ship.y), 0);
      const spin = (item._spinSpeed ?? 0.6) * (item._spinDirection ?? 1) * dt;
      if (item._spinAxis === 0) item._mesh.rotation.x += spin;
      else if (item._spinAxis === 1) item._mesh.rotation.y += spin;
      else item._mesh.rotation.z += spin;
    }
  }

  // Pickup floating items only when within ship collision radius (skip when dead)
  const prevFloatingCount = floatingItems.length;
  for (let i = floatingItems.length - 1; i >= 0; i--) {
    const item = floatingItems[i];
    const dx = item.x - ship.x;
    const dy = item.y - ship.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < SHIP_COLLECTION_RADIUS && !deathSequence.active) {
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
        if (added) {
          sfx.playPickup('resource');
          if (item._mesh && floatingOreContainer) floatingOreContainer.remove(item._mesh);
          floatingItems[i] = floatingItems[floatingItems.length - 1]; floatingItems.pop();
        }
      } else if (item.fuel != null) {
        let added = false;
        for (let j = 0; j < hotbar.length; j++) {
          if (!hotbar[j]) {
            hotbar[j] = { item: item.item, fuel: item.fuel, maxFuel: item.maxFuel };
            added = true;
            break;
          }
        }
        if (added) {
          sfx.playPickup('resource');
          if (item._mesh && floatingOreContainer) floatingOreContainer.remove(item._mesh);
          floatingItems[i] = floatingItems[floatingItems.length - 1]; floatingItems.pop();
        }
      } else if (item.oxygen != null) {
        let added = false;
        for (let j = 0; j < hotbar.length; j++) {
          if (!hotbar[j]) {
            hotbar[j] = { item: item.item, oxygen: item.oxygen, maxOxygen: item.maxOxygen };
            added = true;
            break;
          }
        }
        if (added) {
          sfx.playPickup('resource');
          if (item._mesh && floatingOreContainer) floatingOreContainer.remove(item._mesh);
          floatingItems[i] = floatingItems[floatingItems.length - 1]; floatingItems.pop();
        }
      } else if (item.health != null) {
        let added = false;
        for (let j = 0; j < hotbar.length; j++) {
          if (!hotbar[j]) {
            hotbar[j] = {
              item: item.item,
              health: item.health,
              maxHealth: item.maxHealth ?? item.health
            };
            added = true;
            break;
          }
        }
        if (added) {
          sfx.playPickup('resource');
          if (item._mesh && floatingOreContainer) floatingOreContainer.remove(item._mesh);
          floatingItems[i] = floatingItems[floatingItems.length - 1]; floatingItems.pop();
        }
      } else if ((MINING_LASER_STATS[item.item] || BLASTER_STATS[item.item]) && item.heat != null) {
        // Heat weapon (any mining laser or blaster): restore heat/overheated
        let added = false;
        for (let j = 0; j < hotbar.length; j++) {
          if (!hotbar[j]) {
            hotbar[j] = { item: item.item, heat: item.heat, overheated: !!item.overheated };
            added = true;
            break;
          }
        }
        if (added) {
          sfx.playPickup('weapon');
          if (item._mesh && floatingOreContainer) floatingOreContainer.remove(item._mesh);
          floatingItems[i] = floatingItems[floatingItems.length - 1]; floatingItems.pop();
        }
      } else if (inventory.add(item.item, item.quantity)) {
        sfx.playPickup(ORE_ITEMS.includes(item.item) ? 'ore' : 'generic');
        if (item._mesh && floatingOreContainer) floatingOreContainer.remove(item._mesh);
        floatingItems[i] = floatingItems[floatingItems.length - 1]; floatingItems.pop();
      }
    }
  }
  if (floatingItems.length !== prevFloatingCount) hudDirty = true;
  maybeNotifyLowResource('health', player.health, player.maxHealth, 'low health', HEALTH_BAR_COLOR);
  maybeNotifyLowResource('fuel', player.fuel, player.maxFuel, 'low fuel', FUEL_BAR_COLOR);
  maybeNotifyLowResource('oxygen', player.oxygen, player.maxOxygen, 'low oxygen', OXYGEN_BAR_COLOR);
  updateShipStatus(dt);

  if (!deathScreenOpen && !deathSequence.active && player.health <= 0) startDeathSequence();
}

function render(dt = 1 / 60) {
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Off-screen culling bounds (world coordinates, with margin for large objects)
  const CULL_MARGIN = 350;
  const cullLeft   = ship.x - WIDTH / 2 - CULL_MARGIN;
  const cullRight  = ship.x + WIDTH / 2 + CULL_MARGIN;
  const cullTop    = ship.y - HEIGHT / 2 - CULL_MARGIN;
  const cullBottom = ship.y + HEIGHT / 2 + CULL_MARGIN;

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
    else if (ast.oreType === 'diamite') { fill = '#787878'; stroke = '#909090'; }
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
      
      // Health Bar
      if (p.health < p.maxHealth) {
          const barW = 32;
          const barH = 4;
          const pct = Math.max(0, p.health / p.maxHealth);
          const yOffset = 25 * (p.sizeMult || 1);
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(x - barW/2, y - yOffset, barW, barH);
          ctx.fillStyle = '#ff3333';
          ctx.fillRect(x - barW/2, y - yOffset, barW * pct, barH);
      }
  }

  // Drones (2D temporary visuals)
  for (const d of drones) {
    if (!d.laserActive || d.laserLength <= 0) continue;
    const sx = d.x - ship.x + WIDTH / 2;
    const sy = d.y - ship.y + HEIGHT / 2;
    if (sx < 0 || sx > WIDTH || sy < 0 || sy > HEIGHT) continue;
    const ex = sx + d.laserDirX * d.laserLength;
    const ey = sy + d.laserDirY * d.laserLength;
    ctx.strokeStyle = DRONE_LASER_OUTER_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.strokeStyle = DRONE_LASER_INNER_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
  for (const d of drones) {
    const { x, y } = worldToScreen(d.x, d.y);
    if (x < -20 || x > WIDTH + 20 || y < -20 || y > HEIGHT + 20) continue;
    const size = 7;
    const angle = d.facingAngle;
    const tipX = x + Math.cos(angle) * size;
    const tipY = y + Math.sin(angle) * size;
    const leftX = x + Math.cos(angle + 2.5) * size * 0.8;
    const leftY = y + Math.sin(angle + 2.5) * size * 0.8;
    const rightX = x + Math.cos(angle - 2.5) * size * 0.8;
    const rightY = y + Math.sin(angle - 2.5) * size * 0.8;
    ctx.fillStyle = '#8ec8ff';
    ctx.strokeStyle = '#d9eeff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Floating items in space — thin white glow for ore-type (3D) pellets
  for (const item of floatingItems) {
    if (!FLOATING_ORE_ITEMS.has(item.item)) continue;
    const { x, y } = worldToScreen(item.x, item.y);
    if (x < -30 || x > WIDTH + 30 || y < -30 || y > HEIGHT + 30) continue;
    const r = 14;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const item of floatingItems) {
    if (FLOATING_ORE_ITEMS.has(item.item)) continue; // ore-type items rendered as 3D only
    const { x, y } = worldToScreen(item.x, item.y);
    if (x < -20 || x > WIDTH + 20 || y < -20 || y > HEIGHT + 20) continue;
    // Draw small glowing circle - same fill/stroke as ore type
    const oreFill = { cuprite: '#665544', hematite: '#8B4513', aurite: '#B8860B', diamite: '#787878', platinite: '#D3D3D3', scrap: '#888888', 'warp key': '#B8860B', 'warp key fragment': '#8C7A45', copper: '#B87333', iron: '#696969', gold: '#FFD700', diamond: '#B9F2FF', platinum: '#E5E4E2' };
    const oreStroke = { cuprite: '#998877', hematite: '#A0522D', aurite: '#FFD700', diamite: '#909090', platinite: '#E5E4E2', scrap: '#aaaaaa', 'warp key': '#DAA520', 'warp key fragment': '#C4AE62', copper: '#D4915E', iron: '#8A8A8A', gold: '#FFE44D', diamond: '#DFFFFF', platinum: '#F0F0F0' };
    ctx.fillStyle = item.energy != null ? '#448844' :
                    (item.fuel != null ? '#886622' :
                    (item.oxygen != null ? '#446688' :
                    (BLASTER_STATS[item.item] ? '#6644aa' :
                    (item.heat != null ? '#884422' :
                    (oreFill[item.item] || '#aa8844')))));
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = item.energy != null ? '#66cc66' : (item.fuel != null ? '#cc8844' : (item.oxygen != null ? '#6699cc' : (BLASTER_STATS[item.item] ? '#8866dd' : (item.heat != null ? '#cc6633' : (oreStroke[item.item] || '#ccaa66')))));
    ctx.lineWidth = 2;
    ctx.stroke();
    // Item icon: image for fuel/energy/oxygen, else letter fallback
    const img = ITEM_IMAGES[item.item];
    if (img && img.complete && img.naturalWidth > 0) {
      const size = 18;
      ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
    } else {
      const icon = getItemLabel(item);
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
  const STRUCTURE_RADIUS_3D = 54;
  const STRUCTURE_SIZE = 40;
  const STRUCTURE_STYLES = { shop: '#446688', shipyard: '#664466', refinery: '#666644', fueling: '#446644', crafting: '#886644', warpgate: '#6644aa', piratebase: '#884422' };
  const INTERACTABLE_TYPES_SET = new Set(['shop', 'warpgate', 'crafting', 'refinery', 'shipyard']);
  for (const st of structures) {
    if (st.type === 'piratebase' && (st.dead || st.health <= 0)) continue;
    const is3D = st.type === 'warpgate' || st.type === 'shop' || st.type === 'shipyard' || st.type === 'refinery' || st.type === 'crafting' || st.type === 'piratebase';
    const r = is3D
      ? (st.type === 'piratebase' ? getPirateBaseVisualRadius(st) : STRUCTURE_RADIUS_3D)
      : STRUCTURE_SIZE;
    const hasKeyOpportunity = structureHasWarpKeyOpportunity(st);
    const glowPulse = hasKeyOpportunity ? (0.95 + Math.sin(levelElapsedTime * 2.4) * 0.08) : 1;
    const glowRadius = hasKeyOpportunity ? (r + 32) * glowPulse : 0;
    const isInteractable = INTERACTABLE_TYPES_SET.has(st.type);
    const cullR = st.type === 'piratebase' ? getPirateBaseAggroRadius(st) : (isInteractable ? INTERACT_RADIUS : r);
    const cullMargin = hasKeyOpportunity ? Math.max(cullR, glowRadius) : cullR;
    const { x, y } = worldToScreen(st.x, st.y);
    if (x + cullMargin < 0 || x - cullMargin > WIDTH || y + cullMargin < 0 || y - cullMargin > HEIGHT) continue;
    if (hasKeyOpportunity) {
      const glowGradient = ctx.createRadialGradient(x, y, Math.max(4, r * 0.2), x, y, glowRadius);
      glowGradient.addColorStop(0, 'rgba(255, 226, 120, 0.42)');
      glowGradient.addColorStop(0.55, 'rgba(255, 204, 64, 0.20)');
      glowGradient.addColorStop(1, 'rgba(255, 204, 64, 0.00)');
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    if (is3D) {
      if (st.type === 'piratebase') {
        ctx.strokeStyle = normalizePirateBaseTier(st.tier) === 5 ? '#552200' : STRUCTURE_STYLES.piratebase;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.arc(x, y, getPirateBaseAggroRadius(st), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // Health bar when damaged
        if (st.health < st.maxHealth) {
          const barW = 90;
          const barH = 6;
          const pct = Math.max(0, st.health / st.maxHealth);
          const barUpOffset = st.tier === 1 ? 28 : 20; // tier 1 bar slightly higher
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(x - barW/2, y - r - barUpOffset, barW, barH);
          ctx.fillStyle = '#ff3333';
          ctx.fillRect(x - barW/2, y - r - barUpOffset, barW * pct, barH);
        }
      } else {
        // Shop, warpgate (3D) -- dashed interact ring
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.arc(x, y, INTERACT_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = STRUCTURE_STYLES[st.type] || '#446688';
      ctx.fill();
      ctx.stroke();
      if (isInteractable) {
        // Dashed interact ring -- same size for all interactable structures
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.arc(x, y, INTERACT_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
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
    ctx.fillStyle = b.color || '#ffcc00';
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

  // Update 3D asteroid positions (camera-follow; skip off-screen)
  for (const ast of asteroids) {
    if (!ast._mesh) continue;
    const r = ast.radius ?? 0;
    const onScreen = (ast.x - r) < cullRight && (ast.x + r) > cullLeft && (ast.y - r) < cullBottom && (ast.y + r) > cullTop;
    ast._mesh.visible = onScreen;
    if (!onScreen) continue;
    let wobbleX = 0, wobbleY = 0;
    if (ast._vibrateUntil != null && levelElapsedTime < ast._vibrateUntil) {
      const remain = (ast._vibrateUntil - levelElapsedTime) / ASTEROID_VIBRATE_DURATION;
      const amp = ASTEROID_VIBRATE_AMPLITUDE * remain;
      wobbleX = (Math.sin(levelElapsedTime * 45) + Math.sin(levelElapsedTime * 70) * 0.5) * amp;
      wobbleY = (Math.cos(levelElapsedTime * 55) + Math.cos(levelElapsedTime * 65) * 0.5) * amp;
    } else if (ast._vibrateUntil != null) {
      ast._vibrateUntil = null;
    }
    ast._mesh.position.set(ast.x - ship.x + wobbleX, -(ast.y - ship.y) + wobbleY, 0);
    const spin = (ast._spinSpeed ?? 0.3) * (ast._spinDirection ?? 1) * dt;
    if (ast._spinAxis === 0) ast._mesh.rotation.x += spin;
    else if (ast._spinAxis === 1) ast._mesh.rotation.y += spin;
    else ast._mesh.rotation.z += spin;
  }

  // Update 3D structure positions (camera-follow; skip off-screen)
  for (const st of structures) {
    if (!st._mesh) continue;
    const onScreen = st.x > cullLeft && st.x < cullRight && st.y > cullTop && st.y < cullBottom;
    st._mesh.visible = onScreen;
    if (!onScreen) continue;
    const yOff = st.type === 'shop' ? 4 : st.type === 'crafting' ? 5 : 0;
    st._mesh.position.set(st.x - ship.x, -(st.y - ship.y) + yOff, 0);
  }

  // Update 3D pirate positions
  for (const p of pirates) {
    if (!p._mesh && pirateContainer) {
        const archetype = normalizePirateArchetype(p.pirateArchetype);
        const src = pirateModels[archetype];
        if (!src) continue;
        const clone = src.clone(true);
        applyPirateVariantVisual(clone, p.pirateType, p.sizeMult);
        pirateContainer.add(clone);
        p._mesh = clone;
    }
    if (p._mesh) {
        p._mesh.position.set(p.x - ship.x, -(p.y - ship.y), 0);
        p._mesh.rotation.x = -Math.PI / 2;
        p._mesh.rotation.y = p.facingAngle + Math.PI / 2;
        p._mesh.rotation.z = p.tilt || 0;
        p._mesh.visible = true;
    }
  }

  // Ship: 3D model if loaded, else 2D triangle
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const aimAngle = Math.atan2(input.mouseY - cy, input.mouseX - cx);
  // Always clear the ship canvas so it stays transparent before model load.
  if (shipRenderer) shipRenderer.clear();
  if (hidePlayerShip) {
    shipTiltInitialized = false;
    // Hide only the player ship mesh but still render the rest of the 3D scene
    if (shipMesh) shipMesh.visible = false;
    for (const flame of shipFlames) flame.visible = false;
    if (shipRenderer && shipScene && shipCamera) shipRenderer.render(shipScene, shipCamera);
  } else if (shipModelLoaded && shipMesh && shipRenderer && shipScene && shipCamera) {
    if (shipMesh) shipMesh.visible = true;
    // Tilt when turning, decay when resting
    if (!shipTiltInitialized) {
      prevAimAngle = aimAngle;
      shipTiltInitialized = true;
    }
    let deltaAngle = aimAngle - prevAimAngle;
    while (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
    while (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
    prevAimAngle = aimAngle;
    shipTilt += deltaAngle * PIRATE_TILT_SENSITIVITY - shipTilt * PIRATE_TILT_DECAY * dt;
    shipTilt = Math.max(-0.5, Math.min(0.5, shipTilt));
    shipMesh.scale.setScalar(shipBaseScale * shipScale);
    shipMesh.rotation.y = -aimAngle + Math.PI / 2;
    shipMesh.rotation.z = shipTilt;
    // Show thruster flames when thrusting
    const thrustDx = input.mouseX - WIDTH / 2;
    const thrustDy = input.mouseY - HEIGHT / 2;
    const isThrusting = input.rightMouseDown && player.fuel > 0 && (thrustDx !== 0 || thrustDy !== 0);
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
  if (!hidePlayerShip) drawCrosshairAndHeatBar();

  // Mining laser beam (orange-red line) - any mining laser in MINING_LASER_STATS
  const hasEnergy = inventory.getFirstChargedCell() != null;
  const selectedItem = hotbar[selectedSlot];
  const miningLaser = selectedItem && MINING_LASER_STATS[selectedItem.item] ? selectedItem : null;
  const canFire = miningLaser && !miningLaser.overheated;
  if (miningLaser && input.leftMouseDown && hasEnergy && canFire) {
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    const dx = input.mouseX - cx;
    const dy = input.mouseY - cy;
    const dir = normalize(dx, dy);
    // Cap at screen edge (world units; 1:1 with screen, ship at center)
    let maxLaserDist = 1500;
    if (Math.abs(dir.x) > 1e-6) maxLaserDist = Math.min(maxLaserDist, (WIDTH / 2) / Math.abs(dir.x));
    if (Math.abs(dir.y) > 1e-6) maxLaserDist = Math.min(maxLaserDist, (HEIGHT / 2) / Math.abs(dir.y));
    let laserLength = maxLaserDist;
    
    // Check for asteroid or pirate hit and shorten laser (stop before surface)
    if (dir.x !== 0 || dir.y !== 0) {
      const hit = laserHitAsteroid(ship.x, ship.y, dir.x, dir.y, maxLaserDist);
      if (hit) {
        laserLength = Math.min(laserLength, Math.max(0, hit.distance - 10));
      }
      // Check pirates: ray-circle intersection, use closest hit
      for (const p of pirates) {
        const pirateRadius = p.collisionRadius ?? PIRATE_BASE_COLLISION_RADIUS;
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

  // Interaction prompt for nearby interactable structures (shop, warpgate, crafting, refinery)
  {
    const INTERACTABLE_TYPES = new Set(['shop', 'warpgate', 'crafting', 'refinery', 'shipyard']);
    const INTERACT_LABELS = { shop: 'Shop', warpgate: 'Warp Gate', crafting: 'Crafting Station', refinery: 'Refinery', shipyard: 'Shipyard' };
    let nearestInteractable = null;
    let nearestDist = Infinity;
    if (!shopMenuOpen && !craftingMenuOpen && !refineryMenuOpen && !shipyardMenuOpen) {
      for (const st of structures) {
        if (!INTERACTABLE_TYPES.has(st.type)) continue;
        if (st.type === 'piratebase' && (st.dead || st.health <= 0)) continue;
        const dx = ship.x - st.x;
        const dy = ship.y - st.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < INTERACT_RADIUS && dist < nearestDist) {
          nearestDist = dist;
          nearestInteractable = st;
        }
      }
    }
    // Fade in/out
    const fadeSpeed = 6; // per second
    if (nearestInteractable) {
      interactPromptTarget = nearestInteractable;
      interactPromptAlpha = Math.min(1, interactPromptAlpha + fadeSpeed * dt);
    } else {
      interactPromptAlpha = Math.max(0, interactPromptAlpha - fadeSpeed * dt);
    }
    // Draw with alpha (above the 3D model)
    if (interactPromptAlpha > 0 && interactPromptTarget) {
      const { x, y } = worldToScreen(interactPromptTarget.x, interactPromptTarget.y);
      const label = INTERACT_LABELS[interactPromptTarget.type] || interactPromptTarget.type;
      const a = interactPromptAlpha;
      const topY = y - 95; // Above 3D model (radius ~54 + padding)
      ctx.font = 'bold 14px Oxanium';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.fillText(label, x + 1, topY + 1);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillText(label, x, topY);
      ctx.font = '12px Oxanium';
      ctx.textBaseline = 'top';
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.fillText('Press E to interact', x + 1, topY + 4);
      ctx.fillStyle = `rgba(170,170,170,${a})`;
      ctx.fillText('Press E to interact', x, topY + 3);
    }
    if (interactPromptAlpha <= 0) interactPromptTarget = null;
  }

  // Tutorial text (Level 1 only; visible until first thrust, then 10s + 1s fade)
  if (currentLevelIdx === 0 && (tutorialTextTimer > 0 || !tutorialTextTimerStarted)) {
    if (tutorialTextTimerStarted) tutorialTextTimer -= dt;
    const fadeStart = 1; // Start fading at 1 second remaining
    const alpha = !tutorialTextTimerStarted ? 1 : (tutorialTextTimer > fadeStart ? 1 : Math.max(0, tutorialTextTimer / fadeStart));
    if (alpha > 0) {
      const { x, y } = worldToScreen(tutorialTextWorldX, tutorialTextWorldY);
      const lines = [
        'Left click to fire.',
        'Right click to thrust.',
        'Ctrl to brake.'
      ];
      ctx.font = '14px Oxanium';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lineHeight = 20;
      const startY = y - ((lines.length - 1) * lineHeight) / 2;
      for (let i = 0; i < lines.length; i++) {
        const ly = startY + i * lineHeight;
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        ctx.fillText(lines[i], x + 1, ly + 1);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillText(lines[i], x, ly);
      }
    }
  }

  // Ship status notifications
  {
    const visible = [];
    if (shipStatusPersistent.alpha > 0 && shipStatusPersistent.text) {
      visible.push({
        text: shipStatusPersistent.text,
        color: shipStatusPersistent.color,
        alpha: shipStatusPersistent.alpha
      });
    }
    for (let i = shipStatusTransient.length - 1; i >= 0; i--) {
      const msg = shipStatusTransient[i];
      const alpha = msg.remaining > msg.fadeDuration ? 1 : Math.max(0, msg.remaining / msg.fadeDuration);
      if (alpha <= 0) continue;
      visible.push({ text: msg.text, color: msg.color, alpha });
    }
    if (visible.length > 0) {
      // Draw on the UI canvas so alerts are always above the 3D scene.
      const statusCtx = uiCtx || ctx;
      const { x, y } = worldToScreen(ship.x, ship.y);
      statusCtx.font = 'bold 13px Oxanium';
      statusCtx.textAlign = 'center';
      statusCtx.textBaseline = 'middle';
      for (let i = 0; i < visible.length; i++) {
        const msg = visible[i];
        const msgY = y - SHIP_STATUS_BASE_Y_OFFSET - (i * SHIP_STATUS_LINE_SPACING);
        statusCtx.fillStyle = `rgba(0,0,0,${msg.alpha})`;
        statusCtx.fillText(msg.text, x + 1, msgY + 1);
        statusCtx.fillStyle = msg.color;
        statusCtx.globalAlpha = msg.alpha;
        statusCtx.fillText(msg.text, x, msgY);
        statusCtx.globalAlpha = 1;
      }
    }
  }

  // Player stats meters (bottom right) - bar height in pixels = max value in units
  if (uiCtx) {
    const meterWidth = 40;
    const meterSpacing = 50;
    const meterY = HEIGHT - 20;
    const rightmost = WIDTH - 30;

    syncResourceBarDropZones({
      meterWidth,
      meterY,
      oxygenX: rightmost - (meterSpacing * 2),
      fuelX: rightmost - meterSpacing,
      healthX: rightmost,
      oxygenMax: player.maxOxygen,
      fuelMax: player.maxFuel,
      healthMax: player.maxHealth
    });

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

    drawMeter(rightmost - 100, player.oxygen, player.maxOxygen, OXYGEN_BAR_COLOR, 'O2');
    drawMeter(rightmost - 50, player.fuel, player.maxFuel, FUEL_BAR_COLOR, 'Fuel');
    drawMeter(rightmost, player.health, player.maxHealth, HEALTH_BAR_COLOR, 'HP');
  }

  // Warp transition bloom overlay — fancy bloom on game canvas (behind 3D),
  // solid white on ui canvas (z-index 14, above ship-canvas z-index 2) to cover 3D objects
  renderWarpTransitionFancy(ctx, WIDTH, HEIGHT);
  if (uiCtx) renderWarpTransitionSolid(uiCtx, WIDTH, HEIGHT);
}

function syncResourceBarDropZones({
  meterWidth,
  meterY,
  oxygenX,
  fuelX,
  healthX,
  oxygenMax,
  fuelMax,
  healthMax
}) {
  const barSpecs = [
    { id: 'oxygen-bar-drop-zone', x: oxygenX, max: oxygenMax },
    { id: 'fuel-bar-drop-zone', x: fuelX, max: fuelMax },
    { id: 'health-bar-drop-zone', x: healthX, max: healthMax }
  ];
  for (const spec of barSpecs) {
    const el = document.getElementById(spec.id);
    if (!el) continue;
    const barHeight = Math.max(1, Number(spec.max) * 2);
    el.style.left = `${spec.x - meterWidth / 2}px`;
    el.style.bottom = `${HEIGHT - meterY}px`;
    el.style.width = `${meterWidth}px`;
    el.style.height = `${barHeight}px`;
  }
}

// Input





canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (startScreenOpen || deathScreenOpen) return;
  if (warpMenuOpen) return;
  if (shopMenuOpen) return;
  const slotCount = inventory.slots.length;
  if (slotCount <= 0) return;
  if (e.deltaY > 0) {
    selectedSlot = (selectedSlot + 1) % slotCount;
  } else {
    selectedSlot = (selectedSlot - 1 + slotCount) % slotCount;
  }
  sfx.playHotbarSelect();
  markHUDDirty();
});

function getNearbyStructureByType(type) {
  for (const st of structures) {
    if (st.type !== type) continue;
    const dx = ship.x - st.x;
    const dy = ship.y - st.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < INTERACT_RADIUS) return st;
  }
  return null;
}

function isShipInWarpGate() {
  return getNearbyStructureByType('warpgate');
}

function isShipInShop() {
  return getNearbyStructureByType('shop');
}

function isShipInCrafting() {
  return getNearbyStructureByType('crafting');
}

function isShipInRefinery() {
  return getNearbyStructureByType('refinery');
}

function isShipInShipyard() {
  return getNearbyStructureByType('shipyard');
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
  if (item.energy != null || item.fuel != null || item.oxygen != null || ((MINING_LASER_STATS[item.item] || BLASTER_STATS[item.item]) && item.heat != null)) {
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

// Shop: buy/sell 6x4 grid (24 slots)
const shopBuySlots = Array(24).fill(null);
const shopSellSlots = Array(24).fill(null);

function initShopBuySlots() {
  // Global init removed, handled per shop instance
}

// Remove one unit of an item from the active shop structure's persistent inventory
function removeFromShopInventory(itemKey) {
  if (!activeShopStructure || !activeShopStructure.inventory) return;
  const inv = activeShopStructure.inventory;
  const idx = inv.findIndex(entry => entry.item === itemKey);
  if (idx === -1) return;
  const entry = inv[idx];
  const qty = entry.quantity || 1;
  if (qty > 1) {
    entry.quantity = qty - 1;
  } else {
    inv.splice(idx, 1);
  }
}

function getShopItemPayload(itemKey) {
  return getItemPayload(itemKey);
}


function getWeaponTierLetter(itemKey) {
  if (itemKey === 'light blaster' || itemKey === 'mining laser') return 'L';
  if (itemKey === 'medium mining laser' || itemKey === 'medium blaster') return 'M';
  if (itemKey === 'large mining laser' || itemKey === 'large blaster') return 'XL';
  return null;
}

function getSlotHTML(it) {
  let html = '';
  if (it) {
    const imgPath = getItemImagePath(it.item);
    const oreIconUrl = FLOATING_ORE_ITEMS.has(it.item) ? ORE_ICON_DATA_URLS[it.item] : null;
    if (oreIconUrl) {
      html += `<div class="slot-icon slot-icon-ore-wrap"><img src="${oreIconUrl}" class="slot-icon-ore-bg" alt=""><span class="slot-icon-ore-letter">${getItemLabel(it)}</span></div>`;
    } else if (imgPath) {
      html += `<img src="${imgPath}" class="slot-icon slot-icon-img" alt="">`;
    } else {
      html += `<span class="slot-icon">${getItemLabel(it)}</span>`;
    }
    const tierLetter = getWeaponTierLetter(it.item);
    if (tierLetter) html += `<span class="slot-tier">${tierLetter}</span>`;

    // Weapon heat bar (red)
    if (HEAT_WEAPONS.includes(it.item) && it.heat != null) {
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
    } else if (it.oxygen != null) {
      // Oxygen canister: oxygen value + charge bar (blue)
      html += `<span class="slot-energy">${it.oxygen.toFixed(1)}</span>`;
      const charge = it.maxOxygen > 0 ? it.oxygen / it.maxOxygen : 0;
      const fillH = Math.round(32 * charge);
      const color = charge > 0.5 ? '#66aaff' : (charge > 0.25 ? '#88ccff' : '#4488dd');
      html += `<div class="slot-bar"><div class="slot-bar-fill" style="height:${fillH}px;background:${color};"></div></div>`;
    } else if (it.health != null) {
      // Health pack: health value + charge bar (reddish)
      html += `<span class="slot-energy">${it.health.toFixed(1)}</span>`;
      const maxHealthByItem = { 'health pack': 10, 'medium health pack': 30, 'large health pack': 60 };
      const maxHealth = maxHealthByItem[it.item] || Math.max(it.health, 10);
      const charge = it.health / maxHealth;
      const fillH = Math.round(32 * charge);
      const color = '#ff4444';
      html += `<div class="slot-bar"><div class="slot-bar-fill" style="height:${fillH}px;background:${color};"></div></div>`;
    } else if (it.quantity != null && it.quantity > 1) {
      html += `<span class="slot-qty">${it.quantity}</span>`;
    }
  }
  return html;
}

const SMALL_ENERGY_CELL_FULL_SELL = 100;
const MEDIUM_ENERGY_CELL_FULL_SELL = 350;
const LARGE_ENERGY_CELL_FULL_SELL = 750;
const ENERGY_CELL_MIN_SELL = 10;

function getItemSellPrice(item) {
  if (!item) return 0;
  // Energy cells: proportional to remaining charge, with a small sell floor.
  const energyCellFullSell = {
    'small energy cell': SMALL_ENERGY_CELL_FULL_SELL,
    'medium energy cell': MEDIUM_ENERGY_CELL_FULL_SELL,
    'large energy cell': LARGE_ENERGY_CELL_FULL_SELL
  };
  if (energyCellFullSell[item.item] != null && item.energy != null && item.maxEnergy != null) {
    const chargeRatio = item.maxEnergy > 0 ? item.energy / item.maxEnergy : 0;
    return Math.max(ENERGY_CELL_MIN_SELL, Math.round(energyCellFullSell[item.item] * chargeRatio));
  }
  // Consumable refill items and buyable weapons sell for half of purchase price.
  if ([
    'fuel tank', 'medium fuel tank', 'large fuel tank',
    'oxygen canister', 'medium oxygen canister', 'large oxygen canister',
    'health pack', 'medium health pack', 'large health pack',
    'light blaster', 'medium blaster', 'large blaster',
    'medium mining laser', 'large mining laser'
  ].includes(item.item)) {
    const buy = ITEM_BUY_PRICE[item.item];
    return buy != null ? Math.floor(buy / 2) : 0;
  }
  // Static prices for ore, scrap, warp keys, base mining laser, etc.
  const price = ITEM_SELL_PRICE[item.item];
  return price != null ? price : 0;
}

function getItemBuyPrice(itemKey) {
  // Check for custom shop price override first
  if (activeShopStructure && activeShopStructure.prices && activeShopStructure.prices[itemKey] !== undefined) {
    return activeShopStructure.prices[itemKey];
  }
  // Fall back to default price
  return ITEM_BUY_PRICE[itemKey] || 0;
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
  
    // Build price list - only items in this shop, sorted by price
    const itemNames = { 
      'small energy cell': 'Small Energy Cell',
      'medium energy cell': 'Medium Energy Cell',
      'large energy cell': 'Large Energy Cell',
      'fuel tank': 'Fuel Tank', 
      'medium fuel tank': 'Medium Fuel Tank',
      'large fuel tank': 'Large Fuel Tank',
      'oxygen canister': 'Oxygen Canister',
      'medium oxygen canister': 'Medium Oxygen Canister',
      'large oxygen canister': 'Large Oxygen Canister',
      'health pack': 'Health Pack',
      'medium health pack': 'Medium Health Pack',
      'large health pack': 'Large Health Pack',
      'light blaster': 'Light Blaster',
      'medium blaster': 'Medium Blaster',
      'large blaster': 'Large Blaster',
      'medium mining laser': 'Medium Mining Laser',
      'large mining laser': 'Large Mining Laser',
      cuprite: 'Cuprite',
      hematite: 'Hematite',
      aurite: 'Aurite',
      diamite: 'Diamite',
      platinite: 'Platinite',
      'scrap': 'Scrap',
      'warp key': 'Warp Key',
      'warp key fragment': 'Warp Key Fragment'
    };
    let html = '';
    
    // Only include items that are in this shop's inventory
    const shopItems = new Set();
    if (activeShopStructure && activeShopStructure.inventory) {
      activeShopStructure.inventory.forEach(i => shopItems.add(i.item));
    }
    
    // Sort by price (ascending)
    const sortedItems = Array.from(shopItems)
      .map(itemKey => ({ itemKey, price: getItemBuyPrice(itemKey) }))
      .filter(x => x.price > 0)
      .sort((a, b) => a.price - b.price);
    
    for (const { itemKey, price } of sortedItems) {
      const label = itemNames[itemKey] || itemKey;
      html += `<div class="price-row"><span class="price-label">${label}</span><span class="price-value">${price} cr</span></div>`;
    }
    const priceList = document.getElementById('shop-price-list');
    if (priceList) priceList.innerHTML = html;
}


// Cached HUD DOM references (populated once, avoids querySelector per frame)
const _hudSlots = []; // indices 0-8 = hotbar, 9-26 = extended rows
let _hudCreditsVal = null;
let _hudShopCredits = null;
let _extInvEl = null;
function _cacheHUDElements() {
  for (let i = 0; i < 9; i++) {
    _hudSlots[i] = document.querySelector(`#hotbar .slot[data-slot="${i}"]`);
  }
  for (let i = 9; i < 27; i++) {
    _hudSlots[i] = document.querySelector(`#extended-inventory .ext-slot[data-slot="${i}"]`);
  }
  _hudCreditsVal = document.querySelector('.credits-value');
  _hudShopCredits = document.getElementById('shop-credits-display');
  _extInvEl = document.getElementById('extended-inventory');
}

function markHUDDirty() { hudDirty = true; }

function updateHUD() {
  hudDirty = true; // Mark dirty so the gameLoop flushes it (keeps existing call-sites working)
}

function _flushHUD() {
  if (!hudDirty) return;
  hudDirty = false;
  if (_hudSlots.length === 0 || !_hudSlots[0]) _cacheHUDElements();
  const totalSlots = inventory.slots.length;
  // Render hotbar slots (0-8)
  for (let i = 0; i < 9; i++) {
    const el = _hudSlots[i];
    if (!el) continue;
    const it = hotbar[i];
    el.classList.toggle('has-item', !!it);
    el.classList.toggle('selected', i === selectedSlot);
    let html = `<span class="slot-num">${i + 1}</span>`;
    html += getSlotHTML(it);
    el.innerHTML = html;
  }
  // Render extended slots (9-26)
  for (let i = 9; i < 27; i++) {
    const el = _hudSlots[i];
    if (!el) continue;
    if (i < totalSlots) {
      el.style.display = '';
      const it = hotbar[i];
      el.classList.toggle('has-item', !!it);
      el.classList.toggle('selected', false);
      el.innerHTML = getSlotHTML(it);
    } else {
      el.style.display = 'none';
    }
  }
  // Show/hide extended inventory container based on whether ship has >9 slots
  if (_extInvEl) {
    const shouldShow = totalSlots > 9 && _extInvVisible;
    _extInvEl.classList.toggle('visible', shouldShow);
  }
  if (_hudCreditsVal) _hudCreditsVal.textContent = player.credits;
  if (_hudShopCredits) _hudShopCredits.textContent = `You have ${player.credits} credits`;
  // Update extended inventory visibility
  updateExtInvVisibility();
}

// Extended inventory visibility (hover or menu open)
let _extInvVisible = false;
let _extInvHovered = false;
function updateExtInvVisibility() {
  const anyMenuOpen = shopMenuOpen || craftingMenuOpen || refineryMenuOpen || shipyardMenuOpen;
  _extInvVisible = _extInvHovered || anyMenuOpen;
  if (_extInvEl) {
    const shouldShow = inventory.slots.length > 9 && _extInvVisible;
    _extInvEl.classList.toggle('visible', shouldShow);
  }
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
      inventory.add(it.item, qty);
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
  sfx.resumeIfNeeded();
  if (startScreenOpen || deathScreenOpen) return;
  if (e.code === 'Escape') {
    e.preventDefault();
    if (warpMenuOpen) { closeWarpMenu(); return; }
    if (shopMenuOpen) { closeShopMenu(); return; }
    if (craftingMenuOpen) { closeCraftingMenu(); return; }
    if (refineryMenuOpen) { closeRefineryMenu(); return; }
    if (shipyardMenuOpen) { closeShipyardMenu(); return; }
    if (pauseMenuOpen) { closePauseMenu(); return; }
    openPauseMenu();
    return;
  }
  if (pauseMenuOpen) return;
  if (warpMenuOpen) return;
  // Allow E to close any open menu
  if (shopMenuOpen) {
    if (e.code === 'KeyE') { e.preventDefault(); closeShopMenu(); }
    return;
  }
  if (craftingMenuOpen) {
    if (e.code === 'KeyE') { e.preventDefault(); closeCraftingMenu(); }
    return;
  }
  if (refineryMenuOpen) {
    if (e.code === 'KeyE') { e.preventDefault(); closeRefineryMenu(); }
    return;
  }
  if (shipyardMenuOpen) {
    if (e.code === 'KeyE') { e.preventDefault(); closeShipyardMenu(); }
    return;
  }
  // Hotbar slot selection (1-9)
  if (e.key >= '1' && e.key <= '9') {
    selectedSlot = parseInt(e.key) - 1;
    sfx.playHotbarSelect();
    markHUDDirty();
  }
  // Key in E position (KeyE): open warp gate/shop/crafting/refinery/shipyard menu when inside
  if (e.code === 'KeyE') {
    const warpSt = isShipInWarpGate();
    if (!gamePaused && warpSt) {
      e.preventDefault();
      openWarpMenuForStructure(warpSt);
    } else if (!gamePaused) {
      const shopSt = isShipInShop();
      if (shopSt) {
        e.preventDefault();
        input.leftMouseDown = false;
        input.rightMouseDown = false;
        input.ctrlBrake = false;
        openShopMenu(shopSt);
      } else {
        const craftSt = isShipInCrafting();
        if (craftSt) {
          e.preventDefault();
          input.leftMouseDown = false;
          input.rightMouseDown = false;
          input.ctrlBrake = false;
          openCraftingMenu(craftSt);
        } else {
          const refSt = isShipInRefinery();
          if (refSt) {
            e.preventDefault();
            input.leftMouseDown = false;
            input.rightMouseDown = false;
            input.ctrlBrake = false;
            openRefineryMenu(refSt);
          } else {
            const shipSt = isShipInShipyard();
            if (shipSt) {
              e.preventDefault();
              input.leftMouseDown = false;
              input.rightMouseDown = false;
              input.ctrlBrake = false;
              openShipyardMenu(shipSt);
            }
          }
        }
      }
    }
  }
});
window.addEventListener('keyup', (e) => {
  if (startScreenOpen || deathScreenOpen) return;
  if (warpMenuOpen || pauseMenuOpen) return;
  if (shopMenuOpen || craftingMenuOpen || refineryMenuOpen || shipyardMenuOpen) return;
});

// Default shop inventory generator
function generateDefaultShopInventory() {
  const inv = [];
  inv.push({ item: 'light blaster', heat: 0, overheated: false });
  inv.push({ item: 'medium mining laser', heat: 0, overheated: false });
  for (let i = 0; i < 6; i++) inv.push({ item: 'small energy cell', energy: 10, maxEnergy: 10 });
  inv.push({ item: 'medium energy cell', energy: 30, maxEnergy: 30 });
  inv.push({ item: 'medium energy cell', energy: 30, maxEnergy: 30 });
  for (let i = 0; i < 3; i++) inv.push({ item: 'fuel tank', fuel: 10, maxFuel: 10 });
  for (let i = 0; i < 2; i++) inv.push({ item: 'oxygen canister', oxygen: 10, maxOxygen: 10 });
  return inv;
}

let levelSpawnSettings = {
  initialDelay: 120,
  waveIntervalMin: 60,
  waveIntervalMax: 100,
  waveSizeMin: 2,
  waveSizeMax: 4
};

let currentLevelIdx = 0;

// Load level from JSON file
function loadLevel(levelData, levelIdx, options = {}) {
  const preservePlayerState = options.preservePlayerState === true;
  if (levelIdx !== undefined) currentLevelIdx = levelIdx;
  // Reset ship position and velocity
  ship.x = 0;
  ship.y = 0;
  ship.vx = 0;
  ship.vy = 0;
  shipSlowTimer = 0;
  setShipSlowVisual(false);
  
  levelWidth = levelData.width || 10000;
  levelHeight = levelData.height || 10000;
  
  levelSpawnSettings = ensureSpawnSettingsDefaults(levelData.spawnSettings || {
    initialDelay: 120,
    waveIntervalMin: 60,
    waveIntervalMax: 100,
    waveSizeMin: 2,
    waveSizeMax: 4,
    pirateTypePercentages: { ...DEFAULT_PIRATE_TYPE_PERCENTAGES },
    tiers: []
  });

  // Health multipliers by ore type
  const oreHealthMult = { cuprite: 1, hematite: 2.2, aurite: 3.7, diamite: 5.5, platinite: 8 };
  asteroids = (levelData.asteroids || []).map(ast => {
    const baseHealth = ast.radius;
    const mult = oreHealthMult[ast.oreType] || 1;
    return {
      ...ast,
      health: ast.health ?? (baseHealth * mult)
    };
  });
  structures = (levelData.structures || []).map(s => {
    // Preserve all properties from editor
    const st = { ...s };
    st.x = Number(s.x) || 0;
    st.y = Number(s.y) || 0;
    st.type = String(s.type || 'shop');

    if (st.type === 'shop') {
      if (!st.inventory) st.inventory = generateDefaultShopInventory();
      if (!st.prices) st.prices = {};
    }
    
    if (st.type === 'piratebase') {
      st.tier = normalizePirateBaseTier(st.tier);
      // Use config health or default 150
      const hp = st.health || 150;
      st.health = hp;
      st.maxHealth = hp;
      st.aggroed = false;
      st.spawnTimer = st.spawnRate || 30; // Wait full spawn time before first wave
      // Default defense count if not set
      if (st.defenseCount === undefined) st.defenseCount = 8;
      // Default spawn rate if not set
      if (st.spawnRate === undefined) st.spawnRate = 30;
      ensurePirateBaseSpawnDefaults(st);
      // Default drops if not set
      if (!st.drops) st.drops = []; // Will fallback to default in onPirateBaseDeath if empty? No, better to pre-fill or handle empty logic. 
      // Actually, existing logic hardcoded drops. If st.drops is empty, we might want to default it?
      // Editor saves empty array if nothing added. 
      // Let's populate default drops if it's missing entirely (undefined), but respect empty array if user cleared it.
      if (s.drops === undefined) {
        st.drops = [
          { item: 'scrap', quantity: 50 }, // Approximation of previous random logic, handled in death function
          { item: 'warp key', quantity: 1 }
        ];
      }
    }
    
    if (st.type === 'warpgate') {
        if (st.warpCost === undefined) st.warpCost = 3000;
        if (st.warpDestination === undefined) st.warpDestination = `level${Math.min(currentLevelIdx + 2, 4)}`; // Default to next level
    }

    if (st.type === 'shipyard') {
      if (st.maxDrones === undefined) st.maxDrones = 5;
      if (st.dronesSold === undefined) st.dronesSold = 0;
    }

    return st;
  });
  if (floatingOreContainer) while (floatingOreContainer.children.length) floatingOreContainer.remove(floatingOreContainer.children[0]);
  floatingItems.length = 0; // Clear floating items on level load
  pirates.length = 0; // Clear pirates on level load
  drones.length = 0; // Rebuild drones for the active ship
  for (const st of structures) {
    if (st.type === 'piratebase') spawnBaseDefensePirates(st);
  }
  levelElapsedTime = 0;
  levelIsDebug = levelData.debug === true;
  // Schedule first wave. (Non-debug uses spawnSettings.initialDelay.)
  pirateNextWaveTime = levelIsDebug ? 5 : (levelSpawnSettings.initialDelay || 0);
  
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
  
  // Tutorial text: only on Level 1 (currentLevelIdx === 0)
  if (currentLevelIdx === 0) {
    tutorialTextTimer = 11; // 10 seconds visible + 1 second fade
    tutorialTextTimerStarted = false;
    tutorialTextWorldX = ship.x;
    tutorialTextWorldY = ship.y - 80; // Above the ship
  } else {
    tutorialTextTimer = 0;
    tutorialTextTimerStarted = true;
  }
  shipStatusTransient.length = 0;
  shipStatusPersistent.text = '';
  shipStatusPersistent.color = '#fff';
  shipStatusPersistent.active = false;
  shipStatusPersistent.alpha = 0;

  if (!preservePlayerState) {
    // Level 3: start in transport ship
    if (currentLevelIdx === 2) {
      ownedShips.add('transport');
      currentShipType = 'transport';
    }
    // Level 4: start in frigate ship
    if (currentLevelIdx === 3) {
      ownedShips.add('frigate');
      currentShipType = 'frigate';
    }
  }

  // Ensure inventory matches current ship's slot count
  const shipStats = SHIP_STATS[currentShipType];
  if (shipStats) {
    inventory.resize(shipStats.slots);
    applyShipStats(currentShipType);
  }
  if (!preservePlayerState && (currentLevelIdx === 2 || currentLevelIdx === 3)) {
    player.health = player.maxHealth;
    player.fuel = player.maxFuel;
    player.oxygen = player.maxOxygen;
  }

  // Per-level starting inventory
  if (!preservePlayerState) {
    if (currentLevelIdx === 1) {
      // Level 2: give player upgraded loadout
      for (let i = 0; i < inventory.slots.length; i++) inventory.set(i, null);
      inventory.set(0, { item: 'medium mining laser', heat: 0, overheated: false });
      inventory.set(1, { item: 'light blaster', heat: 0, overheated: false });
      inventory.set(2, { item: 'small energy cell', energy: 10, maxEnergy: 10 });
      inventory.set(3, { item: 'medium energy cell', energy: 30, maxEnergy: 30 });
      selectedSlot = 0;
      hudDirty = true;
    } else if (currentLevelIdx === 2) {
      // Level 3: med laser, med blaster, 2 medium energy cells
      for (let i = 0; i < inventory.slots.length; i++) inventory.set(i, null);
      inventory.set(0, { item: 'medium mining laser', heat: 0, overheated: false });
      inventory.set(1, { item: 'medium blaster', heat: 0, overheated: false });
      inventory.set(2, { item: 'medium energy cell', energy: 30, maxEnergy: 30 });
      inventory.set(3, { item: 'medium energy cell', energy: 30, maxEnergy: 30 });
      selectedSlot = 0;
      hudDirty = true;
    } else if (currentLevelIdx === 3) {
      // Level 4: large laser, large blaster, large energy cell
      for (let i = 0; i < inventory.slots.length; i++) inventory.set(i, null);
      inventory.set(0, { item: 'large mining laser', heat: 0, overheated: false });
      inventory.set(1, { item: 'large blaster', heat: 0, overheated: false });
      inventory.set(2, { item: 'large energy cell', energy: 60, maxEnergy: 60 });
      selectedSlot = 0;
      hudDirty = true;
    } else {
      // Default loadout (Level 1 / Debug)
      for (let i = 0; i < inventory.slots.length; i++) inventory.set(i, null);
      inventory.set(0, { item: 'mining laser', heat: 0, overheated: false });
      inventory.set(1, { item: 'small energy cell', energy: 10, maxEnergy: 10 });
      inventory.set(2, { item: 'small energy cell', energy: 10, maxEnergy: 10 });
      selectedSlot = 0;
      hudDirty = true;
    }
  } else {
    if (selectedSlot >= inventory.slots.length) selectedSlot = 0;
    hudDirty = true;
  }
  syncLowResourceStateFromPlayer();
}

function getDefaultWarpDestinationIndex() {
  const maxMainLevelIdx = Math.min(KNOWN_LEVELS.length - 1, 3);
  return Math.max(0, Math.min(currentLevelIdx + 1, maxMainLevelIdx));
}

function getWarpCostFromStructure(st) {
  return Math.max(0, Math.round(Number(st?.warpCost) || 3000));
}

function resolveWarpDestinationIndex(warpDestination) {
  if (typeof warpDestination === 'number' && Number.isInteger(warpDestination) && KNOWN_LEVELS[warpDestination]) {
    return warpDestination;
  }
  const token = String(warpDestination || '').trim().toLowerCase();
  if (!token) return null;
  if (/^\d+$/.test(token)) {
    const numericIdx = Number(token);
    if (KNOWN_LEVELS[numericIdx]) return numericIdx;
  }
  const normalized = token.replace(/\\/g, '/').replace(/\.json$/, '');
  for (let idx = 0; idx < KNOWN_LEVELS.length; idx++) {
    const lev = KNOWN_LEVELS[idx];
    const pathNorm = lev.path.toLowerCase().replace(/\\/g, '/').replace(/\.json$/, '');
    const fileNorm = pathNorm.split('/').pop();
    const nameNorm = lev.name.toLowerCase().replace(/\s+/g, '');
    if (normalized === pathNorm || normalized === fileNorm || normalized === nameNorm) return idx;
  }
  return null;
}

function getWarpDestinationIndex(st) {
  const resolved = resolveWarpDestinationIndex(st?.warpDestination);
  return resolved != null ? resolved : getDefaultWarpDestinationIndex();
}

function updateWarpMenuContent(st) {
  const cost = getWarpCostFromStructure(st);
  const destinationIdx = getWarpDestinationIndex(st);
  const destination = KNOWN_LEVELS[destinationIdx];
  const destinationName = destination ? destination.name : 'Unknown';
  const destinationText = document.getElementById('warp-destination-text');
  const costText = document.getElementById('warp-cost-text');
  if (destinationText) destinationText.textContent = `Destination: ${destinationName}`;
  if (costText) costText.textContent = `Cost: ${cost} credits`;
  if (warpPayBtn) {
    warpPayBtn.textContent = `Warp (${cost})`;
    warpPayBtn.disabled = player.credits < cost || !destination;
  }
}

function openWarpMenuForStructure(st) {
  input.leftMouseDown = false;
  input.rightMouseDown = false;
  input.ctrlBrake = false;
  sfx.stopLaserLoop();
  sfx.stopDroneLaserLoop();
  laserWasFiring = false;
  droneLaserWasActive = false;
  gamePaused = true;
  warpMenuOpen = true;
  activeWarpStructure = st;
  sfx.playMenuOpen();
  const overlay = document.getElementById('warp-menu-overlay');
  if (overlay) overlay.style.display = 'flex';
  updateWarpMenuContent(st);
}

// Level select: scan known levels and populate dropdown
const KNOWN_LEVELS = [
  { name: 'Level 1', path: 'levels/level1.json' },
  { name: 'Level 2', path: 'levels/level2.json' },
  { name: 'Level 3', path: 'levels/level3.json' },
  { name: 'Level 4', path: 'levels/level4.json' },
  { name: 'Debug', path: 'levels/debug.json' }
];

const LEVEL_STORAGE_KEY = 'lastSelectedLevel';
const levelSelect = document.getElementById('level-select');
if (levelSelect) {
  KNOWN_LEVELS.forEach((lev, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = lev.name;
    levelSelect.appendChild(opt);
  });
  levelSelect.addEventListener('change', () => {
    const idx = levelSelect.value;
    const lev = KNOWN_LEVELS[idx];
    if (lev) {
      try { localStorage.setItem(LEVEL_STORAGE_KEY, idx); } catch (_) {}
      fetch(lev.path + '?t=' + Date.now())
        .then(res => res.json())
        .then(level => {
          sfx.playLevelChange();
          loadLevel(level, Number(idx));
        })
        .catch(err => console.error('Failed to load ' + lev.path, err));
    }
  });
}

// Restore last selected level from cache, falling back to 0
let initialLevelIdx = 0;
try {
  const saved = localStorage.getItem(LEVEL_STORAGE_KEY);
  if (saved !== null && KNOWN_LEVELS[Number(saved)]) initialLevelIdx = Number(saved);
} catch (_) {}
if (levelSelect) levelSelect.value = initialLevelIdx;

fetch(KNOWN_LEVELS[initialLevelIdx].path + '?t=' + Date.now())
  .then(res => res.json())
  .then(level => loadLevel(level, initialLevelIdx))
  .catch(() => {});

function closeWarpMenu() {
  sfx.playMenuClose();
  warpMenuOpen = false;
  activeWarpStructure = null;
  gamePaused = computeMenuPauseState();
  const overlay = document.getElementById('warp-menu-overlay');
  if (overlay) overlay.style.display = 'none';
}

function openShopMenu(shopStructure) {
  if (shopMenuOpen) return;
  sfx.playMenuOpen();
  
  activeShopStructure = shopStructure;
  
  // Populate buy slots from structure inventory - expand by quantity
  shopBuySlots.fill(null);
  if (shopStructure && shopStructure.inventory) {
    let slotIndex = 0;
    for (const invItem of shopStructure.inventory) {
      const qty = invItem.quantity || 1;
      for (let q = 0; q < qty && slotIndex < shopBuySlots.length; q++) {
        const item = { ...invItem };
        delete item.quantity; // Remove quantity from individual slot item
        // Ensure containers are at full capacity with correct values
        if (item.item === 'small energy cell') { item.energy = 10; item.maxEnergy = 10; }
        else if (item.item === 'medium energy cell') { item.energy = 30; item.maxEnergy = 30; }
        else if (item.item === 'large energy cell') { item.energy = 60; item.maxEnergy = 60; }
        else if (item.item === 'fuel tank') { item.fuel = 10; item.maxFuel = 10; }
        else if (item.item === 'medium fuel tank') { item.fuel = 30; item.maxFuel = 30; }
        else if (item.item === 'large fuel tank') { item.fuel = 60; item.maxFuel = 60; }
        else if (item.item === 'oxygen canister') { item.oxygen = 10; item.maxOxygen = 10; }
        else if (item.item === 'medium oxygen canister') { item.oxygen = 30; item.maxOxygen = 30; }
        else if (item.item === 'large oxygen canister') { item.oxygen = 60; item.maxOxygen = 60; }
        else if (item.item === 'health pack') { item.health = 10; }
        else if (item.item === 'medium health pack') { item.health = 30; }
        else if (item.item === 'large health pack') { item.health = 60; }
        else if (item.maxFuel !== undefined) item.fuel = item.maxFuel;
        else if (item.maxOxygen !== undefined) item.oxygen = item.maxOxygen;
        shopBuySlots[slotIndex++] = item;
      }
    }
  }

  gamePaused = true;
  sfx.stopLaserLoop();
  sfx.stopDroneLaserLoop();
  laserWasFiring = false;
  droneLaserWasActive = false;
  shopMenuOpen = true;
  updateExtInvVisibility();
  for (let i = 0; i < shopSellSlots.length; i++) shopSellSlots[i] = null;
  syncShopBuyArea();
  updateHUD();
  syncShopSellArea();
  const overlay = document.getElementById('shop-menu-overlay');
  if (overlay) overlay.style.display = 'flex';
  const ghost = document.getElementById('shop-drag-ghost');
  if (ghost) ghost.style.display = 'none';
  
  const creditsEl = document.getElementById('shop-credits-display');
  if (creditsEl) creditsEl.textContent = `You have ${player.credits} credits`;
}

function closeShopMenu() {
  sfx.playMenuClose();
  returnSellAreaToHotbar();
  shopMenuOpen = false;
  updateExtInvVisibility();
  gamePaused = computeMenuPauseState();
  inventoryDrag = null;
  activeShopStructure = null;
  const overlay = document.getElementById('shop-menu-overlay');
  if (overlay) overlay.style.display = 'none';
  const ghost = document.getElementById('shop-drag-ghost');
  if (ghost) ghost.style.display = 'none';
  hideShopTooltip();
}

const warpMenuOverlay = document.getElementById('warp-menu-overlay');
const warpPayBtn = document.getElementById('warp-pay-btn');
const warpCancelBtn = document.getElementById('warp-cancel-btn');
if (warpCancelBtn) {
  warpCancelBtn.addEventListener('click', () => {
    sfx.unlock();
    sfx.playCancel();
    closeWarpMenu();
  });
}
if (warpPayBtn) {
  warpPayBtn.addEventListener('click', () => {
    sfx.unlock();
    const warpSt = activeWarpStructure || isShipInWarpGate();
    const cost = getWarpCostFromStructure(warpSt);
    const destinationIdx = getWarpDestinationIndex(warpSt);
    const destination = KNOWN_LEVELS[destinationIdx];
    if (!destination || player.credits < cost) {
      sfx.playCancel();
      updateWarpMenuContent(warpSt);
      return;
    }
    player.credits -= cost;
    sfx.playWarp();
    sfx.playConfirm();
    closeWarpMenu();
    gamePaused = true; // Keep paused during warp transition

    // Pre-fetch the level data so it's ready when bloom peaks
    const levelDataPromise = fetch(destination.path + '?t=' + Date.now()).then(res => res.json());

    startWarpTransition(() => {
      // This fires at the peak of the bloom (screen fully white)
      levelDataPromise
        .then(level => {
          try { localStorage.setItem(LEVEL_STORAGE_KEY, String(destinationIdx)); } catch (_) {}
          if (levelSelect) levelSelect.value = String(destinationIdx);
          loadLevel(level, destinationIdx, { preservePlayerState: true });
        })
        .catch(err => {
          console.error('Failed to warp to ' + destination.path, err);
          warpTransition.active = false;
          warpTransition.phase = 'none';
          gamePaused = false;
        });
    });
  });
}

const shopCloseBtn = document.getElementById('shop-close-btn');
if (shopCloseBtn) {
  shopCloseBtn.addEventListener('click', () => {
    sfx.unlock();
    closeShopMenu();
  });
}

const shopSellBtn = document.getElementById('shop-sell-btn');
if (shopSellBtn) {
  shopSellBtn.addEventListener('click', () => {
    sfx.unlock();
    const total = getSellTotal();
    if (total <= 0) return;
    player.credits += total;
    sfx.playSell();
    for (let i = 0; i < shopSellSlots.length; i++) shopSellSlots[i] = null;
    syncShopSellArea();
    updateHUD();
  });
}

// Crafting Menu Logic
function openCraftingMenu(structure) {
  if (craftingMenuOpen) return;
  sfx.playMenuOpen();
  activeCraftingStructure = structure;
  craftingMenuOpen = true;
  updateExtInvVisibility();
  gamePaused = true;
  sfx.stopLaserLoop();
  sfx.stopDroneLaserLoop();
  laserWasFiring = false;
  droneLaserWasActive = false;
  
  // Clear slots
  for(let i=0; i<craftingInputSlots.length; i++) craftingInputSlots[i] = null;
  craftingOutputSlot = null;
  
  // Render recipes list
  const list = document.getElementById('crafting-recipes-list');
  if (list) {
    list.innerHTML = '';
    if (structure.recipes) {
      structure.recipes.forEach(r => {
        const div = document.createElement('div');
        div.className = 'recipe-item';
        const inputs = r.inputs.map(i => `${i.quantity}x ${i.item}`).join(', ');
        div.textContent = `${inputs} -> ${r.output.quantity}x ${r.output.item}`;
        list.appendChild(div);
      });
    }
  }
  
  const overlay = document.getElementById('crafting-menu-overlay');
  if (overlay) overlay.style.display = 'flex';
  syncCraftingUI();
}

function closeCraftingMenu() {
  sfx.playMenuClose();
  // Return items to inventory or drop them
  for(let i=0; i<craftingInputSlots.length; i++) {
    if (craftingInputSlots[i]) {
        if (!inventory.add(craftingInputSlots[i].item, craftingInputSlots[i].quantity)) {
             // Drop if full
             const it = craftingInputSlots[i];
             const angle = Math.random() * Math.PI * 2;
             floatingItems.push({
               x: ship.x + Math.cos(angle) * 40,
               y: ship.y + Math.sin(angle) * 40,
               vx: Math.cos(angle) * 20,
               vy: Math.sin(angle) * 20,
               item: it.item,
               quantity: it.quantity,
               energy: it.energy, maxEnergy: it.maxEnergy,
               fuel: it.fuel, maxFuel: it.maxFuel,
               oxygen: it.oxygen, maxOxygen: it.maxOxygen
             });
        }
        craftingInputSlots[i] = null;
    }
  }
  
  craftingMenuOpen = false;
  updateExtInvVisibility();
  gamePaused = computeMenuPauseState();
  activeCraftingStructure = null;
  const overlay = document.getElementById('crafting-menu-overlay');
  if (overlay) overlay.style.display = 'none';
  inventoryDrag = null;
}

function syncCraftingUI() {
    // Sync input slots
    for(let i=0; i<craftingInputSlots.length; i++) {
        const el = document.querySelector(`.crafting-slot[data-craft-input="${i}"]`);
        if (el) {
            el.innerHTML = getSlotHTML(craftingInputSlots[i]);
            el.classList.toggle('has-item', !!craftingInputSlots[i]);
        }
    }
    // Sync output slot
    const outEl = document.getElementById('crafting-output-slot');
    if (outEl) {
        outEl.innerHTML = getSlotHTML(craftingOutputSlot);
        outEl.classList.toggle('has-item', !!craftingOutputSlot && craftingOutputSlot.real);
        if (craftingOutputSlot && !craftingOutputSlot.real) outEl.style.opacity = '0.5';
        else outEl.style.opacity = '1';
    }
    
    // Check recipes
    checkCraftingRecipe();
}

function checkCraftingRecipe() {
    if (!activeCraftingStructure || !activeCraftingStructure.recipes) return;
    
    // If output is real (crafted but not taken), don't update preview
    if (craftingOutputSlot && craftingOutputSlot.real) {
        const btn = document.getElementById('craft-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Output Full';
        }
        return;
    }

    // Aggregate inputs
    const currentInputs = {};
    for(const slot of craftingInputSlots) {
        if (slot) {
            currentInputs[slot.item] = (currentInputs[slot.item] || 0) + slot.quantity;
        }
    }
    
    let match = null;
    for (const r of activeCraftingStructure.recipes) {
        let possible = true;
        for (const req of r.inputs) {
            if ((currentInputs[req.item] || 0) < req.quantity) {
                possible = false;
                break;
            }
        }
        if (possible) {
            match = r;
            break; 
        }
    }
    
    const btn = document.getElementById('craft-btn');
    if (match) {
        craftingOutputSlot = { item: match.output.item, quantity: match.output.quantity, real: false };
        const payload = getShopItemPayload(match.output.item);
        Object.assign(craftingOutputSlot, payload);
        
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Craft';
            btn.onclick = () => craftItem(match);
        }
    } else {
        craftingOutputSlot = null;
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Craft';
            btn.onclick = null;
        }
    }
    
    // Re-render output slot to show ghost
    const outEl = document.getElementById('crafting-output-slot');
    if (outEl) {
        outEl.innerHTML = getSlotHTML(craftingOutputSlot);
        if (craftingOutputSlot && !craftingOutputSlot.real) outEl.style.opacity = '0.5';
        else outEl.style.opacity = '1';
    }
}

function craftItem(recipe) {
    if (craftingOutputSlot && craftingOutputSlot.real) return;
  sfx.playCraft();

    // Consume inputs
    // Deep copy inputs to avoid modifying recipe definition
    const inputsNeeded = recipe.inputs.map(i => ({...i}));
    
    for (const req of inputsNeeded) {
        let needed = req.quantity;
        for (let i=0; i<craftingInputSlots.length; i++) {
            if (craftingInputSlots[i] && craftingInputSlots[i].item === req.item) {
                const take = Math.min(needed, craftingInputSlots[i].quantity);
                craftingInputSlots[i].quantity -= take;
                needed -= take;
                if (craftingInputSlots[i].quantity <= 0) craftingInputSlots[i] = null;
                if (needed <= 0) break;
            }
        }
    }
    
    // Set Output
    if (craftingOutputSlot) {
        craftingOutputSlot.real = true;
    }
    syncCraftingUI();
}

const craftingCloseBtn = document.getElementById('crafting-close-btn');
if (craftingCloseBtn) {
  craftingCloseBtn.addEventListener('click', () => {
    sfx.unlock();
    closeCraftingMenu();
  });
}

// ============ Refinery Menu Logic ============

function openRefineryMenu(structure) {
  if (refineryMenuOpen) return;
  sfx.playMenuOpen();
  activeRefineryStructure = structure;
  refineryMenuOpen = true;
  updateExtInvVisibility();
  gamePaused = true;
  sfx.stopLaserLoop();
  sfx.stopDroneLaserLoop();
  laserWasFiring = false;
  droneLaserWasActive = false;

  // Clear slots
  for (let i = 0; i < 4; i++) refineryInputSlots[i] = null;
  refineryOutputSlot = null;

  // Show accepted ores label
  const acceptedOres = structure.acceptedOres || [];
  const acceptedLabel = document.getElementById('refinery-accepted-label');
  if (acceptedLabel) {
    const names = acceptedOres.map(o => ITEM_DISPLAY_NAMES[o] || o);
    acceptedLabel.textContent = 'Accepts: ' + (names.length > 0 ? names.join(', ') : 'None');
  }

  const overlay = document.getElementById('refinery-menu-overlay');
  if (overlay) overlay.style.display = 'flex';
  syncRefineryUI();
}

function closeRefineryMenu() {
  sfx.playMenuClose();
  // Return unprocessed items to inventory or drop them
  for (let i = 0; i < 4; i++) {
    if (refineryInputSlots[i]) {
      if (!inventory.add(refineryInputSlots[i].item, refineryInputSlots[i].quantity)) {
        // Drop if full
        const it = refineryInputSlots[i];
        const angle = Math.random() * Math.PI * 2;
        floatingItems.push({
          x: ship.x + Math.cos(angle) * 30,
          y: ship.y + Math.sin(angle) * 30,
          vx: Math.cos(angle) * 40,
          vy: Math.sin(angle) * 40,
          item: it.item,
          quantity: it.quantity
        });
      }
      refineryInputSlots[i] = null;
    }
  }
  // Return output
  if (refineryOutputSlot && refineryOutputSlot.real) {
    if (!inventory.add(refineryOutputSlot.item, refineryOutputSlot.quantity)) {
      const angle = Math.random() * Math.PI * 2;
      floatingItems.push({
        x: ship.x + Math.cos(angle) * 30,
        y: ship.y + Math.sin(angle) * 30,
        vx: Math.cos(angle) * 40,
        vy: Math.sin(angle) * 40,
        item: refineryOutputSlot.item,
        quantity: refineryOutputSlot.quantity
      });
    }
    refineryOutputSlot = null;
  }

  refineryMenuOpen = false;
  updateExtInvVisibility();
  gamePaused = computeMenuPauseState();
  activeRefineryStructure = null;
  const overlay = document.getElementById('refinery-menu-overlay');
  if (overlay) overlay.style.display = 'none';
  inventoryDrag = null;
  hudDirty = true;
}

function syncRefineryUI() {
  // Sync input slots
  for (let i = 0; i < 4; i++) {
    const el = document.querySelector(`.refinery-input-slot[data-refinery-input="${i}"]`);
    if (el) {
      el.innerHTML = getSlotHTML(refineryInputSlots[i]);
      el.classList.toggle('has-item', !!refineryInputSlots[i]);
    }
  }
  // Sync output slot
  const outEl = document.getElementById('refinery-output-slot');
  if (outEl) {
    outEl.innerHTML = getSlotHTML(refineryOutputSlot);
    outEl.classList.toggle('has-item', !!refineryOutputSlot && refineryOutputSlot.real);
    if (refineryOutputSlot && !refineryOutputSlot.real) outEl.style.opacity = '0.5';
    else outEl.style.opacity = '1';
  }

  checkRefineryRecipe();
}

function checkRefineryRecipe() {
  if (!activeRefineryStructure) return;
  const acceptedOres = activeRefineryStructure.acceptedOres || [];

  // If output is real (already refined but not taken), disable button
  if (refineryOutputSlot && refineryOutputSlot.real) {
    const btn = document.getElementById('refine-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Output Full'; }
    return;
  }

  // Aggregate input ores, only counting accepted ores
  let totalOre = 0;
  let oreType = null;
  let mixedTypes = false;
  for (const slot of refineryInputSlots) {
    if (!slot) continue;
    if (!acceptedOres.includes(slot.item)) {
      // Non-accepted ore - can't refine
      mixedTypes = true;
      break;
    }
    if (oreType === null) oreType = slot.item;
    else if (slot.item !== oreType) { mixedTypes = true; break; }
    totalOre += slot.quantity;
  }

  const btn = document.getElementById('refine-btn');
  if (!mixedTypes && oreType && totalOre >= 2 && RAW_TO_REFINED[oreType]) {
    const refinedName = RAW_TO_REFINED[oreType];
    const outputQty = Math.floor(totalOre / 2);
    refineryOutputSlot = { item: refinedName, quantity: outputQty, real: false };
    const payload = getItemPayload(refinedName);
    Object.assign(refineryOutputSlot, payload);

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Refine';
      btn.onclick = () => refineOre(oreType, totalOre, refinedName, outputQty);
    }
  } else {
    refineryOutputSlot = null;
    if (btn) {
      btn.disabled = true;
      btn.textContent = totalOre > 0 && mixedTypes ? 'Single ore type only' : totalOre === 1 ? 'Need 2+ ore' : 'Refine';
      btn.onclick = null;
    }
  }

  // Update output preview
  const outEl = document.getElementById('refinery-output-slot');
  if (outEl) {
    outEl.innerHTML = getSlotHTML(refineryOutputSlot);
    if (refineryOutputSlot && !refineryOutputSlot.real) outEl.style.opacity = '0.5';
    else outEl.style.opacity = '1';
  }
}

function refineOre(oreType, totalOre, refinedName, outputQty) {
  if (refineryOutputSlot && refineryOutputSlot.real) return;
  sfx.playRefine();

  // Consume input ores: consume outputQty * 2 ores
  let toConsume = outputQty * 2;
  for (let i = 0; i < 4; i++) {
    if (!refineryInputSlots[i] || refineryInputSlots[i].item !== oreType) continue;
    const take = Math.min(toConsume, refineryInputSlots[i].quantity);
    refineryInputSlots[i].quantity -= take;
    toConsume -= take;
    if (refineryInputSlots[i].quantity <= 0) refineryInputSlots[i] = null;
    if (toConsume <= 0) break;
  }

  // Mark output as real
  if (refineryOutputSlot) {
    refineryOutputSlot.real = true;
  }
  syncRefineryUI();
}

const refineryCloseBtn = document.getElementById('refinery-close-btn');
if (refineryCloseBtn) {
  refineryCloseBtn.addEventListener('click', () => {
    sfx.unlock();
    closeRefineryMenu();
  });
}

// ============ End Refinery Menu Logic ============

let currentShipType = 'scout';
const ownedShips = new Set(['scout']); // Scout is owned by default
const shipSavedStats = {}; // { shipType: { health, fuel, oxygen } }
let activeShipyardStructure = null;

/** Apply ship stats to player and dynamic variables */
function applyShipStats(type) {
  const stats = SHIP_STATS[type];
  if (!stats) return;
  currentShipType = type;
  player.maxHealth = stats.health;
  player.maxFuel = stats.fuel;
  player.maxOxygen = stats.oxygen;
  MAX_SPEED = stats.speed;
  shipCollisionRadius = getShipCollisionRadiusByScale(stats);
  shipScale = stats.shipScale;
  shipDamageMult = stats.damageMult;
  shipDamageReduction = Math.max(0, Math.min(0.95, Number(stats.damageReduction) || 0));
  attachShipModelForType(type);
  // Resize inventory
  const excess = inventory.resize(stats.slots);
  // Drop excess items as floating items
  for (const it of excess) {
    if (!it) continue;
    const angle = Math.random() * Math.PI * 2;
    floatingItems.push({
      x: ship.x + Math.cos(angle) * 30,
      y: ship.y + Math.sin(angle) * 30,
      vx: Math.cos(angle) * 40,
      vy: Math.sin(angle) * 40,
      item: it.item,
      quantity: it.quantity || 1
    });
  }
  if (selectedSlot >= stats.slots) selectedSlot = 0;
  setPurchasedDroneCount(currentShipType, getPurchasedDroneCount(currentShipType));
  syncActiveDronesForCurrentShip();
}

function switchShip(type) {
  if (type === currentShipType) return;
  const stats = SHIP_STATS[type];
  if (!stats) return;
  let isNewlyBought = false;

  // Buy if not owned
  if (!ownedShips.has(type)) {
    if (player.credits < stats.price) return;
    player.credits -= stats.price;
    ownedShips.add(type);
    isNewlyBought = true;
    sfx.playBuy();
  } else {
    sfx.playConfirm();
  }

  // Save current ship's resource state
  shipSavedStats[currentShipType] = {
    health: player.health,
    fuel: player.fuel,
    oxygen: player.oxygen
  };

  // Apply new ship stats
  applyShipStats(type);

  // Newly bought ships always start full. Otherwise restore saved stats if present.
  if (isNewlyBought) {
    player.health = player.maxHealth;
    player.fuel = player.maxFuel;
    player.oxygen = player.maxOxygen;
  } else if (shipSavedStats[type]) {
    player.health = Math.min(shipSavedStats[type].health, player.maxHealth);
    player.fuel = Math.min(shipSavedStats[type].fuel, player.maxFuel);
    player.oxygen = Math.min(shipSavedStats[type].oxygen, player.maxOxygen);
  } else {
    // New ship starts at full
    player.health = player.maxHealth;
    player.fuel = player.maxFuel;
    player.oxygen = player.maxOxygen;
  }

  updateHUD();
}

// Shipyard Menu Logic — Card-based UI with 3D ship previews
let shipyardPreviews = []; // Array of { renderer, scene, camera, model, canvas, animId }

function cleanupShipyardPreviews() {
  for (const p of shipyardPreviews) {
    if (p.animId) cancelAnimationFrame(p.animId);
    if (p.renderer) p.renderer.dispose();
  }
  shipyardPreviews = [];
}

function createShipPreview(container, shipType) {
  const PREVIEW_W = 96;
  const PREVIEW_H = 64;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  const cvs = document.createElement('canvas');
  cvs.width = PREVIEW_W * DPR;
  cvs.height = PREVIEW_H * DPR;
  container.appendChild(cvs);

  const renderer = new THREE.WebGLRenderer({ canvas: cvs, antialias: true, alpha: true });
  renderer.setPixelRatio(DPR);
  renderer.setSize(PREVIEW_W, PREVIEW_H);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  // Top-down orthographic camera matching the in-game perspective
  const aspect = PREVIEW_W / PREVIEW_H;
  const viewSize = 3.0;
  const camera = new THREE.OrthographicCamera(
    -viewSize * aspect / 2, viewSize * aspect / 2,
    viewSize / 2, -viewSize / 2,
    0.1, 100
  );
  // Camera looks straight down the Z axis (same as in-game)
  camera.position.set(0, 0, 20);
  camera.lookAt(0, 0, 0);

  // Lighting — strong top light + ambient to match game appearance
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const topLight = new THREE.DirectionalLight(0xffffff, 2.0);
  topLight.position.set(0, 0, 50);
  scene.add(topLight);
  const sideLight = new THREE.DirectionalLight(0xffffff, 0.6);
  sideLight.position.set(20, 20, 30);
  scene.add(sideLight);

  // Wrapper group: we rotate this group around Z to spin the ship in the top-down plane
  const spinGroup = new THREE.Group();
  scene.add(spinGroup);

  const previewObj = { renderer, scene, camera, model: null, spinGroup, canvas: cvs, animId: null };

  // Load ship model
  const LoaderClass = (window.GLTFLoader || (THREE && THREE.GLTFLoader));
  if (LoaderClass) {
    const loader = new LoaderClass();
    const modelFile = SHIP_MODEL_FILES[shipType] || SHIP_MODEL_FILES.scout;
    const glbUrl = new URL('assets/' + modelFile, window.location.href).toString();
    loader.load(glbUrl, (gltf) => {
      const model = gltf.scene.clone(true);
      const stats = SHIP_STATS[shipType];
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      // Scale to fit the preview, adjusted by ship type scale (20% smaller)
      const fitScale = 1.76 / (maxDim > 0 ? maxDim : 1);
      const displayScale = fitScale * (stats ? stats.shipScale : 1.0);
      model.scale.setScalar(displayScale);
      model.position.sub(center.multiplyScalar(displayScale));
      // Same orientation as in-game: glTF Y-up → top-down XY view (top hull visible)
      model.rotation.x = Math.PI / 2;
      // Match per-ship world offset (3 for scout, 5 for cutter/transport) in preview space.
      const scoutScale = fitScale * (SHIP_STATS.scout?.shipScale ?? 1.0);
      const scoutPreviewOffset = scoutScale * SHIP_PREVIEW_Y_OFFSET_FACTOR;
      const worldYOffset = PLAYER_SHIP_Y_OFFSET_BY_TYPE[shipType] ?? PLAYER_SHIP_Y_OFFSET_BY_TYPE.scout;
      model.position.y += scoutPreviewOffset * (worldYOffset / PLAYER_SHIP_Y_OFFSET_BY_TYPE.scout);

      model.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material = child.material.clone();
        }
      });

      spinGroup.add(model);
      previewObj.model = model;
    });
  }

  // Animate: rotate the wrapper group around Z (yaw in top-down view, like turning in game)
  // Frame-rate independent at ~0.5 rad/s
  const SHIPYARD_SPIN_SPEED = 0.24; // radians per second (half of previous ~0.48)
  let lastTime = performance.now();
  function animate() {
    previewObj.animId = requestAnimationFrame(animate);
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    previewObj.spinGroup.rotation.z -= SHIPYARD_SPIN_SPEED * dt;
    renderer.render(scene, camera);
  }
  animate();

  shipyardPreviews.push(previewObj);
  return previewObj;
}

function openShipyardMenu(structure) {
  if (shipyardMenuOpen) return;
  sfx.playMenuOpen();
  shipyardMenuOpen = true;
  updateExtInvVisibility();
  activeShipyardStructure = structure;
  gamePaused = true;
  sfx.stopLaserLoop();
  sfx.stopDroneLaserLoop();
  laserWasFiring = false;
  droneLaserWasActive = false;

  renderShipyardCards(structure);

  const creditsEl = document.getElementById('shipyard-credits');
  if (creditsEl) creditsEl.textContent = `${player.credits} credits`;

  const overlay = document.getElementById('shipyard-menu-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function renderShipyardDroneControls(structure) {
  const menu = document.getElementById('shipyard-menu');
  const anchor = document.getElementById('shipyard-for-sale-section');
  if (!menu || !anchor) return;

  const anyOwnedShipHasDroneBay = [...ownedShips].some(t => getShipDroneCapacity(t) > 0);
  if (!anyOwnedShipHasDroneBay) {
    let controls = document.getElementById('shipyard-drone-controls');
    if (controls) controls.style.display = 'none';
    return;
  }

  let controls = document.getElementById('shipyard-drone-controls');
  if (!controls) {
    controls = document.createElement('div');
    controls.id = 'shipyard-drone-controls';
    controls.className = 'shipyard-drone-controls';
    menu.insertBefore(controls, anchor);
  }
  controls.style.display = '';

  const cap = getShipDroneCapacity(currentShipType);
  const owned = getPurchasedDroneCount(currentShipType);
  controls.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'shipyard-drone-title';
  title.textContent = 'Drone Bay';
  controls.appendChild(title);

  const status = document.createElement('div');
  status.className = 'shipyard-drone-status';
  if (cap <= 0) {
    status.textContent = 'Current ship has no drone bays.';
    controls.appendChild(status);
    return;
  }
  const maxDrones = Number(structure?.maxDrones) || 5;
  const dronesRemaining = Math.max(0, maxDrones - (Number(structure?.dronesSold) || 0));
  status.textContent = `Active drones: ${owned}/${cap} • Stock: ${dronesRemaining}/${maxDrones}`;
  controls.appendChild(status);

  const buyBtn = document.createElement('button');
  buyBtn.className = 'shipyard-drone-buy-btn';
  buyBtn.type = 'button';
  buyBtn.textContent = `Buy Drone - ${DRONE_PURCHASE_PRICE} cr`;
  const atCap = owned >= cap;
  const outOfStock = dronesRemaining <= 0;
  buyBtn.disabled = atCap || outOfStock || player.credits < DRONE_PURCHASE_PRICE;
  buyBtn.onclick = () => {
    const bought = addDroneToCurrentShip(structure);
    if (!bought) return;
    const creditsEl = document.getElementById('shipyard-credits');
    if (creditsEl) creditsEl.textContent = `${player.credits} credits`;
    renderShipyardCards(structure);
  };
  controls.appendChild(buyBtn);
}

function renderShipyardCards(structure) {
  cleanupShipyardPreviews();
  renderShipyardDroneControls(structure);

  const forSaleContainer = document.getElementById('shipyard-for-sale');
  const ownedContainer = document.getElementById('shipyard-owned');
  const forSaleSection = document.getElementById('shipyard-for-sale-section');
  const ownedSection = document.getElementById('shipyard-owned-section');
  if (!forSaleContainer || !ownedContainer) return;
  forSaleContainer.innerHTML = '';
  ownedContainer.innerHTML = '';

  const available = structure.availableShips || ['scout'];
  const shipyardOrder = ['scout', 'cutter', 'transport', 'frigate', 'carrier'];
  const shipOrderRank = new Map(shipyardOrder.map((type, index) => [type, index]));
  const compareShipOrder = (a, b) => {
    const rankA = shipOrderRank.has(a) ? shipOrderRank.get(a) : Number.MAX_SAFE_INTEGER;
    const rankB = shipOrderRank.has(b) ? shipOrderRank.get(b) : Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
    return String(a).localeCompare(String(b));
  };

  function makeCard(type, mode) {
    const stats = SHIP_STATS[type];
    if (!stats) return null;

    const card = document.createElement('div');
    card.className = 'shipyard-card' + (mode === 'current' ? ' current' : '');

    // Title row (name + desc) - full width across top including ship demo area
    const titleRow = document.createElement('div');
    titleRow.className = 'shipyard-card-title-row';

    const nameEl = document.createElement('div');
    nameEl.className = 'shipyard-card-name';
    nameEl.textContent = stats.name;
    titleRow.appendChild(nameEl);

    const descEl = document.createElement('div');
    descEl.className = 'shipyard-card-desc';
    descEl.textContent = stats.desc;
    titleRow.appendChild(descEl);

    card.appendChild(titleRow);

    // Content row: body (stats, button) | preview
    const contentRow = document.createElement('div');
    contentRow.className = 'shipyard-card-content-row';

    const body = document.createElement('div');
    body.className = 'shipyard-card-body';

    const previewDiv = document.createElement('div');
    previewDiv.className = 'shipyard-card-preview';
    createShipPreview(previewDiv, type);

    // Stats grid
    const statsGrid = document.createElement('div');
    statsGrid.className = 'shipyard-card-stats';
    const statEntries = [
      ['HP', stats.health],
      ['Fuel', stats.fuel],
      ['O2', stats.oxygen],
      ['Inv Slots', stats.slots],
    ];
    if ((stats.droneSlots ?? 0) > 0) {
      statEntries.push(['Drone bay', stats.droneSlots]);
    }
    if ((stats.damageReduction ?? 0) > 0) {
      statEntries.push(['Dmg Resist', `${Math.round((stats.damageReduction || 0) * 100)}%`]);
    }
    if (stats.damageMult > 1) {
      statEntries.push(['Wpn Dmg', `+${Math.round((stats.damageMult - 1) * 100)}%`]);
    }
    for (const [label, value] of statEntries) {
      const lbl = document.createElement('span');
      lbl.className = 'shipyard-stat-label';
      lbl.textContent = label;
      const val = document.createElement('span');
      val.className = 'shipyard-stat-value';
      val.textContent = value;
      statsGrid.appendChild(lbl);
      statsGrid.appendChild(val);
    }
    body.appendChild(statsGrid);

    // Action button
    const actionDiv = document.createElement('div');
    actionDiv.className = 'shipyard-card-action';
    const btn = document.createElement('button');
    btn.className = 'shipyard-card-btn';

    if (mode === 'current') {
      btn.classList.add('current-ship');
      btn.textContent = 'Current Ship';
      btn.disabled = true;
    } else if (mode === 'swap') {
      btn.classList.add('swap');
      btn.textContent = 'Swap (Free)';
      btn.onclick = () => {
        switchShip(type);
        renderShipyardCards(structure);
        const creditsEl = document.getElementById('shipyard-credits');
        if (creditsEl) creditsEl.textContent = `${player.credits} credits`;
      };
    } else {
      btn.classList.add('buy');
      btn.textContent = `Buy — ${stats.price} cr`;
      if (player.credits < stats.price) btn.disabled = true;
      btn.onclick = () => {
        switchShip(type);
        renderShipyardCards(structure);
        const creditsEl = document.getElementById('shipyard-credits');
        if (creditsEl) creditsEl.textContent = `${player.credits} credits`;
      };
    }
    actionDiv.appendChild(btn);
    body.appendChild(actionDiv);

    contentRow.appendChild(body);
    contentRow.appendChild(previewDiv);
    card.appendChild(contentRow);
    return card;
  }

  // For-sale section (unowned ships available here)
  const forSale = available.filter(t => !ownedShips.has(t)).sort(compareShipOrder);
  if (forSale.length > 0) {
    forSaleSection.style.display = '';
    forSale.forEach(type => {
      const card = makeCard(type, 'buy');
      if (card) forSaleContainer.appendChild(card);
    });
  } else {
    forSaleSection.style.display = 'none';
  }

  // Owned ships section
  const ownedArr = [...ownedShips].sort(compareShipOrder);
  if (ownedArr.length > 0) {
    ownedSection.style.display = '';
    ownedArr.forEach(type => {
      const mode = type === currentShipType ? 'current' : 'swap';
      const card = makeCard(type, mode);
      if (card) ownedContainer.appendChild(card);
    });
  } else {
    ownedSection.style.display = 'none';
  }
}

function closeShipyardMenu() {
  sfx.playMenuClose();
  cleanupShipyardPreviews();
  shipyardMenuOpen = false;
  updateExtInvVisibility();
  activeShipyardStructure = null;
  gamePaused = computeMenuPauseState();
  const overlay = document.getElementById('shipyard-menu-overlay');
  if (overlay) overlay.style.display = 'none';
}

const shipyardCloseBtn = document.getElementById('shipyard-close-btn');
if (shipyardCloseBtn) {
  shipyardCloseBtn.addEventListener('click', () => {
    sfx.unlock();
    closeShipyardMenu();
  });
}

// Extended inventory hover listeners
const hudOverlayEl = document.getElementById('hud-overlay');
if (hudOverlayEl) {
  hudOverlayEl.addEventListener('mouseenter', () => { _extInvHovered = true; updateExtInvVisibility(); });
  hudOverlayEl.addEventListener('mouseleave', () => { _extInvHovered = false; updateExtInvVisibility(); });
}

function showShopTooltip(itemKey, price, isBuy, slotEl) {
  const tooltip = document.getElementById('shop-item-tooltip');
  if (!tooltip || !itemKey) return;
  const name = ITEM_DISPLAY_NAMES[itemKey] || itemKey;
  const usage = ITEM_USAGE[itemKey] || '';
  const priceText = isBuy ? `Buy: ${price} cr` : `Sell: ${price} cr`;
  tooltip.innerHTML = `<div class="tooltip-name">${name}</div><div class="tooltip-price">${priceText}</div><div class="tooltip-usage">${usage}</div>`;
  tooltip.style.display = 'block';
  // Position above the slot
  const rect = slotEl.getBoundingClientRect();
  const overlay = document.getElementById('shop-menu-overlay');
  const overlayRect = overlay ? overlay.getBoundingClientRect() : { left: 0, top: 0 };
  const left = rect.left - overlayRect.left + rect.width / 2 - 110;
  const top = rect.top - overlayRect.top - tooltip.offsetHeight - 8;
  tooltip.style.left = Math.max(10, left) + 'px';
  tooltip.style.top = Math.max(10, top) + 'px';
}

function hideShopTooltip() {
  const tooltip = document.getElementById('shop-item-tooltip');
  if (tooltip) tooltip.style.display = 'none';
}

// Add hover listeners for shop slots
document.querySelectorAll('.shop-buy-slot').forEach(el => {
  el.addEventListener('mouseenter', () => {
    const idx = parseInt(el.dataset.buySlot, 10);
    const it = shopBuySlots[idx];
    if (it) {
      const price = getItemBuyPrice(it.item);
      showShopTooltip(it.item, price, true, el);
    }
  });
  el.addEventListener('mouseleave', hideShopTooltip);
});

document.querySelectorAll('.shop-sell-slot').forEach(el => {
  el.addEventListener('mouseenter', () => {
    const idx = parseInt(el.dataset.sellSlot, 10);
    const it = shopSellSlots[idx];
    if (it) {
      const price = getItemSellPrice(it);
      showShopTooltip(it.item, price, false, el);
    }
  });
  el.addEventListener('mouseleave', hideShopTooltip);
});

function showHotbarTooltip(it, slotEl) {
  const tooltip = document.getElementById('hotbar-item-tooltip');
  if (!tooltip || !it || !it.item) return;
  const name = ITEM_DISPLAY_NAMES[it.item] || it.item;
  const usage = ITEM_USAGE[it.item] || '';
  const sellPrice = getItemSellPrice(it);
  const priceHtml = sellPrice > 0 ? `<div class="tooltip-price">Sell: ${sellPrice} cr</div>` : '';
  tooltip.innerHTML = `<div class="tooltip-name">${name}</div>${priceHtml}<div class="tooltip-usage">${usage}</div>`;
  tooltip.style.display = 'block';
  const rect = slotEl.getBoundingClientRect();
  const overlay = document.getElementById('hud-overlay');
  const overlayRect = overlay ? overlay.getBoundingClientRect() : { left: 0, top: 0, width: 360 };
  const tooltipW = 220;
  const left = rect.left - overlayRect.left + rect.width / 2 - tooltipW / 2;
  const top = rect.top - overlayRect.top - tooltip.offsetHeight - 8;
  tooltip.style.left = Math.max(8, Math.min(left, (overlayRect.width || 360) - tooltipW - 8)) + 'px';
  tooltip.style.top = top + 'px';
}

function hideHotbarTooltip() {
  const tooltip = document.getElementById('hotbar-item-tooltip');
  if (tooltip) tooltip.style.display = 'none';
}

document.querySelectorAll('#hotbar .slot, #extended-inventory .slot').forEach(el => {
  el.addEventListener('mouseenter', () => {
    const slotIndex = parseInt(el.dataset.slot, 10);
    const it = hotbar[slotIndex];
    if (it) showHotbarTooltip(it, el);
  });
  el.addEventListener('mouseleave', hideHotbarTooltip);
});

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
  hideShopTooltip();
  inventoryDrag = { kind: 'hotbar', fromSlot: slotIndex };
  const qty = it.quantity != null ? String(it.quantity) : (it.energy != null ? String(Math.round(it.energy)) : (it.fuel != null ? String(Math.round(it.fuel)) : (it.oxygen != null ? String(Math.round(it.oxygen)) : (it.heat != null ? String(Math.round(it.heat * 100)) : ''))));
  setDragGhostContent(it, getItemLabel(it), qty);
  setDragGhostPos(clientX, clientY);
  setDragGhostVisible(true);
}

function beginDragFromBuy(buyIndex, clientX, clientY) {
  const it = shopBuySlots[buyIndex];
  if (!it) return;
  hideShopTooltip();
  const price = getItemBuyPrice(it.item);
  inventoryDrag = { kind: 'buy', fromBuySlot: buyIndex, price };
  const qty = it.quantity != null ? String(it.quantity) : (it.energy != null ? String(Math.round(it.energy)) : (it.fuel != null ? String(Math.round(it.fuel)) : (it.oxygen != null ? String(Math.round(it.oxygen)) : (it.heat != null ? String(Math.round(it.heat * 100)) : ''))));
  setDragGhostContent(it, getItemLabel(it), qty);
  setDragGhostPos(clientX, clientY);
  setDragGhostVisible(true);
}

function beginDragFromSell(sellIndex, clientX, clientY) {
  const it = shopSellSlots[sellIndex];
  if (!it) return;
  hideShopTooltip();
  inventoryDrag = { kind: 'sell', fromSellSlot: sellIndex };
  const qty = it.quantity != null ? String(it.quantity) : (it.energy != null ? String(Math.round(it.energy)) : (it.fuel != null ? String(Math.round(it.fuel)) : (it.oxygen != null ? String(Math.round(it.oxygen)) : (it.heat != null ? String(Math.round(it.heat * 100)) : ''))));
  setDragGhostContent(it, getItemLabel(it), qty);
  setDragGhostPos(clientX, clientY);
  setDragGhostVisible(true);
}

function clearResourceBarHighlights() {
  const fuelBarEl = document.getElementById('fuel-bar-drop-zone');
  if (fuelBarEl) fuelBarEl.classList.remove('highlight');
  const oxygenBarEl = document.getElementById('oxygen-bar-drop-zone');
  if (oxygenBarEl) oxygenBarEl.classList.remove('highlight');
  const healthBarEl = document.getElementById('health-bar-drop-zone');
  if (healthBarEl) healthBarEl.classList.remove('highlight');
}

function resolveDropTarget(clientX, clientY) {
  const under = document.elementFromPoint(clientX, clientY);
  const targetSlotEl = under
    ? (under.closest('.slot') ||
      under.closest('.shop-buy-slot') ||
      under.closest('.shop-sell-slot') ||
      under.closest('.crafting-slot') ||
      under.closest('.refinery-input-slot'))
    : null;
  return {
    targetSlotEl,
    isOverFuelBar: !!(under && under.closest('#fuel-bar-drop-zone')),
    isOverO2Bar: !!(under && under.closest('#oxygen-bar-drop-zone')),
    isOverHealthBar: !!(under && under.closest('#health-bar-drop-zone'))
  };
}

function tryHandleResourceBarDrop(drag, dropTarget) {
  const barChecks = [
    { isOver: dropTarget.isOverO2Bar, barType: 'oxygen' },
    { isOver: dropTarget.isOverFuelBar, barType: 'fuel' },
    { isOver: dropTarget.isOverHealthBar, barType: 'health' }
  ];

  for (const { isOver, barType } of barChecks) {
    if (!isOver) continue;
    const cfg = RESOURCE_BAR_CONFIG[barType];

    if (drag.kind === 'hotbar') {
      const it = hotbar[drag.fromSlot];
      if (it && cfg.items.includes(it.item)) {
        const addAmount = it[cfg.prop] !== undefined ? it[cfg.prop] : 10;
        player[cfg.playerProp] = Math.min(player[cfg.maxProp], player[cfg.playerProp] + addAmount);
        hotbar[drag.fromSlot] = null;
        sfx.playUseResource(barType);
        updateHUD();
        return true;
      }
    }

    if (drag.kind === 'buy') {
      const it = shopBuySlots[drag.fromBuySlot];
      if (it && cfg.items.includes(it.item)) {
        const price = drag.price;
        if (player.credits >= price) {
          player.credits -= price;
          const addAmount = it[cfg.prop] !== undefined ? it[cfg.prop] : 10;
          player[cfg.playerProp] = Math.min(player[cfg.maxProp], player[cfg.playerProp] + addAmount);
          sfx.playBuy();
          sfx.playUseResource(barType);
          removeFromShopInventory(it.item);
          shopBuySlots[drag.fromBuySlot] = null;
          syncShopBuyArea();
          updateHUD();
          const creditsEl = document.getElementById('shop-credits-display');
          if (creditsEl) creditsEl.textContent = `You have ${player.credits} credits`;
        }
        return true;
      }
    }
  }

  return false;
}

function tryHandleJettisonDrop(drag, targetSlotEl) {
  if (targetSlotEl || shopMenuOpen || craftingMenuOpen || shipyardMenuOpen || refineryMenuOpen || drag.kind !== 'hotbar') {
    return false;
  }

  const from = drag.fromSlot;
  const it = hotbar[from];
  if (it) {
    const dx = input.mouseX - WIDTH / 2;
    const dy = input.mouseY - HEIGHT / 2;
    const dir = normalize(dx, dy);
    if (dir.x !== 0 || dir.y !== 0) {
      const jettSpeed = 340;
      const totalQty = it.quantity || 1;
      const baseAngle = Math.atan2(dir.y, dir.x);

      for (let i = 0; i < totalQty; i++) {
        const spread = (Math.random() - 0.5) * 0.5;
        const angle = baseAngle + spread;
        const speedVar = 0.8 + Math.random() * 0.4;
        const jVx = Math.cos(angle) * jettSpeed * speedVar;
        const jVy = Math.sin(angle) * jettSpeed * speedVar;

        const floatItem = {
          x: ship.x + Math.cos(angle) * 20,
          y: ship.y + Math.sin(angle) * 20,
          vx: jVx + ship.vx * 0.3,
          vy: jVy + ship.vy * 0.3,
          item: it.item,
          quantity: 1
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
        if (it.health != null) {
          floatItem.health = it.health;
          floatItem.maxHealth = it.maxHealth ?? it.health;
        }
        if (it.heat != null) {
          floatItem.heat = it.heat;
          floatItem.overheated = !!it.overheated;
        }
        floatingItems.push(floatItem);
      }
      hotbar[from] = null;
      sfx.playJettison();
      updateHUD();
    }
  }

  return true;
}

function getDropSlotKinds(targetSlotEl) {
  return {
    isHotbar: targetSlotEl.classList.contains('slot'),
    isSell: targetSlotEl.classList.contains('shop-sell-slot'),
    isCraftInput: targetSlotEl.classList.contains('input-slot') && !targetSlotEl.classList.contains('refinery-input-slot'),
    isRefineryInput: targetSlotEl.classList.contains('refinery-input-slot')
  };
}

function tryHandleHotbarDrag(drag, targetSlotEl, slotKinds) {
  const from = drag.fromSlot;
  const it = hotbar[from];
  if (!it) return false;

  if (slotKinds.isSell && shopMenuOpen) {
    const sellIndex = parseInt(targetSlotEl.dataset.sellSlot, 10);
    if (sellIndex >= 0 && !shopSellSlots[sellIndex]) {
      shopSellSlots[sellIndex] = { ...it };
      hotbar[from] = null;
      updateHUD();
      syncShopSellArea();
      return true;
    }
  } else if (slotKinds.isCraftInput && craftingMenuOpen) {
    const idx = parseInt(targetSlotEl.dataset.craftInput, 10);
    if (idx >= 0 && !craftingInputSlots[idx]) {
      craftingInputSlots[idx] = { ...it };
      hotbar[from] = null;
      updateHUD();
      syncCraftingUI();
      return true;
    }
  } else if (slotKinds.isRefineryInput && refineryMenuOpen) {
    const idx = parseInt(targetSlotEl.dataset.refineryInput, 10);
    if (idx >= 0 && !refineryInputSlots[idx]) {
      const accepted = activeRefineryStructure && activeRefineryStructure.acceptedOres || [];
      if (accepted.includes(it.item)) {
        refineryInputSlots[idx] = { ...it };
        hotbar[from] = null;
        updateHUD();
        syncRefineryUI();
        return true;
      }
    }
  } else if (slotKinds.isHotbar) {
    const to = parseInt(targetSlotEl.dataset.slot, 10);
    if (to >= 0 && to !== from) {
      const tmp = hotbar[to];
      hotbar[to] = hotbar[from];
      hotbar[from] = tmp;
      updateHUD();
      return true;
    }
  }

  return false;
}

function tryHandleBuyDrag(drag, targetSlotEl, slotKinds) {
  if (!slotKinds.isHotbar) return false;
  const from = drag.fromBuySlot;
  const it = shopBuySlots[from];
  if (!it) return false;
  const to = parseInt(targetSlotEl.dataset.slot, 10);
  if (to < 0 || hotbar[to] || player.credits < drag.price) return false;

  player.credits -= drag.price;
  sfx.playBuy();
  hotbar[to] = { ...it };
  removeFromShopInventory(it.item);
  shopBuySlots[from] = null;
  syncShopBuyArea();
  updateHUD();
  return true;
}

function tryHandleSellDrag(drag, targetSlotEl, slotKinds) {
  const from = drag.fromSellSlot;
  const it = shopSellSlots[from];
  if (!it) return false;

  if (slotKinds.isHotbar) {
    const to = parseInt(targetSlotEl.dataset.slot, 10);
    if (to >= 0 && !hotbar[to]) {
      hotbar[to] = { ...it };
      shopSellSlots[from] = null;
      updateHUD();
      syncShopSellArea();
      return true;
    }
  } else if (slotKinds.isSell) {
    const toSell = parseInt(targetSlotEl.dataset.sellSlot, 10);
    if (toSell >= 0 && toSell !== from) {
      const tmp = shopSellSlots[toSell];
      shopSellSlots[toSell] = shopSellSlots[from];
      shopSellSlots[from] = tmp;
      syncShopSellArea();
      return true;
    }
  }

  return false;
}

function tryHandleCraftInputDrag(drag, targetSlotEl, slotKinds) {
  const from = drag.fromCraftInput;
  const it = craftingInputSlots[from];
  if (!it) return false;

  if (slotKinds.isHotbar) {
    const to = parseInt(targetSlotEl.dataset.slot, 10);
    if (to >= 0 && !hotbar[to]) {
      hotbar[to] = { ...it };
      craftingInputSlots[from] = null;
      updateHUD();
      syncCraftingUI();
      return true;
    }
  } else if (slotKinds.isCraftInput) {
    const to = parseInt(targetSlotEl.dataset.craftInput, 10);
    if (to >= 0 && to !== from) {
      const tmp = craftingInputSlots[to];
      craftingInputSlots[to] = craftingInputSlots[from];
      craftingInputSlots[from] = tmp;
      syncCraftingUI();
      return true;
    }
  }

  return false;
}

function tryHandleCraftOutputDrag(targetSlotEl, slotKinds) {
  const it = craftingOutputSlot;
  if (!it || !it.real || !slotKinds.isHotbar) return false;

  const to = parseInt(targetSlotEl.dataset.slot, 10);
  if (to >= 0 && !hotbar[to]) {
    hotbar[to] = { ...it };
    craftingOutputSlot = null;
    updateHUD();
    syncCraftingUI();
    return true;
  }

  return false;
}

function tryHandleRefineryInputDrag(drag, targetSlotEl, slotKinds) {
  const from = drag.fromRefineryInput;
  const it = refineryInputSlots[from];
  if (!it) return false;

  if (slotKinds.isHotbar) {
    const to = parseInt(targetSlotEl.dataset.slot, 10);
    if (to >= 0 && !hotbar[to]) {
      hotbar[to] = { ...it };
      refineryInputSlots[from] = null;
      updateHUD();
      syncRefineryUI();
      return true;
    }
  } else if (slotKinds.isRefineryInput) {
    const to = parseInt(targetSlotEl.dataset.refineryInput, 10);
    if (to >= 0 && to !== from) {
      const tmp = refineryInputSlots[to];
      refineryInputSlots[to] = refineryInputSlots[from];
      refineryInputSlots[from] = tmp;
      syncRefineryUI();
      return true;
    }
  }

  return false;
}

function tryHandleRefineryOutputDrag(targetSlotEl, slotKinds) {
  const it = refineryOutputSlot;
  if (!it || !it.real || !slotKinds.isHotbar) return false;

  const to = parseInt(targetSlotEl.dataset.slot, 10);
  if (to >= 0 && !hotbar[to]) {
    hotbar[to] = { ...it };
    refineryOutputSlot = null;
    updateHUD();
    syncRefineryUI();
    return true;
  }

  return false;
}

function endDrag(clientX, clientY) {
  const drag = inventoryDrag;
  inventoryDrag = null;
  setDragGhostVisible(false);
  clearResourceBarHighlights();
  if (!drag) return;

  const dropTarget = resolveDropTarget(clientX, clientY);
  if (tryHandleResourceBarDrop(drag, dropTarget)) return;
  if (tryHandleJettisonDrop(drag, dropTarget.targetSlotEl)) return;
  if (!dropTarget.targetSlotEl) return;

  const slotKinds = getDropSlotKinds(dropTarget.targetSlotEl);
  if (drag.kind === 'hotbar') {
    tryHandleHotbarDrag(drag, dropTarget.targetSlotEl, slotKinds);
  } else if (drag.kind === 'buy') {
    tryHandleBuyDrag(drag, dropTarget.targetSlotEl, slotKinds);
  } else if (drag.kind === 'sell') {
    tryHandleSellDrag(drag, dropTarget.targetSlotEl, slotKinds);
  } else if (drag.kind === 'craftInput') {
    tryHandleCraftInputDrag(drag, dropTarget.targetSlotEl, slotKinds);
  } else if (drag.kind === 'craftOutput') {
    tryHandleCraftOutputDrag(dropTarget.targetSlotEl, slotKinds);
  } else if (drag.kind === 'refineryInput') {
    tryHandleRefineryInputDrag(drag, dropTarget.targetSlotEl, slotKinds);
  } else if (drag.kind === 'refineryOutput') {
    tryHandleRefineryOutputDrag(dropTarget.targetSlotEl, slotKinds);
  }
}

// UI Drag Start Listener
window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const t = e.target;
  
  const hotbarSlotEl = t.closest && (t.closest('#hotbar .slot') || t.closest('#extended-inventory .slot'));
  const buySlotEl = t.closest && t.closest('.shop-buy-slot');
  const sellSlotEl = t.closest && t.closest('.shop-sell-slot');
  const craftInputEl = t.closest && t.closest('.crafting-slot.input-slot:not(.refinery-input-slot)');
  const craftOutputEl = t.closest && t.closest('#crafting-work-area .crafting-slot.output-slot');
  const refineryInputEl = t.closest && t.closest('.refinery-input-slot');
  const refineryOutputEl = t.closest && t.closest('#refinery-output-area .crafting-slot.output-slot');
  
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
      // Shift+click (with crafting open): transfer to first empty input slot
      if (e.shiftKey && craftingMenuOpen) {
        const it = hotbar[slotIndex];
        const firstEmpty = craftingInputSlots.findIndex(s => !s);
        if (firstEmpty >= 0) {
          craftingInputSlots[firstEmpty] = { ...it };
          hotbar[slotIndex] = null;
          syncCraftingUI();
          updateHUD();
        }
        return;
      }
      // Shift+click (with refinery open): transfer accepted ore to first empty input slot
      if (e.shiftKey && refineryMenuOpen) {
        const it = hotbar[slotIndex];
        const accepted = activeRefineryStructure && activeRefineryStructure.acceptedOres || [];
        if (accepted.includes(it.item)) {
          const firstEmpty = refineryInputSlots.findIndex(s => !s);
          if (firstEmpty >= 0) {
            refineryInputSlots[firstEmpty] = { ...it };
            hotbar[slotIndex] = null;
            syncRefineryUI();
            updateHUD();
          }
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

  if (craftingMenuOpen) {
    if (craftInputEl) {
      const idx = parseInt(craftInputEl.dataset.craftInput, 10);
      if (idx >= 0 && craftingInputSlots[idx]) {
        e.preventDefault();
        // Shift+click: return to inventory
        if (e.shiftKey) {
            if (inventory.add(craftingInputSlots[idx].item, craftingInputSlots[idx].quantity)) {
                craftingInputSlots[idx] = null;
                syncCraftingUI();
                updateHUD();
            }
            return;
        }
        // Drag
        hideShopTooltip();
        const it = craftingInputSlots[idx];
        inventoryDrag = { kind: 'craftInput', fromCraftInput: idx };
        const qty = it.quantity != null ? String(it.quantity) : '';
        setDragGhostContent(it, getItemLabel(it), qty);
        setDragGhostPos(e.clientX, e.clientY);
        setDragGhostVisible(true);
      }
      return;
    }
    if (craftOutputEl) {
      if (craftingOutputSlot && craftingOutputSlot.real) {
        e.preventDefault();
        if (e.shiftKey) {
            if (inventory.add(craftingOutputSlot.item, craftingOutputSlot.quantity)) {
                craftingOutputSlot = null;
                syncCraftingUI();
                updateHUD();
            }
            return;
        }
        // Drag
        hideShopTooltip();
        const it = craftingOutputSlot;
        inventoryDrag = { kind: 'craftOutput' };
        const qty = it.quantity != null ? String(it.quantity) : '';
        setDragGhostContent(it, getItemLabel(it), qty);
        setDragGhostPos(e.clientX, e.clientY);
        setDragGhostVisible(true);
      }
      return;
    }
  }

  if (refineryMenuOpen) {
    if (refineryInputEl) {
      const idx = parseInt(refineryInputEl.dataset.refineryInput, 10);
      if (idx >= 0 && refineryInputSlots[idx]) {
        e.preventDefault();
        // Shift+click: return to inventory
        if (e.shiftKey) {
          if (inventory.add(refineryInputSlots[idx].item, refineryInputSlots[idx].quantity)) {
            refineryInputSlots[idx] = null;
            syncRefineryUI();
            updateHUD();
          }
          return;
        }
        // Drag
        hideShopTooltip();
        const it = refineryInputSlots[idx];
        inventoryDrag = { kind: 'refineryInput', fromRefineryInput: idx };
        const qty = it.quantity != null ? String(it.quantity) : '';
        setDragGhostContent(it, getItemLabel(it), qty);
        setDragGhostPos(e.clientX, e.clientY);
        setDragGhostVisible(true);
      }
      return;
    }
    if (refineryOutputEl) {
      if (refineryOutputSlot && refineryOutputSlot.real) {
        e.preventDefault();
        if (e.shiftKey) {
          if (inventory.add(refineryOutputSlot.item, refineryOutputSlot.quantity)) {
            refineryOutputSlot = null;
            syncRefineryUI();
            updateHUD();
          }
          return;
        }
        // Drag
        hideShopTooltip();
        const it = refineryOutputSlot;
        inventoryDrag = { kind: 'refineryOutput' };
        const qty = it.quantity != null ? String(it.quantity) : '';
        setDragGhostContent(it, getItemLabel(it), qty);
        setDragGhostPos(e.clientX, e.clientY);
        setDragGhostVisible(true);
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
    const healthBarEl = document.getElementById('health-bar-drop-zone');
    const under = document.elementFromPoint(e.clientX, e.clientY);
    
    let it = null;
    if (inventoryDrag.kind === 'hotbar') {
      it = hotbar[inventoryDrag.fromSlot];
    } else if (inventoryDrag.kind === 'buy') {
      it = shopBuySlots[inventoryDrag.fromBuySlot];
    } else if (inventoryDrag.kind === 'craftInput') {
      it = craftingInputSlots[inventoryDrag.fromCraftInput];
    } else if (inventoryDrag.kind === 'craftOutput') {
      it = craftingOutputSlot;
    } else if (inventoryDrag.kind === 'refineryInput') {
      it = refineryInputSlots[inventoryDrag.fromRefineryInput];
    } else if (inventoryDrag.kind === 'refineryOutput') {
      it = refineryOutputSlot;
    }
    
    const isOverFuel = under && under.closest('#fuel-bar-drop-zone');
    const isOverO2 = under && under.closest('#oxygen-bar-drop-zone');
    const isOverHealth = under && under.closest('#health-bar-drop-zone');
    
    // Highlight fuel bar
    const showFuelHighlight = it && (it.item === 'fuel tank' || it.item === 'medium fuel tank' || it.item === 'large fuel tank') && isOverFuel;
    if (fuelBarEl) fuelBarEl.classList.toggle('highlight', showFuelHighlight);
    
    // Highlight O2 bar
    const showO2Highlight = it && (it.item === 'oxygen canister' || it.item === 'medium oxygen canister' || it.item === 'large oxygen canister') && isOverO2;
    if (oxygenBarEl) oxygenBarEl.classList.toggle('highlight', showO2Highlight);

    // Highlight Health bar
    const showHealthHighlight = it && (it.item === 'health pack' || it.item === 'medium health pack' || it.item === 'large health pack') && isOverHealth;
    if (healthBarEl) healthBarEl.classList.toggle('highlight', showHealthHighlight);
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
initStars();
initShopBuySlots();
initShip3D();

// Initial level load is handled at startup (level1.json)

function gameLoop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // Warp transition updates even while paused so animation plays through
  updateWarpTransition(dt);

  if (!gamePaused) {
    if (deathSequence.active) updateDeathSequence(dt);
    update(dt);
  }
  render(gamePaused ? 0 : dt);
  _flushHUD(); // Only re-renders DOM when hudDirty is true

  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
