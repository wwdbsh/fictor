import { isResonanceAttribute, RESONANCE_ATTRIBUTES } from "../resonance";
import {
  COMBAT_EFFECT_IDS,
  COMBAT_ENGINE_VERSION,
  COMBAT_PRNG_VERSION,
  COMBAT_SCHEMA_VERSION,
  type CombatEffectId,
} from "./constants";
import type {
  AtomicOperation,
  CombatCommand,
  CombatRules,
  CombatSetup,
  CombatState,
  DecodeResult,
  EffectProgram,
  EnemyIntent,
  OperationTarget,
  ValidationResult,
} from "./types";

const UINT32_MAX = 0xffff_ffff;
const SAFE_MAGNITUDE = Number.MAX_SAFE_INTEGER;

type UnknownRecord = Record<string, unknown>;

class SnapshotError extends Error {}

function snapshotValue(
  value: unknown,
  location: string,
  seen: WeakMap<object, unknown>,
): unknown {
  if (value === null || typeof value !== "object") return value;

  const source = value as object;
  const existing = seen.get(source);
  if (existing !== undefined) return existing;

  let isArray: boolean;
  let prototype: object | null;
  let ownKeys: (string | symbol)[];
  try {
    isArray = Array.isArray(source);
    prototype = Object.getPrototypeOf(source) as object | null;
    ownKeys = Reflect.ownKeys(source);
  } catch {
    throw new SnapshotError(`${location} cannot be inspected safely`);
  }

  if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    throw new SnapshotError(
      isArray
        ? `${location} must use Array.prototype`
        : `${location} must use Object.prototype or null`,
    );
  }
  if (ownKeys.some((key) => typeof key === "symbol")) {
    throw new SnapshotError(`${location} must not contain symbol keys`);
  }

  const descriptors = new Map<string, PropertyDescriptor>();
  for (const key of ownKeys as string[]) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(source, key);
    } catch {
      throw new SnapshotError(`${location}.${key} cannot be inspected safely`);
    }
    if (!descriptor || !("value" in descriptor)) {
      throw new SnapshotError(`${location}.${key} must be an own data property`);
    }
    descriptors.set(key, descriptor);
  }

  if (isArray) {
    const length = descriptors.get("length")?.value;
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new SnapshotError(`${location}.length must be a safe nonnegative integer`);
    }
    for (const key of descriptors.keys()) {
      if (key === "length") continue;
      const index = Number(key);
      if (!Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key) {
        throw new SnapshotError(`${location} has unexpected array key: ${key}`);
      }
    }
    if (descriptors.size !== length + 1) {
      throw new SnapshotError(`${location} must not be sparse or have extra properties`);
    }

    const snapshot: unknown[] = [];
    seen.set(source, snapshot);
    for (let index = 0; index < length; index += 1) {
      snapshot.push(
        snapshotValue(descriptors.get(String(index))!.value, `${location}[${index}]`, seen),
      );
    }
    return snapshot;
  }

  const snapshot: UnknownRecord = {};
  seen.set(source, snapshot);
  for (const [key, descriptor] of descriptors) {
    Object.defineProperty(snapshot, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: snapshotValue(descriptor.value, `${location}.${key}`, seen),
    });
  }
  return snapshot;
}

function snapshotBoundary(
  candidate: unknown,
  location: string,
): { ok: true; value: unknown } | { ok: false; errors: string[] } {
  try {
    return { ok: true, value: snapshotValue(candidate, location, new WeakMap()) };
  } catch (error) {
    return {
      ok: false,
      errors: [
        error instanceof SnapshotError
          ? error.message
          : `${location} cannot be inspected safely`,
      ],
    };
  }
}

function asValidationResult<T>(result: DecodeResult<T>): ValidationResult {
  return { valid: result.valid, errors: [...result.errors] };
}

export function isCombatEffectId(value: unknown): value is CombatEffectId {
  return typeof value === "string" && COMBAT_EFFECT_IDS.some((effectId) => effectId === value);
}

function isSafeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isFiniteNonnegative(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= SAFE_MAGNITUDE
  );
}

function isNonemptyId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function strictRecord(
  value: unknown,
  expectedKeys: readonly string[],
  location: string,
  errors: string[],
): value is UnknownRecord {
  const errorCount = errors.length;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${location} must be a plain object`);
    return false;
  }
  let prototype: object | null;
  let ownKeys: (string | symbol)[];
  try {
    prototype = Object.getPrototypeOf(value) as object | null;
    ownKeys = Reflect.ownKeys(value);
  } catch {
    errors.push(`${location} cannot be inspected safely`);
    return false;
  }
  if (prototype !== Object.prototype && prototype !== null) {
    errors.push(`${location} must use Object.prototype or null`);
    return false;
  }
  if (ownKeys.some((key) => typeof key === "symbol")) {
    errors.push(`${location} must not contain symbol keys`);
    return false;
  }
  const stringKeys = ownKeys as string[];
  const expected = new Set(expectedKeys);
  for (const key of stringKeys) {
    if (!expected.has(key)) errors.push(`${location} has unexpected key: ${key}`);
  }
  for (const key of expectedKeys) {
    if (!stringKeys.includes(key)) errors.push(`${location} is missing key: ${key}`);
  }
  for (const key of stringKeys) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      errors.push(`${location}.${key} cannot be inspected safely`);
      return false;
    }
    if (!descriptor || !("value" in descriptor)) {
      errors.push(`${location}.${key} must be an own data property`);
    }
  }
  return errors.length === errorCount;
}

function strictArray(value: unknown, location: string, errors: string[]): value is unknown[] {
  const errorCount = errors.length;
  if (!Array.isArray(value)) {
    errors.push(`${location} must be an array`);
    return false;
  }
  let prototype: object | null;
  let keys: (string | symbol)[];
  try {
    prototype = Object.getPrototypeOf(value) as object | null;
    keys = Reflect.ownKeys(value);
  } catch {
    errors.push(`${location} cannot be inspected safely`);
    return false;
  }
  if (prototype !== Array.prototype) {
    errors.push(`${location} must use Array.prototype`);
    return false;
  }
  if (keys.some((key) => typeof key === "symbol")) {
    errors.push(`${location} must not contain symbol keys`);
    return false;
  }
  const descriptors = new Map<string, PropertyDescriptor>();
  for (const key of keys as string[]) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      errors.push(`${location}.${key} cannot be inspected safely`);
      return false;
    }
    if (!descriptor || !("value" in descriptor)) {
      errors.push(`${location}.${key} must be an own data property`);
      return false;
    }
    descriptors.set(key, descriptor);
  }
  const length = descriptors.get("length")?.value;
  if (!Number.isSafeInteger(length) || length < 0) {
    errors.push(`${location}.length must be a safe nonnegative integer`);
    return false;
  }
  for (const key of descriptors.keys()) {
    if (key === "length") continue;
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key) {
      errors.push(`${location} has unexpected array key: ${key}`);
    }
  }
  if (descriptors.size !== length + 1) errors.push(`${location} must not be sparse or have extra properties`);
  return errors.length === errorCount;
}

function property(record: UnknownRecord, key: string): unknown {
  return Object.getOwnPropertyDescriptor(record, key)!.value;
}

function arrayValue(array: unknown[], index: number): unknown {
  return Object.getOwnPropertyDescriptor(array, String(index))!.value;
}

function arrayLength(array: unknown[]): number {
  return Object.getOwnPropertyDescriptor(array, "length")!.value as number;
}

function validateStringArray(value: unknown, location: string, errors: string[]): value is string[] {
  if (!strictArray(value, location, errors)) return false;
  for (let index = 0; index < arrayLength(value); index += 1) {
    if (typeof arrayValue(value, index) !== "string") errors.push(`${location}[${index}] must be a string`);
  }
  return errors.length === 0;
}

function validateTargetShape(value: unknown, location: string, allowSelected: boolean, errors: string[]): boolean {
  let kind: unknown;
  try {
    const descriptor = value !== null && typeof value === "object" ? Object.getOwnPropertyDescriptor(value, "kind") : undefined;
    kind = descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    errors.push(`${location} cannot be inspected safely`);
    return false;
  }
  const expectedKeys = kind === "ENEMY" ? ["kind", "enemyId"] : ["kind"];
  if (!strictRecord(value, expectedKeys, location, errors)) return false;
  const target = value as UnknownRecord;
  if (kind === "PLAYER") return true;
  if (kind === "SELECTED" && allowSelected) return true;
  if (kind === "ENEMY" && isNonemptyId(property(target, "enemyId"))) return true;
  errors.push(`${location} has invalid target kind or enemyId`);
  return false;
}

function validateAmountShape(value: unknown, location: string, errors: string[]): boolean {
  let kind: unknown;
  try {
    const descriptor = value !== null && typeof value === "object" ? Object.getOwnPropertyDescriptor(value, "kind") : undefined;
    kind = descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    errors.push(`${location} cannot be inspected safely`);
    return false;
  }
  const expected = kind === "FIXED" ? ["kind", "amount"] : kind === "EFFECT_POWER" ? ["kind", "multiplier"] : ["kind"];
  if (!strictRecord(value, expected, location, errors)) return false;
  const record = value as UnknownRecord;
  if (kind === "FIXED") return isFiniteNonnegative(property(record, "amount")) || (errors.push(`${location}.amount must be finite and nonnegative`), false);
  if (kind === "EFFECT_POWER") return isFiniteNonnegative(property(record, "multiplier")) || (errors.push(`${location}.multiplier must be finite and nonnegative`), false);
  errors.push(`${location}.kind is invalid`);
  return false;
}

function validateOperationShape(value: unknown, location: string, errors: string[]): value is AtomicOperation {
  if (!strictRecord(value, ["kind", "target", "amount"], location, errors)) return false;
  const record = value as UnknownRecord;
  if (!["DAMAGE", "GAIN_BLOCK", "HEAL"].includes(property(record, "kind") as string)) {
    errors.push(`${location}.kind is invalid`);
  }
  validateTargetShape(property(record, "target"), `${location}.target`, true, errors);
  validateAmountShape(property(record, "amount"), `${location}.amount`, errors);
  return errors.length === 0;
}

function validateOperationsShape(value: unknown, location: string, errors: string[]): value is AtomicOperation[] {
  if (!strictArray(value, location, errors)) return false;
  for (let index = 0; index < arrayLength(value); index += 1) {
    validateOperationShape(arrayValue(value, index), `${location}[${index}]`, errors);
  }
  return errors.length === 0;
}

function validateTargetRuleShape(value: unknown, location: string, errors: string[]): boolean {
  const kindDescriptor =
    value !== null && typeof value === "object" ? Object.getOwnPropertyDescriptor(value, "kind") : undefined;
  const kind = kindDescriptor && "value" in kindDescriptor ? kindDescriptor.value : undefined;
  const expected = kind === "REQUIRED" ? ["kind", "allowed"] : ["kind"];
  if (!strictRecord(value, expected, location, errors)) return false;
  const record = value as UnknownRecord;
  if (kind === "NONE") return true;
  if (kind === "REQUIRED" && ["PLAYER", "ENEMY", "EITHER"].includes(property(record, "allowed") as string)) return true;
  errors.push(`${location} is invalid`);
  return false;
}

function validateProgramShape(value: unknown, location: string, errors: string[]): value is EffectProgram {
  if (!strictRecord(value, ["effectId", "targetRule", "playedCardDestination", "operations"], location, errors)) return false;
  const record = value as UnknownRecord;
  if (!isCombatEffectId(property(record, "effectId"))) errors.push(`${location}.effectId is invalid`);
  validateTargetRuleShape(property(record, "targetRule"), `${location}.targetRule`, errors);
  if (!["DISCARD", "EXILE"].includes(property(record, "playedCardDestination") as string)) {
    errors.push(`${location}.playedCardDestination is invalid`);
  }
  validateOperationsShape(property(record, "operations"), `${location}.operations`, errors);
  return errors.length === 0;
}

function validateIntentShape(value: unknown, location: string, errors: string[]): value is EnemyIntent {
  if (!strictRecord(value, ["intentId", "labelKo", "telegraph", "displayAmount", "program"], location, errors)) return false;
  const record = value as UnknownRecord;
  if (!isNonemptyId(property(record, "intentId"))) errors.push(`${location}.intentId must be nonempty`);
  const label = property(record, "labelKo");
  if (typeof label !== "string" || !/[\uac00-\ud7a3]/.test(label.trim())) errors.push(`${location}.labelKo must be Korean text`);
  if (!["ATTACK", "DEFEND", "SPECIAL"].includes(property(record, "telegraph") as string)) errors.push(`${location}.telegraph is invalid`);
  const displayAmount = property(record, "displayAmount");
  if (displayAmount !== null && !isFiniteNonnegative(displayAmount)) errors.push(`${location}.displayAmount is invalid`);
  const intentProgram = property(record, "program");
  if (strictRecord(intentProgram, ["operations"], `${location}.program`, errors)) {
    validateOperationsShape(property(intentProgram, "operations"), `${location}.program.operations`, errors);
  }
  return errors.length === 0;
}

function validateCardShape(value: unknown, location: string, errors: string[]): boolean {
  if (!strictRecord(value, ["cardId", "effectId", "cost", "power", "resonanceAttribute"], location, errors)) return false;
  const card = value as UnknownRecord;
  if (!isNonemptyId(property(card, "cardId"))) errors.push(`${location}.cardId must be nonempty`);
  if (!isCombatEffectId(property(card, "effectId"))) errors.push(`${location}.effectId is invalid`);
  const cost = property(card, "cost");
  if (cost !== null && !isSafeCount(cost)) errors.push(`${location}.cost must be null or a nonnegative safe integer`);
  const power = property(card, "power");
  if (power !== null && !isFiniteNonnegative(power)) errors.push(`${location}.power must be null or finite and nonnegative`);
  const attribute = property(card, "resonanceAttribute");
  if (attribute !== null && !isResonanceAttribute(attribute)) errors.push(`${location}.resonanceAttribute is invalid`);
  return errors.length === 0;
}

function validateInstanceShape(value: unknown, location: string, errors: string[]): boolean {
  if (!strictRecord(value, ["instanceId", "cardId"], location, errors)) return false;
  const instance = value as UnknownRecord;
  if (!isNonemptyId(property(instance, "instanceId"))) errors.push(`${location}.instanceId must be nonempty`);
  if (!isNonemptyId(property(instance, "cardId"))) errors.push(`${location}.cardId must be nonempty`);
  return errors.length === 0;
}

function validateRulesShape(value: unknown, location: string, errors: string[]): value is CombatRules {
  if (!strictRecord(value, ["maxEnergy", "drawCount", "resonanceRate", "blockRetention", "terminalPolicy"], location, errors)) return false;
  const rules = value as UnknownRecord;
  if (!isSafeCount(property(rules, "maxEnergy"))) errors.push(`${location}.maxEnergy must be a nonnegative safe integer`);
  if (!isSafeCount(property(rules, "drawCount"))) errors.push(`${location}.drawCount must be a nonnegative safe integer`);
  const rate = property(rules, "resonanceRate");
  if (rate !== null && !isFiniteNonnegative(rate)) errors.push(`${location}.resonanceRate must be null or finite and nonnegative`);
  const retention = property(rules, "blockRetention");
  if (strictRecord(retention, ["numerator", "denominator", "rounding"], `${location}.blockRetention`, errors)) {
    const policy = retention as UnknownRecord;
    const numerator = property(policy, "numerator");
    const denominator = property(policy, "denominator");
    if (!isSafeCount(numerator)) errors.push(`${location}.blockRetention.numerator is invalid`);
    if (!Number.isSafeInteger(denominator) || (denominator as number) <= 0) errors.push(`${location}.blockRetention.denominator is invalid`);
    if (isSafeCount(numerator) && Number.isSafeInteger(denominator) && numerator > (denominator as number)) errors.push(`${location}.blockRetention factor must be between zero and one`);
    if (property(policy, "rounding") !== "FLOOR") errors.push(`${location}.blockRetention.rounding must be FLOOR`);
  }
  if (!["DEFEAT_FIRST", "VICTORY_FIRST"].includes(property(rules, "terminalPolicy") as string)) errors.push(`${location}.terminalPolicy is invalid`);
  return errors.length === 0;
}

function validateCombatantShape(value: unknown, keys: readonly string[], location: string, errors: string[]): boolean {
  if (!strictRecord(value, keys, location, errors)) return false;
  const combatant = value as UnknownRecord;
  const maxHp = property(combatant, "maxHp");
  const hp = property(combatant, "hp");
  if (!isFiniteNonnegative(maxHp) || maxHp <= 0) errors.push(`${location}.maxHp must be finite and positive`);
  if (!isFiniteNonnegative(hp) || (typeof maxHp === "number" && hp > maxHp)) errors.push(`${location}.hp must be between zero and maxHp`);
  if (!isFiniteNonnegative(property(combatant, "block"))) errors.push(`${location}.block must be finite and nonnegative`);
  return errors.length === 0;
}

function validateCollectionShapes(
  cardsValue: unknown,
  instancesValue: unknown,
  programsValue: unknown,
  enemyId: string,
  errors: string[],
): boolean {
  if (!strictArray(cardsValue, "cards", errors) || !strictArray(instancesValue, "instances", errors) || !strictArray(programsValue, "programs", errors)) return false;
  const cards = cardsValue as unknown[];
  const instances = instancesValue as unknown[];
  const programs = programsValue as unknown[];
  for (let index = 0; index < arrayLength(cards); index += 1) validateCardShape(arrayValue(cards, index), `cards[${index}]`, errors);
  for (let index = 0; index < arrayLength(instances); index += 1) validateInstanceShape(arrayValue(instances, index), `instances[${index}]`, errors);
  for (let index = 0; index < arrayLength(programs); index += 1) validateProgramShape(arrayValue(programs, index), `programs[${index}]`, errors);
  const cardIdsList = Array.from({ length: arrayLength(cards) }, (_, index) => property(arrayValue(cards, index) as UnknownRecord, "cardId") as string);
  const instanceIdsList = Array.from({ length: arrayLength(instances) }, (_, index) => property(arrayValue(instances, index) as UnknownRecord, "instanceId") as string);
  const effectIds = Array.from({ length: arrayLength(programs) }, (_, index) => property(arrayValue(programs, index) as UnknownRecord, "effectId") as string);
  addUniqueErrors(cardIdsList, "card ids", errors);
  addUniqueErrors(instanceIdsList, "instance ids", errors);
  addUniqueErrors(effectIds, "program effect ids", errors);
  const cardIds = new Set(cardIdsList);
  for (let index = 0; index < arrayLength(instances); index += 1) {
    const instance = arrayValue(instances, index) as UnknownRecord;
    const cardId = property(instance, "cardId") as string;
    const instanceId = property(instance, "instanceId") as string;
    if (!cardIds.has(cardId)) errors.push(`instance references unknown card: ${instanceId}`);
  }
  for (let index = 0; index < arrayLength(programs); index += 1) validateProgramSemantics(arrayValue(programs, index) as EffectProgram, enemyId, errors);
  return errors.length === 0;
}

function addUniqueErrors(values: readonly string[], label: string, errors: string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (!isNonemptyId(value)) errors.push(`${label} must contain nonempty ids`);
    if (seen.has(value)) errors.push(`${label} must contain unique ids: ${value}`);
    seen.add(value);
  }
}

function validateOperationSemantics(operation: AtomicOperation, enemyId: string, allowSelected: boolean, allowEffectPower: boolean, errors: string[]): void {
  const operationRecord = operation as unknown as UnknownRecord;
  const target = property(operationRecord, "target") as UnknownRecord;
  const targetKind = property(target, "kind");
  if (targetKind === "SELECTED" && !allowSelected) errors.push("operation target is invalid in this program");
  if (targetKind === "ENEMY" && property(target, "enemyId") !== enemyId) errors.push(`operation enemy target does not match ${enemyId}`);
  const amount = property(operationRecord, "amount") as UnknownRecord;
  if (property(amount, "kind") === "EFFECT_POWER" && !allowEffectPower) errors.push("intent operations cannot reference effect power");
}

function validateProgramSemantics(program: EffectProgram, enemyId: string, errors: string[]): void {
  const record = program as unknown as UnknownRecord;
  const operations = property(record, "operations") as unknown[];
  const targetRule = property(record, "targetRule") as UnknownRecord;
  const allowSelected = property(targetRule, "kind") === "REQUIRED";
  for (let index = 0; index < arrayLength(operations); index += 1) validateOperationSemantics(arrayValue(operations, index) as AtomicOperation, enemyId, allowSelected, true, errors);
}

function validateIntentsShape(value: unknown, enemyId: string, location: string, errors: string[]): value is EnemyIntent[] {
  if (!strictArray(value, location, errors)) return false;
  const length = arrayLength(value);
  for (let index = 0; index < length; index += 1) validateIntentShape(arrayValue(value, index), `${location}[${index}]`, errors);
  if (length === 0) errors.push("enemy must have at least one intent");
  const intentIds = Array.from({ length }, (_, index) => property(arrayValue(value, index) as UnknownRecord, "intentId") as string);
  addUniqueErrors(intentIds, "enemy intent ids", errors);
  for (let intentIndex = 0; intentIndex < length; intentIndex += 1) {
    const intent = arrayValue(value, intentIndex) as UnknownRecord;
    const program = property(intent, "program") as UnknownRecord;
    const operations = property(program, "operations") as unknown[];
    for (let operationIndex = 0; operationIndex < arrayLength(operations); operationIndex += 1) {
      validateOperationSemantics(arrayValue(operations, operationIndex) as AtomicOperation, enemyId, false, false, errors);
    }
  }
  return errors.length === 0;
}

function validateCombatSetupSnapshot(candidate: unknown): ValidationResult {
  const errors: string[] = [];
  try {
    if (!strictRecord(candidate, ["seed", "rules", "player", "enemy", "cards", "instances", "deck", "programs"], "setup", errors)) return { valid: false, errors };
    const setup = candidate as UnknownRecord;
    const seed = property(setup, "seed");
    if (!Number.isSafeInteger(seed) || (seed as number) < 0 || (seed as number) > UINT32_MAX) errors.push("seed must be a uint32");
    validateRulesShape(property(setup, "rules"), "rules", errors);
    const player = property(setup, "player");
    validateCombatantShape(player, ["hp", "maxHp", "block"], "player", errors);
    const enemyValue = property(setup, "enemy");
    if (!strictRecord(enemyValue, ["hp", "maxHp", "block", "enemyId", "intents", "initialIntentIndex"], "enemy", errors)) return { valid: false, errors };
    validateCombatantShape(enemyValue, ["hp", "maxHp", "block", "enemyId", "intents", "initialIntentIndex"], "enemy", errors);
    const enemy = enemyValue as UnknownRecord;
    const enemyId = property(enemy, "enemyId");
    if (!isNonemptyId(enemyId)) errors.push("enemy.enemyId must be nonempty");
    const intentsValue = property(enemy, "intents");
    validateIntentsShape(intentsValue, typeof enemyId === "string" ? enemyId : "", "enemy.intents", errors);
    const intents = Array.isArray(intentsValue) ? intentsValue : [];
    const initialIntentIndex = property(enemy, "initialIntentIndex");
    if (!Number.isSafeInteger(initialIntentIndex) || (initialIntentIndex as number) < 0 || (initialIntentIndex as number) >= arrayLength(intents)) errors.push("enemy.initialIntentIndex is out of range");
    if ((property(player as UnknownRecord, "hp") as number) <= 0) errors.push("player.hp must be positive at combat setup");
    if ((property(enemy, "hp") as number) <= 0) errors.push("enemy.hp must be positive at combat setup");
    validateCollectionShapes(property(setup, "cards"), property(setup, "instances"), property(setup, "programs"), typeof enemyId === "string" ? enemyId : "", errors);
    const deckValue = property(setup, "deck");
    validateStringArray(deckValue, "initial deck", errors);
    if (errors.length === 0) {
      const typed = candidate as unknown as CombatSetup;
      addUniqueErrors(typed.deck, "initial deck", errors);
      const instanceIds = new Set(typed.instances.map((instance) => instance.instanceId));
      for (const instanceId of typed.deck) if (!instanceIds.has(instanceId)) errors.push(`initial deck references unknown instance: ${instanceId}`);
      for (const instanceId of instanceIds) if (!typed.deck.includes(instanceId)) errors.push(`instance is absent from initial deck: ${instanceId}`);
    }
  } catch {
    return { valid: false, errors: ["combat setup cannot be inspected safely"] };
  }
  return { valid: errors.length === 0, errors };
}

function validateCombatCommandSnapshot(candidate: unknown): ValidationResult {
  const errors: string[] = [];
  try {
    const typeDescriptor = candidate !== null && typeof candidate === "object" ? Object.getOwnPropertyDescriptor(candidate, "type") : undefined;
    const type = typeDescriptor && "value" in typeDescriptor ? typeDescriptor.value : undefined;
    const expected = type === "PLAY_CARD" ? ["type", "instanceId", "target"] : ["type"];
    if (!strictRecord(candidate, expected, "command", errors)) return { valid: false, errors };
    const command = candidate as UnknownRecord;
    if (type === "START_TURN" || type === "END_TURN") return { valid: true, errors: [] };
    if (type !== "PLAY_CARD") return { valid: false, errors: ["command.type is invalid"] };
    if (!isNonemptyId(property(command, "instanceId"))) errors.push("command.instanceId must be nonempty");
    const target = property(command, "target");
    if (target !== null) validateTargetShape(target, "command.target", false, errors);
  } catch {
    return { valid: false, errors: ["combat command cannot be inspected safely"] };
  }
  return { valid: errors.length === 0, errors };
}

function validateCombatStateSnapshot(candidate: unknown): ValidationResult {
  const errors: string[] = [];
  try {
    const stateKeys = ["schemaVersion", "engineVersion", "prngVersion", "phase", "status", "turn", "randomState", "rules", "player", "enemy", "cards", "instances", "programs", "zones", "resonance"];
    if (!strictRecord(candidate, stateKeys, "state", errors)) return { valid: false, errors };
    const stateRecord = candidate as UnknownRecord;
    if (property(stateRecord, "schemaVersion") !== COMBAT_SCHEMA_VERSION) errors.push("combat schema version mismatch");
    if (property(stateRecord, "engineVersion") !== COMBAT_ENGINE_VERSION) errors.push("combat engine version mismatch");
    if (property(stateRecord, "prngVersion") !== COMBAT_PRNG_VERSION) errors.push("combat prng version mismatch");
    const phase = property(stateRecord, "phase");
    if (!["TURN_READY", "START_TURN", "PLAYER_ACTION", "END_TURN", "TERMINAL"].includes(phase as string)) errors.push("combat phase is invalid");
    const status = property(stateRecord, "status");
    if (!["ONGOING", "VICTORY", "DEFEAT"].includes(status as string)) errors.push("combat status is invalid");
    if (!isSafeCount(property(stateRecord, "turn"))) errors.push("turn must be a nonnegative safe integer");
    const randomState = property(stateRecord, "randomState");
    if (!Number.isSafeInteger(randomState) || (randomState as number) < 0 || (randomState as number) > UINT32_MAX) errors.push("randomState must be a uint32");
    validateRulesShape(property(stateRecord, "rules"), "rules", errors);
    const playerValue = property(stateRecord, "player");
    validateCombatantShape(playerValue, ["hp", "maxHp", "block", "energy"], "player", errors);
    const player = playerValue as UnknownRecord;
    const rules = property(stateRecord, "rules") as UnknownRecord;
    const energy = player && typeof player === "object" ? property(player, "energy") : undefined;
    const maxEnergy = rules && typeof rules === "object" ? property(rules, "maxEnergy") : undefined;
    if (!isSafeCount(energy) || (typeof maxEnergy === "number" && energy > maxEnergy)) errors.push("player.energy must be within maxEnergy");
    const enemyValue = property(stateRecord, "enemy");
    if (!strictRecord(enemyValue, ["hp", "maxHp", "block", "enemyId", "intents", "currentIntentIndex"], "enemy", errors)) return { valid: false, errors };
    validateCombatantShape(enemyValue, ["hp", "maxHp", "block", "enemyId", "intents", "currentIntentIndex"], "enemy", errors);
    const enemy = enemyValue as UnknownRecord;
    const enemyId = property(enemy, "enemyId");
    if (!isNonemptyId(enemyId)) errors.push("enemy.enemyId must be nonempty");
    const intentsValue = property(enemy, "intents");
    validateIntentsShape(intentsValue, typeof enemyId === "string" ? enemyId : "", "enemy.intents", errors);
    const intents = Array.isArray(intentsValue) ? intentsValue : [];
    const intentIndex = property(enemy, "currentIntentIndex");
    if (!Number.isSafeInteger(intentIndex) || (intentIndex as number) < 0 || (intentIndex as number) >= arrayLength(intents)) errors.push("enemy.currentIntentIndex is out of range");
    validateCollectionShapes(property(stateRecord, "cards"), property(stateRecord, "instances"), property(stateRecord, "programs"), typeof enemyId === "string" ? enemyId : "", errors);
    const zonesValue = property(stateRecord, "zones");
    if (!strictRecord(zonesValue, ["deck", "hand", "discard", "exile"], "zones", errors)) return { valid: false, errors };
    const zones = zonesValue as UnknownRecord;
    for (const zone of ["deck", "hand", "discard", "exile"] as const) validateStringArray(property(zones, zone), `zones.${zone}`, errors);
    const resonanceValue = property(stateRecord, "resonance");
    if (!strictRecord(resonanceValue, ["activeAttribute", "streakByAttribute"], "resonance", errors)) return { valid: false, errors };
    const resonance = resonanceValue as UnknownRecord;
    const active = property(resonance, "activeAttribute");
    if (active !== null && !isResonanceAttribute(active)) errors.push("active resonance attribute is invalid");
    const streaksValue = property(resonance, "streakByAttribute");
    if (strictRecord(streaksValue, RESONANCE_ATTRIBUTES, "resonance.streakByAttribute", errors)) {
      const streaks = streaksValue as UnknownRecord;
      for (const attribute of RESONANCE_ATTRIBUTES) {
        const streak = property(streaks, attribute);
        if (!isSafeCount(streak)) errors.push(`resonance streak is invalid: ${attribute}`);
        if (active === attribute && (streak as number) < 1) errors.push(`active resonance streak must be positive: ${attribute}`);
        if (active !== attribute && streak !== 0) errors.push(`inactive resonance streak must be zero: ${attribute}`);
      }
    }
    if (errors.length === 0) {
      const state = candidate as unknown as CombatState;
      const allZoneIds = [...state.zones.deck, ...state.zones.hand, ...state.zones.discard, ...state.zones.exile];
      const knownInstances = new Set(state.instances.map((instance) => instance.instanceId));
      for (const id of allZoneIds) if (!knownInstances.has(id)) errors.push(`zone references unknown instance: ${id}`);
      for (const id of knownInstances) if (allZoneIds.filter((candidateId) => candidateId === id).length !== 1) errors.push(`instance must occur in exactly one zone: ${id}`);
      const playerDead = state.player.hp <= 0;
      const enemyDead = state.enemy.hp <= 0;
      const expectedStatus = playerDead && enemyDead ? (state.rules.terminalPolicy === "DEFEAT_FIRST" ? "DEFEAT" : "VICTORY") : playerDead ? "DEFEAT" : enemyDead ? "VICTORY" : "ONGOING";
      if (state.status !== expectedStatus) errors.push(`combat status must be ${expectedStatus} for current HP`);
      if (state.status === "ONGOING" && !["TURN_READY", "PLAYER_ACTION"].includes(state.phase)) errors.push("ongoing combat must use an externally resumable phase");
      if (state.status !== "ONGOING" && state.phase !== "TERMINAL") errors.push("terminal combat must use TERMINAL phase");
    }
  } catch {
    return { valid: false, errors: ["combat state cannot be inspected safely"] };
  }
  return { valid: errors.length === 0, errors };
}

export function decodeCombatSetup(candidate: unknown): DecodeResult<CombatSetup> {
  const snapshot = snapshotBoundary(candidate, "combat setup");
  if (!snapshot.ok) return { valid: false, errors: snapshot.errors };
  const validation = validateCombatSetupSnapshot(snapshot.value);
  return validation.valid
    ? { valid: true, value: snapshot.value as CombatSetup, errors: [] }
    : { valid: false, errors: validation.errors };
}

export function validateCombatSetup(candidate: unknown): ValidationResult {
  return asValidationResult(decodeCombatSetup(candidate));
}

export function decodeCombatCommand(candidate: unknown): DecodeResult<CombatCommand> {
  const snapshot = snapshotBoundary(candidate, "combat command");
  if (!snapshot.ok) return { valid: false, errors: snapshot.errors };
  const validation = validateCombatCommandSnapshot(snapshot.value);
  return validation.valid
    ? { valid: true, value: snapshot.value as CombatCommand, errors: [] }
    : { valid: false, errors: validation.errors };
}

export function decodeCombatCommands(candidate: unknown): DecodeResult<CombatCommand[]> {
  const snapshot = snapshotBoundary(candidate, "commands");
  if (!snapshot.ok) return { valid: false, errors: snapshot.errors };
  if (!Array.isArray(snapshot.value)) {
    return { valid: false, errors: ["commands must be a plain array"] };
  }
  const commands: CombatCommand[] = [];
  for (let index = 0; index < snapshot.value.length; index += 1) {
    const validation = validateCombatCommandSnapshot(snapshot.value[index]);
    if (!validation.valid) {
      return {
        valid: false,
        errors: validation.errors.map((error) => `commands[${index}]: ${error}`),
      };
    }
    commands.push(snapshot.value[index] as CombatCommand);
  }
  return { valid: true, value: commands, errors: [] };
}

export function decodeCombatState(candidate: unknown): DecodeResult<CombatState> {
  const snapshot = snapshotBoundary(candidate, "combat state");
  if (!snapshot.ok) return { valid: false, errors: snapshot.errors };
  const validation = validateCombatStateSnapshot(snapshot.value);
  return validation.valid
    ? { valid: true, value: snapshot.value as CombatState, errors: [] }
    : { valid: false, errors: validation.errors };
}

export function validateCombatState(candidate: unknown): ValidationResult {
  return asValidationResult(decodeCombatState(candidate));
}

export function isValidCombatCommand(candidate: unknown): candidate is CombatCommand {
  return decodeCombatCommand(candidate).valid;
}

export function validateCombatCommand(candidate: unknown): ValidationResult {
  return asValidationResult(decodeCombatCommand(candidate));
}
