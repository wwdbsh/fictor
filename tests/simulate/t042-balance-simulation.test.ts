import { describe, expect, it } from "vitest";

import {
  CONSERVATIVE_ALTERNATIVE,
  RECOMMENDED_TUNING,
  createReport,
  materialProposals,
  simulateCatalog,
} from "../../scripts/simulate/t042-balance-simulation";
import laws from "../../src/data/source/laws.json";
import materials from "../../src/data/source/materials.json";

describe("T042 deterministic balance research", () => {
  it("records three executable runs and labels the other fifteen routes structural-only", () => {
    const report = createReport();
    expect(report.runtime_runs).toHaveLength(3);
    expect(report.runtime_runs.every((run) => run.terminalPhase === "RUN_WON")).toBe(true);
    expect(report.runtime_runs.every((run) => run.encounters.length === 3)).toBe(true);
    expect(report.runtime_runs.map((run) => run.instantForges)).toEqual([2, 2, 3]);
    expect(report.coverage).toHaveLength(18);
    expect(report.coverage.filter(({ evidenceKind }) => evidenceKind === "RUNTIME_AUTOPLAY")).toHaveLength(3);
    expect(report.coverage.filter(({ evidenceKind }) => evidenceKind === "STRUCTURAL_ONLY")).toHaveLength(15);
  });

  it("keeps every proposal inside the approved field allowlist without mutating sources", () => {
    const report = createReport();
    expect(Object.keys(report.proposals.recommended.tuning).sort()).toEqual([
      "COST_DIVISOR", "RESONANCE_RATE", "SAME_BONUS", "powerCoefficientByEffect", "status",
    ]);
    expect(Object.keys(report.proposals.conservative.tuning).sort()).toEqual([
      "COST_DIVISOR", "RESONANCE_RATE", "SAME_BONUS", "status",
    ]);
    expect(report.proposals.conservative.derivation).toEqual({ powerCoefficientScale: 0.85 });
    expect(report.proposals.recommended.laws).toHaveLength(21);
    expect(report.proposals.recommended.materials).toHaveLength(52);
    expect(report.proposals.recommended.materials.every(({ potency, cost_base }) => potency >= 1 && potency <= 3 && cost_base >= 0 && cost_base <= 2)).toBe(true);
    expect(materials.every(({ balance_status, potency, cost_base }) => balance_status === "PENDING_2026_08_21" && potency === null && cost_base === null)).toBe(true);
    expect(laws.every(({ balance_status, power_coefficient }) => balance_status === "PENDING_2026_08_21" && power_coefficient === null)).toBe(true);
  });

  it("recalculates the 1,281 non-equipment cards and representative stress envelopes", () => {
    const recommended = simulateCatalog("RECOMMENDED");
    const conservative = simulateCatalog("CONSERVATIVE");
    expect(recommended.cardCount).toBe(1_281);
    expect(conservative.cardCount).toBe(1_281);
    expect(recommended.sameAttributeCount).toBeGreaterThan(0);
    expect(recommended.extremeSame.count).toBe(recommended.sameAttributeCount);
    expect(recommended.extremeSame.lowest).toHaveLength(6);
    expect(recommended.extremeSame.highest).toHaveLength(6);
    expect(recommended.potency.max).toBeLessThanOrEqual(7);
    expect(Object.keys(recommended.costDistribution).map(Number)).toEqual([1, 2, 3]);
    expect(Object.keys(conservative.costDistribution).map(Number)).toEqual([1, 2, 3]);
    expect(RECOMMENDED_TUNING.RESONANCE_RATE).toBeGreaterThan(CONSERVATIVE_ALTERNATIVE.RESONANCE_RATE);
    expect(recommended.power.max).toBeGreaterThan(conservative.power.max);
  });

  it("is deterministic for identical inputs", () => {
    expect(createReport()).toEqual(createReport());
    expect(materialProposals("RECOMMENDED")).toEqual(materialProposals("RECOMMENDED"));
  });
});
