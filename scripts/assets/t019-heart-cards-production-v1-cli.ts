import { randomUUID } from "node:crypto";
import { closeSync, constants, existsSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicWriteJson, safeResolve } from "./filesystem";
import {
  T019_V1_APPROVAL_PATH, T019_V1_ASSET_COUNT, T019_V1_BATCH_COUNT, T019_V1_BINDING_PATH, T019_V1_CANARY_BATCH_ID,
  T019_V1_CONTROLLER_APPROVAL_PATH, T019_V1_CONTROLLER_DISCLOSURE_PATH, T019_V1_EXACT_APPROVAL_PHRASE, T019_V1_EXPECTED_MODEL,
  T019_V1_FORENSICS_PATH, T019_V1_JOURNAL_PATH, T019_V1_PENDING_PATH, T019_V1_PLAN_PATH, T019_V1_PRESENTATION_PATH, T019_V1_RISK_PATH, T019_V1_SCHEMA_PATH, T019_V1_TOTAL_CAP_UNITS,
  buildT019Approval, buildT019Binding, buildT019ControllerApproval, buildT019ControllerDisclosure, buildT019Forensics, buildT019Pending, buildT019Plan,
  buildT019Presentation, buildT019Risk, buildT019Schema, crossCheckT019EffectivePrompts, decimalT019, isT019Authorized, loadT019Binding, parseT019BalanceFile,
  renderT019CanonicalJson, renderT019Plan, sha256T019, t019PlanSha256,
  validateT019Approval, validateT019ControllerApproval, validateT019ControllerDisclosure, validateT019Presentation,
  type T019BalanceObservation, type T019Plan, type T019Presentation,
} from "./t019-heart-cards-production-v1";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
function option(args: readonly string[], name: string): string { const index = args.indexOf(name); const value = index < 0 ? undefined : args[index + 1]; if (!value || value.startsWith("--")) throw new Error(`missing ${name}`); return value; }
function optional(args: readonly string[], name: string): string | undefined { const index = args.indexOf(name); if (index < 0) return undefined; return option(args, name); }

export function writeT019NoClobber(root: string, path: string, value: unknown): string {
  const target = resolve(root, path);
  const bytes = renderT019CanonicalJson(value);
  if (existsSync(target)) { if (lstatSync(target).isSymbolicLink() || readFileSync(target, "utf8") !== bytes) throw new Error("T019 evidence no-clobber conflict"); return bytes; }
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try { writeFileSync(descriptor, bytes); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  try {
    try { linkSync(temporary, target); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; if (lstatSync(target).isSymbolicLink() || readFileSync(target, "utf8") !== bytes) throw new Error("T019 evidence no-clobber conflict"); }
    unlinkSync(temporary);
  } finally { rmSync(temporary, { force: true }); }
  return bytes;
}

export function checkT019Preparation(root = repositoryRoot): { plan: T019Plan; plan_sha256: string; pending_sha256: string; authorized: boolean } {
  const binding = loadT019Binding(root);
  const risk = buildT019Risk();
  const schema = buildT019Schema();
  const forensics = buildT019Forensics(root);
  const plan = buildT019Plan(root);
  const pending = buildT019Pending(root, plan);
  const expected = [[T019_V1_BINDING_PATH, binding], [T019_V1_RISK_PATH, risk], [T019_V1_SCHEMA_PATH, schema], [T019_V1_FORENSICS_PATH, forensics], [T019_V1_PLAN_PATH, plan], [T019_V1_PENDING_PATH, pending]] as const;
  for (const [path, value] of expected) {
    const bytes = readFileSync(resolve(root, path), "utf8");
    const rendered = path === T019_V1_PLAN_PATH ? renderT019Plan(plan) : renderT019CanonicalJson(value);
    if (bytes !== rendered) throw new Error(`tracked T019 artifact changed: ${path}`);
  }
  return { plan, plan_sha256: t019PlanSha256(plan), pending_sha256: sha256T019(renderT019CanonicalJson(pending)), authorized: isT019Authorized(root, plan) };
}

function summary(command: string, result: ReturnType<typeof checkT019Preparation>): Record<string, unknown> {
  return {
    command, plan_sha256: result.plan_sha256, pending_disclosure_sha256: result.pending_sha256, authorized: result.authorized,
    assets: T019_V1_ASSET_COUNT, batches: T019_V1_BATCH_COUNT,
    total_credit_cap_units: T019_V1_TOTAL_CAP_UNITS, total_credit_cap_decimal: decimalT019(T019_V1_TOTAL_CAP_UNITS),
    automatic_paid_retry_reserve_decimal: "0.00",
  };
}

function loadBalance(root: string, path: string | undefined): T019BalanceObservation | null {
  if (path === undefined) return null;
  // Operator-supplied observations stay inside the repository so safeResolve can reject
  // absolute paths, traversal, and symlinks before the disclosure is built.
  if (isAbsolute(path) || path.includes("\\") || path.split("/").some((part) => part === "" || part === "." || part === "..")) throw new Error("T019 --balance-file must be a repository-relative path");
  const target = safeResolve(root, path);
  const info = lstatSync(target);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error("T019 balance file must be a regular file");
  return parseT019BalanceFile(JSON.parse(readFileSync(target, "utf8")) as unknown);
}

/**
 * Read-only end-to-end derivation check. It submits nothing, contacts nothing, and writes
 * nothing: it re-derives the plan from the pinned manifest, re-verifies every tracked
 * artifact byte-for-byte, cross-checks a sample of effective prompts, and reports the
 * layout an operator would be approving.
 */
export function dryRunT019(root = repositoryRoot): Record<string, unknown> {
  const checked = checkT019Preparation(root);
  const plan = checked.plan;
  const crossChecked = crossCheckT019EffectivePrompts(root, plan, [0, 2, 5]);
  const batches = plan.batches.map((batch) => ({ batch_id: batch.id, aspect_ratio: batch.aspect_ratio, size: batch.size, credit_units: batch.size * 150, credit_decimal: decimalT019(batch.size * 150), first_asset_id: batch.asset_ids[0], last_asset_id: batch.asset_ids.at(-1) }));
  const plannedUnits = plan.batches.reduce((sum, batch) => sum + batch.size * 150, 0);
  if (plannedUnits !== T019_V1_TOTAL_CAP_UNITS) throw new Error("T019 dry-run: planned spend does not equal the cap");
  return {
    command: "dry-run", submitted_anything: false, wrote_anything: false,
    plan_sha256: checked.plan_sha256, pending_disclosure_sha256: checked.pending_sha256,
    asset_count: plan.assets.length, asset_ids: plan.assets.map(({ id }) => id),
    attributes: plan.assets.map(({ attribute }) => attribute),
    composition: [...new Set(plan.assets.map(({ composition }) => composition))], density: [...new Set(plan.assets.map(({ density }) => density))],
    doubles_as_boss_art: true, heart_forge_generation_allowed: false,
    aspect_ratio_counts: plan.assets.reduce<Record<string, number>>((counts, { aspect_ratio }) => ({ ...counts, [aspect_ratio]: (counts[aspect_ratio] ?? 0) + 1 }), {}),
    aspect_tolerance_ppm: { "3:4": 5_000 }, declared_aspects: ["3:4"],
    batch_count: plan.batches.length, batch_layout: batches, batch_sizes: plan.batches.map(({ size }) => size),
    batches_are_aspect_homogeneous: true, batch_max: 12,
    unit_cost_units: 150, planned_spend_units: plannedUnits, total_credit_cap_units: T019_V1_TOTAL_CAP_UNITS, total_credit_cap_decimal: decimalT019(T019_V1_TOTAL_CAP_UNITS),
    cumulative_budget: plan.cumulative_budget,
    canary_batch_id: T019_V1_CANARY_BATCH_ID, expected_provider_reported_model: T019_V1_EXPECTED_MODEL,
    effective_prompts_cross_checked: crossChecked,
    disclosure_chain_status: checked.authorized ? "approved" : "pending approval",
    exact_approval_phrase_required: T019_V1_EXACT_APPROVAL_PHRASE, authorized: checked.authorized,
  };
}

/**
 * Re-deriving the plan or re-pinning the binding after a run has started would change
 * `plan_sha256`, and the live journal's header is bound to the old one.
 */
function assertNoLiveJournal(root: string, command: string): void {
  if (existsSync(resolve(root, T019_V1_JOURNAL_PATH))) throw new Error(`T019 ${command} is refused while a run journal exists at ${T019_V1_JOURNAL_PATH}; re-deriving the plan or binding mid-run would orphan the journal's header hashes`);
}

export function runT019Preparation(args: readonly string[], root: string = repositoryRoot): Record<string, unknown> {
  const command = args[0];
  if (command === "binding-gen") {
    if (args.length !== 1) throw new Error("usage: t019-heart-cards binding-gen");
    assertNoLiveJournal(root, command);
    const binding = buildT019Binding(root);
    atomicWriteJson(root, T019_V1_BINDING_PATH, binding);
    return { command, binding_sha256: sha256T019(renderT019CanonicalJson(binding)), files: Object.keys(binding.files).length };
  }
  if (command === "gen") {
    if (args.length !== 1) throw new Error("usage: t019-heart-cards gen");
    assertNoLiveJournal(root, command);
    atomicWriteJson(root, T019_V1_RISK_PATH, buildT019Risk());
    atomicWriteJson(root, T019_V1_SCHEMA_PATH, buildT019Schema());
    atomicWriteJson(root, T019_V1_FORENSICS_PATH, buildT019Forensics(root));
    const plan = buildT019Plan(root);
    atomicWriteJson(root, T019_V1_PLAN_PATH, plan);
    atomicWriteJson(root, T019_V1_PENDING_PATH, buildT019Pending(root, plan));
    return summary(command, checkT019Preparation(root));
  }
  if (command === "check") { if (args.length !== 1) throw new Error("usage: t019-heart-cards check"); return summary(command, checkT019Preparation(root)); }
  if (command === "dry-run") { if (args.length !== 1) throw new Error("usage: t019-heart-cards dry-run"); return dryRunT019(root); }
  if (command === "disclosure-build") {
    const disclosedAt = option(args, "--disclosed-at");
    const balancePath = optional(args, "--balance-file");
    if (args.length !== (balancePath === undefined ? 3 : 5) || args[1] !== "--disclosed-at") throw new Error("usage: t019-heart-cards disclosure-build --disclosed-at <timestamp> [--balance-file <path>]");
    const checked = checkT019Preparation(root);
    const controller = buildT019ControllerDisclosure(root, checked.plan, disclosedAt);
    validateT019ControllerDisclosure(controller, root, checked.plan);
    writeT019NoClobber(root, T019_V1_CONTROLLER_DISCLOSURE_PATH, controller);
    const presentation = buildT019Presentation(root, checked.plan, loadBalance(root, balancePath));
    validateT019Presentation(presentation, root, checked.plan);
    writeT019NoClobber(root, T019_V1_PRESENTATION_PATH, presentation);
    const disclosure = presentation.balance_disclosure as Record<string, unknown>;
    return { command, presentation_sha256: sha256T019(renderT019CanonicalJson(presentation)), balance_observation_present: disclosure.balance_observation_present === true, observed_balance_decimal: disclosure.observed_balance_decimal ?? null, covers_total_cap: disclosure.covers_total_cap ?? null, projected_remainder_decimal: disclosure.projected_remainder_decimal ?? null, authorized: false };
  }
  if (command === "approval-build") {
    if (args.length !== 3 || args[1] !== "--approved-at") throw new Error("usage: t019-heart-cards approval-build --approved-at <timestamp>");
    const checked = checkT019Preparation(root);
    const presentation = JSON.parse(readFileSync(resolve(root, T019_V1_PRESENTATION_PATH), "utf8")) as T019Presentation;
    validateT019Presentation(presentation, root, checked.plan);
    const approvedAt = option(args, "--approved-at");
    const now = new Date(approvedAt);
    const controller = buildT019ControllerApproval(root, checked.plan, presentation, approvedAt, now);
    validateT019ControllerApproval(controller, root, checked.plan, presentation, now);
    writeT019NoClobber(root, T019_V1_CONTROLLER_APPROVAL_PATH, controller);
    const approval = buildT019Approval(root, checked.plan, presentation, now);
    validateT019Approval(approval, root, checked.plan, presentation, now);
    writeT019NoClobber(root, T019_V1_APPROVAL_PATH, approval);
    return { command, approval_sha256: sha256T019(renderT019CanonicalJson(approval)), authorized: true };
  }
  throw new Error("usage: t019-heart-cards <binding-gen|gen|check|dry-run|disclosure-build|approval-build>");
}
