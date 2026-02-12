#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_COUNT = 150;

// Ore distribution: 10% cuprite, 20% hematite, 15% aurite, 25% diamite, 30% platinite
const ORE_WEIGHTS = Object.freeze({
  cuprite: 10,
  hematite: 20,
  aurite: 15,
  diamite: 25,
  platinite: 30
});

// Radii 40-220 in increments of 10
const RADII = Array.from({ length: 19 }, (_, i) => 40 + i * 10);

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randRange(rng, min, max) {
  return min + (max - min) * rng();
}

function overlapsAny(asteroids, x, y, radius) {
  for (const a of asteroids) {
    const dx = x - a.x;
    const dy = y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < radius + a.radius) return true;
  }
  return false;
}

function sampleWeightedKey(weighted, rng, fallback) {
  const entries = Object.entries(weighted || {});
  const total = entries.reduce((acc, [, v]) => acc + Math.max(0, Number(v) || 0), 0);
  if (total <= 0) return fallback;
  let pick = rng() * total;
  for (const [k, v] of entries) {
    pick -= Math.max(0, Number(v) || 0);
    if (pick <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

function shuffleFisherYates(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseArgs(argv) {
  const out = {
    count: DEFAULT_COUNT,
    levelPath: path.join(repoRoot, 'levels', 'level4.json'),
    reduce: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--count') out.count = Math.max(1, Math.floor(Number(argv[++i] ?? DEFAULT_COUNT)));
    else if (a === '--level') out.levelPath = path.resolve(argv[++i] ?? out.levelPath);
    else if (a === '--reduce') out.reduce = Math.max(0, Math.min(1, Number(argv[++i] ?? 0.2)));
    else if (a === '--help' || a === '-h') {
      console.log([
        'Level 4 asteroid generator',
        '',
        'Usage:',
        '  node tools/generate-level4-asteroids.mjs [options]',
        '',
        'Options:',
        '  --count <n>     Number of asteroids (default 150)',
        '  --level <path> Level JSON path (default levels/level4.json)',
        '  --reduce <0-1> Randomly remove this fraction of asteroids (e.g. 0.2 = 20%)',
        '  -h, --help     Show this help',
        ''
      ].join('\n'));
      process.exit(0);
    }
  }

  return out;
}

async function main() {
  const { count, levelPath, reduce } = parseArgs(process.argv.slice(2));

  const raw = await fs.readFile(levelPath, 'utf8');
  const level = JSON.parse(raw);

  const seed = typeof level.seed === 'number' ? level.seed >>> 0 : 999;
  const rng = mulberry32(seed + 1111);

  if (reduce != null && reduce > 0) {
    const asteroids = level.asteroids || [];
    const keepCount = Math.max(0, Math.floor(asteroids.length * (1 - reduce)));
    const shuffled = shuffleFisherYates(asteroids, rng);
    level.asteroids = shuffled.slice(0, keepCount);
    await fs.writeFile(levelPath, JSON.stringify(level, null, 2) + '\n', 'utf8');
    console.log(`Reduced from ${asteroids.length} to ${level.asteroids.length} asteroids (removed ${Math.round(reduce * 100)}%)`);
    return;
  }

  const width = level.width || 5000;
  const height = level.height || 5000;
  const halfW = width / 2;
  const halfH = height / 2;

  const asteroids = [];
  const maxAttempts = 1000;
  const genRng = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < maxAttempts && !placed; attempt++) {
      const x = randRange(genRng, -halfW, halfW);
      const y = randRange(genRng, -halfH, halfH);
      const radiusIdx = Math.floor(genRng() * RADII.length);
      const radius = RADII[radiusIdx];
      if (!overlapsAny(asteroids, x, y, radius)) {
        const oreType = sampleWeightedKey(ORE_WEIGHTS, genRng, 'cuprite');
        asteroids.push({ x, y, radius, oreType });
        placed = true;
      }
    }
    if (!placed) {
      console.warn(`Could not place asteroid ${i + 1} without overlap after ${maxAttempts} attempts; skipping.`);
    }
  }

  level.asteroids = asteroids;

  await fs.writeFile(levelPath, JSON.stringify(level, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${asteroids.length} asteroids to ${path.relative(repoRoot, levelPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
