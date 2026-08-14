import { cloneCombatSetup, cloneCommand, cloneEvents, cloneCombatState } from "./clone";
import {
  COMBAT_ENGINE_VERSION,
  COMBAT_PRNG_VERSION,
  COMBAT_REPLAY_HASH_ALGORITHM,
  COMBAT_REPLAY_SCHEMA_VERSION,
} from "./constants";
import { reduceCombat } from "./reducer";
import { createCombatState } from "./setup";
import type { CombatCommand, CombatReplay, CombatSetup } from "./types";
import { validateCombatCommand } from "./validation";

export class CombatReplayValidationError extends Error {
  readonly errors: string[];

  constructor(errors: readonly string[]) {
    super(`Invalid combat replay input: ${errors.join("; ")}`);
    this.name = "CombatReplayValidationError";
    this.errors = errors.slice();
  }
}

function safeCommands(candidate: unknown): CombatCommand[] {
  try {
    if (!Array.isArray(candidate) || Object.getPrototypeOf(candidate) !== Array.prototype) {
      throw new CombatReplayValidationError(["commands must be a plain array"]);
    }
    const keys = Reflect.ownKeys(candidate);
    if (keys.some((key) => typeof key === "symbol")) {
      throw new CombatReplayValidationError(["commands must not contain symbol keys"]);
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(candidate, "length");
    const length = lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : -1;
    if (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1) {
      throw new CombatReplayValidationError(["commands must be dense and have no extra properties"]);
    }
    const commands: CombatCommand[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(candidate, String(index));
      if (!descriptor || !("value" in descriptor)) {
        throw new CombatReplayValidationError([`commands[${index}] must be an own data property`]);
      }
      const validation = validateCombatCommand(descriptor.value);
      if (!validation.valid) {
        throw new CombatReplayValidationError(validation.errors.map((error) => `commands[${index}]: ${error}`));
      }
      commands.push(cloneCommand(descriptor.value as CombatCommand));
    }
    return commands;
  } catch (error) {
    if (error instanceof CombatReplayValidationError) throw error;
    throw new CombatReplayValidationError(["commands cannot be inspected safely"]);
  }
}

function canonicalValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical serialization rejects non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalValue(record[key])}`).join(",")}}`;
  }
  throw new Error(`Canonical serialization rejects ${typeof value}`);
}

export function canonicalSerialize(value: unknown): string {
  return canonicalValue(value);
}

function utf8Bytes(value: string): number[] {
  const bytes: number[] = [];
  for (const character of value) {
    const point = character.codePointAt(0)!;
    if (point <= 0x7f) bytes.push(point);
    else if (point <= 0x7ff) bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
    else if (point <= 0xffff) {
      bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
    } else {
      bytes.push(
        0xf0 | (point >> 18),
        0x80 | ((point >> 12) & 0x3f),
        0x80 | ((point >> 6) & 0x3f),
        0x80 | (point & 0x3f),
      );
    }
  }
  return bytes;
}

export function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (const byte of utf8Bytes(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function runCombatReplay(inputSetup: CombatSetup, inputCommands: readonly CombatCommand[]): CombatReplay;
export function runCombatReplay(inputSetup: unknown, inputCommands: unknown): CombatReplay;
export function runCombatReplay(inputSetup: unknown, inputCommands: unknown): CombatReplay {
  let state = createCombatState(inputSetup);
  let initialSetup: CombatSetup;
  try {
    initialSetup = cloneCombatSetup(inputSetup as CombatSetup);
  } catch {
    throw new CombatReplayValidationError(["setup changed during replay canonicalization"]);
  }
  const commands = safeCommands(inputCommands);
  const initialState = cloneCombatState(state);
  const steps = commands.map((command) => {
    const result = reduceCombat(state, command);
    state = result.state;
    return {
      command: cloneCommand(command),
      state: cloneCombatState(result.state),
      events: cloneEvents(result.events),
    };
  });
  const payload = {
    schemaVersion: COMBAT_REPLAY_SCHEMA_VERSION,
    engineVersion: COMBAT_ENGINE_VERSION,
    prngVersion: COMBAT_PRNG_VERSION,
    hashAlgorithm: COMBAT_REPLAY_HASH_ALGORITHM,
    initialSetup,
    initialState,
    commands,
    steps,
  };
  return {
    schemaVersion: payload.schemaVersion,
    engineVersion: payload.engineVersion,
    prngVersion: payload.prngVersion,
    hashAlgorithm: payload.hashAlgorithm,
    initialSetup: payload.initialSetup,
    initialState: payload.initialState,
    commands: payload.commands,
    steps: payload.steps,
    hash: fnv1a32(canonicalSerialize(payload)),
  };
}
