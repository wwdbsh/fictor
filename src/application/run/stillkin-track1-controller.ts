import {
  COMBAT_EFFECT_IDS,
  createCombatState,
  decodeCombatCommand,
  type CardDefinition,
  type CombatCommand,
  type CombatEffectId,
  type CombatSetup,
  type EffectProgram,
  type EnemyIntent,
} from "../../domain/combat";
import { resolveForgeCard, type GeneratedCard } from "../../domain/forge";
import {
  decodeForgeResolverContext,
  decodeForgeRuntimeState,
  FORGE_RUNTIME_ENGINE_VERSION,
  FORGE_RUNTIME_FUEL_COST,
  FORGE_RUNTIME_RESOLVER_VERSION,
  FORGE_RUNTIME_SCHEMA_VERSION,
  FORGE_RUNTIME_SOURCE_HASH,
  reduceForgeRuntime,
  type ForgeRuntimeEvent,
  type ForgeRuntimeReducerResult,
  type ForgeResolverContextV1,
  type ForgeRuntimeStateV1,
} from "../../domain/forge-runtime";
import {
  applyBurnkinResonanceBreak,
  kindleBurnkinCard,
  payBurnkinHpForEnergy,
  STILLKIN_BLOCK_RETENTION,
  type BurnkinProvisionalRules,
} from "../../domain/races";
import { canonicalSerialize, sha256Hex } from "../../domain/forge-runtime/source-binding";
import {
  classifyPersistentProfile,
  canonicalRecipeIdForCard,
  createDefaultProfile,
  FICTOR_SAVE_KEY,
  FICTOR_SAVE_V2_KEY,
  isValidSaveGeneration,
  parseKnownEnvelope,
  projectRuntimeState,
  runtimeReferencesAllowed,
  SAVE_SCHEMA_VERSION_V2,
  snapshotPersistenceCatalog,
  type PersistentProfileV1,
  type SaveEnvelopeV2,
  type SaveFailureCode,
  type SaveLoadIssue,
  type StorageLike,
} from "../../persistence";
import { assertStillkinTrack1GroundAuthority } from "./track1-ground-authority";
import {
  BURNKIN_TRACK1_CONFIG_HASH,
  BURNKIN_TRACK1_PROVISIONAL_CONFIG,
  BURNKIN_TRACK1_RULES,
  BURNKIN_TRACK1_SCENARIO_HASH,
  BURNKIN_TRACK1_SCENARIO_ID,
  JOINKIN_TRACK1_CONFIG_HASH,
  JOINKIN_TRACK1_PROVISIONAL_CONFIG,
  JOINKIN_TRACK1_SCENARIO_HASH,
  JOINKIN_TRACK1_SCENARIO_ID,
  STILLKIN_TRACK1_CONFIG_HASH,
  STILLKIN_TRACK1_PROVISIONAL_CONFIG as CONFIG,
  STILLKIN_TRACK1_SCENARIO_HASH,
  STILLKIN_TRACK1_SCENARIO_ID,
} from "./track1-config";
import {
  STILLKIN_TRACK1_CONTROLLER_VERSION,
  STILLKIN_TRACK1_FLOW_SCHEMA_VERSION,
  type StillkinTrack1Command,
  type StillkinTrack1DispatchResult,
  type StillkinTrack1Event,
  type StillkinTrack1FlowState,
  type StillkinTrack1LoadResult,
  type StillkinTrack1Snapshot,
  type Track1CombatBinding,
  type Track1RaceId,
} from "./track1-types";

type JsonRecord = Record<string, unknown>;
type RewardChoice = { choiceId: string; kind: "MATERIAL"; materialId: string } | { choiceId: string; kind: "RECIPE"; recipeId: string };
type ControllerState = {
  profile: PersistentProfileV1;
  runtime: ForgeRuntimeStateV1;
  flow: StillkinTrack1FlowState;
  generation: string | null;
  saveRevision: number;
  writeBlocked: boolean;
  issues: SaveLoadIssue[];
};

type Track1RaceExecution = {
  raceId: Track1RaceId;
  raceLabelKo: "어름붙이" | "사름붙이" | "이음붙이";
  runPrefix: "stillkin-track1-run" | "burnkin-track1-run" | "joinkin-track1-run";
  scenarioId: StillkinTrack1FlowState["scenarioId"];
  scenarioHash: string;
  configId: StillkinTrack1FlowState["configId"];
  configHash: string;
  starterDeck: readonly string[];
  baselineAttribute: "STILL" | "BURN" | "JOIN";
  resonanceRate: number;
  blockRetention: { numerator: number; denominator: number; rounding: "FLOOR" };
  saveV2Key: string;
  migrateV1: boolean;
  burnkinRules: BurnkinProvisionalRules | null;
};

const STILLKIN_EXECUTION: Track1RaceExecution = Object.freeze({
  raceId: "Stillkin",
  raceLabelKo: "어름붙이",
  runPrefix: "stillkin-track1-run",
  scenarioId: STILLKIN_TRACK1_SCENARIO_ID,
  scenarioHash: STILLKIN_TRACK1_SCENARIO_HASH,
  configId: CONFIG.configId,
  configHash: STILLKIN_TRACK1_CONFIG_HASH,
  starterDeck: CONFIG.starterDeck,
  baselineAttribute: "STILL",
  resonanceRate: CONFIG.combat.resonanceRate,
  blockRetention: STILLKIN_BLOCK_RETENTION,
  saveV2Key: FICTOR_SAVE_V2_KEY,
  migrateV1: true,
  burnkinRules: null,
});

export const BURNKIN_TRACK1_SAVE_KEY = "fictor.burnkin.save.v2" as const;

const BURNKIN_EXECUTION: Track1RaceExecution = Object.freeze({
  raceId: "Burnkin",
  raceLabelKo: "사름붙이",
  runPrefix: "burnkin-track1-run",
  scenarioId: BURNKIN_TRACK1_SCENARIO_ID,
  scenarioHash: BURNKIN_TRACK1_SCENARIO_HASH,
  configId: BURNKIN_TRACK1_PROVISIONAL_CONFIG.configId,
  configHash: BURNKIN_TRACK1_CONFIG_HASH,
  starterDeck: BURNKIN_TRACK1_PROVISIONAL_CONFIG.starterDeck,
  baselineAttribute: "BURN",
  resonanceRate: CONFIG.combat.resonanceRate * BURNKIN_TRACK1_RULES.resonanceRateMultiplier,
  blockRetention: Object.freeze({ numerator: 0, denominator: 1, rounding: "FLOOR" }),
  saveV2Key: BURNKIN_TRACK1_SAVE_KEY,
  migrateV1: false,
  burnkinRules: BURNKIN_TRACK1_RULES,
});

export const JOINKIN_TRACK1_SAVE_KEY = "fictor.joinkin.save.v2" as const;

const JOINKIN_EXECUTION: Track1RaceExecution = Object.freeze({
  raceId: "Joinkin",
  raceLabelKo: "이음붙이",
  runPrefix: "joinkin-track1-run",
  scenarioId: JOINKIN_TRACK1_SCENARIO_ID,
  scenarioHash: JOINKIN_TRACK1_SCENARIO_HASH,
  configId: JOINKIN_TRACK1_PROVISIONAL_CONFIG.configId,
  configHash: JOINKIN_TRACK1_CONFIG_HASH,
  starterDeck: JOINKIN_TRACK1_PROVISIONAL_CONFIG.starterDeck,
  baselineAttribute: "JOIN",
  resonanceRate: CONFIG.combat.resonanceRate,
  blockRetention: Object.freeze({ numerator: 0, denominator: 1, rounding: "FLOOR" }),
  saveV2Key: JOINKIN_TRACK1_SAVE_KEY,
  migrateV1: false,
  burnkinRules: null,
});

const TRACK1_PERSISTENCE_CATALOG = snapshotPersistenceCatalog({
  sourceHash: FORGE_RUNTIME_SOURCE_HASH,
  allowedEnemyIds: ["enemy__still__swarm", "elite__still__burn", "the_stilling"],
  allowedIntentIds: [
    "stillkin-track1-normal-attack",
    "stillkin-track1-elite-charge-1",
    "stillkin-track1-elite-charge-2",
    "stillkin-track1-elite-release",
    "stillkin-track1-boss-total-stop",
    "stillkin-track1-boss-attack",
  ],
  allowedDisplayTexts: ["정지한 타격", "눌린 불 축적", "눌린 불 재축적", "눌린 불 방출", "완전 정지", "멈춘 손길"],
});

export interface StillkinTrack1ControllerOptions {
  storage: StorageLike;
  resolverContext: ForgeResolverContextV1 | unknown;
  generationFactory?: () => string;
}

export interface StillkinTrack1Controller {
  load(): StillkinTrack1LoadResult;
  snapshot(): StillkinTrack1Snapshot;
  dispatch(command: StillkinTrack1Command | unknown): StillkinTrack1DispatchResult;
}

class BoundaryFailure extends Error {}

function dataProperties(value: unknown, required: readonly string[], optional: readonly string[] = []): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new BoundaryFailure();
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new BoundaryFailure();
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === "symbol")) throw new BoundaryFailure();
  const allowed = new Set([...required, ...optional]);
  if (keys.some((key) => !allowed.has(String(key))) || required.some((key) => !keys.includes(key))) throw new BoundaryFailure();
  const result: JsonRecord = {};
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) throw new BoundaryFailure();
    result[key] = descriptor.value;
  }
  return result;
}

function snapshotJson(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new BoundaryFailure();
    return value;
  }
  if (typeof value !== "object" || ancestors.has(value)) throw new BoundaryFailure();
  const proto = Object.getPrototypeOf(value);
  const array = Array.isArray(value);
  if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) throw new BoundaryFailure();
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === "symbol")) throw new BoundaryFailure();
  const next = new Set(ancestors).add(value);
  if (array) {
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    const length = lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : -1;
    if (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1) throw new BoundaryFailure();
    const result: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor)) throw new BoundaryFailure();
      result.push(snapshotJson(descriptor.value, next));
    }
    return result;
  }
  const result: JsonRecord = {};
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) throw new BoundaryFailure();
    result[key] = snapshotJson(descriptor.value, next);
  }
  return result;
}

function clone<T>(value: T): T {
  return snapshotJson(value) as T;
}

function ownMethod(storage: object, name: "getItem" | "setItem"): ((...args: never[]) => unknown) | null {
  let cursor: object | null = storage;
  while (cursor) {
    const descriptor = Object.getOwnPropertyDescriptor(cursor, name);
    if (descriptor) return "value" in descriptor && typeof descriptor.value === "function" ? descriptor.value.bind(storage) : null;
    cursor = Object.getPrototypeOf(cursor) as object | null;
  }
  return null;
}

function captureOptions(raw: StillkinTrack1ControllerOptions | unknown) {
  try {
    const value = dataProperties(raw, ["storage", "resolverContext"], ["generationFactory"]);
    if (value.storage === null || typeof value.storage !== "object") throw new BoundaryFailure();
    const getItem = ownMethod(value.storage, "getItem");
    const setItem = ownMethod(value.storage, "setItem");
    if (!getItem || !setItem) throw new BoundaryFailure();
    const context = decodeForgeResolverContext(value.resolverContext);
    if (!context.valid) throw new BoundaryFailure();
    const generationFactory = value.generationFactory === undefined
      ? () => globalThis.crypto.randomUUID()
      : value.generationFactory;
    if (typeof generationFactory !== "function") throw new BoundaryFailure();
    return {
      getItem: (key: string) => getItem(key as never) as string | null,
      setItem: (key: string, bytes: string) => { setItem(key as never, bytes as never); },
      context: context.value,
      generationFactory: generationFactory as () => string,
    };
  } catch {
    throw new TypeError("invalid Stillkin Track-1 controller options");
  }
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function xorshift32(value: number): number {
  let next = value >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}

function createStarterRuntime(profile: PersistentProfileV1, execution: Track1RaceExecution): ForgeRuntimeStateV1 {
  const ownedInstances = execution.starterDeck.map((cardId, index) => ({ instanceId: `track1-instance-${index}`, cardId }));
  return {
    schemaVersion: FORGE_RUNTIME_SCHEMA_VERSION,
    engineVersion: FORGE_RUNTIME_ENGINE_VERSION,
    resolverVersion: FORGE_RUNTIME_RESOLVER_VERSION,
    sourceHash: FORGE_RUNTIME_SOURCE_HASH,
    revision: 0,
    profile: { discoveredRecipeIds: [...profile.discoveredRecipeIds] },
    run: {
      fuel: CONFIG.startFuel,
      nextInstanceSequence: ownedInstances.length,
      ownedInstances,
      deck: ownedInstances.map(({ instanceId }) => instanceId),
      activeCombat: null,
      ...(execution.raceId === "Joinkin" ? { joinkinThirdOverlays: [] } : {}),
    },
  };
}

function createFlow(runSequence: number, execution: Track1RaceExecution): StillkinTrack1FlowState {
  const runId = `${execution.runPrefix}-${runSequence}`;
  return {
    schemaVersion: STILLKIN_TRACK1_FLOW_SCHEMA_VERSION,
    controllerVersion: STILLKIN_TRACK1_CONTROLLER_VERSION,
    revision: 0,
    runSequence,
    runId,
    scenarioId: execution.scenarioId,
    scenarioHash: execution.scenarioHash,
    configId: execution.configId,
    configHash: execution.configHash,
    phase: "BETWEEN_NODES",
    nextNodeIndex: 0,
    currentNodeIndex: null,
    pendingOfferId: null,
    workshopEntitlementNodeId: null,
    nextEncounterNonce: 1,
    combatBinding: null,
    playerHp: CONFIG.maxPlayerHp,
    randomState: (fnv1a(runId) || 0x6d2b79f5) >>> 0,
  };
}

function safeCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function decodeFlow(value: unknown, execution: Track1RaceExecution): StillkinTrack1FlowState | null {
  let flow: StillkinTrack1FlowState;
  try { flow = snapshotJson(value) as StillkinTrack1FlowState; } catch { return null; }
  if (!flow || typeof flow !== "object") return null;
  const expected = ["schemaVersion", "controllerVersion", "revision", "runSequence", "runId", "scenarioId", "scenarioHash", "configId", "configHash", "phase", "nextNodeIndex", "currentNodeIndex", "pendingOfferId", "workshopEntitlementNodeId", "nextEncounterNonce", "combatBinding", "playerHp", "randomState"];
  if (Object.keys(flow).length !== expected.length || expected.some((key) => !Object.hasOwn(flow, key))) return null;
  if (flow.schemaVersion !== STILLKIN_TRACK1_FLOW_SCHEMA_VERSION || flow.controllerVersion !== STILLKIN_TRACK1_CONTROLLER_VERSION
    || flow.scenarioId !== execution.scenarioId || flow.scenarioHash !== execution.scenarioHash
    || flow.configId !== execution.configId || flow.configHash !== execution.configHash) return null;
  if (!safeCount(flow.revision) || !safeCount(flow.runSequence) || flow.runSequence < 1 || flow.runId !== `${execution.runPrefix}-${flow.runSequence}`
    || !safeCount(flow.nextNodeIndex) || flow.nextNodeIndex > CONFIG.route.length || !(flow.currentNodeIndex === null || safeCount(flow.currentNodeIndex))
    || !safeCount(flow.nextEncounterNonce) || flow.nextEncounterNonce < 1 || !safeCount(flow.playerHp) || flow.playerHp > CONFIG.maxPlayerHp
    || !safeCount(flow.randomState) || flow.randomState > 0xffffffff) return null;
  if (!(["BETWEEN_NODES", "IN_COMBAT", "AWAITING_REWARD", "IN_EVENT", "EVENT_RESOLVED", "RUN_WON", "RUN_LOST"] as string[]).includes(flow.phase)) return null;
  if (!(flow.pendingOfferId === null || typeof flow.pendingOfferId === "string") || !(flow.workshopEntitlementNodeId === null || typeof flow.workshopEntitlementNodeId === "string")) return null;
  if (flow.combatBinding !== null) {
    let binding: JsonRecord;
    try { binding = dataProperties(flow.combatBinding, ["runId", "nodeId", "encounterId", "encounterNonce"]); } catch { return null; }
    if (binding.runId !== flow.runId || typeof binding.nodeId !== "string" || typeof binding.encounterId !== "string" || !safeCount(binding.encounterNonce)) return null;
  }
  const current = flow.currentNodeIndex === null ? null : CONFIG.route[flow.currentNodeIndex];
  if (flow.currentNodeIndex !== null && !current) return null;
  if (flow.currentNodeIndex === null) {
    if (flow.phase !== "BETWEEN_NODES" || flow.nextNodeIndex !== 0) return null;
  } else if (flow.nextNodeIndex !== flow.currentNodeIndex + 1) return null;
  const enteredEncounterCount = CONFIG.route.slice(0, flow.nextNodeIndex).filter((node) => node.kind === "ENCOUNTER").length;
  if (flow.nextEncounterNonce !== enteredEncounterCount + 1) return null;
  const collapseIndex = CONFIG.route.findIndex((node) => node.kind === "EVENT" && node.eventType === "COLLAPSE");
  const collapseResolved = flow.currentNodeIndex !== null && (
    flow.currentNodeIndex > collapseIndex
    || (flow.currentNodeIndex === collapseIndex && flow.phase !== "IN_EVENT")
  );
  const initialRandomState = (fnv1a(flow.runId) || 0x6d2b79f5) >>> 0;
  if (flow.randomState !== (collapseResolved ? xorshift32(initialRandomState) : initialRandomState)) return null;
  if (flow.phase === "IN_COMBAT" && (current?.kind !== "ENCOUNTER" || flow.combatBinding === null
    || flow.combatBinding.nodeId !== current.nodeId || flow.combatBinding.encounterId !== current.encounterId
    || flow.combatBinding.encounterNonce !== flow.nextEncounterNonce - 1)) return null;
  if (flow.phase !== "IN_COMBAT" && flow.combatBinding !== null) return null;
  if ((flow.phase === "IN_EVENT" || flow.phase === "EVENT_RESOLVED") && current?.kind !== "EVENT") return null;
  if (flow.phase === "AWAITING_REWARD" && (current?.kind !== "ENCOUNTER" || current.encounterKind === "BOSS"
    || flow.pendingOfferId !== (current.encounterKind === "NORMAL" ? "normal-d1" : "elite-d2"))) return null;
  if (flow.phase !== "AWAITING_REWARD" && flow.pendingOfferId !== null) return null;
  if (flow.phase === "RUN_WON" && (current?.kind !== "ENCOUNTER" || current.encounterKind !== "BOSS" || flow.nextNodeIndex !== CONFIG.route.length)) return null;
  if (flow.phase === "RUN_LOST" && flow.playerHp !== 0) return null;
  if (flow.playerHp === 0 && flow.phase !== "RUN_LOST") return null;
  if (flow.workshopEntitlementNodeId !== null
    && (current?.kind !== "EVENT" || current.eventType !== "WORKSHOP" || flow.phase !== "EVENT_RESOLVED" || flow.workshopEntitlementNodeId !== current.nodeId)) return null;
  return flow;
}

function syncProfile(runtime: ForgeRuntimeStateV1, profile: PersistentProfileV1): ForgeRuntimeStateV1 | null {
  const decoded = decodeForgeRuntimeState({ ...runtime, profile: { discoveredRecipeIds: [...profile.discoveredRecipeIds] } });
  return decoded.valid ? decoded.value : null;
}

function joinkinOverlayAuthorityValid(runtime: ForgeRuntimeStateV1, context: ForgeResolverContextV1): boolean {
  const expectedAttribute = (materialId: string) => {
    const material = context.materials.find(({ id }) => id === materialId);
    if (!material) return undefined;
    const attribute = Array.isArray(material.attribute) ? material.attribute[0] : material.attribute;
    return attribute === "NONE" ? null : attribute;
  };
  for (const overlay of runtime.run.joinkinThirdOverlays ?? []) {
    if (expectedAttribute(overlay.thirdMaterialId) !== overlay.resonanceAttribute) return false;
    const owned = runtime.run.ownedInstances.find(({ instanceId }) => instanceId === overlay.instanceId);
    const recipeId = owned ? canonicalRecipeIdForCard(owned.cardId) : null;
    if (!owned || recipeId === null || recipeId.split("|").includes(overlay.thirdMaterialId)) return false;
  }
  for (const result of runtime.run.activeCombat?.ephemeralResults ?? []) {
    if (result.provenance?.kind !== "JOINKIN_THREE") continue;
    if (expectedAttribute(result.provenance.thirdMaterialId) !== result.provenance.resonanceAttribute) return false;
  }
  return true;
}

function enemyIntents(kind: "NORMAL" | "ELITE" | "BOSS"): EnemyIntent[] {
  const damage = (intentId: string, amount: number, labelKo: string): EnemyIntent => ({
    intentId, labelKo, telegraph: "ATTACK", displayAmount: amount,
    program: { operations: [{ kind: "DAMAGE", target: { kind: "PLAYER" }, amount: { kind: "FIXED", amount } }] },
  });
  if (kind === "NORMAL") return [damage("stillkin-track1-normal-attack", CONFIG.combat.normal.attack, "정지한 타격")];
  if (kind === "ELITE") return [
    { intentId: "stillkin-track1-elite-charge-1", labelKo: "눌린 불 축적", telegraph: "SPECIAL", displayAmount: null, program: { operations: [] } },
    { intentId: "stillkin-track1-elite-charge-2", labelKo: "눌린 불 재축적", telegraph: "SPECIAL", displayAmount: null, program: { operations: [] } },
    damage("stillkin-track1-elite-release", CONFIG.combat.elite.releaseAttack, "눌린 불 방출"),
  ];
  return [
    { intentId: "stillkin-track1-boss-total-stop", labelKo: "완전 정지", telegraph: "DEFEND", displayAmount: CONFIG.combat.boss.totalStopBlock, program: { operations: [{ kind: "GAIN_BLOCK", target: { kind: "ENEMY", enemyId: "the_stilling" }, amount: { kind: "FIXED", amount: CONFIG.combat.boss.totalStopBlock } }] } },
    damage("stillkin-track1-boss-attack", CONFIG.combat.boss.attack, "멈춘 손길"),
  ];
}

const COMBAT_EFFECT_ID_SET = new Set<string>(COMBAT_EFFECT_IDS);

function canonicalResolvedCard(cardId: string, context: ForgeResolverContextV1): GeneratedCard {
  const recipeId = canonicalRecipeIdForCard(cardId);
  if (recipeId === null) throw new Error(`not a canonical forge card: ${cardId}`);
  const [leftId, rightId] = recipeId.split("|");
  const left = context.materials.find(({ id }) => id === leftId);
  const right = context.materials.find(({ id }) => id === rightId);
  if (!left || !right) throw new Error(`missing canonical recipe material: ${recipeId}`);
  const resolved = resolveForgeCard(left, right, context.inputs);
  if (resolved.card_id !== cardId || resolved.recipe_id !== recipeId) throw new Error(`canonical recipe projection mismatch: ${cardId}`);
  return resolved;
}

function programForEffect(effectId: CombatEffectId): EffectProgram {
  return effectId === "DELAYED_EXPLOSION"
    ? { effectId, targetRule: { kind: "REQUIRED", allowed: "ENEMY" }, playedCardDestination: "DISCARD", operations: [{ kind: "DAMAGE", target: { kind: "SELECTED" }, amount: { kind: "EFFECT_POWER", multiplier: 1 } }] }
    : { effectId, targetRule: { kind: "NONE" }, playedCardDestination: "DISCARD", operations: [] };
}

function playableResolvedCard(resolved: GeneratedCard): { card: CardDefinition; program: EffectProgram } | null {
  if (resolved.branch === "EQUIPMENT") return null;
  if (!resolved.combat_effect || !COMBAT_EFFECT_ID_SET.has(resolved.combat_effect) || !resolved.effective_attributes[0]) {
    throw new Error(`invalid canonical combat projection: ${resolved.card_id}`);
  }
  const effectId = resolved.combat_effect as CombatEffectId;
  return {
    card: {
      cardId: resolved.card_id,
      effectId,
      cost: CONFIG.combat.forgedCard.cost,
      power: CONFIG.combat.forgedCard.power,
      resonanceAttribute: resolved.effective_attributes[0],
    },
    program: programForEffect(effectId),
  };
}

function baseResonanceAttribute(cardId: string, context: ForgeResolverContextV1, fallback: "JOIN"): import("../../domain/resonance").ResonanceAttribute {
  const material = context.materials.find(({ id }) => id === cardId);
  if (material) {
    const attribute = Array.isArray(material.attribute) ? material.attribute[0] : material.attribute;
    return attribute && attribute !== "NONE" ? attribute : fallback;
  }
  const playable = playableResolvedCard(canonicalResolvedCard(cardId, context));
  if (!playable?.card.resonanceAttribute) throw new Error("Joinkin card has no resonance attribute");
  return playable.card.resonanceAttribute;
}

function prepareJoinkinCardPlay(
  runtime: ForgeRuntimeStateV1,
  command: Extract<CombatCommand, { type: "PLAY_CARD" }>,
  context: ForgeResolverContextV1,
): { runtime: ForgeRuntimeStateV1; cardId: string; rawAttribute: import("../../domain/resonance").ResonanceAttribute; bridgeOpenAfter: boolean } | null {
  const candidate = clone(runtime);
  const active = candidate.run.activeCombat;
  if (!active) return null;
  const instance = active.state.instances.find(({ instanceId }) => instanceId === command.instanceId);
  if (!instance) return null;
  const card = active.state.cards.find(({ cardId }) => cardId === instance.cardId);
  if (!card) return null;
  const persistentOverlay = candidate.run.joinkinThirdOverlays?.find(({ instanceId }) => instanceId === command.instanceId);
  const ephemeralOverlay = active.ephemeralResults.find(({ instanceId }) => instanceId === command.instanceId)?.provenance;
  const overlayAttribute = persistentOverlay?.resonanceAttribute
    ?? (ephemeralOverlay?.kind === "JOINKIN_THREE" ? ephemeralOverlay.resonanceAttribute : null);
  const rawAttribute = overlayAttribute ?? baseResonanceAttribute(instance.cardId, context, "JOIN");
  const bridgeOpen = active.joinkinBridgeOpen === true;
  const current = active.state.resonance.activeAttribute;
  const effectiveAttribute = rawAttribute === "JOIN" ? current ?? "JOIN" : rawAttribute;
  if (rawAttribute !== "JOIN" && bridgeOpen && current !== null) {
    const streak = active.state.resonance.streakByAttribute[current];
    active.state.resonance = {
      activeAttribute: rawAttribute,
      streakByAttribute: { STILL: 0, BURN: 0, SCATTER: 0, ROT: 0, WASH: 0, JOIN: 0, [rawAttribute]: streak },
    };
  }
  card.resonanceAttribute = effectiveAttribute;
  return { runtime: candidate, cardId: instance.cardId, rawAttribute, bridgeOpenAfter: rawAttribute === "JOIN" };
}

function restoreJoinkinCardDefinition(
  runtime: ForgeRuntimeStateV1,
  cardId: string,
  context: ForgeResolverContextV1,
): ForgeRuntimeStateV1 | null {
  const candidate = clone(runtime);
  const active = candidate.run.activeCombat;
  if (!active) return candidate;
  const card = active.state.cards.find((item) => item.cardId === cardId);
  if (card) card.resonanceAttribute = baseResonanceAttribute(cardId, context, "JOIN");
  const decoded = decodeForgeRuntimeState(candidate);
  return decoded.valid ? decoded.value : null;
}

function representInstantForge(
  result: ForgeRuntimeReducerResult,
  context: ForgeResolverContextV1,
): { state: ForgeRuntimeStateV1; events: ForgeRuntimeEvent[] } | null {
  if (!result.state || !result.resolvedCard || !result.state.run.activeCombat) return null;
  const createdEvents = result.events.filter((event): event is Extract<ForgeRuntimeEvent, { type: "FORGE_RESULT_CREATED" }> =>
    event.type === "FORGE_RESULT_CREATED" && event.mode === "INSTANT");
  if (createdEvents.length !== 1) return null;
  const created = createdEvents[0];
  const canonical = canonicalResolvedCard(created.cardId, context);
  if (canonicalSerialize(canonical) !== canonicalSerialize(result.resolvedCard)
    || canonical.card_id !== created.cardId || canonical.recipe_id !== created.recipeId) return null;

  const state = clone(result.state);
  const active = state.run.activeCombat!;
  const ledgers = active.ephemeralResults.filter(({ instanceId }) => instanceId === created.instanceId);
  if (ledgers.length !== 1 || ledgers[0].cardId !== created.cardId || ledgers[0].recipeId !== created.recipeId
    || ledgers[0].location !== "HAND" || active.state.instances.some(({ instanceId }) => instanceId === created.instanceId)
    || Object.values(active.state.zones).some((zone) => zone.includes(created.instanceId))) return null;

  const playable = playableResolvedCard(canonical);
  let events = clone(result.events);
  if (!playable) {
    ledgers[0].location = "EQUIPMENT";
    events = events.map((event) => event.type === "FORGE_RESULT_CREATED" && event.mode === "INSTANT" && event.instanceId === created.instanceId
      ? { ...event, location: "EQUIPMENT" }
      : event);
  } else {
    const existingCard = active.state.cards.find(({ cardId }) => cardId === playable.card.cardId);
    if (existingCard && canonicalSerialize(existingCard) !== canonicalSerialize(playable.card)) return null;
    if (!existingCard) active.state.cards.push(playable.card);
    const existingProgram = active.state.programs.find(({ effectId }) => effectId === playable.program.effectId);
    if (existingProgram && canonicalSerialize(existingProgram) !== canonicalSerialize(playable.program)) return null;
    if (!existingProgram) active.state.programs.push(playable.program);
    active.state.instances.push({ instanceId: created.instanceId, cardId: created.cardId });
    active.state.zones.hand.push(created.instanceId);
  }
  const decoded = decodeForgeRuntimeState(state);
  return decoded.valid ? { state: decoded.value, events } : null;
}

function combatProjection(runtime: ForgeRuntimeStateV1, context: ForgeResolverContextV1, execution: Track1RaceExecution): Pick<CombatSetup, "cards" | "instances" | "deck" | "programs"> {
  const cards: CardDefinition[] = [];
  const playableCardIds = new Set<string>();
  const equipmentCardIds = new Set<string>();
  const programs: EffectProgram[] = [];
  const programEffectIds = new Set<CombatEffectId>();

  const addPlayable = (card: CardDefinition, program: EffectProgram) => {
    if (!playableCardIds.has(card.cardId)) {
      cards.push(card);
      playableCardIds.add(card.cardId);
    }
    if (!programEffectIds.has(program.effectId)) {
      programs.push(program);
      programEffectIds.add(program.effectId);
    }
  };

  for (const { cardId } of runtime.run.ownedInstances) {
    if (playableCardIds.has(cardId) || equipmentCardIds.has(cardId)) continue;
    const recipeId = canonicalRecipeIdForCard(cardId);
    if (recipeId === null) {
      const material = context.materials.find(({ id }) => id === cardId);
      if (!material) throw new Error(`unknown Track-1 material projection: ${cardId}`);
      const projected = Array.isArray(material.attribute) ? material.attribute[0] : material.attribute;
      const resonanceAttribute = execution.raceId === "Stillkin"
        ? "STILL"
        : projected && projected !== "NONE" ? projected : execution.baselineAttribute;
      const card = { cardId, ...CONFIG.combat.baselineMaterial, resonanceAttribute } as CardDefinition;
      addPlayable(card, programForEffect(card.effectId));
      continue;
    }

    const resolved = canonicalResolvedCard(cardId, context);
    const playable = playableResolvedCard(resolved);
    if (!playable) {
      equipmentCardIds.add(cardId);
      continue;
    }
    addPlayable(playable.card, playable.program);
  }

  const active = runtime.run.activeCombat;
  if (active) {
    for (const ephemeral of active.ephemeralResults) {
      if (!active.state.instances.some(({ instanceId }) => instanceId === ephemeral.instanceId)) continue;
      const resolved = canonicalResolvedCard(ephemeral.cardId, context);
      if (resolved.recipe_id !== ephemeral.recipeId) throw new Error(`ephemeral recipe projection mismatch: ${ephemeral.instanceId}`);
      const playable = playableResolvedCard(resolved);
      if (!playable) throw new Error(`represented equipment is not playable: ${ephemeral.instanceId}`);
      addPlayable(playable.card, playable.program);
    }
  }

  const instances = runtime.run.ownedInstances.filter(({ cardId }) => playableCardIds.has(cardId)).map((instance) => ({ ...instance }));
  const playableInstanceIds = new Set(instances.map(({ instanceId }) => instanceId));
  const deck = runtime.run.deck.filter((instanceId) => playableInstanceIds.has(instanceId));
  return { cards, instances, deck, programs };
}

function combatSetup(runtime: ForgeRuntimeStateV1, flow: StillkinTrack1FlowState, node: (typeof CONFIG.route)[number] & { kind: "ENCOUNTER" }, context: ForgeResolverContextV1, execution: Track1RaceExecution): CombatSetup {
  const kind = node.encounterKind;
  const hp = kind === "NORMAL" ? CONFIG.combat.normal.hp : kind === "ELITE" ? CONFIG.combat.elite.hp : CONFIG.combat.boss.hp;
  const projection = combatProjection(runtime, context, execution);
  return {
    seed: fnv1a(`${flow.runId}|${node.nodeId}|${flow.nextEncounterNonce}`),
    rules: { maxEnergy: CONFIG.combat.maxEnergy, drawCount: CONFIG.combat.drawCount, resonanceRate: execution.resonanceRate, blockRetention: execution.blockRetention, terminalPolicy: "DEFEAT_FIRST" },
    player: { hp: flow.playerHp, maxHp: CONFIG.maxPlayerHp, block: 0 },
    enemy: { enemyId: node.encounterId, hp, maxHp: hp, block: 0, intents: enemyIntents(kind), initialIntentIndex: 0 },
    ...projection,
  };
}

function loadedCombatMatchesAuthority(runtime: ForgeRuntimeStateV1, flow: StillkinTrack1FlowState, context: ForgeResolverContextV1, execution: Track1RaceExecution): boolean {
  const active = runtime.run.activeCombat;
  const node = currentNode(flow);
  if (!active || !flow.combatBinding || node?.kind !== "ENCOUNTER" || active.state.status !== "ONGOING") return false;
  const expected = combatSetup(runtime, { ...flow, nextEncounterNonce: flow.combatBinding.encounterNonce }, node, context, execution);
  const expectedCards = expected.cards;
  return active.state.enemy.enemyId === node.encounterId
    && active.state.enemy.maxHp === expected.enemy.maxHp
    && JSON.stringify(active.state.enemy.intents) === JSON.stringify(expected.enemy.intents)
    && JSON.stringify(active.state.rules) === JSON.stringify(expected.rules)
    && active.state.player.maxHp === CONFIG.maxPlayerHp
    && active.state.player.hp <= flow.playerHp
    && JSON.stringify(active.state.cards) === JSON.stringify(expectedCards)
    && JSON.stringify(active.state.programs) === JSON.stringify(expected.programs)
    && active.enrolledPersistentInstanceIds.length === expected.deck.length
    && active.enrolledPersistentInstanceIds.every((id, index) => id === expected.deck[index]);
}

function choicesForOffer(offerId: string): readonly RewardChoice[] {
  if (offerId === "normal-d1") return CONFIG.offers.normal;
  if (offerId === "elite-d2") return CONFIG.offers.elite;
  return [];
}

function eventChoices(node: (typeof CONFIG.route)[number] | undefined): readonly { choiceId: string; price: number; effect: unknown }[] {
  if (!node || node.kind !== "EVENT") return [];
  if (node.eventType === "FICTOR") return CONFIG.offers.fictor.map((choice) => ({
    choiceId: choice.choiceId,
    price: choice.kind === "SKIP" ? 0 : CONFIG.fictorFuelPrice,
    effect: choice.kind === "MATERIAL"
      ? { kind: "MATERIAL", materialId: choice.materialId }
      : choice.kind === "RECIPE" ? { kind: "RECIPE", recipeId: choice.recipeId } : { kind: "NONE" },
  }));
  if (node.eventType === "CACHE") return [{ choiceId: "take-cache", price: 0, effect: { kind: "MATERIALS", materialIds: CONFIG.offers.cacheMaterialIds } }];
  if (node.eventType === "WORKSHOP") return [{ choiceId: "use-workshop", price: 0, effect: { kind: "WORKSHOP_ENTITLEMENT", count: 1 } }];
  if (node.eventType === "COLLAPSE") return [{ choiceId: "risk-collapse", price: 0, effect: { kind: "COLLAPSE", probabilityNumerator: CONFIG.collapse.probabilityNumerator, probabilityDenominator: CONFIG.collapse.probabilityDenominator, damage: CONFIG.collapse.damage, rewardMaterialId: CONFIG.collapse.rewardMaterialId } }];
  if (node.eventType === "RECORD") return [{ choiceId: "read-record", price: 0, effect: { kind: "RECIPE", recipeId: CONFIG.offers.recordRecipeId } }];
  return [{ choiceId: "take-oddity", price: 0, effect: { kind: "MATERIAL", materialId: CONFIG.offers.oddityMaterialId } }];
}

function currentNode(flow: StillkinTrack1FlowState) {
  return flow.currentNodeIndex === null ? null : CONFIG.route[flow.currentNodeIndex] ?? null;
}

function makeSnapshot(state: ControllerState, execution: Track1RaceExecution): StillkinTrack1Snapshot {
  const node = currentNode(state.flow);
  return clone({
    raceId: execution.raceId,
    raceLabelKo: execution.raceLabelKo,
    profile: state.profile,
    runtime: state.runtime,
    flow: state.flow,
    persistence: { generation: state.generation, revision: state.saveRevision, writeBlocked: state.writeBlocked, issues: state.issues },
    scenario: { scenarioId: execution.scenarioId, scenarioHash: execution.scenarioHash, configId: execution.configId, configHash: execution.configHash },
    currentNode: node,
    rewardChoices: state.flow.pendingOfferId ? choicesForOffer(state.flow.pendingOfferId) : [],
    eventChoices: eventChoices(node ?? undefined),
  });
}

function addMaterial(candidate: ControllerState, materialId: string, events: StillkinTrack1Event[]): boolean {
  if (materialId.startsWith("tool_") && candidate.runtime.run.ownedInstances.some((item) => item.cardId === materialId)) return false;
  const sequence = candidate.runtime.run.nextInstanceSequence;
  if (sequence === Number.MAX_SAFE_INTEGER || candidate.runtime.revision === Number.MAX_SAFE_INTEGER) return false;
  const instanceId = `forge-instance-v1-${sequence}`;
  if (candidate.runtime.run.ownedInstances.some((item) => item.instanceId === instanceId)) return false;
  const decoded = decodeForgeRuntimeState({
    ...candidate.runtime,
    revision: candidate.runtime.revision + 1,
    run: { ...candidate.runtime.run, nextInstanceSequence: sequence + 1, ownedInstances: [...candidate.runtime.run.ownedInstances, { instanceId, cardId: materialId }], deck: [...candidate.runtime.run.deck, instanceId] },
  });
  if (!decoded.valid) return false;
  candidate.runtime = decoded.value;
  events.push({ type: "MATERIAL_GRANTED", materialId, instanceId });
  return true;
}

function addRecipe(candidate: ControllerState, recipeId: string, events: StillkinTrack1Event[], rejectKnown: boolean): boolean {
  if (candidate.profile.discoveredRecipeIds.includes(recipeId)) return !rejectKnown;
  const profileResult = classifyPersistentProfile({ ...candidate.profile, discoveredRecipeIds: [...candidate.profile.discoveredRecipeIds, recipeId].sort() });
  if (profileResult.kind !== "VALID") return false;
  const runtime = syncProfile(candidate.runtime, profileResult.value);
  if (!runtime) return false;
  candidate.profile = profileResult.value;
  candidate.runtime = runtime;
  events.push({ type: "RECIPE_GRANTED", recipeId });
  return true;
}

function commandSnapshot(raw: unknown): StillkinTrack1Command | null {
  let value: JsonRecord;
  try { value = snapshotJson(raw) as JsonRecord; } catch { return null; }
  if (!value || typeof value.type !== "string") return null;
  const common = (keys: string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
  const token = () => safeCount(value.expectedRevision) && typeof value.runId === "string";
  if (["ENTER_NEXT_NODE", "LEAVE_EVENT", "RESTART"].includes(value.type)) return common(["type", "expectedRevision", "runId"]) && token() ? value as unknown as StillkinTrack1Command : null;
  if (["CHOOSE_REWARD", "RESOLVE_EVENT"].includes(value.type)) return common(["type", "expectedRevision", "runId", "choiceId"]) && token() && typeof value.choiceId === "string" && value.choiceId.length > 0 ? value as unknown as StillkinTrack1Command : null;
  if (["FORGE_WORKSHOP", "USE_FREE_WORKSHOP", "JOINKIN_FORGE_WORKSHOP", "JOINKIN_USE_FREE_WORKSHOP"].includes(value.type)) {
    const length = value.type.startsWith("JOINKIN_") ? 3 : 2;
    return common(["type", "expectedRevision", "runId", "materialInstanceIds"]) && token() && Array.isArray(value.materialInstanceIds) && value.materialInstanceIds.length === length && value.materialInstanceIds.every((id) => typeof id === "string" && id.length > 0) ? value as unknown as StillkinTrack1Command : null;
  }
  if (["APPLY_COMBAT", "FORGE_INSTANT", "JOINKIN_FORGE_INSTANT", "JOINKIN_EXTEND", "BURNKIN_PAY_HP", "BURNKIN_KINDLE"].includes(value.type)) {
    const tail = value.type === "APPLY_COMBAT" ? "command"
      : value.type === "FORGE_INSTANT" || value.type === "JOINKIN_FORGE_INSTANT" ? "materialInstanceIds"
        : value.type === "BURNKIN_KINDLE" ? "instanceId" : null;
    const keys = ["type", "expectedRevision", "runId", "nodeId", "encounterId", "encounterNonce", ...(tail ? [tail] : [])];
    if (!common(keys) || !token() || typeof value.nodeId !== "string" || typeof value.encounterId !== "string" || !safeCount(value.encounterNonce)) return null;
    if (value.type === "APPLY_COMBAT") {
      const decoded = decodeCombatCommand(value.command);
      if (!decoded.valid) return null;
      value.command = decoded.value;
    } else if ((value.type === "FORGE_INSTANT" || value.type === "JOINKIN_FORGE_INSTANT") && (!Array.isArray(value.materialInstanceIds) || value.materialInstanceIds.length !== (value.type === "JOINKIN_FORGE_INSTANT" ? 3 : 2) || !value.materialInstanceIds.every((id) => typeof id === "string" && id.length > 0))) return null;
    else if (value.type === "BURNKIN_KINDLE" && (typeof value.instanceId !== "string" || value.instanceId.length === 0)) return null;
    return value as unknown as StillkinTrack1Command;
  }
  return null;
}

function bindingMatches(binding: Track1CombatBinding | null, command: Track1CombatBinding): boolean {
  return binding !== null && binding.runId === command.runId && binding.nodeId === command.nodeId && binding.encounterId === command.encounterId && binding.encounterNonce === command.encounterNonce;
}

function forgeEntitledWorkshop(
  runtime: ForgeRuntimeStateV1,
  materialInstanceIds: [string, string] | [string, string, string],
  context: ForgeResolverContextV1,
) {
  const originalFuel = runtime.run.fuel;
  const paymentFuel = Math.max(originalFuel, FORGE_RUNTIME_FUEL_COST);
  const paymentState = decodeForgeRuntimeState({ ...runtime, run: { ...runtime.run, fuel: paymentFuel } });
  if (!paymentState.valid) return null;
  const result = materialInstanceIds.length === 3
    ? reduceForgeRuntime(paymentState.value, { type: "FORGE_WORKSHOP_THREE", materialInstanceIds }, context)
    : reduceForgeRuntime(paymentState.value, { type: "FORGE_WORKSHOP", materialInstanceIds }, context);
  if (!result.state || result.events.some((event) => event.type === "FORGE_REJECTED" || event.type === "COMMAND_REJECTED")) return null;
  const restored = decodeForgeRuntimeState({ ...result.state, run: { ...result.state.run, fuel: originalFuel } });
  if (!restored.valid) return null;
  return {
    state: restored.value,
    events: result.events.map((event) => event.type === "FUEL_SPENT"
      ? { type: "FREE_WORKSHOP_USED" as const, amount: 0 as const, remainingFuel: originalFuel }
      : event),
  };
}

function createTrack1ControllerInternal(rawOptions: StillkinTrack1ControllerOptions | unknown, execution: Track1RaceExecution): StillkinTrack1Controller {
  const options = captureOptions(rawOptions);
  assertStillkinTrack1GroundAuthority();
  let state: ControllerState | null = null;

  const fresh = (profile = createDefaultProfile(), runSequence = 1): ControllerState => ({
    profile: clone(profile), runtime: createStarterRuntime(profile, execution), flow: createFlow(runSequence, execution), generation: null, saveRevision: 0, writeBlocked: false, issues: [],
  });

  const stateAuthorityValid = (candidate: ControllerState): boolean => {
    if (candidate.profile.discoveredRecipeIds.length !== candidate.runtime.profile.discoveredRecipeIds.length
      || candidate.profile.discoveredRecipeIds.some((id, index) => id !== candidate.runtime.profile.discoveredRecipeIds[index])) return false;
    if (!runtimeReferencesAllowed(candidate.runtime, TRACK1_PERSISTENCE_CATALOG)
      || !joinkinOverlayAuthorityValid(candidate.runtime, options.context)) return false;
    if ((candidate.flow.phase === "IN_COMBAT") !== (candidate.runtime.run.activeCombat !== null)) return false;
    try {
      return candidate.flow.phase !== "IN_COMBAT" || loadedCombatMatchesAuthority(candidate.runtime, candidate.flow, options.context, execution);
    } catch { return false; }
  };

  const logicalStateHash = (candidate: ControllerState): string => sha256Hex(canonicalSerialize({
    profile: candidate.profile,
    runtime: projectRuntimeState(candidate.runtime),
    flow: candidate.flow,
  }));

  const decodeV2Bytes = (bytes: string): { ok: true; value: ControllerState } | { ok: false; issue: SaveLoadIssue } => {
    let parsed: JsonRecord;
    try { parsed = JSON.parse(bytes) as JsonRecord; } catch { return { ok: false, issue: "INVALID_JSON" }; }
    if (parsed && parsed.schemaVersion !== SAVE_SCHEMA_VERSION_V2) return { ok: false, issue: "UNSUPPORTED_VERSION" };
    const keys = ["schemaVersion", "saveGeneration", "saveRevision", "profile", "runtime", "flow"];
    if (!parsed || Object.keys(parsed).length !== keys.length || keys.some((key) => !Object.hasOwn(parsed, key))
      || !isValidSaveGeneration(parsed.saveGeneration) || !safeCount(parsed.saveRevision)) return { ok: false, issue: "INVALID_ENVELOPE" };
    const profile = classifyPersistentProfile(parsed.profile);
    if (profile.kind !== "VALID") return { ok: false, issue: profile.kind === "UNSUPPORTED" ? "UNSUPPORTED_VERSION" : "INVALID_PROFILE" };
    const runtimeProjection = parsed.runtime as JsonRecord;
    const runtime = decodeForgeRuntimeState({ ...runtimeProjection, profile: { discoveredRecipeIds: [...profile.value.discoveredRecipeIds] } });
    const flow = decodeFlow(parsed.flow, execution);
    if (!runtime.valid || !flow) return { ok: false, issue: "INVALID_RUN" };
    const value: ControllerState = {
      profile: profile.value,
      runtime: runtime.value,
      flow,
      generation: parsed.saveGeneration as string,
      saveRevision: parsed.saveRevision as number,
      writeBlocked: false,
      issues: [],
    };
    return stateAuthorityValid(value) ? { ok: true, value } : { ok: false, issue: "INVALID_RUN" };
  };

  const load = (): StillkinTrack1LoadResult => {
    let v2: string | null;
    try { v2 = options.getItem(execution.saveV2Key); } catch {
      state = { ...fresh(), writeBlocked: true, issues: ["READ_FAILED"] };
      return { snapshot: makeSnapshot(state, execution), source: "SAFE_INITIALIZED" };
    }
    if (v2 !== null) {
      const decoded = decodeV2Bytes(v2);
      if (decoded.ok) {
        state = decoded.value;
        return { snapshot: makeSnapshot(state, execution), source: "SAVED" };
      }
      state = { ...fresh(), writeBlocked: true, issues: [decoded.issue] };
      return { snapshot: makeSnapshot(state, execution), source: "SAFE_INITIALIZED" };
    }
    let profile = createDefaultProfile();
    let source: StillkinTrack1LoadResult["source"] = "EMPTY";
    if (execution.migrateV1) {
      try {
        const v1 = options.getItem(FICTOR_SAVE_KEY);
        if (v1 !== null) {
          const parsed = parseKnownEnvelope(JSON.parse(v1) as unknown);
          if (parsed.kind === "KNOWN") {
            const migrated = classifyPersistentProfile(parsed.profile);
            if (migrated.kind === "VALID") { profile = migrated.value; source = "MIGRATED_V1"; }
          }
        }
      } catch { /* v1 is never modified and invalid v1 does not poison a new v2 run. */ }
    }
    state = fresh(profile);
    return { snapshot: makeSnapshot(state, execution), source };
  };

  const snapshot = (): StillkinTrack1Snapshot => {
    if (!state) load();
    return makeSnapshot(state!, execution);
  };

  const reject = (command: StillkinTrack1Command["type"] | "UNKNOWN", reason: string, persistence: StillkinTrack1DispatchResult["persistence"] = null): StillkinTrack1DispatchResult => ({
    applied: false, snapshot: snapshot(), events: [{ type: "COMMAND_REJECTED", command, reason }], persistence, reason,
  });

  const persist = (candidate: ControllerState): StillkinTrack1DispatchResult["persistence"] => {
    if (candidate.writeBlocked) return { ok: false, reason: "WRITE_BLOCKED" };
    if (!stateAuthorityValid(candidate)) return { ok: false, reason: "INVALID_RUNTIME" };
    if (candidate.saveRevision === Number.MAX_SAFE_INTEGER) return { ok: false, reason: "REVISION_EXHAUSTED" };
    let bytes: string | null;
    try { bytes = options.getItem(execution.saveV2Key); } catch { return { ok: false, reason: "READ_FAILED" }; }
    if (candidate.generation === null) {
      if (bytes !== null) return decodeV2Bytes(bytes).ok ? { ok: false, reason: "STALE_WRITE" } : { ok: false, reason: "WRITE_BLOCKED" };
    } else {
      if (bytes === null) return { ok: false, reason: "STALE_WRITE" };
      const current = decodeV2Bytes(bytes);
      if (!current.ok) return { ok: false, reason: "WRITE_BLOCKED" };
      if (current.value.generation !== candidate.generation || current.value.saveRevision !== candidate.saveRevision) return { ok: false, reason: "STALE_WRITE" };
      if (!state || logicalStateHash(current.value) !== logicalStateHash(state)) return { ok: false, reason: "STALE_WRITE" };
    }
    let generation = candidate.generation;
    let revision = candidate.saveRevision + 1;
    if (generation === null) {
      try { generation = options.generationFactory(); } catch { return { ok: false, reason: "GENERATION_FAILED" }; }
      if (!isValidSaveGeneration(generation)) return { ok: false, reason: "GENERATION_FAILED" };
      revision = 0;
    }
    const envelope: SaveEnvelopeV2<StillkinTrack1FlowState> = { schemaVersion: SAVE_SCHEMA_VERSION_V2, saveGeneration: generation, saveRevision: revision, profile: candidate.profile, runtime: projectRuntimeState(candidate.runtime), flow: candidate.flow };
    try { options.setItem(execution.saveV2Key, JSON.stringify(envelope)); } catch { return { ok: false, reason: "WRITE_FAILED" }; }
    candidate.generation = generation;
    candidate.saveRevision = revision;
    return { ok: true, generation, revision };
  };

  const dispatch = (rawCommand: StillkinTrack1Command | unknown): StillkinTrack1DispatchResult => {
    if (!state) load();
    const command = commandSnapshot(rawCommand);
    if (!command) return reject("UNKNOWN", "INVALID_COMMAND");
    if (command.expectedRevision !== state!.flow.revision) return reject(command.type, "STALE_REVISION");
    if (command.runId !== state!.flow.runId) return reject(command.type, "STALE_RUN");
    if (state!.flow.revision === Number.MAX_SAFE_INTEGER) return reject(command.type, "REVISION_EXHAUSTED");
    const candidate = clone(state!);
    const events: StillkinTrack1Event[] = [];
    const node = currentNode(candidate.flow);
    let failure: string | null = null;

    if (command.type === "ENTER_NEXT_NODE") {
      if (candidate.flow.phase !== "BETWEEN_NODES") failure = "INVALID_PHASE";
      else {
        const next = CONFIG.route[candidate.flow.nextNodeIndex];
        if (!next) failure = "NO_NEXT_NODE";
        else {
          candidate.flow.currentNodeIndex = candidate.flow.nextNodeIndex;
          candidate.flow.nextNodeIndex += 1;
          events.push({ type: "NODE_ENTERED", nodeId: next.nodeId });
          if (next.kind === "EVENT") candidate.flow.phase = "IN_EVENT";
          else {
            try {
              const setup = combatSetup(candidate.runtime, candidate.flow, next, options.context, execution);
              const combat = createCombatState(setup);
              const binding = { runId: candidate.flow.runId, nodeId: next.nodeId, encounterId: next.encounterId, encounterNonce: candidate.flow.nextEncounterNonce };
              const runtime = decodeForgeRuntimeState({
                ...candidate.runtime,
                run: {
                  ...candidate.runtime.run,
                  activeCombat: {
                    state: combat,
                    enrolledPersistentInstanceIds: [...setup.deck],
                    forgeActionTurn: 0,
                    forgeActionsRemaining: 0,
                    isolatedMaterials: [],
                    ephemeralResults: [],
                    ...(execution.raceId === "Joinkin" ? { joinkinSkillUsedTurn: null, joinkinBridgeOpen: false } : {}),
                  },
                },
              });
              if (!runtime.valid) failure = "COMBAT_SETUP_FAILED";
              else {
                candidate.runtime = runtime.value;
                candidate.flow.phase = "IN_COMBAT";
                candidate.flow.combatBinding = binding;
                candidate.flow.nextEncounterNonce += 1;
              }
            } catch { failure = "COMBAT_SETUP_FAILED"; }
          }
        }
      }
    } else if (command.type === "APPLY_COMBAT" || command.type === "FORGE_INSTANT" || command.type === "JOINKIN_FORGE_INSTANT" || command.type === "JOINKIN_EXTEND" || command.type === "BURNKIN_PAY_HP" || command.type === "BURNKIN_KINDLE") {
      if (candidate.flow.phase !== "IN_COMBAT" || !bindingMatches(candidate.flow.combatBinding, command)) failure = "STALE_ENCOUNTER_BINDING";
      else if (!candidate.runtime.run.activeCombat || candidate.runtime.run.activeCombat.state.enemy.enemyId !== command.encounterId) failure = "COMBAT_AUTHORITY_MISMATCH";
      else if ((command.type === "BURNKIN_PAY_HP" || command.type === "BURNKIN_KINDLE") && execution.raceId !== "Burnkin") failure = "RACE_COMMAND_UNAVAILABLE";
      else if ((command.type === "JOINKIN_FORGE_INSTANT" || command.type === "JOINKIN_EXTEND") && execution.raceId !== "Joinkin") failure = "RACE_COMMAND_UNAVAILABLE";
      else {
        const beforeResonance = candidate.runtime.run.activeCombat.state.resonance.activeAttribute;
        let result: { state: ForgeRuntimeStateV1 | null; events: StillkinTrack1Event[]; resolvedCard?: GeneratedCard };
        let joinkinPlay: ReturnType<typeof prepareJoinkinCardPlay> = null;
        if (command.type === "JOINKIN_EXTEND") {
          const active = candidate.runtime.run.activeCombat;
          if (active.state.status !== "ONGOING" || active.state.phase !== "PLAYER_ACTION"
            || active.forgeActionTurn !== active.state.turn || active.forgeActionsRemaining !== 1
            || active.joinkinSkillUsedTurn === active.state.turn || candidate.runtime.revision === Number.MAX_SAFE_INTEGER) {
            failure = "JOINKIN_EXTEND_UNAVAILABLE";
            result = { state: candidate.runtime, events: [] };
          } else {
            const decoded = decodeForgeRuntimeState({
              ...candidate.runtime,
              revision: candidate.runtime.revision + 1,
              run: {
                ...candidate.runtime.run,
                activeCombat: { ...active, forgeActionsRemaining: 2, joinkinSkillUsedTurn: active.state.turn },
              },
            });
            if (!decoded.valid) { failure = "POSTCONDITION_FAILED"; result = { state: candidate.runtime, events: [] }; }
            else result = { state: decoded.value, events: [{ type: "JOINKIN_FORGE_ACTION_GRANTED", remaining: 2, turn: active.state.turn }] };
          }
        } else if (command.type === "BURNKIN_PAY_HP" || command.type === "BURNKIN_KINDLE") {
          const rules = execution.burnkinRules!;
          const transition = command.type === "BURNKIN_PAY_HP"
            ? payBurnkinHpForEnergy(candidate.runtime.run.activeCombat.state, rules)
            : kindleBurnkinCard(candidate.runtime.run.activeCombat.state, command.instanceId);
          if (!transition.ok || !transition.state || candidate.runtime.revision === Number.MAX_SAFE_INTEGER) {
            failure = transition.ok ? "RUNTIME_REJECTED" : transition.reason;
            result = { state: candidate.runtime, events: [] };
          } else {
            const activeCombat = clone(candidate.runtime.run.activeCombat);
            activeCombat.state = transition.state;
            if (command.type === "BURNKIN_KINDLE") {
              const ephemeral = activeCombat.ephemeralResults.find(({ instanceId }) => instanceId === command.instanceId);
              if (ephemeral) ephemeral.location = "EXILE";
            }
            const decoded = decodeForgeRuntimeState({
              ...candidate.runtime,
              revision: candidate.runtime.revision + 1,
              run: { ...candidate.runtime.run, activeCombat },
            });
            if (!decoded.valid) {
              failure = "POSTCONDITION_FAILED";
              result = { state: candidate.runtime, events: [] };
            } else result = { state: decoded.value, events: [...transition.events] };
          }
        } else {
          let runtimeInput = candidate.runtime;
          if (execution.raceId === "Joinkin" && command.type === "APPLY_COMBAT" && command.command.type === "PLAY_CARD") {
            joinkinPlay = prepareJoinkinCardPlay(candidate.runtime, command.command, options.context);
            if (!joinkinPlay) failure = "RUNTIME_REJECTED";
            else runtimeInput = joinkinPlay.runtime;
          }
          const runtimeCommand = command.type === "APPLY_COMBAT"
            ? { type: "APPLY_COMBAT" as const, command: command.command }
            : command.type === "JOINKIN_FORGE_INSTANT"
              ? { type: "FORGE_INSTANT_THREE" as const, materialInstanceIds: command.materialInstanceIds }
              : { type: "FORGE_INSTANT" as const, materialInstanceIds: command.materialInstanceIds };
          result = failure ? { state: candidate.runtime, events: [] } : reduceForgeRuntime(runtimeInput, runtimeCommand, options.context) as typeof result;
          if (!failure && joinkinPlay && result.state) {
            const restored = restoreJoinkinCardDefinition(result.state, joinkinPlay.cardId, options.context);
            const active = restored?.run.activeCombat;
            if (!restored || !active) failure = "POSTCONDITION_FAILED";
            else {
              active.joinkinBridgeOpen = active.state.status === "ONGOING" ? joinkinPlay.bridgeOpenAfter : false;
              const decoded = decodeForgeRuntimeState(restored);
              if (!decoded.valid) failure = "POSTCONDITION_FAILED";
              else result.state = decoded.value;
            }
          }
        }
        if (!failure && (!result.state || result.events.some((event) => event.type === "FORGE_REJECTED" || event.type === "COMMAND_REJECTED"))) failure = "RUNTIME_REJECTED";
        else if (!failure && result.state) {
          let represented: { state: ForgeRuntimeStateV1; events: StillkinTrack1Event[] } | null = command.type === "FORGE_INSTANT" || command.type === "JOINKIN_FORGE_INSTANT"
            ? representInstantForge(result as ForgeRuntimeReducerResult, options.context)
            : { state: result.state, events: [...result.events] };
          if (represented && execution.raceId === "Burnkin" && command.type === "APPLY_COMBAT" && command.command.type === "PLAY_CARD") {
            const activeAfter = represented.state.run.activeCombat;
            const afterResonance = activeAfter?.state.resonance.activeAttribute ?? null;
            const breakResult = activeAfter
              ? applyBurnkinResonanceBreak(activeAfter.state, beforeResonance, afterResonance, execution.burnkinRules!)
              : null;
            if (!breakResult?.ok || !breakResult.state) represented = null;
            else if (breakResult.events.length > 0) {
              const updated = decodeForgeRuntimeState({
                ...represented.state,
                run: { ...represented.state.run, activeCombat: { ...activeAfter!, state: breakResult.state } },
              });
              if (!updated.valid) represented = null;
              else {
                const cleanupEvents = represented.events.filter((event) => event.type === "INSTANT_FORGE_CLEANED");
                const nonterminalEvents = represented.events.filter((event) => event.type !== "COMBAT_ENDED" && !(event.type === "PHASE_CHANGED" && event.phase === "TERMINAL") && event.type !== "INSTANT_FORGE_CLEANED");
                let updatedState = updated.value;
                let terminalCleanupEvents: StillkinTrack1Event[] = cleanupEvents;
                if (breakResult.state.status !== "ONGOING" && cleanupEvents.length === 0) {
                  const cleanup = reduceForgeRuntime(updatedState, { type: "CLEANUP_COMBAT" }, options.context);
                  if (!cleanup.state || cleanup.events.some((event) => event.type === "FORGE_REJECTED" || event.type === "COMMAND_REJECTED")) represented = null;
                  else { updatedState = cleanup.state; terminalCleanupEvents = cleanup.events; }
                }
                if (represented) {
                  represented = {
                    state: updatedState,
                    events: [
                      ...nonterminalEvents,
                      ...breakResult.events,
                      ...(breakResult.state.status === "ONGOING" ? [] : [
                        { type: "COMBAT_ENDED" as const, status: breakResult.state.status },
                        { type: "PHASE_CHANGED" as const, phase: "TERMINAL" as const },
                      ]),
                      ...terminalCleanupEvents,
                    ],
                  };
                }
              }
            }
          }
          if (!represented) failure = "RUNTIME_REJECTED";
          else {
            candidate.runtime = represented.state;
            events.push(...represented.events);
          }
          const active = candidate.runtime.run.activeCombat;
          if (!failure && command.type === "APPLY_COMBAT" && active && active.state.status !== "ONGOING") {
            const status = active.state.status;
            candidate.flow.playerHp = Math.max(0, active.state.player.hp);
            const cleared = decodeForgeRuntimeState({ ...candidate.runtime, run: { ...candidate.runtime.run, activeCombat: null } });
            if (!cleared.valid) failure = "COMBAT_CLEANUP_FAILED";
            else {
              candidate.runtime = cleared.value;
              candidate.flow.combatBinding = null;
              if (status === "DEFEAT") {
                candidate.flow.phase = "RUN_LOST";
                events.push({ type: "RUN_LOST" });
              } else if (node?.kind !== "ENCOUNTER" || node.encounterId !== command.encounterId) failure = "COMBAT_AUTHORITY_MISMATCH";
              else {
                events.push({ type: "ENCOUNTER_WON", encounterId: node.encounterId });
                if (node.encounterKind === "BOSS") {
                  const profile = classifyPersistentProfile({ ...candidate.profile, ownedHeartIds: [...new Set([...candidate.profile.ownedHeartIds, CONFIG.offers.heartId])].sort() });
                  if (profile.kind !== "VALID") failure = "HEART_GRANT_FAILED";
                  else {
                    candidate.profile = profile.value;
                    candidate.flow.phase = "RUN_WON";
                    events.push({ type: "HEART_OWNED", heartId: "heart__still" }, { type: "RUN_WON" });
                  }
                } else {
                  candidate.flow.phase = "AWAITING_REWARD";
                  candidate.flow.pendingOfferId = node.encounterKind === "NORMAL" ? "normal-d1" : "elite-d2";
                  events.push({ type: "REWARD_AVAILABLE", offerId: candidate.flow.pendingOfferId });
                }
              }
            }
          }
          if (!failure && candidate.runtime.profile.discoveredRecipeIds.length !== candidate.profile.discoveredRecipeIds.length) {
            const profile = classifyPersistentProfile({ ...candidate.profile, discoveredRecipeIds: [...candidate.runtime.profile.discoveredRecipeIds] });
            if (profile.kind !== "VALID") failure = "PROFILE_SYNC_FAILED";
            else candidate.profile = profile.value;
          }
        }
      }
    } else if (command.type === "CHOOSE_REWARD") {
      if (candidate.flow.phase !== "AWAITING_REWARD" || !candidate.flow.pendingOfferId) failure = "INVALID_PHASE";
      else {
        const choice = choicesForOffer(candidate.flow.pendingOfferId).find((item) => item.choiceId === command.choiceId);
        if (!choice) failure = "CHOICE_NOT_BOUND";
        else if (choice.kind === "MATERIAL" ? !addMaterial(candidate, choice.materialId, events) : !addRecipe(candidate, choice.recipeId, events, false)) failure = "REWARD_APPLICATION_FAILED";
        else { candidate.flow.pendingOfferId = null; candidate.flow.phase = "BETWEEN_NODES"; }
      }
    } else if (command.type === "RESOLVE_EVENT") {
      if (candidate.flow.phase !== "IN_EVENT" || node?.kind !== "EVENT") failure = "INVALID_PHASE";
      else if (!eventChoices(node).some(({ choiceId }) => choiceId === command.choiceId)) failure = "CHOICE_NOT_BOUND";
      else {
        const eventType = node.eventType;
        if (eventType === "CACHE") {
          for (const id of CONFIG.offers.cacheMaterialIds) if (!addMaterial(candidate, id, events)) { failure = "CACHE_GRANT_FAILED"; break; }
        } else if (eventType === "WORKSHOP") {
          if (candidate.flow.workshopEntitlementNodeId !== null) failure = "ENTITLEMENT_ALREADY_GRANTED";
          else { candidate.flow.workshopEntitlementNodeId = node.nodeId; events.push({ type: "WORKSHOP_ENTITLEMENT_GRANTED", nodeId: node.nodeId }); }
        } else if (eventType === "COLLAPSE") {
          const randomState = xorshift32(candidate.flow.randomState);
          candidate.flow.randomState = randomState;
          const success = randomState % CONFIG.collapse.probabilityDenominator < CONFIG.collapse.probabilityNumerator;
          events.push({ type: "COLLAPSE_RESOLVED", outcome: success ? "SUCCESS" : "FAILURE", randomState });
          if (success) {
            if (!addMaterial(candidate, CONFIG.collapse.rewardMaterialId, events)) failure = "COLLAPSE_GRANT_FAILED";
          } else {
            candidate.flow.playerHp = Math.max(0, candidate.flow.playerHp - CONFIG.collapse.damage);
            events.push({ type: "PLAYER_DAMAGED", amount: CONFIG.collapse.damage, remainingHp: candidate.flow.playerHp });
            if (candidate.flow.playerHp === 0) { candidate.flow.phase = "RUN_LOST"; events.push({ type: "RUN_LOST" }); }
          }
        } else if (eventType === "FICTOR") {
          const choice = CONFIG.offers.fictor.find((item) => item.choiceId === command.choiceId);
          if (!choice) failure = "CHOICE_NOT_BOUND";
          else if (choice.kind === "SKIP") { /* Explicit zero-cost progression path. */ }
          else if (candidate.runtime.run.fuel < CONFIG.fictorFuelPrice) failure = "INSUFFICIENT_FUEL";
          else {
            const granted = choice.kind === "MATERIAL" ? addMaterial(candidate, choice.materialId, events) : addRecipe(candidate, choice.recipeId, events, true);
            if (!granted) failure = choice.kind === "MATERIAL" && choice.materialId.startsWith("tool_") ? "UNIQUE_TOOL_ALREADY_OWNED" : "CHOICE_ALREADY_OWNED";
            else {
              candidate.runtime.run.fuel -= CONFIG.fictorFuelPrice;
              events.push({ type: "FUEL_SPENT", amount: CONFIG.fictorFuelPrice, remaining: candidate.runtime.run.fuel });
            }
          }
        } else if (eventType === "RECORD") {
          if (!addRecipe(candidate, CONFIG.offers.recordRecipeId, events, false)) failure = "RECORD_GRANT_FAILED";
        } else if (!addMaterial(candidate, CONFIG.offers.oddityMaterialId, events)) failure = "ODDITY_GRANT_FAILED";
        if (!failure && candidate.flow.phase !== "RUN_LOST") candidate.flow.phase = "EVENT_RESOLVED";
        if (!failure) events.push({ type: "EVENT_RESOLVED", eventType, choiceId: command.choiceId });
      }
    } else if (command.type === "USE_FREE_WORKSHOP" || command.type === "JOINKIN_USE_FREE_WORKSHOP") {
      if (command.type === "JOINKIN_USE_FREE_WORKSHOP" && execution.raceId !== "Joinkin") failure = "RACE_COMMAND_UNAVAILABLE";
      else if (command.type === "USE_FREE_WORKSHOP" && execution.raceId === "Joinkin") failure = "RACE_COMMAND_UNAVAILABLE";
      else if (candidate.flow.phase !== "EVENT_RESOLVED" || node?.kind !== "EVENT" || node.eventType !== "WORKSHOP" || candidate.flow.workshopEntitlementNodeId !== node.nodeId) failure = "NO_WORKSHOP_ENTITLEMENT";
      else {
        const result = forgeEntitledWorkshop(candidate.runtime, command.materialInstanceIds, options.context);
        if (!result) failure = "RUNTIME_REJECTED";
        else {
          candidate.runtime = result.state;
          events.push(...result.events, { type: "WORKSHOP_ENTITLEMENT_CONSUMED", nodeId: node.nodeId });
          candidate.flow.workshopEntitlementNodeId = null;
          const profile = classifyPersistentProfile({ ...candidate.profile, discoveredRecipeIds: [...candidate.runtime.profile.discoveredRecipeIds] });
          if (profile.kind !== "VALID") failure = "PROFILE_SYNC_FAILED"; else candidate.profile = profile.value;
        }
      }
    } else if (command.type === "FORGE_WORKSHOP" || command.type === "JOINKIN_FORGE_WORKSHOP") {
      if (command.type === "JOINKIN_FORGE_WORKSHOP" && execution.raceId !== "Joinkin") failure = "RACE_COMMAND_UNAVAILABLE";
      else if (command.type === "FORGE_WORKSHOP" && execution.raceId === "Joinkin") failure = "RACE_COMMAND_UNAVAILABLE";
      else if (candidate.flow.phase !== "BETWEEN_NODES" && candidate.flow.phase !== "EVENT_RESOLVED") failure = "INVALID_PHASE";
      else {
        const result = command.type === "JOINKIN_FORGE_WORKSHOP"
          ? reduceForgeRuntime(candidate.runtime, { type: "FORGE_WORKSHOP_THREE", materialInstanceIds: command.materialInstanceIds }, options.context)
          : reduceForgeRuntime(candidate.runtime, { type: "FORGE_WORKSHOP", materialInstanceIds: command.materialInstanceIds }, options.context);
        if (!result.state || result.events.some((event) => event.type === "FORGE_REJECTED" || event.type === "COMMAND_REJECTED")) failure = "RUNTIME_REJECTED";
        else {
          candidate.runtime = result.state; events.push(...result.events);
          const profile = classifyPersistentProfile({ ...candidate.profile, discoveredRecipeIds: [...candidate.runtime.profile.discoveredRecipeIds] });
          if (profile.kind !== "VALID") failure = "PROFILE_SYNC_FAILED"; else candidate.profile = profile.value;
        }
      }
    } else if (command.type === "LEAVE_EVENT") {
      if (candidate.flow.phase !== "EVENT_RESOLVED") failure = "INVALID_PHASE";
      else if (candidate.flow.workshopEntitlementNodeId !== null) failure = "WORKSHOP_ENTITLEMENT_UNSETTLED";
      else candidate.flow.phase = "BETWEEN_NODES";
    } else if (command.type === "RESTART") {
      if (candidate.flow.phase !== "RUN_WON" && candidate.flow.phase !== "RUN_LOST") failure = "INVALID_PHASE";
      else if (candidate.flow.runSequence === Number.MAX_SAFE_INTEGER) failure = "RUN_SEQUENCE_EXHAUSTED";
      else {
        candidate.runtime = createStarterRuntime(candidate.profile, execution);
        candidate.flow = createFlow(candidate.flow.runSequence + 1, execution);
        events.push({ type: "RUN_RESTARTED", runId: candidate.flow.runId });
      }
    }

    if (failure) return reject(command.type, failure);
    if (command.type !== "RESTART") candidate.flow.revision += 1;
    const synchronized = syncProfile(candidate.runtime, candidate.profile);
    if (!synchronized) return reject(command.type, "POSTCONDITION_FAILED");
    candidate.runtime = synchronized;
    const validatedFlow = decodeFlow(candidate.flow, execution);
    if (!validatedFlow) return reject(command.type, "POSTCONDITION_FAILED");
    candidate.flow = validatedFlow;
    const persistence = persist(candidate);
    if (!persistence?.ok) return reject(command.type, "PERSISTENCE_FAILED", persistence);
    state = candidate;
    return { applied: true, snapshot: makeSnapshot(state, execution), events: clone(events), persistence };
  };

  return Object.freeze({ load, snapshot, dispatch });
}

export function createStillkinTrack1Controller(rawOptions: StillkinTrack1ControllerOptions | unknown): StillkinTrack1Controller {
  return createTrack1ControllerInternal(rawOptions, STILLKIN_EXECUTION);
}

export function createBurnkinTrack1Controller(rawOptions: StillkinTrack1ControllerOptions | unknown): StillkinTrack1Controller {
  return createTrack1ControllerInternal(rawOptions, BURNKIN_EXECUTION);
}

export function createJoinkinTrack1Controller(rawOptions: StillkinTrack1ControllerOptions | unknown): StillkinTrack1Controller {
  return createTrack1ControllerInternal(rawOptions, JOINKIN_EXECUTION);
}

export function createTrack1Controller(rawOptions: StillkinTrack1ControllerOptions | unknown, raceId: Track1RaceId): StillkinTrack1Controller {
  if (raceId === "Stillkin") return createTrack1ControllerInternal(rawOptions, STILLKIN_EXECUTION);
  if (raceId === "Burnkin") return createTrack1ControllerInternal(rawOptions, BURNKIN_EXECUTION);
  if (raceId === "Joinkin") return createTrack1ControllerInternal(rawOptions, JOINKIN_EXECUTION);
  throw new TypeError("race is not enabled for Track 1");
}
