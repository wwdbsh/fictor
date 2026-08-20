import { describe, expect, it } from "vitest";

import materialsSource from "../../src/data/source/materials.json";
import lawsSource from "../../src/data/source/laws.json";
import resultClassesSource from "../../src/data/source/resultClasses.json";
import {
  createStillkinTrack1Controller,
  STILLKIN_TRACK1_CONFIG_HASH,
  STILLKIN_TRACK1_PROVISIONAL_CONFIG,
  type StillkinTrack1Controller,
  type StillkinTrack1Snapshot,
} from "../../src/application";
import {
  FORGE_RUNTIME_RESOLVER_VERSION,
  FORGE_RUNTIME_SOURCE_HASH,
  FORGE_RUNTIME_FUEL_COST,
  resolveForgeCard,
  type ForgeMaterial,
  type ForgeResolverContextV1,
  type ForgeResultClass,
} from "../../src/domain";
import { canonicalSerialize, sha256Hex } from "../../src/domain/forge-runtime/source-binding";
import { FICTOR_SAVE_KEY, FICTOR_SAVE_V2_KEY, type StorageLike } from "../../src/persistence";

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  failSet = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failSet) throw new Error("quota"); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function context(): ForgeResolverContextV1 {
  return {
    resolverVersion: FORGE_RUNTIME_RESOLVER_VERSION,
    sourceHash: FORGE_RUNTIME_SOURCE_HASH,
    materials: materialsSource.map((item) => ({
      id: item.id, attribute: item.attribute, modifier_form: item.modifier_form, noun_form: item.noun_form,
      representation: item.representation, category: item.category, balance_status: item.balance_status,
      potency: item.potency, cost_base: item.cost_base, ...(item.category === "TOOL" ? { tool_domain: item.tool_domain } : {}),
    })) as ForgeMaterial[],
    inputs: {
      laws: lawsSource.map((item) => ({
        pair: item.pair, result_class: item.result_class, actor: item.actor, combat_effect: item.combat_effect,
        balance_status: item.balance_status, power_coefficient: item.power_coefficient,
        ...("drawback" in item ? { drawback: item.drawback } : {}),
      })) as unknown as ForgeResolverContextV1["inputs"]["laws"],
      resultClasses: resultClassesSource.map((item) => ({
        id: item.id, family: item.family, density: item.density, density_status: item.density_status,
        combat_effect: item.combat_effect,
        ...("equipment_interactions" in item ? { equipment_interactions: item.equipment_interactions } : {}),
      })) as ForgeResultClass[],
    },
  };
}

function controller(storage = new MemoryStorage()) {
  return { storage, value: createStillkinTrack1Controller({ storage, resolverContext: context(), generationFactory: () => "track1-generation" }) };
}

function base(snapshot: StillkinTrack1Snapshot) {
  return { expectedRevision: snapshot.flow.revision, runId: snapshot.flow.runId };
}

function enter(value: StillkinTrack1Controller): StillkinTrack1Snapshot {
  const before = value.snapshot();
  const result = value.dispatch({ type: "ENTER_NEXT_NODE", ...base(before) });
  expect(result.applied).toBe(true);
  return result.snapshot;
}

function nextCombatCommand(snapshot: StillkinTrack1Snapshot) {
  const binding = snapshot.flow.combatBinding!;
  const active = snapshot.runtime.run.activeCombat!;
  const instanceId = active.state.zones.hand[0];
  const instance = active.state.instances.find((item) => item.instanceId === instanceId);
  const card = active.state.cards.find((item) => item.cardId === instance?.cardId);
  const program = active.state.programs.find((item) => item.effectId === card?.effectId);
  return active.state.phase === "TURN_READY"
    ? { type: "START_TURN" as const }
    : active.state.player.energy > 0 && active.state.zones.hand.length > 0
      ? { type: "PLAY_CARD" as const, instanceId, target: program?.targetRule.kind === "NONE" ? null : { kind: "ENEMY" as const, enemyId: binding.encounterId } }
      : { type: "END_TURN" as const };
}

function winCombat(value: StillkinTrack1Controller): StillkinTrack1Snapshot {
  let snapshot = value.snapshot();
  let steps = 0;
  while (snapshot.flow.phase === "IN_COMBAT") {
    expect(steps++).toBeLessThan(1_000);
    const binding = snapshot.flow.combatBinding!;
    const combatCommand = nextCombatCommand(snapshot);
    const result = value.dispatch({ type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...binding, command: combatCommand });
    expect(result.applied).toBe(true);
    snapshot = result.snapshot;
  }
  return snapshot;
}

function resolveSimpleEvent(value: StillkinTrack1Controller, choiceId: string) {
  let snapshot = enter(value);
  const invalid = value.dispatch({ type: "RESOLVE_EVENT", ...base(snapshot), choiceId: "not-bound" });
  expect(invalid).toMatchObject({ applied: false, reason: "CHOICE_NOT_BOUND" });
  expect(invalid.snapshot).toEqual(snapshot);
  const result = value.dispatch({ type: "RESOLVE_EVENT", ...base(snapshot), choiceId });
  expect(result.applied).toBe(true);
  snapshot = result.snapshot;
  if (snapshot.flow.phase === "EVENT_RESOLVED") {
    const left = value.dispatch({ type: "LEAVE_EVENT", ...base(snapshot) });
    expect(left.applied).toBe(true);
    snapshot = left.snapshot;
  }
  return snapshot;
}

describe("Stillkin literal Track-1 controller", () => {
  it("binds every provisional packet field to executable authority", () => {
    expect(STILLKIN_TRACK1_PROVISIONAL_CONFIG).toMatchObject({
      status: "PROVISIONAL_USER_DIRECTION_2026_08_15",
      authority: "CONTROLLER_SELECTED_EXECUTION_PACKET_UNDER_LITERAL_NOW_DIRECTION",
      balanceFinal: false,
      workshopFuelCost: FORGE_RUNTIME_FUEL_COST,
      combat: {
        baselineMaterial: { effectId: "DELAYED_EXPLOSION", cost: 1, power: 10, resonanceAttribute: "STILL" },
        forgedCard: { cost: 1, power: 10 },
      },
    });
    expect("cacheCount" in STILLKIN_TRACK1_PROVISIONAL_CONFIG).toBe(false);
    expect(STILLKIN_TRACK1_PROVISIONAL_CONFIG.offers.cacheMaterialIds).toHaveLength(2);
    expect(STILLKIN_TRACK1_PROVISIONAL_CONFIG.offers.fictor.at(-1)).toEqual({ choiceId: "fictor-skip", kind: "SKIP" });
    expect(sha256Hex(canonicalSerialize(STILLKIN_TRACK1_PROVISIONAL_CONFIG))).toBe(STILLKIN_TRACK1_CONFIG_HASH);
  });

  it("represents an instant forge in hand, reloads it, plays it, and cleans it atomically", () => {
    const { storage, value } = controller();
    let snapshot = enter(value);
    const binding = snapshot.flow.combatBinding!;
    snapshot = value.dispatch({ type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...binding, command: { type: "START_TURN" } }).snapshot;
    let pair: [NonNullable<(typeof snapshot.runtime.run.activeCombat)>["state"]["instances"][number], NonNullable<(typeof snapshot.runtime.run.activeCombat)>["state"]["instances"][number]] | null = null;
    for (let turn = 0; turn < 8 && pair === null; turn += 1) {
      const active = snapshot.runtime.run.activeCombat!;
      const hand = active.state.zones.hand.map((instanceId) => active.state.instances.find((item) => item.instanceId === instanceId)!);
      for (let left = 0; left < hand.length && pair === null; left += 1) {
        const right = hand.slice(left + 1).find((item) => item.cardId !== hand[left].cardId);
        if (right) pair = [hand[left], right];
      }
      if (pair === null) {
        snapshot = value.dispatch({ type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...binding, command: { type: "END_TURN" } }).snapshot;
        snapshot = value.dispatch({ type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...binding, command: { type: "START_TURN" } }).snapshot;
      }
    }
    expect(pair).not.toBeNull();
    const [first, second] = pair!;
    const resolver = context();
    const expected = resolveForgeCard(
      resolver.materials.find(({ id }) => id === first.cardId)!,
      resolver.materials.find(({ id }) => id === second.cardId)!,
      resolver.inputs,
    );

    const beforeRejected = snapshot;
    expect(value.dispatch({ type: "FORGE_INSTANT", expectedRevision: snapshot.flow.revision, ...binding, materialInstanceIds: [first.instanceId, first.instanceId] }))
      .toMatchObject({ applied: false, reason: "RUNTIME_REJECTED", snapshot: beforeRejected });
    const forged = value.dispatch({ type: "FORGE_INSTANT", expectedRevision: snapshot.flow.revision, ...binding, materialInstanceIds: [first.instanceId, second.instanceId] });
    expect(forged.applied).toBe(true);
    const created = forged.events.find((event) => event.type === "FORGE_RESULT_CREATED") as Extract<(typeof forged.events)[number], { type: "FORGE_RESULT_CREATED" }>;
    expect(created).toMatchObject({ mode: "INSTANT", cardId: expected.card_id, recipeId: expected.recipe_id, location: "HAND" });
    const forgedActive = forged.snapshot.runtime.run.activeCombat!;
    expect(forgedActive.ephemeralResults).toContainEqual({
      instanceId: created.instanceId,
      cardId: expected.card_id,
      recipeId: expected.recipe_id,
      location: "HAND",
      provenance: { kind: "PAIR", materialInstanceIds: [first.instanceId, second.instanceId] },
    });
    expect(forgedActive.state.instances).toContainEqual({ instanceId: created.instanceId, cardId: expected.card_id });
    expect(forgedActive.state.zones.hand).toContain(created.instanceId);
    expect(forgedActive.state.cards.find(({ cardId }) => cardId === expected.card_id)).toMatchObject({
      effectId: expected.combat_effect,
      resonanceAttribute: expected.effective_attributes[0],
      cost: 1,
      power: 10,
    });
    expect(forgedActive.state.instances.some(({ instanceId }) => [first.instanceId, second.instanceId].includes(instanceId))).toBe(false);
    expect(value.dispatch({ type: "FORGE_INSTANT", expectedRevision: snapshot.flow.revision, ...binding, materialInstanceIds: [first.instanceId, second.instanceId] }))
      .toMatchObject({ applied: false, reason: "STALE_REVISION" });

    const reloaded = createStillkinTrack1Controller({ storage, resolverContext: context(), generationFactory: () => "unused" });
    expect(reloaded.load()).toMatchObject({ source: "SAVED", snapshot: { flow: { phase: "IN_COMBAT" } } });
    const bytes = storage.values.get(FICTOR_SAVE_V2_KEY)!;
    const mutations: Array<(envelope: any) => void> = [
      (envelope) => { envelope.runtime.run.activeCombat.ephemeralResults[0].location = "DISCARD"; },
      (envelope) => { envelope.runtime.run.activeCombat.state.instances.find((item: any) => item.instanceId === created.instanceId).cardId = "ore_still"; },
      (envelope) => { envelope.runtime.run.activeCombat.state.cards.find((item: any) => item.cardId === expected.card_id).effectId = "DELAYED_EXPLOSION"; },
      (envelope) => { envelope.runtime.run.activeCombat.state.zones.discard.push(created.instanceId); },
      (envelope) => {
        const active = envelope.runtime.run.activeCombat;
        const ledger = active.ephemeralResults.find((item: any) => item.instanceId === created.instanceId);
        if (!envelope.profile.discoveredRecipeIds.includes("ore_burn|ore_still")) {
          envelope.profile.discoveredRecipeIds.push("ore_burn|ore_still");
          envelope.profile.discoveredRecipeIds.sort();
        }
        ledger.recipeId = "ore_burn|ore_still";
        ledger.cardId = "forge__ore_burn__ore_still";
        active.state.instances.find((item: any) => item.instanceId === created.instanceId).cardId = "forge__ore_burn__ore_still";
        const card = active.state.cards.find((item: any) => item.cardId === expected.card_id);
        card.cardId = "forge__ore_burn__ore_still";
        card.effectId = "DELAYED_EXPLOSION";
        card.resonanceAttribute = "STILL";
        active.state.programs = active.state.programs.filter((item: any) => item.effectId !== expected.combat_effect);
      },
    ];
    for (const mutate of mutations) {
      const tamperedStorage = new MemoryStorage();
      const envelope = JSON.parse(bytes);
      mutate(envelope);
      tamperedStorage.values.set(FICTOR_SAVE_V2_KEY, JSON.stringify(envelope));
      const tampered = createStillkinTrack1Controller({ storage: tamperedStorage, resolverContext: context(), generationFactory: () => "unused" });
      expect(tampered.load()).toMatchObject({ source: "SAFE_INITIALIZED", snapshot: { persistence: { writeBlocked: true, issues: ["INVALID_RUN"] } } });
    }

    snapshot = forged.snapshot;
    const resultProgram = forgedActive.state.programs.find(({ effectId }) => effectId === expected.combat_effect)!;
    const played = value.dispatch({
      type: "APPLY_COMBAT",
      expectedRevision: snapshot.flow.revision,
      ...binding,
      command: { type: "PLAY_CARD", instanceId: created.instanceId, target: resultProgram.targetRule.kind === "NONE" ? null : { kind: "ENEMY", enemyId: binding.encounterId } },
    });
    expect(played.applied).toBe(true);
    expect(played.snapshot.runtime.run.activeCombat!.state.zones.discard).toContain(created.instanceId);
    expect(played.snapshot.runtime.run.activeCombat!.ephemeralResults[0].location).toBe("DISCARD");

    snapshot = played.snapshot;
    let terminalEvents: typeof played.events = [];
    while (snapshot.flow.phase === "IN_COMBAT") {
      const result = value.dispatch({ type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...snapshot.flow.combatBinding!, command: nextCombatCommand(snapshot) });
      expect(result.applied).toBe(true);
      snapshot = result.snapshot;
      if (snapshot.flow.phase !== "IN_COMBAT") terminalEvents = result.events;
    }
    expect(terminalEvents).toContainEqual({
      type: "INSTANT_FORGE_CLEANED",
      restoredInstanceIds: [first.instanceId, second.instanceId],
      removedEphemeralInstanceIds: [created.instanceId],
    });
    expect(snapshot.runtime.run.activeCombat).toBeNull();
    expect(snapshot.runtime.run.ownedInstances.filter(({ instanceId }) => [first.instanceId, second.instanceId].includes(instanceId))).toHaveLength(2);
    expect(snapshot.runtime.run.deck.filter((instanceId) => [first.instanceId, second.instanceId].includes(instanceId))).toHaveLength(2);
    expect(snapshot.runtime.run.ownedInstances.some(({ instanceId }) => instanceId === created.instanceId)).toBe(false);
  });

  it("keeps an instant equipment result as a non-playable EQUIPMENT overlay through cleanup", () => {
    const original = controller();
    let snapshot = enter(original.value);
    snapshot = winCombat(original.value);
    snapshot = original.value.dispatch({ type: "CHOOSE_REWARD", ...base(snapshot), choiceId: "normal-ore" }).snapshot;
    snapshot = resolveSimpleEvent(original.value, "take-cache");
    snapshot = enter(original.value);
    snapshot = original.value.dispatch({ type: "RESOLVE_EVENT", ...base(snapshot), choiceId: "use-workshop" }).snapshot;
    const freeLeft = snapshot.runtime.run.ownedInstances.find(({ cardId }) => cardId === "ore_still")!;
    const freeRight = snapshot.runtime.run.ownedInstances.find(({ cardId }) => cardId === "still_01")!;
    snapshot = original.value.dispatch({ type: "USE_FREE_WORKSHOP", ...base(snapshot), materialInstanceIds: [freeLeft.instanceId, freeRight.instanceId] }).snapshot;
    snapshot = original.value.dispatch({ type: "LEAVE_EVENT", ...base(snapshot) }).snapshot;
    snapshot = winCombatAfterEnter(original.value);
    snapshot = original.value.dispatch({ type: "CHOOSE_REWARD", ...base(snapshot), choiceId: "elite-tool-01" }).snapshot;
    snapshot = resolveSimpleEvent(original.value, "risk-collapse");
    snapshot = enter(original.value);
    snapshot = original.value.dispatch({ type: "RESOLVE_EVENT", ...base(snapshot), choiceId: "fictor-tool-02" }).snapshot;
    snapshot = original.value.dispatch({ type: "LEAVE_EVENT", ...base(snapshot) }).snapshot;
    snapshot = resolveSimpleEvent(original.value, "read-record");
    resolveSimpleEvent(original.value, "take-oddity");

    const betweenBossBytes = original.storage.values.get(FICTOR_SAVE_V2_KEY)!;
    let selected: { storage: MemoryStorage; value: StillkinTrack1Controller; snapshot: StillkinTrack1Snapshot; tools: [string, string] } | null = null;
    const baseEnvelope = JSON.parse(betweenBossBytes);
    const deck = baseEnvelope.runtime.run.deck as string[];
    for (let rotation = 0; rotation < deck.length && selected === null; rotation += 1) {
      const storage = new MemoryStorage();
      const envelope = JSON.parse(betweenBossBytes);
      envelope.runtime.run.deck = [...deck.slice(rotation), ...deck.slice(0, rotation)];
      storage.values.set(FICTOR_SAVE_V2_KEY, JSON.stringify(envelope));
      const value = createStillkinTrack1Controller({ storage, resolverContext: context(), generationFactory: () => "unused" });
      let candidate = value.load().snapshot;
      candidate = enter(value);
      candidate = value.dispatch({ type: "APPLY_COMBAT", expectedRevision: candidate.flow.revision, ...candidate.flow.combatBinding!, command: { type: "START_TURN" } }).snapshot;
      const active = candidate.runtime.run.activeCombat!;
      const toolInstances = active.state.zones.hand
        .map((instanceId) => active.state.instances.find((item) => item.instanceId === instanceId)!)
        .filter(({ cardId }) => cardId === "tool_01" || cardId === "tool_02");
      if (new Set(toolInstances.map(({ cardId }) => cardId)).size === 2) {
        selected = { storage, value, snapshot: candidate, tools: [toolInstances[0].instanceId, toolInstances[1].instanceId] };
      }
    }
    expect(selected).not.toBeNull();
    const chosen = selected!;
    const binding = chosen.snapshot.flow.combatBinding!;
    const forged = chosen.value.dispatch({
      type: "FORGE_INSTANT",
      expectedRevision: chosen.snapshot.flow.revision,
      ...binding,
      materialInstanceIds: chosen.tools,
    });
    expect(forged.applied).toBe(true);
    const created = forged.events.find((event) => event.type === "FORGE_RESULT_CREATED") as Extract<(typeof forged.events)[number], { type: "FORGE_RESULT_CREATED" }>;
    expect(created).toMatchObject({ mode: "INSTANT", cardId: "forge__tool_01__tool_02", location: "EQUIPMENT" });
    const active = forged.snapshot.runtime.run.activeCombat!;
    expect(active.ephemeralResults).toContainEqual(expect.objectContaining({ instanceId: created.instanceId, location: "EQUIPMENT" }));
    expect(active.state.instances.some(({ instanceId }) => instanceId === created.instanceId)).toBe(false);
    expect(Object.values(active.state.zones).flat()).not.toContain(created.instanceId);
    expect(active.state.cards.some(({ cardId }) => cardId === created.cardId)).toBe(false);
    const reloaded = createStillkinTrack1Controller({ storage: chosen.storage, resolverContext: context(), generationFactory: () => "unused" });
    expect(reloaded.load()).toMatchObject({ source: "SAVED", snapshot: { flow: { phase: "IN_COMBAT" } } });

    snapshot = forged.snapshot;
    let terminalEvents: typeof forged.events = [];
    while (snapshot.flow.phase === "IN_COMBAT") {
      const result = chosen.value.dispatch({ type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...snapshot.flow.combatBinding!, command: nextCombatCommand(snapshot) });
      expect(result.applied).toBe(true);
      snapshot = result.snapshot;
      if (snapshot.flow.phase !== "IN_COMBAT") terminalEvents = result.events;
    }
    expect(terminalEvents).toContainEqual(expect.objectContaining({ type: "INSTANT_FORGE_CLEANED", removedEphemeralInstanceIds: [created.instanceId] }));
    expect(snapshot.runtime.run.activeCombat).toBeNull();
    expect(snapshot.runtime.run.ownedInstances.filter(({ cardId }) => cardId === "tool_01" || cardId === "tool_02")).toHaveLength(2);
  });

  it("owns combat authority, completes the literal route, and preserves paid/free forge economics", () => {
    const { storage, value } = controller();
    let snapshot = value.load().snapshot;
    expect(snapshot.runtime.run).toMatchObject({ fuel: 4, nextInstanceSequence: 30 });
    expect(snapshot.runtime.run.deck).toHaveLength(30);

    snapshot = enter(value);
    const staleBinding = { ...snapshot.flow.combatBinding!, encounterNonce: snapshot.flow.combatBinding!.encounterNonce + 1 };
    expect(value.dispatch({ type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...staleBinding, command: { type: "START_TURN" } })).toMatchObject({ applied: false, reason: "STALE_ENCOUNTER_BINDING" });
    snapshot = winCombat(value);
    expect(snapshot.runtime.run.activeCombat).toBeNull();
    expect(snapshot.rewardChoices).toEqual([
      { choiceId: "normal-ore", kind: "MATERIAL", materialId: "ore_still" },
      { choiceId: "normal-still-01", kind: "MATERIAL", materialId: "still_01" },
      { choiceId: "normal-still-02", kind: "MATERIAL", materialId: "still_02" },
    ]);
    snapshot = value.dispatch({ type: "CHOOSE_REWARD", ...base(snapshot), choiceId: "normal-ore" }).snapshot;

    snapshot = enter(value);
    const cacheExhaustionStorage = new MemoryStorage();
    const cacheEnvelope = JSON.parse(storage.values.get(FICTOR_SAVE_V2_KEY)!);
    cacheEnvelope.runtime.run.nextInstanceSequence = Number.MAX_SAFE_INTEGER - 1;
    cacheExhaustionStorage.values.set(FICTOR_SAVE_V2_KEY, JSON.stringify(cacheEnvelope));
    const cacheExhaustion = createStillkinTrack1Controller({ storage: cacheExhaustionStorage, resolverContext: context(), generationFactory: () => "unused" });
    const beforeCacheFailure = cacheExhaustion.load().snapshot;
    const failedCache = cacheExhaustion.dispatch({ type: "RESOLVE_EVENT", ...base(beforeCacheFailure), choiceId: "take-cache" });
    expect(failedCache).toMatchObject({ applied: false, reason: "CACHE_GRANT_FAILED" });
    expect(failedCache.snapshot).toEqual(beforeCacheFailure);
    snapshot = value.dispatch({ type: "RESOLVE_EVENT", ...base(snapshot), choiceId: "take-cache" }).snapshot;
    snapshot = value.dispatch({ type: "LEAVE_EVENT", ...base(snapshot) }).snapshot;
    snapshot = enter(value);
    snapshot = value.dispatch({ type: "RESOLVE_EVENT", ...base(snapshot), choiceId: "use-workshop" }).snapshot;
    const fuelBeforeFree = snapshot.runtime.run.fuel;
    const duplicateDefinitions = snapshot.runtime.run.ownedInstances.filter((item) => item.cardId === "ore_still").slice(0, 2);
    const beforeFailedFree = snapshot;
    const failedFree = value.dispatch({ type: "USE_FREE_WORKSHOP", ...base(snapshot), materialInstanceIds: [duplicateDefinitions[0].instanceId, duplicateDefinitions[1].instanceId] });
    expect(failedFree).toMatchObject({ applied: false, reason: "RUNTIME_REJECTED" });
    expect(failedFree.snapshot).toEqual(beforeFailedFree);
    expect(failedFree.snapshot.flow.workshopEntitlementNodeId).toBe("d1-workshop");
    expect(failedFree.snapshot.runtime.run.fuel).toBe(fuelBeforeFree);
    const ore = snapshot.runtime.run.ownedInstances.find((item) => item.cardId === "ore_still")!;
    const one = snapshot.runtime.run.ownedInstances.find((item) => item.cardId === "still_01")!;
    const free = value.dispatch({ type: "USE_FREE_WORKSHOP", ...base(snapshot), materialInstanceIds: [ore.instanceId, one.instanceId] });
    expect(free.applied).toBe(true);
    expect(free.snapshot.runtime.run.fuel).toBe(fuelBeforeFree);
    expect(free.events.some((event) => event.type === "FREE_WORKSHOP_USED")).toBe(true);
    expect(free.events.some((event) => event.type === "FUEL_SPENT")).toBe(false);
    snapshot = value.dispatch({ type: "LEAVE_EVENT", ...base(free.snapshot) }).snapshot;

    const two = snapshot.runtime.run.ownedInstances.find((item) => item.cardId === "still_02")!;
    const three = snapshot.runtime.run.ownedInstances.find((item) => item.cardId === "still_03")!;
    const paid = value.dispatch({ type: "FORGE_WORKSHOP", ...base(snapshot), materialInstanceIds: [two.instanceId, three.instanceId] });
    expect(paid.applied).toBe(true);
    expect(paid.snapshot.runtime.run.fuel).toBe(fuelBeforeFree - 1);
    expect(paid.events.filter((event) => event.type === "FUEL_SPENT")).toHaveLength(1);

    snapshot = enter(value);
    const massive = snapshot.runtime.run.activeCombat!.state.cards.find((card) => card.cardId === "forge__ore_still__still_01");
    expect(massive).toMatchObject({ effectId: "MASSIVE_BLOCK", resonanceAttribute: "STILL", cost: 1, power: 10 });
    expect(snapshot.runtime.run.activeCombat!.state.programs.find(({ effectId }) => effectId === "MASSIVE_BLOCK")).toEqual({
      effectId: "MASSIVE_BLOCK", targetRule: { kind: "NONE" }, playedCardDestination: "DISCARD", operations: [],
    });
    expect(snapshot.runtime.run.activeCombat!.state.programs.filter(({ effectId }) => effectId === "MASSIVE_BLOCK")).toHaveLength(1);

    const canonicalReload = createStillkinTrack1Controller({ storage, resolverContext: context(), generationFactory: () => "unused" });
    expect(canonicalReload.load()).toMatchObject({ source: "SAVED", snapshot: { flow: { phase: "IN_COMBAT" } } });
    const projectionTamperStorage = new MemoryStorage();
    const projectionTamper = JSON.parse(storage.values.get(FICTOR_SAVE_V2_KEY)!);
    projectionTamper.runtime.run.activeCombat.state.cards.find((card: { cardId: string }) => card.cardId === "forge__ore_still__still_01").effectId = "DELAYED_EXPLOSION";
    projectionTamperStorage.values.set(FICTOR_SAVE_V2_KEY, JSON.stringify(projectionTamper));
    const projectionTamperController = createStillkinTrack1Controller({ storage: projectionTamperStorage, resolverContext: context(), generationFactory: () => "unused" });
    expect(projectionTamperController.load()).toMatchObject({ source: "SAFE_INITIALIZED", snapshot: { persistence: { writeBlocked: true, issues: ["INVALID_RUN"] } } });

    snapshot = winCombat(value);
    snapshot = value.dispatch({ type: "CHOOSE_REWARD", ...base(snapshot), choiceId: "elite-tool-01" }).snapshot;
    snapshot = resolveSimpleEvent(value, "risk-collapse");
    snapshot = enter(value);
    const beforeInvalidFictor = snapshot;
    expect(value.dispatch({ type: "RESOLVE_EVENT", ...base(snapshot), choiceId: "not-bound" })).toMatchObject({ applied: false, reason: "CHOICE_NOT_BOUND", snapshot: beforeInvalidFictor });

    const assertFictorForkRejected = (mutate: (envelope: any) => void, choiceId: string, reason: string) => {
      const forkStorage = new MemoryStorage();
      const envelope = JSON.parse(storage.values.get(FICTOR_SAVE_V2_KEY)!);
      mutate(envelope);
      forkStorage.values.set(FICTOR_SAVE_V2_KEY, JSON.stringify(envelope));
      const fork = createStillkinTrack1Controller({ storage: forkStorage, resolverContext: context(), generationFactory: () => "unused" });
      const before = fork.load().snapshot;
      const rejected = fork.dispatch({ type: "RESOLVE_EVENT", ...base(before), choiceId });
      expect(rejected).toMatchObject({ applied: false, reason });
      expect(rejected.snapshot).toEqual(before);
    };
    assertFictorForkRejected((envelope) => { envelope.runtime.run.fuel = 0; }, "fictor-still-04", "INSUFFICIENT_FUEL");
    assertFictorForkRejected((envelope) => {
      const sequence = envelope.runtime.run.nextInstanceSequence;
      envelope.runtime.run.ownedInstances.push({ instanceId: `forge-instance-v1-${sequence}`, cardId: "tool_02" });
      envelope.runtime.run.deck.push(`forge-instance-v1-${sequence}`);
      envelope.runtime.run.nextInstanceSequence += 1;
    }, "fictor-tool-02", "UNIQUE_TOOL_ALREADY_OWNED");
    assertFictorForkRejected((envelope) => { envelope.profile.discoveredRecipeIds.push("ore_burn|ore_still"); envelope.profile.discoveredRecipeIds.sort(); }, "fictor-recipe", "CHOICE_ALREADY_OWNED");
    const fictor = value.dispatch({ type: "RESOLVE_EVENT", ...base(snapshot), choiceId: "fictor-tool-02" });
    expect(fictor.applied).toBe(true);
    expect(fictor.snapshot.runtime.run.fuel).toBe(fuelBeforeFree - 2);
    const toolOne = fictor.snapshot.runtime.run.ownedInstances.find(({ cardId }) => cardId === "tool_01")!;
    const toolTwo = fictor.snapshot.runtime.run.ownedInstances.find(({ cardId }) => cardId === "tool_02")!;
    const equipmentForge = value.dispatch({ type: "FORGE_WORKSHOP", ...base(fictor.snapshot), materialInstanceIds: [toolOne.instanceId, toolTwo.instanceId] });
    expect(equipmentForge.applied).toBe(true);
    const equipment = equipmentForge.snapshot.runtime.run.ownedInstances.find(({ cardId }) => cardId === "forge__tool_01__tool_02")!;
    expect(equipment).toBeDefined();
    expect(equipmentForge.snapshot.runtime.run.deck).toContain(equipment.instanceId);
    snapshot = value.dispatch({ type: "LEAVE_EVENT", ...base(equipmentForge.snapshot) }).snapshot;
    snapshot = resolveSimpleEvent(value, "read-record");
    snapshot = resolveSimpleEvent(value, "take-oddity");
    snapshot = enter(value);
    const bossCombat = snapshot.runtime.run.activeCombat!;
    expect(bossCombat.enrolledPersistentInstanceIds).not.toContain(equipment.instanceId);
    expect(bossCombat.state.instances.some(({ instanceId }) => instanceId === equipment.instanceId)).toBe(false);
    expect(bossCombat.state.zones.deck).not.toContain(equipment.instanceId);
    expect(bossCombat.state.cards.some(({ cardId }) => cardId === equipment.cardId)).toBe(false);
    snapshot = winCombat(value);
    expect(snapshot.flow.phase).toBe("RUN_WON");
    expect(snapshot.profile.ownedHeartIds).toEqual(["heart__still"]);
    expect(snapshot.profile.featureFlags.heartForge).toBe(false);

    const oldRunId = snapshot.flow.runId;
    const restarted = value.dispatch({ type: "RESTART", ...base(snapshot) });
    expect(restarted.applied).toBe(true);
    expect(restarted.snapshot.flow.runId).not.toBe(oldRunId);
    expect(restarted.snapshot.runtime.run).toMatchObject({ fuel: 4, nextInstanceSequence: 30, activeCombat: null });
    expect(restarted.snapshot.profile.ownedHeartIds).toEqual(["heart__still"]);
  });

  it("uses a workshop entitlement successfully at zero fuel without exposing a free runtime command", () => {
    const { storage, value } = controller();
    let snapshot = enter(value);
    snapshot = winCombat(value);
    snapshot = value.dispatch({ type: "CHOOSE_REWARD", ...base(snapshot), choiceId: "normal-ore" }).snapshot;
    snapshot = enter(value);
    snapshot = value.dispatch({ type: "RESOLVE_EVENT", ...base(snapshot), choiceId: "take-cache" }).snapshot;
    snapshot = value.dispatch({ type: "LEAVE_EVENT", ...base(snapshot) }).snapshot;
    snapshot = enter(value);
    snapshot = value.dispatch({ type: "RESOLVE_EVENT", ...base(snapshot), choiceId: "use-workshop" }).snapshot;

    const envelope = JSON.parse(storage.values.get(FICTOR_SAVE_V2_KEY)!);
    envelope.runtime.run.fuel = 0;
    storage.values.set(FICTOR_SAVE_V2_KEY, JSON.stringify(envelope));
    const reloaded = createStillkinTrack1Controller({ storage, resolverContext: context(), generationFactory: () => "unused" });
    snapshot = reloaded.load().snapshot;
    const ore = snapshot.runtime.run.ownedInstances.find((item) => item.cardId === "ore_still")!;
    const one = snapshot.runtime.run.ownedInstances.find((item) => item.cardId === "still_01")!;
    const free = reloaded.dispatch({ type: "USE_FREE_WORKSHOP", ...base(snapshot), materialInstanceIds: [ore.instanceId, one.instanceId] });

    expect(free).toMatchObject({ applied: true, snapshot: { runtime: { run: { fuel: 0 } } } });
    expect(free.events.filter((event) => event.type === "FREE_WORKSHOP_USED")).toHaveLength(1);
    expect(free.events.some((event) => event.type === "FUEL_SPENT")).toBe(false);
  });

  it("spends fuel to zero legally and uses the zero-cost FICTOR skip through boss progression", () => {
    const { value } = controller();
    let snapshot = enter(value);
    snapshot = winCombat(value);
    snapshot = value.dispatch({ type: "CHOOSE_REWARD", ...base(snapshot), choiceId: "normal-ore" }).snapshot;

    const paidPairs = [
      ["ore_still", "still_01"],
      ["still_02", "still_03"],
      ["still_04", "still_05"],
      ["ore_still", "still_02"],
    ] as const;
    for (const [leftCardId, rightCardId] of paidPairs) {
      const left = snapshot.runtime.run.ownedInstances.find(({ cardId }) => cardId === leftCardId)!;
      const right = snapshot.runtime.run.ownedInstances.find(({ cardId }) => cardId === rightCardId)!;
      const paid = value.dispatch({ type: "FORGE_WORKSHOP", ...base(snapshot), materialInstanceIds: [left.instanceId, right.instanceId] });
      expect(paid.applied).toBe(true);
      snapshot = paid.snapshot;
    }
    expect(snapshot.runtime.run.fuel).toBe(0);

    snapshot = resolveSimpleEvent(value, "take-cache");
    snapshot = enter(value);
    snapshot = value.dispatch({ type: "RESOLVE_EVENT", ...base(snapshot), choiceId: "use-workshop" }).snapshot;
    const freeLeft = snapshot.runtime.run.ownedInstances.find(({ cardId }) => cardId === "ore_still")!;
    const freeRight = snapshot.runtime.run.ownedInstances.find(({ cardId }) => cardId === "still_01")!;
    snapshot = value.dispatch({ type: "USE_FREE_WORKSHOP", ...base(snapshot), materialInstanceIds: [freeLeft.instanceId, freeRight.instanceId] }).snapshot;
    expect(snapshot.runtime.run.fuel).toBe(0);
    snapshot = value.dispatch({ type: "LEAVE_EVENT", ...base(snapshot) }).snapshot;

    snapshot = winCombatAfterEnter(value);
    snapshot = value.dispatch({ type: "CHOOSE_REWARD", ...base(snapshot), choiceId: "elite-odd-02" }).snapshot;
    snapshot = resolveSimpleEvent(value, "risk-collapse");
    snapshot = enter(value);
    expect(snapshot.eventChoices).toContainEqual({ choiceId: "fictor-skip", price: 0, effect: { kind: "NONE" } });
    const ownedBeforeSkip = snapshot.runtime.run.ownedInstances;
    const recipesBeforeSkip = snapshot.profile.discoveredRecipeIds;
    const skipped = value.dispatch({ type: "RESOLVE_EVENT", ...base(snapshot), choiceId: "fictor-skip" });
    expect(skipped).toMatchObject({ applied: true, snapshot: { flow: { phase: "EVENT_RESOLVED" }, runtime: { run: { fuel: 0 } } } });
    expect(skipped.snapshot.runtime.run.ownedInstances).toEqual(ownedBeforeSkip);
    expect(skipped.snapshot.profile.discoveredRecipeIds).toEqual(recipesBeforeSkip);
    snapshot = value.dispatch({ type: "LEAVE_EVENT", ...base(skipped.snapshot) }).snapshot;
    snapshot = resolveSimpleEvent(value, "read-record");
    snapshot = resolveSimpleEvent(value, "take-oddity");
    snapshot = enter(value);
    expect(snapshot.flow.phase).toBe("IN_COMBAT");
    snapshot = winCombat(value);
    expect(snapshot.flow.phase).toBe("RUN_WON");
  });

  it("reloads v2 mid-combat, rejects stale writers, rolls back quota failure, and leaves v1 bytes untouched", () => {
    const { storage, value } = controller();
    let snapshot = enter(value);
    const originalV1 = JSON.stringify({ schemaVersion: 999, opaque: "keep" });
    storage.values.set(FICTOR_SAVE_KEY, originalV1);
    const reloaded = createStillkinTrack1Controller({ storage, resolverContext: context(), generationFactory: () => "unused" });
    expect(reloaded.load().snapshot).toMatchObject({ flow: { phase: "IN_COMBAT", combatBinding: snapshot.flow.combatBinding } });
    expect(storage.values.get(FICTOR_SAVE_KEY)).toBe(originalV1);

    const stale = snapshot;
    snapshot = reloaded.dispatch({ type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...snapshot.flow.combatBinding!, command: { type: "START_TURN" } }).snapshot;
    expect(value.dispatch({ type: "APPLY_COMBAT", expectedRevision: stale.flow.revision, ...stale.flow.combatBinding!, command: { type: "START_TURN" } })).toMatchObject({ applied: false, persistence: { reason: "STALE_WRITE" } });

    storage.failSet = true;
    const before = reloaded.snapshot();
    const failed = reloaded.dispatch({ type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...snapshot.flow.combatBinding!, command: { type: "PLAY_CARD", instanceId: snapshot.runtime.run.activeCombat!.state.zones.hand[0], target: { kind: "ENEMY", enemyId: snapshot.flow.combatBinding!.encounterId } } });
    expect(failed).toMatchObject({ applied: false, persistence: { reason: "WRITE_FAILED" } });
    expect(reloaded.snapshot()).toEqual(before);
    expect(storage.values.has(FICTOR_SAVE_V2_KEY)).toBe(true);
  });

  it("migrates only a valid v1 profile, blocks corrupt v2, detaches snapshots, and rejects hostile commands", () => {
    const storage = new MemoryStorage();
    const profile = {
      schemaVersion: 1,
      discoveredRecipeIds: ["ore_burn|ore_still"],
      ownedHeartIds: ["heart__still"],
      featureFlags: { heartForge: false },
    };
    const v1 = JSON.stringify({ schemaVersion: 1, saveGeneration: "legacy", saveRevision: 8, profile, run: { ignored: true } });
    storage.values.set(FICTOR_SAVE_KEY, v1);
    const migrated = createStillkinTrack1Controller({ storage, resolverContext: context(), generationFactory: () => "migrated" });
    const loaded = migrated.load();
    expect(loaded.source).toBe("MIGRATED_V1");
    expect(loaded.snapshot.profile).toEqual(profile);
    expect(loaded.snapshot.runtime.run).toMatchObject({ fuel: 4, nextInstanceSequence: 30 });
    expect(storage.values.get(FICTOR_SAVE_KEY)).toBe(v1);

    const detached = migrated.snapshot();
    detached.runtime.run.fuel = 999;
    expect(migrated.snapshot().runtime.run.fuel).toBe(4);
    expect(migrated.dispatch({ get type() { throw new Error("must not run"); } })).toMatchObject({ applied: false, reason: "INVALID_COMMAND" });
    expect(migrated.dispatch(new Proxy({}, { ownKeys() { throw new Error("trap"); } }))).toMatchObject({ applied: false, reason: "INVALID_COMMAND" });
    const cycle: Record<string, unknown> = { type: "ENTER_NEXT_NODE" };
    cycle.self = cycle;
    expect(migrated.dispatch(cycle)).toMatchObject({ applied: false, reason: "INVALID_COMMAND" });
    expect(migrated.dispatch({ type: "RESOLVE_COMBAT", expectedRevision: 0, runId: loaded.snapshot.flow.runId, result: "VICTORY" })).toMatchObject({ applied: false, reason: "INVALID_COMMAND" });
    expect(migrated.dispatch({ type: "ENTER_NEXT_NODE", expectedRevision: 0, runId: loaded.snapshot.flow.runId, scenario: {} })).toMatchObject({ applied: false, reason: "INVALID_COMMAND" });
    const sparse: unknown[] = [];
    sparse.length = 2;
    expect(migrated.dispatch({ type: "FORGE_WORKSHOP", expectedRevision: 0, runId: loaded.snapshot.flow.runId, materialInstanceIds: sparse })).toMatchObject({ applied: false, reason: "INVALID_COMMAND" });

    const corruptStorage = new MemoryStorage();
    corruptStorage.values.set(FICTOR_SAVE_V2_KEY, "{bad");
    const corrupt = createStillkinTrack1Controller({ storage: corruptStorage, resolverContext: context(), generationFactory: () => "blocked" });
    const safe = corrupt.load().snapshot;
    expect(safe.persistence.writeBlocked).toBe(true);
    expect(corrupt.dispatch({ type: "ENTER_NEXT_NODE", ...base(safe) })).toMatchObject({ applied: false, persistence: { reason: "WRITE_BLOCKED" } });
    expect(corruptStorage.values.get(FICTOR_SAVE_V2_KEY)).toBe("{bad");

    let getterCalls = 0;
    const accessorOptions = {
      get storage() { getterCalls += 1; return storage; },
      resolverContext: context(),
    };
    expect(() => createStillkinTrack1Controller(accessorOptions)).toThrow("invalid Stillkin Track-1 controller options");
    expect(getterCalls).toBe(0);
    expect(() => createStillkinTrack1Controller(new Proxy({}, { ownKeys() { throw new Error("secret trap detail"); } }))).toThrow("invalid Stillkin Track-1 controller options");
  });

  it("fails closed when persisted phase, active combat, node, or nonce authority diverges", () => {
    const original = controller();
    enter(original.value);
    const bytes = original.storage.values.get(FICTOR_SAVE_V2_KEY)!;
    const mutations: Array<(envelope: any) => void> = [
      (envelope) => { envelope.runtime.run.activeCombat = null; },
      (envelope) => { envelope.flow.combatBinding.encounterNonce += 1; },
      (envelope) => { envelope.flow.combatBinding.nodeId = "d2-elite"; },
      (envelope) => { envelope.flow.phase = "BETWEEN_NODES"; },
    ];
    for (const mutate of mutations) {
      const storage = new MemoryStorage();
      const envelope = JSON.parse(bytes);
      mutate(envelope);
      storage.values.set(FICTOR_SAVE_V2_KEY, JSON.stringify(envelope));
      const value = createStillkinTrack1Controller({ storage, resolverContext: context(), generationFactory: () => "blocked" });
      const loaded = value.load();
      expect(loaded).toMatchObject({ source: "SAFE_INITIALIZED", snapshot: { persistence: { writeBlocked: true } } });
      expect(storage.values.get(FICTOR_SAVE_V2_KEY)).toBe(JSON.stringify(envelope));
    }
  });

  it("rejects noncanonical, undiscovered forge, mismatched forge, and duplicate-tool v2 authority", () => {
    const original = controller();
    let snapshot = enter(original.value);
    snapshot = winCombat(original.value);
    original.value.dispatch({ type: "CHOOSE_REWARD", ...base(snapshot), choiceId: "normal-ore" });
    const bytes = original.storage.values.get(FICTOR_SAVE_V2_KEY)!;
    const mutations: Array<(envelope: any) => void> = [
      (envelope) => { envelope.runtime.run.ownedInstances[0].cardId = "not_canonical"; },
      (envelope) => { envelope.runtime.run.ownedInstances[0].cardId = "forge__ore_burn__ore_still"; },
      (envelope) => {
        envelope.profile.discoveredRecipeIds.push("ore_burn|ore_still");
        envelope.profile.discoveredRecipeIds.sort();
        envelope.runtime.run.ownedInstances[0].cardId = "forge__ore_still__ore_burn";
      },
      (envelope) => {
        const first = `authority-tool-${envelope.runtime.run.nextInstanceSequence}`;
        const second = `${first}-duplicate`;
        envelope.runtime.run.ownedInstances.push({ instanceId: first, cardId: "tool_01" }, { instanceId: second, cardId: "tool_01" });
        envelope.runtime.run.deck.push(first, second);
        envelope.runtime.run.nextInstanceSequence += 2;
      },
    ];
    for (const mutate of mutations) {
      const storage = new MemoryStorage();
      const envelope = JSON.parse(bytes);
      mutate(envelope);
      const tampered = JSON.stringify(envelope);
      storage.values.set(FICTOR_SAVE_V2_KEY, tampered);
      const value = createStillkinTrack1Controller({ storage, resolverContext: context(), generationFactory: () => "blocked" });
      expect(value.load()).toMatchObject({ source: "SAFE_INITIALIZED", snapshot: { persistence: { writeBlocked: true, issues: ["INVALID_RUN"] } } });
      expect(storage.values.get(FICTOR_SAVE_V2_KEY)).toBe(tampered);
    }
  });

  it("fully revalidates same-token v2 bytes before CAS overwrite", () => {
    const original = controller();
    let snapshot = enter(original.value);
    snapshot = winCombat(original.value);
    original.value.dispatch({ type: "CHOOSE_REWARD", ...base(snapshot), choiceId: "normal-ore" });
    const bytes = original.storage.values.get(FICTOR_SAVE_V2_KEY)!;

    const cases: Array<{ mutate: (envelope: any) => string; reason: "STALE_WRITE" | "WRITE_BLOCKED" }> = [
      { mutate: (envelope) => { envelope.runtime.run.fuel -= 1; return JSON.stringify(envelope); }, reason: "STALE_WRITE" },
      { mutate: () => "{bad", reason: "WRITE_BLOCKED" },
      { mutate: (envelope) => { envelope.schemaVersion = 3; return JSON.stringify(envelope); }, reason: "WRITE_BLOCKED" },
      { mutate: (envelope) => { envelope.runtime.run.ownedInstances[0].cardId = "not_canonical"; return JSON.stringify(envelope); }, reason: "WRITE_BLOCKED" },
    ];
    for (const item of cases) {
      const storage = new MemoryStorage();
      storage.values.set(FICTOR_SAVE_V2_KEY, bytes);
      const value = createStillkinTrack1Controller({ storage, resolverContext: context(), generationFactory: () => "unused" });
      const before = value.load().snapshot;
      const replacement = item.mutate(JSON.parse(bytes));
      storage.values.set(FICTOR_SAVE_V2_KEY, replacement);
      const result = value.dispatch({ type: "ENTER_NEXT_NODE", ...base(before) });
      expect(result).toMatchObject({ applied: false, persistence: { ok: false, reason: item.reason }, reason: "PERSISTENCE_FAILED" });
      expect(result.snapshot).toEqual(before);
      expect(storage.values.get(FICTOR_SAVE_V2_KEY)).toBe(replacement);
    }
  });

  it("settles defeat atomically, rejects a repeated terminal binding, and restarts from owned state", () => {
    const { value } = controller();
    let snapshot = enter(value);
    const binding = snapshot.flow.combatBinding!;
    while (snapshot.flow.phase === "IN_COMBAT") {
      const active = snapshot.runtime.run.activeCombat!;
      const command = active.state.phase === "TURN_READY" ? { type: "START_TURN" as const } : { type: "END_TURN" as const };
      const result = value.dispatch({ type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...binding, command });
      expect(result.applied).toBe(true);
      snapshot = result.snapshot;
    }
    expect(snapshot).toMatchObject({ flow: { phase: "RUN_LOST", playerHp: 0, combatBinding: null }, runtime: { run: { activeCombat: null } } });
    expect(value.dispatch({ type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...binding, command: { type: "START_TURN" } })).toMatchObject({ applied: false, reason: "STALE_ENCOUNTER_BINDING" });
    const restarted = value.dispatch({ type: "RESTART", ...base(snapshot) });
    expect(restarted).toMatchObject({ applied: true, snapshot: { flow: { phase: "BETWEEN_NODES", playerHp: 30, nextEncounterNonce: 1 }, runtime: { run: { fuel: 4, activeCombat: null } } } });
  });
});

function winCombatAfterEnter(value: StillkinTrack1Controller): StillkinTrack1Snapshot {
  enter(value);
  return winCombat(value);
}
