import type {
  AtomicOperation,
  CombatEvent,
  CombatState,
  CombatTarget,
  OperationTarget,
} from "./types";

const SAFE_MAGNITUDE = Number.MAX_SAFE_INTEGER;

export type OperationFailure = "CALCULATION_OVERFLOW" | "INVALID_EFFECT_PROGRAM";

export type OperationResult =
  | { ok: true }
  | { ok: false; reason: OperationFailure };

function safe(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= SAFE_MAGNITUDE;
}

function resolveTarget(
  target: OperationTarget,
  selectedTarget: CombatTarget | null,
): CombatTarget | null {
  return target.kind === "SELECTED" ? selectedTarget : target;
}

type AmountResolution =
  | { ok: true; amount: number }
  | { ok: false; reason: OperationFailure };

function resolveAmount(
  operation: AtomicOperation,
  effectivePower: number | null,
): AmountResolution {
  const expression = operation.amount as unknown as { kind?: unknown; amount?: unknown; multiplier?: unknown };
  if (expression.kind === "FIXED") {
    return typeof expression.amount === "number" && safe(expression.amount) && expression.amount >= 0
      ? { ok: true, amount: expression.amount }
      : { ok: false, reason: "INVALID_EFFECT_PROGRAM" };
  }
  if (expression.kind !== "EFFECT_POWER" || effectivePower === null) {
    return { ok: false, reason: "INVALID_EFFECT_PROGRAM" };
  }
  if (typeof expression.multiplier !== "number" || !safe(expression.multiplier) || expression.multiplier < 0) {
    return { ok: false, reason: "INVALID_EFFECT_PROGRAM" };
  }
  const amount = effectivePower * expression.multiplier;
  return safe(amount) && amount >= 0
    ? { ok: true, amount }
    : { ok: false, reason: "CALCULATION_OVERFLOW" };
}

function applyDamage(state: CombatState, target: CombatTarget, amount: number): OperationResult {
  const combatant = target.kind === "PLAYER" ? state.player : state.enemy;
  const absorbed = Math.min(combatant.block, amount);
  const remainingBlock = combatant.block - absorbed;
  const hpDamage = amount - absorbed;
  const remainingHp = Math.max(0, combatant.hp - hpDamage);
  if (![absorbed, remainingBlock, hpDamage, remainingHp].every(safe)) {
    return { ok: false, reason: "CALCULATION_OVERFLOW" };
  }
  combatant.block = remainingBlock;
  combatant.hp = remainingHp;
  return { ok: true };
}

function applyBlock(state: CombatState, target: CombatTarget, amount: number): OperationResult {
  const combatant = target.kind === "PLAYER" ? state.player : state.enemy;
  const block = combatant.block + amount;
  if (!safe(block)) return { ok: false, reason: "CALCULATION_OVERFLOW" };
  combatant.block = block;
  return { ok: true };
}

function applyHeal(state: CombatState, target: CombatTarget, amount: number): OperationResult {
  const combatant = target.kind === "PLAYER" ? state.player : state.enemy;
  const sum = combatant.hp + amount;
  if (!safe(sum)) return { ok: false, reason: "CALCULATION_OVERFLOW" };
  combatant.hp = Math.min(combatant.maxHp, sum);
  return { ok: true };
}

export function applyOperations(
  state: CombatState,
  operations: readonly AtomicOperation[],
  context: {
    source: "CARD" | "ENEMY_INTENT";
    selectedTarget: CombatTarget | null;
    effectivePower: number | null;
  },
  events: CombatEvent[],
): OperationResult {
  for (const operation of operations) {
    const target = resolveTarget(operation.target, context.selectedTarget);
    const amountResult = resolveAmount(operation, context.effectivePower);
    if (!amountResult.ok) return amountResult;
    const amount = amountResult.amount;
    if (target === null) {
      return { ok: false, reason: "INVALID_EFFECT_PROGRAM" };
    }
    if (target.kind === "ENEMY" && target.enemyId !== state.enemy.enemyId) {
      return { ok: false, reason: "INVALID_EFFECT_PROGRAM" };
    }

    const result =
      operation.kind === "DAMAGE"
        ? applyDamage(state, target, amount)
        : operation.kind === "GAIN_BLOCK"
          ? applyBlock(state, target, amount)
          : operation.kind === "HEAL"
            ? applyHeal(state, target, amount)
            : { ok: false as const, reason: "INVALID_EFFECT_PROGRAM" as const };
    if (!result.ok) return result;
    events.push({
      type: "OPERATION_APPLIED",
      source: context.source,
      operation: operation.kind,
      target: target.kind === "PLAYER" ? { kind: "PLAYER" } : { kind: "ENEMY", enemyId: target.enemyId },
      amount,
    });
  }
  return { ok: true };
}
