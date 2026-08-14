import type { CombatEffectId } from "./constants";
import type { ResonanceAttribute, ResonanceState } from "../resonance";

export type CombatPhase = "TURN_READY" | "START_TURN" | "PLAYER_ACTION" | "END_TURN" | "TERMINAL";
export type CombatStatus = "ONGOING" | "VICTORY" | "DEFEAT";
export type TerminalPolicy = "DEFEAT_FIRST" | "VICTORY_FIRST";

export interface BlockRetentionPolicy {
  numerator: number;
  denominator: number;
  rounding: "FLOOR";
}

export interface CombatRules {
  maxEnergy: number;
  drawCount: number;
  resonanceRate: number | null;
  blockRetention: BlockRetentionPolicy;
  terminalPolicy: TerminalPolicy;
}

export interface CardDefinition {
  cardId: string;
  effectId: CombatEffectId;
  cost: number | null;
  power: number | null;
  resonanceAttribute: ResonanceAttribute | null;
}

export interface CardInstance {
  instanceId: string;
  cardId: string;
}

export type CombatTarget = { kind: "PLAYER" } | { kind: "ENEMY"; enemyId: string };
export type OperationTarget = CombatTarget | { kind: "SELECTED" };

export type TargetRule =
  | { kind: "NONE" }
  | { kind: "REQUIRED"; allowed: "PLAYER" | "ENEMY" | "EITHER" };

export type AmountExpression =
  | { kind: "FIXED"; amount: number }
  | { kind: "EFFECT_POWER"; multiplier: number };

export type AtomicOperation =
  | { kind: "DAMAGE"; target: OperationTarget; amount: AmountExpression }
  | { kind: "GAIN_BLOCK"; target: OperationTarget; amount: AmountExpression }
  | { kind: "HEAL"; target: OperationTarget; amount: AmountExpression };

export interface EffectProgram {
  effectId: CombatEffectId;
  targetRule: TargetRule;
  playedCardDestination: "DISCARD" | "EXILE";
  operations: AtomicOperation[];
}

export interface IntentProgram {
  operations: AtomicOperation[];
}

export interface EnemyIntent {
  intentId: string;
  labelKo: string;
  telegraph: "ATTACK" | "DEFEND" | "SPECIAL";
  displayAmount: number | null;
  program: IntentProgram;
}

export interface CombatantState {
  hp: number;
  maxHp: number;
  block: number;
}

export interface PlayerState extends CombatantState {
  energy: number;
}

export interface EnemyState extends CombatantState {
  enemyId: string;
  intents: EnemyIntent[];
  currentIntentIndex: number;
}

export interface CardZones {
  /** The first element is the top of the deck. */
  deck: string[];
  hand: string[];
  discard: string[];
  exile: string[];
}

export interface CombatState {
  schemaVersion: "combat-state-v2";
  engineVersion: "combat-engine-v2";
  prngVersion: "fictor-splitmix32-fisher-yates-v2";
  phase: CombatPhase;
  status: CombatStatus;
  turn: number;
  randomState: number;
  rules: CombatRules;
  player: PlayerState;
  enemy: EnemyState;
  cards: CardDefinition[];
  instances: CardInstance[];
  programs: EffectProgram[];
  zones: CardZones;
  resonance: ResonanceState;
}

export interface CombatSetup {
  seed: number;
  rules: CombatRules;
  player: CombatantState;
  enemy: CombatantState & {
    enemyId: string;
    intents: EnemyIntent[];
    initialIntentIndex: number;
  };
  cards: CardDefinition[];
  instances: CardInstance[];
  deck: string[];
  programs: EffectProgram[];
}

export type CombatCommand =
  | { type: "START_TURN" }
  | { type: "PLAY_CARD"; instanceId: string; target: CombatTarget | null }
  | { type: "END_TURN" };

export type RejectionReason =
  | "INVALID_COMMAND"
  | "INVALID_STATE"
  | "TERMINAL_COMBAT"
  | "INVALID_PHASE"
  | "CARD_NOT_FOUND"
  | "CARD_NOT_IN_HAND"
  | "EFFECT_PROGRAM_UNAVAILABLE"
  | "RESONANCE_ATTRIBUTE_REQUIRED"
  | "INVALID_CARD_NUMERIC"
  | "INSUFFICIENT_ENERGY"
  | "TARGET_REQUIRED"
  | "TARGET_NOT_ALLOWED"
  | "TARGET_ENEMY_MISMATCH"
  | "INVALID_RESONANCE_RATE"
  | "CALCULATION_OVERFLOW"
  | "INVALID_EFFECT_PROGRAM";

export type CombatEvent =
  | { type: "COMMAND_REJECTED"; command: CombatCommand["type"] | "UNKNOWN"; reason: RejectionReason }
  | { type: "PHASE_CHANGED"; phase: CombatPhase }
  | { type: "TURN_STARTED"; turn: number; energy: number }
  | { type: "DISCARD_SHUFFLED"; instanceIds: string[] }
  | { type: "CARD_DRAWN"; instanceId: string }
  | { type: "ENERGY_SPENT"; amount: number; remaining: number }
  | { type: "RESONANCE_ADVANCED"; attribute: ResonanceAttribute; streak: number }
  | { type: "CARD_PLAYED"; instanceId: string; cardId: string; effectId: CombatEffectId; effectivePower: number }
  | {
      type: "OPERATION_APPLIED";
      source: "CARD" | "ENEMY_INTENT";
      operation: AtomicOperation["kind"];
      target: CombatTarget;
      amount: number;
    }
  | { type: "CARD_MOVED"; instanceId: string; from: "HAND"; to: "DISCARD" | "EXILE" }
  | { type: "HAND_DISCARDED"; instanceIds: string[] }
  | { type: "ENEMY_BLOCK_EXPIRED"; amount: number }
  | { type: "ENEMY_INTENT_EXECUTED"; intentId: string }
  | { type: "PLAYER_BLOCK_RETAINED"; before: number; after: number }
  | { type: "ENEMY_INTENT_ROTATED"; intentId: string }
  | { type: "COMBAT_ENDED"; status: "VICTORY" | "DEFEAT" }
  | { type: "TURN_ENDED"; turn: number };

export interface CombatResult {
  state: CombatState;
  events: CombatEvent[];
}

export interface CombatBoundaryFailureResult {
  state: null;
  events: [{ type: "COMMAND_REJECTED"; command: "UNKNOWN"; reason: "INVALID_STATE" }];
}

export type CombatReducerResult = CombatResult | CombatBoundaryFailureResult;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface CombatReplayStep {
  command: CombatCommand;
  state: CombatState;
  events: CombatEvent[];
}

export interface CombatReplay {
  schemaVersion: "combat-replay-v2";
  engineVersion: "combat-engine-v2";
  prngVersion: "fictor-splitmix32-fisher-yates-v2";
  hashAlgorithm: "fnv1a32-v1";
  initialSetup: CombatSetup;
  initialState: CombatState;
  commands: CombatCommand[];
  steps: CombatReplayStep[];
  hash: string;
}
