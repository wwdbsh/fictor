import type { EventEffectV1, RunEventChoiceV1 } from "../../domain/events";
import type { RewardChoiceV1, RewardOfferV1 } from "../../domain/rewards";

export const RUN_SCENARIO_SCHEMA_VERSION = "run-scenario-v1" as const;
export const RUN_FLOW_SCHEMA_VERSION = "run-flow-state-v1" as const;
export const RUN_FLOW_ENGINE_VERSION = "run-flow-engine-v1" as const;

export type EncounterKindV1 = "NORMAL" | "ELITE" | "BOSS";

export interface EncounterNodeV1 {
  readonly nodeId: string;
  readonly kind: "ENCOUNTER";
  readonly depth: 1 | 2 | 3;
  readonly encounterKind: EncounterKindV1;
  readonly encounterId: string;
  readonly rewardOffer: RewardOfferV1 | null;
}

export interface EventNodeV1 {
  readonly nodeId: string;
  readonly kind: "EVENT";
  readonly depth: 1 | 2 | 3;
  readonly eventType: "CACHE" | "WORKSHOP" | "COLLAPSE" | "FICTOR" | "RECORD" | "ODDITY";
  readonly choices: readonly RunEventChoiceV1[];
}

export type RunNodeV1 = EncounterNodeV1 | EventNodeV1;

export interface RunScenarioV1 {
  readonly schemaVersion: typeof RUN_SCENARIO_SCHEMA_VERSION;
  readonly scenarioId: string;
  readonly status: "APPROVED" | "CONFIGURATION_PENDING";
  readonly raceId: "Stillkin";
  readonly groundId: "GROUND_STILL";
  readonly nodes: readonly RunNodeV1[];
  readonly pendingReasons: readonly string[];
}

export type RunFlowPhaseV1 = "DORMANT" | "BETWEEN_NODES" | "IN_COMBAT" | "AWAITING_REWARD" | "IN_EVENT" | "EVENT_RESOLVED" | "RUN_WON" | "RUN_LOST";

export interface RunFlowStateV1 {
  readonly schemaVersion: typeof RUN_FLOW_SCHEMA_VERSION;
  readonly engineVersion: typeof RUN_FLOW_ENGINE_VERSION;
  readonly revision: number;
  readonly phase: RunFlowPhaseV1;
  readonly scenario: RunScenarioV1 | null;
  readonly nextNodeIndex: number;
  readonly currentNodeIndex: number | null;
  readonly pendingReward: RewardOfferV1 | null;
  readonly workshopEntitlements: number;
  readonly grantedUniqueToolIds: readonly string[];
}

export type RunFlowCommandV1 =
  | { readonly type: "START"; readonly scenario: RunScenarioV1; readonly ownedUniqueToolIds: readonly string[] }
  | { readonly type: "ENTER_NEXT_NODE" }
  | { readonly type: "RESOLVE_COMBAT"; readonly result: "VICTORY" | "DEFEAT"; readonly cleanupCompleted: true }
  | { readonly type: "CHOOSE_REWARD"; readonly choiceId: string }
  | { readonly type: "RESOLVE_EVENT"; readonly choiceId: string }
  | { readonly type: "LEAVE_EVENT" }
  | { readonly type: "SETTLE_FREE_WORKSHOP"; readonly outcome: "SUCCEEDED" | "FAILED" }
  | { readonly type: "RESTART"; readonly scenario: RunScenarioV1; readonly ownedUniqueToolIds: readonly string[] };

export type RunFlowEventV1 =
  | { readonly type: "COMMAND_REJECTED"; readonly command: RunFlowCommandV1["type"] | "UNKNOWN"; readonly reason: string }
  | { readonly type: "RUN_STARTED"; readonly scenarioId: string }
  | { readonly type: "NODE_ENTERED"; readonly nodeId: string }
  | { readonly type: "COMBAT_CLEANED" }
  | { readonly type: "ENCOUNTER_WON"; readonly encounterId: string }
  | { readonly type: "REWARD_AVAILABLE"; readonly offerId: string }
  | { readonly type: "REWARD_SELECTED"; readonly choice: RewardChoiceV1 }
  | { readonly type: "EVENT_RESOLVED"; readonly effect: EventEffectV1 }
  | { readonly type: "WORKSHOP_ENTITLEMENT_GRANTED"; readonly remaining: number }
  | { readonly type: "WORKSHOP_ENTITLEMENT_CONSUMED"; readonly remaining: number }
  | { readonly type: "WORKSHOP_EXECUTION_FAILED"; readonly remaining: number }
  | { readonly type: "HEART_OWNED"; readonly heartId: "heart__still" }
  | { readonly type: "RUN_WON" }
  | { readonly type: "RUN_LOST" }
  | { readonly type: "RUN_RESTARTED"; readonly scenarioId: string };

export interface RunFlowResultV1 {
  readonly state: RunFlowStateV1;
  readonly applied: boolean;
  readonly events: readonly RunFlowEventV1[];
}
