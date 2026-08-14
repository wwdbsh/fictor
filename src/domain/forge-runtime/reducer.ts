import { reduceCombat } from "../combat";
import type { CardInstance, CombatEvent } from "../combat";
import { resolveForgeCard } from "../forge";
import type { GeneratedCard } from "../forge";
import {
  decodeForgeResolverContext,
  decodeForgeRuntimeCommand,
  decodeForgeRuntimeState,
  decodePostcondition,
} from "./boundary";
import {
  FORGE_RUNTIME_FUEL_COST,
  type ActiveCombatForgeRuntime,
  type ForgeResolverContextV1,
  type ForgeRuntimeCommand,
  type ForgeRuntimeEvent,
  type ForgeRuntimeFailureCode,
  type ForgeRuntimeReducerResult,
  type ForgeRuntimeStateV1,
  type ForgeRuntimeSuccessResult,
} from "./types";

function invalidState(): ForgeRuntimeReducerResult {
  return {
    state: null,
    events: [{ type: "FORGE_REJECTED", command: "UNKNOWN", reason: "INVALID_STATE" }],
  };
}

function reject(
  state: ForgeRuntimeStateV1,
  command: ForgeRuntimeCommand["type"] | "UNKNOWN",
  reason: ForgeRuntimeFailureCode,
): ForgeRuntimeSuccessResult {
  return { state, events: [{ type: "FORGE_REJECTED", command, reason }] };
}

function knownInstanceIds(state: ForgeRuntimeStateV1): Set<string> {
  const ids = new Set(state.run.ownedInstances.map((instance) => instance.instanceId));
  const active = state.run.activeCombat;
  if (active) {
    for (const instance of active.state.instances) ids.add(instance.instanceId);
    for (const item of active.isolatedMaterials) ids.add(item.instance.instanceId);
    for (const item of active.ephemeralResults) ids.add(item.instanceId);
  }
  return ids;
}

function nextInstanceId(
  state: ForgeRuntimeStateV1,
): { ok: true; instanceId: string } | { ok: false; reason: ForgeRuntimeFailureCode } {
  if (state.run.nextInstanceSequence === Number.MAX_SAFE_INTEGER) {
    return { ok: false, reason: "INSTANCE_SEQUENCE_EXHAUSTED" };
  }
  const instanceId = `forge-instance-v1-${state.run.nextInstanceSequence}`;
  if (knownInstanceIds(state).has(instanceId)) return { ok: false, reason: "INSTANCE_ID_COLLISION" };
  return { ok: true, instanceId };
}

function insertDiscovery(state: ForgeRuntimeStateV1, recipeId: string): boolean {
  if (state.profile.discoveredRecipeIds.includes(recipeId)) return false;
  state.profile.discoveredRecipeIds.push(recipeId);
  state.profile.discoveredRecipeIds.sort();
  return true;
}

function isSafeResolvedCard(card: GeneratedCard): boolean {
  if (card.stats === null) return true;
  const { potency, cost, power } = card.stats;
  return (
    (potency === null || (Number.isFinite(potency) && potency >= 0 && potency <= Number.MAX_SAFE_INTEGER)) &&
    (cost === null || (Number.isSafeInteger(cost) && cost >= 0)) &&
    (power === null || (Number.isFinite(power) && power >= 0 && power <= Number.MAX_SAFE_INTEGER))
  );
}

function cleanupActive(active: ActiveCombatForgeRuntime): ForgeRuntimeEvent {
  const restoredInstanceIds = active.isolatedMaterials.map((item) => item.instance.instanceId);
  const removedEphemeralInstanceIds = active.ephemeralResults.map((item) => item.instanceId);
  active.state.instances.push(...active.isolatedMaterials.map((item) => item.instance));
  active.state.zones.deck.push(...restoredInstanceIds);
  active.isolatedMaterials = [];
  active.ephemeralResults = [];
  return {
    type: "INSTANT_FORGE_CLEANED",
    restoredInstanceIds,
    removedEphemeralInstanceIds,
  };
}

function commit(
  candidate: ForgeRuntimeStateV1,
  rollbackState: ForgeRuntimeStateV1,
  events: ForgeRuntimeEvent[],
  command: ForgeRuntimeCommand["type"],
  resolvedCard?: ReturnType<typeof resolveForgeCard>,
): ForgeRuntimeSuccessResult {
  const decoded = decodePostcondition(candidate);
  if (!decoded.valid) return reject(rollbackState, command, "POSTCONDITION_FAILED");
  return resolvedCard
    ? { state: decoded.value, events, resolvedCard }
    : { state: decoded.value, events };
}

function selectInstances(
  state: ForgeRuntimeStateV1,
  command: Extract<ForgeRuntimeCommand, { type: "FORGE_INSTANT" | "FORGE_WORKSHOP" }>,
):
  | { ok: true; instances: [CardInstance, CardInstance] }
  | { ok: false; reason: ForgeRuntimeFailureCode } {
  const [firstId, secondId] = command.materialInstanceIds;
  if (firstId === secondId) return { ok: false, reason: "DUPLICATE_INSTANCE_SELECTION" };
  const first = state.run.ownedInstances.find((item) => item.instanceId === firstId);
  const second = state.run.ownedInstances.find((item) => item.instanceId === secondId);
  if (!first || !second) return { ok: false, reason: "INSTANCE_NOT_FOUND" };
  return { ok: true, instances: [first, second] };
}

function materialDefinitions(
  context: ForgeResolverContextV1,
  instances: [CardInstance, CardInstance],
):
  | { ok: true; materials: [ForgeResolverContextV1["materials"][number], ForgeResolverContextV1["materials"][number]] }
  | { ok: false; reason: ForgeRuntimeFailureCode } {
  const firstMaterial = context.materials.find((item) => item.id === instances[0].cardId);
  const secondMaterial = context.materials.find((item) => item.id === instances[1].cardId);
  if (!firstMaterial || !secondMaterial) return { ok: false, reason: "NOT_A_MATERIAL" };
  if (instances[0].cardId === instances[1].cardId) return { ok: false, reason: "SAME_MATERIAL_DEFINITION" };
  return { ok: true, materials: [firstMaterial, secondMaterial] };
}

function applyCombat(
  state: ForgeRuntimeStateV1,
  rollbackState: ForgeRuntimeStateV1,
  command: Extract<ForgeRuntimeCommand, { type: "APPLY_COMBAT" }>,
): ForgeRuntimeSuccessResult {
  const active = state.run.activeCombat;
  if (!active) return reject(state, command.type, "COMBAT_NOT_ACTIVE");
  const combatResult = reduceCombat(active.state, command.command);
  if (combatResult.state === null) return reject(state, command.type, "POSTCONDITION_FAILED");
  if (combatResult.events.some((event) => event.type === "COMMAND_REJECTED")) {
    return { state, events: combatResult.events };
  }
  if (state.revision === Number.MAX_SAFE_INTEGER) return reject(state, command.type, "POSTCONDITION_FAILED");

  active.state = combatResult.state;
  if (command.command.type === "START_TURN") {
    active.forgeActionTurn = active.state.turn;
    active.forgeActionsRemaining = 1;
  }
  const events: ForgeRuntimeEvent[] = [...combatResult.events];
  if (active.state.status !== "ONGOING") events.push(cleanupActive(active));
  state.revision += 1;
  return commit(state, rollbackState, events, command.type);
}

function forgeInstant(
  state: ForgeRuntimeStateV1,
  rollbackState: ForgeRuntimeStateV1,
  command: Extract<ForgeRuntimeCommand, { type: "FORGE_INSTANT" }>,
  context: ForgeResolverContextV1,
): ForgeRuntimeSuccessResult {
  const active = state.run.activeCombat;
  if (!active) return reject(state, command.type, "COMBAT_NOT_ACTIVE");
  if (active.state.status !== "ONGOING") return reject(state, command.type, "TERMINAL_COMBAT");
  if (active.state.phase !== "PLAYER_ACTION") return reject(state, command.type, "INVALID_COMBAT_PHASE");
  if (active.forgeActionTurn !== active.state.turn || active.forgeActionsRemaining < 1) return reject(state, command.type, "NO_FORGE_ACTION");

  const selected = selectInstances(state, command);
  if (!selected.ok) return reject(state, command.type, selected.reason);
  const [first, second] = selected.instances;
  for (const instance of selected.instances) {
    if (!active.enrolledPersistentInstanceIds.includes(instance.instanceId)) return reject(state, command.type, "INSTANCE_NOT_FOUND");
    const projected = active.state.instances.find((item) => item.instanceId === instance.instanceId);
    if (!projected || projected.cardId !== instance.cardId) return reject(state, command.type, "INSTANCE_NOT_FOUND");
    if (!active.state.zones.hand.includes(instance.instanceId)) return reject(state, command.type, "NOT_IN_HAND");
  }
  const definitions = materialDefinitions(context, selected.instances);
  if (!definitions.ok) return reject(state, command.type, definitions.reason);
  const generatedId = nextInstanceId(state);
  if (!generatedId.ok) return reject(state, command.type, generatedId.reason);
  if (state.revision === Number.MAX_SAFE_INTEGER) return reject(state, command.type, "POSTCONDITION_FAILED");

  let resolvedCard: ReturnType<typeof resolveForgeCard>;
  try {
    resolvedCard = resolveForgeCard(definitions.materials[0], definitions.materials[1], context.inputs);
  } catch {
    return reject(state, command.type, "RESOLUTION_FAILED");
  }
  if (!isSafeResolvedCard(resolvedCard)) return reject(state, command.type, "RESOLUTION_FAILED");

  const handOrder = [first, second].sort(
    (left, right) => active.state.zones.hand.indexOf(left.instanceId) - active.state.zones.hand.indexOf(right.instanceId),
  );
  const isolatedIds = handOrder.map((item) => item.instanceId) as [string, string];
  const selectedIds = new Set(isolatedIds);
  active.state.zones.hand = active.state.zones.hand.filter((id) => !selectedIds.has(id));
  active.state.instances = active.state.instances.filter((item) => !selectedIds.has(item.instanceId));
  active.isolatedMaterials.push(...handOrder.map((instance) => ({ instance })));
  active.ephemeralResults.push({
    instanceId: generatedId.instanceId,
    cardId: resolvedCard.card_id,
    recipeId: resolvedCard.recipe_id,
    location: "HAND",
  });
  active.forgeActionsRemaining -= 1;
  state.run.nextInstanceSequence += 1;
  state.revision += 1;
  const discovered = insertDiscovery(state, resolvedCard.recipe_id);
  const events: ForgeRuntimeEvent[] = [
    { type: "MATERIALS_ISOLATED", instanceIds: isolatedIds },
    { type: "FORGE_ACTION_SPENT", remaining: active.forgeActionsRemaining, turn: active.state.turn },
    { type: "FORGE_RESULT_CREATED", mode: "INSTANT", instanceId: generatedId.instanceId, cardId: resolvedCard.card_id, recipeId: resolvedCard.recipe_id, location: "HAND" },
  ];
  if (discovered) events.push({ type: "RECIPE_DISCOVERED", recipeId: resolvedCard.recipe_id });
  return commit(state, rollbackState, events, command.type, resolvedCard);
}

function forgeWorkshop(
  state: ForgeRuntimeStateV1,
  rollbackState: ForgeRuntimeStateV1,
  command: Extract<ForgeRuntimeCommand, { type: "FORGE_WORKSHOP" }>,
  context: ForgeResolverContextV1,
): ForgeRuntimeSuccessResult {
  if (state.run.activeCombat !== null) return reject(state, command.type, "COMBAT_ACTIVE");
  const selected = selectInstances(state, command);
  if (!selected.ok) return reject(state, command.type, selected.reason);
  for (const instance of selected.instances) if (!state.run.deck.includes(instance.instanceId)) return reject(state, command.type, "NOT_IN_DECK");
  const definitions = materialDefinitions(context, selected.instances);
  if (!definitions.ok) return reject(state, command.type, definitions.reason);
  if (state.run.fuel < FORGE_RUNTIME_FUEL_COST) return reject(state, command.type, "INSUFFICIENT_FUEL");
  const generatedId = nextInstanceId(state);
  if (!generatedId.ok) return reject(state, command.type, generatedId.reason);
  if (state.revision === Number.MAX_SAFE_INTEGER) return reject(state, command.type, "POSTCONDITION_FAILED");

  let resolvedCard: ReturnType<typeof resolveForgeCard>;
  try {
    resolvedCard = resolveForgeCard(definitions.materials[0], definitions.materials[1], context.inputs);
  } catch {
    return reject(state, command.type, "RESOLUTION_FAILED");
  }
  if (!isSafeResolvedCard(resolvedCard)) return reject(state, command.type, "RESOLUTION_FAILED");
  const selectedIds = new Set(command.materialInstanceIds);
  state.run.ownedInstances = state.run.ownedInstances.filter((item) => !selectedIds.has(item.instanceId));
  state.run.deck = state.run.deck.filter((id) => !selectedIds.has(id));
  state.run.ownedInstances.push({ instanceId: generatedId.instanceId, cardId: resolvedCard.card_id });
  state.run.deck.push(generatedId.instanceId);
  state.run.fuel -= FORGE_RUNTIME_FUEL_COST;
  state.run.nextInstanceSequence += 1;
  state.revision += 1;
  const discovered = insertDiscovery(state, resolvedCard.recipe_id);
  const events: ForgeRuntimeEvent[] = [
    { type: "MATERIALS_CONSUMED", instanceIds: [...command.materialInstanceIds] },
    { type: "FUEL_SPENT", amount: FORGE_RUNTIME_FUEL_COST, remaining: state.run.fuel },
    { type: "FORGE_RESULT_CREATED", mode: "WORKSHOP", instanceId: generatedId.instanceId, cardId: resolvedCard.card_id, recipeId: resolvedCard.recipe_id, location: "DECK" },
  ];
  if (discovered) events.push({ type: "RECIPE_DISCOVERED", recipeId: resolvedCard.recipe_id });
  return commit(state, rollbackState, events, command.type, resolvedCard);
}

function cleanupCombat(
  state: ForgeRuntimeStateV1,
  rollbackState: ForgeRuntimeStateV1,
  command: Extract<ForgeRuntimeCommand, { type: "CLEANUP_COMBAT" }>,
): ForgeRuntimeSuccessResult {
  const active = state.run.activeCombat;
  if (!active) return reject(state, command.type, "COMBAT_NOT_ACTIVE");
  if (active.state.status === "ONGOING") return reject(state, command.type, "INVALID_COMBAT_PHASE");
  if (active.isolatedMaterials.length === 0 && active.ephemeralResults.length === 0) return { state, events: [] };
  if (state.revision === Number.MAX_SAFE_INTEGER) return reject(state, command.type, "POSTCONDITION_FAILED");
  const event = cleanupActive(active);
  state.revision += 1;
  return commit(state, rollbackState, [event], command.type);
}

export function reduceForgeRuntime(
  rawState: unknown,
  rawCommand: unknown,
  rawContext: unknown,
): ForgeRuntimeReducerResult {
  const decodedState = decodeForgeRuntimeState(rawState);
  if (!decodedState.valid) return invalidState();
  const state = decodedState.value;
  const decodedCommand = decodeForgeRuntimeCommand(rawCommand);
  if (!decodedCommand.valid) return reject(state, "UNKNOWN", "INVALID_COMMAND");
  const command = decodedCommand.value;
  const decodedContext = decodeForgeResolverContext(rawContext);
  if (!decodedContext.valid) return reject(state, command.type, "INVALID_CONTEXT");
  const context = decodedContext.value;
  if (state.resolverVersion !== context.resolverVersion || state.sourceHash !== context.sourceHash) {
    return reject(state, command.type, "CONTEXT_VERSION_MISMATCH");
  }
  const workingDecode = decodeForgeRuntimeState(state);
  if (!workingDecode.valid) return invalidState();
  const working = workingDecode.value;

  switch (command.type) {
    case "APPLY_COMBAT": return applyCombat(working, state, command);
    case "FORGE_INSTANT": return forgeInstant(working, state, command, context);
    case "FORGE_WORKSHOP": return forgeWorkshop(working, state, command, context);
    case "CLEANUP_COMBAT": return cleanupCombat(working, state, command);
  }
}
