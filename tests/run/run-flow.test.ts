import { describe, expect, it } from "vitest";

import {
  STILLKIN_PRODUCTION_SCENARIO_V1,
  createDormantRunFlowState,
  decodeRunFlowCommand,
  decodeRunScenario,
  reduceRunFlow,
  type EventNodeV1,
  type RunScenarioV1,
} from "../../src/application";
import {
  CANONICAL_MATERIAL_IDS_V1,
  ODDITY_MATERIAL_IDS_V1,
  TOOL_MATERIAL_IDS_V1,
  isCanonicalRecipeId,
  validateRewardOffer,
} from "../../src/domain";

const normal = {
  offerId: "normal-1",
  source: "NORMAL" as const,
  choices: [
    { choiceId: "n1", kind: "MATERIAL" as const, materialId: "ore_still" },
    { choiceId: "n2", kind: "MATERIAL" as const, materialId: "still_01" },
    { choiceId: "n3", kind: "MATERIAL" as const, materialId: "still_02" },
  ],
};

function workshopNode(): EventNodeV1 {
  return {
    nodeId: "workshop",
    kind: "EVENT",
    depth: 2,
    eventType: "WORKSHOP",
    choices: [{ choiceId: "use", effect: { kind: "WORKSHOP_ENTITLEMENT" }, economy: { status: "NOT_REQUIRED" } }],
  };
}

function scenario(event: EventNodeV1 = workshopNode()): RunScenarioV1 {
  return {
    schemaVersion: "run-scenario-v1",
    scenarioId: "approved-test-fixture",
    status: "APPROVED",
    raceId: "Stillkin",
    groundId: "GROUND_STILL",
    pendingReasons: [],
    nodes: [
      { nodeId: "normal", kind: "ENCOUNTER", depth: 1, encounterKind: "NORMAL", encounterId: "enemy__still__swarm", rewardOffer: normal },
      event,
      { nodeId: "boss", kind: "ENCOUNTER", depth: 3, encounterKind: "BOSS", encounterId: "the_stilling", rewardOffer: null },
    ],
  };
}

describe("run-flow boundary and reducer", () => {
  it("fails production configuration closed and rejects aliases/accessors", () => {
    const initial = createDormantRunFlowState();
    expect(reduceRunFlow(initial, { type: "START", scenario: STILLKIN_PRODUCTION_SCENARIO_V1, ownedUniqueToolIds: [] })).toMatchObject({ applied: false, events: [{ reason: "CONFIGURATION_PENDING" }] });
    expect(decodeRunFlowCommand(Object.create({ type: "ENTER_NEXT_NODE" }))).toBeNull();
    expect(decodeRunFlowCommand({ get type() { return "ENTER_NEXT_NODE"; } })).toBeNull();
    const cycle: Record<string, unknown> = { type: "START", scenario: null, ownedUniqueToolIds: [] };
    cycle.scenario = cycle;
    expect(decodeRunFlowCommand(cycle)).toBeNull();
  });

  it("runs depth 1 through depth 3 boss with ordered terminal events", () => {
    let state = reduceRunFlow(createDormantRunFlowState(), { type: "START", scenario: scenario(), ownedUniqueToolIds: [] }).state;
    let revision = state.revision;
    const step = (command: unknown) => {
      const result = reduceRunFlow(state, command);
      expect(result.applied).toBe(true);
      expect(result.state.revision).toBe(revision + 1);
      state = result.state;
      revision = state.revision;
      return result;
    };
    step({ type: "ENTER_NEXT_NODE" });
    step({ type: "RESOLVE_COMBAT", result: "VICTORY", cleanupCompleted: true });
    step({ type: "CHOOSE_REWARD", choiceId: "n1" });
    step({ type: "ENTER_NEXT_NODE" });
    step({ type: "RESOLVE_EVENT", choiceId: "use" });
    expect(state.workshopEntitlements).toBe(1);
    expect(reduceRunFlow(state, { type: "LEAVE_EVENT" })).toMatchObject({ applied: false, events: [{ reason: "WORKSHOP_ENTITLEMENT_UNSETTLED" }] });
    step({ type: "SETTLE_FREE_WORKSHOP", outcome: "SUCCEEDED" });
    step({ type: "LEAVE_EVENT" });
    step({ type: "ENTER_NEXT_NODE" });
    const boss = step({ type: "RESOLVE_COMBAT", result: "VICTORY", cleanupCompleted: true });
    expect(boss.events.map(({ type }) => type)).toEqual(["COMBAT_CLEANED", "ENCOUNTER_WON", "HEART_OWNED", "RUN_WON"]);
    expect(state.phase).toBe("RUN_WON");
  });

  it("keeps failed commands deep-equal and preserves workshop entitlement after failed settlement", () => {
    let state = reduceRunFlow(createDormantRunFlowState(), { type: "START", scenario: scenario(), ownedUniqueToolIds: [] }).state;
    const before = structuredClone(state);
    expect(reduceRunFlow(state, { type: "CHOOSE_REWARD", choiceId: "invented" })).toMatchObject({ applied: false, state: before });
    state = reduceRunFlow(state, { type: "ENTER_NEXT_NODE" }).state;
    state = reduceRunFlow(state, { type: "RESOLVE_COMBAT", result: "DEFEAT", cleanupCompleted: true }).state;
    expect(state.phase).toBe("RUN_LOST");
    state = reduceRunFlow(state, { type: "RESTART", scenario: scenario(), ownedUniqueToolIds: [] }).state;
    state = reduceRunFlow(state, { type: "ENTER_NEXT_NODE" }).state;
    state = reduceRunFlow(state, { type: "RESOLVE_COMBAT", result: "VICTORY", cleanupCompleted: true }).state;
    state = reduceRunFlow(state, { type: "CHOOSE_REWARD", choiceId: "n1" }).state;
    state = reduceRunFlow(state, { type: "ENTER_NEXT_NODE" }).state;
    state = reduceRunFlow(state, { type: "RESOLVE_EVENT", choiceId: "use" }).state;
    const failed = reduceRunFlow(state, { type: "SETTLE_FREE_WORKSHOP", outcome: "FAILED" });
    expect(failed).toMatchObject({ applied: false, state: { workshopEntitlements: 1 } });
    expect(reduceRunFlow(createDormantRunFlowState(), { type: "SETTLE_FREE_WORKSHOP", outcome: "SUCCEEDED" })).toMatchObject({ applied: false, events: [{ reason: "INVALID_PHASE" }] });
  });
});

describe("reward and event policy", () => {
  it("binds all canonical ids while excluding forge and equipment rewards", () => {
    expect(CANONICAL_MATERIAL_IDS_V1).toHaveLength(52);
    expect(CANONICAL_MATERIAL_IDS_V1.every((id) => !id.startsWith("forge__") && !id.startsWith("equipment__"))).toBe(true);
    expect(TOOL_MATERIAL_IDS_V1).toHaveLength(10);
    expect(ODDITY_MATERIAL_IDS_V1).toEqual(["odd_01", "odd_02", "odd_03", "odd_04", "odd_05", "odd_06"]);
    for (let left = 0; left < CANONICAL_MATERIAL_IDS_V1.length; left += 1) {
      for (let right = left + 1; right < CANONICAL_MATERIAL_IDS_V1.length; right += 1) {
        expect(isCanonicalRecipeId(`${CANONICAL_MATERIAL_IDS_V1[left]}|${CANONICAL_MATERIAL_IDS_V1[right]}`)).toBe(true);
      }
    }
    expect(validateRewardOffer(normal).valid).toBe(true);
    expect(validateRewardOffer({ ...normal, choices: normal.choices.slice(0, 2) }).valid).toBe(false);
    expect(validateRewardOffer({ ...normal, choices: [...normal.choices.slice(0, 2), { choiceId: "x", kind: "MATERIAL", materialId: "tool_01" }] }).valid).toBe(false);
  });

  it.each([
    ["CACHE", { kind: "REWARD", offer: { offerId: "cache", source: "CACHE", choices: [{ choiceId: "r1", kind: "MATERIAL", materialId: "still_03" }, { choiceId: "r2", kind: "MATERIAL", materialId: "still_04" }] }, rewardChoiceIds: ["r1", "r2"] }],
    ["WORKSHOP", { kind: "WORKSHOP_ENTITLEMENT" }],
    ["COLLAPSE", { kind: "NONE" }],
    ["FICTOR", { kind: "REWARD", offer: { offerId: "shop", source: "FICTOR", choices: [{ choiceId: "r", kind: "MATERIAL", materialId: "tool_01" }] }, rewardChoiceIds: ["r"] }],
    ["RECORD", { kind: "REWARD", offer: { offerId: "record", source: "RECORD", choices: [{ choiceId: "r", kind: "RECIPE", recipeId: "ore_burn|ore_still" }] }, rewardChoiceIds: ["r"] }],
    ["ODDITY", { kind: "REWARD", offer: { offerId: "oddity", source: "ODDITY", choices: [{ choiceId: "r", kind: "MATERIAL", materialId: "odd_06" }] }, rewardChoiceIds: ["r"] }],
  ] as const)("accepts the prebound %s event fixture", (eventType, effect) => {
    const economy = eventType === "FICTOR" ? { status: "APPROVED" as const, price: 2 } : { status: "NOT_REQUIRED" as const };
    expect(decodeRunScenario(scenario({ nodeId: `event-${eventType}`, kind: "EVENT", depth: 2, eventType, choices: [{ choiceId: "event-choice", effect, economy }] }))).not.toBeNull();
  });
});
