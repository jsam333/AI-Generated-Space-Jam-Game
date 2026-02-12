#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_LEVELS = ['level1', 'level2', 'level3'];
const DEFAULT_RUNS = 1000;

const ORE_HEALTH_MULT = Object.freeze({
  cuprite: 1,
  hematite: 2.2,
  aurite: 3.7,
  diamite: 5.5,
  platinite: 8
});

const PIRATE_TYPE_HEALTH = Object.freeze({
  normal: 20,
  sturdy: 40,
  fast: 15
});

const ARCHETYPE_MULT = Object.freeze({
  standard: { hp: 1, dmg: 1 },
  shotgun: { hp: 1, dmg: 0.9 },
  slowing: { hp: 1.1, dmg: 1.05 },
  breaching: { hp: 1.1, dmg: 1.1 },
  drone: { hp: 0.25, dmg: 0.7 }
});

function parseArgs(argv) {
  const out = {
    runs: DEFAULT_RUNS,
    levels: [...DEFAULT_LEVELS],
    seed: null,
    outJson: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--runs') out.runs = Math.max(1, Math.floor(Number(argv[++i] ?? DEFAULT_RUNS)));
    else if (a === '--seed') out.seed = Number(argv[++i]);
    else if (a === '--levels') out.levels = String(argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--out-json') out.outJson = String(argv[++i] ?? '').trim() || null;
    else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (!Number.isFinite(out.runs) || out.runs < 1) throw new Error('Invalid --runs value.');
  if (out.seed !== null && !Number.isFinite(out.seed)) throw new Error('Invalid --seed value.');
  if (!out.levels.length) throw new Error('No levels selected. Use --levels level1,level2,level3');
  return out;
}

function printHelp() {
  console.log(
    [
      'Space Jam progression simulator',
      '',
      'Usage:',
      '  node tools/simulate-level-progression.mjs [options]',
      '',
      'Options:',
      '  --runs <n>                 Number of Monte Carlo runs (default 1000)',
      '  --seed <n>                 Base RNG seed for reproducible runs',
      '  --levels <csv>             Level sequence (default level1,level2,level3)',
      '  --out-json <path>          Optional output JSON path',
      '  -h, --help                 Show this help',
      ''
    ].join('\n')
  );
}

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

function randInt(rng, min, max) {
  return Math.floor(randRange(rng, min, max + 1));
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

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  const idx = clamp(Math.round((sortedValues.length - 1) * p), 0, sortedValues.length - 1);
  return sortedValues[idx];
}

function fmtSeconds(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  if (mm < 60) return `${mm}m ${ss}s`;
  const hh = Math.floor(mm / 60);
  const remM = mm % 60;
  return `${hh}h ${remM}m ${ss}s`;
}

function difficultyLabel(score) {
  if (score < 35) return 'easy';
  if (score < 65) return 'moderate';
  return 'hard';
}

function evaluateExports(source, wantedNames) {
  const script = `${source
    .replace(/\bexport\s+const\s+/g, 'const ')
    .replace(/\bexport\s+function\s+/g, 'function ')
    .replace(/\bexport\s+default\s+/g, '')}
return { ${wantedNames.join(', ')} };`;
  return Function(script)();
}

async function loadInputs(levelNames) {
  const constantsPath = path.join(repoRoot, 'js', 'constants.js');
  const pirateSharedPath = path.join(repoRoot, 'js', 'pirateShared.js');
  const constantsSource = await fs.readFile(constantsPath, 'utf8');
  const pirateSharedSource = await fs.readFile(pirateSharedPath, 'utf8');

  const constants = evaluateExports(constantsSource, [
    'ACCEL',
    'MAX_SPEED_DEFAULT',
    'PIRATE_MAX_SPEED',
    'BLASTER_STATS',
    'MINING_LASER_STATS',
    'SHIP_STATS',
    'FUEL_DEPLETION_RATE',
    'OXYGEN_DEPLETION_RATE',
    'ITEM_BUY_PRICE',
    'ITEM_SELL_PRICE',
    'RAW_TO_REFINED'
  ]);
  const pirateShared = evaluateExports(pirateSharedSource, [
    'DEFAULT_SPAWN_SETTINGS',
    'DEFAULT_SPAWN_TIER_SETTINGS',
    'ensureSpawnSettingsDefaults'
  ]);

  const levels = [];
  for (const name of levelNames) {
    const levelPath = path.join(repoRoot, 'levels', `${name}.json`);
    const raw = await fs.readFile(levelPath, 'utf8');
    levels.push({ name, path: levelPath, data: JSON.parse(raw) });
  }
  return { constants, pirateShared, levels };
}

function countBy(collection, keyFn) {
  const out = {};
  for (const item of collection) {
    const k = keyFn(item);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function meanRadius(asteroids, oreType) {
  const matches = asteroids.filter((a) => (a.oreType || 'barren') === oreType);
  if (!matches.length) return 30;
  return matches.reduce((acc, a) => acc + (Number(a.radius) || 30), 0) / matches.length;
}

function estimateCombatProfile(constants) {
  const blaster = constants.BLASTER_STATS['light blaster'] || { pirateDmg: 3, fireRate: 10 };
  const transportMult = constants.SHIP_STATS?.transport?.damageMult ?? 1;
  const scoutMult = constants.SHIP_STATS?.scout?.damageMult ?? 1;
  return {
    baseDps: (Number(blaster.pirateDmg) || 3) * (Number(blaster.fireRate) || 10) * scoutMult,
    level3Dps: (Number(blaster.pirateDmg) || 3) * (Number(blaster.fireRate) || 10) * transportMult
  };
}

function estimateMiningRate(constants, levelName) {
  const laserName = levelName === 'level3' ? 'medium mining laser' : 'mining laser';
  const dps = constants.MINING_LASER_STATS?.[laserName]?.dps ?? 7;
  const eff = levelName === 'level3' ? 0.9 : levelName === 'level2' ? 0.8 : 0.75;
  return dps * eff;
}

function buildValidation(levelBundle, levelNameSet, constants) {
  const warnings = [];
  for (const lvl of levelBundle) {
    const structures = lvl.data.structures || [];
    for (const st of structures) {
      if (st.type === 'warpgate' && st.warpDestination && !levelNameSet.has(st.warpDestination)) {
        warnings.push(`${lvl.name}: warpgate points to missing level "${st.warpDestination}"`);
      }
    }

    const spawn = lvl.data.spawnSettings || {};
    for (const tier of spawn.tiers || []) {
      if (Number(tier.waveIntervalMin) > Number(tier.waveIntervalMax)) {
        warnings.push(`${lvl.name}: tier interval min > max at startTime=${tier.startTime}`);
      }
      if (Number(tier.waveSizeMin) > Number(tier.waveSizeMax)) {
        warnings.push(`${lvl.name}: tier wave size min > max at startTime=${tier.startTime}`);
      }
    }

    const availableFromAsteroids = new Set((lvl.data.asteroids || []).map((a) => a.oreType).filter(Boolean));
    const structuresByType = countBy(structures, (s) => s.type || 'unknown');
    const shopsSell = new Set(
      structures
        .filter((s) => s.type === 'shop')
        .flatMap((s) => (s.inventory || []).map((i) => i.item))
    );
    const baseDrops = new Set(
      structures
        .filter((s) => s.type === 'piratebase')
        .flatMap((s) => (s.drops || []).map((d) => d.item))
    );
    for (const crafting of structures.filter((s) => s.type === 'crafting')) {
      for (const recipe of crafting.recipes || []) {
        for (const input of recipe.inputs || []) {
          const item = input.item;
          const rawBacking = Object.entries(constants.RAW_TO_REFINED || {}).find(([, refined]) => refined === item)?.[0];
          const craftable =
            availableFromAsteroids.has(item) ||
            (rawBacking && availableFromAsteroids.has(rawBacking)) ||
            shopsSell.has(item) ||
            baseDrops.has(item);
          if (!craftable) {
            warnings.push(`${lvl.name}: recipe input "${item}" has no obvious source in-level`);
          }
        }
      }
    }

    if ((structuresByType.piratebase || 0) === 0) warnings.push(`${lvl.name}: no pirate base present; threat model may understate pressure`);
  }
  return warnings;
}

function simulateWavePressure(spawnSettings, durationSec, rng, pirateShared) {
  const normalized = pirateShared.ensureSpawnSettingsDefaults(JSON.parse(JSON.stringify(spawnSettings || {})));
  let nextWave = Math.max(0, Number(normalized.initialDelay) || 0);
  const events = [];
  while (nextWave <= durationSec) {
    let activeTier = null;
    let bestStart = -Infinity;
    for (const tier of normalized.tiers || []) {
      const start = Number(tier.startTime) || 0;
      if (nextWave >= start && start > bestStart) {
        bestStart = start;
        activeTier = tier;
      }
    }
    const minWave = Number(activeTier?.waveSizeMin ?? normalized.waveSizeMin ?? pirateShared.DEFAULT_SPAWN_SETTINGS.waveSizeMin);
    const maxWave = Number(activeTier?.waveSizeMax ?? normalized.waveSizeMax ?? pirateShared.DEFAULT_SPAWN_SETTINGS.waveSizeMax);
    const minInt = Number(activeTier?.waveIntervalMin ?? normalized.waveIntervalMin ?? pirateShared.DEFAULT_SPAWN_SETTINGS.waveIntervalMin);
    const maxInt = Number(activeTier?.waveIntervalMax ?? normalized.waveIntervalMax ?? pirateShared.DEFAULT_SPAWN_SETTINGS.waveIntervalMax);
    const typeMix = activeTier?.pirateTypePercentages || normalized.pirateTypePercentages || { normal: 100, sturdy: 0, fast: 0 };
    const count = randInt(rng, Math.max(1, Math.floor(minWave)), Math.max(1, Math.floor(maxWave)));
    const pirates = [];
    for (let i = 0; i < count; i += 1) pirates.push(sampleWeightedKey(typeMix, rng, 'normal'));
    events.push({ t: nextWave, pirates });
    const interval = Math.max(0.1, randRange(rng, Math.min(minInt, maxInt), Math.max(minInt, maxInt)));
    nextWave += interval;
  }
  return events;
}

function analyzeLevelFeatures(level) {
  const asteroids = level.data.asteroids || [];
  const structures = level.data.structures || [];
  return {
    mapDiagonal: Math.sqrt((Number(level.data.width) || 0) ** 2 + (Number(level.data.height) || 0) ** 2),
    asteroidCounts: countBy(asteroids, (a) => a.oreType || 'barren'),
    structureCounts: countBy(structures, (s) => s.type || 'unknown'),
    warpgate: structures.find((s) => s.type === 'warpgate') || null,
    hasCrafting: structures.some((s) => s.type === 'crafting'),
    hasRefinery: structures.some((s) => s.type === 'refinery'),
    nearestShopDist: (() => {
      let best = Infinity;
      for (const s of structures) {
        if (s.type !== 'shop') continue;
        const d = Math.sqrt((Number(s.x) || 0) ** 2 + (Number(s.y) || 0) ** 2);
        if (d < best) best = d;
      }
      return Number.isFinite(best) ? best : 1200;
    })()
  };
}

function simulateSingleLevel(level, constants, pirateShared, rng) {
  const feature = analyzeLevelFeatures(level);
  const levelName = level.name;
  const spawn = level.data.spawnSettings || {};
  const combatProfile = estimateCombatProfile(constants);
  const miningRate = estimateMiningRate(constants, levelName);
  const travelSpeed = clamp(constants.MAX_SPEED_DEFAULT * randRange(rng, 0.55, 0.82), 80, 220);
  const decisionDelay = randRange(rng, 6, 20);
  const combatSkill = randRange(rng, 0.7, 1.2);
  const routeEfficiency = randRange(rng, 0.8, 1.35);
  const resourceCare = randRange(rng, 0.7, 1.25);

  const travelBase = ((feature.mapDiagonal * 0.33) / travelSpeed) * routeEfficiency;
  const nearestShopTrip = (feature.nearestShopDist / travelSpeed) * randRange(rng, 1.2, 2.6);

  let gatherTargetCredits = levelName === 'level1' ? 1200 : levelName === 'level2' ? 3800 : 1800;
  if ((feature.structureCounts.piratebase || 0) > 20) gatherTargetCredits += 900;
  const baseOrePrice = 10;
  const oreNeeded = gatherTargetCredits / baseOrePrice;
  const meanOreHealth = (Object.entries(feature.asteroidCounts).reduce((acc, [ore, c]) => {
    if (ore === 'barren') return acc;
    return acc + (meanRadius(level.data.asteroids || [], ore) * (ORE_HEALTH_MULT[ore] || 1) * c);
  }, 0) / Math.max(1, (level.data.asteroids || []).length));
  const gatherTime = ((oreNeeded * Math.max(8, meanOreHealth * 0.12)) / Math.max(1, miningRate)) * randRange(rng, 0.75, 1.3);

  const craftingTax = feature.hasCrafting ? randRange(rng, 90, 300) : 0;
  const refineTax = feature.hasRefinery ? randRange(rng, 70, 180) : 0;
  const basePressureTax = (feature.structureCounts.piratebase || 0) * randRange(rng, 3, 8);
  const baselineDuration = travelBase + nearestShopTrip + gatherTime + craftingTax + refineTax + basePressureTax + decisionDelay;

  const waves = simulateWavePressure(spawn, baselineDuration, rng, pirateShared);
  let incomingHp = 0;
  let incomingThreat = 0;
  for (const e of waves) {
    for (const type of e.pirates) {
      const archetype = levelName === 'level3' ? sampleWeightedKey({ standard: 65, shotgun: 12, slowing: 9, breaching: 9, drone: 5 }, rng, 'standard') : 'standard';
      const arch = ARCHETYPE_MULT[archetype] || ARCHETYPE_MULT.standard;
      incomingHp += PIRATE_TYPE_HEALTH[type] * arch.hp;
      incomingThreat += (type === 'fast' ? 1.2 : type === 'sturdy' ? 1.1 : 1.0) * arch.dmg;
    }
  }

  const playerDps = (levelName === 'level3' ? combatProfile.level3Dps : combatProfile.baseDps) * combatSkill;
  const combatOverhead = (incomingHp / Math.max(1, playerDps)) * randRange(rng, 0.25, 0.6);

  const depletion = (constants.FUEL_DEPLETION_RATE + constants.OXYGEN_DEPLETION_RATE) * baselineDuration;
  const resourceStress = clamp((depletion / Math.max(1, 45 * resourceCare)) + (nearestShopTrip / 700), 0, 2.5);
  const combatStress = clamp(incomingThreat / Math.max(1, waves.length * 3), 0, 3.5);
  const deathProb = clamp((combatStress * 0.16) + (resourceStress * 0.14) + ((feature.structureCounts.piratebase || 0) > 15 ? 0.12 : 0), 0.01, 0.65);
  const resetPenalty = deathProb * randRange(rng, 70, 180);

  const total = baselineDuration + combatOverhead + resetPenalty;
  const difficulty = clamp(
    (combatStress * 18) +
    (resourceStress * 19) +
    (deathProb * 58) +
    (feature.structureCounts.piratebase || 0) * 0.55 +
    (waves.length * 1.8),
    5,
    98
  );

  const stages = [
    { name: 'travel-and-orientation', seconds: travelBase + decisionDelay, difficulty: clamp(18 + feature.mapDiagonal / 1500 + routeEfficiency * 8, 8, 70) },
    { name: 'resource-ramp', seconds: gatherTime + refineTax, difficulty: clamp(20 + resourceStress * 22 + (feature.hasCrafting ? 4 : 0), 10, 85) },
    { name: 'combat-pressure', seconds: combatOverhead + basePressureTax, difficulty: clamp(26 + combatStress * 24 + deathProb * 35, 15, 98) },
    { name: 'exit-prep', seconds: nearestShopTrip + craftingTax + resetPenalty, difficulty: clamp(16 + deathProb * 40 + (feature.hasCrafting ? 8 : 0), 8, 95) }
  ];

  return {
    level: levelName,
    totalSeconds: total,
    difficulty,
    deathProbability: deathProb,
    waveCount: waves.length,
    pirateSpawns: waves.reduce((acc, e) => acc + e.pirates.length, 0),
    stages,
    feature
  };
}

function summarizeRuns(runResults, levelNames) {
  const totals = runResults.map((r) => r.totalSeconds).sort((a, b) => a - b);
  const perLevel = {};
  for (const level of levelNames) {
    const values = runResults.map((r) => r.levels.find((x) => x.level === level)).filter(Boolean);
    const levelTimes = values.map((v) => v.totalSeconds).sort((a, b) => a - b);
    const levelDiff = values.map((v) => v.difficulty).sort((a, b) => a - b);
    const stageAgg = {};
    for (const v of values) {
      for (const s of v.stages) {
        if (!stageAgg[s.name]) stageAgg[s.name] = [];
        stageAgg[s.name].push(s);
      }
    }
    const stageSummary = Object.entries(stageAgg).map(([name, arr]) => {
      const d = arr.map((x) => x.difficulty).sort((a, b) => a - b);
      const t = arr.map((x) => x.seconds).sort((a, b) => a - b);
      return {
        name,
        p50Seconds: percentile(t, 0.5),
        p75Seconds: percentile(t, 0.75),
        p50Difficulty: percentile(d, 0.5),
        label: difficultyLabel(percentile(d, 0.5))
      };
    });

    perLevel[level] = {
      p50Seconds: percentile(levelTimes, 0.5),
      p75Seconds: percentile(levelTimes, 0.75),
      p90Seconds: percentile(levelTimes, 0.9),
      p50Difficulty: percentile(levelDiff, 0.5),
      p75Difficulty: percentile(levelDiff, 0.75),
      p90Difficulty: percentile(levelDiff, 0.9),
      stageSummary
    };
  }

  return {
    total: {
      p50Seconds: percentile(totals, 0.5),
      p75Seconds: percentile(totals, 0.75),
      p90Seconds: percentile(totals, 0.9)
    },
    perLevel
  };
}

function buildBottlenecks(summary) {
  const notes = [];
  for (const [level, data] of Object.entries(summary.perLevel)) {
    const hardStage = [...data.stageSummary].sort((a, b) => b.p50Difficulty - a.p50Difficulty)[0];
    if (hardStage && hardStage.p50Difficulty >= 60) {
      notes.push(`${level}: highest pressure in "${hardStage.name}" (${hardStage.label}, P50 ${hardStage.p50Difficulty.toFixed(1)})`);
    }
    if (data.p90Seconds > data.p50Seconds * 1.4) {
      notes.push(`${level}: high run variance (P90 ${fmtSeconds(data.p90Seconds)} vs P50 ${fmtSeconds(data.p50Seconds)})`);
    }
  }
  return notes;
}

function printReport(config, summary, warnings, bottlenecks) {
  console.log('');
  console.log('=== Space Jam Progression Simulation (Levels 1-3) ===');
  console.log(`Runs: ${config.runs}`);
  console.log(`Seed: ${config.seed ?? '(auto)'}`);
  console.log(`Levels: ${config.levels.join(' -> ')}`);
  console.log('');
  console.log('Overall Playthrough Duration');
  console.log(`- P50: ${fmtSeconds(summary.total.p50Seconds)}`);
  console.log(`- P75: ${fmtSeconds(summary.total.p75Seconds)}`);
  console.log(`- P90: ${fmtSeconds(summary.total.p90Seconds)}`);
  console.log('');
  console.log('Per-Level Breakdown');
  for (const level of config.levels) {
    const l = summary.perLevel[level];
    if (!l) continue;
    const diffLabel = difficultyLabel(l.p50Difficulty);
    console.log(`- ${level}: ${fmtSeconds(l.p50Seconds)} (P75 ${fmtSeconds(l.p75Seconds)}, P90 ${fmtSeconds(l.p90Seconds)}), difficulty ${l.p50Difficulty.toFixed(1)}/100 (${diffLabel})`);
    for (const st of l.stageSummary) {
      console.log(`    * ${st.name}: ${fmtSeconds(st.p50Seconds)} - ${st.label} (${st.p50Difficulty.toFixed(1)})`);
    }
  }
  console.log('');
  console.log('Bottlenecks');
  if (!bottlenecks.length) console.log('- None detected above threshold.');
  for (const b of bottlenecks) console.log(`- ${b}`);
  console.log('');
  console.log('Sanity Checks');
  if (!warnings.length) console.log('- No structural warnings detected.');
  for (const w of warnings) console.log(`- ${w}`);
  console.log('');
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const { constants, pirateShared, levels } = await loadInputs(config.levels);
  const knownLevels = new Set([...(await fs.readdir(path.join(repoRoot, 'levels'))).map((f) => f.replace(/\.json$/i, ''))]);
  const warnings = buildValidation(levels, knownLevels, constants);

  const baseSeed = config.seed === null ? Date.now() >>> 0 : config.seed >>> 0;
  const runResults = [];
  for (let i = 0; i < config.runs; i += 1) {
    const rng = mulberry32((baseSeed + i * 1013904223) >>> 0);
    const levelResults = levels.map((lvl) => simulateSingleLevel(lvl, constants, pirateShared, rng));
    runResults.push({
      totalSeconds: levelResults.reduce((acc, lvl) => acc + lvl.totalSeconds, 0),
      levels: levelResults
    });
  }

  const summary = summarizeRuns(runResults, config.levels);
  const bottlenecks = buildBottlenecks(summary);
  printReport(config, summary, warnings, bottlenecks);

  if (config.outJson) {
    const outPath = path.isAbsolute(config.outJson) ? config.outJson : path.join(repoRoot, config.outJson);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    const persistedConfig = {
      runs: config.runs,
      levels: config.levels,
      seed: baseSeed
    };
    const payload = {
      config: persistedConfig,
      summary,
      bottlenecks,
      warnings
    };
    await fs.writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`Wrote JSON report to ${outPath}`);
  }
}

main().catch((err) => {
  console.error(`Simulation failed: ${err.message}`);
  process.exit(1);
});
