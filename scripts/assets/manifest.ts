import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { calculateSourceHash } from "../../src/data/generator/render-generated";
import type { Law, Material, ResultClass } from "../../src/data/schema/contracts";
import { deriveAllAssets, type CanonicalCardInput } from "./derived-content";
import { ASSET_PLAN_VERSION, type AssetCategory, type AssetPlanManifest, type PlannedAsset, type PlannedBatch } from "./types";

interface GeneratedCardsEnvelope {
  source_hash: string;
  content_hash: string;
  count: number;
  items: CanonicalCardInput[];
}

function sha256Bytes(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function readJson<T>(path: string): { value: T; bytes: string } {
  const bytes = readFileSync(path, "utf8");
  return { value: JSON.parse(bytes) as T, bytes };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export function createInitialBatches(assets: readonly PlannedAsset[]): PlannedBatch[] {
  const materialAssets = assets.filter(({ category }) => category === "MATERIAL");
  const remainingAssets = assets.filter(({ category }) => category !== "MATERIAL");
  const groups = [
    ...chunk(materialAssets, 12).map((items) => ({ phase: "MATERIAL_APPROVAL" as const, items })),
    ...chunk(remainingAssets, 12).map((items) => ({ phase: "CORE_AFTER_APPROVAL" as const, items })),
  ];
  return groups.map(({ phase, items }, index) => ({
    id: `initial-${String(index + 1).padStart(3, "0")}`,
    phase,
    asset_ids: items.map(({ id }) => id),
    retry_of: null,
  }));
}

export function validatePlanManifest(plan: AssetPlanManifest): void {
  const expectedByCategory: Record<AssetCategory, number> = {
    MATERIAL: 52,
    CANONICAL: 1326,
    HEART: 6,
    HEART_FORGE: 36,
    BACKGROUND: 18,
    ENEMY: 30,
    ELITE: 6,
    EVENT: 20,
  };
  if (plan.schema_version !== 1 || plan.plan_version !== ASSET_PLAN_VERSION) throw new Error("invalid plan schema");
  if (plan.model !== "nano_banana_2" || plan.use_unlim !== false) throw new Error("unsafe provider configuration");
  if (plan.counts.total !== 1494 || plan.counts.cards !== 1420 || plan.counts.world !== 74 || plan.counts.boss_duplicates !== 0) {
    throw new Error("invalid approved plan totals");
  }
  if (plan.approval_gate.after_asset_count !== 52 || plan.approval_gate.after_batch_id !== "initial-005" || plan.approval_gate.requires_human_approval !== true) {
    throw new Error("invalid material approval gate");
  }
  if (plan.batching.provider_limit !== 12 || plan.batching.material_gate_batches !== 5 || plan.batching.retry_batches_included !== false) {
    throw new Error("invalid batching contract");
  }
  if (plan.budget.unit_cost_decimal !== "0.12" || plan.budget.total_cost_decimal !== "179.28") {
    throw new Error("invalid approved budget");
  }
  for (const hash of Object.values(plan.source_hashes)) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("invalid source hash");
  }
  if (plan.assets.length !== 1494) throw new Error(`asset count must be 1494, got ${plan.assets.length}`);
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const item of plan.assets) {
    if (ids.has(item.id)) throw new Error(`duplicate asset id: ${item.id}`);
    if (paths.has(item.path)) throw new Error(`duplicate asset path: ${item.path}`);
    ids.add(item.id);
    paths.add(item.path);
    if (!/^(cards|backgrounds|enemies|events)\/[a-z][a-z0-9_]*\.png$/.test(item.path)) throw new Error(`unsafe asset path: ${item.path}`);
    if (!item.prompt || item.prompt.includes("\0") || item.prompt_inputs.paper === undefined) throw new Error(`invalid prompt for ${item.id}`);
    const expectedAspect = item.category === "BACKGROUND" ? "16:9" : "3:4";
    if (item.aspect_ratio !== expectedAspect) throw new Error(`wrong aspect for ${item.id}`);
    if ((item.category === "MATERIAL" || item.category === "CANONICAL") && item.source_art !== item.path) {
      throw new Error(`source art mismatch for ${item.id}`);
    }
  }
  for (const [category, expected] of Object.entries(expectedByCategory)) {
    const actual = plan.assets.filter((item) => item.category === category).length;
    if (actual !== expected || plan.counts.by_category[category as AssetCategory] !== expected) {
      throw new Error(`${category} count must be ${expected}, got ${actual}`);
    }
  }
  if (plan.assets.some(({ id }) => id.startsWith("boss__"))) throw new Error("boss art must reuse heart art");
  if (plan.batches.length !== 126) throw new Error(`initial batch count must be 126, got ${plan.batches.length}`);
  plan.batches.forEach((batch, index) => {
    const expectedId = `initial-${String(index + 1).padStart(3, "0")}`;
    const expectedPhase = index < 5 ? "MATERIAL_APPROVAL" : "CORE_AFTER_APPROVAL";
    if (batch.id !== expectedId || batch.phase !== expectedPhase) throw new Error(`invalid batch order or phase: ${batch.id}`);
  });
  const batchedIds = plan.batches.flatMap(({ asset_ids }) => asset_ids);
  if (batchedIds.length !== 1494 || new Set(batchedIds).size !== 1494) throw new Error("batches must cover assets exactly once");
  for (const batch of plan.batches) {
    if (batch.asset_ids.length < 1 || batch.asset_ids.length > 12) throw new Error(`invalid batch size: ${batch.id}`);
    if (batch.retry_of !== null) throw new Error(`initial batch may not be a retry: ${batch.id}`);
  }
  const first52 = batchedIds.slice(0, 52);
  if (first52.some((id) => plan.assets.find((asset) => asset.id === id)?.category !== "MATERIAL")) {
    throw new Error("first 52 batched assets must be materials");
  }
  if (plan.batches[4]?.id !== "initial-005" || plan.batches[4]?.asset_ids.length !== 4) {
    throw new Error("material approval gate must end at initial-005");
  }
  const assetOrder = plan.assets.map(({ id }) => id);
  if (batchedIds.some((id, index) => id !== assetOrder[index])) throw new Error("batch order must match asset order");
  if (plan.batches.slice(0, 5).some(({ phase }) => phase !== "MATERIAL_APPROVAL") ||
      plan.batches.slice(5).some(({ phase }) => phase !== "CORE_AFTER_APPROVAL")) {
    throw new Error("invalid approval batch phase");
  }
  if (plan.batching.theoretical_global_batches !== 125 || plan.batching.initial_plan_batches !== 126) {
    throw new Error("theoretical and gated batch counts must remain distinct");
  }
  if (plan.budget.total_cost_decimal !== "179.28") throw new Error("core budget must be decimal 179.28");
}

export function buildPlanManifest(repositoryRoot: string): AssetPlanManifest {
  const sourceRoot = resolve(repositoryRoot, "src/data/source");
  const generatedRoot = resolve(repositoryRoot, "src/data/generated");
  const materialsFile = readJson<Material[]>(resolve(sourceRoot, "materials.json"));
  const lawsFile = readJson<Law[]>(resolve(sourceRoot, "laws.json"));
  const classesFile = readJson<ResultClass[]>(resolve(sourceRoot, "resultClasses.json"));
  const cardsFile = readJson<GeneratedCardsEnvelope>(resolve(generatedRoot, "cards.generated.json"));
  const currentCanonicalSourceHash = calculateSourceHash([
    materialsFile.value,
    lawsFile.value,
    classesFile.value,
  ]);
  if (cardsFile.value.source_hash !== currentCanonicalSourceHash) {
    throw new Error("canonical cards source hash does not match current source data; run gen:data first");
  }
  if (cardsFile.value.count !== 1326 || cardsFile.value.items.length !== 1326) {
    throw new Error("canonical cards must contain exactly 1326 items");
  }
  const assets = deriveAllAssets(materialsFile.value, cardsFile.value.items, classesFile.value);
  const batches = createInitialBatches(assets);
  const byCategory = Object.fromEntries(
    ["MATERIAL", "CANONICAL", "HEART", "HEART_FORGE", "BACKGROUND", "ENEMY", "ELITE", "EVENT"].map(
      (category) => [category, assets.filter((asset) => asset.category === category).length],
    ),
  ) as Record<AssetCategory, number>;
  const plan: AssetPlanManifest = {
    schema_version: 1,
    plan_version: ASSET_PLAN_VERSION,
    model: "nano_banana_2",
    use_unlim: false,
    source_hashes: {
      materials: sha256Bytes(materialsFile.bytes),
      laws: sha256Bytes(lawsFile.bytes),
      result_classes: sha256Bytes(classesFile.bytes),
      canonical_cards: sha256Bytes(cardsFile.bytes),
    },
    counts: { total: 1494, cards: 1420, world: 74, by_category: byCategory, boss_duplicates: 0 },
    batching: {
      provider_limit: 12,
      theoretical_global_batches: 125,
      initial_plan_batches: 126,
      material_gate_batches: 5,
      retry_batches_included: false,
    },
    budget: { unit_cost_decimal: "0.12", total_cost_decimal: "179.28" },
    approval_gate: {
      after_asset_count: 52,
      after_batch_id: "initial-005",
      requires_human_approval: true,
    },
    assets,
    batches,
  };
  validatePlanManifest(plan);
  return plan;
}

export function renderPlanManifest(plan: AssetPlanManifest): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

export function planSha256(plan: AssetPlanManifest): string {
  return sha256Bytes(renderPlanManifest(plan));
}
