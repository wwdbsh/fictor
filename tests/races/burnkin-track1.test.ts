import { describe, expect, it } from "vitest";

import {
  BROWSER_RUNTIME_PACKET,
  BURNKIN_TRACK1_RULES,
  BURNKIN_TRACK1_SAVE_KEY,
  createBurnkinTrack1Controller,
  createStillkinTrack1Controller,
  createTrack1Controller,
  type StillkinTrack1Controller,
  type StillkinTrack1Snapshot,
} from "../../src/application";
import { FICTOR_SAVE_V2_KEY, type StorageLike } from "../../src/persistence";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function create(storage = new MemoryStorage(), suffix = "burnkin") {
  const controller = createBurnkinTrack1Controller({
    storage,
    resolverContext: BROWSER_RUNTIME_PACKET.resolverContext,
    generationFactory: () => `${suffix}-generation`,
  });
  return { controller, storage, snapshot: controller.load().snapshot };
}

function binding(snapshot: StillkinTrack1Snapshot) {
  if (!snapshot.flow.combatBinding) throw new Error("combat binding unavailable");
  return { expectedRevision: snapshot.flow.revision, ...snapshot.flow.combatBinding };
}

function dispatch(controller: StillkinTrack1Controller, command: Parameters<StillkinTrack1Controller["dispatch"]>[0]) {
  const result = controller.dispatch(command);
  expect(result.applied, result.reason).toBe(true);
  return result;
}

function enter(controller: StillkinTrack1Controller, snapshot: StillkinTrack1Snapshot) {
  return dispatch(controller, { type: "ENTER_NEXT_NODE", expectedRevision: snapshot.flow.revision, runId: snapshot.flow.runId }).snapshot;
}

function winCombat(controller: StillkinTrack1Controller, snapshot: StillkinTrack1Snapshot): StillkinTrack1Snapshot {
  let current = snapshot;
  for (let step = 0; step < 1_000 && current.flow.phase === "IN_COMBAT"; step += 1) {
    const active = current.runtime.run.activeCombat!.state;
    if (active.phase === "TURN_READY") {
      current = dispatch(controller, { type: "APPLY_COMBAT", ...binding(current), command: { type: "START_TURN" } }).snapshot;
      continue;
    }
    const candidate = active.zones.hand.find((instanceId) => {
      const instance = active.instances.find((item) => item.instanceId === instanceId);
      const card = active.cards.find((item) => item.cardId === instance?.cardId);
      return card?.cost !== null && card !== undefined && card.cost <= active.player.energy;
    });
    if (candidate) {
      const instance = active.instances.find((item) => item.instanceId === candidate)!;
      const card = active.cards.find((item) => item.cardId === instance.cardId)!;
      const program = active.programs.find((item) => item.effectId === card.effectId)!;
      current = dispatch(controller, {
        type: "APPLY_COMBAT",
        ...binding(current),
        command: {
          type: "PLAY_CARD",
          instanceId: candidate,
          target: program.targetRule.kind === "NONE" ? null : { kind: "ENEMY", enemyId: active.enemy.enemyId },
        },
      }).snapshot;
    } else {
      current = dispatch(controller, { type: "APPLY_COMBAT", ...binding(current), command: { type: "END_TURN" } }).snapshot;
    }
  }
  expect(current.flow.phase).not.toBe("IN_COMBAT");
  return current;
}

function advanceToElite(controller: StillkinTrack1Controller, snapshot: StillkinTrack1Snapshot): StillkinTrack1Snapshot {
  let current = snapshot;
  for (let step = 0; step < 1_000; step += 1) {
    if (current.flow.phase === "IN_COMBAT" && current.flow.currentNodeIndex === 3) return current;
    if (current.flow.phase === "BETWEEN_NODES") current = enter(controller, current);
    else if (current.flow.phase === "IN_COMBAT") current = winCombat(controller, current);
    else if (current.flow.phase === "AWAITING_REWARD") {
      const choice = current.rewardChoices[0] as { choiceId: string };
      current = dispatch(controller, { type: "CHOOSE_REWARD", expectedRevision: current.flow.revision, runId: current.flow.runId, choiceId: choice.choiceId }).snapshot;
    } else if (current.flow.phase === "IN_EVENT") {
      const choice = current.eventChoices.find(({ price }) => price === 0) ?? current.eventChoices[0];
      current = dispatch(controller, { type: "RESOLVE_EVENT", expectedRevision: current.flow.revision, runId: current.flow.runId, choiceId: choice.choiceId }).snapshot;
    } else if (current.flow.phase === "EVENT_RESOLVED") {
      if (current.flow.workshopEntitlementNodeId) {
        const left = current.runtime.run.ownedInstances[0];
        const right = current.runtime.run.ownedInstances.find(({ cardId }) => cardId !== left.cardId)!;
        current = dispatch(controller, { type: "USE_FREE_WORKSHOP", expectedRevision: current.flow.revision, runId: current.flow.runId, materialInstanceIds: [left.instanceId, right.instanceId] }).snapshot;
      }
      current = dispatch(controller, { type: "LEAVE_EVENT", expectedRevision: current.flow.revision, runId: current.flow.runId }).snapshot;
    } else throw new Error(`unexpected phase before elite: ${current.flow.phase}`);
  }
  throw new Error("elite combat was not reached");
}

describe("Burnkin Track 1 integration", () => {
  it("fails closed for a runtime race outside the enabled Track 1 union", () => {
    expect(() => createTrack1Controller({}, "Joinkin" as never)).toThrow(TypeError);
  });

  it("binds a distinct BURN starter, doubled provisional resonance, and isolated save key", () => {
    const storage = new MemoryStorage();
    const burnkin = create(storage, "burnkin-authority");
    expect(burnkin.snapshot).toMatchObject({ raceId: "Burnkin", raceLabelKo: "사름붙이" });
    expect(burnkin.snapshot.runtime.run.ownedInstances).toHaveLength(30);
    expect(new Set(burnkin.snapshot.runtime.run.ownedInstances.map(({ cardId }) => cardId))).toEqual(
      new Set(["ore_burn", "burn_01", "burn_02", "burn_03", "burn_04", "burn_05"]),
    );

    const combat = enter(burnkin.controller, burnkin.snapshot);
    expect(combat.runtime.run.activeCombat?.state.rules).toMatchObject({
      resonanceRate: 0.16,
      blockRetention: { numerator: 0, denominator: 1, rounding: "FLOOR" },
    });
    expect(storage.values.has(BURNKIN_TRACK1_SAVE_KEY)).toBe(true);
    expect(storage.values.has(FICTOR_SAVE_V2_KEY)).toBe(false);

    const started = dispatch(burnkin.controller, { type: "APPLY_COMBAT", ...binding(combat), command: { type: "START_TURN" } });
    const action = started.snapshot;
    const instanceId = action.runtime.run.activeCombat!.state.zones.hand[0];
    const played = dispatch(burnkin.controller, { type: "APPLY_COMBAT", ...binding(action), command: { type: "PLAY_CARD", instanceId, target: { kind: "ENEMY", enemyId: action.flow.combatBinding!.encounterId } } });
    expect(played.events.find(({ type }) => type === "CARD_PLAYED")).toMatchObject({ effectivePower: 11.6 });

    const stillkin = createStillkinTrack1Controller({
      storage,
      resolverContext: BROWSER_RUNTIME_PACKET.resolverContext,
      generationFactory: () => "stillkin-generation",
    }).load().snapshot;
    expect(stillkin.raceId).toBe("Stillkin");
    expect(stillkin.runtime.run.ownedInstances[0].cardId).toBe("ore_still");
  });

  it("applies passive and Kindle through the persisted controller without partial failures", () => {
    const { controller, snapshot } = create(undefined, "burnkin-actions");
    let current = enter(controller, snapshot);
    current = dispatch(controller, { type: "APPLY_COMBAT", ...binding(current), command: { type: "START_TURN" } }).snapshot;
    const active = current.runtime.run.activeCombat!.state;
    const first = active.zones.hand[0];
    current = dispatch(controller, { type: "APPLY_COMBAT", ...binding(current), command: { type: "PLAY_CARD", instanceId: first, target: { kind: "ENEMY", enemyId: active.enemy.enemyId } } }).snapshot;

    const beforePassive = current;
    const paid = dispatch(controller, { type: "BURNKIN_PAY_HP", ...binding(current) });
    current = paid.snapshot;
    expect(current.runtime.run.activeCombat?.state.player).toMatchObject({
      hp: beforePassive.runtime.run.activeCombat!.state.player.hp - BURNKIN_TRACK1_RULES.hpToEnergy.hpCost,
      energy: beforePassive.runtime.run.activeCombat!.state.player.energy + BURNKIN_TRACK1_RULES.hpToEnergy.energyGain,
    });
    expect(paid.events.map(({ type }) => type)).toEqual(["BURNKIN_HP_PAID", "BURNKIN_ENERGY_GAINED"]);

    const stale = controller.dispatch({ type: "BURNKIN_PAY_HP", ...binding(beforePassive) });
    expect(stale).toMatchObject({ applied: false, reason: "STALE_REVISION" });
    expect(controller.snapshot()).toEqual(current);

    const spend = current.runtime.run.activeCombat!.state.zones.hand[0];
    current = dispatch(controller, { type: "APPLY_COMBAT", ...binding(current), command: { type: "PLAY_CARD", instanceId: spend, target: { kind: "ENEMY", enemyId: current.flow.combatBinding!.encounterId } } }).snapshot;
    const playable = current.runtime.run.activeCombat!.state.zones.hand[0];
    const kindled = dispatch(controller, { type: "BURNKIN_KINDLE", ...binding(current), instanceId: playable });
    expect(kindled.snapshot.runtime.run.activeCombat?.state.zones.exile).toContain(playable);
    expect(kindled.events.map(({ type }) => type)).toEqual(["BURNKIN_CARD_KINDLED", "BURNKIN_ENERGY_GAINED"]);
  });

  it("applies and persists direct self-harm when a played card breaks BURN resonance", () => {
    const created = create(undefined, "burnkin-break");
    let current = advanceToElite(created.controller, created.snapshot);
    current = dispatch(created.controller, { type: "APPLY_COMBAT", ...binding(current), command: { type: "START_TURN" } }).snapshot;

    const bytes = JSON.parse(created.storage.values.get(BURNKIN_TRACK1_SAVE_KEY)!) as any;
    const state = bytes.runtime.run.activeCombat.state;
    const oreStill = state.instances.find((instance: any) => instance.cardId === "ore_still");
    const burnInHand = state.zones.hand.find((instanceId: string) => state.instances.find((instance: any) => instance.instanceId === instanceId)?.cardId !== "ore_still");
    expect(oreStill).toBeTruthy();
    expect(burnInHand).toBeTruthy();
    if (!state.zones.hand.includes(oreStill.instanceId)) {
      const source = ["deck", "discard", "exile"].find((zone) => state.zones[zone].includes(oreStill.instanceId));
      expect(source).toBeTruthy();
      state.zones.hand[state.zones.hand.indexOf(burnInHand)] = oreStill.instanceId;
      state.zones[source!][state.zones[source!].indexOf(oreStill.instanceId)] = burnInHand;
      created.storage.values.set(BURNKIN_TRACK1_SAVE_KEY, JSON.stringify(bytes));
    }

    const reloaded = createBurnkinTrack1Controller({
      storage: created.storage,
      resolverContext: BROWSER_RUNTIME_PACKET.resolverContext,
      generationFactory: () => "unused-break-generation",
    });
    current = reloaded.load().snapshot;
    expect(current.persistence.writeBlocked).toBe(false);
    const active = current.runtime.run.activeCombat!.state;
    const burnId = active.zones.hand.find((instanceId) => active.instances.find((instance) => instance.instanceId === instanceId)?.cardId !== "ore_still")!;
    const target = { kind: "ENEMY" as const, enemyId: active.enemy.enemyId };
    current = dispatch(reloaded, { type: "APPLY_COMBAT", ...binding(current), command: { type: "PLAY_CARD", instanceId: burnId, target } }).snapshot;
    const hpBeforeBreak = current.runtime.run.activeCombat!.state.player.hp;
    const stillId = current.runtime.run.activeCombat!.state.zones.hand.find((instanceId) => current.runtime.run.activeCombat!.state.instances.find((instance) => instance.instanceId === instanceId)?.cardId === "ore_still")!;
    const broken = dispatch(reloaded, { type: "APPLY_COMBAT", ...binding(current), command: { type: "PLAY_CARD", instanceId: stillId, target } });
    expect(broken.events.find(({ type }) => type === "BURNKIN_RESONANCE_BROKEN")).toMatchObject({
      from: "BURN",
      to: "STILL",
      selfDamage: BURNKIN_TRACK1_RULES.resonanceBreakSelfDamage,
      remainingHp: hpBeforeBreak - BURNKIN_TRACK1_RULES.resonanceBreakSelfDamage,
    });
    expect(broken.snapshot.runtime.run.activeCombat?.state.player.hp).toBe(hpBeforeBreak - 1);
    expect(createBurnkinTrack1Controller({ storage: created.storage, resolverContext: BROWSER_RUNTIME_PACKET.resolverContext }).load().snapshot.persistence.writeBlocked).toBe(false);
  });

  it("completes the existing ice vertical slice with Burnkin", () => {
    const { controller, snapshot } = create(undefined, "burnkin-full-run");
    let current = snapshot;
    for (let step = 0; step < 2_000 && current.flow.phase !== "RUN_WON"; step += 1) {
      if (current.flow.phase === "BETWEEN_NODES") current = enter(controller, current);
      else if (current.flow.phase === "IN_COMBAT") current = winCombat(controller, current);
      else if (current.flow.phase === "AWAITING_REWARD") {
        const choice = current.rewardChoices[0] as { choiceId: string };
        current = dispatch(controller, { type: "CHOOSE_REWARD", expectedRevision: current.flow.revision, runId: current.flow.runId, choiceId: choice.choiceId }).snapshot;
      } else if (current.flow.phase === "IN_EVENT") {
        const choice = current.eventChoices.find(({ price }) => price === 0) ?? current.eventChoices[0];
        current = dispatch(controller, { type: "RESOLVE_EVENT", expectedRevision: current.flow.revision, runId: current.flow.runId, choiceId: choice.choiceId }).snapshot;
      } else if (current.flow.phase === "EVENT_RESOLVED") {
        if (current.flow.workshopEntitlementNodeId) {
          const materials = current.runtime.run.ownedInstances;
          const left = materials[0];
          const right = materials.find(({ cardId }) => cardId !== left.cardId)!;
          current = dispatch(controller, { type: "USE_FREE_WORKSHOP", expectedRevision: current.flow.revision, runId: current.flow.runId, materialInstanceIds: [left.instanceId, right.instanceId] }).snapshot;
        }
        current = dispatch(controller, { type: "LEAVE_EVENT", expectedRevision: current.flow.revision, runId: current.flow.runId }).snapshot;
      } else if (current.flow.phase === "RUN_LOST") throw new Error("Burnkin provisional route lost before boss completion");
    }
    expect(current.flow.phase).toBe("RUN_WON");
    expect(current.profile.ownedHeartIds).toContain("heart__still");
    expect(current.raceId).toBe("Burnkin");
  });
});
