import { freeze } from "../../freeze";
import type { ForgeTuning } from "../forge";

export const SAME_BONUS = 1 as const;
export const COST_DIVISOR = 3 as const;
export const RESONANCE_RATE = 0.08 as const;

export const FORGE_TUNING: ForgeTuning = freeze({
  SAME_BONUS,
  COST_DIVISOR,
});
