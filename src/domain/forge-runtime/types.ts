import type {
  CardInstance,
  CombatCommand,
  CombatEvent,
  CombatState,
} from "../combat";
import type { ForgeInputs, ForgeMaterial, GeneratedCard } from "../forge";

export const FORGE_RUNTIME_SCHEMA_VERSION = "forge-runtime-state-v1" as const;
export const FORGE_RUNTIME_ENGINE_VERSION = "forge-runtime-engine-v1" as const;
export const FORGE_RUNTIME_RESOLVER_VERSION = "canonical-v1" as const;
export const FORGE_RUNTIME_SOURCE_HASH = "7e05e02b3db844ccba7806067e196d0e4477ea4f7ce2c661440ea3820d87d720" as const;
export const FORGE_RUNTIME_FUEL_COST = 1 as const;

export type EphemeralLocation = "HAND" | "DECK" | "DISCARD" | "EXILE" | "EQUIPMENT";

export interface IsolatedMaterial {
  instance: CardInstance;
}

export interface EphemeralForgeResult {
  instanceId: string;
  cardId: string;
  recipeId: string;
  location: EphemeralLocation;
}

export interface ActiveCombatForgeRuntime {
  state: CombatState;
  enrolledPersistentInstanceIds: string[];
  forgeActionTurn: number;
  forgeActionsRemaining: 0 | 1;
  isolatedMaterials: IsolatedMaterial[];
  ephemeralResults: EphemeralForgeResult[];
}

export interface ForgeRuntimeStateV1 {
  schemaVersion: typeof FORGE_RUNTIME_SCHEMA_VERSION;
  engineVersion: typeof FORGE_RUNTIME_ENGINE_VERSION;
  resolverVersion: typeof FORGE_RUNTIME_RESOLVER_VERSION;
  sourceHash: typeof FORGE_RUNTIME_SOURCE_HASH;
  revision: number;
  profile: {
    discoveredRecipeIds: string[];
  };
  run: {
    fuel: number;
    nextInstanceSequence: number;
    ownedInstances: CardInstance[];
    deck: string[];
    activeCombat: ActiveCombatForgeRuntime | null;
  };
}

export interface ForgeResolverContextV1 {
  resolverVersion: typeof FORGE_RUNTIME_RESOLVER_VERSION;
  sourceHash: typeof FORGE_RUNTIME_SOURCE_HASH;
  materials: ForgeMaterial[];
  inputs: ForgeInputs;
}

export type ForgeRuntimeCommand =
  | { type: "APPLY_COMBAT"; command: CombatCommand }
  | { type: "FORGE_INSTANT"; materialInstanceIds: [string, string] }
  | { type: "FORGE_WORKSHOP"; materialInstanceIds: [string, string] }
  | { type: "CLEANUP_COMBAT" };

export type ForgeRuntimeFailureCode =
  | "INVALID_STATE"
  | "INVALID_COMMAND"
  | "INVALID_CONTEXT"
  | "COMBAT_NOT_ACTIVE"
  | "COMBAT_ACTIVE"
  | "INVALID_COMBAT_PHASE"
  | "TERMINAL_COMBAT"
  | "INSTANCE_NOT_FOUND"
  | "NOT_IN_HAND"
  | "NOT_IN_DECK"
  | "DUPLICATE_INSTANCE_SELECTION"
  | "NOT_A_MATERIAL"
  | "SAME_MATERIAL_DEFINITION"
  | "NO_FORGE_ACTION"
  | "INSUFFICIENT_FUEL"
  | "INSTANCE_ID_COLLISION"
  | "INSTANCE_SEQUENCE_EXHAUSTED"
  | "RESOLUTION_FAILED"
  | "POSTCONDITION_FAILED";

export type ForgeRuntimeEvent =
  | CombatEvent
  | {
      type: "FORGE_REJECTED";
      command: ForgeRuntimeCommand["type"] | "UNKNOWN";
      reason: ForgeRuntimeFailureCode;
    }
  | { type: "MATERIALS_ISOLATED"; instanceIds: [string, string] }
  | { type: "MATERIALS_CONSUMED"; instanceIds: [string, string] }
  | { type: "FORGE_ACTION_SPENT"; remaining: number; turn: number }
  | { type: "FUEL_SPENT"; amount: 1; remaining: number }
  | {
      type: "FORGE_RESULT_CREATED";
      mode: "INSTANT" | "WORKSHOP";
      instanceId: string;
      cardId: string;
      recipeId: string;
      location: "HAND" | "DECK";
    }
  | { type: "RECIPE_DISCOVERED"; recipeId: string }
  | {
      type: "INSTANT_FORGE_CLEANED";
      restoredInstanceIds: string[];
      removedEphemeralInstanceIds: string[];
    };

export interface ForgeRuntimeSuccessResult {
  state: ForgeRuntimeStateV1;
  events: ForgeRuntimeEvent[];
  resolvedCard?: GeneratedCard;
}

export interface ForgeRuntimeInvalidStateResult {
  state: null;
  events: [{ type: "FORGE_REJECTED"; command: "UNKNOWN"; reason: "INVALID_STATE" }];
  resolvedCard?: never;
}

export type ForgeRuntimeReducerResult = ForgeRuntimeSuccessResult | ForgeRuntimeInvalidStateResult;

export type ForgeRuntimeDecodeResult<T> =
  | { valid: true; value: T; errors: [] }
  | { valid: false; errors: string[] };

export interface ForgeRuntimeValidationResult {
  valid: boolean;
  errors: string[];
}
