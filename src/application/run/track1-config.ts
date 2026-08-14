import { canonicalSerialize, sha256Hex } from "../../domain/forge-runtime/source-binding";
import { FORGE_RUNTIME_FUEL_COST } from "../../domain/forge-runtime";

export const STILLKIN_TRACK1_PROVISIONAL_STATUS = "PROVISIONAL_USER_DIRECTION_2026_08_15" as const;
export const T027_LITERAL_CONTRACT_HASH = "dcbd69c50f569efe75e5a0c72550dc4aa6ef76e1f9964199f010b9078792ed99" as const;

export const STILLKIN_TRACK1_PROVISIONAL_CONFIG = Object.freeze({
  configId: "stillkin-track1-provisional-v1",
  contractHash: T027_LITERAL_CONTRACT_HASH,
  status: STILLKIN_TRACK1_PROVISIONAL_STATUS,
  authority: "CONTROLLER_SELECTED_EXECUTION_PACKET_UNDER_LITERAL_NOW_DIRECTION",
  balanceFinal: false,
  startFuel: 4,
  maxPlayerHp: 30,
  workshopFuelCost: FORGE_RUNTIME_FUEL_COST,
  fictorFuelPrice: 1,
  collapse: Object.freeze({ probabilityNumerator: 1, probabilityDenominator: 2, damage: 5, rewardMaterialId: "still_05" }),
  combat: Object.freeze({
    maxEnergy: 3,
    drawCount: 4,
    resonanceRate: 0.1,
    genericMaterialCost: 1,
    genericMaterialPower: 10,
    normal: Object.freeze({ hp: 30, attack: 3 }),
    elite: Object.freeze({ hp: 45, releaseAttack: 7 }),
    boss: Object.freeze({ hp: 60, totalStopBlock: 15, attack: 5 }),
  }),
  starterDeck: Object.freeze(["ore_still", "still_01", "still_02", "still_03", "still_04", "still_05"]
    .flatMap((cardId) => Array.from({ length: 5 }, () => cardId))),
  route: Object.freeze([
    Object.freeze({ nodeId: "d1-normal-swarm", depth: 1, kind: "ENCOUNTER", encounterKind: "NORMAL", encounterId: "enemy__still__swarm" }),
    Object.freeze({ nodeId: "d1-cache", depth: 1, kind: "EVENT", eventType: "CACHE" }),
    Object.freeze({ nodeId: "d1-workshop", depth: 1, kind: "EVENT", eventType: "WORKSHOP" }),
    Object.freeze({ nodeId: "d2-elite", depth: 2, kind: "ENCOUNTER", encounterKind: "ELITE", encounterId: "elite__still__burn" }),
    Object.freeze({ nodeId: "d2-collapse", depth: 2, kind: "EVENT", eventType: "COLLAPSE" }),
    Object.freeze({ nodeId: "d2-fictor", depth: 2, kind: "EVENT", eventType: "FICTOR" }),
    Object.freeze({ nodeId: "d2-record", depth: 2, kind: "EVENT", eventType: "RECORD" }),
    Object.freeze({ nodeId: "d3-oddity", depth: 3, kind: "EVENT", eventType: "ODDITY" }),
    Object.freeze({ nodeId: "d3-boss", depth: 3, kind: "ENCOUNTER", encounterKind: "BOSS", encounterId: "the_stilling" }),
  ]),
  offers: Object.freeze({
    normal: Object.freeze([
      Object.freeze({ choiceId: "normal-ore", kind: "MATERIAL", materialId: "ore_still" }),
      Object.freeze({ choiceId: "normal-still-01", kind: "MATERIAL", materialId: "still_01" }),
      Object.freeze({ choiceId: "normal-still-02", kind: "MATERIAL", materialId: "still_02" }),
    ]),
    elite: Object.freeze([
      Object.freeze({ choiceId: "elite-tool-01", kind: "MATERIAL", materialId: "tool_01" }),
      Object.freeze({ choiceId: "elite-odd-02", kind: "MATERIAL", materialId: "odd_02" }),
    ]),
    fictor: Object.freeze([
      Object.freeze({ choiceId: "fictor-still-04", kind: "MATERIAL", materialId: "still_04" }),
      Object.freeze({ choiceId: "fictor-tool-02", kind: "MATERIAL", materialId: "tool_02" }),
      Object.freeze({ choiceId: "fictor-recipe", kind: "RECIPE", recipeId: "ore_burn|ore_still" }),
    ]),
    recordRecipeId: "ore_still|still_01",
    oddityMaterialId: "odd_06",
    cacheMaterialIds: Object.freeze(["still_03", "still_04"]),
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
