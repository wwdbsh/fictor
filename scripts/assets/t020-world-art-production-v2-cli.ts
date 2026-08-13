import { randomUUID } from "node:crypto";
import { closeSync, constants, existsSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicWriteJson, safeResolve } from "./filesystem";
import {
  T020_V2_APPROVAL_PATH, T020_V2_PAID_ASSET_COUNT, T020_V2_LEGACY_ASSET_COUNT, T020_V2_BATCH_COUNT, T020_V2_BINDING_PATH, T020_V2_CANARY_BATCH_ID,
  T020_V2_CONTROLLER_APPROVAL_PATH, T020_V2_CONTROLLER_DISCLOSURE_PATH, T020_V2_EXACT_APPROVAL_PHRASE, T020_V2_EXPECTED_MODEL,
  T020_V2_FORENSICS_PATH, T020_V2_JOURNAL_PATH, T020_V2_PENDING_PATH, T020_V2_PLAN_PATH, T020_V2_PRESENTATION_PATH, T020_V2_RISK_PATH, T020_V2_SCHEMA_PATH, T020_V2_TOTAL_CAP_UNITS,
  buildT020V2Approval, buildT020V2Binding, buildT020V2ControllerApproval, buildT020V2ControllerDisclosure, buildT020V2Forensics, buildT020V2Pending, buildT020V2Plan,
  buildT020V2Presentation, buildT020V2Risk, buildT020V2Schema, decimalT020, isT020V2Authorized, loadT020V2Binding, parseT020BalanceFile,
  renderT020CanonicalJson, renderT020V2Plan, sha256T020, t020V2PlanSha256,
  validateT020V2Approval, validateT020V2ControllerApproval, validateT020V2ControllerDisclosure, validateT020V2Presentation,
  type T020BalanceObservation, type T020V2Plan, type T020V2Presentation,
} from "./t020-world-art-production-v2";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
function option(args: readonly string[], name: string): string { const index = args.indexOf(name); const value = index < 0 ? undefined : args[index + 1]; if (!value || value.startsWith("--")) throw new Error(`missing ${name}`); return value; }
function optional(args: readonly string[], name: string): string | undefined { const index = args.indexOf(name); if (index < 0) return undefined; return option(args, name); }

export function writeT020V2NoClobber(root: string, path: string, value: unknown): string {
  const target = resolve(root, path);
  const bytes = renderT020CanonicalJson(value);
  if (existsSync(target)) { if (lstatSync(target).isSymbolicLink() || readFileSync(target, "utf8") !== bytes) throw new Error("T020 v2 evidence no-clobber conflict"); return bytes; }
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try { writeFileSync(descriptor, bytes); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  try {
    try { linkSync(temporary, target); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; if (lstatSync(target).isSymbolicLink() || readFileSync(target, "utf8") !== bytes) throw new Error("T020 v2 evidence no-clobber conflict"); }
    unlinkSync(temporary);
  } finally { rmSync(temporary, { force: true }); }
  return bytes;
}

export function checkT020V2Preparation(root = repositoryRoot): { plan: T020V2Plan; plan_sha256: string; pending_sha256: string; authorized: boolean } {
  const binding = loadT020V2Binding(root);
  const risk = buildT020V2Risk();
  const schema = buildT020V2Schema();
  const forensics = buildT020V2Forensics(root);
  const plan = buildT020V2Plan(root);
  const pending = buildT020V2Pending(root, plan);
  const expected = [[T020_V2_BINDING_PATH, binding], [T020_V2_RISK_PATH, risk], [T020_V2_SCHEMA_PATH, schema], [T020_V2_FORENSICS_PATH, forensics], [T020_V2_PLAN_PATH, plan], [T020_V2_PENDING_PATH, pending]] as const;
  for (const [path, value] of expected) {
    const bytes = readFileSync(resolve(root, path), "utf8");
    const rendered = path === T020_V2_PLAN_PATH ? renderT020V2Plan(plan) : renderT020CanonicalJson(value);
    if (bytes !== rendered) throw new Error(`tracked T020 v2 artifact changed: ${path}`);
  }
  return { plan, plan_sha256: t020V2PlanSha256(plan), pending_sha256: sha256T020(renderT020CanonicalJson(pending)), authorized: isT020V2Authorized(root, plan) };
}

function summary(command: string, result: ReturnType<typeof checkT020V2Preparation>): Record<string, unknown> {
  return {
    command, plan_sha256: result.plan_sha256, pending_disclosure_sha256: result.pending_sha256, authorized: result.authorized,
    paid_assets: T020_V2_PAID_ASSET_COUNT, legacy_assets: T020_V2_LEGACY_ASSET_COUNT, batches: T020_V2_BATCH_COUNT,
    new_credit_cap_units: T020_V2_TOTAL_CAP_UNITS, new_credit_cap_decimal: decimalT020(T020_V2_TOTAL_CAP_UNITS),
    automatic_paid_retry_reserve_decimal: "0.00",
  };
}

function loadBalance(root: string, path: string | undefined): T020BalanceObservation | null {
  if (path === undefined) return null;
  // Operator-supplied observations stay inside the repository so safeResolve can reject
  // absolute paths, traversal, and symlinks before the disclosure is built.
  if (isAbsolute(path) || path.includes("\\") || path.split("/").some((part) => part === "" || part === "." || part === "..")) throw new Error("T020 v2 --balance-file must be a repository-relative path");
  const target = safeResolve(root, path);
  const info = lstatSync(target);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error("T020 v2 balance file must be a regular file");
  return parseT020BalanceFile(JSON.parse(readFileSync(target, "utf8")) as unknown);
}

/**
 * Read-only end-to-end derivation check. It submits nothing, contacts nothing, and writes
 * nothing: it re-derives the plan from the pinned manifest, re-verifies every tracked
 * artifact byte-for-byte, cross-checks a sample of effective prompts, and reports the
 * layout an operator would be approving.
 */
export function dryRunT020V2(root = repositoryRoot): Record<string, unknown> {
  const checked = checkT020V2Preparation(root);
  const plan = checked.plan;
  const batches = plan.batches.map((batch) => ({ batch_id: batch.id, group: batch.group, aspect_ratio: batch.aspect_ratio, size: batch.size, credit_units: batch.size * 150, credit_decimal: decimalT020(batch.size * 150), first_asset_id: batch.asset_ids[0], last_asset_id: batch.asset_ids.at(-1) }));
  const plannedUnits = plan.batches.reduce((sum, batch) => sum + batch.size * 150, 0);
  if (plannedUnits !== T020_V2_TOTAL_CAP_UNITS) throw new Error("T020 v2 dry-run: planned spend does not equal the new cap");
  return {
    command: "dry-run", submitted_anything: false, wrote_anything: false,
    plan_sha256: checked.plan_sha256, pending_disclosure_sha256: checked.pending_sha256,
    legacy_asset_count: plan.legacy_recovery.asset_count, legacy_credit_units: plan.legacy_recovery.credit_units,
    legacy_job_ids: plan.legacy_recovery.jobs.map(({ job_id }) => job_id), legacy_asset_ids: plan.legacy_recovery.jobs.map(({ asset_id }) => asset_id),
    legacy_must_precede_any_paid_batch: plan.legacy_recovery.must_precede_any_paid_batch,
    legacy_expiry_falls_back_to_paid: plan.legacy_recovery.expiry_falls_back_to_paid_regeneration,
    paid_asset_count: plan.assets.length, paid_asset_ids: plan.assets.map(({ id }) => id),
    aspect_ratio_counts: plan.assets.reduce<Record<string, number>>((counts, { aspect_ratio }) => ({ ...counts, [aspect_ratio]: (counts[aspect_ratio] ?? 0) + 1 }), {}),
    aspect_tolerance_ppm: { "3:4": 5_000, "16:9": 12_500 },
    batch_count: plan.batches.length, batch_layout: batches, batch_sizes: plan.batches.map(({ size }) => size),
    unit_cost_units: 150, planned_spend_units: plannedUnits, new_credit_cap_units: T020_V2_TOTAL_CAP_UNITS, new_credit_cap_decimal: decimalT020(T020_V2_TOTAL_CAP_UNITS),
    v1_sunk_decimal: "9.00", combined_on_full_success_decimal: "81.00", net_monetary_loss_target_decimal: "0.00",
    canary_batch_id: T020_V2_CANARY_BATCH_ID, expected_provider_reported_model: T020_V2_EXPECTED_MODEL,
    disclosure_chain_status: checked.authorized ? "approved" : "pending approval",
    exact_approval_phrase_required: T020_V2_EXACT_APPROVAL_PHRASE, authorized: checked.authorized,
  };
}

/**
 * Re-deriving the plan or re-pinning the binding after a run has started would change
 * `plan_sha256`, and the live journal's header is bound to the old one.
 */
function assertNoLiveJournal(root: string, command: string): void {
  if (existsSync(resolve(root, T020_V2_JOURNAL_PATH))) throw new Error(`T020 v2 ${command} is refused while a run journal exists at ${T020_V2_JOURNAL_PATH}; re-deriving the plan or binding mid-run would orphan the journal's header hashes`);
}

export function runT020V2Preparation(args: readonly string[], root: string = repositoryRoot): Record<string, unknown> {
  const command = args[0];
  if (command === "binding-gen") {
    if (args.length !== 1) throw new Error("usage: t020-world-art-v2 binding-gen");
    assertNoLiveJournal(root, command);
    const binding = buildT020V2Binding(root);
    atomicWriteJson(root, T020_V2_BINDING_PATH, binding);
    return { command, binding_sha256: sha256T020(renderT020CanonicalJson(binding)), files: Object.keys(binding.files).length };
  }
  if (command === "gen") {
    if (args.length !== 1) throw new Error("usage: t020-world-art-v2 gen");
    assertNoLiveJournal(root, command);
    atomicWriteJson(root, T020_V2_RISK_PATH, buildT020V2Risk());
    atomicWriteJson(root, T020_V2_SCHEMA_PATH, buildT020V2Schema());
    atomicWriteJson(root, T020_V2_FORENSICS_PATH, buildT020V2Forensics(root));
    const plan = buildT020V2Plan(root);
    atomicWriteJson(root, T020_V2_PLAN_PATH, plan);
    atomicWriteJson(root, T020_V2_PENDING_PATH, buildT020V2Pending(root, plan));
    return summary(command, checkT020V2Preparation(root));
  }
  if (command === "check") { if (args.length !== 1) throw new Error("usage: t020-world-art-v2 check"); return summary(command, checkT020V2Preparation(root)); }
  if (command === "dry-run") { if (args.length !== 1) throw new Error("usage: t020-world-art-v2 dry-run"); return dryRunT020V2(root); }
  if (command === "disclosure-build") {
    const disclosedAt = option(args, "--disclosed-at");
    const balancePath = optional(args, "--balance-file");
    if (args.length !== (balancePath === undefined ? 3 : 5) || args[1] !== "--disclosed-at") throw new Error("usage: t020-world-art-v2 disclosure-build --disclosed-at <timestamp> [--balance-file <path>]");
    const checked = checkT020V2Preparation(root);
    const controller = buildT020V2ControllerDisclosure(root, checked.plan, disclosedAt);
    validateT020V2ControllerDisclosure(controller, root, checked.plan);
    writeT020V2NoClobber(root, T020_V2_CONTROLLER_DISCLOSURE_PATH, controller);
    const presentation = buildT020V2Presentation(root, checked.plan, loadBalance(root, balancePath));
    validateT020V2Presentation(presentation, root, checked.plan);
    writeT020V2NoClobber(root, T020_V2_PRESENTATION_PATH, presentation);
    const disclosure = presentation.balance_disclosure as Record<string, unknown>;
    return { command, presentation_sha256: sha256T020(renderT020CanonicalJson(presentation)), balance_observation_present: disclosure.balance_observation_present === true, observed_balance_decimal: disclosure.observed_balance_decimal ?? null, covers_new_cap: disclosure.covers_new_cap ?? null, projected_remainder_decimal: disclosure.projected_remainder_decimal ?? null, authorized: false };
  }
  if (command === "approval-build") {
    if (args.length !== 3 || args[1] !== "--approved-at") throw new Error("usage: t020-world-art-v2 approval-build --approved-at <timestamp>");
    const checked = checkT020V2Preparation(root);
    const presentation = JSON.parse(readFileSync(resolve(root, T020_V2_PRESENTATION_PATH), "utf8")) as T020V2Presentation;
    validateT020V2Presentation(presentation, root, checked.plan);
    const approvedAt = option(args, "--approved-at");
    const now = new Date(approvedAt);
    const controller = buildT020V2ControllerApproval(root, checked.plan, presentation, approvedAt, now);
    validateT020V2ControllerApproval(controller, root, checked.plan, presentation, now);
    writeT020V2NoClobber(root, T020_V2_CONTROLLER_APPROVAL_PATH, controller);
    const approval = buildT020V2Approval(root, checked.plan, presentation, now);
    validateT020V2Approval(approval, root, checked.plan, presentation, now);
    writeT020V2NoClobber(root, T020_V2_APPROVAL_PATH, approval);
    return { command, approval_sha256: sha256T020(renderT020CanonicalJson(approval)), authorized: true };
  }
  throw new Error("usage: t020-world-art-v2 <binding-gen|gen|check|dry-run|disclosure-build|approval-build>");
}
