export const WIDTH = 1200;
export const HEIGHT = 900;
export const ACCEL = 150;
export const FRICTION = 0.15;
export const BRAKE_FRICTION = 1.5;
export const MAX_SPEED_DEFAULT = 175;

export const BULLET_SPEED = 675;
export const FIRE_COOLDOWN = 0.03;
export const PLAYER_BULLET_HIT_RADIUS = 3.6;  // 30% larger hitbox vs point collision (0.3 * typical pirate radius)

export const PIRATE_ACCEL = 150;
export const PIRATE_FRICTION = 0.15;
export const PIRATE_MAX_SPEED = 160;
export const PIRATE_HEALTH = 20;
export const PIRATE_BULLET_SPEED = 250;
export const PIRATE_BASE_AGGRO_RADIUS = 300;
export const BASE_DEFENSE_ORBIT_RADIUS = 100;
export const BASE_DEFENSE_ORBIT_SPEED = 0.3;

export const SHIP_SIZE = 10;
export const SHIP_COLLISION_RADIUS = 8;
export const SHIP_COLLECTION_RADIUS = 16;

export const LASER_HEAT_RATE = 1;
export const LASER_COOL_RATE = 1 / 3;
export const WEAPON_ENERGY_DRAIN = 1;

export const MINING_LASER_STATS = {
  'mining laser':       { heatRate: 1, coolRate: 1 / 3, dps: 7, energyDrain: 0.525 },
  'medium mining laser': { heatRate: 1 / 1.5, coolRate: 1 / 3, dps: 15, energyDrain: 0.84 },
  'large mining laser':  { heatRate: 1 / 2.2, coolRate: 1 / 3, dps: 25, energyDrain: 1.05 }
};

export const BLASTER_ENERGY_PER_SHOT = 0.105;
export const BLASTER_HEAT_PER_SHOT = 0.09;
export const BLASTER_COOL_RATE = 1 / 3;
export const BLASTER_FIRE_RATE = 10;

export const BLASTER_STATS = {
  'light blaster':  { energyPerShot: 0.105, heatPerShot: 0.09, coolRate: 1 / 3, fireRate: 10, pirateDmg: 3, asteroidDmg: 0.5 },
  'medium blaster': { energyPerShot: 0.1575, heatPerShot: 0.08, coolRate: 1 / 3, fireRate: 10, pirateDmg: 6, asteroidDmg: 1 },
  'large blaster':  { energyPerShot: 0.2625, heatPerShot: 0.06, coolRate: 1 / 3, fireRate: 10, pirateDmg: 11, asteroidDmg: 2 }
};

export const OXYGEN_DEPLETION_RATE = 0.06;
export const FUEL_DEPLETION_RATE = 1 / 4;

export const MAX_ORE_STACK = 20;
export const MAX_WARP_KEY_FRAGMENT_STACK = 20;
/** Raw ore, scrap, and refined metals (copper, iron, gold, diamond, platinum) - all stack to MAX_ORE_STACK (20). */
export const ORE_ITEMS = ['cuprite', 'hematite', 'aurite', 'diamite', 'platinite', 'scrap', 'copper', 'iron', 'gold', 'diamond', 'platinum'];

// --- Raw ore -> Refined ore mapping (used by Refinery) ---
export const RAW_TO_REFINED = {
  'cuprite': 'copper',
  'hematite': 'iron',
  'aurite': 'gold',
  'diamite': 'diamond',
  'platinite': 'platinum'
};
export const RAW_ORE_TYPES = ['cuprite', 'hematite', 'aurite', 'diamite', 'platinite'];

export const STRUCTURE_SIZE = 40;
export const STRUCTURE_RADIUS_3D = 54;
export const WARP_GATE_DASHED_EXTRA = 80;
export const SHOP_DASHED_EXTRA = 80;
export const WARP_GATE_DASHED_EXTRA_3D = 108;
export const SHOP_DASHED_EXTRA_3D = 108;
export const STRUCTURE_SIZE_COLL = 54;
export const PIRATE_BASE_HIT_RADIUS = 54;

export const STRUCTURE_STYLES = { 
  shop: '#446688', 
  shipyard: '#664466', 
  refinery: '#666644', 
  fueling: '#446644', 
  warpgate: '#6644aa', 
  piratebase: '#884422',
  healingbase: '#1f6b43'
};

export const SHIP_STATS = {
  'scout':     { name: 'Scout',     price: 0,     health: 50, fuel: 25, oxygen: 30, speed: 175, slots: 11, collisionRadius: 8,  shipScale: 1.0, damageMult: 1.0, damageReduction: 0,    droneSlots: 0,  desc: 'Standard issue scout ship.' },
  'cutter':    { name: 'Cutter',    price: 5000,  health: 80, fuel: 40, oxygen: 35, speed: 175, slots: 15, collisionRadius: 10.4, shipScale: 1.3, damageMult: 1.25, damageReduction: 0,    droneSlots: 0,  desc: 'Sturdy attack vessel. 25% bonus weapon damage vs pirates and bases.' },
  'transport': { name: 'Transport', price: 5000,  health: 60, fuel: 50, oxygen: 50, speed: 175, slots: 18, collisionRadius: 11.2, shipScale: 1.4, damageMult: 1.0, damageReduction: 0,    droneSlots: 0,  desc: 'Heavy transport with 18 inventory slots.' },
  'frigate':   { name: 'Frigate',   price: 8000,  health: 80, fuel: 60, oxygen: 60, speed: 175, slots: 25, collisionRadius: 12,   shipScale: 1.8, damageMult: 1.0, damageReduction: 0.10, droneSlots: 5,  desc: 'Defensive combat hull. Takes 10% less damage from all sources.' },
  'carrier':   { name: 'Carrier',   price: 10000, health: 120, fuel: 90, oxygen: 60, speed: 175, slots: 27, collisionRadius: 13.6, shipScale: 1.7, damageMult: 1.0, damageReduction: 0,    droneSlots: 20, desc: 'Heavy capital ship with expanded storage and drone bays.' }
};

export const ITEM_USAGE = {
  'small energy cell': 'Powers mining lasers and blasters.',
  'medium energy cell': 'Powers mining lasers and blasters. Holds 3x more charge.',
  'large energy cell': 'Powers mining lasers and blasters. Holds 6x more charge.',
  'fuel tank': 'Drag to fuel bar to refill ship fuel.',
  'medium fuel tank': 'Medium capacity fuel tank. Drag to fuel bar to refill ship fuel.',
  'large fuel tank': 'Large capacity fuel tank. Drag to fuel bar to refill ship fuel.',
  'oxygen canister': 'Drag to O2 bar to refill ship oxygen.',
  'medium oxygen canister': 'Medium capacity oxygen canister. Drag to O2 bar to refill ship oxygen.',
  'large oxygen canister': 'Large capacity oxygen canister. Drag to O2 bar to refill ship oxygen.',
  'health pack': 'Drag to health bar to repair ship.',
  'medium health pack': 'Medium capacity repair kit. Drag to health bar to repair ship.',
  'large health pack': 'Large capacity repair kit. Drag to health bar to repair ship.',
  'light blaster': 'Select and left-click to fire rapid projectiles at enemies.',
  'medium blaster': 'Medium blaster. Higher damage per shot.',
  'large blaster': 'Heavy blaster. Devastating damage per shot.',
  'mining laser': 'Select and left-click to mine asteroids for ore.',
  'medium mining laser': 'Upgraded laser that mines faster.',
  'large mining laser': 'High-power laser. Mines the fastest.',
  'cuprite': 'Common ore. Sell at shops for credits.',
  'hematite': 'Uncommon ore. Worth more than cuprite.',
  'aurite': 'Rare golden ore. Valuable at shops.',
  'diamite': 'Precious ore. High value.',
  'platinite': 'Extremely rare ore. Most valuable.',
  'scrap': 'Salvaged material. Can be sold for credits.',
  'warp key': 'Required to activate warp gates. Consumed when warping.',
  'warp key fragment': 'Broken piece of a warp key. 4 fragments can substitute for a warp key. Stackable to 20. Consumed when warping.',
  'copper': 'Refined copper. More valuable than raw cuprite.',
  'iron': 'Refined iron. More valuable than raw hematite.',
  'gold': 'Refined gold. More valuable than raw aurite.',
  'diamond': 'Refined diamond. More valuable than raw diamite.',
  'platinum': 'Refined platinum. Most valuable refined ore.'
};

export const ITEM_DISPLAY_NAMES = {
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
  'mining laser': 'Mining Laser',
  'medium mining laser': 'Medium Mining Laser',
  'large mining laser': 'Large Mining Laser',
  'cuprite': 'Cuprite',
  'hematite': 'Hematite',
  'aurite': 'Aurite',
  'diamite': 'Diamite',
  'platinite': 'Platinite',
  'scrap': 'Scrap',
  'warp key': 'Warp Key',
  'warp key fragment': 'Warp Key Fragment',
  'copper': 'Copper',
  'iron': 'Iron',
  'gold': 'Gold',
  'diamond': 'Diamond',
  'platinum': 'Platinum'
};

// --- Collision constants ---
export const BOUNCE_RESTITUTION = 0.3;
export const MAX_COLLISION_DAMAGE = 20;
export const DAMAGE_PER_SPEED = 0.1; // 200 units/sec impact => 20 damage

// --- Floating item constants ---
export const MAGNET_RADIUS = 80;
export const MAGNET_STRENGTH = 600;
export const FLOAT_DRAG = 2.0;
export const FLOAT_STOP_SPEED = 0.05;
export const FLOAT_ITEM_RADIUS = 10;
export const FLOATING_ORE_SCALE = 15;

// --- Particle constants ---
export const PARTICLE_DRAG = 6;

// --- Pirate combat constants ---
export const PIRATE_FIRE_RANGE = 700;
export const PIRATE_AIM_SPREAD = 60;
export const PIRATE_TILT_SENSITIVITY = 8;
export const PIRATE_TILT_DECAY = 4;

// --- Mothership special attacks ---
export const MOTHERSHIP_SPECIAL_ATTACK_INTERVAL_DEFAULT = 12;
export const MOTHERSHIP_SPECIAL_ATTACK_INTERVAL_MIN = 1;
export const MOTHERSHIP_EJECT_COUNT_DEFAULT = 2;
export const MOTHERSHIP_EJECT_COUNT_MIN = 1;
export const MOTHERSHIP_EJECT_DURATION = 3;
export const MOTHERSHIP_SHOTGUN_VOLLEY_DURATION = 3;
export const MOTHERSHIP_SHOTGUN_VOLLEY_COUNT = 5;
export const MOTHERSHIP_SHOTGUN_PELLETS_PER_VOLLEY = 7;
export const MOTHERSHIP_SHOTGUN_PELLET_SPREAD = 0.18;
export const MOTHERSHIP_SHOTGUN_AIM_JITTER = 35;
export const MOTHERSHIP_SHOTGUN_PELLET_DAMAGE = 3;
export const MOTHERSHIP_NAV_CELL_SIZE = 180;
export const MOTHERSHIP_NAV_REPLAN_INTERVAL = 1.2;
export const MOTHERSHIP_NAV_GOAL_INTERVAL = 5;
export const MOTHERSHIP_NAV_MAX_EXPANSIONS = 1600;
export const MOTHERSHIP_NAV_MAX_PATH_POINTS = 48;
export const MOTHERSHIP_NAV_WAYPOINT_REACH_DIST = 90;
export const MOTHERSHIP_NAV_GOAL_RETRY_COUNT = 10;
export const MOTHERSHIP_NAV_PLAYER_BIAS_RADIUS = 900;
export const MOTHERSHIP_NAV_PLAYER_MIN_DIST = 280;
export const MOTHERSHIP_NAV_BOUNDS_MARGIN = 80;
export const MOTHERSHIP_NAV_BOUNDS_PUSH_FORCE = 340;
export const HEALING_BASE_HEAL_PER_SECOND = 10;

// --- Interaction radius (structure radius + dashed ring) ---
export const INTERACT_RADIUS = STRUCTURE_SIZE_COLL + SHOP_DASHED_EXTRA_3D; // 54 + 108

// --- Item image paths (used for HUD, floating items, tooltips) ---
export const ITEM_IMAGE_PATHS = {
  'oxygen canister': 'assets/oxygen-can.png',
  'medium oxygen canister': 'assets/oxygen-can.png',
  'large oxygen canister': 'assets/oxygen-can.png',
  'fuel tank': 'assets/fuel-can.png',
  'medium fuel tank': 'assets/fuel-can.png',
  'large fuel tank': 'assets/fuel-can.png',
  'health pack': 'assets/health-pack.png',
  'medium health pack': 'assets/health-pack.png',
  'large health pack': 'assets/health-pack.png',
  'small energy cell': 'assets/energy-cell.png',
  'medium energy cell': 'assets/energy-cell.png',
  'large energy cell': 'assets/energy-cell.png',
  'mining laser': 'assets/laser.png',
  'medium mining laser': 'assets/laser.png',
  'large mining laser': 'assets/laser.png',
  'light blaster': 'assets/blaster.png',
  'medium blaster': 'assets/blaster.png',
  'large blaster': 'assets/blaster.png',
  'warp key': 'assets/warp-key.png',
  'warp key fragment': 'assets/warp-key-fragment.png'
};

// --- Item short labels (for HUD slot display) ---
export const ITEM_LABELS = {
  'mining laser': 'L',
  'medium mining laser': 'M',
  'large mining laser': 'XL',
  'light blaster': 'B',
  'medium blaster': 'MB',
  'large blaster': 'LB',
  'small energy cell': 'E',
  'medium energy cell': 'M',
  'large energy cell': 'L',
  'oxygen canister': 'O',
  'medium oxygen canister': 'MO',
  'large oxygen canister': 'LO',
  'fuel tank': 'F',
  'medium fuel tank': 'MF',
  'large fuel tank': 'LF',
  'health pack': 'H',
  'medium health pack': 'MH',
  'large health pack': 'LH',
  'cuprite': 'C',
  'hematite': 'H',
  'aurite': 'A',
  'diamite': 'D',
  'platinite': 'P',
  'scrap': 'S',
  'warp key': 'K',
  'warp key fragment': 'KF',
  'copper': 'Cu',
  'iron': 'Fe',
  'gold': 'Au',
  'diamond': 'Di',
  'platinum': 'Pt'
};

// --- Item default payloads (used when buying/creating items) ---
export const ITEM_DEFAULTS = {
  'small energy cell':    { energy: 10, maxEnergy: 10 },
  'medium energy cell':   { energy: 30, maxEnergy: 30 },
  'large energy cell':    { energy: 60, maxEnergy: 60 },
  'oxygen canister':      { oxygen: 10, maxOxygen: 10 },
  'medium oxygen canister': { oxygen: 30, maxOxygen: 30 },
  'large oxygen canister':{ oxygen: 60, maxOxygen: 60 },
  'fuel tank':            { fuel: 10, maxFuel: 10 },
  'medium fuel tank':     { fuel: 30, maxFuel: 30 },
  'large fuel tank':      { fuel: 60, maxFuel: 60 },
  'health pack':          { health: 10 },
  'medium health pack':   { health: 30 },
  'large health pack':    { health: 60 },
  'light blaster':        { heat: 0, overheated: false },
  'medium blaster':       { heat: 0, overheated: false },
  'large blaster':        { heat: 0, overheated: false },
  'medium mining laser':  { heat: 0, overheated: false },
  'large mining laser':   { heat: 0, overheated: false }
};

// --- Shop prices ---
export const ITEM_BUY_PRICE = {
  'small energy cell': 100,
  'medium energy cell': 350,
  'large energy cell': 750,
  'oxygen canister': 200,
  'medium oxygen canister': 450,
  'large oxygen canister': 800,
  'fuel tank': 150,
  'medium fuel tank': 350,
  'large fuel tank': 600,
  'light blaster': 800,
  'medium blaster': 2000,
  'large blaster': 4000,
  'medium mining laser': 1200,
  'large mining laser': 3000,
  'health pack': 175,
  'medium health pack': 400,
  'large health pack': 800
};

export const ITEM_SELL_PRICE = {
  cuprite: 10, hematite: 20, aurite: 30, diamite: 40, platinite: 60,
  copper: 20, iron: 40, gold: 60, diamond: 80, platinum: 120,
  scrap: 40, 'warp key': 500, 'mining laser': 300
};

// --- Collidable structure types ---
const COLLIDABLE_TYPES = new Set(['warpgate', 'shop', 'piratebase', 'healingbase', 'crafting', 'shipyard', 'refinery', 'mothership']);

/** Returns true if a structure should participate in physics collision checks. */
export function isCollidableStructure(st) {
  if (!COLLIDABLE_TYPES.has(st.type)) return false;
  if ((st.type === 'piratebase' || st.type === 'healingbase') && (st.dead || st.health <= 0)) return false;
  return true;
}

// --- Weapons that display a heat bar in HUD slots ---
export const HEAT_WEAPONS = ['mining laser', 'medium mining laser', 'large mining laser', 'light blaster', 'medium blaster', 'large blaster'];

// --- Master item list (used by editor dropdowns for crafting recipes, etc.) ---
export const ALL_ITEM_NAMES = [
  'mining laser', 'medium mining laser', 'large mining laser',
  'light blaster', 'medium blaster', 'large blaster',
  'small energy cell', 'medium energy cell', 'large energy cell',
  'oxygen canister', 'medium oxygen canister', 'large oxygen canister',
  'fuel tank', 'medium fuel tank', 'large fuel tank',
  'health pack', 'medium health pack', 'large health pack',
  'cuprite', 'hematite', 'aurite', 'diamite', 'platinite',
  'copper', 'iron', 'gold', 'diamond', 'platinum',
  'scrap', 'warp key', 'warp key fragment'
];

// --- Resource bar drop configuration (used by endDrag) ---
export const RESOURCE_BAR_CONFIG = {
  oxygen:  { items: ['oxygen canister', 'medium oxygen canister', 'large oxygen canister'], prop: 'oxygen', playerProp: 'oxygen', maxProp: 'maxOxygen' },
  fuel:    { items: ['fuel tank', 'medium fuel tank', 'large fuel tank'],                   prop: 'fuel',   playerProp: 'fuel',   maxProp: 'maxFuel' },
  health:  { items: ['health pack', 'medium health pack', 'large health pack'],             prop: 'health', playerProp: 'health', maxProp: 'maxHealth' }
};
