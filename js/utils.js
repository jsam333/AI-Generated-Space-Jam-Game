import { ORE_ITEMS, MAX_ORE_STACK } from './constants.js';

export function normalize(x, y) {
  const len = Math.sqrt(x * x + y * y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

export function createSeededRandom(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getMaxStack(itemName) {
  return ORE_ITEMS.includes(itemName) ? MAX_ORE_STACK : 1;
}

export function getItemImagePath(itemName) {
  if (itemName === 'oxygen canister' || itemName === 'large oxygen canister') return 'assets/oxygen-can.png';
  if (itemName === 'fuel tank' || itemName === 'large fuel tank') return 'assets/fuel-can.png';
  if (itemName === 'health pack' || itemName === 'large health pack') return 'assets/oxygen-can.png';
  if (itemName === 'small energy cell' || itemName === 'medium energy cell') return 'assets/energy-cell.png';
  if (itemName === 'mining laser' || itemName === 'medium mining laser') return 'assets/laser.png';
  if (itemName === 'light blaster') return 'assets/blaster.png';
  return null;
}

export function getItemLabel(it) {
  if (!it) return '';
  if (it.item === 'mining laser') return 'L';
  if (it.item === 'medium mining laser') return 'M';
  if (it.item === 'light blaster') return 'B';
  if (it.item === 'small energy cell') return 'E';
  if (it.item === 'medium energy cell') return 'M';
  if (it.item === 'oxygen canister') return 'O';
  if (it.item === 'large oxygen canister') return 'LO';
  if (it.item === 'fuel tank') return 'F';
  if (it.item === 'large fuel tank') return 'LF';
  if (it.item === 'health pack') return 'H';
  if (it.item === 'large health pack') return 'LH';
  if (it.item === 'cuprite') return 'C';
  if (it.item === 'hematite') return 'H';
  if (it.item === 'aurite') return 'A';
  if (it.item === 'diamite') return 'D';
  if (it.item === 'platinite') return 'P';
  if (it.item === 'scrap') return 'S';
  if (it.item === 'warp key') return 'K';
  return (it.item && it.item.charAt(0).toUpperCase()) || '';
}
