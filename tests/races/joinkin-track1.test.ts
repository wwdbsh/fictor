import { describe, expect, it } from "vitest";

import {
  BROWSER_RUNTIME_PACKET,
  BURNKIN_TRACK1_SAVE_KEY,
  createBurnkinTrack1Controller,
  createJoinkinTrack1Controller,
  createStillkinTrack1Controller,
  JOINKIN_TRACK1_SAVE_KEY,
  type StillkinTrack1Controller,
  type StillkinTrack1Snapshot,
} from "../../src/application";
import { FICTOR_SAVE_V2_KEY, type StorageLike } from "../../src/persistence";
import { decodeForgeRuntimeState, reduceForgeRuntime } from "../../src/domain";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function create(storage = new MemoryStorage()) {
  const controller = createJoinkinTrack1Controller({
    storage,
    resolverContext: BROWSER_RUNTIME_PACKET.resolverContext,
    generationFactory: () => "joinkin-generation",
  });
  return { controller, storage, snapshot: controller.load().snapshot };
}

function dispatch(controller: StillkinTrack1Controller, command: Parameters<StillkinTrack1Controller["dispatch"]>[0]) {
  const result = controller.dispatch(command);
  expect(result.applied, result.reason).toBe(true);
  return result;
}

function binding(snapshot: StillkinTrack1Snapshot) {
  if (!snapshot.flow.combatBinding) throw new Error("combat binding unavailable");
  return { expectedRevision: snapshot.flow.revision, ...snapshot.flow.combatBinding };
}

describe("Joinkin Track 1 integration", () => {
  it("uses a separate deterministic 20 JOIN + 10 unique-tool starter and save authority", () => {
    const { controller, storage, snapshot } = create();
    expect(snapshot).toMatchObject({ raceId: "Joinkin", raceLabelKo: "이음붙이" });
    expect(snapshot.runtime.run.ownedInstances).toHaveLength(30);
    const cards = snapshot.runtime.run.ownedInstances.map(({ cardId }) => cardId);
    expect(cards.filter((id) => id === "ore_join" || id.startsWith("join_"))).toHaveLength(20);
    expect(cards.filter((id) => id.startsWith("tool_"))).toEqual(Array.from({ length: 10 }, (_, index) => `tool_${String(index + 1).padStart(2, "0")}`));
    const entered = dispatch(controller, { type: "ENTER_NEXT_NODE", expectedRevision: snapshot.flow.revision, runId: snapshot.flow.runId }).snapshot;
    const started = dispatch(controller, { type: "APPLY_COMBAT", ...binding(entered), command: { type: "START_TURN" } }).snapshot;
    expect(started.runtime.run.activeCombat).toMatchObject({ forgeActionsRemaining: 1, joinkinSkillUsedTurn: null, joinkinBridgeOpen: false });
    expect(storage.values.has(JOINKIN_TRACK1_SAVE_KEY)).toBe(true);
  });

  it("grants 1→2 forge actions once per turn and atomically isolates/restores an instant triple", () => {
    const { controller, snapshot } = create();
    let current = dispatch(controller, { type: "ENTER_NEXT_NODE", expectedRevision: snapshot.flow.revision, runId: snapshot.flow.runId }).snapshot;
    current = dispatch(controller, { type: "APPLY_COMBAT", ...binding(current), command: { type: "START_TURN" } }).snapshot;
    const granted = dispatch(controller, { type: "JOINKIN_EXTEND", ...binding(current) });
    current = granted.snapshot;
    expect(granted.events).toContainEqual({ type: "JOINKIN_FORGE_ACTION_GRANTED", remaining: 2, turn: 1 });
    const duplicate = controller.dispatch({ type: "JOINKIN_EXTEND", ...binding(current) });
    expect(duplicate.applied).toBe(false);
    expect(duplicate.snapshot).toEqual(current);

    const active = current.runtime.run.activeCombat!;
    const ids = active.state.zones.hand.slice(0, 3) as [string, string, string];
    const materialCards = ids.map((id) => active.state.instances.find((item) => item.instanceId === id)!.cardId);
    const forged = dispatch(controller, { type: "JOINKIN_FORGE_INSTANT", ...binding(current), materialInstanceIds: ids });
    current = forged.snapshot;
    expect(current.runtime.run.activeCombat).toMatchObject({ forgeActionsRemaining: 1 });
    expect(current.runtime.run.activeCombat!.isolatedMaterials.map(({ instance }) => instance.instanceId)).toEqual(ids);
    expect(current.runtime.run.activeCombat!.ephemeralResults[0]).toMatchObject({
      recipeId: [...materialCards.slice(0, 2)].sort().join("|"),
      provenance: { kind: "JOINKIN_THREE", thirdMaterialInstanceId: ids[2], thirdMaterialId: materialCards[2], resonanceAttribute: "JOIN" },
    });
    expect(current.profile.discoveredRecipeIds).toEqual([[...materialCards.slice(0, 2)].sort().join("|")]);

    const terminal = structuredClone(current.runtime);
    terminal.run.activeCombat!.state.status = "VICTORY";
    terminal.run.activeCombat!.state.phase = "TERMINAL";
    terminal.run.activeCombat!.state.enemy.hp = 0;
    terminal.run.activeCombat!.forgeActionsRemaining = 0;
    terminal.run.activeCombat!.joinkinBridgeOpen = false;
    // Runtime cleanup is the same terminal path used by the controller.
    const cleaned = reduceForgeRuntime(terminal, { type: "CLEANUP_COMBAT" }, BROWSER_RUNTIME_PACKET.resolverContext);
    expect(cleaned.state?.run.activeCombat?.isolatedMaterials).toEqual([]);
    expect(cleaned.state?.run.activeCombat?.ephemeralResults).toEqual([]);
    expect(cleaned.events).toContainEqual({ type: "INSTANT_FORGE_CLEANED", restoredInstanceIds: ids, removedEphemeralInstanceIds: [expect.any(String)] });
  });

  it("atomically rejects the public pair instant command for Joinkin", () => {
    const { controller, storage, snapshot } = create();
    let current = dispatch(controller, { type: "ENTER_NEXT_NODE", expectedRevision: 0, runId: snapshot.flow.runId }).snapshot;
    current = dispatch(controller, { type: "APPLY_COMBAT", ...binding(current), command: { type: "START_TURN" } }).snapshot;
    const ids = current.runtime.run.activeCombat!.state.zones.hand.slice(0, 2) as [string, string];
    const beforeBytes = storage.values.get(JOINKIN_TRACK1_SAVE_KEY);
    const rejected = controller.dispatch({ type: "FORGE_INSTANT", ...binding(current), materialInstanceIds: ids });
    expect(rejected).toMatchObject({ applied: false, reason: "RACE_COMMAND_UNAVAILABLE" });
    expect(rejected.snapshot).toEqual(current);
    expect(storage.values.get(JOINKIN_TRACK1_SAVE_KEY)).toBe(beforeBytes);
  });

  it("rejects duplicate triples and equipment base pairs without any state or persistence mutation", () => {
    const duplicateRun = create(new MemoryStorage());
    const duplicateBefore = duplicateRun.snapshot;
    const duplicateId = duplicateBefore.runtime.run.ownedInstances[0].instanceId;
    const otherId = duplicateBefore.runtime.run.ownedInstances[1].instanceId;
    const duplicate = duplicateRun.controller.dispatch({
      type: "JOINKIN_FORGE_WORKSHOP",
      expectedRevision: 0,
      runId: duplicateBefore.flow.runId,
      materialInstanceIds: [duplicateId, otherId, duplicateId],
    });
    expect(duplicate.applied).toBe(false);
    expect(duplicate.snapshot).toEqual(duplicateBefore);
    expect(duplicateRun.storage.values.has(JOINKIN_TRACK1_SAVE_KEY)).toBe(false);

    const equipmentRun = create(new MemoryStorage());
    const equipmentBefore = equipmentRun.snapshot;
    const tools = equipmentBefore.runtime.run.ownedInstances.filter(({ cardId }) => cardId.startsWith("tool_")).slice(0, 2);
    const third = equipmentBefore.runtime.run.ownedInstances[0];
    const equipment = equipmentRun.controller.dispatch({
      type: "JOINKIN_FORGE_WORKSHOP",
      expectedRevision: 0,
      runId: equipmentBefore.flow.runId,
      materialInstanceIds: [tools[0].instanceId, tools[1].instanceId, third.instanceId],
    });
    expect(equipment.applied).toBe(false);
    expect(equipment.snapshot).toEqual(equipmentBefore);
    expect(equipmentRun.storage.values.has(JOINKIN_TRACK1_SAVE_KEY)).toBe(false);
  });

  it("expires the granted forge action at END_TURN and starts the next turn at the normal cap", () => {
    const { controller, snapshot } = create();
    let current = dispatch(controller, { type: "ENTER_NEXT_NODE", expectedRevision: 0, runId: snapshot.flow.runId }).snapshot;
    current = dispatch(controller, { type: "APPLY_COMBAT", ...binding(current), command: { type: "START_TURN" } }).snapshot;
    current = dispatch(controller, { type: "JOINKIN_EXTEND", ...binding(current) }).snapshot;
    expect(current.runtime.run.activeCombat?.forgeActionsRemaining).toBe(2);
    current = dispatch(controller, { type: "APPLY_COMBAT", ...binding(current), command: { type: "END_TURN" } }).snapshot;
    expect(current.runtime.run.activeCombat).toMatchObject({ forgeActionsRemaining: 0, joinkinSkillUsedTurn: null });
    current = dispatch(controller, { type: "APPLY_COMBAT", ...binding(current), command: { type: "START_TURN" } }).snapshot;
    expect(current.runtime.run.activeCombat).toMatchObject({ forgeActionsRemaining: 1, joinkinSkillUsedTurn: null });
  });

  it("persists paid triple overlay, rejects stale/cross-race commands, and fails closed on overlay tamper", () => {
    const { controller, storage, snapshot } = create();
    const ids = snapshot.runtime.run.ownedInstances.slice(0, 3).map(({ instanceId }) => instanceId) as [string, string, string];
    const command = { type: "JOINKIN_FORGE_WORKSHOP" as const, expectedRevision: snapshot.flow.revision, runId: snapshot.flow.runId, materialInstanceIds: ids };
    const forged = dispatch(controller, command);
    expect(forged.snapshot.runtime.run).toMatchObject({ fuel: 3 });
    expect(forged.snapshot.runtime.run.ownedInstances).toHaveLength(28);
    expect(forged.snapshot.runtime.run.joinkinThirdOverlays).toEqual([{ instanceId: "forge-instance-v1-30", thirdMaterialId: "join_02", resonanceAttribute: "JOIN" }]);
    expect(controller.dispatch(command).applied).toBe(false);

    const reloaded = createJoinkinTrack1Controller({ storage, resolverContext: BROWSER_RUNTIME_PACKET.resolverContext }).load();
    expect(reloaded.source).toBe("SAVED");
    expect(reloaded.snapshot.runtime.run.joinkinThirdOverlays).toEqual(forged.snapshot.runtime.run.joinkinThirdOverlays);

    const stillStorage = new MemoryStorage();
    const still = createStillkinTrack1Controller({ storage: stillStorage, resolverContext: BROWSER_RUNTIME_PACKET.resolverContext, generationFactory: () => "still-generation" });
    const stillSnapshot = still.load().snapshot;
    const stillIds = stillSnapshot.runtime.run.ownedInstances.slice(0, 3).map(({ instanceId }) => instanceId) as [string, string, string];
    expect(still.dispatch({ type: "JOINKIN_FORGE_WORKSHOP", expectedRevision: 0, runId: stillSnapshot.flow.runId, materialInstanceIds: stillIds }).applied).toBe(false);

    const canonicalBytes = storage.values.get(JOINKIN_TRACK1_SAVE_KEY)!;
    const missingOverlay = JSON.parse(canonicalBytes);
    missingOverlay.runtime.run.joinkinThirdOverlays = [];
    storage.values.set(JOINKIN_TRACK1_SAVE_KEY, JSON.stringify(missingOverlay));
    const incomplete = createJoinkinTrack1Controller({ storage, resolverContext: BROWSER_RUNTIME_PACKET.resolverContext }).load();
    expect(incomplete.source).toBe("SAFE_INITIALIZED");
    expect(incomplete.snapshot.persistence.writeBlocked).toBe(true);

    storage.values.set(JOINKIN_TRACK1_SAVE_KEY, canonicalBytes);
    const envelope = JSON.parse(canonicalBytes);
    envelope.runtime.run.joinkinThirdOverlays[0].resonanceAttribute = "BURN";
    storage.values.set(JOINKIN_TRACK1_SAVE_KEY, JSON.stringify(envelope));
    const tampered = createJoinkinTrack1Controller({ storage, resolverContext: BROWSER_RUNTIME_PACKET.resolverContext }).load();
    expect(tampered.source).toBe("SAFE_INITIALIZED");
    expect(tampered.snapshot.persistence.writeBlocked).toBe(true);
  });

  it("requires Joinkin skill authority fields after use and forbids injected Joinkin authority on other races", () => {
    const used = create();
    let current = dispatch(used.controller, { type: "ENTER_NEXT_NODE", expectedRevision: 0, runId: used.snapshot.flow.runId }).snapshot;
    current = dispatch(used.controller, { type: "APPLY_COMBAT", ...binding(current), command: { type: "START_TURN" } }).snapshot;
    current = dispatch(used.controller, { type: "JOINKIN_EXTEND", ...binding(current) }).snapshot;
    const ids = current.runtime.run.activeCombat!.state.zones.hand.slice(0, 3) as [string, string, string];
    current = dispatch(used.controller, { type: "JOINKIN_FORGE_INSTANT", ...binding(current), materialInstanceIds: ids }).snapshot;
    expect(current.runtime.run.activeCombat).toMatchObject({ forgeActionsRemaining: 1, joinkinSkillUsedTurn: 1 });
    const omitted = JSON.parse(used.storage.values.get(JOINKIN_TRACK1_SAVE_KEY)!);
    delete omitted.runtime.run.activeCombat.joinkinSkillUsedTurn;
    expect(decodeForgeRuntimeState({ ...omitted.runtime, profile: { discoveredRecipeIds: omitted.profile.discoveredRecipeIds } }).valid).toBe(true);
    used.storage.values.set(JOINKIN_TRACK1_SAVE_KEY, JSON.stringify(omitted));
    expect(createJoinkinTrack1Controller({ storage: used.storage, resolverContext: BROWSER_RUNTIME_PACKET.resolverContext }).load()).toMatchObject({
      source: "SAFE_INITIALIZED",
      snapshot: { persistence: { writeBlocked: true, issues: ["INVALID_RUN"] } },
    });

    for (const [race, key, factory] of [
      ["Stillkin", FICTOR_SAVE_V2_KEY, createStillkinTrack1Controller],
      ["Burnkin", BURNKIN_TRACK1_SAVE_KEY, createBurnkinTrack1Controller],
    ] as const) {
      const storage = new MemoryStorage();
      const controller = factory({ storage, resolverContext: BROWSER_RUNTIME_PACKET.resolverContext, generationFactory: () => `${race}-generation` });
      let snapshot = controller.load().snapshot;
      snapshot = dispatch(controller, { type: "ENTER_NEXT_NODE", expectedRevision: 0, runId: snapshot.flow.runId }).snapshot;
      snapshot = dispatch(controller, { type: "APPLY_COMBAT", ...binding(snapshot), command: { type: "START_TURN" } }).snapshot;
      const envelope = JSON.parse(storage.values.get(key)!);
      const active = envelope.runtime.run.activeCombat;
      active.forgeActionsRemaining = 2;
      active.joinkinSkillUsedTurn = active.state.turn;
      active.joinkinBridgeOpen = false;
      expect(decodeForgeRuntimeState({ ...envelope.runtime, profile: { discoveredRecipeIds: envelope.profile.discoveredRecipeIds } }).valid).toBe(true);
      storage.values.set(key, JSON.stringify(envelope));
      expect(factory({ storage, resolverContext: BROWSER_RUNTIME_PACKET.resolverContext }).load()).toMatchObject({
        source: "SAFE_INITIALIZED",
        snapshot: { persistence: { writeBlocked: true, issues: ["INVALID_RUN"] } },
      });
    }
  });

  it("rejects a self-consistent triple provenance ledger injected into pair-only races", () => {
    for (const [race, expectedAttribute, key, factory] of [
      ["Stillkin", "STILL", FICTOR_SAVE_V2_KEY, createStillkinTrack1Controller],
      ["Burnkin", "BURN", BURNKIN_TRACK1_SAVE_KEY, createBurnkinTrack1Controller],
    ] as const) {
      const storage = new MemoryStorage();
      const controller = factory({ storage, resolverContext: BROWSER_RUNTIME_PACKET.resolverContext, generationFactory: () => `${race}-triple` });
      let snapshot = controller.load().snapshot;
      snapshot = dispatch(controller, { type: "ENTER_NEXT_NODE", expectedRevision: 0, runId: snapshot.flow.runId }).snapshot;

      let pair: [string, string] | null = null;
      let pairCardIds: [string, string] | null = null;
      // Grouped five-copy starters make turn 1 mono-definition; turn 2 crosses the first group boundary.
      for (let turn = 1; turn <= 2 && pair === null; turn += 1) {
        snapshot = dispatch(controller, { type: "APPLY_COMBAT", ...binding(snapshot), command: { type: "START_TURN" } }).snapshot;
        const active = snapshot.runtime.run.activeCombat!;
        const hand = active.state.zones.hand.map((instanceId) => active.state.instances.find((instance) => instance.instanceId === instanceId)!);
        const left = hand[0];
        const right = hand.find(({ cardId }) => cardId !== left.cardId);
        if (right) {
          pair = [left.instanceId, right.instanceId];
          pairCardIds = [left.cardId, right.cardId];
        } else if (turn < 2) {
          snapshot = dispatch(controller, { type: "APPLY_COMBAT", ...binding(snapshot), command: { type: "END_TURN" } }).snapshot;
        }
      }
      expect(pair, `${race} should expose a distinct public forge pair by turn 2`).not.toBeNull();
      expect(pairCardIds).not.toBeNull();
      if (!pair || !pairCardIds) throw new Error(`${race} distinct forge pair unavailable within deterministic bound`);
      snapshot = dispatch(controller, { type: "FORGE_INSTANT", ...binding(snapshot), materialInstanceIds: pair }).snapshot;

      // The pair and envelope came through public controller authority before the single provenance injection.
      expect(factory({ storage, resolverContext: BROWSER_RUNTIME_PACKET.resolverContext }).load().source).toBe("SAVED");
      const envelope = JSON.parse(storage.values.get(key)!);
      const forgedActive = envelope.runtime.run.activeCombat;
      const provenance = forgedActive.ephemeralResults[0].provenance;
      expect(provenance).toMatchObject({ kind: "PAIR", materialInstanceIds: pair });
      const third = forgedActive.state.instances.find((instance: { instanceId: string; cardId: string }) =>
        !pair.includes(instance.instanceId) && !pairCardIds.includes(instance.cardId) && !instance.cardId.startsWith("forge__"));
      expect(third, `${race} should retain a third distinct enrolled material`).toBeTruthy();
      if (!third) throw new Error(`${race} third material unavailable`);
      const thirdDefinition = BROWSER_RUNTIME_PACKET.resolverContext.materials.find(({ id }) => id === third.cardId);
      expect(thirdDefinition).toBeTruthy();
      if (!thirdDefinition) throw new Error(`${race} third material definition unavailable`);
      const thirdAttribute = Array.isArray(thirdDefinition.attribute) ? thirdDefinition.attribute[0] : thirdDefinition.attribute;
      expect(thirdAttribute).toBe(expectedAttribute);

      forgedActive.state.instances = forgedActive.state.instances.filter((instance: { instanceId: string }) => instance.instanceId !== third.instanceId);
      for (const zone of Object.values(forgedActive.state.zones) as string[][]) {
        const index = zone.indexOf(third.instanceId);
        if (index >= 0) zone.splice(index, 1);
      }
      forgedActive.isolatedMaterials.push({ instance: third });
      forgedActive.ephemeralResults[0].provenance = {
        kind: "JOINKIN_THREE",
        baseMaterialInstanceIds: provenance.materialInstanceIds,
        thirdMaterialInstanceId: third.instanceId,
        thirdMaterialId: third.cardId,
        resonanceAttribute: thirdAttribute,
      };
      const decoded = decodeForgeRuntimeState({ ...envelope.runtime, profile: { discoveredRecipeIds: envelope.profile.discoveredRecipeIds } });
      expect(decoded.valid, decoded.valid ? undefined : decoded.errors.join("; ")).toBe(true);
      storage.values.set(key, JSON.stringify(envelope));
      expect(factory({ storage, resolverContext: BROWSER_RUNTIME_PACKET.resolverContext }).load()).toMatchObject({
        source: "SAFE_INITIALIZED",
        snapshot: { persistence: { writeBlocked: true, issues: ["INVALID_RUN"] } },
      });
    }
  });

  it("fails closed on active grouped-provenance tamper while legacy race states remain pair-shaped", () => {
    const { controller, storage, snapshot } = create();
    let current = dispatch(controller, { type: "ENTER_NEXT_NODE", expectedRevision: 0, runId: snapshot.flow.runId }).snapshot;
    current = dispatch(controller, { type: "APPLY_COMBAT", ...binding(current), command: { type: "START_TURN" } }).snapshot;
    const ids = current.runtime.run.activeCombat!.state.zones.hand.slice(0, 3) as [string, string, string];
    dispatch(controller, { type: "JOINKIN_FORGE_INSTANT", ...binding(current), materialInstanceIds: ids });
    const envelope = JSON.parse(storage.values.get(JOINKIN_TRACK1_SAVE_KEY)!);
    envelope.runtime.run.activeCombat.ephemeralResults[0].provenance.thirdMaterialInstanceId = ids[0];
    storage.values.set(JOINKIN_TRACK1_SAVE_KEY, JSON.stringify(envelope));
    const load = createJoinkinTrack1Controller({ storage, resolverContext: BROWSER_RUNTIME_PACKET.resolverContext }).load();
    expect(load.source).toBe("SAFE_INITIALIZED");
    expect(load.snapshot.persistence).toMatchObject({ writeBlocked: true, issues: ["INVALID_RUN"] });

    const still = createStillkinTrack1Controller({ storage: new MemoryStorage(), resolverContext: BROWSER_RUNTIME_PACKET.resolverContext }).load().snapshot;
    expect(still.runtime.run).not.toHaveProperty("joinkinThirdOverlays");
  });

  it("emits and calculates A→JOIN→B as one controller-level streak, then closes the bridge", () => {
    const { controller, storage, snapshot } = create();
    const setupIds = snapshot.runtime.run.ownedInstances.slice(10, 13).map(({ instanceId }) => instanceId) as [string, string, string];
    dispatch(controller, { type: "JOINKIN_FORGE_WORKSHOP", expectedRevision: 0, runId: snapshot.flow.runId, materialInstanceIds: setupIds });
    const envelope = JSON.parse(storage.values.get(JOINKIN_TRACK1_SAVE_KEY)!);
    const replacements = ["burn_01", "ore_join", "wash_01"];
    for (let index = 0; index < replacements.length; index += 1) envelope.runtime.run.ownedInstances[index].cardId = replacements[index];
    storage.values.set(JOINKIN_TRACK1_SAVE_KEY, JSON.stringify(envelope));

    const resumed = createJoinkinTrack1Controller({ storage, resolverContext: BROWSER_RUNTIME_PACKET.resolverContext });
    let current = resumed.load().snapshot;
    expect(current.persistence.writeBlocked).toBe(false);
    current = dispatch(resumed, { type: "ENTER_NEXT_NODE", expectedRevision: current.flow.revision, runId: current.flow.runId }).snapshot;
    current = dispatch(resumed, { type: "APPLY_COMBAT", ...binding(current), command: { type: "START_TURN" } }).snapshot;

    const expected = [
      { instanceId: "track1-instance-0", attribute: "BURN", streak: 1, power: 10.8, bridge: false },
      { instanceId: "track1-instance-1", attribute: "BURN", streak: 2, power: 11.6, bridge: true },
      { instanceId: "track1-instance-2", attribute: "WASH", streak: 3, power: 12.4, bridge: false },
    ] as const;
    for (const step of expected) {
      const result = dispatch(resumed, {
        type: "APPLY_COMBAT",
        ...binding(current),
        command: { type: "PLAY_CARD", instanceId: step.instanceId, target: { kind: "ENEMY", enemyId: current.flow.combatBinding!.encounterId } },
      });
      expect(result.events).toContainEqual({ type: "RESONANCE_ADVANCED", attribute: step.attribute, streak: step.streak });
      expect(result.events).toContainEqual(expect.objectContaining({ type: "CARD_PLAYED", instanceId: step.instanceId, effectivePower: step.power }));
      current = result.snapshot;
      if (step.instanceId === "track1-instance-2") expect(current.runtime.run.activeCombat).toBeNull();
      else expect(current.runtime.run.activeCombat?.joinkinBridgeOpen).toBe(step.bridge);
    }
    expect(current.flow.phase).toBe("AWAITING_REWARD");
  });
});
