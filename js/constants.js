export const WIDTH = 1200;
export const HEIGHT = 900;
export const ACCEL = 150;
export const FRICTION = 0.15;
export const BRAKE_FRICTION = 1.5;
export const MAX_SPEED_DEFAULT = 175;

export const BULLET_SPEED = 500;
export const FIRE_COOLDOWN = 0.03;

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
  'mining laser':       { heatRate: 1, coolRate: 1 / 3, dps: 7, energyDrain: 1 },
  'medium mining laser': { heatRate: 1 / 1.5, coolRate: 1 / 3, dps: 10, energyDrain: 1.5 }
};

export const BLASTER_ENERGY_PER_SHOT = 0.2;
export const BLASTER_HEAT_PER_SHOT = 0.09;
export const BLASTER_COOL_RATE = 1 / 3;
export const BLASTER_FIRE_RATE = 10;

export const OXYGEN_DEPLETION_RATE = 1 / 25;
export const FUEL_DEPLETION_RATE = 1 / 3;

export const MAX_ORE_STACK = 10;
export const ORE_ITEMS = ['cuprite', 'hematite', 'aurite', 'diamite', 'platinite', 'scrap'];

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
  piratebase: '#884422' 
};

export const SHIP_STATS = {
  'scout': { name: 'Scout', price: 0, health: 50, fuel: 25, oxygen: 30, speed: 175, desc: 'Standard issue scout ship.' },
  'cutter': { name: 'Cutter', price: 5000, health: 80, fuel: 40, oxygen: 40, speed: 150, desc: 'Sturdy mining vessel with reinforced hull.' },
  'transport': { name: 'Transport', price: 12000, health: 120, fuel: 80, oxygen: 60, speed: 120, desc: 'Heavy transport with massive capacity.' }
};

export const ITEM_USAGE = {
  'small energy cell': 'Powers mining lasers and blasters.',
  'medium energy cell': 'Powers mining lasers and blasters. Holds 3x more charge.',
  'fuel tank': 'Drag to fuel bar to refill ship fuel.',
  'large fuel tank': 'Large capacity fuel tank.',
  'oxygen canister': 'Drag to O2 bar to refill ship oxygen.',
  'large oxygen canister': 'Large capacity oxygen canister.',
  'health pack': 'Drag to health bar to repair ship.',
  'large health pack': 'Large capacity repair kit.',
  'light blaster': 'Select and left-click to fire rapid projectiles at enemies.',
  'mining laser': 'Select and left-click to mine asteroids for ore.',
  'medium mining laser': 'Upgraded laser that mines faster.',
  'cuprite': 'Common ore. Sell at shops for credits.',
  'hematite': 'Uncommon ore. Worth more than cuprite.',
  'aurite': 'Rare golden ore. Valuable at shops.',
  'diamite': 'Precious ore. High value.',
  'platinite': 'Extremely rare ore. Most valuable.',
  'scrap': 'Salvaged material. Can be sold for credits.',
  'warp key': 'Required to activate warp gates.'
};

export const ITEM_DISPLAY_NAMES = {
  'small energy cell': 'Small Energy Cell',
  'medium energy cell': 'Medium Energy Cell',
  'fuel tank': 'Fuel Tank',
  'large fuel tank': 'Large Fuel Tank',
  'oxygen canister': 'Oxygen Canister',
  'large oxygen canister': 'Large Oxygen Canister',
  'health pack': 'Health Pack',
  'large health pack': 'Large Health Pack',
  'light blaster': 'Light Blaster',
  'mining laser': 'Mining Laser',
  'medium mining laser': 'Medium Mining Laser',
  'cuprite': 'Cuprite',
  'hematite': 'Hematite',
  'aurite': 'Aurite',
  'diamite': 'Diamite',
  'platinite': 'Platinite',
  'scrap': 'Scrap',
  'warp key': 'Warp Key'
};
