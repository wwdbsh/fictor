export const COMBAT_EFFECT_IDS = [
  "DELAYED_EXPLOSION",
  "SLOW_TARGET",
  "EXTEND_DOT",
  "PERMANENT_BLOCK",
  "AMPLIFY_STILL",
  "BURST_AOE",
  "EXILE_AND_DAMAGE",
  "DEBUFF_TO_DAMAGE",
  "AMPLIFY_BURN",
  "SPREAD_DEBUFF",
  "EXILE",
  "AMPLIFY_SCATTER",
  "RESET_STATES",
  "AMPLIFY_ROT",
  "AMPLIFY_WASH",
  "MASSIVE_BLOCK",
  "MAX_DAMAGE",
  "MAX_EVASION",
  "HEAVY_DOT",
  "CLEAR_ALL_STATES",
  "DOUBLE_FORGE",
] as const;

export type CombatEffectId = (typeof COMBAT_EFFECT_IDS)[number];

export const COMBAT_SCHEMA_VERSION = "combat-state-v2" as const;
export const COMBAT_ENGINE_VERSION = "combat-engine-v2" as const;
export const COMBAT_PRNG_VERSION = "fictor-splitmix32-fisher-yates-v2" as const;
export const COMBAT_REPLAY_SCHEMA_VERSION = "combat-replay-v2" as const;
export const COMBAT_REPLAY_HASH_ALGORITHM = "fnv1a32-v1" as const;
