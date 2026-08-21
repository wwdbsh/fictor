import { canonicalSerialize, sha256Hex } from "../../domain/forge-runtime/source-binding";
import { FORGE_RUNTIME_FUEL_COST } from "../../domain/forge-runtime";
import type { BurnkinProvisionalRules } from "../../domain/races";
import { RESONANCE_RATE } from "../../domain/balance";
import { freeze } from "../../freeze";

export const STILLKIN_TRACK1_PROVISIONAL_STATUS = "PROVISIONAL_USER_DIRECTION_2026_08_15" as const;
export const T027_LITERAL_CONTRACT_HASH = "dcbd69c50f569efe75e5a0c72550dc4aa6ef76e1f9964199f010b9078792ed99" as const;

export const STILLKIN_TRACK1_PROVISIONAL_CONFIG = freeze({
  configId: "stillkin-track1-provisional-v1",
  contractHash: T027_LITERAL_CONTRACT_HASH,
  status: STILLKIN_TRACK1_PROVISIONAL_STATUS,
  authority: "CONTROLLER_SELECTED_EXECUTION_PACKET_UNDER_LITERAL_NOW_DIRECTION",
  balanceFinal: false,
  startFuel: 4,
  maxPlayerHp: 30,
  workshopFuelCost: FORGE_RUNTIME_FUEL_COST,
  fictorFuelPrice: 1,
  collapse: freeze({ probabilityNumerator: 1, probabilityDenominator: 2, damage: 5, rewardMaterialId: "still_05" }),
  combat: freeze({
    maxEnergy: 3,
    drawCount: 4,
    resonanceRate: RESONANCE_RATE,
    baselineMaterial: freeze({ effectId: "DELAYED_EXPLOSION", cost: 1, power: 10, resonanceAttribute: "STILL" }),
    forgedCard: freeze({ cost: 1, power: 10 }),
    normal: freeze({ hp: 30, attack: 3 }),
    elite: freeze({ hp: 45, releaseAttack: 7 }),
    boss: freeze({ hp: 60, totalStopBlock: 15, attack: 5 }),
  }),
  starterDeck: freeze(["ore_still", "still_01", "still_02", "still_03", "still_04", "still_05"]
    .flatMap((cardId) => Array.from({ length: 5 }, () => cardId))),
  route: freeze([
    freeze({ nodeId: "d1-normal-swarm", depth: 1, kind: "ENCOUNTER", encounterKind: "NORMAL", encounterId: "enemy__still__swarm" }),
    freeze({ nodeId: "d1-cache", depth: 1, kind: "EVENT", eventType: "CACHE" }),
    freeze({ nodeId: "d1-workshop", depth: 1, kind: "EVENT", eventType: "WORKSHOP" }),
    freeze({ nodeId: "d2-elite", depth: 2, kind: "ENCOUNTER", encounterKind: "ELITE", encounterId: "elite__still__burn" }),
    freeze({ nodeId: "d2-collapse", depth: 2, kind: "EVENT", eventType: "COLLAPSE" }),
    freeze({ nodeId: "d2-fictor", depth: 2, kind: "EVENT", eventType: "FICTOR" }),
    freeze({ nodeId: "d2-record", depth: 2, kind: "EVENT", eventType: "RECORD" }),
    freeze({ nodeId: "d3-oddity", depth: 3, kind: "EVENT", eventType: "ODDITY" }),
    freeze({ nodeId: "d3-boss", depth: 3, kind: "ENCOUNTER", encounterKind: "BOSS", encounterId: "the_stilling" }),
  ]),
  offers: freeze({
    normal: freeze([
      freeze({ choiceId: "normal-ore", kind: "MATERIAL", materialId: "ore_still" }),
      freeze({ choiceId: "normal-still-01", kind: "MATERIAL", materialId: "still_01" }),
      freeze({ choiceId: "normal-still-02", kind: "MATERIAL", materialId: "still_02" }),
    ]),
    elite: freeze([
      freeze({ choiceId: "elite-tool-01", kind: "MATERIAL", materialId: "tool_01" }),
      freeze({ choiceId: "elite-odd-02", kind: "MATERIAL", materialId: "odd_02" }),
    ]),
    fictor: freeze([
      freeze({ choiceId: "fictor-still-04", kind: "MATERIAL", materialId: "still_04" }),
      freeze({ choiceId: "fictor-tool-02", kind: "MATERIAL", materialId: "tool_02" }),
      freeze({ choiceId: "fictor-recipe", kind: "RECIPE", recipeId: "ore_burn|ore_still" }),
      freeze({ choiceId: "fictor-skip", kind: "SKIP" }),
    ]),
    recordRecipeId: "ore_still|still_01",
    oddityMaterialId: "odd_06",
    cacheMaterialIds: freeze(["still_03", "still_04"]),
    heartId: "heart__still",
  }),
} as const);

export const STILLKIN_TRACK1_CONFIG_HASH = sha256Hex(canonicalSerialize(STILLKIN_TRACK1_PROVISIONAL_CONFIG));
export const STILLKIN_TRACK1_SCENARIO_ID = "stillkin-track1-literal-v1" as const;
export const STILLKIN_TRACK1_SCENARIO_HASH = sha256Hex(canonicalSerialize({
  scenarioId: STILLKIN_TRACK1_SCENARIO_ID,
  configHash: STILLKIN_TRACK1_CONFIG_HASH,
  route: STILLKIN_TRACK1_PROVISIONAL_CONFIG.route,
  offers: STILLKIN_TRACK1_PROVISIONAL_CONFIG.offers,
}));

export const T033_CONTRACT_HASH = "840ed0dcd20f76647f28e0bfc1f9fbf0ceae55f9f9fac5adb8744dea9c5dfae5" as const;
export const BURNKIN_TRACK1_PROVISIONAL_STATUS = "PROVISIONAL_T033_NOT_FINAL_BALANCE" as const;
export const BURNKIN_TRACK1_RULES: BurnkinProvisionalRules = freeze({
  hpToEnergy: freeze({ hpCost: 1, energyGain: 1, mustRemainAlive: true }),
  resonanceRateMultiplier: 2,
  resonanceBreakSelfDamage: 1,
});

export const BURNKIN_TRACK1_PROVISIONAL_CONFIG = freeze({
  configId: "burnkin-track1-provisional-v1",
  contractHash: T033_CONTRACT_HASH,
  status: BURNKIN_TRACK1_PROVISIONAL_STATUS,
  authority: "T033_CONTROLLER_SELECTED_PROVISIONAL_EXECUTION_PACKET",
  balanceFinal: false,
  rules: BURNKIN_TRACK1_RULES,
  starterDeck: freeze(["ore_burn", "burn_01", "burn_02", "burn_03", "burn_04", "burn_05"]
    .flatMap((cardId) => Array.from({ length: 5 }, () => cardId))),
} as const);

export const BURNKIN_TRACK1_CONFIG_HASH = sha256Hex(canonicalSerialize({
  sharedTrack1ConfigHash: STILLKIN_TRACK1_CONFIG_HASH,
  burnkin: BURNKIN_TRACK1_PROVISIONAL_CONFIG,
}));
export const BURNKIN_TRACK1_SCENARIO_ID = "burnkin-track1-ice-v1" as const;
export const BURNKIN_TRACK1_SCENARIO_HASH = sha256Hex(canonicalSerialize({
  scenarioId: BURNKIN_TRACK1_SCENARIO_ID,
  configHash: BURNKIN_TRACK1_CONFIG_HASH,
  route: STILLKIN_TRACK1_PROVISIONAL_CONFIG.route,
  offers: STILLKIN_TRACK1_PROVISIONAL_CONFIG.offers,
}));

export const T034_CONTRACT_HASH = "41895166ffdda0f6129a2806dee4b36b1e0eba5233a28f654affe2e76642e52e" as const;
export const JOINKIN_TRACK1_PROVISIONAL_STATUS = "PROVISIONAL_T034_NOT_FINAL_BALANCE" as const;
const JOINKIN_MATERIAL_IDS = ["ore_join", "join_01", "join_02", "join_03", "join_04", "join_05"] as const;
const JOINKIN_MATERIAL_STARTER = Array.from({ length: 20 }, (_, index) => JOINKIN_MATERIAL_IDS[index % JOINKIN_MATERIAL_IDS.length]);
export const JOINKIN_TRACK1_PROVISIONAL_CONFIG = freeze({
  configId: "joinkin-track1-provisional-v1",
  contractHash: T034_CONTRACT_HASH,
  status: JOINKIN_TRACK1_PROVISIONAL_STATUS,
  authority: "T034_CONTROLLER_SELECTED_PROVISIONAL_EXECUTION_PACKET",
  balanceFinal: false,
  starterDeck: freeze([
    ...JOINKIN_MATERIAL_STARTER,
    ...Array.from({ length: 10 }, (_, index) => `tool_${String(index + 1).padStart(2, "0")}`),
  ]),
} as const);
export const JOINKIN_TRACK1_CONFIG_HASH = sha256Hex(canonicalSerialize({
  sharedTrack1ConfigHash: STILLKIN_TRACK1_CONFIG_HASH,
  joinkin: JOINKIN_TRACK1_PROVISIONAL_CONFIG,
}));
export const JOINKIN_TRACK1_SCENARIO_ID = "joinkin-track1-ice-v1" as const;
export const JOINKIN_TRACK1_SCENARIO_HASH = sha256Hex(canonicalSerialize({
  scenarioId: JOINKIN_TRACK1_SCENARIO_ID,
  configHash: JOINKIN_TRACK1_CONFIG_HASH,
  route: STILLKIN_TRACK1_PROVISIONAL_CONFIG.route,
  offers: STILLKIN_TRACK1_PROVISIONAL_CONFIG.offers,
}));
