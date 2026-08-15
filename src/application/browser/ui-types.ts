export type Track1UiPhase =
  | "BLOCKED"
  | "BETWEEN_NODES"
  | "IN_COMBAT"
  | "AWAITING_REWARD"
  | "IN_EVENT"
  | "EVENT_RESOLVED"
  | "RUN_WON"
  | "RUN_LOST";

export type Track1UiActionKind =
  | "ENTER_NEXT_NODE"
  | "START_TURN"
  | "PLAY_CARD"
  | "END_TURN"
  | "CHOOSE_REWARD"
  | "RESOLVE_EVENT"
  | "USE_FREE_WORKSHOP"
  | "LEAVE_EVENT"
  | "RESTART";

/** Commands are deliberately absent. Only the application session can bind this descriptor. */
export interface Track1UiActionDescriptor {
  readonly actionId: string;
  readonly kind: Track1UiActionKind;
  readonly labelKo: string;
  readonly disabled: boolean;
}

export interface Track1UiJourneyNode {
  readonly nodeId: string;
  readonly depth: 1 | 2 | 3;
  readonly labelKo: string;
  readonly status: "COMPLETED" | "CURRENT" | "UPCOMING";
}

export interface Track1UiStats {
  readonly hp: number;
  readonly maxHp: number;
  readonly block: number;
  readonly fuel: number;
  readonly deckCount: number;
}

export interface Track1UiCard {
  readonly instanceId: string;
  readonly cardId: string;
  readonly nameKo: string;
  readonly artSrc: string;
  readonly artFallbackLabelKo: string | null;
  readonly cost: number | null;
  readonly power: number | null;
  readonly effectLabelKo: string;
  readonly action: Track1UiActionDescriptor | null;
}

export interface Track1UiRewardChoice {
  readonly choiceId: string;
  readonly nameKo: string;
  readonly kindLabelKo: string;
  readonly artSrc: string | null;
  readonly action: Track1UiActionDescriptor;
}

export interface Track1UiEventChoice {
  readonly choiceId: string;
  readonly labelKo: string;
  readonly price: number;
  readonly action: Track1UiActionDescriptor;
}

export interface Track1UiWorkshopMaterial {
  readonly instanceId: string;
  readonly cardId: string;
  readonly nameKo: string;
  readonly artSrc: string;
}

interface Track1UiBaseProjection {
  readonly phase: Track1UiPhase;
  readonly screenKey: string;
  /** Stable across revisions within one meaningful screen; presentation focus follows this key. */
  readonly focusKey: string;
  readonly headingKo: string;
  readonly focusHeadingKo: string;
  readonly depth: 1 | 2 | 3;
  readonly stats: Track1UiStats;
  readonly journey: readonly Track1UiJourneyNode[];
  readonly feedback: null | { readonly tone: "STATUS" | "ERROR"; readonly messageKo: string };
}

export interface Track1UiBlockedProjection extends Track1UiBaseProjection {
  readonly phase: "BLOCKED";
  readonly issuesKo: readonly string[];
}

export interface Track1UiJourneyProjection extends Track1UiBaseProjection {
  readonly phase: "BETWEEN_NODES";
  readonly backgroundSrc: string;
  readonly nextLabelKo: string;
  readonly action: Track1UiActionDescriptor;
}

export interface Track1UiCombatProjection extends Track1UiBaseProjection {
  readonly phase: "IN_COMBAT";
  readonly backgroundSrc: string;
  readonly enemy: {
    readonly id: string;
    readonly nameKo: string;
    readonly artSrc: string;
    readonly hp: number;
    readonly maxHp: number;
    readonly block: number;
    readonly intentKo: string;
    readonly intentAmount: number | null;
  };
  readonly turn: number;
  readonly energy: number;
  readonly maxEnergy: number;
  readonly drawCount: number;
  readonly discardCount: number;
  readonly hand: readonly Track1UiCard[];
  readonly primaryAction: Track1UiActionDescriptor | null;
  readonly instructionKo: string;
}

export interface Track1UiRewardProjection extends Track1UiBaseProjection {
  readonly phase: "AWAITING_REWARD";
  readonly choices: readonly Track1UiRewardChoice[];
}

export interface Track1UiEventProjection extends Track1UiBaseProjection {
  readonly phase: "IN_EVENT";
  readonly eventType: string;
  readonly titleKo: string;
  readonly descriptionKo: string;
  readonly artSrc: string;
  readonly choices: readonly Track1UiEventChoice[];
}

export interface Track1UiEventResolvedProjection extends Track1UiBaseProjection {
  readonly phase: "EVENT_RESOLVED";
  readonly eventType: string;
  readonly titleKo: string;
  readonly artSrc: string;
  readonly workshopMaterials: readonly Track1UiWorkshopMaterial[];
  readonly leaveAction: Track1UiActionDescriptor | null;
}

interface Track1UiTerminalProjectionBase extends Track1UiBaseProjection {
  readonly messageKo: string;
  readonly artSrc: string;
  readonly action: Track1UiActionDescriptor;
}

export type Track1UiTerminalProjection = Track1UiTerminalProjectionBase & (
  | { readonly phase: "RUN_WON" }
  | { readonly phase: "RUN_LOST" }
);

export type Track1UiProjection =
  | Track1UiBlockedProjection
  | Track1UiJourneyProjection
  | Track1UiCombatProjection
  | Track1UiRewardProjection
  | Track1UiEventProjection
  | Track1UiEventResolvedProjection
  | Track1UiTerminalProjection;

export interface Track1UiDispatchResult {
  readonly applied: boolean;
  readonly projection: Track1UiProjection;
}

export interface StillkinTrack1UiSession {
  load(): Track1UiProjection;
  snapshot(): Track1UiProjection;
  dispatch(action: Track1UiActionDescriptor): Track1UiDispatchResult;
  describeWorkshopAction(materialInstanceIds: readonly string[]): Track1UiActionDescriptor | null;
}
