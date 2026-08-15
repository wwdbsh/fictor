import type { CombatCommand } from "../../domain/combat";
import type { ForgeRuntimeEvent, ForgeRuntimeStateV1 } from "../../domain/forge-runtime";
import type { PersistentProfileV1, SaveFailureCode, SaveLoadIssue } from "../../persistence";

export const STILLKIN_TRACK1_FLOW_SCHEMA_VERSION = "stillkin-track1-flow-v1" as const;
export const STILLKIN_TRACK1_CONTROLLER_VERSION = "stillkin-track1-controller-v1" as const;

export type Track1Phase = "BETWEEN_NODES" | "IN_COMBAT" | "AWAITING_REWARD" | "IN_EVENT" | "EVENT_RESOLVED" | "RUN_WON" | "RUN_LOST";

export interface Track1CombatBinding {
  runId: string;
  nodeId: string;
  encounterId: string;
  encounterNonce: number;
}

export interface StillkinTrack1FlowState {
  schemaVersion: typeof STILLKIN_TRACK1_FLOW_SCHEMA_VERSION;
  controllerVersion: typeof STILLKIN_TRACK1_CONTROLLER_VERSION;
  revision: number;
  runSequence: number;
  runId: string;
  scenarioId: "stillkin-track1-literal-v1";
  scenarioHash: string;
  configId: "stillkin-track1-provisional-v1";
  configHash: string;
  phase: Track1Phase;
  nextNodeIndex: number;
  currentNodeIndex: number | null;
  pendingOfferId: string | null;
  workshopEntitlementNodeId: string | null;
  nextEncounterNonce: number;
  combatBinding: Track1CombatBinding | null;
  playerHp: number;
  randomState: number;
}

export interface StillkinTrack1Snapshot {
  profile: PersistentProfileV1;
  runtime: ForgeRuntimeStateV1;
  flow: StillkinTrack1FlowState;
  persistence: { generation: string | null; revision: number; writeBlocked: boolean; issues: SaveLoadIssue[] };
  scenario: { scenarioId: string; scenarioHash: string; configId: string; configHash: string };
  currentNode: unknown | null;
  rewardChoices: readonly unknown[];
  eventChoices: readonly {
    choiceId: string;
    price: number;
    effect: unknown;
  }[];
}

export type StillkinTrack1Command =
  | { type: "ENTER_NEXT_NODE"; expectedRevision: number; runId: string }
  | ({ type: "APPLY_COMBAT"; expectedRevision: number; command: CombatCommand } & Track1CombatBinding)
  | ({ type: "FORGE_INSTANT"; expectedRevision: number; materialInstanceIds: [string, string] } & Track1CombatBinding)
  | { type: "CHOOSE_REWARD"; expectedRevision: number; runId: string; choiceId: string }
  | { type: "RESOLVE_EVENT"; expectedRevision: number; runId: string; choiceId: string }
  | { type: "USE_FREE_WORKSHOP"; expectedRevision: number; runId: string; materialInstanceIds: [string, string] }
  | { type: "LEAVE_EVENT"; expectedRevision: number; runId: string }
  | { type: "FORGE_WORKSHOP"; expectedRevision: number; runId: string; materialInstanceIds: [string, string] }
  | { type: "RESTART"; expectedRevision: number; runId: string };

export type StillkinTrack1Event =
  | ForgeRuntimeEvent
  | { type: "COMMAND_REJECTED"; command: StillkinTrack1Command["type"] | "UNKNOWN"; reason: string }
  | { type: "RUN_STARTED" | "RUN_RESTARTED"; runId: string }
  | { type: "NODE_ENTERED"; nodeId: string }
  | { type: "ENCOUNTER_WON"; encounterId: string }
  | { type: "REWARD_AVAILABLE"; offerId: string }
  | { type: "MATERIAL_GRANTED"; materialId: string; instanceId: string }
  | { type: "RECIPE_GRANTED"; recipeId: string }
  | { type: "EVENT_RESOLVED"; eventType: string; choiceId: string }
  | { type: "WORKSHOP_ENTITLEMENT_GRANTED" | "WORKSHOP_ENTITLEMENT_CONSUMED"; nodeId: string }
  | { type: "COLLAPSE_RESOLVED"; outcome: "SUCCESS" | "FAILURE"; randomState: number }
  | { type: "PLAYER_DAMAGED"; amount: number; remainingHp: number }
  | { type: "FUEL_SPENT"; amount: 1; remaining: number }
  | { type: "HEART_OWNED"; heartId: "heart__still" }
  | { type: "RUN_WON" | "RUN_LOST" };

export interface StillkinTrack1DispatchResult {
  applied: boolean;
  snapshot: StillkinTrack1Snapshot;
  events: readonly StillkinTrack1Event[];
  persistence: null | { ok: true; generation: string; revision: number } | { ok: false; reason: SaveFailureCode };
  reason?: string;
}

export interface StillkinTrack1LoadResult {
  snapshot: StillkinTrack1Snapshot;
  source: "EMPTY" | "SAVED" | "MIGRATED_V1" | "SAFE_INITIALIZED";
}
