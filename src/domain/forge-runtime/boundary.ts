import { decodeCombatCommand, decodeCombatState } from "../combat";
import type {
  CardInstance,
  CombatCommand,
  CombatState,
} from "../combat";
import type {
  EquipmentInteraction,
  ForgeAttribute,
  ForgeInputs,
  ForgeLaw,
  ForgeMaterial,
  ForgeResultClass,
  ForgeTuning,
  ToolDomain,
} from "../forge";
import {
  FORGE_RUNTIME_ENGINE_VERSION,
  FORGE_RUNTIME_RESOLVER_VERSION,
  FORGE_RUNTIME_SCHEMA_VERSION,
  FORGE_RUNTIME_SOURCE_HASH,
  type ActiveCombatForgeRuntime,
  type EphemeralForgeResult,
  type ForgeResolverContextV1,
  type ForgeRuntimeCommand,
  type ForgeRuntimeDecodeResult,
  type ForgeRuntimeStateV1,
  type ForgeRuntimeValidationResult,
  type IsolatedMaterial,
} from "./types";
import { FORGE_RUNTIME_PROJECTION_HASH, projectionHash } from "./source-binding";

type UnknownRecord = Record<string, unknown>;

const ATTRIBUTES = ["STILL", "BURN", "SCATTER", "ROT", "WASH", "JOIN"] as const;
const MATERIAL_ATTRIBUTES = [...ATTRIBUTES, "NONE"] as const;
const TOOL_DOMAINS = ["FORGE", "HAND", "DECK", "INFO", "SCALE", "ENERGY", "BALANCE", "KEEP", "ROUTE", "CARRY"] as const;
const MATERIAL_CATEGORIES = ["ORE", "GROUND_PRODUCT", "TOOL", "ODDITY"] as const;
const RESULT_FAMILIES = ["CROSS", "SAME", "CATALYST", "EQUIPMENT", "HEART"] as const;
const DENSITIES = ["MIN", "SPARSE", "MID", "DENSE", "MAX"] as const;
const LOCATIONS = ["HAND", "DECK", "DISCARD", "EXILE", "EQUIPMENT"] as const;
const MATERIAL_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

class BoundaryError extends Error {}

function snapshotValue(value: unknown, location: string, ancestors: Set<object>): unknown {
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new BoundaryError(`${location} contains an unsupported value`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new BoundaryError(`${location} must be finite`);
  }
  if (value === null || typeof value !== "object") return value;
  const source = value as object;
  if (ancestors.has(source)) throw new BoundaryError(`${location} must not contain cycles`);

  let isArray: boolean;
  let prototype: object | null;
  let keys: (string | symbol)[];
  try {
    isArray = Array.isArray(source);
    prototype = Object.getPrototypeOf(source) as object | null;
    keys = Reflect.ownKeys(source);
  } catch {
    throw new BoundaryError(`${location} cannot be inspected safely`);
  }
  if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    throw new BoundaryError(`${location} has an invalid prototype`);
  }
  if (keys.some((key) => typeof key === "symbol")) {
    throw new BoundaryError(`${location} must not contain symbol keys`);
  }

  const descriptors = new Map<string, PropertyDescriptor>();
  for (const key of keys as string[]) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(source, key);
    } catch {
      throw new BoundaryError(`${location}.${key} cannot be inspected safely`);
    }
    if (!descriptor || !("value" in descriptor)) {
      throw new BoundaryError(`${location}.${key} must be an own data property`);
    }
    descriptors.set(key, descriptor);
  }

  const nextAncestors = new Set(ancestors).add(source);
  if (isArray) {
    const length = descriptors.get("length")?.value;
    if (!Number.isSafeInteger(length) || length < 0) throw new BoundaryError(`${location}.length is invalid`);
    for (const key of descriptors.keys()) {
      if (key === "length") continue;
      const index = Number(key);
      if (!Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key) {
        throw new BoundaryError(`${location} has an unexpected array key`);
      }
    }
    if (descriptors.size !== length + 1) throw new BoundaryError(`${location} must be dense`);
    const result: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      result.push(snapshotValue(descriptors.get(String(index))!.value, `${location}[${index}]`, nextAncestors));
    }
    return result;
  }

  const result: UnknownRecord = {};
  for (const [key, descriptor] of descriptors) {
    result[key] = snapshotValue(descriptor.value, `${location}.${key}`, nextAncestors);
  }
  return result;
}

function snapshot(candidate: unknown, location: string): ForgeRuntimeDecodeResult<unknown> {
  try {
    return { valid: true, value: snapshotValue(candidate, location, new Set()), errors: [] };
  } catch (error) {
    return { valid: false, errors: [error instanceof BoundaryError ? error.message : `${location} cannot be inspected safely`] };
  }
}

function record(value: unknown, keys: readonly string[], location: string, errors: string[]): value is UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${location} must be an object`);
    return false;
  }
  const actual = Object.keys(value);
  for (const key of actual) if (!keys.includes(key)) errors.push(`${location} has unexpected key: ${key}`);
  for (const key of keys) if (!actual.includes(key)) errors.push(`${location} is missing key: ${key}`);
  return actual.length === keys.length && errors.length === 0;
}

function optionalRecord(value: unknown, required: readonly string[], optional: readonly string[], location: string, errors: string[]): value is UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${location} must be an object`);
    return false;
  }
  const actual = Object.keys(value);
  for (const key of actual) if (!required.includes(key) && !optional.includes(key)) errors.push(`${location} has unexpected key: ${key}`);
  for (const key of required) if (!actual.includes(key)) errors.push(`${location} is missing key: ${key}`);
  return errors.length === 0;
}

function array(value: unknown, location: string, errors: string[]): value is unknown[] {
  if (!Array.isArray(value)) {
    errors.push(`${location} must be an array`);
    return false;
  }
  return true;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function nullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER);
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function uniqueStrings(values: readonly string[], location: string, errors: string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (!nonempty(value)) errors.push(`${location} must contain nonempty strings`);
    if (seen.has(value)) errors.push(`${location} must contain unique strings: ${value}`);
    seen.add(value);
  }
}

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1] < value);
}

function validateInstance(value: unknown, location: string, errors: string[]): value is CardInstance {
  if (!record(value, ["instanceId", "cardId"], location, errors)) return false;
  if (!nonempty(value.instanceId)) errors.push(`${location}.instanceId must be nonempty`);
  if (!nonempty(value.cardId)) errors.push(`${location}.cardId must be nonempty`);
  return errors.length === 0;
}

function validateStringList(value: unknown, location: string, errors: string[]): value is string[] {
  if (!array(value, location, errors)) return false;
  for (const item of value) if (typeof item !== "string") errors.push(`${location} must contain strings`);
  return errors.length === 0;
}

function validateActive(value: unknown, owned: readonly CardInstance[], location: string, errors: string[]): value is ActiveCombatForgeRuntime {
  if (!optionalRecord(
    value,
    ["state", "enrolledPersistentInstanceIds", "forgeActionTurn", "forgeActionsRemaining", "isolatedMaterials", "ephemeralResults"],
    ["joinkinSkillUsedTurn", "joinkinBridgeOpen"],
    location,
    errors,
  )) return false;
  const decodedCombat = decodeCombatState(value.state);
  if (!decodedCombat.valid) errors.push(...decodedCombat.errors.map((error) => `${location}.state: ${error}`));
  else value.state = decodedCombat.value;
  validateStringList(value.enrolledPersistentInstanceIds, `${location}.enrolledPersistentInstanceIds`, errors);
  if (!count(value.forgeActionTurn)) errors.push(`${location}.forgeActionTurn must be a safe unsigned integer`);
  if (value.forgeActionsRemaining !== 0 && value.forgeActionsRemaining !== 1 && value.forgeActionsRemaining !== 2) errors.push(`${location}.forgeActionsRemaining must be zero, one, or two`);
  if ("joinkinSkillUsedTurn" in value && value.joinkinSkillUsedTurn !== null && !count(value.joinkinSkillUsedTurn)) errors.push(`${location}.joinkinSkillUsedTurn must be null or a safe unsigned integer`);
  if ("joinkinBridgeOpen" in value && typeof value.joinkinBridgeOpen !== "boolean") errors.push(`${location}.joinkinBridgeOpen must be boolean`);
  if (array(value.isolatedMaterials, `${location}.isolatedMaterials`, errors)) {
    for (let index = 0; index < value.isolatedMaterials.length; index += 1) {
      const isolated = value.isolatedMaterials[index];
      if (record(isolated, ["instance"], `${location}.isolatedMaterials[${index}]`, errors)) {
        validateInstance(isolated.instance, `${location}.isolatedMaterials[${index}].instance`, errors);
      }
    }
  }
  if (array(value.ephemeralResults, `${location}.ephemeralResults`, errors)) {
    for (let index = 0; index < value.ephemeralResults.length; index += 1) {
      const item = value.ephemeralResults[index];
      const itemLocation = `${location}.ephemeralResults[${index}]`;
      if (optionalRecord(item, ["instanceId", "cardId", "recipeId", "location"], ["provenance"], itemLocation, errors)) {
        if (!nonempty(item.instanceId) || !nonempty(item.cardId) || !nonempty(item.recipeId)) errors.push(`${itemLocation} ids must be nonempty`);
        if (!oneOf(item.location, LOCATIONS)) errors.push(`${itemLocation}.location is invalid`);
        if ("provenance" in item) {
          const provenance = item.provenance;
          if (provenance === null || typeof provenance !== "object" || Array.isArray(provenance)) errors.push(`${itemLocation}.provenance must be an object`);
          else if ((provenance as UnknownRecord).kind === "PAIR") {
            if (record(provenance, ["kind", "materialInstanceIds"], `${itemLocation}.provenance`, errors)) {
              if (!array(provenance.materialInstanceIds, `${itemLocation}.provenance.materialInstanceIds`, errors)
                || provenance.materialInstanceIds.length !== 2 || !provenance.materialInstanceIds.every(nonempty)) errors.push(`${itemLocation}.provenance pair ids are invalid`);
            }
          } else if ((provenance as UnknownRecord).kind === "JOINKIN_THREE") {
            if (record(provenance, ["kind", "baseMaterialInstanceIds", "thirdMaterialInstanceId", "thirdMaterialId", "resonanceAttribute"], `${itemLocation}.provenance`, errors)) {
              if (!array(provenance.baseMaterialInstanceIds, `${itemLocation}.provenance.baseMaterialInstanceIds`, errors)
                || provenance.baseMaterialInstanceIds.length !== 2 || !provenance.baseMaterialInstanceIds.every(nonempty)
                || !nonempty(provenance.thirdMaterialInstanceId) || !nonempty(provenance.thirdMaterialId)
                || !(provenance.resonanceAttribute === null || oneOf(provenance.resonanceAttribute, ATTRIBUTES))) errors.push(`${itemLocation}.provenance Joinkin fields are invalid`);
            }
          } else errors.push(`${itemLocation}.provenance kind is invalid`);
        }
      }
    }
  }
  if (errors.length > 0 || !decodedCombat.valid) return false;

  const active = value as unknown as ActiveCombatForgeRuntime;
  if (active.forgeActionTurn !== active.state.turn) errors.push(`${location}.forgeActionTurn must equal combat turn`);
  if (active.forgeActionsRemaining === 2 && (active.joinkinSkillUsedTurn !== active.state.turn || typeof active.joinkinBridgeOpen !== "boolean")) {
    errors.push(`${location}.forgeActionsRemaining two requires current-turn Joinkin skill authority`);
  }
  const mayHaveAction = active.state.status === "ONGOING" && active.state.phase === "PLAYER_ACTION";
  if (!mayHaveAction && active.forgeActionsRemaining !== 0) errors.push(`${location}.forgeActionsRemaining must be zero outside an ongoing player action`);
  let isolatedCursor = 0;
  for (let index = 0; index < active.ephemeralResults.length; index += 1) {
    const result = active.ephemeralResults[index];
    const countForResult = result.provenance?.kind === "JOINKIN_THREE" ? 3 : 2;
    const group = active.isolatedMaterials.slice(isolatedCursor, isolatedCursor + countForResult);
    isolatedCursor += countForResult;
    if (group.length !== countForResult) {
      errors.push(`${location}.ephemeralResults[${index}] requires exactly ${countForResult} chronological isolated materials`);
      continue;
    }
    const left = group[0].instance;
    const right = group[1].instance;
    if (left.cardId === right.cardId) {
      errors.push(`${location}.ephemeralResults[${index}] provenance materials must have distinct card ids`);
      continue;
    }
    const [low, high] = left.cardId < right.cardId ? [left.cardId, right.cardId] : [right.cardId, left.cardId];
    if (result.recipeId !== `${low}|${high}` || result.cardId !== `forge__${low}__${high}`) {
      errors.push(`${location}.ephemeralResults[${index}] does not match its chronological isolated material pair`);
    }
    if (result.provenance?.kind === "PAIR") {
      if (result.provenance.materialInstanceIds[0] !== left.instanceId || result.provenance.materialInstanceIds[1] !== right.instanceId) {
        errors.push(`${location}.ephemeralResults[${index}] pair provenance does not match isolated materials`);
      }
    } else if (result.provenance?.kind === "JOINKIN_THREE") {
      const third = group[2].instance;
      const ids = [left.instanceId, right.instanceId, third.instanceId];
      const cardIds = [left.cardId, right.cardId, third.cardId];
      if (new Set(ids).size !== 3 || new Set(cardIds).size !== 3
        || result.provenance.baseMaterialInstanceIds[0] !== left.instanceId
        || result.provenance.baseMaterialInstanceIds[1] !== right.instanceId
        || result.provenance.thirdMaterialInstanceId !== third.instanceId
        || result.provenance.thirdMaterialId !== third.cardId) {
        errors.push(`${location}.ephemeralResults[${index}] Joinkin provenance does not match isolated materials`);
      }
    }
  }
  if (isolatedCursor !== active.isolatedMaterials.length) errors.push(`${location} isolated material count does not match result provenance`);
  uniqueStrings(active.enrolledPersistentInstanceIds, `${location}.enrolledPersistentInstanceIds`, errors);
  const ownedById = new Map(owned.map((instance) => [instance.instanceId, instance]));
  const ephemeralById = new Map(active.ephemeralResults.map((item) => [item.instanceId, item]));
  for (const id of active.enrolledPersistentInstanceIds) if (!ownedById.has(id)) errors.push(`${location} enrolls an unowned instance: ${id}`);
  const persistentIds: string[] = [];
  for (const instance of active.state.instances) {
    const ephemeral = ephemeralById.get(instance.instanceId);
    if (ephemeral) {
      if (ephemeral.location === "EQUIPMENT" || ephemeral.cardId !== instance.cardId) {
        errors.push(`${location}.state ephemeral instance does not match ledger authority: ${instance.instanceId}`);
      }
      continue;
    }
    persistentIds.push(instance.instanceId);
    const ownedInstance = ownedById.get(instance.instanceId);
    if (!ownedInstance || ownedInstance.cardId !== instance.cardId) errors.push(`${location}.state instance does not match owned authority: ${instance.instanceId}`);
  }
  for (const isolated of active.isolatedMaterials) {
    persistentIds.push(isolated.instance.instanceId);
    const ownedInstance = ownedById.get(isolated.instance.instanceId);
    if (!ownedInstance || ownedInstance.cardId !== isolated.instance.cardId) errors.push(`${location}.isolated material does not match owned authority: ${isolated.instance.instanceId}`);
  }
  uniqueStrings(persistentIds, `${location} projected persistent ids`, errors);
  if (persistentIds.length !== active.enrolledPersistentInstanceIds.length || persistentIds.some((id) => !active.enrolledPersistentInstanceIds.includes(id))) {
    errors.push(`${location} projected persistent ids must exactly equal enrollment`);
  }
  const reserved = new Set([...ownedById.keys(), ...active.enrolledPersistentInstanceIds, ...persistentIds]);
  const ephemeralIds = active.ephemeralResults.map((item) => item.instanceId);
  uniqueStrings(ephemeralIds, `${location}.ephemeralResults instance ids`, errors);
  for (const id of ephemeralIds) if (reserved.has(id)) errors.push(`${location}.ephemeral result id collides: ${id}`);
  const zoneEntries = [
    ["HAND", active.state.zones.hand],
    ["DECK", active.state.zones.deck],
    ["DISCARD", active.state.zones.discard],
    ["EXILE", active.state.zones.exile],
  ] as const;
  for (const ephemeral of active.ephemeralResults) {
    const represented = active.state.instances.filter(({ instanceId }) => instanceId === ephemeral.instanceId);
    const memberships = zoneEntries.flatMap(([zone, ids]) => ids.filter((id) => id === ephemeral.instanceId).map(() => zone));
    if (represented.length === 0) {
      if (memberships.length !== 0) errors.push(`${location}.overlay-only ephemeral result is present in a combat zone: ${ephemeral.instanceId}`);
      continue;
    }
    if (represented.length !== 1 || ephemeral.location === "EQUIPMENT" || memberships.length !== 1 || memberships[0] !== ephemeral.location) {
      errors.push(`${location}.represented ephemeral result must occupy its exact combat zone once: ${ephemeral.instanceId}`);
    }
  }
  return errors.length === 0;
}

function validateStateSnapshot(value: unknown): ForgeRuntimeValidationResult {
  const errors: string[] = [];
  if (!record(value, ["schemaVersion", "engineVersion", "resolverVersion", "sourceHash", "revision", "profile", "run"], "state", errors)) return { valid: false, errors };
  if (value.schemaVersion !== FORGE_RUNTIME_SCHEMA_VERSION) errors.push("state.schemaVersion mismatch");
  if (value.engineVersion !== FORGE_RUNTIME_ENGINE_VERSION) errors.push("state.engineVersion mismatch");
  if (value.resolverVersion !== FORGE_RUNTIME_RESOLVER_VERSION) errors.push("state.resolverVersion mismatch");
  if (value.sourceHash !== FORGE_RUNTIME_SOURCE_HASH) errors.push("state.sourceHash is not bound to the canonical source");
  if (!count(value.revision)) errors.push("state.revision must be a safe unsigned integer");
  if (record(value.profile, ["discoveredRecipeIds"], "state.profile", errors)) {
    if (validateStringList(value.profile.discoveredRecipeIds, "state.profile.discoveredRecipeIds", errors)) {
      uniqueStrings(value.profile.discoveredRecipeIds, "state.profile.discoveredRecipeIds", errors);
      if (!sortedUnique(value.profile.discoveredRecipeIds)) errors.push("state.profile.discoveredRecipeIds must be sorted");
    }
  }
  if (!optionalRecord(value.run, ["fuel", "nextInstanceSequence", "ownedInstances", "deck", "activeCombat"], ["joinkinThirdOverlays"], "state.run", errors)) return { valid: false, errors };
  if (!count(value.run.fuel)) errors.push("state.run.fuel must be a safe unsigned integer");
  if (!count(value.run.nextInstanceSequence)) errors.push("state.run.nextInstanceSequence must be a safe unsigned integer");
  if (array(value.run.ownedInstances, "state.run.ownedInstances", errors)) {
    for (let index = 0; index < value.run.ownedInstances.length; index += 1) validateInstance(value.run.ownedInstances[index], `state.run.ownedInstances[${index}]`, errors);
  }
  validateStringList(value.run.deck, "state.run.deck", errors);
  if ("joinkinThirdOverlays" in value.run) {
    if (array(value.run.joinkinThirdOverlays, "state.run.joinkinThirdOverlays", errors)) {
      for (let index = 0; index < value.run.joinkinThirdOverlays.length; index += 1) {
        const item = value.run.joinkinThirdOverlays[index];
        const itemLocation = `state.run.joinkinThirdOverlays[${index}]`;
        if (record(item, ["instanceId", "thirdMaterialId", "resonanceAttribute"], itemLocation, errors)) {
          if (!nonempty(item.instanceId) || !nonempty(item.thirdMaterialId)
            || !(item.resonanceAttribute === null || oneOf(item.resonanceAttribute, ATTRIBUTES))) errors.push(`${itemLocation} is invalid`);
        }
      }
    }
  }
  if (errors.length === 0) {
    const owned = value.run.ownedInstances as CardInstance[];
    const ids = owned.map((instance) => instance.instanceId);
    uniqueStrings(ids, "state.run.ownedInstances ids", errors);
    uniqueStrings(value.run.deck as string[], "state.run.deck", errors);
    const deck = value.run.deck as string[];
    if (deck.length !== ids.length || deck.some((id) => !ids.includes(id))) errors.push("state.run.deck must contain every owned instance exactly once");
    if (Array.isArray(value.run.joinkinThirdOverlays)) {
      const overlayIds = value.run.joinkinThirdOverlays.map((item) => item.instanceId);
      uniqueStrings(overlayIds, "state.run.joinkinThirdOverlays instance ids", errors);
      for (const id of overlayIds) if (!ids.includes(id)) errors.push(`state.run.joinkinThirdOverlays references an unowned instance: ${id}`);
    }
  }
  if (value.run.activeCombat !== null && Array.isArray(value.run.ownedInstances)) {
    validateActive(value.run.activeCombat, value.run.ownedInstances as CardInstance[], "state.run.activeCombat", errors);
  }
  return { valid: errors.length === 0, errors };
}

function validateAttribute(value: unknown, location: string, errors: string[]): value is ForgeMaterial["attribute"] {
  if (oneOf(value, MATERIAL_ATTRIBUTES)) return true;
  if (array(value, location, errors) && value.length > 0 && value.every((item) => oneOf(item, ATTRIBUTES))) return true;
  errors.push(`${location} is invalid`);
  return false;
}

function validateMaterial(value: unknown, location: string, errors: string[]): value is ForgeMaterial {
  const required = ["id", "attribute", "modifier_form", "noun_form", "representation", "category", "balance_status", "potency", "cost_base"];
  if (!optionalRecord(value, required, ["tool_domain"], location, errors)) return false;
  if (typeof value.id !== "string" || !MATERIAL_ID_PATTERN.test(value.id)) errors.push(`${location}.id is invalid`);
  validateAttribute(value.attribute, `${location}.attribute`, errors);
  if (!nonempty(value.modifier_form) || !nonempty(value.noun_form)) errors.push(`${location} forms must be nonempty`);
  if (!oneOf(value.representation, ["SOLID", "PHENOMENON"] as const)) errors.push(`${location}.representation is invalid`);
  if (!oneOf(value.category, MATERIAL_CATEGORIES)) errors.push(`${location}.category is invalid`);
  if (!oneOf(value.balance_status, ["PENDING_2026_08_21", "APPROVED"] as const)) errors.push(`${location}.balance_status is invalid`);
  if (!nullableNumber(value.potency) || !nullableNumber(value.cost_base) || (value.potency !== null && value.potency < 0) || (value.cost_base !== null && value.cost_base < 0)) errors.push(`${location} numeric fields are invalid`);
  if (value.category === "TOOL") {
    if (!oneOf(value.tool_domain, TOOL_DOMAINS)) errors.push(`${location}.tool_domain is required for tools`);
  } else if ("tool_domain" in value) errors.push(`${location}.tool_domain is only valid for tools`);
  return errors.length === 0;
}

function validateLaw(value: unknown, location: string, errors: string[]): value is ForgeLaw {
  const required = ["pair", "result_class", "actor", "combat_effect", "balance_status", "power_coefficient"];
  if (!optionalRecord(value, required, ["drawback"], location, errors)) return false;
  if (!array(value.pair, `${location}.pair`, errors) || value.pair.length !== 2 || !value.pair.every((item) => oneOf(item, ATTRIBUTES))) errors.push(`${location}.pair is invalid`);
  if (!nonempty(value.result_class) || !nonempty(value.combat_effect)) errors.push(`${location} ids must be nonempty`);
  if (!oneOf(value.actor, ATTRIBUTES)) errors.push(`${location}.actor is invalid`);
  if (!oneOf(value.balance_status, ["PENDING_2026_08_21", "APPROVED"] as const)) errors.push(`${location}.balance_status is invalid`);
  if (!nullableNumber(value.power_coefficient) || (value.power_coefficient !== null && value.power_coefficient < 0)) errors.push(`${location}.power_coefficient is invalid`);
  if ("drawback" in value && !nonempty(value.drawback)) errors.push(`${location}.drawback is invalid`);
  return errors.length === 0;
}

function validateInteraction(value: unknown, location: string, errors: string[]): value is EquipmentInteraction {
  if (!record(value, ["domains", "passive_effect_id", "passive_effect_ko"], location, errors)) return false;
  if (!array(value.domains, `${location}.domains`, errors) || value.domains.length !== 2 || !value.domains.every((item) => oneOf(item, TOOL_DOMAINS))) errors.push(`${location}.domains is invalid`);
  if (!nonempty(value.passive_effect_id) || !nonempty(value.passive_effect_ko)) errors.push(`${location} effects must be nonempty`);
  return errors.length === 0;
}

function validateResultClass(value: unknown, location: string, errors: string[]): value is ForgeResultClass {
  const required = ["id", "family", "density", "density_status", "combat_effect"];
  if (!optionalRecord(value, required, ["equipment_interactions"], location, errors)) return false;
  if (!nonempty(value.id)) errors.push(`${location}.id must be nonempty`);
  if (!oneOf(value.family, RESULT_FAMILIES)) errors.push(`${location}.family is invalid`);
  if (value.density !== null && !oneOf(value.density, DENSITIES)) errors.push(`${location}.density is invalid`);
  if (!oneOf(value.density_status, ["APPROVED", "DERIVED_FROM_MATERIAL"] as const)) errors.push(`${location}.density_status is invalid`);
  if (value.combat_effect !== null && !nonempty(value.combat_effect)) errors.push(`${location}.combat_effect is invalid`);
  if ("equipment_interactions" in value) {
    if (array(value.equipment_interactions, `${location}.equipment_interactions`, errors)) {
      for (let index = 0; index < value.equipment_interactions.length; index += 1) validateInteraction(value.equipment_interactions[index], `${location}.equipment_interactions[${index}]`, errors);
    }
  }
  return errors.length === 0;
}

function validateTuning(value: unknown, location: string, errors: string[]): value is ForgeTuning {
  if (!record(value, ["SAME_BONUS", "COST_DIVISOR"], location, errors)) return false;
  if (typeof value.SAME_BONUS !== "number" || !Number.isFinite(value.SAME_BONUS) || value.SAME_BONUS < 0 || value.SAME_BONUS > Number.MAX_SAFE_INTEGER) errors.push(`${location}.SAME_BONUS is invalid`);
  if (typeof value.COST_DIVISOR !== "number" || !Number.isFinite(value.COST_DIVISOR) || value.COST_DIVISOR <= 0 || value.COST_DIVISOR > Number.MAX_SAFE_INTEGER) errors.push(`${location}.COST_DIVISOR is invalid`);
  return errors.length === 0;
}

function validateInputs(value: unknown, location: string, errors: string[]): value is ForgeInputs {
  if (!optionalRecord(value, ["laws", "resultClasses"], ["tuning"], location, errors)) return false;
  if (array(value.laws, `${location}.laws`, errors)) for (let index = 0; index < value.laws.length; index += 1) validateLaw(value.laws[index], `${location}.laws[${index}]`, errors);
  if (array(value.resultClasses, `${location}.resultClasses`, errors)) for (let index = 0; index < value.resultClasses.length; index += 1) validateResultClass(value.resultClasses[index], `${location}.resultClasses[${index}]`, errors);
  if ("tuning" in value) validateTuning(value.tuning, `${location}.tuning`, errors);
  return errors.length === 0;
}

function validateContextSnapshot(value: unknown): ForgeRuntimeValidationResult {
  const errors: string[] = [];
  if (!record(value, ["resolverVersion", "sourceHash", "materials", "inputs"], "context", errors)) return { valid: false, errors };
  if (value.resolverVersion !== FORGE_RUNTIME_RESOLVER_VERSION) errors.push("context.resolverVersion mismatch");
  if (value.sourceHash !== FORGE_RUNTIME_SOURCE_HASH) errors.push("context.sourceHash is not bound to the canonical source");
  if (array(value.materials, "context.materials", errors)) for (let index = 0; index < value.materials.length; index += 1) validateMaterial(value.materials[index], `context.materials[${index}]`, errors);
  validateInputs(value.inputs, "context.inputs", errors);
  if (errors.length === 0) {
    const context = value as unknown as ForgeResolverContextV1;
    if (context.materials.length !== 52) errors.push("context must contain exactly 52 materials");
    if (context.inputs.laws.length !== 21) errors.push("context must contain exactly 21 laws");
    if (context.inputs.resultClasses.length !== 34) errors.push("context must contain exactly 34 result classes");
    uniqueStrings(context.materials.map((item) => item.id), "context material ids", errors);
    uniqueStrings(context.inputs.resultClasses.map((item) => item.id), "context result class ids", errors);
    const lawKeys = context.inputs.laws.map((law) => [...law.pair].sort().join("|"));
    uniqueStrings(lawKeys, "context law pairs", errors);
    if (projectionHash(context) !== FORGE_RUNTIME_PROJECTION_HASH) errors.push("context canonical projection mismatch");
  }
  return { valid: errors.length === 0, errors };
}

function validateCommandSnapshot(value: unknown): ForgeRuntimeValidationResult {
  const errors: string[] = [];
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { valid: false, errors: ["command must be an object"] };
  const command = value as UnknownRecord;
  if (command.type === "APPLY_COMBAT") {
    if (!record(command, ["type", "command"], "command", errors)) return { valid: false, errors };
    const decoded = decodeCombatCommand(command.command);
    if (!decoded.valid) errors.push(...decoded.errors.map((error) => `command.command: ${error}`));
    else command.command = decoded.value;
  } else if (command.type === "FORGE_INSTANT" || command.type === "FORGE_WORKSHOP" || command.type === "FORGE_INSTANT_THREE" || command.type === "FORGE_WORKSHOP_THREE") {
    if (!record(command, ["type", "materialInstanceIds"], "command", errors)) return { valid: false, errors };
    const expectedLength = command.type.endsWith("_THREE") ? 3 : 2;
    if (!array(command.materialInstanceIds, "command.materialInstanceIds", errors) || command.materialInstanceIds.length !== expectedLength || !command.materialInstanceIds.every(nonempty)) errors.push(`command.materialInstanceIds must contain exactly ${expectedLength} nonempty ids`);
  } else if (command.type === "CLEANUP_COMBAT") {
    record(command, ["type"], "command", errors);
  } else {
    errors.push("command.type is invalid");
  }
  return { valid: errors.length === 0, errors };
}

export function decodeForgeRuntimeState(candidate: unknown): ForgeRuntimeDecodeResult<ForgeRuntimeStateV1> {
  const captured = snapshot(candidate, "forge runtime state");
  if (!captured.valid) return captured;
  const validation = validateStateSnapshot(captured.value);
  return validation.valid ? { valid: true, value: captured.value as ForgeRuntimeStateV1, errors: [] } : { valid: false, errors: validation.errors };
}

export function validateForgeRuntimeState(candidate: unknown): ForgeRuntimeValidationResult {
  const decoded = decodeForgeRuntimeState(candidate);
  return { valid: decoded.valid, errors: [...decoded.errors] };
}

export function decodeForgeResolverContext(candidate: unknown): ForgeRuntimeDecodeResult<ForgeResolverContextV1> {
  const captured = snapshot(candidate, "forge resolver context");
  if (!captured.valid) return captured;
  const validation = validateContextSnapshot(captured.value);
  return validation.valid ? { valid: true, value: captured.value as ForgeResolverContextV1, errors: [] } : { valid: false, errors: validation.errors };
}

export function validateForgeResolverContext(candidate: unknown): ForgeRuntimeValidationResult {
  const decoded = decodeForgeResolverContext(candidate);
  return { valid: decoded.valid, errors: [...decoded.errors] };
}

export function decodeForgeRuntimeCommand(candidate: unknown): ForgeRuntimeDecodeResult<ForgeRuntimeCommand> {
  const captured = snapshot(candidate, "forge runtime command");
  if (!captured.valid) return captured;
  const validation = validateCommandSnapshot(captured.value);
  return validation.valid ? { valid: true, value: captured.value as ForgeRuntimeCommand, errors: [] } : { valid: false, errors: validation.errors };
}

export function validateForgeRuntimeCommand(candidate: unknown): ForgeRuntimeValidationResult {
  const decoded = decodeForgeRuntimeCommand(candidate);
  return { valid: decoded.valid, errors: [...decoded.errors] };
}

export function decodePostcondition(candidate: unknown): ForgeRuntimeDecodeResult<ForgeRuntimeStateV1> {
  return decodeForgeRuntimeState(candidate);
}
