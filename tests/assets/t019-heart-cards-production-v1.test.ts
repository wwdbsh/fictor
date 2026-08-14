import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { beforeAll, describe, expect, test } from "vitest";

import { t020GetCostRequest } from "../../scripts/assets/t020-world-art-production-v1-ops";
import {
  T019_CORE_PLAN_PATH, T019_CORE_PLAN_SHA256, T019_V1_ASPECT_TOLERANCE_PPM, T019_V1_ASSET_COUNT, T019_V1_BATCH_COUNT,
  T019_V1_BATCH_MAX, T019_V1_BATCH_SIZES, T019_V1_ATTRIBUTES, T019_V1_CANARY_BATCH_ID, T019_V1_CONTACT_SEGMENT_DIR,
  T019_V1_EXACT_APPROVAL_PHRASE, T019_V1_EXPECTED_MODEL, T019_V1_ID_LIST_SHA256, T019_V1_JOURNAL_PATH,
  T019_V1_LOSS_ACKNOWLEDGMENT_PHRASE, T019_V1_RECOVERY_OPERATOR_PHRASE, T019_V1_REMAINING_PLAN_AFTER_T019_UNITS,
  T019_V1_REMAINING_PLAN_BREAKDOWN, T019_V1_RESUME_OPERATOR_PHRASE, T019_V1_RISK_TEXT,
  T019_V1_TOTAL_CAP_UNITS, T019_V1_UNIT_COST_UNITS, buildT019Assets, buildT019Batches, buildT019Plan, canonicalJsonT019,
  crossCheckT019EffectivePrompts, decimalT019, isT019Authorized, renderT019Plan, sha256T019, selectT019HeartAssets,
  t019AspectTolerancePpm, t019PlanSha256, type T019Approval, type T019Plan, type T019Presentation,
} from "../../scripts/assets/t019-heart-cards-production-v1";
import {
  auditT019, productionContextT019, runT019JobsHandoffInternal, runT019OpsInternal, statusT019, t019BatchModelVerified,
  t019ContractDriftBatches, type T019Dependencies, type T019Journal,
} from "../../scripts/assets/t019-heart-cards-production-v1-ops";
import { dryRunT019, runT019Preparation } from "../../scripts/assets/t019-heart-cards-production-v1-cli";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const EPOCH = Date.parse("2026-08-14T12:00:00.000Z");
const presentation = { evidence_version: "t019-test-presentation" } as unknown as T019Presentation;
const approval = { evidence_version: "t019-test-approval" } as unknown as T019Approval;
const START_UNITS = 25_290;

function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer): Buffer { const name = Buffer.from(type); const result = Buffer.alloc(12 + data.length); result.writeUInt32BE(data.length, 0); name.copy(result, 4); data.copy(result, 8); result.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length); return result; }
function png(width: number, height: number, fill = 0): Buffer {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const rowBytes = width * 3; const pixels = Buffer.alloc(height * (1 + rowBytes), fill);
  for (let row = 0; row < height; row += 1) pixels[row * (1 + rowBytes)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}
/** The provider's real 3:4 geometry: 896x1200, 4445 ppm off exact, inside 5000. */
function gridPng3x4(fill: number): Buffer { return png(224, 300, fill); }
function at(seconds: number): string { return new Date(EPOCH + seconds * 1000).toISOString(); }
function json(root: string, name: string, value: unknown): string { writeFileSync(resolve(root, name), `${JSON.stringify(value)}\n`); return name; }
function summaryOf(statuses: readonly string[]) { const active = ["pending", "waiting", "queued", "in_progress", "ip_detect"]; const failed = ["failed", "canceled", "nsfw", "ip_detected"]; return { active: statuses.filter((s) => active.includes(s)).length, completed: statuses.filter((s) => s === "completed").length, errors: statuses.filter((s) => s === "lookup_failed").length, failed: statuses.filter((s) => failed.includes(s)).length, total: statuses.length }; }

let cachedPlan: T019Plan;
beforeAll(() => { cachedPlan = buildT019Plan(repositoryRoot); });

interface Prepared { root: string; plan: T019Plan }
function fixture(startUnits = START_UNITS): Prepared {
  const root = mkdtempSync(resolve(tmpdir(), "fictor-t019-"));
  mkdirSync(resolve(root, "assets/manifests"), { recursive: true });
  copyFileSync(resolve(repositoryRoot, T019_CORE_PLAN_PATH), resolve(root, T019_CORE_PLAN_PATH));
  const anchor = json(root, "initial-balance.json", { credits: startUnits / 100, provider_observed_at: at(-120) });
  runT019OpsInternal(["init", "--observed-at", at(-60), "--balance-file", anchor], root, cachedPlan, presentation, approval);
  return { root, plan: cachedPlan };
}
function ops(p: Prepared, args: readonly string[]): Record<string, unknown> { return runT019OpsInternal(args, p.root, p.plan, presentation, approval); }
function journalOf(p: Prepared): T019Journal { return JSON.parse(readFileSync(resolve(p.root, T019_V1_JOURNAL_PATH), "utf8")) as T019Journal; }
function deps(bytesFor: (call: number) => Buffer): T019Dependencies {
  let call = 0;
  return { resolve: async () => [{ address: "18.65.3.2", family: 4 }], fetch: async () => ({ status: 200, headers: { "content-type": "image/png" }, bytes: bytesFor(call++), remoteAddress: "::ffff:18.65.3.2" }) };
}
function costItems(plan: T019Plan, batchIndex: number, base: number) {
  return plan.batches[batchIndex].asset_ids.map((id, offset) => {
    const asset = plan.assets.find((a) => a.id === id)!;
    return { index: asset.index, request_sha256: sha256T019(canonicalJsonT019(t020GetCostRequest(asset.request))), cost: { credits: 1, credits_exact: 1.5 }, provider_observed_at: at(base + 1 + offset) };
  });
}
function submission(plan: T019Plan, batchIndex: number) {
  const ids = plan.batches[batchIndex].asset_ids;
  return { submitted_count: ids.length, failed_count: 0, jobs: ids.map((id, offset) => ({ index: plan.assets.find((a) => a.id === id)!.index, job_id: `${plan.batches[batchIndex].id}-job-${String(offset).padStart(2, "0")}`, status: "queued" })) };
}
function wait(plan: T019Plan, batchIndex: number, statuses?: readonly string[], model: string = T019_V1_EXPECTED_MODEL) {
  const ids = plan.batches[batchIndex].asset_ids;
  const resolved = statuses ?? ids.map(() => "completed");
  return {
    all_terminal: true,
    jobs: ids.map((id, offset) => {
      const entry: Record<string, unknown> = { index: plan.assets.find((a) => a.id === id)!.index, job_id: `${plan.batches[batchIndex].id}-job-${String(offset).padStart(2, "0")}`, status: resolved[offset], type: "image" };
      if (resolved[offset] === "completed") { entry.model = model; entry.result_url = `https://d111111abcdef8.cloudfront.net/${offset}.png`; }
      if (resolved[offset] === "lookup_failed") entry.retryable = false;
      return entry;
    }),
    summary: summaryOf(resolved),
  };
}
async function runBatch(p: Prepared, index: number, before: number, base: number): Promise<number> {
  const batch = p.plan.batches[index];
  ops(p, ["preflight-request", "--batch", batch.id, "--observed-at", at(base)]);
  ops(p, ["preflight-result", "--batch", batch.id, "--observed-at", at(base + batch.size + 2), "--cost-file", json(p.root, `c${index}.json`, { costs: costItems(p.plan, index, base) }), "--balance-file", json(p.root, `b${index}.json`, { credits: before / 100, provider_observed_at: at(base + batch.size + 1) })]);
  ops(p, ["prepare", "--batch", batch.id, "--observed-at", at(base + 40)]);
  ops(p, ["response", "--batch", batch.id, "--observed-at", at(base + 41), "--file", json(p.root, `s${index}.json`, submission(p.plan, index))]);
  ops(p, ["recovery-open", "--batch", batch.id, "--observed-at", at(base + 42), "--operator-phrase", T019_V1_RECOVERY_OPERATOR_PHRASE]);
  await runT019JobsHandoffInternal(["jobs-handoff", "--batch", batch.id, "--observed-at", at(base + 43)], JSON.stringify(wait(p.plan, index)), p.root, p.plan, presentation, approval, deps((call) => gridPng3x4((index * 16 + call) % 251)));
  const after = before - batch.size * T019_V1_UNIT_COST_UNITS;
  ops(p, ["balance-after", "--batch", batch.id, "--observed-at", at(base + 45), "--file", json(p.root, `a${index}.json`, { credits: after / 100, provider_observed_at: at(base + 44) })]);
  return after;
}

/* ------------------------------------------------------------------------ */

describe("T019 manifest discovery", () => {
  test("the pinned manifest holds exactly 6 HEART assets, all 3:4, under cards/", () => {
    expect(sha256T019(readFileSync(resolve(repositoryRoot, T019_CORE_PLAN_PATH)))).toBe(T019_CORE_PLAN_SHA256);
    const selected = selectT019HeartAssets(repositoryRoot);
    expect(selected).toHaveLength(6);
    expect(selected.every(({ aspect_ratio }) => aspect_ratio === "3:4")).toBe(true);
    expect(selected.every(({ path }) => path.startsWith("cards/") && path.endsWith(".png"))).toBe(true);
    expect(sha256T019(`${selected.map(({ id }) => id).join("\n")}\n`)).toBe(T019_V1_ID_LIST_SHA256);
  });

  test("all six carry CELESTIAL composition, MAX density, GOLD, and the designated naming", () => {
    // The three things acceptance names explicitly, checked against the manifest rather than
    // assumed, plus the id-follows-attribute rule the naming criterion rests on.
    const assets = buildT019Assets(repositoryRoot);
    expect(assets.every(({ composition }) => composition === "CELESTIAL")).toBe(true);
    expect(assets.every(({ density }) => density === "MAX")).toBe(true);
    expect(assets.map(({ attribute }) => attribute)).toEqual([...T019_V1_ATTRIBUTES]);
    for (const asset of assets) expect(asset.id, asset.attribute).toBe(`heart__${asset.attribute.toLowerCase()}`);
    expect(new Set(assets.map(({ attribute }) => attribute)).size).toBe(6);
  });

  test("a manifest that loses CELESTIAL, MAX, GOLD, or the naming is refused", () => {
    const core = JSON.parse(readFileSync(resolve(repositoryRoot, T019_CORE_PLAN_PATH), "utf8")) as { assets: Array<Record<string, unknown>> };
    const mutate = (fn: (a: Record<string, unknown>) => void, expected: RegExp) => {
      const copy = JSON.parse(JSON.stringify(core)) as { assets: Array<Record<string, unknown>> };
      for (const a of copy.assets) if (a.category === "HEART") { fn(a); break; }
      const root = mkdtempSync(resolve(tmpdir(), "fictor-t019-mutate-"));
      mkdirSync(resolve(root, "assets/manifests"), { recursive: true });
      writeFileSync(resolve(root, T019_CORE_PLAN_PATH), `${JSON.stringify(copy, null, 2)}\n`);
      // The sha pin fires first — which is the point: none of these can arrive unnoticed.
      expect(() => selectT019HeartAssets(root)).toThrow(expected);
    };
    mutate((a) => { (a.prompt_inputs as Record<string, unknown>).composition = "SPECIMEN"; }, /pinned source changed/);
    mutate((a) => { (a.prompt_inputs as Record<string, unknown>).density = "MID"; }, /pinned source changed/);
    mutate((a) => { a.id = "heart__renamed"; }, /pinned source changed/);
  });

  test("out-of-scope categories never enter the plan, including HEART_FORGE", () => {
    expect(cachedPlan.assets.every(({ category }) => category === "HEART")).toBe(true);
    expect(cachedPlan.scope.heart_forge_generation_allowed).toBe(false);
    expect(cachedPlan.scope.heart_forge_out_of_scope_count).toBe(36);
    expect(cachedPlan.scope.style_redecision_allowed).toBe(false);
    expect(cachedPlan.scope.manifest_id_change_allowed).toBe(false);
  });

  test("the plan records that these six double as boss art", () => {
    // T020 contracted bosses to reuse this art rather than generate separate world plates, so
    // a missing heart leaves that ground's boss unrepresented too.
    expect(cachedPlan.scope.doubles_as_boss_art).toBe(true);
    expect(T019_V1_RISK_TEXT).toContain("보스");
  });

  test("every request carries 3:4, use_unlim false, and the pinned master reference", () => {
    for (const asset of cachedPlan.assets) {
      expect(asset.request.params.aspect_ratio).toBe("3:4");
      expect(asset.request.params.use_unlim).toBe(false);
      expect(asset.request.params.count).toBe(1);
      expect(asset.request.params.medias).toEqual([{ role: "image", value: "e0f36c95-2e1b-4e38-9931-7e10e562f209" }]);
      expect(asset.canonical_request_sha256).toBe(sha256T019(canonicalJsonT019(asset.request)));
    }
    expect(crossCheckT019EffectivePrompts(repositoryRoot, cachedPlan, [0, 3, 5])).toBe(3);
  });

  test("the six land in cards/ on paths disjoint from every other manifest asset", () => {
    // Hearts share the cards/ directory with T015's canonical cards. The safety property is
    // that the two sets of paths cannot intersect — not whether the run has happened yet.
    // (An earlier version asserted the six did not exist on disk, which was true only until
    // the run wrote them; the same stale-snapshot mistake this suite exists to avoid.)
    const paths = cachedPlan.assets.map(({ path }) => path);
    expect(paths.every((path) => path.startsWith("cards/heart__"))).toBe(true);
    expect(new Set(paths).size).toBe(6);
    const core = JSON.parse(readFileSync(resolve(repositoryRoot, T019_CORE_PLAN_PATH), "utf8")) as { assets: Array<{ category: string; path: string }> };
    const others = new Set(core.assets.filter(({ category }) => category !== "HEART").map(({ path }) => path));
    for (const path of paths) expect(others.has(path), path).toBe(false);
    // And every other card in the shared directory belongs to someone else, by prefix alone.
    const sharedDir = core.assets.filter(({ path }) => path.startsWith("cards/") && !path.startsWith("cards/heart__"));
    expect(sharedDir.length).toBeGreaterThan(0);
    expect(sharedDir.every(({ category }) => category !== "HEART")).toBe(true);
  });
});

describe("T019 tolerance table", () => {
  test("3:4 is the only declared aspect, and anything else throws rather than defaulting", () => {
    expect(t019AspectTolerancePpm("3:4")).toBe(5_000);
    expect(T019_V1_ASPECT_TOLERANCE_PPM).toEqual({ "3:4": 5_000 });
    // T020's 16:9 allowance is not declared here at all. An absent entry cannot leak, and the
    // lookup refuses rather than silently picking a default.
    expect(() => t019AspectTolerancePpm("16:9")).toThrow(/no declared tolerance for aspect 16:9/);
    expect(cachedPlan.assets.every(({ aspect_ratio }) => aspect_ratio === "3:4")).toBe(true);
  });

  test("the observed 3:4 grid geometry is inside tolerance and a wider plate is not", () => {
    const ppm = (w: number, h: number, ew: number, eh: number) => Math.ceil((Math.abs(w * eh - h * ew) * 1_000_000) / (h * ew));
    // The real delivered geometry: the same 32-px grid artifact as 16:9, but inside 5000.
    expect(ppm(896, 1200, 3, 4)).toBe(4_445);
    expect(ppm(896, 1200, 3, 4)).toBeLessThanOrEqual(t019AspectTolerancePpm("3:4"));
    // A plate that T020's 16:9 allowance would have admitted is refused here.
    expect(ppm(908, 1200, 3, 4)).toBe(8_889);
    expect(ppm(908, 1200, 3, 4)).toBeGreaterThan(t019AspectTolerancePpm("3:4"));
    expect(ppm(908, 1200, 3, 4)).toBeLessThanOrEqual(12_500);
  });
});

describe("T019 batching and cap", () => {
  test("one batch of six covering every asset", () => {
    expect(cachedPlan.batches.map(({ size }) => size)).toEqual([...T019_V1_BATCH_SIZES]);
    expect(cachedPlan.batches.reduce((sum, { size }) => sum + size, 0)).toBe(T019_V1_ASSET_COUNT);
    expect(cachedPlan.batches.every(({ size }) => size <= T019_V1_BATCH_MAX)).toBe(true);
    expect(cachedPlan.batches.every(({ aspect_ratio }) => aspect_ratio === "3:4")).toBe(true);
    expect(new Set(cachedPlan.batches.flatMap(({ asset_ids }) => asset_ids)).size).toBe(T019_V1_ASSET_COUNT);
    expect(cachedPlan.batches[0].id).toBe(T019_V1_CANARY_BATCH_ID);
    // Single batch: the canary is the run, with no later batch for it to gate — and therefore
    // the one ambiguous window exposes the entire cap rather than a twelfth of it.
    expect(cachedPlan.batches).toHaveLength(1);
    expect(cachedPlan.retry_policy.ambiguous_window_max_exposure_decimal).toBe(decimalT019(T019_V1_TOTAL_CAP_UNITS));
  });

  test("6 requests at 1.50 is exactly the 9.00 cap", () => {
    expect(T019_V1_ASSET_COUNT * T019_V1_UNIT_COST_UNITS).toBe(T019_V1_TOTAL_CAP_UNITS);
    expect(decimalT019(T019_V1_TOTAL_CAP_UNITS)).toBe("9.00");
    expect(cachedPlan.budget.legacy_committed_units).toBe(0);
  });

  test("the cumulative budget is reported, and it shows only 3.90 of slack", () => {
    // Issue #23 asks for cumulative budget compliance, and the honest answer is tight: a
    // single lost batch here (the whole 9.00, one window) would leave the plan unaffordable.
    expect(cachedPlan.cumulative_budget).toMatchObject({
      balance_at_disclosure_decimal: "252.90", this_task_cap_decimal: "9.00",
      projected_balance_after_t019_decimal: "243.90", remaining_plan_after_t019_decimal: "240.00",
      headroom_after_t019_decimal: "3.90", a_single_lost_batch_breaks_the_remaining_plan: true,
      max_single_batch_exposure_decimal: "9.00",
    });
    expect(T019_V1_RISK_TEXT).toContain("3.90");
    expect(T019_V1_RISK_TEXT).toContain("240.00");
  });

  test("a partitioner given the wrong count fails loudly", () => {
    expect(() => buildT019Batches(cachedPlan.assets.slice(0, 3))).toThrow(/needs exactly 6 assets/);
  });
});

describe("T019 plan determinism", () => {
  test("same pinned inputs derive the same bytes, and the tracked plan matches", () => {
    expect(renderT019Plan(buildT019Plan(repositoryRoot))).toBe(renderT019Plan(cachedPlan));
    expect(t019PlanSha256(buildT019Plan(repositoryRoot))).toBe(t019PlanSha256(cachedPlan));
    expect(readFileSync(resolve(repositoryRoot, "assets/manifests/t019-heart-cards-v1.plan.json"), "utf8")).toBe(renderT019Plan(cachedPlan));
  });

  test("derivation reads no clock and no randomness", () => {
    const source = readFileSync(resolve(repositoryRoot, "scripts/assets/t019-heart-cards-production-v1.ts"), "utf8");
    expect(source).not.toMatch(/Date\.now\(\)/);
    expect(source).not.toMatch(/Math\.random\(\)/);
    expect(renderT019Plan(cachedPlan)).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe("T019 phrase binding", () => {
  test("the approval phrase is bound byte-exactly and the four phrases are distinct", () => {
    expect(T019_V1_EXACT_APPROVAL_PHRASE).toBe("T019 신의 심장 카드 6장 생성을 승인한다. 한도 9.00 크레딧.");
    expect(cachedPlan.approval_gate.exact_phrase).toBe(T019_V1_EXACT_APPROVAL_PHRASE);
    expect(new Set([T019_V1_EXACT_APPROVAL_PHRASE, T019_V1_RECOVERY_OPERATOR_PHRASE, T019_V1_RESUME_OPERATOR_PHRASE, T019_V1_LOSS_ACKNOWLEDGMENT_PHRASE]).size).toBe(4);
    expect(T019_V1_RISK_TEXT).toContain(T019_V1_EXACT_APPROVAL_PHRASE);
  });

  test("operator gates refuse a near-miss phrase", () => {
    const p = fixture();
    const id = p.plan.batches[0].id;
    expect(() => ops(p, ["resume", "--observed-at", at(1), "--operator-phrase", "T019 재개"])).toThrow(/exact operator phrase/);
    expect(() => ops(p, ["recovery-open", "--batch", id, "--observed-at", at(1), "--operator-phrase", `${T019_V1_RECOVERY_OPERATOR_PHRASE} `])).toThrow(/exact phrase/);
  });
});

describe("T019 paid discipline", () => {
  test("the run closes at exactly 9.00 with all 6 cards in both roots", async () => {
    const p = fixture();
    let balance = START_UNITS;
    for (let index = 0; index < T019_V1_BATCH_COUNT; index += 1) balance = await runBatch(p, index, balance, 100 + index * 1000);
    expect(balance).toBe(START_UNITS - T019_V1_TOTAL_CAP_UNITS);
    const journal = journalOf(p);
    expect(journal.run_state).toBe("COMPLETE");
    expect(statusT019(journal)).toMatchObject({ recovered_assets: 6, total_delta_units: 900, acknowledged_loss_units: 0, paid_retry_count: 0 });
    for (const record of journal.batches) {
      expect(t019BatchModelVerified(record)).toBe(true);
      for (const recovery of record.recoveries) {
        expect(recovery.aspect_error_ppm).toBe(4_445);
        expect(recovery.local_relative_path.startsWith("cards/heart__")).toBe(true);
        expect(existsSync(resolve(p.root, "public/assets", recovery.local_relative_path))).toBe(true);
        expect(existsSync(resolve(p.root, "assets/backups/t019-heart-cards", recovery.backup_relative_path))).toBe(true);
      }
    }
  }, 120_000);

  test("audit reports the delivery split and every event type", async () => {
    const p = fixture();
    let balance = START_UNITS;
    for (let index = 0; index < T019_V1_BATCH_COUNT; index += 1) balance = await runBatch(p, index, balance, 100 + index * 1000);
    const audit = auditT019({ root: p.root, plan: p.plan, presentation, approval }, journalOf(p), at(9_000));
    expect(audit).toMatchObject({
      run_state: "COMPLETE", exact_closure: true, assets_recovered: 6, assets_planned: 6,
      assets_not_delivered: 0, assets_paid_and_lost: 0, closes_at_exact_cap: true, total_delta_units: 900,
    });
    expect(audit.recovered_by_attribute).toEqual({ STILL: 1, BURN: 1, SCATTER: 1, ROT: 1, WASH: 1, JOIN: 1 });
  }, 120_000);

  test("init requires a balance covering the 9.00 cap", () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t019-poor-"));
    mkdirSync(resolve(root, "assets/manifests"), { recursive: true });
    expect(() => runT019OpsInternal(["init", "--observed-at", at(-60), "--balance-file", json(root, "b.json", { credits: 8.99, provider_observed_at: at(-120) })], root, cachedPlan, presentation, approval)).toThrow(/does not cover the 9.00 cap/);
  });

  test("a batch is submitted once and an ambiguous window is never re-run", () => {
    const p = fixture();
    const id = p.plan.batches[0].id;
    ops(p, ["preflight-request", "--batch", id, "--observed-at", at(0)]);
    ops(p, ["preflight-result", "--batch", id, "--observed-at", at(20), "--cost-file", json(p.root, "c.json", { costs: costItems(p.plan, 0, 0) }), "--balance-file", json(p.root, "b.json", { credits: START_UNITS / 100, provider_observed_at: at(19) })]);
    ops(p, ["prepare", "--batch", id, "--observed-at", at(40)]);
    expect(() => ops(p, ["ambiguous", "--batch", id, "--observed-at", at(41), "--reason", "TIMEOUT"])).toThrow(/AMBIGUOUS_SUBMISSION/);
    expect(journalOf(p).run_state).toBe("FAIL_STOP");
    const status = statusT019(journalOf(p));
    expect((status.batches as Array<Record<string, unknown>>)[0]).toMatchObject({ rerunnable: false, discharge_possible: "LOSS_ACKNOWLEDGMENT" });
  });

  test("a display credit never substitutes for the exact 1.50 unit price", () => {
    const p = fixture();
    const id = p.plan.batches[0].id;
    ops(p, ["preflight-request", "--batch", id, "--observed-at", at(0)]);
    const items = costItems(p.plan, 0, 0).map((item) => ({ ...item, cost: { credits: 1, credits_exact: 1 } }));
    expect(() => ops(p, ["preflight-result", "--batch", id, "--observed-at", at(20), "--cost-file", json(p.root, "c.json", { costs: items }), "--balance-file", json(p.root, "b.json", { credits: START_UNITS / 100, provider_observed_at: at(19) })])).toThrow(/PRICE_CHANGED/);
  });

  test("model drift permanently blocks the next batch", async () => {
    const p = fixture();
    const id = p.plan.batches[0].id;
    ops(p, ["preflight-request", "--batch", id, "--observed-at", at(0)]);
    ops(p, ["preflight-result", "--batch", id, "--observed-at", at(20), "--cost-file", json(p.root, "c.json", { costs: costItems(p.plan, 0, 0) }), "--balance-file", json(p.root, "b.json", { credits: START_UNITS / 100, provider_observed_at: at(19) })]);
    ops(p, ["prepare", "--batch", id, "--observed-at", at(40)]);
    ops(p, ["response", "--batch", id, "--observed-at", at(41), "--file", json(p.root, "s.json", submission(p.plan, 0))]);
    ops(p, ["recovery-open", "--batch", id, "--observed-at", at(42), "--operator-phrase", T019_V1_RECOVERY_OPERATOR_PHRASE]);
    await expect(runT019JobsHandoffInternal(["jobs-handoff", "--batch", id, "--observed-at", at(43)], JSON.stringify(wait(p.plan, 0, undefined, "some_other_model")), p.root, p.plan, presentation, approval, deps(() => gridPng3x4(1)))).rejects.toThrow(/MODEL_DRIFT/);
    expect(t019ContractDriftBatches(journalOf(p))).toEqual([{ batch_id: id, code: "MODEL_DRIFT" }]);
  });

  test("an out-of-tolerance 3:4 delivery is refused and never stored", async () => {
    const p = fixture();
    const id = p.plan.batches[0].id;
    ops(p, ["preflight-request", "--batch", id, "--observed-at", at(0)]);
    ops(p, ["preflight-result", "--batch", id, "--observed-at", at(20), "--cost-file", json(p.root, "c.json", { costs: costItems(p.plan, 0, 0) }), "--balance-file", json(p.root, "b.json", { credits: START_UNITS / 100, provider_observed_at: at(19) })]);
    ops(p, ["prepare", "--batch", id, "--observed-at", at(40)]);
    ops(p, ["response", "--batch", id, "--observed-at", at(41), "--file", json(p.root, "s.json", submission(p.plan, 0))]);
    ops(p, ["recovery-open", "--batch", id, "--observed-at", at(42), "--operator-phrase", T019_V1_RECOVERY_OPERATOR_PHRASE]);
    await expect(runT019JobsHandoffInternal(["jobs-handoff", "--batch", id, "--observed-at", at(43)], JSON.stringify(wait(p.plan, 0)), p.root, p.plan, presentation, approval, deps(() => png(16, 9, 3)))).rejects.toThrow(/ASPECT_MISMATCH/);
    expect(journalOf(p).batches[0].recoveries).toHaveLength(0);
    expect(journalOf(p).batches[0].terminals.at(-1)!.facts).toMatchObject({ expected_aspect_ratio: "3:4", aspect_tolerance_ppm: 5_000 });
  });
});

describe("T019 poll intake integrity", () => {
  async function opened(p: Prepared): Promise<string> {
    const id = p.plan.batches[0].id;
    ops(p, ["preflight-request", "--batch", id, "--observed-at", at(0)]);
    ops(p, ["preflight-result", "--batch", id, "--observed-at", at(20), "--cost-file", json(p.root, "c.json", { costs: costItems(p.plan, 0, 0) }), "--balance-file", json(p.root, "b.json", { credits: START_UNITS / 100, provider_observed_at: at(19) })]);
    ops(p, ["prepare", "--batch", id, "--observed-at", at(40)]);
    ops(p, ["response", "--batch", id, "--observed-at", at(41), "--file", json(p.root, "s.json", submission(p.plan, 0))]);
    ops(p, ["recovery-open", "--batch", id, "--observed-at", at(42), "--operator-phrase", T019_V1_RECOVERY_OPERATOR_PHRASE]);
    return id;
  }

  test("a poll repeating one job is refused", async () => {
    const p = fixture();
    const id = await opened(p);
    const payload = wait(p.plan, 0) as { jobs: Array<Record<string, unknown>> };
    payload.jobs = payload.jobs.map(() => payload.jobs[0]);
    await expect(runT019JobsHandoffInternal(["jobs-handoff", "--batch", id, "--observed-at", at(43)], JSON.stringify(payload), p.root, p.plan, presentation, approval, deps(() => gridPng3x4(1)))).rejects.toThrow(/RECOVERY_FAILED/);
    expect(journalOf(p).batches[0].recoveries).toHaveLength(0);
  });

  test("retryable must be present and boolean exactly when status is lookup_failed", async () => {
    const p = fixture();
    const id = await opened(p);
    const payload = wait(p.plan, 0) as { jobs: Array<Record<string, unknown>> };
    payload.jobs[0].retryable = true;
    await expect(runT019JobsHandoffInternal(["jobs-handoff", "--batch", id, "--observed-at", at(43)], JSON.stringify(payload), p.root, p.plan, presentation, approval, deps(() => gridPng3x4(1)))).rejects.toThrow(/RECOVERY_FAILED/);
  });
});

describe("T019 contact sheet links — the T020 v2 carry-over", () => {
  test("index links are built from the same constant as the segment directory", () => {
    const source = readFileSync(resolve(repositoryRoot, "scripts/assets/t019-heart-cards-production-v1-ops.ts"), "utf8");
    // The v2 defect was a literal in the link template that named another version's
    // directory. Both sides must derive from the constant, and no other version may appear.
    expect(source).toContain("${T019_V1_CONTACT_SEGMENT_DIR}/segment-");
    expect(source).not.toMatch(/href="t020-world-art/);
    expect(source).not.toMatch(/href="t015-/);
    expect(T019_V1_CONTACT_SEGMENT_DIR).toBe("t019-heart-cards-v1");
  });

  test("the generated index links resolve to the generated segment files", async () => {
    const p = fixture();
    let balance = START_UNITS;
    for (let index = 0; index < T019_V1_BATCH_COUNT; index += 1) balance = await runBatch(p, index, balance, 100 + index * 1000);
    auditT019({ root: p.root, plan: p.plan, presentation, approval }, journalOf(p), at(9_000));
    const indexPath = resolve(p.root, "docs/asset-runs/contact-sheets", `${T019_V1_CONTACT_SEGMENT_DIR}.html`);
    const index = readFileSync(indexPath, "utf8");
    const hrefs = [...index.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toHaveLength(T019_V1_BATCH_COUNT);
    for (const href of hrefs) expect(existsSync(resolve(p.root, "docs/asset-runs/contact-sheets", href)), href).toBe(true);
    // And every asset appears exactly once across the segments.
    const srcs = hrefs.flatMap((href) => [...readFileSync(resolve(p.root, "docs/asset-runs/contact-sheets", href), "utf8").matchAll(/src="([^"]+)"/g)].map((m) => m[1]));
    expect(new Set(srcs).size).toBe(T019_V1_ASSET_COUNT);
    expect(index).not.toMatch(/<img\b/i);
  }, 120_000);
});

describe("T019 entry gates and preparation", () => {
  test("an unapproved root is refused before any production command runs", () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t019-unapproved-"));
    mkdirSync(resolve(root, "assets/evidence"), { recursive: true });
    expect(() => productionContextT019("status", () => new Date(), root)).toThrow();
    expect(isT019Authorized(root, cachedPlan)).toBe(false);
  });

  test("the committed-clean gate passes on a committed scope and fails once it is dirtied", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t019-git-"));
    const binding = JSON.parse(readFileSync(resolve(repositoryRoot, "assets/evidence/t019-heart-cards-implementation-binding-v1.json"), "utf8")) as { files: Record<string, { path: string }> };
    const tracked = [...Object.values(binding.files).map(({ path }) => path), "assets/evidence/t019-heart-cards-implementation-binding-v1.json", "assets/manifests/t019-heart-cards-v1.plan.json"];
    for (const path of tracked) { mkdirSync(resolve(root, path, ".."), { recursive: true }); copyFileSync(resolve(repositoryRoot, path), resolve(root, path)); }
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
    git("init", "-q"); git("config", "user.email", "t019@test.invalid"); git("config", "user.name", "t019 test");
    git("add", ...tracked); git("commit", "-q", "-m", "t019 binding scope");
    const { assertT019CommittedClean } = await import("../../scripts/assets/t019-heart-cards-production-v1-ops");
    expect(() => assertT019CommittedClean(root)).not.toThrow();
    const plan = resolve(root, "assets/manifests/t019-heart-cards-v1.plan.json");
    writeFileSync(plan, `${readFileSync(plan, "utf8")} `);
    expect(() => assertT019CommittedClean(root)).toThrow(/not committed-clean/);
  });

  test("gen and binding-gen refuse once a run journal exists", () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t019-journal-"));
    mkdirSync(resolve(root, "assets/runs/t019-heart-cards"), { recursive: true });
    writeFileSync(resolve(root, T019_V1_JOURNAL_PATH), "{}\n");
    expect(() => runT019Preparation(["gen"], root)).toThrow(/refused while a run journal exists/);
    expect(() => runT019Preparation(["binding-gen"], root)).toThrow(/refused while a run journal exists/);
  });

  test("dry-run derives everything without submitting or writing", () => {
    const result = dryRunT019(repositoryRoot);
    expect(result).toMatchObject({
      submitted_anything: false, wrote_anything: false, asset_count: 6, batch_count: 1,
      planned_spend_units: 900, total_credit_cap_units: 900, canary_batch_id: T019_V1_CANARY_BATCH_ID,
      doubles_as_boss_art: true, heart_forge_generation_allowed: false,
    });
    expect(result.batch_sizes).toEqual([...T019_V1_BATCH_SIZES]);
    expect(result.aspect_ratio_counts).toEqual({ "3:4": 6 });
    expect(result.aspect_tolerance_ppm).toEqual({ "3:4": 5_000 });
    expect(result.attributes).toEqual([...T019_V1_ATTRIBUTES]);
    expect(result.plan_sha256).toBe(t019PlanSha256(cachedPlan));
    expect(result.disclosure_chain_status).toBe(result.authorized ? "approved" : "pending approval");
  });

  test("the binding pins the shared transport and both T020 sources, never package.json", () => {
    const files = cachedPlan.sources.implementation_binding.files as Record<string, { path: string; sha256: string }>;
    const paths = Object.values(files).map(({ path }) => path);
    expect(paths).toContain("scripts/assets/provider-transport.ts");
    expect(paths).toContain("scripts/assets/t020-world-art-production-v1.ts");
    expect(paths).toContain("scripts/assets/t020-world-art-production-v1-ops.ts");
    expect(paths).not.toContain("package.json");
    for (const [key, entry] of Object.entries(files)) expect(entry.sha256, key).toBe(sha256T019(readFileSync(resolve(repositoryRoot, entry.path))));
  });
});

describe("T019 budget arithmetic and the observed-balance path", () => {
  test("the published breakdown sums to the total the headroom is derived from", () => {
    // MINOR-1: the approver reads the decomposition while the headroom comes from the total.
    // Both now derive from one list, so they cannot disagree — this pins that they don't.
    expect(T019_V1_REMAINING_PLAN_BREAKDOWN.reduce((sum, { credit_units }) => sum + credit_units, 0)).toBe(T019_V1_REMAINING_PLAN_AFTER_T019_UNITS);
    for (const entry of T019_V1_REMAINING_PLAN_BREAKDOWN) expect(entry.credit_decimal, entry.task).toBe(decimalT019(entry.credit_units));
    const scope = cachedPlan.cumulative_budget;
    expect(scope.remaining_plan_after_t019_decimal).toBe(decimalT019(T019_V1_REMAINING_PLAN_AFTER_T019_UNITS));
    expect(scope.remaining_plan_breakdown.reduce((sum, { credit_units }) => sum + credit_units, 0)).toBe(T019_V1_REMAINING_PLAN_AFTER_T019_UNITS);
    // And the headroom really is balance − cap − remaining plan, not a typed-in figure.
    expect(scope.headroom_after_t019_decimal).toBe(decimalT019(25_290 - T019_V1_TOTAL_CAP_UNITS - T019_V1_REMAINING_PLAN_AFTER_T019_UNITS));
  });

  /**
   * MINOR-2. `covers_remaining_plan` is reported, not enforced — deliberately. A balance that
   * cannot fund the rest of the plan is a planning decision for whoever approves (T016 shrinks),
   * not a safety property of T019, whose own affordability is already gated by `init` refusing a
   * balance under the 9.00 cap. Gating here would block a legitimate "we accept the re-scope"
   * answer. What must never happen is the artifact hiding it, which is what this pins.
   */
  function disclosureRoot(): string {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t019-disclosure-"));
    const binding = JSON.parse(readFileSync(resolve(repositoryRoot, "assets/evidence/t019-heart-cards-implementation-binding-v1.json"), "utf8")) as { files: Record<string, { path: string }> };
    const needed = [
      ...Object.values(binding.files).map(({ path }) => path),
      "assets/evidence/t019-heart-cards-implementation-binding-v1.json",
      "assets/manifests/core-v1.plan.json", "assets/manifests/master-style-v1.json", "assets/manifests/material-style-approval-v1.json",
    ];
    for (const path of needed) { mkdirSync(resolve(root, path, ".."), { recursive: true }); copyFileSync(resolve(repositoryRoot, path), resolve(root, path)); }
    return root;
  }

  test("a balance that cannot fund the remaining plan is reported, not hidden", async () => {
    const { buildT019ControllerDisclosure, buildT019Presentation, buildT019Plan: build } = await import("../../scripts/assets/t019-heart-cards-production-v1");
    const root = disclosureRoot();
    const plan = build(root);
    const disclosedAt = "2026-08-14T12:00:00.000Z";
    writeFileSync(resolve(root, "assets/evidence/t019-heart-cards-controller-disclosure-attestation-v1.json"), `${JSON.stringify(buildT019ControllerDisclosure(root, plan, disclosedAt), null, 2)}\n`);

    // Healthy: 252.90 funds this task and leaves exactly 3.90 over the remaining plan.
    const healthy = buildT019Presentation(root, plan, { credits: 252.9, provider_observed_at: disclosedAt });
    expect(healthy.balance_disclosure).toMatchObject({ covers_total_cap: true, covers_remaining_plan: true, headroom_after_t019_decimal: "3.90" });

    // Short: 245.00 still covers T019's own 9.00, but leaves 236.00 against 240.00 planned.
    const short = buildT019Presentation(root, plan, { credits: 245, provider_observed_at: disclosedAt });
    expect(short.balance_disclosure).toMatchObject({ covers_total_cap: true, covers_remaining_plan: false, headroom_after_t019_decimal: "-4.00" });
    // Reported, not refused: building the presentation is exactly how the human gets told.
    expect(short.authorized).toBe(false);
  });

  test("a balance below this task's own cap is reported too", async () => {
    const { buildT019ControllerDisclosure, buildT019Presentation, buildT019Plan: build } = await import("../../scripts/assets/t019-heart-cards-production-v1");
    const root = disclosureRoot();
    const plan = build(root);
    const disclosedAt = "2026-08-14T12:00:00.000Z";
    writeFileSync(resolve(root, "assets/evidence/t019-heart-cards-controller-disclosure-attestation-v1.json"), `${JSON.stringify(buildT019ControllerDisclosure(root, plan, disclosedAt), null, 2)}\n`);
    const broke = buildT019Presentation(root, plan, { credits: 8.99, provider_observed_at: disclosedAt });
    expect(broke.balance_disclosure).toMatchObject({ covers_total_cap: false, covers_remaining_plan: false });
    // `init` is the gate for this one; the disclosure's job is to say it out loud first.
  });
});
