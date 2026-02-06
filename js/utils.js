import { ORE_ITEMS, MAX_ORE_STACK, ITEM_IMAGE_PATHS, ITEM_LABELS, ITEM_DEFAULTS } from './constants.js';

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

/** Get the icon image path for a given item name (or null if none). */
export function getItemImagePath(itemName) {
  return ITEM_IMAGE_PATHS[itemName] || null;
}

/** Get the short HUD label for an inventory slot object (e.g. {item:'cuprite'}). */
export function getItemLabel(it) {
  if (!it) return '';
  return ITEM_LABELS[it.item] || (it.item && it.item.charAt(0).toUpperCase()) || '';
}

/** Build a full item payload for a given item key (used when buying/spawning items). */
export function getItemPayload(itemKey) {
  const defaults = ITEM_DEFAULTS[itemKey];
  return defaults ? { item: itemKey, ...defaults } : { item: itemKey };
}

// ---------------------------------------------------------------------------
// Raycast helpers – shared by laser hit detection
// ---------------------------------------------------------------------------

/**
 * Test a ray (origin ox,oy  direction dx,dy  max length maxLen) against a
 * single circle (cx, cy, radius).  Returns the entry distance along the ray
 * if the ray hits, or -1 if it misses.
 */
export function raycastCircle(ox, oy, dx, dy, cx, cy, radius, maxLen) {
  const fx = cx - ox;
  const fy = cy - oy;
  const t = fx * dx + fy * dy;
  if (t < 0) return -1; // behind ray origin
  const px = ox + dx * t;
  const py = oy + dy * t;
  const distSq = (cx - px) * (cx - px) + (cy - py) * (cy - py);
  const radiusSq = radius * radius;
  if (distSq >= radiusSq) return -1;
  const hitDist = t - Math.sqrt(radiusSq - distSq);
  return (hitDist > 0 && hitDist < maxLen) ? hitDist : -1;
}

// ---------------------------------------------------------------------------
// Physics helpers – shared by ship, pirate, and floating-item collision code
// ---------------------------------------------------------------------------

/**
 * Push `entity` out of `obstacle` if their circles overlap.
 * Returns {nx, ny, overlap, dist} if overlapping, or null if no collision.
 * Mutates entity.x / entity.y to resolve the overlap.
 */
export function pushOutOverlap(entity, obstacle, entityRadius, obstacleRadius) {
  const dx = entity.x - obstacle.x;
  const dy = entity.y - obstacle.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = entityRadius + obstacleRadius;
  if (dist >= minDist || dist === 0) return null;
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  entity.x += nx * overlap;
  entity.y += ny * overlap;
  return { nx, ny, overlap, dist };
}

/**
 * Apply a bounce to `entity` along the collision normal (nx, ny).
 * `restitution` controls how much velocity is reflected (0 = absorb, 1 = elastic).
 * Returns the signed impact speed along the normal (negative means entity was
 * moving into the obstacle). Only bounces if moving inward.
 */
export function bounceEntity(entity, nx, ny, restitution) {
  const normalSpeed = entity.vx * nx + entity.vy * ny;
  if (normalSpeed >= 0) return 0; // already moving away
  const impactSpeed = -normalSpeed;
  const bounce = impactSpeed * (1 + restitution);
  entity.vx += nx * bounce;
  entity.vy += ny * bounce;
  return impactSpeed;
}
