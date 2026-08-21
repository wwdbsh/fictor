import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { createOwnedTempManager } from "../helpers/owned-temp";

import { buildPlanManifest, renderPlanManifest, validatePlanManifest } from "../../scripts/assets/manifest";
import { validateT044AssetPlanRebind } from "../../scripts/assets/cli";
import { paperToneForId } from "../../scripts/assets/prompt";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const tempManager = createOwnedTempManager("manifest");

describe("core asset plan", () => {
  test("is byte deterministic and preserves approved totals, paths, aspects, and gate packing", () => {
    const first = buildPlanManifest(repositoryRoot);
    const second = buildPlanManifest(repositoryRoot);
    expect(renderPlanManifest(first)).toBe(renderPlanManifest(second));
    expect(() => validatePlanManifest(first)).not.toThrow();
    expect(first.counts).toEqual({
      total: 1494,
      cards: 1420,
      world: 74,
      by_category: {
        MATERIAL: 52,
        CANONICAL: 1326,
        HEART: 6,
        HEART_FORGE: 36,
        BACKGROUND: 18,
        ENEMY: 30,
        ELITE: 6,
        EVENT: 20,
      },
      boss_duplicates: 0,
    });
    expect(new Set(first.assets.map(({ id }) => id)).size).toBe(1494);
    expect(new Set(first.assets.map(({ path }) => path)).size).toBe(1494);
    expect(first.assets.filter(({ aspect_ratio }) => aspect_ratio === "16:9")).toHaveLength(18);
    expect(first.assets.some(({ id }) => id.startsWith("boss__"))).toBe(false);
    expect(first.batches).toHaveLength(126);
    expect(first.batches.slice(0, 5).flatMap(({ asset_ids }) => asset_ids)).toHaveLength(52);
    expect(first.batches.every(({ asset_ids }) => asset_ids.length >= 1 && asset_ids.length <= 12)).toBe(true);
    expect(first.batching.theoretical_global_batches).toBe(125);
    expect(first.budget.total_cost_decimal).toBe("179.28");
  });

  test("uses unsigned big-endian SHA-256 prefix for paper selection", async () => {
    const { createHash } = await import("node:crypto");
    const id = "forge__burn_01__still_01";
    const expected = ["CREAM", "OCHRE", "SCORCHED_BROWN", "BLUE_GREY"][
      createHash("sha256").update(id, "utf8").digest().readUInt32BE(0) % 4
    ];
    expect(paperToneForId(id)).toBe(expected);
  });

  test("uses terrain-fixed paper for all 18 backgrounds", () => {
    const assetPlan = buildPlanManifest(repositoryRoot);
    const expected = {
      STILL: "BLUE_GREY",
      BURN: "SCORCHED_BROWN",
      SCATTER: "CREAM",
      ROT: "OCHRE",
      WASH: "CREAM",
      JOIN: "OCHRE",
    } as const;
    const backgrounds = assetPlan.assets.filter(({ category }) => category === "BACKGROUND");
    expect(backgrounds).toHaveLength(18);
    for (const background of backgrounds) {
      expect(background.prompt_inputs.paper).toBe(expected[background.prompt_inputs.attribute!]);
    }
  });

  test("changes its recorded source hash when source bytes change", () => {
    const temporaryRoot = tempManager.create("fictor-plan-");
    cpSync(resolve(repositoryRoot, "src/data/source"), resolve(temporaryRoot, "src/data/source"), { recursive: true });
    cpSync(resolve(repositoryRoot, "src/data/generated"), resolve(temporaryRoot, "src/data/generated"), { recursive: true });
    const before = buildPlanManifest(temporaryRoot);
    const path = resolve(temporaryRoot, "src/data/source/materials.json");
    writeFileSync(path, `${readFileSync(path, "utf8")}\n`, "utf8");
    const after = buildPlanManifest(temporaryRoot);
    expect(after.source_hashes.materials).not.toBe(before.source_hashes.materials);
    expect(after.source_hashes.canonical_cards).toBe(before.source_hashes.canonical_cards);
  });

  test("accepts only the pinned historical plan through the T044 balance source rebind", () => {
    const trackedBytes = readFileSync(resolve(repositoryRoot, "assets/manifests/core-v1.plan.json"), "utf8");
    const approvalBytes = readFileSync(
      resolve(repositoryRoot, "docs/balance/t043-approved-values-2026-08-21.json"),
      "utf8",
    );
    expect(validateT044AssetPlanRebind(trackedBytes, buildPlanManifest(repositoryRoot), approvalBytes)).toBe(
      "T044_BALANCE_REBIND",
    );
  });

  test("rejects tracked bytes, stable plan content, or current source hashes outside the pinned bridge", () => {
    const trackedBytes = readFileSync(resolve(repositoryRoot, "assets/manifests/core-v1.plan.json"), "utf8");
    const approvalBytes = readFileSync(
      resolve(repositoryRoot, "docs/balance/t043-approved-values-2026-08-21.json"),
      "utf8",
    );
    const current = buildPlanManifest(repositoryRoot);

    expect(() => validateT044AssetPlanRebind(`${trackedBytes} `, current, approvalBytes)).toThrow(
      /tracked asset plan bytes mismatch/,
    );

    const changedStablePlan = structuredClone(current);
    changedStablePlan.assets[0].prompt += " tampered";
    expect(() => validateT044AssetPlanRebind(trackedBytes, changedStablePlan, approvalBytes)).toThrow(
      /stable asset plan projection mismatch/,
    );

    const changedSource = structuredClone(current);
    changedSource.source_hashes.materials = "0".repeat(64);
    expect(() => validateT044AssetPlanRebind(trackedBytes, changedSource, approvalBytes)).toThrow(
      /current asset source hashes mismatch/,
    );
  });

  test("records catalyst density provenance without inventing a density enum", () => {
    const plan = buildPlanManifest(repositoryRoot);
    const catalyst = plan.assets.find(({ id }) => id === "forge__burn_01__tool_01");
    expect(catalyst?.prompt_inputs.density).toBe("DERIVED_FROM_MATERIAL(burn_01:SOLID)");
    expect(catalyst?.prompt_inputs.material_inputs).toEqual([
      { material_id: "burn_01", representation: "SOLID" },
    ]);
    expect(catalyst?.prompt).toContain("burn_01:SOLID");
  });
});
