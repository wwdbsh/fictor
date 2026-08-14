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

export type MechanicConfigFailure =
  | "INVALID_CONFIG"
  | "INVALID_CHARGE_TURNS"
  | "INVALID_EXPLOSION_POWER"
  | "INVALID_SHIELD";

export class MechanicConfigError extends Error {
  readonly reason: MechanicConfigFailure;

  constructor(mechanic: "PRESSED_FIRE" | "TOTAL_STOP", reason: MechanicConfigFailure) {
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
