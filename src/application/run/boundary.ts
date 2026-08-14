import { lookupGround, lookupRace } from "../../content";
import { validateRunEvent } from "../../domain/events";
import { TOOL_MATERIAL_IDS_V1, validateRewardOffer } from "../../domain/rewards";
import {
  RUN_FLOW_ENGINE_VERSION,
  RUN_FLOW_SCHEMA_VERSION,
  RUN_SCENARIO_SCHEMA_VERSION,
  type RunFlowCommandV1,
  type RunFlowStateV1,
  type RunNodeV1,
  type RunScenarioV1,
} from "./types";

type R = Record<string, unknown>;
const phases = ["DORMANT", "BETWEEN_NODES", "IN_COMBAT", "AWAITING_REWARD", "IN_EVENT", "EVENT_RESOLVED", "RUN_WON", "RUN_LOST"];
const eventTypes = ["CACHE", "WORKSHOP", "COLLAPSE", "FICTOR", "RECORD", "ODDITY"];
const toolSet = new Set<string>(TOOL_MATERIAL_IDS_V1);

function snapshotValue(value: unknown, ancestors = new Set<object>()): unknown {
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") throw new TypeError("unsupported value");
  if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError("non-finite number");
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) throw new TypeError("cycle");
  const proto = Object.getPrototypeOf(value);
  if (Array.isArray(value) ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) throw new TypeError("prototype");
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === "symbol")) throw new TypeError("symbol key");
  const next = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor)) throw new TypeError("sparse/accessor array");
      result.push(snapshotValue(descriptor.value, next));
    }
    if (Object.keys(value).length !== value.length) throw new TypeError("extra array key");
    return result;
  }
  const result: R = {};
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) throw new TypeError("accessor");
    result[key] = snapshotValue(descriptor.value, next);
  }
  return result;
}

function capture(value: unknown): unknown | null {
  try { return snapshotValue(value); } catch { return null; }
}

function exact(value: unknown, keys: readonly string[]): value is R {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
const safeCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;

function rewardChoice(value: unknown): boolean {
  if (!exact(value, ["choiceId", "kind", value && typeof value === "object" && (value as R).kind === "RECIPE" ? "recipeId" : "materialId"])) return false;
  return text(value.choiceId) && ((value.kind === "MATERIAL" && text(value.materialId)) || (value.kind === "RECIPE" && text(value.recipeId)));
}

function rewardOffer(value: unknown): boolean {
  if (!exact(value, ["offerId", "source", "choices"]) || !text(value.offerId) || !Array.isArray(value.choices) || !value.choices.every(rewardChoice)) return false;
  return validateRewardOffer(value as unknown as Parameters<typeof validateRewardOffer>[0]).valid;
}

function eventChoice(value: unknown): boolean {
  if (!exact(value, ["choiceId", "effect", "economy"]) || !text(value.choiceId) || !exact(value.effect, value.effect && typeof value.effect === "object" && (value.effect as R).kind === "REWARD" ? ["kind", "offer", "rewardChoiceIds"] : ["kind"])) return false;
  const effect = value.effect;
  if (effect.kind === "REWARD" && (!rewardOffer(effect.offer) || !Array.isArray(effect.rewardChoiceIds) || !effect.rewardChoiceIds.every(text))) return false;
  if (!["NONE", "WORKSHOP_ENTITLEMENT", "REWARD"].includes(String(effect.kind))) return false;
  if (!exact(value.economy, value.economy && typeof value.economy === "object" && (value.economy as R).status === "APPROVED" ? ["status", "price"] : ["status"])) return false;
  return ["NOT_REQUIRED", "CONFIGURATION_PENDING", "APPROVED"].includes(String(value.economy.status))
    && (value.economy.status !== "APPROVED" || safeCount(value.economy.price));
}

function node(value: unknown): value is RunNodeV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const kind = (value as R).kind;
  if (kind === "ENCOUNTER") {
    if (!exact(value, ["nodeId", "kind", "depth", "encounterKind", "encounterId", "rewardOffer"])) return false;
    if (!text(value.nodeId) || ![1, 2, 3].includes(value.depth as number) || !["NORMAL", "ELITE", "BOSS"].includes(String(value.encounterKind)) || !text(value.encounterId)) return false;
    if (value.encounterKind === "BOSS") return value.encounterId === "the_stilling" && value.rewardOffer === null;
    if (!rewardOffer(value.rewardOffer)) return false;
    const offer = value.rewardOffer as { source: unknown };
    return (value.encounterKind === "NORMAL" && offer.source === "NORMAL") || (value.encounterKind === "ELITE" && offer.source === "ELITE");
  }
  if (kind === "EVENT") {
    if (!exact(value, ["nodeId", "kind", "depth", "eventType", "choices"]) || !text(value.nodeId) || ![1, 2, 3].includes(value.depth as number) || !eventTypes.includes(String(value.eventType)) || !Array.isArray(value.choices) || !value.choices.every(eventChoice)) return false;
    return validateRunEvent({ eventType: value.eventType, choices: value.choices } as Parameters<typeof validateRunEvent>[0]);
  }
  return false;
}

function encounterIsEnabled(candidate: RunNodeV1): boolean {
  const ground = lookupGround("GROUND_STILL");
  if (ground.status !== "ENABLED" || ground.value.encounters === null) return false;
  if (candidate.kind === "EVENT") return ground.value.events.some(({ type }) => type === candidate.eventType);
  if (candidate.encounterKind === "NORMAL") return ground.value.encounters.normals.some(({ id }) => id === candidate.encounterId);
  if (candidate.encounterKind === "ELITE") return ground.value.encounters.elite.id === candidate.encounterId;
  return ground.value.encounters.boss.id === candidate.encounterId;
}

export function decodeRunScenario(candidate: unknown): RunScenarioV1 | null {
  const value = capture(candidate);
  if (!exact(value, ["schemaVersion", "scenarioId", "status", "raceId", "groundId", "nodes", "pendingReasons"]) || value.schemaVersion !== RUN_SCENARIO_SCHEMA_VERSION || !text(value.scenarioId) || !["APPROVED", "CONFIGURATION_PENDING"].includes(String(value.status)) || value.raceId !== "Stillkin" || value.groundId !== "GROUND_STILL" || !Array.isArray(value.nodes) || !Array.isArray(value.pendingReasons) || !value.pendingReasons.every(text)) return null;
  if (lookupRace(value.raceId).status !== "ENABLED" || lookupGround(value.groundId).status !== "ENABLED") return null;
  if (value.status === "CONFIGURATION_PENDING") return value.pendingReasons.length > 0 && value.nodes.length === 0 ? value as unknown as RunScenarioV1 : null;
  if (value.pendingReasons.length !== 0 || value.nodes.length < 3 || !value.nodes.every(node)) return null;
  const nodes = value.nodes as RunNodeV1[];
  if (!unique(nodes.map(({ nodeId }) => nodeId)) || !nodes.every(encounterIsEnabled)) return null;
  const depths = nodes.map(({ depth }) => depth);
  if (![1, 2, 3].every((depth) => depths.includes(depth as 1 | 2 | 3)) || depths.some((depth, index) => index > 0 && depth < depths[index - 1])) return null;
  const final = nodes.at(-1)!;
  const bosses = nodes.filter((candidate) => candidate.kind === "ENCOUNTER" && candidate.encounterKind === "BOSS");
  if (bosses.length !== 1 || final.kind !== "ENCOUNTER" || final.depth !== 3 || final.encounterKind !== "BOSS" || final.encounterId !== "the_stilling") return null;
  return value as unknown as RunScenarioV1;
}

export function decodeRunFlowState(candidate: unknown): RunFlowStateV1 | null {
  const value = capture(candidate);
  if (!exact(value, ["schemaVersion", "engineVersion", "revision", "phase", "scenario", "nextNodeIndex", "currentNodeIndex", "pendingReward", "workshopEntitlements", "grantedUniqueToolIds"]) || value.schemaVersion !== RUN_FLOW_SCHEMA_VERSION || value.engineVersion !== RUN_FLOW_ENGINE_VERSION || !safeCount(value.revision) || !phases.includes(String(value.phase)) || !safeCount(value.nextNodeIndex) || !(value.currentNodeIndex === null || safeCount(value.currentNodeIndex)) || !safeCount(value.workshopEntitlements) || !Array.isArray(value.grantedUniqueToolIds) || !value.grantedUniqueToolIds.every((id) => text(id) && toolSet.has(id)) || !unique(value.grantedUniqueToolIds as string[])) return null;
  const scenario = value.scenario === null ? null : decodeRunScenario(value.scenario);
  if (value.scenario !== null && scenario === null) return null;
  if (!(value.pendingReward === null || rewardOffer(value.pendingReward))) return null;
  if (scenario === null) return value.phase === "DORMANT" && value.nextNodeIndex === 0 && value.currentNodeIndex === null && value.pendingReward === null && value.workshopEntitlements === 0 && (value.grantedUniqueToolIds as unknown[]).length === 0 ? value as unknown as RunFlowStateV1 : null;
  if (scenario.status !== "APPROVED" || value.nextNodeIndex > scenario.nodes.length || (value.currentNodeIndex !== null && value.currentNodeIndex >= scenario.nodes.length)) return null;
  const tools = value.grantedUniqueToolIds as string[];
  if (tools.some((id, index) => index > 0 && id <= tools[index - 1])) return null;
  if (value.currentNodeIndex === null) {
    if (value.phase !== "BETWEEN_NODES" || value.nextNodeIndex !== 0 || value.pendingReward !== null) return null;
    return value as unknown as RunFlowStateV1;
  }
  if (value.nextNodeIndex !== value.currentNodeIndex + 1) return null;
  const current = scenario.nodes[value.currentNodeIndex];
  if (value.phase === "IN_COMBAT" && (current.kind !== "ENCOUNTER" || value.pendingReward !== null)) return null;
  if (value.phase === "AWAITING_REWARD") {
    if (current.kind !== "ENCOUNTER" || current.encounterKind === "BOSS" || current.rewardOffer === null || value.pendingReward === null || JSON.stringify(current.rewardOffer) !== JSON.stringify(value.pendingReward)) return null;
  }
  if ((value.phase === "IN_EVENT" || value.phase === "EVENT_RESOLVED") && (current.kind !== "EVENT" || value.pendingReward !== null)) return null;
  if (value.phase === "BETWEEN_NODES" && value.pendingReward !== null) return null;
  if (value.phase === "RUN_WON" && (current.kind !== "ENCOUNTER" || current.encounterKind !== "BOSS" || value.nextNodeIndex !== scenario.nodes.length || value.pendingReward !== null)) return null;
  if (value.phase === "RUN_LOST" && (current.kind !== "ENCOUNTER" || value.pendingReward !== null)) return null;
  if (value.phase === "DORMANT") return null;
  return value as unknown as RunFlowStateV1;
}

export function decodeRunFlowCommand(candidate: unknown): RunFlowCommandV1 | null {
  const value = capture(candidate);
  if (value === null || typeof value !== "object" || Array.isArray(value) || typeof (value as R).type !== "string") return null;
  const type = (value as R).type as string;
  if (type === "START" || type === "RESTART") {
    if (!exact(value, ["type", "scenario", "ownedUniqueToolIds"]) || !Array.isArray(value.ownedUniqueToolIds) || !value.ownedUniqueToolIds.every((id) => text(id) && toolSet.has(id)) || !unique(value.ownedUniqueToolIds as string[]) || decodeRunScenario(value.scenario) === null) return null;
    return value as unknown as RunFlowCommandV1;
  }
  if (["ENTER_NEXT_NODE", "LEAVE_EVENT"].includes(type)) return exact(value, ["type"]) ? value as unknown as RunFlowCommandV1 : null;
  if (type === "RESOLVE_COMBAT") return exact(value, ["type", "result", "cleanupCompleted"]) && ["VICTORY", "DEFEAT"].includes(String(value.result)) && value.cleanupCompleted === true ? value as unknown as RunFlowCommandV1 : null;
  if (type === "CHOOSE_REWARD" || type === "RESOLVE_EVENT") return exact(value, ["type", "choiceId"]) && text(value.choiceId) ? value as unknown as RunFlowCommandV1 : null;
  if (type === "SETTLE_FREE_WORKSHOP") return exact(value, ["type", "outcome"]) && ["SUCCEEDED", "FAILED"].includes(String(value.outcome)) ? value as unknown as RunFlowCommandV1 : null;
  return null;
}
