export const DISCOVERY_PHASE_DURATIONS_MS = Object.freeze({
  BURNING: 900,
  REVEALING: 1_200,
  PRINTING: 900,
}) as Readonly<Record<Exclude<DiscoveryPhase, "FINAL">, number>>;

export type DiscoveryPhase = "BURNING" | "REVEALING" | "PRINTING" | "FINAL";

export function discoveryPhaseAt(elapsedMs: number): DiscoveryPhase {
  const elapsed = Math.max(0, elapsedMs);
  if (elapsed < 900) return "BURNING";
  if (elapsed < 2_100) return "REVEALING";
  if (elapsed < 3_000) return "PRINTING";
  return "FINAL";
}

export function discoveryPhaseDeadlineMs(phase: DiscoveryPhase): number | null {
  if (phase === "BURNING") return 900;
  if (phase === "REVEALING") return 2_100;
  if (phase === "PRINTING") return 3_000;
  return null;
}

export function nextDiscoveryPhase(phase: DiscoveryPhase): DiscoveryPhase {
  if (phase === "BURNING") return "REVEALING";
  if (phase === "REVEALING") return "PRINTING";
  return "FINAL";
}
