import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { beforeAll, describe, expect, test } from "vitest";

import {
  T020_CORE_PLAN_PATH, T020_CORE_PLAN_SHA256, T020_MASTER_STYLE_SHA256, T020_NO_COPY_BOUNDARY, T020_REFERENCE_INSTRUCTION,
  T020_V1_ASSET_COUNT, T020_V1_BACKGROUND_ASSET_COUNT, T020_V1_BATCH_COUNT, T020_V1_BATCH_MAX, T020_V1_BATCH_SIZES,
  T020_V1_CANARY_BATCH_ID, T020_V1_CANARY_BLOCKED_BATCH_ID, T020_V1_ENEMY_ASSET_COUNT, T020_V1_EXACT_APPROVAL_PHRASE,
  T020_V1_EXPECTED_MODEL, T020_V1_ID_LIST_SHA256, T020_V1_JOURNAL_PATH, T020_V1_LOSS_ACKNOWLEDGMENT_PHRASE,
  T020_V1_RECOVERY_OPERATOR_PHRASE, T020_V1_RESUME_OPERATOR_PHRASE, T020_V1_RISK_TEXT, T020_V1_TOTAL_CAP_UNITS,
  T020_V1_UNIT_COST_UNITS, buildT020Assets, buildT020Batches, buildT020Plan, canonicalJsonT020, crossCheckT020EffectivePrompts,
  decimalT020, parseT020BalanceFile, renderT020CanonicalJson, renderT020Plan, sha256T020, t020PlanSha256,
  type T020Approval, type T020Plan, type T020Presentation,
} from "../../scripts/assets/t020-world-art-production-v1";
import {
  acquireT020Lock, auditT020, buildInitialT020Journal, downloadT020, isPublicT020ResolvedAddress, runT020JobsHandoffInternal,
  runT020OpsInternal, statusT020, t020CanaryVerified, t020GetCostRequest, t020LostAssets, transportPeerMatchesT020Pin,
  validateT020Journal, type T020Dependencies, type T020Journal,
} from "../../scripts/assets/t020-world-art-production-v1-ops";
import { dryRunT020 } from "../../scripts/assets/t020-world-art-production-v1-cli";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const EPOCH = Date.parse("2026-08-14T00:00:00.000Z");
const presentation = { evidence_version: "t020-test-presentation" } as unknown as T020Presentation;
const approval = { evidence_version: "t020-test-approval" } as unknown as T020Approval;
const START_UNITS = 20_000;

function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer): Buffer { const name = Buffer.from(type); const result = Buffer.alloc(12 + data.length); result.writeUInt32BE(data.length, 0); name.copy(result, 4); data.copy(result, 8); result.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length); return result; }
function png(width: number, height: number, fill = 0): Buffer {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const rowBytes = width * 3; const pixels = Buffer.alloc(height * (1 + rowBytes), fill);
  for (let row = 0; row < height; row += 1) pixels[row * (1 + rowBytes)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}
/** Distinct bytes per asset so no-clobber and cross-batch hash collisions stay visible. */
function pngFor(aspect: string, fill: number): Buffer { return aspect === "16:9" ? png(16, 9, fill) : png(3, 4, fill); }
function at(seconds: number): string { return new Date(EPOCH + seconds * 1000).toISOString(); }
function json(root: string, name: string, value: unknown): string { writeFileSync(resolve(root, name), `${JSON.stringify(value)}\n`); return name; }
function summaryOf(statuses: readonly string[]) { const active = ["pending", "waiting", "queued", "in_progress", "ip_detect"]; const failed = ["failed", "canceled", "nsfw", "ip_detected"]; return { active: statuses.filter((status) => active.includes(status)).length, completed: statuses.filter((status) => status === "completed").length, errors: statuses.filter((status) => status === "lookup_failed").length, failed: statuses.filter((status) => failed.includes(status)).length, total: statuses.length }; }

let cachedPlan: T020Plan;
beforeAll(() => { cachedPlan = buildT020Plan(repositoryRoot); });

interface Prepared { root: string; plan: T020Plan }
function fixture(startUnits = START_UNITS): Prepared {
  const root = mkdtempSync(resolve(tmpdir(), "fictor-t020-"));
  mkdirSync(resolve(root, "assets/manifests"), { recursive: true });
  copyFileSync(resolve(repositoryRoot, T020_CORE_PLAN_PATH), resolve(root, T020_CORE_PLAN_PATH));
  const anchor = json(root, "initial-balance.json", { credits: startUnits / 100, provider_observed_at: at(-120) });
  runT020OpsInternal(["init", "--observed-at", at(-60), "--balance-file", anchor], root, cachedPlan, presentation, approval);
  return { root, plan: cachedPlan };
}
function ops(prepared: Prepared, args: readonly string[]): Record<string, unknown> { return runT020OpsInternal(args, prepared.root, prepared.plan, presentation, approval); }
function journalOf(prepared: Prepared): T020Journal { return JSON.parse(readFileSync(resolve(prepared.root, T020_V1_JOURNAL_PATH), "utf8")) as T020Journal; }
function batchAssets(plan: T020Plan, batchIndex: number) { return plan.batches[batchIndex].asset_ids.map((id) => plan.assets.find((asset) => asset.id === id)!); }
function costItems(plan: T020Plan, batchIndex: number, base: number) { return batchAssets(plan, batchIndex).map((asset, offset) => ({ index: asset.index, request_sha256: sha256T020(canonicalJsonT020(t020GetCostRequest(asset.request))), cost: { credits: 1, credits_exact: 1.5 }, provider_observed_at: at(base + 1 + offset) })); }
function jobId(plan: T020Plan, batchIndex: number, offset: number, salt = ""): string { return `${plan.batches[batchIndex].id}-job${salt}-${String(offset).padStart(2, "0")}`; }
function submissionResponse(plan: T020Plan, batchIndex: number, salt = "") { const assets = batchAssets(plan, batchIndex); return { submitted_count: assets.length, failed_count: 0, jobs: assets.map((asset, offset) => ({ index: asset.index, job_id: jobId(plan, batchIndex, offset, salt), status: "queued" })) }; }
function waitResponse(plan: T020Plan, batchIndex: number, statuses?: readonly string[], model: string = T020_V1_EXPECTED_MODEL, salt = "") {
  const assets = batchAssets(plan, batchIndex);
  const resolved = statuses ?? assets.map(() => "completed");
  return {
    all_terminal: true,
    jobs: assets.map((asset, offset) => {
      const status = resolved[offset];
      const job: Record<string, unknown> = { index: asset.index, job_id: jobId(plan, batchIndex, offset, salt), status, type: "image" };
      if (status === "completed") { job.model = model; job.result_url = `https://d111111abcdef8.cloudfront.net/${asset.index}.png`; }
      if (status === "lookup_failed") job.retryable = false;
      return job;
    }),
    summary: summaryOf(resolved),
  };
}
/** One fetch per asset index, so each recovered file gets its own bytes at the batch aspect. */
function deps(plan: T020Plan, batchIndex: number): T020Dependencies {
  const aspect = plan.batches[batchIndex].aspect_ratio;
  let call = 0;
  return { resolve: async () => [{ address: "18.65.3.2", family: 4 }], fetch: async () => ({ status: 200, headers: { "content-type": "image/png" }, bytes: pngFor(aspect, (batchIndex * 16 + call++) % 251), remoteAddress: "::ffff:18.65.3.2" }) };
}
function preflight(prepared: Prepared, batchIndex: number, beforeUnits: number, base: number): void {
  const id = prepared.plan.batches[batchIndex].id;
  ops(prepared, ["preflight-request", "--batch", id, "--observed-at", at(base)]);
  const size = prepared.plan.batches[batchIndex].size;
  const cost = json(prepared.root, `cost-${batchIndex}.json`, { costs: costItems(prepared.plan, batchIndex, base) });
  const balance = json(prepared.root, `balance-${batchIndex}.json`, { credits: beforeUnits / 100, provider_observed_at: at(base + size + 1) });
  ops(prepared, ["preflight-result", "--batch", id, "--observed-at", at(base + size + 2), "--cost-file", cost, "--balance-file", balance]);
}
function submitting(prepared: Prepared, batchIndex: number, beforeUnits: number, base: number): void {
  preflight(prepared, batchIndex, beforeUnits, base);
  const id = prepared.plan.batches[batchIndex].id;
  ops(prepared, ["prepare", "--batch", id, "--observed-at", at(base + 40)]);
}
/** Full happy path for one batch; returns the post-batch balance in integer units. */
async function runBatch(prepared: Prepared, batchIndex: number, beforeUnits: number, base: number): Promise<number> {
  const plan = prepared.plan;
  const id = plan.batches[batchIndex].id;
  submitting(prepared, batchIndex, beforeUnits, base);
  const response = json(prepared.root, `submit-${batchIndex}.json`, submissionResponse(plan, batchIndex));
  ops(prepared, ["response", "--batch", id, "--observed-at", at(base + 41), "--file", response]);
  ops(prepared, ["recovery-open", "--batch", id, "--observed-at", at(base + 42), "--operator-phrase", T020_V1_RECOVERY_OPERATOR_PHRASE]);
  await runT020JobsHandoffInternal(["jobs-handoff", "--batch", id, "--observed-at", at(base + 43)], JSON.stringify(waitResponse(plan, batchIndex)), prepared.root, plan, presentation, approval, deps(plan, batchIndex));
  const afterUnits = beforeUnits - plan.batches[batchIndex].size * T020_V1_UNIT_COST_UNITS;
  const after = json(prepared.root, `after-${batchIndex}.json`, { credits: afterUnits / 100 });
  ops(prepared, ["balance-after", "--batch", id, "--observed-at", at(base + 44), "--file", after]);
  return afterUnits;
}

/* ------------------------------------------------------------------------ */

describe("T020 manifest discovery and selection", () => {
  test("the pinned core manifest still holds exactly 18 BACKGROUND, 30 ENEMY, and 6 ELITE assets", () => {
    const core = JSON.parse(readFileSync(resolve(repositoryRoot, T020_CORE_PLAN_PATH), "utf8")) as { assets: Array<{ category: string; aspect_ratio: string; path: string }> };
    expect(sha256T020(readFileSync(resolve(repositoryRoot, T020_CORE_PLAN_PATH)))).toBe(T020_CORE_PLAN_SHA256);
    const counts = core.assets.reduce<Record<string, number>>((acc, { category }) => ({ ...acc, [category]: (acc[category] ?? 0) + 1 }), {});
    expect(counts.BACKGROUND).toBe(18);
    expect(counts.ENEMY).toBe(30);
    expect(counts.ELITE).toBe(6);
    expect(core.assets.filter(({ category }) => category === "BACKGROUND").every(({ aspect_ratio, path }) => aspect_ratio === "16:9" && path.startsWith("backgrounds/"))).toBe(true);
    expect(core.assets.filter(({ category }) => ["ENEMY", "ELITE"].includes(category)).every(({ aspect_ratio, path }) => aspect_ratio === "3:4" && path.startsWith("enemies/"))).toBe(true);
  });

  test("selection is exactly 54 distinct world assets pinned by an id-list hash", () => {
    const assets = buildT020Assets(repositoryRoot);
    expect(assets).toHaveLength(T020_V1_ASSET_COUNT);
    expect(new Set(assets.map(({ id }) => id)).size).toBe(T020_V1_ASSET_COUNT);
    expect(new Set(assets.map(({ path }) => path)).size).toBe(T020_V1_ASSET_COUNT);
    expect(sha256T020(`${assets.map(({ id }) => id).join("\n")}\n`)).toBe(T020_V1_ID_LIST_SHA256);
    expect(assets.filter(({ group }) => group === "ENEMY")).toHaveLength(T020_V1_ENEMY_ASSET_COUNT);
    expect(assets.filter(({ group }) => group === "BACKGROUND")).toHaveLength(T020_V1_BACKGROUND_ASSET_COUNT);
    expect(assets.filter(({ aspect_ratio }) => aspect_ratio === "3:4")).toHaveLength(36);
    expect(assets.filter(({ aspect_ratio }) => aspect_ratio === "16:9")).toHaveLength(18);
  });

  test("out-of-scope categories never enter the plan", () => {
    expect(cachedPlan.assets.some(({ category }) => ["EVENT", "HEART", "HEART_FORGE", "MATERIAL", "CANONICAL"].includes(category))).toBe(false);
    expect(cachedPlan.scope.event_art_allowed).toBe(false);
    expect(cachedPlan.scope.boss_world_art_allowed).toBe(false);
  });

  test("every request carries its own manifest aspect, use_unlim false, and the master reference", () => {
    for (const asset of cachedPlan.assets) {
      expect(asset.request.params.aspect_ratio).toBe(asset.aspect_ratio);
      expect(asset.request.params.use_unlim).toBe(false);
      expect(asset.request.params.count).toBe(1);
      expect(asset.request.params.resolution).toBe("1k");
      expect(asset.request.params.medias).toEqual([{ role: "image", value: "e0f36c95-2e1b-4e38-9931-7e10e562f209" }]);
      expect(asset.request.params.prompt).toBe(asset.effective_prompt);
      expect(asset.effective_prompt.startsWith(asset.core_prompt)).toBe(true);
      expect(asset.effective_prompt).toContain(T020_REFERENCE_INSTRUCTION);
      expect(asset.effective_prompt).toContain(T020_NO_COPY_BOUNDARY);
      expect(asset.canonical_request_sha256).toBe(sha256T020(canonicalJsonT020(asset.request)));
    }
    expect(crossCheckT020EffectivePrompts(repositoryRoot, cachedPlan, [0, 35, 36, 53])).toBe(4);
  });

  test("the master-style manifest is still the pinned MEDIA_ONLY reference", () => {
    expect(sha256T020(readFileSync(resolve(repositoryRoot, "assets/manifests/master-style-v1.json")))).toBe(T020_MASTER_STYLE_SHA256);
    expect(cachedPlan.reference_binding.lock_scope).toBe("MEDIA_ONLY");
    expect(cachedPlan.reference_binding.reference_instruction).toBe(T020_REFERENCE_INSTRUCTION);
  });
});

describe("T020 plan determinism", () => {
  test("the same pinned inputs always derive the same plan bytes and sha", () => {
    const first = buildT020Plan(repositoryRoot);
    const second = buildT020Plan(repositoryRoot);
    expect(renderT020Plan(first)).toBe(renderT020Plan(second));
    expect(t020PlanSha256(first)).toBe(t020PlanSha256(second));
  });

  test("the tracked plan file is byte-identical to the freshly derived plan", () => {
    expect(readFileSync(resolve(repositoryRoot, "assets/manifests/t020-world-art-v1.plan.json"), "utf8")).toBe(renderT020Plan(cachedPlan));
  });

  test("derivation reads no clock and no randomness", () => {
    const source = readFileSync(resolve(repositoryRoot, "scripts/assets/t020-world-art-production-v1.ts"), "utf8");
    // `new Date()` survives only as the injectable `now` default on the approval-chronology
    // helpers, which are never called during plan derivation.
    expect(source).not.toMatch(/Date\.now\(\)/);
    expect(source).not.toMatch(/Math\.random\(\)/);
    expect(renderT020Plan(cachedPlan)).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test("a plan built against a mutated core manifest is refused", () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t020-tamper-"));
    mkdirSync(resolve(root, "assets/manifests"), { recursive: true });
    const core = JSON.parse(readFileSync(resolve(repositoryRoot, T020_CORE_PLAN_PATH), "utf8")) as { assets: unknown[] };
    core.assets = core.assets.slice(0, -1);
    writeFileSync(resolve(root, T020_CORE_PLAN_PATH), `${JSON.stringify(core, null, 2)}\n`);
    expect(() => buildT020Assets(root)).toThrow(/pinned source changed/);
  });
});

describe("T020 batch partitioning", () => {
  test("five batches of [12,12,12,12,6] covering all 54 assets", () => {
    expect(cachedPlan.batches).toHaveLength(T020_V1_BATCH_COUNT);
    expect(cachedPlan.batches.map(({ size }) => size)).toEqual([...T020_V1_BATCH_SIZES]);
    expect(cachedPlan.batches.reduce((sum, { size }) => sum + size, 0)).toBe(T020_V1_ASSET_COUNT);
    expect(cachedPlan.batches.every(({ size }) => size >= 1 && size <= T020_V1_BATCH_MAX)).toBe(true);
    expect(cachedPlan.batches.every((batch) => batch.asset_ids.length === batch.size)).toBe(true);
  });

  test("the partition is a partition: no asset is dropped or duplicated", () => {
    const ids = cachedPlan.batches.flatMap(({ asset_ids }) => asset_ids);
    expect(ids).toHaveLength(T020_V1_ASSET_COUNT);
    expect(new Set(ids).size).toBe(T020_V1_ASSET_COUNT);
    expect(new Set(ids)).toEqual(new Set(cachedPlan.assets.map(({ id }) => id)));
  });

  test("every batch is aspect-homogeneous", () => {
    const aspects = new Map(cachedPlan.assets.map((asset) => [asset.id, asset.aspect_ratio]));
    for (const batch of cachedPlan.batches) {
      expect(new Set(batch.asset_ids.map((id) => aspects.get(id)))).toEqual(new Set([batch.aspect_ratio]));
    }
    expect(cachedPlan.batches.map(({ aspect_ratio }) => aspect_ratio)).toEqual(["3:4", "3:4", "3:4", "16:9", "16:9"]);
  });

  test("batch 1 is the canary and batch 2 is the batch it gates", () => {
    expect(cachedPlan.batches[0].id).toBe(T020_V1_CANARY_BATCH_ID);
    expect(cachedPlan.batches[1].id).toBe(T020_V1_CANARY_BLOCKED_BATCH_ID);
    expect(cachedPlan.model_canary.expected_provider_reported_model).toBe(T020_V1_EXPECTED_MODEL);
  });

  test("a partitioner fed a group that no longer divides into the approved sizes fails loudly", () => {
    expect(() => buildT020Batches(cachedPlan.assets.slice(0, 40))).toThrow(/batch sizes changed|batch partition/);
  });
});

describe("T020 cap math", () => {
  test("54 requests at 1.50 each is exactly the 81.00 cap", () => {
    expect(T020_V1_ASSET_COUNT * T020_V1_UNIT_COST_UNITS).toBe(T020_V1_TOTAL_CAP_UNITS);
    expect(T020_V1_TOTAL_CAP_UNITS).toBe(8_100);
    expect(decimalT020(T020_V1_TOTAL_CAP_UNITS)).toBe("81.00");
    expect(decimalT020(T020_V1_UNIT_COST_UNITS)).toBe("1.50");
  });

  test("the plan budget has no legacy committed component", () => {
    expect(cachedPlan.budget.legacy_committed_units).toBe(0);
    expect(cachedPlan.budget.total_credit_cap_units).toBe(T020_V1_TOTAL_CAP_UNITS);
    expect(cachedPlan.budget.paid_request_count).toBe(T020_V1_ASSET_COUNT);
    expect(cachedPlan.budget.automatic_paid_retry_reserve_decimal).toBe("0.00");
    expect(cachedPlan.budget.billing_uses_credits_exact_only).toBe(true);
  });

  test("integer unit conversion is exact and rejects ambiguous provider credits", () => {
    expect(decimalT020(0)).toBe("0.00");
    expect(decimalT020(1_800)).toBe("18.00");
    expect(decimalT020(900)).toBe("9.00");
    expect(() => parseT020BalanceFile({ credits: 1.005, provider_observed_at: "2026-08-14T00:00:00.000Z" })).toThrow(/ambiguous/);
    expect(parseT020BalanceFile({ credits: 200, provider_observed_at: "2026-08-14T00:00:00.000Z" }).credits).toBe(200);
  });

  test("init refuses a balance that does not cover the whole cap", () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t020-poor-"));
    mkdirSync(resolve(root, "assets/manifests"), { recursive: true });
    const anchor = json(root, "initial-balance.json", { credits: 80.99, provider_observed_at: at(-120) });
    expect(() => runT020OpsInternal(["init", "--observed-at", at(-60), "--balance-file", anchor], root, cachedPlan, presentation, approval)).toThrow(/does not cover the 81.00 cap/);
  });
});

describe("T020 phrase binding", () => {
  test("the main approval phrase is bound byte-exactly", () => {
    expect(T020_V1_EXACT_APPROVAL_PHRASE).toBe("T020 세계 아트 54장 생성을 승인한다. 한도 81.00 크레딧.");
    expect(cachedPlan.approval_gate.exact_phrase).toBe(T020_V1_EXACT_APPROVAL_PHRASE);
    expect(cachedPlan.approval_gate.status).toBe("MISSING_NOT_AUTHORIZED");
    expect(cachedPlan.approval_gate.prior_task_approval_inherited).toBe(false);
  });

  test("the four phrases are distinct and the risk text quotes the ones it gates on", () => {
    const phrases = [T020_V1_EXACT_APPROVAL_PHRASE, T020_V1_RECOVERY_OPERATOR_PHRASE, T020_V1_RESUME_OPERATOR_PHRASE, T020_V1_LOSS_ACKNOWLEDGMENT_PHRASE];
    expect(new Set(phrases).size).toBe(4);
    expect(T020_V1_RISK_TEXT).toContain(T020_V1_EXACT_APPROVAL_PHRASE);
    expect(T020_V1_RISK_TEXT).toContain(T020_V1_LOSS_ACKNOWLEDGMENT_PHRASE);
    // The unvalidated 16:9 aspect is disclosed, not buried.
    expect(T020_V1_RISK_TEXT).toContain("16:9");
    expect(T020_V1_RISK_TEXT).toContain("81.00");
  });

  test("recovery, resume, and loss-acknowledgment refuse a near-miss phrase", async () => {
    const prepared = fixture();
    const id = prepared.plan.batches[0].id;
    submitting(prepared, 0, START_UNITS, 0);
    const response = json(prepared.root, "submit.json", submissionResponse(prepared.plan, 0));
    ops(prepared, ["response", "--batch", id, "--observed-at", at(41), "--file", response]);
    expect(() => ops(prepared, ["recovery-open", "--batch", id, "--observed-at", at(42), "--operator-phrase", `${T020_V1_RECOVERY_OPERATOR_PHRASE} `])).toThrow(/exact phrase/);
    expect(() => ops(prepared, ["resume", "--observed-at", at(42), "--operator-phrase", "T020 재개"])).toThrow(/exact operator phrase/);
    expect(() => ops(prepared, ["acknowledge-loss", "--batch", id, "--observed-at", at(42), "--operator-phrase", "T020 손실", "--balance-file", "initial-balance.json"])).toThrow(/exact operator phrase/);
  });
});

describe("T020 jobs_wait topology and retryable validation", () => {
  async function openRecovery(prepared: Prepared, base = 0): Promise<string> {
    const id = prepared.plan.batches[0].id;
    submitting(prepared, 0, START_UNITS, base);
    const response = json(prepared.root, "submit.json", submissionResponse(prepared.plan, 0));
    ops(prepared, ["response", "--batch", id, "--observed-at", at(base + 41), "--file", response]);
    ops(prepared, ["recovery-open", "--batch", id, "--observed-at", at(base + 42), "--operator-phrase", T020_V1_RECOVERY_OPERATOR_PHRASE]);
    return id;
  }
  async function handoff(prepared: Prepared, id: string, payload: unknown, seconds = 43): Promise<Record<string, unknown>> {
    return runT020JobsHandoffInternal(["jobs-handoff", "--batch", id, "--observed-at", at(seconds)], JSON.stringify(payload), prepared.root, prepared.plan, presentation, approval, deps(prepared.plan, 0));
  }

  test("a non-completed job may carry model and result_url; they are type-checked and never downloaded", async () => {
    const prepared = fixture();
    const id = await openRecovery(prepared);
    const payload = waitResponse(prepared.plan, 0, batchAssets(prepared.plan, 0).map((_, offset) => (offset === 0 ? "failed" : "completed")));
    // The live provider decorates the failed job with a model and a stale URL.
    (payload.jobs[0] as Record<string, unknown>).model = T020_V1_EXPECTED_MODEL;
    await expect(handoff(prepared, id, payload)).rejects.toThrow(/GENERATION_FAILED/);
    const record = journalOf(prepared).batches[0];
    // Everything that did complete was still recovered before the fail-stop.
    expect(record.recoveries).toHaveLength(prepared.plan.batches[0].size - 1);
    expect(record.job_polls.at(-1)!.jobs[0].download_available).toBe(false);
  });

  test("a completed job missing model or result_url is a topology failure, not a download", async () => {
    const prepared = fixture();
    const id = await openRecovery(prepared);
    const payload = waitResponse(prepared.plan, 0);
    delete (payload.jobs[0] as Record<string, unknown>).result_url;
    await expect(handoff(prepared, id, payload)).rejects.toThrow(/RECOVERY_FAILED/);
    expect(journalOf(prepared).batches[0].recoveries).toHaveLength(0);
  });

  test("retryable must be present and boolean exactly when status is lookup_failed", async () => {
    const missing = fixture();
    const missingId = await openRecovery(missing);
    const missingPayload = waitResponse(missing.plan, 0, batchAssets(missing.plan, 0).map((_, offset) => (offset === 0 ? "lookup_failed" : "completed")));
    delete (missingPayload.jobs[0] as Record<string, unknown>).retryable;
    await expect(handoff(missing, missingId, missingPayload)).rejects.toThrow(/RECOVERY_FAILED/);

    const stray = fixture();
    const strayId = await openRecovery(stray);
    const strayPayload = waitResponse(stray.plan, 0);
    (strayPayload.jobs[0] as Record<string, unknown>).retryable = true;
    await expect(handoff(stray, strayId, strayPayload)).rejects.toThrow(/RECOVERY_FAILED/);

    const wrongType = fixture();
    const wrongTypeId = await openRecovery(wrongType);
    const wrongTypePayload = waitResponse(wrongType.plan, 0, batchAssets(wrongType.plan, 0).map((_, offset) => (offset === 0 ? "lookup_failed" : "completed")));
    (wrongTypePayload.jobs[0] as Record<string, unknown>).retryable = "yes";
    await expect(handoff(wrongType, wrongTypeId, wrongTypePayload)).rejects.toThrow(/RECOVERY_FAILED/);
  });

  test("a retryable lookup_failed re-polls the same jobs and never resubmits", async () => {
    const prepared = fixture();
    const id = await openRecovery(prepared);
    const payload = waitResponse(prepared.plan, 0, batchAssets(prepared.plan, 0).map((_, offset) => (offset === 0 ? "lookup_failed" : "completed")));
    (payload.jobs[0] as Record<string, unknown>).retryable = true;
    const result = await handoff(prepared, id, payload);
    expect(result.repoll_same_jobs_only).toBe(true);
    expect(result.new_paid_submit).toBe(false);
    expect(journalOf(prepared).run_state).toBe("ACTIVE");
  });

  test("a summary that disagrees with the derived counts fail-stops", async () => {
    const prepared = fixture();
    const id = await openRecovery(prepared);
    const payload = waitResponse(prepared.plan, 0);
    payload.summary = { ...payload.summary, completed: payload.summary.completed - 1, active: 1 };
    await expect(handoff(prepared, id, payload)).rejects.toThrow(/UNKNOWN_PROVIDER_FIELD/);
  });

  test("model drift on the canary batch fail-stops and blocks the next batch", async () => {
    const prepared = fixture();
    const id = await openRecovery(prepared);
    await expect(handoff(prepared, id, waitResponse(prepared.plan, 0, undefined, "some_other_model"))).rejects.toThrow(/MODEL_DRIFT/);
    expect(t020CanaryVerified(journalOf(prepared))).toBe(false);
    expect(journalOf(prepared).run_state).toBe("FAIL_STOP");
    // Even after the operator discharges the drifted batch and resumes, batch 2 stays shut:
    // the canary gate is independent of the fail-stop gate.
    const lostUnits = prepared.plan.batches[0].size * T020_V1_UNIT_COST_UNITS;
    const after = json(prepared.root, "loss-balance.json", { credits: (START_UNITS - lostUnits) / 100, provider_observed_at: at(44) });
    ops(prepared, ["acknowledge-loss", "--batch", id, "--observed-at", at(45), "--operator-phrase", T020_V1_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", after]);
    ops(prepared, ["resume", "--observed-at", at(46), "--operator-phrase", T020_V1_RESUME_OPERATOR_PHRASE]);
    expect(journalOf(prepared).run_state).toBe("ACTIVE");
    expect(() => ops(prepared, ["preflight-request", "--batch", T020_V1_CANARY_BLOCKED_BATCH_ID, "--observed-at", at(50)])).toThrow(/blocked until/);
  });

  test("an unknown optional field on a submitted job fail-stops the batch", () => {
    const prepared = fixture();
    const id = prepared.plan.batches[0].id;
    submitting(prepared, 0, START_UNITS, 0);
    const payload = submissionResponse(prepared.plan, 0) as { jobs: Array<Record<string, unknown>> };
    payload.jobs[0].warning = "slow queue";
    const file = json(prepared.root, "submit.json", payload);
    expect(() => ops(prepared, ["response", "--batch", id, "--observed-at", at(41), "--file", file])).toThrow(/PROVIDER_RESPONSE_SIGNAL/);
    // The definite job IDs survive so a no-new-spend recovery is still possible.
    expect(journalOf(prepared).batches[0].submission!.jobs).toHaveLength(prepared.plan.batches[0].size);
  });
});

describe("T020 paid discipline", () => {
  test("a batch is submitted exactly once and never resubmitted after an ambiguous window", () => {
    const prepared = fixture();
    const id = prepared.plan.batches[0].id;
    submitting(prepared, 0, START_UNITS, 0);
    expect(() => ops(prepared, ["ambiguous", "--batch", id, "--observed-at", at(41), "--reason", "TIMEOUT"])).toThrow(/AMBIGUOUS_SUBMISSION/);
    const journal = journalOf(prepared);
    expect(journal.run_state).toBe("FAIL_STOP");
    expect(journal.fail_stop_batch_id).toBe(id);
    expect(statusT020(journal).batches).toMatchObject([{ batch_id: id, rerunnable: false, discharge_possible: "LOSS_ACKNOWLEDGMENT" }, {}, {}, {}, {}]);
    // A fail-stopped run is shut until an operator resumes it...
    expect(() => ops(prepared, ["reset", "--batch", id, "--observed-at", at(42)])).toThrow(/run is not ACTIVE/);
    const lostUnits = prepared.plan.batches[0].size * T020_V1_UNIT_COST_UNITS;
    const after = json(prepared.root, "loss-balance.json", { credits: (START_UNITS - lostUnits) / 100, provider_observed_at: at(42) });
    ops(prepared, ["acknowledge-loss", "--batch", id, "--observed-at", at(43), "--operator-phrase", T020_V1_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", after]);
    ops(prepared, ["resume", "--observed-at", at(44), "--operator-phrase", T020_V1_RESUME_OPERATOR_PHRASE]);
    // ...and once it reopens, the batch whose paid envelope escaped is still never re-run.
    expect(() => ops(prepared, ["reset", "--batch", id, "--observed-at", at(45)])).toThrow(/never reopened/);
  });

  test("SUBMITTING is durable before the paid envelope is handed out", () => {
    const prepared = fixture();
    const id = prepared.plan.batches[0].id;
    preflight(prepared, 0, START_UNITS, 0);
    expect(journalOf(prepared).batches[0].state).toBe("PREFLIGHT_VERIFIED");
    const envelope = ops(prepared, ["prepare", "--batch", id, "--observed-at", at(40)]) as { requests: unknown[]; aspect_ratio: string };
    expect(envelope.requests).toHaveLength(prepared.plan.batches[0].size);
    expect(envelope.aspect_ratio).toBe("3:4");
    expect(journalOf(prepared).batches[0].state).toBe("SUBMITTING");
  });

  test("a zero-spend preflight failure may be reset and re-run at no cost", () => {
    const prepared = fixture();
    const id = prepared.plan.batches[0].id;
    preflight(prepared, 0, START_UNITS, 0);
    const reset = ops(prepared, ["reset", "--batch", id, "--observed-at", at(60)]);
    expect(reset).toMatchObject({ state: "PLANNED", zero_spend: true });
    preflight(prepared, 0, START_UNITS, 100);
    expect(journalOf(prepared).batches[0].state).toBe("PREFLIGHT_VERIFIED");
  });

  test("a display credit of 1.00 never substitutes for the exact 1.50 unit price", () => {
    const prepared = fixture();
    const id = prepared.plan.batches[0].id;
    ops(prepared, ["preflight-request", "--batch", id, "--observed-at", at(0)]);
    const items = costItems(prepared.plan, 0, 0).map((item) => ({ ...item, cost: { credits: 1, credits_exact: 1 } }));
    const cost = json(prepared.root, "cost.json", { costs: items });
    const balance = json(prepared.root, "balance.json", { credits: START_UNITS / 100, provider_observed_at: at(20) });
    expect(() => ops(prepared, ["preflight-result", "--batch", id, "--observed-at", at(21), "--cost-file", cost, "--balance-file", balance])).toThrow(/PRICE_CHANGED/);
  });

  test("batches must progress strictly in order", () => {
    const prepared = fixture();
    expect(() => ops(prepared, ["preflight-request", "--batch", prepared.plan.batches[2].id, "--observed-at", at(0)])).toThrow(/exactly in order|blocked until/);
  });

  test("a preflight balance that no longer covers the remaining batches fail-stops", () => {
    const prepared = fixture();
    const id = prepared.plan.batches[0].id;
    ops(prepared, ["preflight-request", "--batch", id, "--observed-at", at(0)]);
    const cost = json(prepared.root, "cost.json", { costs: costItems(prepared.plan, 0, 0) });
    const balance = json(prepared.root, "balance.json", { credits: 50, provider_observed_at: at(20) });
    expect(() => ops(prepared, ["preflight-result", "--batch", id, "--observed-at", at(21), "--cost-file", cost, "--balance-file", balance])).toThrow(/BALANCE_CHANGED/);
  });
});

describe("T020 loss discharge and operator-gated resume", () => {
  test("an ambiguous batch is discharged by the exact loss phrase and the loss is deducted from the cap", async () => {
    const prepared = fixture();
    const id = prepared.plan.batches[0].id;
    submitting(prepared, 0, START_UNITS, 0);
    expect(() => ops(prepared, ["ambiguous", "--batch", id, "--observed-at", at(41), "--reason", "TIMEOUT"])).toThrow(/AMBIGUOUS_SUBMISSION/);
    const lostUnits = prepared.plan.batches[0].size * T020_V1_UNIT_COST_UNITS;
    const after = json(prepared.root, "loss-balance.json", { credits: (START_UNITS - lostUnits) / 100, provider_observed_at: at(42) });
    const discharge = ops(prepared, ["acknowledge-loss", "--batch", id, "--observed-at", at(43), "--operator-phrase", T020_V1_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", after]);
    expect(discharge).toMatchObject({ acknowledged_loss_decimal: decimalT020(lostUnits), resubmitted: false, regenerated: false });
    const resumed = ops(prepared, ["resume", "--observed-at", at(44), "--operator-phrase", T020_V1_RESUME_OPERATOR_PHRASE]);
    expect(resumed).toMatchObject({ run_state: "ACTIVE", disposition: "DISCHARGED_LOSS", resubmitted: false, rerunnable: false });
    // The discharged batch is never reopened, and the loss is visible in the ledger.
    expect(() => ops(prepared, ["preflight-request", "--batch", id, "--observed-at", at(45)])).toThrow(/never reopened/);
    // An ambiguous submission leaves no enumerable job IDs, so the per-asset ledger is
    // necessarily empty: the money is provably gone but the images cannot even be named.
    expect(t020LostAssets(journalOf(prepared))).toEqual([]);
    const status = statusT020(journalOf(prepared));
    expect(status.acknowledged_loss_decimal).toBe(decimalT020(lostUnits));
    expect(status.total_delta_decimal).toBe(decimalT020(lostUnits));
    expect(status.full_run_completion_reachable).toBe(false);
  });

  test("a batch is discharged at most once", () => {
    const prepared = fixture();
    const id = prepared.plan.batches[0].id;
    submitting(prepared, 0, START_UNITS, 0);
    expect(() => ops(prepared, ["ambiguous", "--batch", id, "--observed-at", at(41), "--reason", "TIMEOUT"])).toThrow(/AMBIGUOUS_SUBMISSION/);
    const lostUnits = prepared.plan.batches[0].size * T020_V1_UNIT_COST_UNITS;
    const after = json(prepared.root, "loss-balance.json", { credits: (START_UNITS - lostUnits) / 100, provider_observed_at: at(42) });
    ops(prepared, ["acknowledge-loss", "--batch", id, "--observed-at", at(43), "--operator-phrase", T020_V1_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", after]);
    expect(() => ops(prepared, ["acknowledge-loss", "--batch", id, "--observed-at", at(44), "--operator-phrase", T020_V1_LOSS_ACKNOWLEDGMENT_PHRASE, "--balance-file", after])).toThrow(/discharged exactly once/);
  });

  test("resume is refused while a confirmed job is unrecovered and undischarged", () => {
    const prepared = fixture();
    const id = prepared.plan.batches[0].id;
    submitting(prepared, 0, START_UNITS, 0);
    const payload = submissionResponse(prepared.plan, 0) as { jobs: Array<Record<string, unknown>>; submitted_count: number; failed_count: number };
    payload.jobs.pop();
    payload.submitted_count = payload.jobs.length;
    const file = json(prepared.root, "submit.json", payload);
    expect(() => ops(prepared, ["response", "--batch", id, "--observed-at", at(41), "--file", file])).toThrow(/PARTIAL_OR_MISMATCHED_BATCH_RESPONSE/);
    expect(() => ops(prepared, ["resume", "--observed-at", at(42), "--operator-phrase", T020_V1_RESUME_OPERATOR_PHRASE])).toThrow(/unrecovered and undischarged/);
  });
});

describe("T020 no-clobber dual save", () => {
  test("both roots hold byte-identical PNGs at the per-asset aspect", async () => {
    const prepared = fixture();
    await runBatch(prepared, 0, START_UNITS, 0);
    const record = journalOf(prepared).batches[0];
    expect(record.state).toBe("COMPLETE");
    expect(record.recoveries).toHaveLength(prepared.plan.batches[0].size);
    for (const recovery of record.recoveries) {
      expect(recovery.aspect_ratio).toBe("3:4");
      const local = readFileSync(resolve(prepared.root, "public/assets", recovery.local_relative_path));
      const backup = readFileSync(resolve(prepared.root, "assets/backups/t020-world-art", recovery.backup_relative_path));
      expect(sha256T020(local)).toBe(recovery.sha256);
      expect(sha256T020(backup)).toBe(recovery.sha256);
      expect(recovery.local_relative_path.startsWith("enemies/")).toBe(true);
    }
  });

  test("a 3:4 PNG delivered for a 16:9 background is refused and never stored", async () => {
    const prepared = fixture();
    let previous = START_UNITS;
    for (let index = 0; index < 3; index += 1) previous = await runBatch(prepared, index, previous, index * 1000);
    const id = prepared.plan.batches[3].id;
    submitting(prepared, 3, previous, 4000);
    const response = json(prepared.root, "submit-3.json", submissionResponse(prepared.plan, 3));
    ops(prepared, ["response", "--batch", id, "--observed-at", at(4041), "--file", response]);
    ops(prepared, ["recovery-open", "--batch", id, "--observed-at", at(4042), "--operator-phrase", T020_V1_RECOVERY_OPERATOR_PHRASE]);
    const wrongAspect: T020Dependencies = { resolve: async () => [{ address: "18.65.3.2", family: 4 }], fetch: async () => ({ status: 200, headers: { "content-type": "image/png" }, bytes: png(3, 4, 99), remoteAddress: "::ffff:18.65.3.2" }) };
    await expect(runT020JobsHandoffInternal(["jobs-handoff", "--batch", id, "--observed-at", at(4043)], JSON.stringify(waitResponse(prepared.plan, 3)), prepared.root, prepared.plan, presentation, approval, wrongAspect)).rejects.toThrow(/RECOVERY_FAILED/);
    const terminal = journalOf(prepared).batches[3].terminals.at(-1)!;
    expect(terminal.facts).toMatchObject({ reason: "PNG_DIMENSION_MISMATCH", expected_aspect_ratio: "16:9" });
    expect(journalOf(prepared).batches[3].recoveries).toHaveLength(0);
  });
});

describe("T020 journal durability", () => {
  test("the journal is canonical, redacted, and rejects a tampered cap", () => {
    const prepared = fixture();
    const bytes = readFileSync(resolve(prepared.root, T020_V1_JOURNAL_PATH), "utf8");
    const journal = JSON.parse(bytes) as T020Journal;
    expect(bytes).toBe(renderT020CanonicalJson(journal));
    expect(bytes).not.toMatch(/https?:\/\//);
    expect(journal.total_credit_cap_units).toBe(T020_V1_TOTAL_CAP_UNITS);
    expect(journal.paid_retry_count).toBe(0);
    const tampered = { ...journal, total_credit_cap_units: 9_000 } as unknown as T020Journal;
    expect(() => validateT020Journal(tampered, prepared.plan, presentation, approval)).toThrow(/journal header changed/);
  });

  test("a journal claiming a batch returned to PLANNED after SUBMITTING is rejected", () => {
    const journal = buildInitialT020Journal(cachedPlan, presentation, approval, { credits: 200, normalized_decimal: "200.00", provider_observed_at: at(0) });
    journal.batches[0].transitions = [{ state: "PREFLIGHT_REQUESTED", observed_at: at(1) }, { state: "PREFLIGHT_VERIFIED", observed_at: at(2) }, { state: "SUBMITTING", observed_at: at(3) }, { state: "FAIL_STOP", observed_at: at(4) }, { state: "PLANNED", observed_at: at(5) }];
    expect(() => validateT020Journal(journal, cachedPlan, presentation, approval)).toThrow(/paid envelope escaped can never be reset/);
  });

  test("a journal whose batch aspect disagrees with the plan is rejected", () => {
    const journal = buildInitialT020Journal(cachedPlan, presentation, approval, { credits: 200, normalized_decimal: "200.00", provider_observed_at: at(0) });
    journal.batches[0].aspect_ratio = "16:9";
    expect(() => validateT020Journal(journal, cachedPlan, presentation, approval)).toThrow(/batch binding changed/);
  });

  test("the runner lock is exclusive", () => {
    const prepared = fixture();
    const lock = acquireT020Lock(prepared.root);
    try { expect(() => acquireT020Lock(prepared.root)).toThrow(/RUNNER_LOCKED/); } finally { lock.release(); }
    acquireT020Lock(prepared.root).release();
  });
});

describe("T020 secure download", () => {
  test("private, loopback, and IPv4-mapped resolutions are refused", () => {
    expect(isPublicT020ResolvedAddress({ address: "18.65.3.2", family: 4 })).toBe(true);
    expect(isPublicT020ResolvedAddress({ address: "127.0.0.1", family: 4 })).toBe(false);
    expect(isPublicT020ResolvedAddress({ address: "10.1.2.3", family: 4 })).toBe(false);
    expect(isPublicT020ResolvedAddress({ address: "169.254.169.254", family: 4 })).toBe(false);
    expect(isPublicT020ResolvedAddress({ address: "::ffff:18.65.3.2", family: 6 })).toBe(false);
  });

  test("an IPv4-mapped peer still matches its pinned IPv4 address", () => {
    expect(transportPeerMatchesT020Pin("::ffff:18.65.3.2", { address: "18.65.3.2", family: 4 })).toBe(true);
    expect(transportPeerMatchesT020Pin("18.65.3.3", { address: "18.65.3.2", family: 4 })).toBe(false);
    // A peer lost to socket detachment reads as empty and can never satisfy the pin.
    expect(transportPeerMatchesT020Pin("", { address: "18.65.3.2", family: 4 })).toBe(false);
  });

  test("a non-PNG content type and a peer mismatch both fail the download", async () => {
    const bytes = png(3, 4);
    await expect(downloadT020("https://example.test/a.png", { resolve: async () => [{ address: "18.65.3.2", family: 4 }], fetch: async () => ({ status: 200, headers: { "content-type": "text/html" }, bytes, remoteAddress: "18.65.3.2" }) })).rejects.toThrow(/DOWNLOAD_FAILED/);
    await expect(downloadT020("https://example.test/a.png", { resolve: async () => [{ address: "18.65.3.2", family: 4 }], fetch: async () => ({ status: 200, headers: { "content-type": "image/png" }, bytes, remoteAddress: "18.65.3.9" }) })).rejects.toThrow(/DOWNLOAD_FAILED/);
    await expect(downloadT020("http://example.test/a.png", { resolve: async () => [{ address: "18.65.3.2", family: 4 }], fetch: async () => ({ status: 200, headers: { "content-type": "image/png" }, bytes, remoteAddress: "18.65.3.2" }) })).rejects.toThrow(/DOWNLOAD_FAILED/);
  });
});

describe("T020 full run and audit", () => {
  test("all five batches close at exactly 81.00 with 54 assets in both roots", async () => {
    const prepared = fixture();
    let balance = START_UNITS;
    for (let index = 0; index < T020_V1_BATCH_COUNT; index += 1) balance = await runBatch(prepared, index, balance, index * 1000);
    expect(balance).toBe(START_UNITS - T020_V1_TOTAL_CAP_UNITS);
    const journal = journalOf(prepared);
    expect(journal.run_state).toBe("COMPLETE");
    expect(t020CanaryVerified(journal)).toBe(true);
    const status = statusT020(journal);
    expect(status).toMatchObject({ recovered_assets: T020_V1_ASSET_COUNT, remaining_assets: 0, total_delta_units: T020_V1_TOTAL_CAP_UNITS, acknowledged_loss_units: 0, paid_retry_count: 0 });
    const audit = auditT020({ root: prepared.root, plan: prepared.plan, presentation, approval }, journal, at(9_000));
    expect(audit).toMatchObject({
      run_state: "COMPLETE", exact_closure: true, assets_recovered: T020_V1_ASSET_COUNT, assets_lost: 0,
      total_delta_units: T020_V1_TOTAL_CAP_UNITS, closes_at_exact_cap: true, acknowledged_loss_units: 0,
      all_assets_delivered: true, boss_world_art_generated: false, event_art_generated: false,
      out_of_scope_backup_paths_absent: true, contact_segments: T020_V1_BATCH_COUNT, paid_retry_count: 0,
    });
    expect(audit.recovered_by_aspect_ratio).toEqual({ "3:4": T020_V1_ENEMY_ASSET_COUNT, "16:9": T020_V1_BACKGROUND_ASSET_COUNT });
    expect(audit.out_of_scope_checked_count).toBe(1_494 - T020_V1_ASSET_COUNT);
  }, 120_000);

  test("audit refuses to close a run that is still active with nothing discharged", () => {
    const prepared = fixture();
    expect(() => auditT020({ root: prepared.root, plan: prepared.plan, presentation, approval }, journalOf(prepared), at(10))).toThrow(/audit requires every batch settled/);
  });
});

describe("T020 preparation CLI", () => {
  test("dry-run derives the whole plan without submitting or writing anything", () => {
    const result = dryRunT020(repositoryRoot);
    expect(result).toMatchObject({
      submitted_anything: false, wrote_anything: false, asset_count: T020_V1_ASSET_COUNT, batch_count: T020_V1_BATCH_COUNT,
      total_credit_cap_units: T020_V1_TOTAL_CAP_UNITS, planned_spend_units: T020_V1_TOTAL_CAP_UNITS,
      batches_are_aspect_homogeneous: true, canary_batch_id: T020_V1_CANARY_BATCH_ID,
      disclosure_chain_status: "pending approval", authorized: false,
    });
    expect(result.plan_sha256).toBe(t020PlanSha256(cachedPlan));
    expect(result.asset_ids).toHaveLength(T020_V1_ASSET_COUNT);
    expect(result.batch_sizes).toEqual([...T020_V1_BATCH_SIZES]);
    expect(result.aspect_ratio_counts).toEqual({ "3:4": 36, "16:9": 18 });
  });

  test("the implementation binding pins the runtime files and never package.json", () => {
    const files = cachedPlan.sources.implementation_binding.files as Record<string, { path: string; sha256: string }>;
    const paths = Object.values(files).map(({ path }) => path);
    expect(paths).toContain("scripts/assets/t020-world-art-production-v1-controller.ts");
    expect(paths).toContain("scripts/assets/t020-world-art-production-v1-ops.ts");
    expect(paths).toContain("scripts/assets/t020-world-art-production-v1-cli.ts");
    expect(paths).toContain("scripts/assets/t020-world-art-production-v1.ts");
    expect(paths).not.toContain("package.json");
    expect(paths).not.toContain("package-lock.json");
    // Every T020 path is its own namespace; nothing reuses a T015 artifact path.
    expect(paths.some((path) => path.includes("canonical-shard-1"))).toBe(false);
    for (const [key, entry] of Object.entries(files)) expect(entry.sha256, key).toBe(sha256T020(readFileSync(resolve(repositoryRoot, entry.path))));
  });

  test("no T020 artifact path collides with a T015 path", () => {
    const paths = [cachedPlan.approval_gate.approval_path, cachedPlan.approval_gate.disclosure_presentation_path, cachedPlan.approval_gate.pending_disclosure_packet_path, cachedPlan.recovery_policy.backup_root, T020_V1_JOURNAL_PATH];
    for (const path of paths) { expect(path).toContain("t020"); expect(path).not.toContain("t015"); }
  });
});
