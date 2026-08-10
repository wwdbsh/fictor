import type { SourceData } from "./validate-source-data";

export interface SourceReadiness {
  t004CatalogStructure: "READY";
  rewardTables: "READY" | "BLOCKED_BY_PENDING_RARITY";
  combatBalance: "READY" | "BLOCKED_BY_PENDING_BALANCE";
  artManifest: "READY" | "BLOCKED_BY_UNRESOLVED_RESULT_DENSITY";
}

export function inspectSourceReadiness(source: SourceData): SourceReadiness {
  const pendingRarity = source.materials.some((material) => material.rarity_status !== "APPROVED");
  const pendingBalance =
    source.materials.some((material) => material.balance_status !== "APPROVED") ||
    source.laws.some((law) => law.balance_status !== "APPROVED");
  const unresolvedResultDensity = source.resultClasses.some(
    (resultClass) => !["APPROVED", "DERIVED_FROM_MATERIAL"].includes(resultClass.density_status),
  );

  return {
    t004CatalogStructure: "READY",
    rewardTables: pendingRarity ? "BLOCKED_BY_PENDING_RARITY" : "READY",
    combatBalance: pendingBalance ? "BLOCKED_BY_PENDING_BALANCE" : "READY",
    artManifest: unresolvedResultDensity ? "BLOCKED_BY_UNRESOLVED_RESULT_DENSITY" : "READY",
  };
}
