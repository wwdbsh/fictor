import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import materialsSource from "../../src/data/source/materials.json";
import lawsSource from "../../src/data/source/laws.json";
import resultClassesSource from "../../src/data/source/resultClasses.json";
import {
  createCombatState,
  decodeForgeResolverContext,
  decodeForgeRuntimeCommand,
  decodeForgeRuntimeState,
  FORGE_RUNTIME_ENGINE_VERSION,
  FORGE_RUNTIME_RESOLVER_VERSION,
  FORGE_RUNTIME_SCHEMA_VERSION,
  FORGE_RUNTIME_SOURCE_HASH,
  reduceForgeRuntime,
  reduceCombat,
  resolveForgeCard,
  type ForgeMaterial,
  type ForgeResolverContextV1,
  type ForgeResultClass,
  type ForgeRuntimeStateV1,
} from "../../src/domain";
import { canonicalSerialize, FORGE_RUNTIME_PROJECTION_HASH } from "../../src/domain/forge-runtime/source-binding";
import { fixtureSetup } from "./fixtures";

const sourceHash = FORGE_RUNTIME_SOURCE_HASH;

function context(): ForgeResolverContextV1 {
  const materials = materialsSource.map((item) => ({
    id: item.id,
    attribute: item.attribute,
    modifier_form: item.modifier_form,
    noun_form: item.noun_form,
    representation: item.representation,
    category: item.category,
    balance_status: item.balance_status,
    potency: item.potency,
    cost_base: item.cost_base,
    ...(item.category === "TOOL" ? { tool_domain: item.tool_domain } : {}),
  })) as ForgeMaterial[];
  const laws = lawsSource.map((item) => ({
    pair: item.pair,
    result_class: item.result_class,
    actor: item.actor,
    combat_effect: item.combat_effect,
    balance_status: item.balance_status,
    power_coefficient: item.power_coefficient,
    ...("drawback" in item ? { drawback: item.drawback } : {}),
  })) as unknown as ForgeResolverContextV1["inputs"]["laws"];
  const resultClasses = resultClassesSource.map((item) => ({
    id: item.id,
    family: item.family,
    density: item.density,
    density_status: item.density_status,
    combat_effect: item.combat_effect,
    ...("equipment_interactions" in item ? { equipment_interactions: item.equipment_interactions } : {}),
  })) as ForgeResultClass[];
  return {
    resolverVersion: FORGE_RUNTIME_RESOLVER_VERSION,
    sourceHash,
    materials,
    inputs: { laws, resultClasses },
  };
}

function runtime(active = false): ForgeRuntimeStateV1 {
  const first = materialsSource[0].id;
  const second = materialsSource[1].id;
  const ownedInstances = [
    { instanceId: "material-1", cardId: first },
    { instanceId: "material-2", cardId: second },
    { instanceId: "reserve", cardId: materialsSource[2].id },
  ];
  const state: ForgeRuntimeStateV1 = {
    schemaVersion: FORGE_RUNTIME_SCHEMA_VERSION,
    engineVersion: FORGE_RUNTIME_ENGINE_VERSION,
    resolverVersion: FORGE_RUNTIME_RESOLVER_VERSION,
    sourceHash,
    revision: 0,
    profile: { discoveredRecipeIds: [] },
    run: { fuel: 2, nextInstanceSequence: 0, ownedInstances, deck: ownedInstances.map((item) => item.instanceId), activeCombat: null },
  };
  if (active) {
    const setup = fixtureSetup({
      rules: { ...fixtureSetup().rules, drawCount: 2 },
      cards: [
        { cardId: first, effectId: "DELAYED_EXPLOSION", cost: 0, power: 1, resonanceAttribute: "STILL" },
        { cardId: second, effectId: "DELAYED_EXPLOSION", cost: 0, power: 1, resonanceAttribute: "BURN" },
      ],
      instances: ownedInstances.slice(0, 2),
      deck: ["material-1", "material-2"],
      programs: fixtureSetup().programs.slice(0, 1),
    });
    state.run.activeCombat = {
      state: createCombatState(setup),
      enrolledPersistentInstanceIds: ["material-1", "material-2"],
      forgeActionTurn: 0,
      forgeActionsRemaining: 0,
      isolatedMaterials: [],
      ephemeralResults: [],
    };
  }
  return state;
}

describe("forge runtime", () => {
  it("binds the real minimal source projection to the reviewed digest", () => {
    const resolverContext = context();
    const digest = createHash("sha256")
      .update(canonicalSerialize({ materials: resolverContext.materials, inputs: resolverContext.inputs }), "utf8")
      .digest("hex");
    expect(digest).toBe(FORGE_RUNTIME_PROJECTION_HASH);
    expect(decodeForgeResolverContext(resolverContext)).toMatchObject({ valid: true });
  });

  it("uses the canonical resolver for workshop and permanently replaces materials", () => {
    const raw = runtime();
    const expected = resolveForgeCard(context().materials[0], context().materials[1], context().inputs);
    const result = reduceForgeRuntime(raw, { type: "FORGE_WORKSHOP", materialInstanceIds: ["material-2", "material-1"] }, context());
    expect(result.state).not.toBeNull();
    expect(result.resolvedCard).toEqual(expected);
    expect(result.state?.run).toMatchObject({ fuel: 1, nextInstanceSequence: 1, deck: ["reserve", "forge-instance-v1-0"] });
    expect(result.state?.run.ownedInstances).toEqual([
      { instanceId: "reserve", cardId: materialsSource[2].id },
      { instanceId: "forge-instance-v1-0", cardId: expected.card_id },
    ]);
    expect(result.state).not.toBe(raw);
    expect(raw.run.fuel).toBe(2);
  });

  it("matches direct canonical resolution for all 1,326 pairs in both modes and orders", { timeout: 120_000 }, () => {
    const resolverContext = context();
    const started = reduceForgeRuntime(runtime(true), { type: "APPLY_COMBAT", command: { type: "START_TURN" } }, resolverContext);
    expect(started.state).not.toBeNull();
    const instantTemplate = started.state!;

    for (let left = 0; left < resolverContext.materials.length; left += 1) {
      for (let right = left + 1; right < resolverContext.materials.length; right += 1) {
        const firstMaterial = resolverContext.materials[left];
        const secondMaterial = resolverContext.materials[right];
        const expected = resolveForgeCard(firstMaterial, secondMaterial, resolverContext.inputs);
        for (const selection of [["material-1", "material-2"], ["material-2", "material-1"]] as const) {
          const workshop = runtime();
          workshop.run.ownedInstances[0].cardId = firstMaterial.id;
          workshop.run.ownedInstances[1].cardId = secondMaterial.id;
          const workshopResult = reduceForgeRuntime(workshop, { type: "FORGE_WORKSHOP", materialInstanceIds: [...selection] }, resolverContext);
          expect(workshopResult.resolvedCard?.card_id).toBe(expected.card_id);
          expect(workshopResult.resolvedCard?.recipe_id).toBe(expected.recipe_id);

          const instant = structuredClone(instantTemplate);
          instant.run.ownedInstances[0].cardId = firstMaterial.id;
          instant.run.ownedInstances[1].cardId = secondMaterial.id;
          instant.run.activeCombat!.state.instances[0].cardId = firstMaterial.id;
          instant.run.activeCombat!.state.instances[1].cardId = secondMaterial.id;
          instant.run.activeCombat!.state.cards[0].cardId = firstMaterial.id;
          instant.run.activeCombat!.state.cards[1].cardId = secondMaterial.id;
          const instantResult = reduceForgeRuntime(instant, { type: "FORGE_INSTANT", materialInstanceIds: [...selection] }, resolverContext);
          expect(instantResult.resolvedCard?.card_id).toBe(expected.card_id);
          expect(instantResult.resolvedCard?.recipe_id).toBe(expected.recipe_id);
        }
      }
    }
  });

  it("resets the instant budget, isolates by hand order, and restores on terminal cleanup", () => {
    let result = reduceForgeRuntime(runtime(true), { type: "APPLY_COMBAT", command: { type: "START_TURN" } }, context());
    expect(result.state?.run.activeCombat?.forgeActionsRemaining).toBe(1);
    result = reduceForgeRuntime(result.state, { type: "FORGE_INSTANT", materialInstanceIds: ["material-2", "material-1"] }, context());
    expect(result.resolvedCard).toEqual(resolveForgeCard(context().materials[0], context().materials[1], context().inputs));
    expect(result.state?.run.activeCombat?.isolatedMaterials.map((item) => item.instance.instanceId)).toEqual(["material-1", "material-2"]);
    expect(result.state?.run.activeCombat?.ephemeralResults).toEqual([
      expect.objectContaining({ instanceId: "forge-instance-v1-0", location: "HAND" }),
    ]);
    expect(result.state?.run.deck).toEqual(["material-1", "material-2", "reserve"]);

    const terminal = structuredClone(result.state!);
    terminal.run.activeCombat!.state.enemy.hp = 0;
    terminal.run.activeCombat!.state.status = "VICTORY";
    terminal.run.activeCombat!.state.phase = "TERMINAL";
    result = reduceForgeRuntime(terminal, { type: "CLEANUP_COMBAT" }, context());
    expect(result.events.at(-1)).toEqual({
      type: "INSTANT_FORGE_CLEANED",
      restoredInstanceIds: ["material-1", "material-2"],
      removedEphemeralInstanceIds: ["forge-instance-v1-0"],
    });
    expect(result.state?.run.activeCombat?.state.zones.deck.slice(-2)).toEqual(["material-1", "material-2"]);
    const repeated = reduceForgeRuntime(result.state, { type: "CLEANUP_COMBAT" }, context());
    expect(repeated.events).toEqual([]);
    expect(repeated.state).toEqual(result.state);
  });

  it("preserves budget on nested rejection and resets it only on a successful next turn", () => {
    let result = reduceForgeRuntime(runtime(true), { type: "APPLY_COMBAT", command: { type: "START_TURN" } }, context());
    result = reduceForgeRuntime(result.state, { type: "FORGE_INSTANT", materialInstanceIds: ["material-1", "material-2"] }, context());
    const afterForge = structuredClone(result.state);
    const rejected = reduceForgeRuntime(result.state, { type: "APPLY_COMBAT", command: { type: "START_TURN" } }, context());
    expect(rejected.events).toEqual([{ type: "COMMAND_REJECTED", command: "START_TURN", reason: "INVALID_PHASE" }]);
    expect(rejected.state).toEqual(afterForge);
    expect(rejected.state?.run.activeCombat?.forgeActionsRemaining).toBe(0);

    result = reduceForgeRuntime(rejected.state, { type: "APPLY_COMBAT", command: { type: "END_TURN" } }, context());
    expect(result.state?.run.activeCombat?.forgeActionsRemaining).toBe(0);
    result = reduceForgeRuntime(result.state, { type: "APPLY_COMBAT", command: { type: "START_TURN" } }, context());
    expect(result.state?.run.activeCombat).toMatchObject({ forgeActionTurn: 2, forgeActionsRemaining: 1 });
  });

  function lethalRuntime(kind: "PLAY" | "END"): ForgeRuntimeStateV1 {
    const base = runtime(true);
    const first = base.run.ownedInstances[0];
    const second = base.run.ownedInstances[1];
    const third = base.run.ownedInstances[2];
    const setup = fixtureSetup({
      rules: { ...fixtureSetup().rules, drawCount: 3 },
      player: { hp: kind === "END" ? 1 : 30, maxHp: 30, block: 0 },
      enemy: { ...fixtureSetup().enemy, hp: kind === "PLAY" ? 1 : 40, maxHp: 40 },
      cards: [
        { cardId: first.cardId, effectId: "DELAYED_EXPLOSION", cost: 0, power: 1, resonanceAttribute: "STILL" },
        { cardId: second.cardId, effectId: "DELAYED_EXPLOSION", cost: 0, power: 1, resonanceAttribute: "BURN" },
        { cardId: third.cardId, effectId: "DELAYED_EXPLOSION", cost: 0, power: 10, resonanceAttribute: "SCATTER" },
      ],
      instances: [first, second, third],
      deck: [first.instanceId, second.instanceId, third.instanceId],
      programs: fixtureSetup().programs.slice(0, 1),
    });
    const started = reduceCombat(createCombatState(setup), { type: "START_TURN" });
    base.run.activeCombat = {
      state: started.state,
      enrolledPersistentInstanceIds: [first.instanceId, second.instanceId, third.instanceId],
      forgeActionTurn: 1,
      forgeActionsRemaining: 1,
      isolatedMaterials: [],
      ephemeralResults: [],
    };
    return base;
  }

  it.each(["PLAY", "END"] as const)("auto-cleans after a lethal %s transition, after combat events", (kind) => {
    let result = reduceForgeRuntime(lethalRuntime(kind), { type: "FORGE_INSTANT", materialInstanceIds: ["material-1", "material-2"] }, context());
    result = reduceForgeRuntime(
      result.state,
      {
        type: "APPLY_COMBAT",
        command: kind === "PLAY"
          ? { type: "PLAY_CARD", instanceId: "reserve", target: { kind: "ENEMY", enemyId: "enemy_fixture" } }
          : { type: "END_TURN" },
      },
      context(),
    );
    expect(result.state?.run.activeCombat?.state.status).toBe(kind === "PLAY" ? "VICTORY" : "DEFEAT");
    expect(result.events.at(-1)?.type).toBe("INSTANT_FORGE_CLEANED");
    expect(result.events.findIndex((event) => event.type === "COMBAT_ENDED")).toBeLessThan(result.events.length - 1);
    expect(result.state?.run.activeCombat?.state.zones.deck.slice(-2)).toEqual(["material-1", "material-2"]);
    expect(result.state?.run.activeCombat?.ephemeralResults).toEqual([]);
    expect(result.state?.run.activeCombat?.forgeActionsRemaining).toBe(0);
  });

  it("rejects persisted budget bypasses and a second instant forge in one turn", () => {
    const readyBypass = runtime(true);
    readyBypass.run.activeCombat!.forgeActionsRemaining = 1;
    expect(decodeForgeRuntimeState(readyBypass).valid).toBe(false);

    const started = reduceForgeRuntime(runtime(true), { type: "APPLY_COMBAT", command: { type: "START_TURN" } }, context());
    const valueTwo = structuredClone(started.state!);
    valueTwo.run.activeCombat!.forgeActionsRemaining = 2;
    expect(decodeForgeRuntimeState(valueTwo).valid).toBe(false);
    const wrongTurn = structuredClone(started.state!);
    wrongTurn.run.activeCombat!.forgeActionTurn = 0;
    expect(decodeForgeRuntimeState(wrongTurn).valid).toBe(false);

    const four = runtime();
    four.run.ownedInstances.push({ instanceId: "material-4", cardId: materialsSource[3].id });
    four.run.deck.push("material-4");
    const setup = fixtureSetup({
      rules: { ...fixtureSetup().rules, drawCount: 4 },
      cards: four.run.ownedInstances.map((item, index) => ({
        cardId: item.cardId,
        effectId: "DELAYED_EXPLOSION" as const,
        cost: 0,
        power: 1,
        resonanceAttribute: (["STILL", "BURN", "SCATTER", "ROT"] as const)[index],
      })),
      instances: four.run.ownedInstances,
      deck: four.run.deck,
      programs: fixtureSetup().programs.slice(0, 1),
    });
    const combat = reduceCombat(createCombatState(setup), { type: "START_TURN" });
    four.run.activeCombat = {
      state: combat.state,
      enrolledPersistentInstanceIds: [...four.run.deck],
      forgeActionTurn: 1,
      forgeActionsRemaining: 1,
      isolatedMaterials: [],
      ephemeralResults: [],
    };
    const first = reduceForgeRuntime(four, { type: "FORGE_INSTANT", materialInstanceIds: ["material-1", "material-2"] }, context());
    const beforeSecond = structuredClone(first.state);
    const second = reduceForgeRuntime(first.state, { type: "FORGE_INSTANT", materialInstanceIds: ["reserve", "material-4"] }, context());
    expect(second.events).toEqual([{ type: "FORGE_REJECTED", command: "FORGE_INSTANT", reason: "NO_FORGE_ACTION" }]);
    expect(second.state).toEqual(beforeSecond);
  });

  it("returns atomic failures without consuming fuel, sequence, or discovery", () => {
    const original = runtime();
    const cases = [
      { type: "FORGE_WORKSHOP", materialInstanceIds: ["material-1", "material-1"] },
      { type: "FORGE_WORKSHOP", materialInstanceIds: ["missing", "material-1"] },
    ];
    for (const command of cases) {
      const result = reduceForgeRuntime(original, command, context());
      expect(result.state).toEqual(original);
      expect(result.state).not.toBe(original);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe("FORGE_REJECTED");
    }
  });

  it("distinguishes same definitions, collision, exhaustion, fuel, and context mismatch", () => {
    const same = runtime();
    same.run.ownedInstances[1].cardId = same.run.ownedInstances[0].cardId;
    expect(reduceForgeRuntime(same, { type: "FORGE_WORKSHOP", materialInstanceIds: ["material-1", "material-2"] }, context()).events[0]).toMatchObject({ reason: "SAME_MATERIAL_DEFINITION" });

    const collision = runtime();
    collision.run.ownedInstances.push({ instanceId: "forge-instance-v1-0", cardId: materialsSource[3].id });
    collision.run.deck.push("forge-instance-v1-0");
    expect(reduceForgeRuntime(collision, { type: "FORGE_WORKSHOP", materialInstanceIds: ["material-1", "material-2"] }, context()).events[0]).toMatchObject({ reason: "INSTANCE_ID_COLLISION" });

    const exhausted = runtime();
    exhausted.run.nextInstanceSequence = Number.MAX_SAFE_INTEGER;
    expect(reduceForgeRuntime(exhausted, { type: "FORGE_WORKSHOP", materialInstanceIds: ["material-1", "material-2"] }, context()).events[0]).toMatchObject({ reason: "INSTANCE_SEQUENCE_EXHAUSTED" });

    const noFuel = runtime();
    noFuel.run.fuel = 0;
    expect(reduceForgeRuntime(noFuel, { type: "FORGE_WORKSHOP", materialInstanceIds: ["material-1", "material-2"] }, context()).events[0]).toMatchObject({ reason: "INSUFFICIENT_FUEL" });

    const wrongVersion = context() as unknown as { resolverVersion: string };
    wrongVersion.resolverVersion = "canonical-v2";
    expect(reduceForgeRuntime(runtime(), { type: "FORGE_WORKSHOP", materialInstanceIds: ["material-1", "material-2"] }, wrongVersion).events[0]).toMatchObject({ reason: "INVALID_CONTEXT" });
    const wrongHash = context() as unknown as { sourceHash: string };
    wrongHash.sourceHash = "b".repeat(64);
    expect(reduceForgeRuntime(runtime(), { type: "FORGE_WORKSHOP", materialInstanceIds: ["material-1", "material-2"] }, wrongHash).events[0]).toMatchObject({ reason: "INVALID_CONTEXT" });
  });

  it("rejects official-hash projection tampering and self-consistent fake bindings", () => {
    const mutations: Array<(candidate: ForgeResolverContextV1) => void> = [
      (candidate) => { candidate.materials[0].id = "fake_material"; },
      (candidate) => { candidate.materials[0].attribute = "BURN"; },
      (candidate) => { candidate.inputs.laws[0].actor = "JOIN"; },
      (candidate) => { candidate.inputs.resultClasses[0].density = "MAX"; },
      (candidate) => {
        const equipment = candidate.inputs.resultClasses.find((item) => item.family === "EQUIPMENT")!;
        equipment.equipment_interactions![0].passive_effect_id = "FAKE_PASSIVE";
      },
      (candidate) => { candidate.inputs.tuning = { SAME_BONUS: 0, COST_DIVISOR: 1 }; },
    ];
    for (const mutate of mutations) {
      const tampered = structuredClone(context());
      mutate(tampered);
      const original = runtime();
      const result = reduceForgeRuntime(original, { type: "FORGE_WORKSHOP", materialInstanceIds: ["material-1", "material-2"] }, tampered);
      expect(result.events).toEqual([{ type: "FORGE_REJECTED", command: "FORGE_WORKSHOP", reason: "INVALID_CONTEXT" }]);
      expect(result.state).toEqual(original);
    }

    const fakeState = runtime() as unknown as { sourceHash: string };
    const fakeContext = context() as unknown as { sourceHash: string };
    fakeState.sourceHash = "b".repeat(64);
    fakeContext.sourceHash = "b".repeat(64);
    expect(reduceForgeRuntime(fakeState, { type: "FORGE_WORKSHOP", materialInstanceIds: ["material-1", "material-2"] }, fakeContext)).toEqual({
      state: null,
      events: [{ type: "FORGE_REJECTED", command: "UNKNOWN", reason: "INVALID_STATE" }],
    });
  });

  it("keeps discovery atomic and returns deterministic detached results", () => {
    const command = { type: "FORGE_WORKSHOP" as const, materialInstanceIds: ["material-1", "material-2"] as [string, string] };
    const first = reduceForgeRuntime(runtime(), command, context());
    const second = reduceForgeRuntime(runtime(), command, context());
    expect(second).toEqual(first);
    expect(first.state?.revision).toBe(1);
    expect(first.events.filter((event) => event.type === "RECIPE_DISCOVERED")).toHaveLength(1);

    const known = runtime();
    known.profile.discoveredRecipeIds = [first.resolvedCard!.recipe_id];
    const existing = reduceForgeRuntime(known, command, context());
    expect(existing.events.some((event) => event.type === "RECIPE_DISCOVERED")).toBe(false);
    expect(existing.state?.profile.discoveredRecipeIds).toEqual(known.profile.discoveredRecipeIds);

    first.state!.run.fuel = 99;
    first.resolvedCard!.material_ids[0] = "mutated";
    expect(second.state?.run.fuel).toBe(1);
    expect(second.state?.run.ownedInstances.at(-1)?.cardId).not.toBe("mutated");
  });

  it("rejects strict malformed boundaries and adopts a detached decode value", () => {
    const source = runtime();
    const decoded = decodeForgeRuntimeState(source);
    expect(decoded.valid).toBe(true);
    source.run.fuel = 99;
    if (decoded.valid) expect(decoded.value.run.fuel).toBe(2);

    const accessor = runtime() as unknown as Record<string, unknown>;
    Object.defineProperty(accessor, "revision", { get: () => 0, enumerable: true });
    expect(decodeForgeRuntimeState(accessor).valid).toBe(false);
    const cyclic = runtime() as ForgeRuntimeStateV1 & { cycle?: unknown };
    cyclic.cycle = cyclic;
    expect(decodeForgeRuntimeState(cyclic).valid).toBe(false);

    const malformed: unknown[] = [];
    const extra = runtime() as ForgeRuntimeStateV1 & { extra?: unknown };
    extra.extra = true;
    malformed.push(extra);
    const symbol = runtime() as ForgeRuntimeStateV1 & Record<symbol, unknown>;
    symbol[Symbol("forbidden")] = true;
    malformed.push(symbol);
    const callback = runtime() as ForgeRuntimeStateV1 & { callback?: unknown };
    callback.callback = () => undefined;
    malformed.push(callback);
    const sparse = runtime();
    sparse.run.deck = new Array(3) as string[];
    malformed.push(sparse);
    const nonfinite = runtime();
    nonfinite.run.fuel = Number.POSITIVE_INFINITY;
    malformed.push(nonfinite);
    const inherited = Object.assign(Object.create({ inherited: true }) as ForgeRuntimeStateV1, runtime());
    malformed.push(inherited);
    for (const candidate of malformed) expect(decodeForgeRuntimeState(candidate).valid).toBe(false);

    const proxied = runtime();
    let fuelDescriptorReads = 0;
    proxied.run = new Proxy(proxied.run, {
      getOwnPropertyDescriptor(target, property) {
        if (property === "fuel") fuelDescriptorReads += 1;
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });
    expect(decodeForgeRuntimeState(proxied).valid).toBe(true);
    expect(fuelDescriptorReads).toBe(1);
  });

  it("snapshots descriptor-changing command and context proxies exactly once", () => {
    let commandTypeReads = 0;
    const commandTarget = { type: "FORGE_WORKSHOP", materialInstanceIds: ["material-1", "material-2"] };
    const command = new Proxy(commandTarget, {
      getOwnPropertyDescriptor(target, property) {
        if (property !== "type") return Reflect.getOwnPropertyDescriptor(target, property);
        commandTypeReads += 1;
        return { configurable: true, enumerable: true, writable: true, value: commandTypeReads === 1 ? "FORGE_WORKSHOP" : "CLEANUP_COMBAT" };
      },
    });
    const decodedCommand = decodeForgeRuntimeCommand(command);
    expect(decodedCommand).toMatchObject({ valid: true, value: { type: "FORGE_WORKSHOP" } });
    expect(commandTypeReads).toBe(1);

    let sourceHashReads = 0;
    const contextTarget = context();
    const proxiedContext = new Proxy(contextTarget, {
      getOwnPropertyDescriptor(target, property) {
        if (property !== "sourceHash") return Reflect.getOwnPropertyDescriptor(target, property);
        sourceHashReads += 1;
        return { configurable: true, enumerable: true, writable: true, value: sourceHashReads === 1 ? FORGE_RUNTIME_SOURCE_HASH : "b".repeat(64) };
      },
    });
    expect(decodeForgeResolverContext(proxiedContext)).toMatchObject({ valid: true });
    expect(sourceHashReads).toBe(1);
  });
});
