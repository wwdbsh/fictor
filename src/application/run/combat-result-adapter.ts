import { decodeCombatState } from "../../domain/combat";
import { decodeForgeRuntimeState } from "../../domain/forge-runtime";
import type { RunFlowCommandV1 } from "./types";

export function adaptTerminalCombatToRunCommand(
  rawCombatState: unknown,
  rawRuntimeAfterCleanup: unknown,
): Extract<RunFlowCommandV1, { type: "RESOLVE_COMBAT" }> | null {
  const combat = decodeCombatState(rawCombatState);
  const runtime = decodeForgeRuntimeState(rawRuntimeAfterCleanup);
  if (!combat.valid || !runtime.valid || combat.value.status === "ONGOING" || combat.value.phase !== "TERMINAL") return null;
  if (runtime.value.run.activeCombat !== null) return null;
  return {
    type: "RESOLVE_COMBAT",
    result: combat.value.status,
    cleanupCompleted: true,
  };
}
