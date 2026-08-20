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

export type MechanicConfigFailure =
  | "INVALID_CONFIG"
  | "INVALID_CHARGE_TURNS"
  | "INVALID_EXPLOSION_POWER"
  | "INVALID_SHIELD"
  | "INVALID_DAMAGE"
  | "INVALID_HP_COST"
  | "INVALID_POWER_GAIN"
  | "INVALID_MAX_TARGETS"
  | "INVALID_PHASE_TURNS";

export class MechanicConfigError extends Error {
  readonly reason: MechanicConfigFailure;

  constructor(
    mechanic: "PRESSED_FIRE" | "TOTAL_STOP" | "BLAST" | "BURNOUT" | "SPREADING" | "DISPERSAL",
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

export function tryResolvePressedFire(
  config: unknown,
):
  | { readonly ok: true; readonly evaluator: PressedFireEvaluator }
  | { readonly ok: false; readonly reason: MechanicConfigFailure } {
  try {
    return { ok: true, evaluator: resolvePressedFire(config) };
  } catch (error) {
    if (error instanceof MechanicConfigError) return { ok: false, reason: error.reason };
    throw error;
  }
}

export function tryResolveTotalStop(
  config: unknown,
):
  | { readonly ok: true; readonly evaluator: TotalStopEvaluator }
  | { readonly ok: false; readonly reason: MechanicConfigFailure } {
  try {
    return { ok: true, evaluator: resolveTotalStop(config) };
  } catch (error) {
    if (error instanceof MechanicConfigError) return { ok: false, reason: error.reason };
    throw error;
  }
}

export function tryResolveBlast(
  config: unknown,
):
  | { readonly ok: true; readonly evaluator: BlastEvaluator }
  | { readonly ok: false; readonly reason: MechanicConfigFailure } {
  try {
    return { ok: true, evaluator: resolveBlast(config) };
  } catch (error) {
    if (error instanceof MechanicConfigError) return { ok: false, reason: error.reason };
    throw error;
  }
}

export function tryResolveBurnout(
  config: unknown,
):
  | { readonly ok: true; readonly evaluator: BurnoutEvaluator }
  | { readonly ok: false; readonly reason: MechanicConfigFailure } {
  try {
    return { ok: true, evaluator: resolveBurnout(config) };
  } catch (error) {
    if (error instanceof MechanicConfigError) return { ok: false, reason: error.reason };
    throw error;
  }
}

export function tryResolveSpreading(
  config: unknown,
):
  | { readonly ok: true; readonly evaluator: SpreadingEvaluator }
  | { readonly ok: false; readonly reason: MechanicConfigFailure } {
  try {
    return { ok: true, evaluator: resolveSpreading(config) };
  } catch (error) {
    if (error instanceof MechanicConfigError) return { ok: false, reason: error.reason };
    throw error;
  }
}

export function tryResolveDispersal(
  config: unknown,
):
  | { readonly ok: true; readonly evaluator: DispersalEvaluator }
  | { readonly ok: false; readonly reason: MechanicConfigFailure } {
  try {
    return { ok: true, evaluator: resolveDispersal(config) };
  } catch (error) {
    if (error instanceof MechanicConfigError) return { ok: false, reason: error.reason };
    throw error;
  }
}
