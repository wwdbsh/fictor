import { describe, expect, it } from "vitest";

import {
  BROWSER_RUNTIME_PACKET,
  createJoinkinTrack1Controller,
  createStillkinTrack1Controller,
  JOINKIN_TRACK1_SAVE_KEY,
  type StillkinTrack1Controller,
  type StillkinTrack1Snapshot,
} from "../../src/application";
import type { StorageLike } from "../../src/persistence";
import { reduceForgeRuntime } from "../../src/domain";

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

    const envelope = JSON.parse(storage.values.get(JOINKIN_TRACK1_SAVE_KEY)!);
    envelope.runtime.run.joinkinThirdOverlays[0].resonanceAttribute = "BURN";
    storage.values.set(JOINKIN_TRACK1_SAVE_KEY, JSON.stringify(envelope));
    const tampered = createJoinkinTrack1Controller({ storage, resolverContext: BROWSER_RUNTIME_PACKET.resolverContext }).load();
    expect(tampered.source).toBe("SAFE_INITIALIZED");
    expect(tampered.snapshot.persistence.writeBlocked).toBe(true);
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
      { instanceId: "track1-instance-0", attribute: "BURN", streak: 1, power: 11, bridge: false },
      { instanceId: "track1-instance-1", attribute: "BURN", streak: 2, power: 12, bridge: true },
      { instanceId: "track1-instance-2", attribute: "WASH", streak: 3, power: 13, bridge: false },
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
