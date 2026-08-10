import type { CardStats, ForgeLaw, ForgeMaterial, ForgeTuning } from "./types";

export interface DerivedStats {
  balance_status: "PENDING_2026_08_21" | "APPROVED";
  stats: CardStats;
}

export function deriveStats(
  actor: ForgeMaterial,
  receptor: ForgeMaterial,
  law: ForgeLaw,
  tuning: ForgeTuning | undefined,
  sameAttribute: boolean,
): DerivedStats {
  const approved =
    actor.balance_status === "APPROVED" &&
    receptor.balance_status === "APPROVED" &&
    law.balance_status === "APPROVED" &&
    actor.potency !== null &&
    receptor.potency !== null &&
    actor.cost_base !== null &&
    receptor.cost_base !== null &&
    law.power_coefficient !== null &&
    Number.isFinite(actor.potency) &&
    Number.isFinite(receptor.potency) &&
    Number.isFinite(law.power_coefficient) &&
    tuning !== undefined &&
    Number.isFinite(tuning.SAME_BONUS) &&
    Number.isFinite(tuning.COST_DIVISOR) &&
    tuning.COST_DIVISOR > 0;

  if (!approved) {
    return {
      balance_status: "PENDING_2026_08_21",
      stats: { potency: null, cost: null, power: null },
    };
  }

  const potency = actor.potency! + receptor.potency! + (sameAttribute ? tuning.SAME_BONUS : 0);
  return {
    balance_status: "APPROVED",
    stats: {
      potency,
      cost: Math.ceil(potency / tuning.COST_DIVISOR),
      power: potency * law.power_coefficient!,
    },
  };
}
