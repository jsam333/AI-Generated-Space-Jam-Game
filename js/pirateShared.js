export const PIRATE_TYPE_KEYS = ['normal', 'sturdy', 'fast'];
export const DEFAULT_PIRATE_TYPE_PERCENTAGES = Object.freeze({ normal: 100, sturdy: 0, fast: 0 });

export const PIRATE_ARCHETYPE_KEYS = ['standard', 'shotgun', 'slowing', 'breaching', 'drone'];

export const DEFAULT_SPAWN_SETTINGS = Object.freeze({
  initialDelay: 120,
  waveIntervalMin: 60,
  waveIntervalMax: 100,
  waveSizeMin: 2,
  waveSizeMax: 4
});

export const DEFAULT_SPAWN_TIER_SETTINGS = Object.freeze({
  startTime: 300,
  waveIntervalMin: 45,
  waveIntervalMax: 80,
  waveSizeMin: 3,
  waveSizeMax: 6
});

export function normalizePirateBaseTier(tier) {
  const n = Number(tier);
  if (!Number.isFinite(n)) return 2;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export function getPirateBaseTierScale(tier) {
  return 0.6 + (normalizePirateBaseTier(tier) * 0.2);
}

export function normalizePirateType(type) {
  return PIRATE_TYPE_KEYS.includes(type) ? type : 'normal';
}

export function normalizePirateArchetype(archetype) {
  return PIRATE_ARCHETYPE_KEYS.includes(archetype) ? archetype : 'standard';
}

export function normalizePirateTypePercentages(percentages) {
  const out = { normal: 0, sturdy: 0, fast: 0 };
  for (const key of PIRATE_TYPE_KEYS) {
    const value = Number(percentages?.[key]);
    out[key] = Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  const total = out.normal + out.sturdy + out.fast;
  if (total <= 0) return { ...DEFAULT_PIRATE_TYPE_PERCENTAGES };
  return out;
}

export function ensureSpawnSettingsDefaults(spawnSettings) {
  const s = spawnSettings || {};
  if (!Array.isArray(s.tiers)) s.tiers = [];

  s.initialDelay = Number.isFinite(Number(s.initialDelay))
    ? Number(s.initialDelay)
    : DEFAULT_SPAWN_SETTINGS.initialDelay;
  s.waveIntervalMin = Number.isFinite(Number(s.waveIntervalMin))
    ? Number(s.waveIntervalMin)
    : DEFAULT_SPAWN_SETTINGS.waveIntervalMin;
  s.waveIntervalMax = Number.isFinite(Number(s.waveIntervalMax))
    ? Number(s.waveIntervalMax)
    : DEFAULT_SPAWN_SETTINGS.waveIntervalMax;
  s.waveSizeMin = Number.isFinite(Number(s.waveSizeMin))
    ? Number(s.waveSizeMin)
    : DEFAULT_SPAWN_SETTINGS.waveSizeMin;
  s.waveSizeMax = Number.isFinite(Number(s.waveSizeMax))
    ? Number(s.waveSizeMax)
    : DEFAULT_SPAWN_SETTINGS.waveSizeMax;
  s.pirateTypePercentages = normalizePirateTypePercentages(s.pirateTypePercentages);

  for (const tier of s.tiers) {
    tier.startTime = Number.isFinite(Number(tier.startTime))
      ? Number(tier.startTime)
      : DEFAULT_SPAWN_TIER_SETTINGS.startTime;
    tier.waveIntervalMin = Number.isFinite(Number(tier.waveIntervalMin))
      ? Number(tier.waveIntervalMin)
      : DEFAULT_SPAWN_TIER_SETTINGS.waveIntervalMin;
    tier.waveIntervalMax = Number.isFinite(Number(tier.waveIntervalMax))
      ? Number(tier.waveIntervalMax)
      : DEFAULT_SPAWN_TIER_SETTINGS.waveIntervalMax;
    tier.waveSizeMin = Number.isFinite(Number(tier.waveSizeMin))
      ? Number(tier.waveSizeMin)
      : DEFAULT_SPAWN_TIER_SETTINGS.waveSizeMin;
    tier.waveSizeMax = Number.isFinite(Number(tier.waveSizeMax))
      ? Number(tier.waveSizeMax)
      : DEFAULT_SPAWN_TIER_SETTINGS.waveSizeMax;
    tier.pirateTypePercentages = normalizePirateTypePercentages(tier.pirateTypePercentages);
  }
  return s;
}

export function ensurePirateBaseSpawnDefaults(base) {
  base.pirateArchetype = normalizePirateArchetype(base.pirateArchetype);
  base.defenseTypePercentages = normalizePirateTypePercentages(base.defenseTypePercentages);
  base.waveSpawnTypePercentages = normalizePirateTypePercentages(base.waveSpawnTypePercentages);
  base.waveSpawnCount = Math.max(1, Math.round(Number(base.waveSpawnCount) || 4));
}
