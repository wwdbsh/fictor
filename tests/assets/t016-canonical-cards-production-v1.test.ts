import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { beforeAll, describe, expect, test } from "vitest";

import { t020GetCostRequest } from "../../scripts/assets/t020-world-art-production-v1-ops";
import {
  T016_CORE_PLAN_PATH, T016_CORE_PLAN_SHA256, T016_V1_ASPECT_TOLERANCE_PPM, T016_V1_ASSET_COUNT, T016_V1_BATCH_COUNT,
  T016_V1_BATCH_MAX, T016_V1_BATCH_SIZES, T016_V1_CANARY_BATCH_ID, T016_V1_CONTACT_SEGMENT_DIR,
  T016_V1_EXACT_APPROVAL_PHRASE, T016_V1_EXPECTED_MODEL, T016_V1_ID_LIST_SHA256, T016_V1_JOURNAL_PATH,
  T016_V1_LOSS_ACKNOWLEDGMENT_PHRASE, T016_V1_RECOVERY_OPERATOR_PHRASE, T016_V1_REMAINING_PLAN_AFTER_T016_UNITS,
  T016_V1_REMAINING_PLAN_BREAKDOWN, T016_V1_RESUME_OPERATOR_PHRASE, T016_V1_RISK_TEXT,
  T016_V1_TOTAL_CAP_UNITS, T016_V1_UNIT_COST_UNITS, buildT016Assets, buildT016Batches, buildT016Plan, canonicalJsonT016,
  crossCheckT016EffectivePrompts, decimalT016, isT016Authorized, renderT016Plan, sha256T016, selectT016SelectedAssets,
  t016AspectTolerancePpm, t016PlanSha256, type T016Approval, type T016Plan, type T016Presentation,
} from "../../scripts/assets/t016-canonical-cards-production-v1";
import {
  auditT016, productionContextT016, runT016JobsHandoffInternal, runT016OpsInternal, statusT016, t016BatchModelVerified,
  t016ContractDriftBatches, type T016Dependencies, type T016Journal,
} from "../../scripts/assets/t016-canonical-cards-production-v1-ops";
import { dryRunT016, runT016Preparation } from "../../scripts/assets/t016-canonical-cards-production-v1-cli";
import {
  T016_CANDIDATE_COUNT, T016_MATERIALS_PATH, T016_SELECTION_COUNT, T016_SELECTION_PATH, allocateT016Seats,
  buildT016Candidates, buildT016Selection, loadT016Selection, renderT016Selection, t016SelectionSha256,
} from "../../scripts/assets/t016-canonical-selection-v1";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const EPOCH = Date.parse("2026-08-14T12:00:00.000Z");
const presentation = { evidence_version: "t016-test-presentation" } as unknown as T016Presentation;
const approval = { evidence_version: "t016-test-approval" } as unknown as T016Approval;
const START_UNITS = 24_390;

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

let cachedPlan: T016Plan;
beforeAll(() => { cachedPlan = buildT016Plan(repositoryRoot); });

interface Prepared { root: string; plan: T016Plan }
function fixture(startUnits = START_UNITS): Prepared {
  const root = mkdtempSync(resolve(tmpdir(), "fictor-t016-"));
  mkdirSync(resolve(root, "assets/manifests"), { recursive: true });
  copyFileSync(resolve(repositoryRoot, T016_CORE_PLAN_PATH), resolve(root, T016_CORE_PLAN_PATH));
  const anchor = json(root, "initial-balance.json", { credits: startUnits / 100, provider_observed_at: at(-120) });
  runT016OpsInternal(["init", "--observed-at", at(-60), "--balance-file", anchor], root, cachedPlan, presentation, approval);
  return { root, plan: cachedPlan };
}
function ops(p: Prepared, args: readonly string[]): Record<string, unknown> { return runT016OpsInternal(args, p.root, p.plan, presentation, approval); }
function journalOf(p: Prepared): T016Journal { return JSON.parse(readFileSync(resolve(p.root, T016_V1_JOURNAL_PATH), "utf8")) as T016Journal; }
function deps(bytesFor: (call: number) => Buffer): T016Dependencies {
  let call = 0;
  return { resolve: async () => [{ address: "18.65.3.2", family: 4 }], fetch: async () => ({ status: 200, headers: { "content-type": "image/png" }, bytes: bytesFor(call++), remoteAddress: "::ffff:18.65.3.2" }) };
}
function costItems(plan: T016Plan, batchIndex: number, base: number) {
  return plan.batches[batchIndex].asset_ids.map((id, offset) => {
    const asset = plan.assets.find((a) => a.id === id)!;
    return { index: asset.index, request_sha256: sha256T016(canonicalJsonT016(t020GetCostRequest(asset.request))), cost: { credits: 1, credits_exact: 1.5 }, provider_observed_at: at(base + 1 + offset) };
  });
}
function submission(plan: T016Plan, batchIndex: number) {
  const ids = plan.batches[batchIndex].asset_ids;
  return { submitted_count: ids.length, failed_count: 0, jobs: ids.map((id, offset) => ({ index: plan.assets.find((a) => a.id === id)!.index, job_id: `${plan.batches[batchIndex].id}-job-${String(offset).padStart(2, "0")}`, status: "queued" })) };
}
function wait(plan: T016Plan, batchIndex: number, statuses?: readonly string[], model: string = T016_V1_EXPECTED_MODEL) {
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
  ops(p, ["recovery-open", "--batch", batch.id, "--observed-at", at(base + 42), "--operator-phrase", T016_V1_RECOVERY_OPERATOR_PHRASE]);
  await runT016JobsHandoffInternal(["jobs-handoff", "--batch", batch.id, "--observed-at", at(base + 43)], JSON.stringify(wait(p.plan, index)), p.root, p.plan, presentation, approval, deps((call) => gridPng3x4((index * 16 + call) % 251)));
  const after = before - batch.size * T016_V1_UNIT_COST_UNITS;
  ops(p, ["balance-after", "--batch", batch.id, "--observed-at", at(base + 45), "--file", json(p.root, `a${index}.json`, { credits: after / 100, provider_observed_at: at(base + 44) })]);
  return after;
}

/* ------------------------------------------------------------------------ */

describe("T016 selection — which 160 of the 994", () => {
  test("the pinned manifest yields exactly 160 CANONICAL assets, all 3:4, under cards/", () => {
    expect(sha256T016(readFileSync(resolve(repositoryRoot, T016_CORE_PLAN_PATH)))).toBe(T016_CORE_PLAN_SHA256);
    const selected = selectT016SelectedAssets(repositoryRoot);
    expect(selected).toHaveLength(T016_V1_ASSET_COUNT);
    expect(selected.every(({ aspect_ratio }) => aspect_ratio === "3:4")).toBe(true);
    expect(selected.every(({ path }) => path.startsWith("cards/") && path.endsWith(".png"))).toBe(true);
    expect(sha256T016(`${selected.map(({ id }) => id).join("\n")}\n`)).toBe(T016_V1_ID_LIST_SHA256);
  });

  test("the selection artifact re-derives byte-identically from its pinned inputs", () => {
    // The contract-critical claim of this task is not "160 cards" but "these 160". Both the
    // artifact bytes and a fresh derivation must agree, so an edited artifact — or an edited
    // rule — cannot quietly re-point an approval at a different set.
    const first = buildT016Selection(repositoryRoot);
    const second = buildT016Selection(repositoryRoot);
    expect(renderT016Selection(first)).toBe(renderT016Selection(second));
    expect(readFileSync(resolve(repositoryRoot, T016_SELECTION_PATH), "utf8")).toBe(renderT016Selection(first));
    expect(loadT016Selection(repositoryRoot).sha256).toBe(t016SelectionSha256(first));
  });

  test("a tampered selection artifact is refused rather than obeyed", () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t016-sel-"));
    mkdirSync(resolve(root, "assets/manifests"), { recursive: true });
    mkdirSync(resolve(root, "src/data/source"), { recursive: true });
    copyFileSync(resolve(repositoryRoot, T016_CORE_PLAN_PATH), resolve(root, T016_CORE_PLAN_PATH));
    copyFileSync(resolve(repositoryRoot, T016_MATERIALS_PATH), resolve(root, T016_MATERIALS_PATH));
    const original = JSON.parse(readFileSync(resolve(repositoryRoot, T016_SELECTION_PATH), "utf8")) as { selected: Array<{ id: string }> };
    // Swap one selected id for another real CANONICAL id: the count, the shape and every
    // per-entry field stay valid, so only re-derivation catches it.
    const core = JSON.parse(readFileSync(resolve(repositoryRoot, T016_CORE_PLAN_PATH), "utf8")) as { assets: Array<{ id: string; category: string }> };
    const chosen = new Set(original.selected.map(({ id }) => id));
    const intruder = core.assets.find(({ id, category }) => category === "CANONICAL" && !chosen.has(id))!;
    const tampered = JSON.parse(JSON.stringify(original)) as { selected: Array<Record<string, unknown>> };
    tampered.selected[7].id = intruder.id;
    writeFileSync(resolve(root, T016_SELECTION_PATH), `${JSON.stringify(tampered, null, 2)}\n`);
    expect(() => loadT016Selection(root)).toThrow(/does not match a fresh derivation/);
  });

  test("seats are allocated by integer largest remainder, and they sum to exactly 160", () => {
    // Floating point is avoided on purpose: a rule whose output depends on rounding mode is
    // not reproducible, and this rule's output is what gets paid for.
    const candidates = buildT016Candidates(repositoryRoot);
    const allocations = allocateT016Seats(candidates);
    expect(candidates).toHaveLength(T016_CANDIDATE_COUNT);
    const seats = allocations.reduce((sum, row) => sum + row.base + (row.extra_seat ? 1 : 0), 0);
    expect(seats).toBe(T016_SELECTION_COUNT);
    for (const row of allocations) {
      expect(Number.isInteger(row.base)).toBe(true);
      expect(row.remainder).toBeGreaterThanOrEqual(0);
      expect(row.remainder).toBeLessThan(candidates.length);
      // Nobody may be allocated more seats than their bucket has candidates.
      expect(row.base + (row.extra_seat ? 1 : 0)).toBeLessThanOrEqual(row.candidate_count);
    }
  });

  test("the remainder tie-break is total: strictly by remainder, then by manifest position", () => {
    // Ties are common here (many buckets share a candidate count), so an unspecified
    // tie-break would make the paid set depend on sort implementation. The rule is: higher
    // remainder wins; equal remainders are broken by whichever bucket appears first in the
    // manifest. That makes the order total, so the outcome is reproducible.
    const allocations = allocateT016Seats(buildT016Candidates(repositoryRoot));
    const seated = allocations.filter(({ extra_seat }) => extra_seat);
    const unseated = allocations.filter(({ extra_seat }) => !extra_seat);
    expect(seated.length).toBeGreaterThan(0);
    expect(unseated.length).toBeGreaterThan(0);
    for (const winner of seated) {
      for (const loser of unseated) {
        const outranks = winner.remainder > loser.remainder
          || (winner.remainder === loser.remainder && winner.first_candidate_index < loser.first_candidate_index);
        expect(outranks, `${winner.bucket} vs ${loser.bucket}`).toBe(true);
      }
    }
    // No two buckets can tie completely, which is what makes the comparison above decidable.
    expect(new Set(allocations.map(({ first_candidate_index }) => first_candidate_index)).size).toBe(allocations.length);
    expect(allocateT016Seats(buildT016Candidates(repositoryRoot))).toEqual(allocations);
  });

  test("coverage, not frequency — and the plan says so where an approver will read it", () => {
    // The contract asked for an exposure-frequency score. The inputs for one do not exist in
    // this repository, so claiming to have computed it would be the actual failure here.
    expect(cachedPlan.selection.kind).toBe("COVERAGE_NOT_FREQUENCY");
    expect(cachedPlan.selection.frequency_score_available).toBe(false);
    expect(cachedPlan.scope.selection_kind).toBe("COVERAGE_NOT_FREQUENCY");
    const selection = loadT016Selection(repositoryRoot).value;
    expect(selection.selection_kind).toBe("COVERAGE_NOT_FREQUENCY");
    expect(selection.frequency_score_unavailable.missing_inputs.length).toBeGreaterThan(0);
    // And the rejected alternatives are recorded with their reasons, not just dropped.
    expect(Object.keys(selection.rejected_alternatives).length).toBeGreaterThanOrEqual(2);
    expect(T016_V1_RISK_TEXT).toContain("커버리지");
    expect(T016_V1_RISK_TEXT).toContain("2026-08-21");
  });

  test("34 of the 35 buckets are represented, and no origin group is wiped out", () => {
    // The failure mode this rule exists to prevent: manifest order would have produced 160
    // cards containing zero BURN-origin materials. Whatever else changes, that must not.
    const assets = buildT016Assets(repositoryRoot);
    const representation = loadT016Selection(repositoryRoot).value.group_representation as Record<string, number>;
    expect(Object.keys(representation)).toHaveLength(8);
    expect(Object.keys(representation)).toContain("BURN");
    for (const [group, count] of Object.entries(representation)) expect(count, group).toBeGreaterThan(0);
    expect(Object.values(representation).reduce((sum, n) => sum + n, 0)).toBeGreaterThanOrEqual(T016_SELECTION_COUNT);
    expect(new Set(assets.map(({ bucket }) => bucket)).size).toBe(34);
  });

  test("out-of-scope assets never enter the plan, including the 834 unselected pairs", () => {
    expect(cachedPlan.assets.every(({ category }) => category === "CANONICAL")).toBe(true);
    expect(cachedPlan.scope.unmade_generation_allowed).toBe(false);
    expect(cachedPlan.scope.unmade_after_this_task).toBe(834);
    expect(cachedPlan.scope.style_redecision_allowed).toBe(false);
    expect(cachedPlan.scope.manifest_id_change_allowed).toBe(false);
    // 332 already made + 160 now + 834 never = the full canonical space, with nothing lost.
    expect(332 + T016_V1_ASSET_COUNT + 834).toBe(1_326);
  });

  test("every request carries 3:4, use_unlim false, and the pinned master reference", () => {
    for (const asset of cachedPlan.assets) {
      expect(asset.request.params.aspect_ratio).toBe("3:4");
      expect(asset.request.params.use_unlim).toBe(false);
      expect(asset.request.params.count).toBe(1);
      expect(asset.request.params.medias).toEqual([{ role: "image", value: "e0f36c95-2e1b-4e38-9931-7e10e562f209" }]);
      expect(asset.canonical_request_sha256).toBe(sha256T016(canonicalJsonT016(asset.request)));
    }
    expect(crossCheckT016EffectivePrompts(repositoryRoot, cachedPlan, [0, 11, 12, T016_V1_ASSET_COUNT - 1])).toBe(4);
  });

  test("the 160 land in cards/ on paths disjoint from every other manifest asset", () => {
    // cards/ now has four owners: T015's 332 canonical, T013's 52 materials, T019's 6 hearts,
    // and these 160. The
    // safety property is that the path sets cannot intersect — not whether the run has
    // happened yet. (An earlier task asserted "these files do not exist", which was true only
    // until its own run wrote them; that stale-snapshot mistake is what this shape avoids.)
    const paths = cachedPlan.assets.map(({ path }) => path);
    expect(paths.every((path) => path.startsWith("cards/"))).toBe(true);
    expect(new Set(paths).size).toBe(T016_V1_ASSET_COUNT);
    const core = JSON.parse(readFileSync(resolve(repositoryRoot, T016_CORE_PLAN_PATH), "utf8")) as { assets: Array<{ id: string; path: string }> };
    const chosen = new Set(cachedPlan.assets.map(({ id }) => id));
    const others = new Set(core.assets.filter(({ id }) => !chosen.has(id)).map(({ path }) => path));
    for (const path of paths) expect(others.has(path), path).toBe(false);
  });
});

describe("T016 tolerance table", () => {
  test("3:4 is the only declared aspect, and anything else throws rather than defaulting", () => {
    expect(t016AspectTolerancePpm("3:4")).toBe(5_000);
    expect(T016_V1_ASPECT_TOLERANCE_PPM).toEqual({ "3:4": 5_000 });
    // T020's 16:9 allowance is not declared here at all. An absent entry cannot leak, and the
    // lookup refuses rather than silently picking a default.
    expect(() => t016AspectTolerancePpm("16:9")).toThrow(/no declared tolerance for aspect 16:9/);
    expect(cachedPlan.assets.every(({ aspect_ratio }) => aspect_ratio === "3:4")).toBe(true);
  });

  test("the observed 3:4 grid geometry is inside tolerance and a wider plate is not", () => {
    const ppm = (w: number, h: number, ew: number, eh: number) => Math.ceil((Math.abs(w * eh - h * ew) * 1_000_000) / (h * ew));
    // The real delivered geometry: the same 32-px grid artifact as 16:9, but inside 5000.
    expect(ppm(896, 1200, 3, 4)).toBe(4_445);
    expect(ppm(896, 1200, 3, 4)).toBeLessThanOrEqual(t016AspectTolerancePpm("3:4"));
    // A plate that T020's 16:9 allowance would have admitted is refused here.
    expect(ppm(908, 1200, 3, 4)).toBe(8_889);
    expect(ppm(908, 1200, 3, 4)).toBeGreaterThan(t016AspectTolerancePpm("3:4"));
    expect(ppm(908, 1200, 3, 4)).toBeLessThanOrEqual(12_500);
  });
});

describe("T016 batching and cap", () => {
  test("fourteen batches of at most twelve, covering every asset exactly once", () => {
    expect(cachedPlan.batches.map(({ size }) => size)).toEqual([...T016_V1_BATCH_SIZES]);
    expect(cachedPlan.batches.reduce((sum, { size }) => sum + size, 0)).toBe(T016_V1_ASSET_COUNT);
    expect(cachedPlan.batches.every(({ size }) => size <= T016_V1_BATCH_MAX)).toBe(true);
    expect(cachedPlan.batches.every(({ aspect_ratio }) => aspect_ratio === "3:4")).toBe(true);
    expect(new Set(cachedPlan.batches.flatMap(({ asset_ids }) => asset_ids)).size).toBe(T016_V1_ASSET_COUNT);
    expect(cachedPlan.batches[0].id).toBe(T016_V1_CANARY_BATCH_ID);
    expect(cachedPlan.batches).toHaveLength(T016_V1_BATCH_COUNT);
    // 13 full batches plus a 4-asset tail. The tail is what 160 leaves over at the batch
    // maximum, so the largest single ambiguous window is 12 x 1.50 = 18.00, not the cap.
    expect(cachedPlan.batches.filter(({ size }) => size === T016_V1_BATCH_MAX)).toHaveLength(13);
    expect(cachedPlan.batches.at(-1)!.size).toBe(4);
    expect(13 * T016_V1_BATCH_MAX + 4).toBe(T016_V1_ASSET_COUNT);
    expect(cachedPlan.retry_policy.ambiguous_window_max_exposure_decimal).toBe("18.00");
    // Every batch is drawn from a contiguous run of the selection, so the partition cannot
    // silently drop or duplicate a card between batches.
    expect(cachedPlan.batches.flatMap(({ asset_ids }) => asset_ids)).toEqual(cachedPlan.assets.map(({ id }) => id));
  });

  test("160 requests at 1.50 is exactly the 240.00 cap", () => {
    expect(T016_V1_ASSET_COUNT * T016_V1_UNIT_COST_UNITS).toBe(T016_V1_TOTAL_CAP_UNITS);
    expect(decimalT016(T016_V1_TOTAL_CAP_UNITS)).toBe("240.00");
    expect(cachedPlan.budget.legacy_committed_units).toBe(0);
  });

  test("the cumulative budget shows 3.90 of slack against an 18.00 window, with nothing after", () => {
    // T016 is the last paid task, so the honest statement is not "the rest of the plan breaks"
    // but "this task closes with fewer cards": headroom cannot buy back even the 4-asset tail.
    expect(cachedPlan.cumulative_budget).toMatchObject({
      balance_at_disclosure_decimal: "243.90", this_task_cap_decimal: "240.00",
      projected_balance_after_t016_decimal: "3.90", remaining_plan_after_t016_decimal: "0.00",
      headroom_after_t016_decimal: "3.90", is_final_paid_task: true, remaining_plan_task_count: 0,
      a_lost_batch_reduces_this_task_scope: true, headroom_covers_smallest_batch_loss: false,
      max_single_batch_exposure_decimal: "18.00",
    });
    // The headroom really is smaller than the cheapest thing a lost batch can cost.
    expect(390).toBeLessThan(4 * T016_V1_UNIT_COST_UNITS);
    expect(T016_V1_RISK_TEXT).toContain("148장");
    expect(T016_V1_RISK_TEXT).toContain("3.90");
    expect(T016_V1_RISK_TEXT).toContain("240.00");
  });

  test("a partitioner given the wrong count fails loudly", () => {
    expect(() => buildT016Batches(cachedPlan.assets.slice(0, 3))).toThrow(/needs exactly 160 assets/);
  });
});

describe("T016 plan determinism", () => {
  test("same pinned inputs derive the same bytes, and the tracked plan matches", () => {
    expect(renderT016Plan(buildT016Plan(repositoryRoot))).toBe(renderT016Plan(cachedPlan));
    expect(t016PlanSha256(buildT016Plan(repositoryRoot))).toBe(t016PlanSha256(cachedPlan));
    expect(readFileSync(resolve(repositoryRoot, "assets/manifests/t016-canonical-cards-v1.plan.json"), "utf8")).toBe(renderT016Plan(cachedPlan));
  });

  test("derivation reads no clock and no randomness", () => {
    const source = readFileSync(resolve(repositoryRoot, "scripts/assets/t016-canonical-cards-production-v1.ts"), "utf8");
    expect(source).not.toMatch(/Date\.now\(\)/);
    expect(source).not.toMatch(/Math\.random\(\)/);
    expect(renderT016Plan(cachedPlan)).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe("T016 phrase binding", () => {
  test("the approval phrase is bound byte-exactly and the four phrases are distinct", () => {
    expect(T016_V1_EXACT_APPROVAL_PHRASE).toBe("T016 canonical 선별 카드 160장 생성을 승인한다. 한도 240.00 크레딧.");
    expect(cachedPlan.approval_gate.exact_phrase).toBe(T016_V1_EXACT_APPROVAL_PHRASE);
    expect(new Set([T016_V1_EXACT_APPROVAL_PHRASE, T016_V1_RECOVERY_OPERATOR_PHRASE, T016_V1_RESUME_OPERATOR_PHRASE, T016_V1_LOSS_ACKNOWLEDGMENT_PHRASE]).size).toBe(4);
    expect(T016_V1_RISK_TEXT).toContain(T016_V1_EXACT_APPROVAL_PHRASE);
  });

  test("operator gates refuse a near-miss phrase", () => {
    const p = fixture();
    const id = p.plan.batches[0].id;
    expect(() => ops(p, ["resume", "--observed-at", at(1), "--operator-phrase", "T016 재개"])).toThrow(/exact operator phrase/);
    expect(() => ops(p, ["recovery-open", "--batch", id, "--observed-at", at(1), "--operator-phrase", `${T016_V1_RECOVERY_OPERATOR_PHRASE} `])).toThrow(/exact phrase/);
  });
});

describe("T016 paid discipline", () => {
  test("the run closes at exactly 240.00 with all 160 cards in both roots", async () => {
    const p = fixture();
    let balance = START_UNITS;
    for (let index = 0; index < T016_V1_BATCH_COUNT; index += 1) balance = await runBatch(p, index, balance, 100 + index * 1000);
    expect(balance).toBe(START_UNITS - T016_V1_TOTAL_CAP_UNITS);
    const journal = journalOf(p);
    expect(journal.run_state).toBe("COMPLETE");
    expect(statusT016(journal)).toMatchObject({ recovered_assets: T016_V1_ASSET_COUNT, total_delta_units: 24_000, acknowledged_loss_units: 0, paid_retry_count: 0 });
    for (const record of journal.batches) {
      expect(t016BatchModelVerified(record)).toBe(true);
      for (const recovery of record.recoveries) {
        expect(recovery.aspect_error_ppm).toBe(4_445);
        expect(recovery.local_relative_path.startsWith("cards/")).toBe(true);
        expect(existsSync(resolve(p.root, "public/assets", recovery.local_relative_path))).toBe(true);
        expect(existsSync(resolve(p.root, "assets/backups/t016-canonical-cards", recovery.backup_relative_path))).toBe(true);
      }
    }
  }, 120_000);

  test("audit reports the delivery split and per-bucket coverage", async () => {
    const p = fixture();
    let balance = START_UNITS;
    for (let index = 0; index < T016_V1_BATCH_COUNT; index += 1) balance = await runBatch(p, index, balance, 100 + index * 1000);
    const audit = auditT016({ root: p.root, plan: p.plan, presentation, approval }, journalOf(p), at(9_000));
    expect(audit).toMatchObject({
      run_state: "COMPLETE", exact_closure: true, assets_recovered: T016_V1_ASSET_COUNT, assets_planned: T016_V1_ASSET_COUNT,
      assets_not_delivered: 0, assets_paid_and_lost: 0, closes_at_exact_cap: true, total_delta_units: 24_000,
    });
    // Coverage is the selection's whole claim, so the audit reports what was actually
    // delivered per bucket rather than only a total.
    const byBucket = audit.recovered_by_bucket as Record<string, number>;
    expect(Object.keys(byBucket)).toHaveLength(34);
    expect(Object.values(byBucket).reduce((sum, n) => sum + n, 0)).toBe(T016_V1_ASSET_COUNT);
  }, 120_000);

  test("init requires a balance covering the 240.00 cap", () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t016-poor-"));
    mkdirSync(resolve(root, "assets/manifests"), { recursive: true });
    expect(() => runT016OpsInternal(["init", "--observed-at", at(-60), "--balance-file", json(root, "b.json", { credits: 239.99, provider_observed_at: at(-120) })], root, cachedPlan, presentation, approval)).toThrow(/does not cover the 240.00 cap/);
  });

  test("a batch is submitted once and an ambiguous window is never re-run", () => {
    const p = fixture();
    const id = p.plan.batches[0].id;
    ops(p, ["preflight-request", "--batch", id, "--observed-at", at(0)]);
    ops(p, ["preflight-result", "--batch", id, "--observed-at", at(20), "--cost-file", json(p.root, "c.json", { costs: costItems(p.plan, 0, 0) }), "--balance-file", json(p.root, "b.json", { credits: START_UNITS / 100, provider_observed_at: at(19) })]);
    ops(p, ["prepare", "--batch", id, "--observed-at", at(40)]);
    expect(() => ops(p, ["ambiguous", "--batch", id, "--observed-at", at(41), "--reason", "TIMEOUT"])).toThrow(/AMBIGUOUS_SUBMISSION/);
    expect(journalOf(p).run_state).toBe("FAIL_STOP");
    const status = statusT016(journalOf(p));
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
    ops(p, ["recovery-open", "--batch", id, "--observed-at", at(42), "--operator-phrase", T016_V1_RECOVERY_OPERATOR_PHRASE]);
    await expect(runT016JobsHandoffInternal(["jobs-handoff", "--batch", id, "--observed-at", at(43)], JSON.stringify(wait(p.plan, 0, undefined, "some_other_model")), p.root, p.plan, presentation, approval, deps(() => gridPng3x4(1)))).rejects.toThrow(/MODEL_DRIFT/);
    expect(t016ContractDriftBatches(journalOf(p))).toEqual([{ batch_id: id, code: "MODEL_DRIFT" }]);
  });

  test("an out-of-tolerance 3:4 delivery is refused and never stored", async () => {
    const p = fixture();
    const id = p.plan.batches[0].id;
    ops(p, ["preflight-request", "--batch", id, "--observed-at", at(0)]);
    ops(p, ["preflight-result", "--batch", id, "--observed-at", at(20), "--cost-file", json(p.root, "c.json", { costs: costItems(p.plan, 0, 0) }), "--balance-file", json(p.root, "b.json", { credits: START_UNITS / 100, provider_observed_at: at(19) })]);
    ops(p, ["prepare", "--batch", id, "--observed-at", at(40)]);
    ops(p, ["response", "--batch", id, "--observed-at", at(41), "--file", json(p.root, "s.json", submission(p.plan, 0))]);
    ops(p, ["recovery-open", "--batch", id, "--observed-at", at(42), "--operator-phrase", T016_V1_RECOVERY_OPERATOR_PHRASE]);
    await expect(runT016JobsHandoffInternal(["jobs-handoff", "--batch", id, "--observed-at", at(43)], JSON.stringify(wait(p.plan, 0)), p.root, p.plan, presentation, approval, deps(() => png(16, 9, 3)))).rejects.toThrow(/ASPECT_MISMATCH/);
    expect(journalOf(p).batches[0].recoveries).toHaveLength(0);
    expect(journalOf(p).batches[0].terminals.at(-1)!.facts).toMatchObject({ expected_aspect_ratio: "3:4", aspect_tolerance_ppm: 5_000 });
  });
});

describe("T016 poll intake integrity", () => {
  async function opened(p: Prepared): Promise<string> {
    const id = p.plan.batches[0].id;
    ops(p, ["preflight-request", "--batch", id, "--observed-at", at(0)]);
    ops(p, ["preflight-result", "--batch", id, "--observed-at", at(20), "--cost-file", json(p.root, "c.json", { costs: costItems(p.plan, 0, 0) }), "--balance-file", json(p.root, "b.json", { credits: START_UNITS / 100, provider_observed_at: at(19) })]);
    ops(p, ["prepare", "--batch", id, "--observed-at", at(40)]);
    ops(p, ["response", "--batch", id, "--observed-at", at(41), "--file", json(p.root, "s.json", submission(p.plan, 0))]);
    ops(p, ["recovery-open", "--batch", id, "--observed-at", at(42), "--operator-phrase", T016_V1_RECOVERY_OPERATOR_PHRASE]);
    return id;
  }

  test("a poll repeating one job is refused", async () => {
    const p = fixture();
    const id = await opened(p);
    const payload = wait(p.plan, 0) as { jobs: Array<Record<string, unknown>> };
    payload.jobs = payload.jobs.map(() => payload.jobs[0]);
    await expect(runT016JobsHandoffInternal(["jobs-handoff", "--batch", id, "--observed-at", at(43)], JSON.stringify(payload), p.root, p.plan, presentation, approval, deps(() => gridPng3x4(1)))).rejects.toThrow(/RECOVERY_FAILED/);
    expect(journalOf(p).batches[0].recoveries).toHaveLength(0);
  });

  test("retryable must be present and boolean exactly when status is lookup_failed", async () => {
    const p = fixture();
    const id = await opened(p);
    const payload = wait(p.plan, 0) as { jobs: Array<Record<string, unknown>> };
    payload.jobs[0].retryable = true;
    await expect(runT016JobsHandoffInternal(["jobs-handoff", "--batch", id, "--observed-at", at(43)], JSON.stringify(payload), p.root, p.plan, presentation, approval, deps(() => gridPng3x4(1)))).rejects.toThrow(/RECOVERY_FAILED/);
  });
});

describe("T016 contact sheet links — the T020 v2 carry-over", () => {
  test("index links are built from the same constant as the segment directory", () => {
    const source = readFileSync(resolve(repositoryRoot, "scripts/assets/t016-canonical-cards-production-v1-ops.ts"), "utf8");
    // The v2 defect was a literal in the link template that named another version's
    // directory. Both sides must derive from the constant, and no other version may appear.
    expect(source).toContain("${T016_V1_CONTACT_SEGMENT_DIR}/segment-");
    expect(source).not.toMatch(/href="t020-world-art/);
    expect(source).not.toMatch(/href="t015-/);
    expect(T016_V1_CONTACT_SEGMENT_DIR).toBe("t016-canonical-cards-v1");
  });

  test("the generated index links resolve to the generated segment files", async () => {
    const p = fixture();
    let balance = START_UNITS;
    for (let index = 0; index < T016_V1_BATCH_COUNT; index += 1) balance = await runBatch(p, index, balance, 100 + index * 1000);
    auditT016({ root: p.root, plan: p.plan, presentation, approval }, journalOf(p), at(9_000));
    const indexPath = resolve(p.root, "docs/asset-runs/contact-sheets", `${T016_V1_CONTACT_SEGMENT_DIR}.html`);
    const index = readFileSync(indexPath, "utf8");
    const hrefs = [...index.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toHaveLength(T016_V1_BATCH_COUNT);
    for (const href of hrefs) expect(existsSync(resolve(p.root, "docs/asset-runs/contact-sheets", href)), href).toBe(true);
    // And every asset appears exactly once across the segments.
    const srcs = hrefs.flatMap((href) => [...readFileSync(resolve(p.root, "docs/asset-runs/contact-sheets", href), "utf8").matchAll(/src="([^"]+)"/g)].map((m) => m[1]));
    expect(new Set(srcs).size).toBe(T016_V1_ASSET_COUNT);
    expect(index).not.toMatch(/<img\b/i);
  }, 120_000);
});

describe("T016 entry gates and preparation", () => {
  test("an unapproved root is refused before any production command runs", () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t016-unapproved-"));
    mkdirSync(resolve(root, "assets/evidence"), { recursive: true });
    expect(() => productionContextT016("status", () => new Date(), root)).toThrow();
    expect(isT016Authorized(root, cachedPlan)).toBe(false);
  });

  test("the committed-clean gate passes on a committed scope and fails once it is dirtied", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t016-git-"));
    const binding = JSON.parse(readFileSync(resolve(repositoryRoot, "assets/evidence/t016-canonical-cards-implementation-binding-v1.json"), "utf8")) as { files: Record<string, { path: string }> };
    const tracked = [...Object.values(binding.files).map(({ path }) => path), "assets/evidence/t016-canonical-cards-implementation-binding-v1.json", "assets/manifests/t016-canonical-cards-v1.plan.json"];
    for (const path of tracked) { mkdirSync(resolve(root, path, ".."), { recursive: true }); copyFileSync(resolve(repositoryRoot, path), resolve(root, path)); }
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
    git("init", "-q"); git("config", "user.email", "t016@test.invalid"); git("config", "user.name", "t016 test");
    git("add", ...tracked); git("commit", "-q", "-m", "t016 binding scope");
    const { assertT016CommittedClean } = await import("../../scripts/assets/t016-canonical-cards-production-v1-ops");
    expect(() => assertT016CommittedClean(root)).not.toThrow();
    const plan = resolve(root, "assets/manifests/t016-canonical-cards-v1.plan.json");
    writeFileSync(plan, `${readFileSync(plan, "utf8")} `);
    expect(() => assertT016CommittedClean(root)).toThrow(/not committed-clean/);
  });

  test("gen and binding-gen refuse once a run journal exists", () => {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t016-journal-"));
    mkdirSync(resolve(root, "assets/runs/t016-canonical-cards"), { recursive: true });
    writeFileSync(resolve(root, T016_V1_JOURNAL_PATH), "{}\n");
    expect(() => runT016Preparation(["gen"], root)).toThrow(/refused while a run journal exists/);
    expect(() => runT016Preparation(["binding-gen"], root)).toThrow(/refused while a run journal exists/);
  });

  test("dry-run derives everything without submitting or writing", () => {
    const result = dryRunT016(repositoryRoot);
    expect(result).toMatchObject({
      submitted_anything: false, wrote_anything: false, asset_count: T016_V1_ASSET_COUNT, batch_count: T016_V1_BATCH_COUNT,
      planned_spend_units: 24_000, total_credit_cap_units: 24_000, canary_batch_id: T016_V1_CANARY_BATCH_ID,
    });
    expect(result.batch_sizes).toEqual([...T016_V1_BATCH_SIZES]);
    expect(result.aspect_ratio_counts).toEqual({ "3:4": T016_V1_ASSET_COUNT });
    expect(result.aspect_tolerance_ppm).toEqual({ "3:4": 5_000 });
    expect(result.bucket_count).toBe(34);
    expect(result.plan_sha256).toBe(t016PlanSha256(cachedPlan));
    expect(result.disclosure_chain_status).toBe(result.authorized ? "approved" : "pending approval");
  });

  test("the binding pins the selection rule, the shared transport and both T020 sources, never package.json", () => {
    const files = cachedPlan.sources.implementation_binding.files as Record<string, { path: string; sha256: string }>;
    const paths = Object.values(files).map(({ path }) => path);
    // The selection module decides which 160 get paid for, so it is runtime and must be
    // pinned: editing the rule after approval has to invalidate the binding, not pass silently.
    expect(paths).toContain("scripts/assets/t016-canonical-selection-v1.ts");
    expect(paths).toContain("scripts/assets/provider-transport.ts");
    expect(paths).toContain("scripts/assets/t020-world-art-production-v1.ts");
    expect(paths).toContain("scripts/assets/t020-world-art-production-v1-ops.ts");
    expect(paths).not.toContain("package.json");
    for (const [key, entry] of Object.entries(files)) expect(entry.sha256, key).toBe(sha256T016(readFileSync(resolve(repositoryRoot, entry.path))));
  });

  test("the selection artifact's sha is carried in the plan, so the 160 cannot be swapped", () => {
    // Pinning the rule is not enough on its own: the artifact is what the run actually reads.
    expect(cachedPlan.selection.artifact_path).toBe(T016_SELECTION_PATH);
    expect(cachedPlan.selection.artifact_sha256).toBe(sha256T016(readFileSync(resolve(repositoryRoot, T016_SELECTION_PATH))));
    expect(cachedPlan.selection.id_list_sha256).toBe(T016_V1_ID_LIST_SHA256);
    expect(cachedPlan.selection.first_id).toBe(cachedPlan.assets[0].id);
    expect(cachedPlan.selection.last_id).toBe(cachedPlan.assets.at(-1)!.id);
  });
});

describe("T016 budget arithmetic and the observed-balance path", () => {
  test("the published breakdown sums to the total the headroom is derived from", () => {
    // MINOR-1: the approver reads the decomposition while the headroom comes from the total.
    // Both now derive from one list, so they cannot disagree — this pins that they don't.
    expect(T016_V1_REMAINING_PLAN_BREAKDOWN.reduce((sum, { credit_units }) => sum + credit_units, 0)).toBe(T016_V1_REMAINING_PLAN_AFTER_T016_UNITS);
    for (const entry of T016_V1_REMAINING_PLAN_BREAKDOWN) expect(entry.credit_decimal, entry.task).toBe(decimalT016(entry.credit_units));
    const scope = cachedPlan.cumulative_budget;
    expect(scope.remaining_plan_after_t016_decimal).toBe(decimalT016(T016_V1_REMAINING_PLAN_AFTER_T016_UNITS));
    expect(scope.remaining_plan_breakdown.reduce((sum, { credit_units }) => sum + credit_units, 0)).toBe(T016_V1_REMAINING_PLAN_AFTER_T016_UNITS);
    // And the headroom really is balance − cap − remaining plan, not a typed-in figure.
    expect(scope.headroom_after_t016_decimal).toBe(decimalT016(START_UNITS - T016_V1_TOTAL_CAP_UNITS - T016_V1_REMAINING_PLAN_AFTER_T016_UNITS));
    // The last paid task has nothing after it, so the breakdown is empty by construction —
    // and the headroom is then simply what the cap leaves behind.
    expect(T016_V1_REMAINING_PLAN_BREAKDOWN).toHaveLength(0);
    expect(T016_V1_REMAINING_PLAN_AFTER_T016_UNITS).toBe(0);
  });

  /**
   * MINOR-2. `covers_remaining_plan` is reported, not enforced — deliberately. A balance that
   * cannot fund the rest of the plan is a planning decision for whoever approves (the run
   * shrinks), not a safety property of T016, whose own affordability is already gated by `init`
   * refusing a
   * balance under the 240.00 cap. Gating here would block a legitimate "we accept the re-scope"
   * answer. What must never happen is the artifact hiding it, which is what this pins.
   */
  function disclosureRoot(): string {
    const root = mkdtempSync(resolve(tmpdir(), "fictor-t016-disclosure-"));
    const binding = JSON.parse(readFileSync(resolve(repositoryRoot, "assets/evidence/t016-canonical-cards-implementation-binding-v1.json"), "utf8")) as { files: Record<string, { path: string }> };
    const needed = [
      ...Object.values(binding.files).map(({ path }) => path),
      "assets/evidence/t016-canonical-cards-implementation-binding-v1.json",
      "assets/manifests/core-v1.plan.json", "assets/manifests/master-style-v1.json", "assets/manifests/material-style-approval-v1.json",
      // The selection artifact and its own inputs: the plan re-derives the 160 from these.
      T016_SELECTION_PATH, T016_MATERIALS_PATH,
    ];
    for (const path of needed) { mkdirSync(resolve(root, path, ".."), { recursive: true }); copyFileSync(resolve(repositoryRoot, path), resolve(root, path)); }
    return root;
  }

  test("a balance that cannot fund the remaining plan is reported, not hidden", async () => {
    const { buildT016ControllerDisclosure, buildT016Presentation, buildT016Plan: build } = await import("../../scripts/assets/t016-canonical-cards-production-v1");
    const root = disclosureRoot();
    const plan = build(root);
    const disclosedAt = "2026-08-14T12:00:00.000Z";
    writeFileSync(resolve(root, "assets/evidence/t016-canonical-cards-controller-disclosure-attestation-v1.json"), `${JSON.stringify(buildT016ControllerDisclosure(root, plan, disclosedAt), null, 2)}\n`);

    // Healthy: 243.90 funds the full 240.00 and leaves exactly 3.90 over.
    const healthy = buildT016Presentation(root, plan, { credits: 243.9, provider_observed_at: disclosedAt });
    expect(healthy.balance_disclosure).toMatchObject({ covers_total_cap: true, covers_remaining_plan: true, headroom_after_t016_decimal: "3.90" });

    // Short: 239.99 no longer funds the cap. Being the last task, "cannot fund the remaining
    // plan" and "cannot fund this task" collapse into the same statement — so the artifact has
    // to say the cap is uncovered rather than quietly reporting a healthy remaining plan.
    const short = buildT016Presentation(root, plan, { credits: 239.99, provider_observed_at: disclosedAt });
    expect(short.balance_disclosure).toMatchObject({ covers_total_cap: false, covers_remaining_plan: false, headroom_after_t016_decimal: "-0.01" });
    // Reported, not refused: building the presentation is exactly how the human gets told.
    expect(short.authorized).toBe(false);
  });

  test("a balance below this task's own cap is reported too", async () => {
    const { buildT016ControllerDisclosure, buildT016Presentation, buildT016Plan: build } = await import("../../scripts/assets/t016-canonical-cards-production-v1");
    const root = disclosureRoot();
    const plan = build(root);
    const disclosedAt = "2026-08-14T12:00:00.000Z";
    writeFileSync(resolve(root, "assets/evidence/t016-canonical-cards-controller-disclosure-attestation-v1.json"), `${JSON.stringify(buildT016ControllerDisclosure(root, plan, disclosedAt), null, 2)}\n`);
    const broke = buildT016Presentation(root, plan, { credits: 8.99, provider_observed_at: disclosedAt });
    expect(broke.balance_disclosure).toMatchObject({ covers_total_cap: false, covers_remaining_plan: false });
    // `init` is the gate for this one; the disclosure's job is to say it out loud first.
  });
});
