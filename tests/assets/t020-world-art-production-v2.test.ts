import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { beforeAll, describe, expect, test } from "vitest";

import { T020_CORE_PLAN_PATH } from "../../scripts/assets/t020-world-art-production-v1";
import { t020GetCostRequest } from "../../scripts/assets/t020-world-art-production-v1-ops";
import {
  T020_V1_JOURNAL_FORENSIC_PATH, T020_V1_JOURNAL_FORENSIC_SHA256, T020_V2_ASPECT_TOLERANCE_PPM, T020_V2_BATCH_COUNT,
  T020_V2_BATCH_SIZES, T020_V2_CANARY_BATCH_ID, T020_V2_EXACT_APPROVAL_PHRASE, T020_V2_EXPECTED_MODEL, T020_V2_GRID_PX,
  T020_V2_JOURNAL_PATH, T020_V2_LEGACY_ASSET_COUNT, T020_V2_LEGACY_RECOVERY_PHRASE, T020_V2_PAID_ASSET_COUNT,
  T020_V2_RECOVERY_OPERATOR_PHRASE, T020_V2_RISK_TEXT, T020_V2_TOTAL_CAP_UNITS, T020_V2_UNIT_COST_UNITS, T020_V2_V1_SUNK_UNITS,
  buildT020V2Batches, buildT020V2PaidAssets, buildT020V2Plan, canonicalJsonT020, loadPinnedT020V1Journal, renderT020V2Plan, sha256T020,
  t020V2AspectTolerancePpm, t020V2PlanSha256, type T020V2Approval, type T020V2Plan, type T020V2Presentation,
} from "../../scripts/assets/t020-world-art-production-v2";
import {
  runT020V2JobsHandoffInternal, runT020V2LegacyHandoffInternal, runT020V2OpsInternal, statusT020V2, t020V2LegacyComplete,
  type T020V2Dependencies, type T020V2Journal,
} from "../../scripts/assets/t020-world-art-production-v2-ops";
import { dryRunT020V2 } from "../../scripts/assets/t020-world-art-production-v2-cli";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const EPOCH = Date.parse("2026-08-15T00:00:00.000Z");
const presentation = { evidence_version: "t020-v2-test-presentation" } as unknown as T020V2Presentation;
const approval = { evidence_version: "t020-v2-test-approval" } as unknown as T020V2Approval;
const START_UNITS = 35_490;

function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer): Buffer { const name = Buffer.from(type); const result = Buffer.alloc(12 + data.length); result.writeUInt32BE(data.length, 0); name.copy(result, 4); data.copy(result, 8); result.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length); return result; }
function png(width: number, height: number, fill = 0): Buffer {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const rowBytes = width * 3; const pixels = Buffer.alloc(height * (1 + rowBytes), fill);
  for (let row = 0; row < height; row += 1) pixels[row * (1 + rowBytes)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}
/** The provider's real batch-1 geometry: 32-px grid, 7813 ppm off true 16:9. */
function gridPng16x9(fill: number): Buffer { return png(172, 96, fill); }
function pngFor(aspect: string, fill: number): Buffer { return aspect === "16:9" ? gridPng16x9(fill) : png(3, 4, fill); }
function at(seconds: number): string { return new Date(EPOCH + seconds * 1000).toISOString(); }
function json(root: string, name: string, value: unknown): string { writeFileSync(resolve(root, name), `${JSON.stringify(value)}\n`); return name; }
function summaryOf(statuses: readonly string[]) { const active = ["pending", "waiting", "queued", "in_progress", "ip_detect"]; const failed = ["failed", "canceled", "nsfw", "ip_detected"]; return { active: statuses.filter((s) => active.includes(s)).length, completed: statuses.filter((s) => s === "completed").length, errors: statuses.filter((s) => s === "lookup_failed").length, failed: statuses.filter((s) => failed.includes(s)).length, total: statuses.length }; }

let cachedPlan: T020V2Plan;
beforeAll(() => { cachedPlan = buildT020V2Plan(repositoryRoot); });

interface Prepared { root: string; plan: T020V2Plan }
function fixture(startUnits = START_UNITS): Prepared {
  const root = mkdtempSync(resolve(tmpdir(), "fictor-t020v2-"));
  mkdirSync(resolve(root, "assets/manifests"), { recursive: true });
  copyFileSync(resolve(repositoryRoot, T020_CORE_PLAN_PATH), resolve(root, T020_CORE_PLAN_PATH));
  const anchor = json(root, "initial-balance.json", { credits: startUnits / 100, provider_observed_at: at(-120) });
  runT020V2OpsInternal(["init", "--observed-at", at(-60), "--balance-file", anchor], root, cachedPlan, presentation, approval);
  return { root, plan: cachedPlan };
}
function ops(p: Prepared, args: readonly string[]): Record<string, unknown> { return runT020V2OpsInternal(args, p.root, p.plan, presentation, approval); }
function journalOf(p: Prepared): T020V2Journal { return JSON.parse(readFileSync(resolve(p.root, T020_V2_JOURNAL_PATH), "utf8")) as T020V2Journal; }
function deps(bytesFor: (call: number) => Buffer): T020V2Dependencies {
  let call = 0;
  return { resolve: async () => [{ address: "18.65.3.2", family: 4 }], fetch: async () => ({ status: 200, headers: { "content-type": "image/png" }, bytes: bytesFor(call++), remoteAddress: "::ffff:18.65.3.2" }) };
}
function legacyWait(plan: T020V2Plan, statuses?: readonly string[], model: string = T020_V2_EXPECTED_MODEL) {
  const jobs = plan.legacy_recovery.jobs;
  const resolved = statuses ?? jobs.map(() => "completed");
  return {
    all_terminal: true,
    jobs: jobs.map((job, offset) => {
      const status = resolved[offset];
      const entry: Record<string, unknown> = { index: job.index, job_id: job.job_id, status, type: "image" };
      if (status === "completed") { entry.model = model; entry.result_url = `https://d111111abcdef8.cloudfront.net/${job.index}.png`; }
      if (status === "lookup_failed") entry.retryable = false;
      return entry;
    }),
    summary: summaryOf(resolved),
  };
}
async function recoverLegacy(p: Prepared, base = 0): Promise<Record<string, unknown>> {
  ops(p, ["legacy-open", "--observed-at", at(base), "--operator-phrase", T020_V2_LEGACY_RECOVERY_PHRASE]);
  return runT020V2LegacyHandoffInternal(["legacy-handoff", "--observed-at", at(base + 1)], JSON.stringify(legacyWait(p.plan)), p.root, p.plan, presentation, approval, deps((call) => gridPng16x9(call % 251)));
}

/* ------------------------------------------------------------------------ */

describe("T020 v2 tolerance", () => {
  test("3:4 keeps 5000 ppm and 16:9 widens to 12500", () => {
    expect(t020V2AspectTolerancePpm("3:4")).toBe(5_000);
    expect(t020V2AspectTolerancePpm("16:9")).toBe(12_500);
    expect(T020_V2_ASPECT_TOLERANCE_PPM).toEqual({ "3:4": 5_000, "16:9": 12_500 });
    expect(T020_V2_GRID_PX).toBe(32);
  });

  test("the tolerance admits the whole 32-px grid at ~1MP and still rejects a real aspect change", () => {
    const ppm = (w: number, h: number, ew: number, eh: number) => Math.ceil((Math.abs(w * eh - h * ew) * 1_000_000) / (h * ew));
    // Every nearest-grid 16:9 rendering for plausible heights must be inside 12500…
    for (let k = 22; k <= 34; k += 1) {
      const height = k * 32;
      const width = 32 * Math.round((height * 16) / 9 / 32);
      expect(ppm(width, height, 16, 9), `${width}x${height}`).toBeLessThanOrEqual(12_500);
    }
    // …including the two that motivated the number: the observed delivery and the h=800 case
    // that lands exactly on a 10000 limit, which is why 10000 was not chosen.
    expect(ppm(1376, 768, 16, 9)).toBe(7_813);
    expect(ppm(1408, 800, 16, 9)).toBe(10_000);
    // A genuinely different ratio is still refused.
    expect(ppm(1344, 768, 16, 9)).toBe(15_625);
    expect(ppm(1024, 768, 16, 9)).toBe(250_000);
    expect(15_625).toBeGreaterThan(12_500);
  });

  test("the risk text states the grid diagnosis and the deliberate round-down refusal", () => {
    expect(T020_V2_RISK_TEXT).toContain("1376x768");
    expect(T020_V2_RISK_TEXT).toContain("7813ppm");
    expect(T020_V2_RISK_TEXT).toContain("12500ppm");
    expect(T020_V2_RISK_TEXT).toContain("1344x768");
    expect(T020_V2_RISK_TEXT).toContain("32픽셀");
    expect(T020_V2_RISK_TEXT).toContain(T020_V2_EXACT_APPROVAL_PHRASE);
  });
});

describe("T020 v2 scope and plan", () => {
  test("48 paid assets in four batches of twelve at a 72.00 cap", () => {
    expect(cachedPlan.assets).toHaveLength(T020_V2_PAID_ASSET_COUNT);
    expect(cachedPlan.batches).toHaveLength(T020_V2_BATCH_COUNT);
    expect(cachedPlan.batches.map(({ size }) => size)).toEqual([...T020_V2_BATCH_SIZES]);
    expect(T020_V2_PAID_ASSET_COUNT * T020_V2_UNIT_COST_UNITS).toBe(T020_V2_TOTAL_CAP_UNITS);
    expect(T020_V2_TOTAL_CAP_UNITS).toBe(7_200);
    expect(T020_V2_V1_SUNK_UNITS + T020_V2_TOTAL_CAP_UNITS).toBe(8_100);
  });

  test("the paid slice is exactly what v1 never bought", () => {
    const paid = buildT020V2PaidAssets(repositoryRoot);
    expect(paid.filter(({ aspect_ratio }) => aspect_ratio === "16:9")).toHaveLength(12);
    expect(paid.filter(({ aspect_ratio }) => aspect_ratio === "3:4")).toHaveLength(36);
    expect(paid[0].id).toBe("background__scatter__depth_01");
    expect(cachedPlan.legacy_recovery.jobs.map(({ asset_id }) => asset_id)).not.toContain(paid[0].id);
    expect(new Set([...paid.map(({ id }) => id), ...cachedPlan.legacy_recovery.jobs.map(({ asset_id }) => asset_id)]).size).toBe(54);
  });

  test("every batch is aspect-homogeneous and the canary is the 16:9 one", () => {
    const byId = new Map(cachedPlan.assets.map((a) => [a.id, a]));
    for (const batch of cachedPlan.batches) expect(new Set(batch.asset_ids.map((id) => byId.get(id)!.aspect_ratio))).toEqual(new Set([batch.aspect_ratio]));
    expect(cachedPlan.batches[0].id).toBe(T020_V2_CANARY_BATCH_ID);
    expect(cachedPlan.batches[0].aspect_ratio).toBe("16:9");
  });

  test("derivation is deterministic and the tracked plan matches", () => {
    expect(renderT020V2Plan(buildT020V2Plan(repositoryRoot))).toBe(renderT020V2Plan(cachedPlan));
    expect(readFileSync(resolve(repositoryRoot, "assets/manifests/t020-world-art-v2.plan.json"), "utf8")).toBe(renderT020V2Plan(cachedPlan));
    expect(t020V2PlanSha256(cachedPlan)).toBe(t020V2PlanSha256(buildT020V2Plan(repositoryRoot)));
  });

  test("a partitioner given the wrong slice fails loudly", () => {
    expect(() => buildT020V2Batches(cachedPlan.assets.slice(0, 40))).toThrow(/batch layout changed|batch partition/);
  });
});

describe("T020 v2 pinned v1 journal", () => {
  test("the committed forensic copy is byte-pinned and describes the closed v1 run", () => {
    expect(sha256T020(readFileSync(resolve(repositoryRoot, T020_V1_JOURNAL_FORENSIC_PATH)))).toBe(T020_V1_JOURNAL_FORENSIC_SHA256);
    const v1 = loadPinnedT020V1Journal(repositoryRoot);
    expect(v1.value.run_state).toBe("CLOSED_WITH_LOSSES");
    expect(v1.jobs).toHaveLength(T020_V2_LEGACY_ASSET_COUNT);
    expect(v1.jobs.every(({ aspect_ratio }) => aspect_ratio === "16:9")).toBe(true);
    expect(v1.jobs.map(({ index }) => index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(v1.jobs.map(({ job_id }) => job_id)).size).toBe(6);
  });

  test("a tampered forensic copy is refused", () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t020v2-tamper-"));
    mkdirSync(resolve(root, "assets/evidence"), { recursive: true });
    mkdirSync(resolve(root, "assets/manifests"), { recursive: true });
    copyFileSync(resolve(repositoryRoot, T020_CORE_PLAN_PATH), resolve(root, T020_CORE_PLAN_PATH));
    const journal = JSON.parse(readFileSync(resolve(repositoryRoot, T020_V1_JOURNAL_FORENSIC_PATH), "utf8")) as Record<string, unknown>;
    journal.run_state = "COMPLETE";
    writeFileSync(resolve(root, T020_V1_JOURNAL_FORENSIC_PATH), `${JSON.stringify(journal, null, 2)}\n`);
    expect(() => loadPinnedT020V1Journal(root)).toThrow(/pinned source changed/);
  });

  test("the plan carries the six job ids and refuses a paid fallback on expiry", () => {
    expect(cachedPlan.legacy_recovery.credit_units).toBe(0);
    expect(cachedPlan.legacy_recovery.must_precede_any_paid_batch).toBe(true);
    expect(cachedPlan.legacy_recovery.expiry_falls_back_to_paid_regeneration).toBe(false);
    expect(cachedPlan.legacy_recovery.expiry_fail_stops).toBe(true);
    expect(cachedPlan.legacy_recovery.result_urls_persisted).toBe(false);
    expect(cachedPlan.legacy_recovery.jobs).toHaveLength(6);
  });
});

describe("T020 v2 zero-cost legacy recovery", () => {
  test("it recovers all six at no cost and accepts the real 32-px grid geometry", async () => {
    const p = fixture();
    const result = await recoverLegacy(p);
    expect(result).toMatchObject({ recovered: 6, credit_units: 0, new_paid_submit: false, complete: true });
    const journal = journalOf(p);
    expect(t020V2LegacyComplete(journal)).toBe(true);
    // 172x96 is the same ratio as the delivered 1376x768: inside 12500, outside v1's 5000.
    for (const recovery of journal.legacy_recovery.recoveries) {
      expect(recovery.aspect_error_ppm).toBe(7_813);
      expect(recovery.aspect_ratio).toBe("16:9");
      expect(recovery.local_relative_path.startsWith("backgrounds/")).toBe(true);
      expect(sha256T020(readFileSync(resolve(p.root, "public/assets", recovery.local_relative_path)))).toBe(recovery.sha256);
      expect(sha256T020(readFileSync(resolve(p.root, "assets/backups/t020-world-art", recovery.backup_relative_path)))).toBe(recovery.sha256);
    }
    // Nothing was billed for any of it.
    expect(statusT020V2(journal)).toMatchObject({ total_delta_units: 0, legacy_recovered: 6, legacy_recovery_complete: true });
  });

  test("no paid batch opens until the legacy six have landed", () => {
    const p = fixture();
    expect(() => ops(p, ["preflight-request", "--batch", T020_V2_CANARY_BATCH_ID, "--observed-at", at(0)])).toThrow(/no paid batch opens until all 6 zero-cost legacy recoveries/);
    expect(statusT020V2(journalOf(p))).toMatchObject({ paid_batches_blocked_until_legacy_complete: true, legacy_recovered: 0 });
  });

  test("recovery needs the exact legacy phrase", () => {
    const p = fixture();
    expect(() => ops(p, ["legacy-open", "--observed-at", at(0), "--operator-phrase", T020_V2_RECOVERY_OPERATOR_PHRASE])).toThrow(/exact operator phrase/);
  });

  test("expired job ids fail-stop and never fall back to paid regeneration", async () => {
    const p = fixture();
    ops(p, ["legacy-open", "--observed-at", at(0), "--operator-phrase", T020_V2_LEGACY_RECOVERY_PHRASE]);
    const statuses = p.plan.legacy_recovery.jobs.map((_, offset) => (offset === 0 ? "lookup_failed" : "completed"));
    await expect(runT020V2LegacyHandoffInternal(["legacy-handoff", "--observed-at", at(1)], JSON.stringify(legacyWait(p.plan, statuses)), p.root, p.plan, presentation, approval, deps(() => gridPng16x9(1))))
      .rejects.toThrow(/zero-cost recovery is unavailable and this approval does not authorise paid regeneration/);
    expect(journalOf(p).legacy_recovery.expired).toBe(true);
    expect(journalOf(p).legacy_recovery.recoveries).toHaveLength(0);
    // And the paid batches stay shut rather than silently absorbing the six.
    expect(() => ops(p, ["preflight-request", "--batch", T020_V2_CANARY_BATCH_ID, "--observed-at", at(2)])).toThrow(/no paid batch opens/);
  });

  test("model drift on a legacy job fail-stops the recovery", async () => {
    const p = fixture();
    ops(p, ["legacy-open", "--observed-at", at(0), "--operator-phrase", T020_V2_LEGACY_RECOVERY_PHRASE]);
    await expect(runT020V2LegacyHandoffInternal(["legacy-handoff", "--observed-at", at(1)], JSON.stringify(legacyWait(p.plan, undefined, "some_other_model")), p.root, p.plan, presentation, approval, deps(() => gridPng16x9(1))))
      .rejects.toThrow(/MODEL_DRIFT/);
  });

  test("a legacy image outside even the widened tolerance is refused and never stored", async () => {
    const p = fixture();
    ops(p, ["legacy-open", "--observed-at", at(0), "--operator-phrase", T020_V2_LEGACY_RECOVERY_PHRASE]);
    // 7:4 — what a round-down grid policy would have produced; 15625 ppm, outside 12500.
    await expect(runT020V2LegacyHandoffInternal(["legacy-handoff", "--observed-at", at(1)], JSON.stringify(legacyWait(p.plan)), p.root, p.plan, presentation, approval, deps(() => png(168, 96, 3))))
      .rejects.toThrow(/ASPECT_MISMATCH/);
    expect(journalOf(p).legacy_recovery.recoveries).toHaveLength(0);
  });
});

describe("T020 v2 paid run", () => {
  function costItems(plan: T020V2Plan, batchIndex: number, base: number) {
    return plan.batches[batchIndex].asset_ids.map((id, offset) => {
      const asset = plan.assets.find((a) => a.id === id)!;
      return { index: asset.index, request_sha256: sha256T020(canonicalJsonT020(t020GetCostRequest(asset.request))), cost: { credits: 1, credits_exact: 1.5 }, provider_observed_at: at(base + 1 + offset) };
    });
  }
  function submission(plan: T020V2Plan, batchIndex: number) {
    const ids = plan.batches[batchIndex].asset_ids;
    return { submitted_count: ids.length, failed_count: 0, jobs: ids.map((id, offset) => ({ index: plan.assets.find((a) => a.id === id)!.index, job_id: `${plan.batches[batchIndex].id}-job-${String(offset).padStart(2, "0")}`, status: "queued" })) };
  }
  function wait(plan: T020V2Plan, batchIndex: number) {
    const ids = plan.batches[batchIndex].asset_ids;
    return {
      all_terminal: true,
      jobs: ids.map((id, offset) => ({ index: plan.assets.find((a) => a.id === id)!.index, job_id: `${plan.batches[batchIndex].id}-job-${String(offset).padStart(2, "0")}`, status: "completed", type: "image", model: T020_V2_EXPECTED_MODEL, result_url: `https://d111111abcdef8.cloudfront.net/${offset}.png` })),
      summary: summaryOf(ids.map(() => "completed")),
    };
  }
  async function runBatch(p: Prepared, index: number, before: number, base: number): Promise<number> {
    const batch = p.plan.batches[index];
    ops(p, ["preflight-request", "--batch", batch.id, "--observed-at", at(base)]);
    const cost = json(p.root, `cost-${index}.json`, { costs: costItems(p.plan, index, base) });
    const bal = json(p.root, `bal-${index}.json`, { credits: before / 100, provider_observed_at: at(base + batch.size + 1) });
    ops(p, ["preflight-result", "--batch", batch.id, "--observed-at", at(base + batch.size + 2), "--cost-file", cost, "--balance-file", bal]);
    ops(p, ["prepare", "--batch", batch.id, "--observed-at", at(base + 40)]);
    ops(p, ["response", "--batch", batch.id, "--observed-at", at(base + 41), "--file", json(p.root, `sub-${index}.json`, submission(p.plan, index))]);
    ops(p, ["recovery-open", "--batch", batch.id, "--observed-at", at(base + 42), "--operator-phrase", T020_V2_RECOVERY_OPERATOR_PHRASE]);
    await runT020V2JobsHandoffInternal(["jobs-handoff", "--batch", batch.id, "--observed-at", at(base + 43)], JSON.stringify(wait(p.plan, index)), p.root, p.plan, presentation, approval, deps((call) => pngFor(batch.aspect_ratio, (index * 16 + call) % 251)));
    const after = before - batch.size * T020_V2_UNIT_COST_UNITS;
    ops(p, ["balance-after", "--batch", batch.id, "--observed-at", at(base + 45), "--file", json(p.root, `after-${index}.json`, { credits: after / 100, provider_observed_at: at(base + 44) })]);
    return after;
  }

  test("legacy recovery then four paid batches closes at exactly 72.00 with all 54 assets", async () => {
    const p = fixture();
    await recoverLegacy(p);
    let balance = START_UNITS;
    for (let index = 0; index < T020_V2_BATCH_COUNT; index += 1) balance = await runBatch(p, index, balance, 100 + index * 1000);
    expect(balance).toBe(START_UNITS - T020_V2_TOTAL_CAP_UNITS);
    const journal = journalOf(p);
    expect(journal.run_state).toBe("COMPLETE");
    const status = statusT020V2(journal);
    expect(status).toMatchObject({ recovered_assets: T020_V2_PAID_ASSET_COUNT, legacy_recovered: T020_V2_LEGACY_ASSET_COUNT, total_delta_units: T020_V2_TOTAL_CAP_UNITS, acknowledged_loss_units: 0 });
    // 48 paid + 6 legacy = the whole T020 set, on disk in both roots.
    const paidPaths = journal.batches.flatMap(({ recoveries }) => recoveries.map(({ local_relative_path }) => local_relative_path));
    const legacyPaths = journal.legacy_recovery.recoveries.map(({ local_relative_path }) => local_relative_path);
    expect(new Set([...paidPaths, ...legacyPaths]).size).toBe(54);
    for (const path of [...paidPaths, ...legacyPaths]) {
      expect(existsSync(resolve(p.root, "public/assets", path)), path).toBe(true);
      expect(existsSync(resolve(p.root, "assets/backups/t020-world-art", path)), path).toBe(true);
    }
  }, 120_000);

  test("audit reports the delivery split and the zero net loss", async () => {
    const p = fixture();
    await recoverLegacy(p);
    let balance = START_UNITS;
    for (let index = 0; index < T020_V2_BATCH_COUNT; index += 1) balance = await runBatch(p, index, balance, 100 + index * 1000);
    const { auditT020V2 } = await import("../../scripts/assets/t020-world-art-production-v2-ops");
    const audit = auditT020V2({ root: p.root, plan: p.plan, presentation, approval }, journalOf(p), at(9_000));
    expect(audit).toMatchObject({
      run_state: "COMPLETE", exact_closure: true,
      paid_assets_recovered: 48, legacy_assets_recovered: 6, total_assets_delivered: 54, total_assets_planned: 54,
      // The split the v1 audit conflated: nothing is undelivered, and nothing was paid-and-lost.
      assets_not_delivered: 0, assets_paid_and_lost: 0,
      legacy_recovery_credit_units: 0, v1_sunk_units_now_backed_by_images: true,
      all_assets_delivered: true, closes_at_exact_cap: true, total_delta_units: T020_V2_TOTAL_CAP_UNITS,
    });
  }, 120_000);

  test("init requires a balance covering the new 72.00 cap, not the old 81.00", () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t020v2-poor-"));
    mkdirSync(resolve(root, "assets/manifests"), { recursive: true });
    const anchor = json(root, "b.json", { credits: 71.99, provider_observed_at: at(-120) });
    expect(() => runT020V2OpsInternal(["init", "--observed-at", at(-60), "--balance-file", anchor], root, cachedPlan, presentation, approval)).toThrow(/does not cover the 72.00 cap/);
    const ok = json(root, "ok.json", { credits: 72, provider_observed_at: at(-119) });
    expect(runT020V2OpsInternal(["init", "--observed-at", at(-59), "--balance-file", ok], root, cachedPlan, presentation, approval)).toMatchObject({ run_state: "ACTIVE" });
  });

  test("the 16:9 widening does not leak into 3:4 enemy batches", async () => {
    const p = fixture();
    await recoverLegacy(p);
    const enemyIndex = p.plan.batches.findIndex(({ aspect_ratio }) => aspect_ratio === "3:4");
    expect(t020V2AspectTolerancePpm(p.plan.batches[enemyIndex].aspect_ratio)).toBe(5_000);
    // A 16:9 grid plate delivered for a 3:4 enemy is 583333 ppm off and must be refused even
    // though 16:9 itself is now tolerated more loosely.
    let balance = START_UNITS;
    for (let index = 0; index < enemyIndex; index += 1) balance = await runBatch(p, index, balance, 100 + index * 1000);
    const batch = p.plan.batches[enemyIndex];
    const base = 100 + enemyIndex * 1000;
    ops(p, ["preflight-request", "--batch", batch.id, "--observed-at", at(base)]);
    ops(p, ["preflight-result", "--batch", batch.id, "--observed-at", at(base + batch.size + 2), "--cost-file", json(p.root, "c.json", { costs: costItems(p.plan, enemyIndex, base) }), "--balance-file", json(p.root, "b.json", { credits: balance / 100, provider_observed_at: at(base + batch.size + 1) })]);
    ops(p, ["prepare", "--batch", batch.id, "--observed-at", at(base + 40)]);
    ops(p, ["response", "--batch", batch.id, "--observed-at", at(base + 41), "--file", json(p.root, "s.json", submission(p.plan, enemyIndex))]);
    ops(p, ["recovery-open", "--batch", batch.id, "--observed-at", at(base + 42), "--operator-phrase", T020_V2_RECOVERY_OPERATOR_PHRASE]);
    await expect(runT020V2JobsHandoffInternal(["jobs-handoff", "--batch", batch.id, "--observed-at", at(base + 43)], JSON.stringify(wait(p.plan, enemyIndex)), p.root, p.plan, presentation, approval, deps(() => gridPng16x9(9))))
      .rejects.toThrow(/ASPECT_MISMATCH/);
    const terminal = journalOf(p).batches[enemyIndex].terminals.at(-1)!;
    expect(terminal.facts).toMatchObject({ expected_aspect_ratio: "3:4", aspect_tolerance_ppm: 5_000 });
  }, 120_000);
});

describe("T020 v2 preparation CLI", () => {
  test("dry-run reports the legacy split, the cap, and the pending chain without writing", () => {
    const result = dryRunT020V2(repositoryRoot);
    expect(result).toMatchObject({
      submitted_anything: false, wrote_anything: false,
      legacy_asset_count: 6, legacy_credit_units: 0, legacy_must_precede_any_paid_batch: true, legacy_expiry_falls_back_to_paid: false,
      paid_asset_count: 48, batch_count: 4, planned_spend_units: 7_200, new_credit_cap_units: 7_200,
      v1_sunk_decimal: "9.00", combined_on_full_success_decimal: "81.00", net_monetary_loss_target_decimal: "0.00",
      disclosure_chain_status: "pending approval", authorized: false,
    });
    expect(result.aspect_tolerance_ppm).toEqual({ "3:4": 5_000, "16:9": 12_500 });
    expect(result.aspect_ratio_counts).toEqual({ "16:9": 12, "3:4": 36 });
    expect(result.legacy_job_ids).toHaveLength(6);
  });

  test("the v2 binding pins both v1 sources and never package.json", () => {
    const files = cachedPlan.sources.implementation_binding.files as Record<string, { path: string; sha256: string }>;
    const paths = Object.values(files).map(({ path }) => path);
    expect(paths).toContain("scripts/assets/t020-world-art-production-v1.ts");
    expect(paths).toContain("scripts/assets/t020-world-art-production-v1-ops.ts");
    expect(paths).toContain("scripts/assets/t020-world-art-production-v2-ops.ts");
    expect(paths).not.toContain("package.json");
    for (const [key, entry] of Object.entries(files)) expect(entry.sha256, key).toBe(sha256T020(readFileSync(resolve(repositoryRoot, entry.path))));
  });

  test("v2 artifact paths never collide with v1", () => {
    for (const path of [T020_V2_JOURNAL_PATH, cachedPlan.approval_gate.approval_path, cachedPlan.approval_gate.disclosure_presentation_path]) {
      expect(path).toContain("v2");
    }
    expect(existsSync(resolve(repositoryRoot, "assets/evidence/t020-world-art-approval-v1.json"))).toBe(true);
  });
});
