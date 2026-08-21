export type MechanicSignal = "CHARGE" | "RELEASE";

export interface PressedFireConfig {
  readonly chargeTurns: number;
  readonly explosionPower: number;
}

export interface PressedFireState {
  readonly charge: number;
}

export interface PressedFireStep {
  readonly state: PressedFireState;
  readonly event: MechanicSignal;
  readonly explosionPower: number | null;
}

export interface PressedFireEvaluator {
  readonly chargeTurns: number;
  readonly explosionPower: number;
  readonly initialCharge: 0;
  initialState(): PressedFireState;
  step(state: PressedFireState): PressedFireStep;
  advance(state: PressedFireState): PressedFireStep;
}

export interface TotalStopConfig {
  readonly shield: number;
}

export type TotalStopStatus = "SEALED" | "BROKEN";

export interface TotalStopState {
  readonly status: TotalStopStatus;
  readonly remainingShield: number;
}

export interface TotalStopStep {
  readonly state: TotalStopState;
  readonly event: TotalStopStatus;
}

export interface TotalStopEvaluator {
  readonly shield: number;
  initialState(): TotalStopState;
  step(state: TotalStopState, damage: number): TotalStopStep;
  applyDamage(state: TotalStopState, damage: number): TotalStopStep;
}

export interface BlastConfig {
  readonly damage: number;
}

export interface BlastHit {
  readonly targetId: string;
  readonly damage: number;
}

export interface BlastStep {
  readonly event: "BURST_AOE";
  readonly hits: readonly BlastHit[];
  readonly totalDamage: number;
}

export interface BlastEvaluator {
  readonly damage: number;
  step(targetIds: readonly string[]): BlastStep;
  release(targetIds: readonly string[]): BlastStep;
}

export interface BurnoutConfig {
  readonly hpCost: number;
  readonly powerGain: number;
}

export interface BurnoutState {
  readonly hp: number;
  readonly power: number;
}

export type BurnoutSignal = "BURN" | "EXHAUSTED";

export interface BurnoutStep {
  readonly state: BurnoutState;
  readonly event: BurnoutSignal;
  readonly hpSpent: number;
  readonly powerGained: number;
}

export interface BurnoutEvaluator {
  readonly hpCost: number;
  readonly powerGain: number;
  step(state: BurnoutState): BurnoutStep;
  burn(state: BurnoutState): BurnoutStep;
}

export interface SpreadingConfig {
  readonly maxTargets: number;
}

export interface SpreadingHit {
  readonly targetId: string;
  readonly debuffId: string;
}

export interface SpreadingStep {
  readonly event: "SPREAD_DEBUFF";
  readonly sourceTargetId: string;
  readonly hits: readonly SpreadingHit[];
}

export interface SpreadingEvaluator {
  readonly maxTargets: number;
  step(sourceTargetId: string, debuffId: string, targetIds: readonly string[]): SpreadingStep;
  spread(sourceTargetId: string, debuffId: string, targetIds: readonly string[]): SpreadingStep;
}

export interface DispersalConfig {
  readonly phaseTurns: number;
}

export interface DispersalState {
  readonly remainingTurns: number;
}

export type DispersalSignal = "DISPERSED" | "MATERIALIZED";

export interface DispersalStep {
  readonly state: DispersalState;
  readonly event: DispersalSignal;
  readonly canBeHit: boolean;
}

export interface DispersalEvaluator {
  readonly phaseTurns: number;
  initialState(): DispersalState;
  step(state: DispersalState): DispersalStep;
  advance(state: DispersalState): DispersalStep;
}

export interface NeutralizedState {
  readonly player: readonly string[];
  readonly enemy: readonly string[];
}

export interface NeutralizedStep {
  readonly state: NeutralizedState;
  readonly event: "RESET_STATES";
  readonly cleared: { readonly player: number; readonly enemy: number };
}

export interface NeutralizedEvaluator {
  step(state: NeutralizedState): NeutralizedStep;
  reset(state: NeutralizedState): NeutralizedStep;
}

export interface SelfEatingConfig {
  readonly hpCost: number;
  readonly powerGain: number;
}

export interface SelfEatingState {
  readonly hp: number;
  readonly power: number;
}

export type SelfEatingSignal = "SELF_EATING" | "EXHAUSTED";

export interface SelfEatingStep {
  readonly state: SelfEatingState;
  readonly event: SelfEatingSignal;
  readonly hpConsumed: number;
  readonly powerGained: number;
}

export interface SelfEatingEvaluator {
  readonly hpCost: number;
  readonly powerGain: number;
  step(state: SelfEatingState): SelfEatingStep;
  consume(state: SelfEatingState): SelfEatingStep;
}

export interface ClarifiedConfig {
  readonly healing: number;
}

export interface ClarifiedState {
  readonly hp: number;
  readonly maxHp: number;
  readonly statuses: readonly string[];
}

export interface ClarifiedStep {
  readonly state: ClarifiedState;
  readonly event: "CLARIFIED";
  readonly cleared: number;
  readonly healed: number;
}

export interface ClarifiedEvaluator {
  readonly healing: number;
  step(state: ClarifiedState): ClarifiedStep;
  heal(state: ClarifiedState): ClarifiedStep;
}

export interface EmptiedConfig {
  readonly intervalTurns: number;
}

export interface EmptiedState {
  readonly remainingTurns: number;
  readonly player: readonly string[];
  readonly enemy: readonly string[];
}

export type EmptiedSignal = "COUNTDOWN" | "EMPTIED";

export interface EmptiedStep {
  readonly state: EmptiedState;
  readonly event: EmptiedSignal;
  readonly cleared: { readonly player: number; readonly enemy: number };
}

export interface EmptiedEvaluator {
  readonly intervalTurns: number;
  initialState(): EmptiedState;
  step(state: EmptiedState): EmptiedStep;
  reset(state: EmptiedState): EmptiedStep;
}

export interface HardenedConfig {
  readonly block: number;
}

export interface HardenedAllyState {
  readonly id: string;
  readonly block: number;
}

export interface HardenedState {
  readonly allies: readonly HardenedAllyState[];
}

export interface HardenedStep {
  readonly state: HardenedState;
  readonly event: "HARDENED";
  readonly grantedBlock: number;
}

export interface HardenedEvaluator {
  readonly block: number;
  step(state: HardenedState): HardenedStep;
  grant(state: HardenedState): HardenedStep;
}

export interface KnotConfig {
  readonly healing: number;
}

export interface KnotState {
  readonly hp: number;
  readonly maxHp: number;
}

export interface KnotStep {
  readonly state: KnotState;
  readonly event: "KNOT";
  readonly healed: number;
}

export interface KnotEvaluator {
  readonly healing: number;
  step(state: KnotState): KnotStep;
  regenerate(state: KnotState): KnotStep;
}

export type MechanicConfigFailure =
  | "INVALID_CONFIG"
  | "INVALID_CHARGE_TURNS"
  | "INVALID_EXPLOSION_POWER"
  | "INVALID_SHIELD"
  | "INVALID_DAMAGE"
  | "INVALID_HP_COST"
  | "INVALID_POWER_GAIN"
  | "INVALID_MAX_TARGETS"
  | "INVALID_PHASE_TURNS"
  | "INVALID_HEALING"
  | "INVALID_INTERVAL_TURNS"
  | "INVALID_DEFENSE";

export class MechanicConfigError extends Error {
  readonly reason: MechanicConfigFailure;

  constructor(
    mechanic: "PRESSED_FIRE" | "TOTAL_STOP" | "BLAST" | "BURNOUT" | "SPREADING" | "DISPERSAL" | "NEUTRALIZED" | "SELF_EATING" | "CLARIFIED" | "EMPTIED" | "HARDENED" | "KNOT",
    reason: MechanicConfigFailure,
  ) {
    super(`Invalid ${mechanic} mechanic configuration: ${reason}`);
    this.name = "MechanicConfigError";
    this.reason = reason;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === expectedKeys.length && expectedKeys.every((key) => actualKeys.includes(key));
}

function isSafePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isSafeNonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function assertPressedFireConfig(value: unknown): asserts value is PressedFireConfig {
  if (!isRecord(value) || !hasExactKeys(value, ["chargeTurns", "explosionPower"])) {
    throw new MechanicConfigError("PRESSED_FIRE", "INVALID_CONFIG");
  }
  if (!isSafePositiveInteger(value.chargeTurns)) {
    throw new MechanicConfigError("PRESSED_FIRE", "INVALID_CHARGE_TURNS");
  }
  if (!isSafePositiveInteger(value.explosionPower)) {
    throw new MechanicConfigError("PRESSED_FIRE", "INVALID_EXPLOSION_POWER");
  }
}

function assertTotalStopConfig(value: unknown): asserts value is TotalStopConfig {
  if (!isRecord(value) || !hasExactKeys(value, ["shield"])) {
    throw new MechanicConfigError("TOTAL_STOP", "INVALID_CONFIG");
  }
  if (!isSafePositiveInteger(value.shield)) {
    throw new MechanicConfigError("TOTAL_STOP", "INVALID_SHIELD");
  }
}

function assertBlastConfig(value: unknown): asserts value is BlastConfig {
  if (!isRecord(value) || !hasExactKeys(value, ["damage"])) {
    throw new MechanicConfigError("BLAST", "INVALID_CONFIG");
  }
  if (!isSafePositiveInteger(value.damage)) {
    throw new MechanicConfigError("BLAST", "INVALID_DAMAGE");
  }
}

function assertBurnoutConfig(value: unknown): asserts value is BurnoutConfig {
  if (!isRecord(value) || !hasExactKeys(value, ["hpCost", "powerGain"])) {
    throw new MechanicConfigError("BURNOUT", "INVALID_CONFIG");
  }
  if (!isSafePositiveInteger(value.hpCost)) {
    throw new MechanicConfigError("BURNOUT", "INVALID_HP_COST");
  }
  if (!isSafePositiveInteger(value.powerGain)) {
    throw new MechanicConfigError("BURNOUT", "INVALID_POWER_GAIN");
  }
}

function assertSpreadingConfig(value: unknown): asserts value is SpreadingConfig {
  if (!isRecord(value) || !hasExactKeys(value, ["maxTargets"])) {
    throw new MechanicConfigError("SPREADING", "INVALID_CONFIG");
  }
  if (!isSafePositiveInteger(value.maxTargets)) {
    throw new MechanicConfigError("SPREADING", "INVALID_MAX_TARGETS");
  }
}

function assertDispersalConfig(value: unknown): asserts value is DispersalConfig {
  if (!isRecord(value) || !hasExactKeys(value, ["phaseTurns"])) {
    throw new MechanicConfigError("DISPERSAL", "INVALID_CONFIG");
  }
  if (!isSafePositiveInteger(value.phaseTurns)) {
    throw new MechanicConfigError("DISPERSAL", "INVALID_PHASE_TURNS");
  }
}

function assertNeutralizedConfig(value: unknown): void {
  if (!isRecord(value) || !hasExactKeys(value, [])) {
    throw new MechanicConfigError("NEUTRALIZED", "INVALID_CONFIG");
  }
}

function assertSelfEatingConfig(value: unknown): asserts value is SelfEatingConfig {
  if (!isRecord(value) || !hasExactKeys(value, ["hpCost", "powerGain"])) {
    throw new MechanicConfigError("SELF_EATING", "INVALID_CONFIG");
  }
  if (!isSafePositiveInteger(value.hpCost)) {
    throw new MechanicConfigError("SELF_EATING", "INVALID_HP_COST");
  }
  if (!isSafePositiveInteger(value.powerGain)) {
    throw new MechanicConfigError("SELF_EATING", "INVALID_POWER_GAIN");
  }
}

function assertClarifiedConfig(value: unknown): asserts value is ClarifiedConfig {
  if (!isRecord(value) || !hasExactKeys(value, ["healing"])) {
    throw new MechanicConfigError("CLARIFIED", "INVALID_CONFIG");
  }
  if (!isSafePositiveInteger(value.healing)) {
    throw new MechanicConfigError("CLARIFIED", "INVALID_HEALING");
  }
}

function assertEmptiedConfig(value: unknown): asserts value is EmptiedConfig {
  if (!isRecord(value) || !hasExactKeys(value, ["intervalTurns"])) {
    throw new MechanicConfigError("EMPTIED", "INVALID_CONFIG");
  }
  if (!isSafePositiveInteger(value.intervalTurns)) {
    throw new MechanicConfigError("EMPTIED", "INVALID_INTERVAL_TURNS");
  }
}

function assertHardenedConfig(value: unknown): asserts value is HardenedConfig {
  if (!isRecord(value) || !hasExactKeys(value, ["block"])) {
    throw new MechanicConfigError("HARDENED", "INVALID_CONFIG");
  }
  if (!isSafePositiveInteger(value.block)) {
    throw new MechanicConfigError("HARDENED", "INVALID_DEFENSE");
  }
}

function assertKnotConfig(value: unknown): asserts value is KnotConfig {
  if (!isRecord(value) || !hasExactKeys(value, ["healing"])) {
    throw new MechanicConfigError("KNOT", "INVALID_CONFIG");
  }
  if (!isSafePositiveInteger(value.healing)) {
    throw new MechanicConfigError("KNOT", "INVALID_HEALING");
  }
}

function assertPressedFireState(value: PressedFireState, chargeTurns: number): void {
  if (!isRecord(value) || !isSafeNonnegativeInteger(value.charge) || value.charge >= chargeTurns) {
    throw new Error("Invalid PRESSED_FIRE state");
  }
}

function assertTotalStopState(value: TotalStopState, shield: number): void {
  if (!isRecord(value) || (value.status !== "SEALED" && value.status !== "BROKEN")) {
    throw new Error("Invalid TOTAL_STOP state");
  }
  if (!isSafeNonnegativeInteger(value.remainingShield) || value.remainingShield > shield) {
    throw new Error("Invalid TOTAL_STOP shield state");
  }
  if (value.status === "SEALED" && value.remainingShield === 0) {
    throw new Error("SEALED TOTAL_STOP state must retain a shield");
  }
  if (value.status === "BROKEN" && value.remainingShield !== 0) {
    throw new Error("BROKEN TOTAL_STOP state must have no remaining shield");
  }
}

function assertDamage(value: unknown): asserts value is number {
  if (!isSafeNonnegativeInteger(value)) throw new Error("Invalid TOTAL_STOP damage");
}

function assertBlastTargets(value: unknown): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((targetId) => typeof targetId !== "string" || targetId.length === 0)
    || new Set(value).size !== value.length) {
    throw new Error("Invalid BLAST targets");
  }
}

function assertBurnoutState(value: unknown): asserts value is BurnoutState {
  if (!isRecord(value) || !hasExactKeys(value, ["hp", "power"]) || !isSafePositiveInteger(value.hp)
    || !isSafeNonnegativeInteger(value.power)) {
    throw new Error("Invalid BURNOUT state");
  }
}

function assertSpreadingInput(sourceTargetId: unknown, debuffId: unknown, targetIds: unknown): asserts targetIds is readonly string[] {
  if (typeof sourceTargetId !== "string" || sourceTargetId.length === 0 || typeof debuffId !== "string" || debuffId.length === 0
    || !Array.isArray(targetIds) || targetIds.length === 0
    || targetIds.some((targetId) => typeof targetId !== "string" || targetId.length === 0 || targetId === sourceTargetId)
    || new Set(targetIds).size !== targetIds.length) {
    throw new Error("Invalid SPREADING targets");
  }
}

function assertDispersalState(value: unknown, phaseTurns: number): asserts value is DispersalState {
  if (!isRecord(value) || !hasExactKeys(value, ["remainingTurns"])
    || !isSafeNonnegativeInteger(value.remainingTurns) || value.remainingTurns > phaseTurns) {
    throw new Error("Invalid DISPERSAL state");
  }
}

function assertStatusIds(value: unknown): value is readonly string[] {
  return Array.isArray(value)
    && value.every((statusId) => typeof statusId === "string" && statusId.length > 0)
    && new Set(value).size === value.length;
}

function assertNeutralizedState(value: unknown): asserts value is NeutralizedState {
  if (!isRecord(value) || !hasExactKeys(value, ["player", "enemy"])
    || !assertStatusIds(value.player) || !assertStatusIds(value.enemy)) {
    throw new Error("Invalid NEUTRALIZED state");
  }
}

function assertSelfEatingState(value: unknown): asserts value is SelfEatingState {
  if (!isRecord(value) || !hasExactKeys(value, ["hp", "power"])
    || !isSafePositiveInteger(value.hp) || !isSafeNonnegativeInteger(value.power)) {
    throw new Error("Invalid SELF_EATING state");
  }
}

function assertClarifiedState(value: unknown): asserts value is ClarifiedState {
  if (!isRecord(value) || !hasExactKeys(value, ["hp", "maxHp", "statuses"])
    || !isSafePositiveInteger(value.hp) || !isSafePositiveInteger(value.maxHp) || value.hp > value.maxHp
    || !assertStatusIds(value.statuses)) {
    throw new Error("Invalid CLARIFIED state");
  }
}

function assertEmptiedState(value: unknown, intervalTurns: number): asserts value is EmptiedState {
  if (!isRecord(value) || !hasExactKeys(value, ["remainingTurns", "player", "enemy"])
    || !isSafePositiveInteger(value.remainingTurns) || value.remainingTurns > intervalTurns
    || !assertStatusIds(value.player) || !assertStatusIds(value.enemy)) {
    throw new Error("Invalid EMPTIED state");
  }
}

function assertHardenedState(value: unknown): asserts value is HardenedState {
  if (!isRecord(value) || !hasExactKeys(value, ["allies"]) || !Array.isArray(value.allies)
    || value.allies.length === 0 || value.allies.some((ally) => !isRecord(ally)
      || !hasExactKeys(ally, ["id", "block"]) || typeof ally.id !== "string" || ally.id.length === 0
      || !isSafeNonnegativeInteger(ally.block))
    || new Set(value.allies.map((ally) => ally.id)).size !== value.allies.length) {
    throw new Error("Invalid HARDENED state");
  }
}

function assertKnotState(value: unknown): asserts value is KnotState {
  if (!isRecord(value) || !hasExactKeys(value, ["hp", "maxHp"])
    || !isSafePositiveInteger(value.hp) || !isSafePositiveInteger(value.maxHp) || value.hp > value.maxHp) {
    throw new Error("Invalid KNOT state");
  }
}

export function resolvePressedFire(config: unknown): PressedFireEvaluator {
  assertPressedFireConfig(config);
  const chargeTurns = config.chargeTurns;
  const explosionPower = config.explosionPower;
  const initialState = (): PressedFireState => ({ charge: 0 });
  const step = (state: PressedFireState): PressedFireStep => {
    assertPressedFireState(state, chargeTurns);
    const nextCharge = state.charge + 1;
    if (nextCharge >= chargeTurns) {
      return { state: { charge: 0 }, event: "RELEASE", explosionPower };
    }
    return { state: { charge: nextCharge }, event: "CHARGE", explosionPower: null };
  };
  return {
    chargeTurns,
    explosionPower,
    initialCharge: 0,
    initialState,
    step,
    advance: step,
  };
}

export function resolveTotalStop(config: unknown): TotalStopEvaluator {
  assertTotalStopConfig(config);
  const shield = config.shield;
  const initialState = (): TotalStopState => ({ status: "SEALED", remainingShield: shield });
  const step = (state: TotalStopState, damage: number): TotalStopStep => {
    assertTotalStopState(state, shield);
    assertDamage(damage);
    if (state.status === "BROKEN") {
      return { state: { status: "BROKEN", remainingShield: 0 }, event: "BROKEN" };
    }
    if (damage >= state.remainingShield) {
      return { state: { status: "BROKEN", remainingShield: 0 }, event: "BROKEN" };
    }
    return {
      state: { status: "SEALED", remainingShield: state.remainingShield - damage },
      event: "SEALED",
    };
  };
  return { shield, initialState, step, applyDamage: step };
}

export function resolveBlast(config: unknown): BlastEvaluator {
  assertBlastConfig(config);
  const damage = config.damage;
  const step = (targetIds: readonly string[]): BlastStep => {
    assertBlastTargets(targetIds);
    const totalDamage = damage * targetIds.length;
    if (!Number.isSafeInteger(totalDamage)) throw new Error("BLAST damage overflow");
    return {
      event: "BURST_AOE",
      hits: targetIds.map((targetId) => ({ targetId, damage })),
      totalDamage,
    };
  };
  return { damage, step, release: step };
}

export function resolveBurnout(config: unknown): BurnoutEvaluator {
  assertBurnoutConfig(config);
  const hpCost = config.hpCost;
  const powerGain = config.powerGain;
  const step = (state: BurnoutState): BurnoutStep => {
    assertBurnoutState(state);
    if (state.hp <= hpCost) {
      return { state: { hp: state.hp, power: state.power }, event: "EXHAUSTED", hpSpent: 0, powerGained: 0 };
    }
    const nextPower = state.power + powerGain;
    if (!Number.isSafeInteger(nextPower)) throw new Error("BURNOUT power overflow");
    return {
      state: { hp: state.hp - hpCost, power: nextPower },
      event: "BURN",
      hpSpent: hpCost,
      powerGained: powerGain,
    };
  };
  return { hpCost, powerGain, step, burn: step };
}

export function resolveSpreading(config: unknown): SpreadingEvaluator {
  assertSpreadingConfig(config);
  const maxTargets = config.maxTargets;
  const step = (sourceTargetId: string, debuffId: string, targetIds: readonly string[]): SpreadingStep => {
    assertSpreadingInput(sourceTargetId, debuffId, targetIds);
    return {
      event: "SPREAD_DEBUFF",
      sourceTargetId,
      hits: targetIds.slice(0, maxTargets).map((targetId) => ({ targetId, debuffId })),
    };
  };
  return { maxTargets, step, spread: step };
}

export function resolveDispersal(config: unknown): DispersalEvaluator {
  assertDispersalConfig(config);
  const phaseTurns = config.phaseTurns;
  const initialState = (): DispersalState => ({ remainingTurns: phaseTurns });
  const step = (state: DispersalState): DispersalStep => {
    assertDispersalState(state, phaseTurns);
    const remainingTurns = Math.max(0, state.remainingTurns - 1);
    const canBeHit = remainingTurns === 0;
    return {
      state: { remainingTurns },
      event: canBeHit ? "MATERIALIZED" : "DISPERSED",
      canBeHit,
    };
  };
  return { phaseTurns, initialState, step, advance: step };
}

export function resolveNeutralized(config: unknown): NeutralizedEvaluator {
  assertNeutralizedConfig(config);
  const step = (state: NeutralizedState): NeutralizedStep => {
    assertNeutralizedState(state);
    return {
      state: { player: [], enemy: [] },
      event: "RESET_STATES",
      cleared: { player: state.player.length, enemy: state.enemy.length },
    };
  };
  return { step, reset: step };
}

export function resolveSelfEating(config: unknown): SelfEatingEvaluator {
  assertSelfEatingConfig(config);
  const hpCost = config.hpCost;
  const powerGain = config.powerGain;
  const step = (state: SelfEatingState): SelfEatingStep => {
    assertSelfEatingState(state);
    if (state.hp <= hpCost) {
      return { state: { hp: state.hp, power: state.power }, event: "EXHAUSTED", hpConsumed: 0, powerGained: 0 };
    }
    const nextPower = state.power + powerGain;
    if (!Number.isSafeInteger(nextPower)) throw new Error("SELF_EATING power overflow");
    return {
      state: { hp: state.hp - hpCost, power: nextPower },
      event: "SELF_EATING",
      hpConsumed: hpCost,
      powerGained: powerGain,
    };
  };
  return { hpCost, powerGain, step, consume: step };
}

export function resolveClarified(config: unknown): ClarifiedEvaluator {
  assertClarifiedConfig(config);
  const healing = config.healing;
  const step = (state: ClarifiedState): ClarifiedStep => {
    assertClarifiedState(state);
    const hp = Math.min(state.maxHp, state.hp + healing);
    return {
      state: { hp, maxHp: state.maxHp, statuses: [] },
      event: "CLARIFIED",
      cleared: state.statuses.length,
      healed: hp - state.hp,
    };
  };
  return { healing, step, heal: step };
}

export function resolveEmptied(config: unknown): EmptiedEvaluator {
  assertEmptiedConfig(config);
  const intervalTurns = config.intervalTurns;
  const initialState = (): EmptiedState => ({ remainingTurns: intervalTurns, player: [], enemy: [] });
  const step = (state: EmptiedState): EmptiedStep => {
    assertEmptiedState(state, intervalTurns);
    if (state.remainingTurns > 1) {
      return {
        state: { remainingTurns: state.remainingTurns - 1, player: [...state.player], enemy: [...state.enemy] },
        event: "COUNTDOWN",
        cleared: { player: 0, enemy: 0 },
      };
    }
    return {
      state: { remainingTurns: intervalTurns, player: [], enemy: [] },
      event: "EMPTIED",
      cleared: { player: state.player.length, enemy: state.enemy.length },
    };
  };
  return { intervalTurns, initialState, step, reset: step };
}

export function resolveHardened(config: unknown): HardenedEvaluator {
  assertHardenedConfig(config);
  const block = config.block;
  const step = (state: HardenedState): HardenedStep => {
    assertHardenedState(state);
    const allies = state.allies.map((ally) => {
      const nextBlock = ally.block + block;
      if (!Number.isSafeInteger(nextBlock)) throw new Error("HARDENED block overflow");
      return { id: ally.id, block: nextBlock };
    });
    return { state: { allies }, event: "HARDENED", grantedBlock: block };
  };
  return { block, step, grant: step };
}

export function resolveKnot(config: unknown): KnotEvaluator {
  assertKnotConfig(config);
  const healing = config.healing;
  const step = (state: KnotState): KnotStep => {
    assertKnotState(state);
    const hp = Math.min(state.maxHp, state.hp + healing);
    return { state: { hp, maxHp: state.maxHp }, event: "KNOT", healed: hp - state.hp };
  };
  return { healing, step, regenerate: step };
}

function tryResolveMechanic<T>(resolver: (config: unknown) => T, config: unknown):
  | { readonly ok: true; readonly evaluator: T }
  | { readonly ok: false; readonly reason: MechanicConfigFailure } {
  try {
    return { ok: true, evaluator: resolver(config) };
  } catch (error) {
    if (error instanceof MechanicConfigError) return { ok: false, reason: error.reason };
    throw error;
  }
}

export const tryResolvePressedFire = (config: unknown) => tryResolveMechanic(resolvePressedFire, config);
export const tryResolveTotalStop = (config: unknown) => tryResolveMechanic(resolveTotalStop, config);
export const tryResolveBlast = (config: unknown) => tryResolveMechanic(resolveBlast, config);
export const tryResolveBurnout = (config: unknown) => tryResolveMechanic(resolveBurnout, config);
export const tryResolveSpreading = (config: unknown) => tryResolveMechanic(resolveSpreading, config);
export const tryResolveDispersal = (config: unknown) => tryResolveMechanic(resolveDispersal, config);
export const tryResolveNeutralized = (config: unknown) => tryResolveMechanic(resolveNeutralized, config);
export const tryResolveSelfEating = (config: unknown) => tryResolveMechanic(resolveSelfEating, config);
export const tryResolveClarified = (config: unknown) => tryResolveMechanic(resolveClarified, config);
export const tryResolveEmptied = (config: unknown) => tryResolveMechanic(resolveEmptied, config);
export const tryResolveHardened = (config: unknown) => tryResolveMechanic(resolveHardened, config);
export const tryResolveKnot = (config: unknown) => tryResolveMechanic(resolveKnot, config);
