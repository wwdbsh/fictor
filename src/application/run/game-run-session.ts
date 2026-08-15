import type { GameSession } from "../game-session";
import { decodeForgeRuntimeState } from "../../domain/forge-runtime";
import { getMaterialAuthorityEntry, TOOL_MATERIAL_IDS_V1 } from "../../domain/rewards";
import { VersionedSaveStore, type SaveWriteResult } from "../../persistence";
import { decodeRunFlowCommand, decodeRunFlowState } from "./boundary";
import { adaptTerminalCombatToRunCommand } from "./combat-result-adapter";
import { reduceRunFlow } from "./reducer";
import type { RunFlowCommandV1, RunFlowResultV1, RunFlowStateV1 } from "./types";

export interface RunGameSessionV1 {
  readonly game: GameSession;
  readonly flow: RunFlowStateV1;
}

export interface RunGameSessionResultV1 {
  readonly value: RunGameSessionV1;
  readonly applied: boolean;
  readonly persistence: SaveWriteResult | null;
  readonly runResult: RunFlowResultV1;
  readonly reason?: string;
}

export interface RunCommandContextV1 {
  readonly restartStarterTemplate?: unknown;
  readonly terminalCombatState?: unknown;
}

function cloneGame(store: VersionedSaveStore, candidate: GameSession): GameSession | null {
  const profile = store.decodeProfile(candidate.profile);
  const runtimeState = store.decodeRuntime(candidate.runtimeState);
  if (!profile || !runtimeState || profile.discoveredRecipeIds.join("\0") !== runtimeState.profile.discoveredRecipeIds.join("\0")) return null;
  return {
    profile,
    runtimeState,
    persistenceGeneration: candidate.persistenceGeneration,
    persistenceRevision: candidate.persistenceRevision,
    writeBlocked: candidate.writeBlocked,
    loadIssues: [...candidate.loadIssues],
  };
}

function ownedTools(game: GameSession): string[] {
  const toolSet = new Set<string>(TOOL_MATERIAL_IDS_V1);
  return [...new Set(game.runtimeState.run.ownedInstances.map(({ cardId }) => cardId).filter((id) => toolSet.has(id)))].sort();
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function reject(original: RunGameSessionV1, runResult: RunFlowResultV1, reason: string, persistence: SaveWriteResult | null = null): RunGameSessionResultV1 {
  return {
    value: original,
    applied: false,
    persistence,
    runResult: { ...runResult, state: original.flow, applied: false },
    reason,
  };
}

function addMaterial(store: VersionedSaveStore, game: GameSession, materialId: string): GameSession | null {
  const authority = getMaterialAuthorityEntry(materialId);
  if (!authority) return null;
  if (authority.category === "TOOL" && game.runtimeState.run.ownedInstances.some(({ cardId }) => cardId === materialId)) return null;
  const sequence = game.runtimeState.run.nextInstanceSequence;
  if (sequence === Number.MAX_SAFE_INTEGER) return null;
  const instanceId = `forge-instance-v1-${sequence}`;
  if (game.runtimeState.run.ownedInstances.some((instance) => instance.instanceId === instanceId)) return null;
  const runtime = decodeForgeRuntimeState({
    ...game.runtimeState,
    revision: game.runtimeState.revision === Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : game.runtimeState.revision + 1,
    run: {
      ...game.runtimeState.run,
      nextInstanceSequence: sequence + 1,
      ownedInstances: [...game.runtimeState.run.ownedInstances, { instanceId, cardId: materialId }],
      deck: [...game.runtimeState.run.deck, instanceId],
    },
  });
  if (!runtime.valid || game.runtimeState.revision === Number.MAX_SAFE_INTEGER || !store.decodeRuntime(runtime.value)) return null;
  return { ...game, runtimeState: runtime.value };
}

function discoverRecipe(store: VersionedSaveStore, game: GameSession, recipeId: string): GameSession | null {
  const discoveredRecipeIds = [...new Set([...game.profile.discoveredRecipeIds, recipeId])].sort();
  const profile = store.decodeProfile({ ...game.profile, discoveredRecipeIds });
  const runtimeState = store.decodeRuntime({ ...game.runtimeState, profile: { discoveredRecipeIds } });
  return profile && runtimeState ? { ...game, profile, runtimeState } : null;
}

function ownStillHeart(store: VersionedSaveStore, game: GameSession): GameSession | null {
  const profile = store.decodeProfile({
    ...game.profile,
    ownedHeartIds: [...new Set([...game.profile.ownedHeartIds, "heart__still"])].sort(),
    featureFlags: { heartForge: false },
  });
  return profile ? { ...game, profile } : null;
}

function restartGame(store: VersionedSaveStore, game: GameSession, template: unknown): GameSession | null {
  const starter = store.decodeRuntime(template);
  if (!starter) return null;
  const runtimeState = store.decodeRuntime({
    ...starter,
    profile: { discoveredRecipeIds: [...game.profile.discoveredRecipeIds] },
  });
  return runtimeState ? { ...game, runtimeState } : null;
}

export function executeRunGameCommand(
  store: VersionedSaveStore,
  rawValue: RunGameSessionV1,
  rawCommand: unknown,
  context: RunCommandContextV1 = {},
): RunGameSessionResultV1 {
  const originalGame = cloneGame(store, rawValue.game);
  const originalFlow = decodeRunFlowState(rawValue.flow);
  if (!originalGame || !originalFlow) {
    const flow = originalFlow ?? rawValue.flow;
    const invalid: RunFlowResultV1 = { state: flow, applied: false, events: [{ type: "COMMAND_REJECTED", command: "UNKNOWN", reason: "INVALID_SESSION" }] };
    return { value: rawValue, applied: false, persistence: null, runResult: invalid, reason: "INVALID_SESSION" };
  }
  const original = { game: originalGame, flow: originalFlow };
  const requestedCommand = decodeRunFlowCommand(rawCommand);
  if (!requestedCommand) {
    const invalid: RunFlowResultV1 = { state: originalFlow, applied: false, events: [{ type: "COMMAND_REJECTED", command: "UNKNOWN", reason: "INVALID_COMMAND" }] };
    return reject(original, invalid, "INVALID_COMMAND");
  }
  let command = requestedCommand;
  if (requestedCommand.type === "RESOLVE_COMBAT") {
    const derived = context.terminalCombatState === undefined
      ? null
      : adaptTerminalCombatToRunCommand(context.terminalCombatState, originalGame.runtimeState);
    if (!derived) {
      const required: RunFlowResultV1 = { state: originalFlow, applied: false, events: [{ type: "COMMAND_REJECTED", command: requestedCommand.type, reason: "COMBAT_RESULT_REQUIRED" }] };
      return reject(original, required, "COMBAT_RESULT_REQUIRED");
    }
    if (derived.result !== requestedCommand.result) {
      const mismatch: RunFlowResultV1 = { state: originalFlow, applied: false, events: [{ type: "COMMAND_REJECTED", command: requestedCommand.type, reason: "COMBAT_RESULT_MISMATCH" }] };
      return reject(original, mismatch, "COMBAT_RESULT_MISMATCH");
    }
    command = derived;
  }
  let toolAuthorityGame = originalGame;
  if (command.type === "RESTART") {
    if (context.restartStarterTemplate === undefined) {
      const missingStarter = reduceRunFlow(originalFlow, command);
      return reject(original, missingStarter, "RESTART_STARTER_REQUIRED");
    }
    const starter = restartGame(store, originalGame, context.restartStarterTemplate);
    if (!starter) {
      const invalidStarter = reduceRunFlow(originalFlow, command);
      return reject(original, invalidStarter, "INVALID_RESTART_STARTER");
    }
    toolAuthorityGame = starter;
  }
  if ((command.type === "START" || command.type === "RESTART") && Array.isArray(command.ownedUniqueToolIds) && !sameStrings([...command.ownedUniqueToolIds].sort(), ownedTools(toolAuthorityGame))) {
    const mismatch: RunFlowResultV1 = { state: originalFlow, applied: false, events: [{ type: "COMMAND_REJECTED", command: command.type, reason: "OWNED_TOOL_AUTHORITY_MISMATCH" }] };
    return reject(original, mismatch, "OWNED_TOOL_AUTHORITY_MISMATCH");
  }
  const runResult = reduceRunFlow(originalFlow, command);
  if (!runResult.applied) return reject(original, runResult, runResult.events[0]?.type === "COMMAND_REJECTED" ? runResult.events[0].reason : "NOT_APPLIED");

  let game = originalGame;
  let requiresPersistence = false;
  if (command.type === "RESTART") {
    const restarted = restartGame(store, game, context.restartStarterTemplate);
    if (!restarted) return reject(original, runResult, "INVALID_RESTART_STARTER");
    game = restarted;
    requiresPersistence = true;
  }
  for (const event of runResult.events) {
    if (event.type === "REWARD_SELECTED") {
      const updated = event.choice.kind === "MATERIAL"
        ? addMaterial(store, game, event.choice.materialId)
        : discoverRecipe(store, game, event.choice.recipeId);
      if (!updated) return reject(original, runResult, "REWARD_APPLICATION_FAILED");
      game = updated;
      requiresPersistence = true;
    } else if (event.type === "HEART_OWNED") {
      const updated = ownStillHeart(store, game);
      if (!updated) return reject(original, runResult, "HEART_APPLICATION_FAILED");
      game = updated;
      requiresPersistence = true;
    }
  }

  if (!requiresPersistence) return { value: { game, flow: runResult.state }, applied: true, persistence: null, runResult };
  const persistence: SaveWriteResult = game.writeBlocked
    ? { ok: false, persisted: false, reason: "WRITE_BLOCKED" }
    : store.save(game.profile, game.runtimeState, game.persistenceGeneration, game.persistenceRevision);
  if (!persistence.ok) return reject(original, runResult, "PERSISTENCE_FAILED", persistence);
  return {
    value: {
      game: { ...game, persistenceGeneration: persistence.generation, persistenceRevision: persistence.revision },
      flow: runResult.state,
    },
    applied: true,
    persistence,
    runResult,
  };
}
