import { randomUUID } from "node:crypto";
import { closeSync, constants, existsSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicWriteJson, safeResolve } from "./filesystem";
import {
  T020_V1_APPROVAL_PATH, T020_V1_ASSET_COUNT, T020_V1_BACKGROUND_ASSET_COUNT, T020_V1_BATCH_COUNT, T020_V1_BINDING_PATH, T020_V1_CANARY_BATCH_ID, T020_V1_CANARY_EXPOSURE_UNITS,
  T020_V1_CONTROLLER_APPROVAL_PATH, T020_V1_CONTROLLER_DISCLOSURE_PATH, T020_V1_ENEMY_ASSET_COUNT, T020_V1_EXACT_APPROVAL_PHRASE, T020_V1_EXPECTED_MODEL,
  T020_V1_FORENSICS_PATH, T020_V1_JOURNAL_PATH, T020_V1_PENDING_PATH, T020_V1_PLAN_PATH, T020_V1_PRESENTATION_PATH, T020_V1_RISK_PATH, T020_V1_SCHEMA_PATH, T020_V1_TOTAL_CAP_UNITS,
  buildT020Approval, buildT020Binding, buildT020ControllerApproval, buildT020ControllerDisclosure, buildT020Forensics, buildT020Pending, buildT020Plan,
  buildT020Presentation, buildT020Risk, buildT020Schema, crossCheckT020EffectivePrompts, decimalT020, isT020Authorized, loadT020Binding, parseT020BalanceFile,
  renderT020CanonicalJson, renderT020Plan, sha256T020, t020PlanSha256,
  validateT020Approval, validateT020ControllerApproval, validateT020ControllerDisclosure, validateT020Presentation,
  type T020BalanceObservation, type T020Plan, type T020Presentation,
} from "./t020-world-art-production-v1";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
function option(args: readonly string[], name: string): string { const index = args.indexOf(name); const value = index < 0 ? undefined : args[index + 1]; if (!value || value.startsWith("--")) throw new Error(`missing ${name}`); return value; }
function optional(args: readonly string[], name: string): string | undefined { const index = args.indexOf(name); if (index < 0) return undefined; return option(args, name); }

export function writeT020NoClobber(root: string, path: string, value: unknown): string {
  const target = resolve(root, path);
  const bytes = renderT020CanonicalJson(value);
  if (existsSync(target)) { if (lstatSync(target).isSymbolicLink() || readFileSync(target, "utf8") !== bytes) throw new Error("T020 evidence no-clobber conflict"); return bytes; }
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try { writeFileSync(descriptor, bytes); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  try {
    try { linkSync(temporary, target); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; if (lstatSync(target).isSymbolicLink() || readFileSync(target, "utf8") !== bytes) throw new Error("T020 evidence no-clobber conflict"); }
    unlinkSync(temporary);
  } finally { rmSync(temporary, { force: true }); }
  return bytes;
}

export function checkT020Preparation(root = repositoryRoot): { plan: T020Plan; plan_sha256: string; pending_sha256: string; authorized: boolean } {
  const binding = loadT020Binding(root);
  const risk = buildT020Risk();
  const schema = buildT020Schema();
  const forensics = buildT020Forensics(root);
  const plan = buildT020Plan(root);
  const pending = buildT020Pending(root, plan);
  const expected = [[T020_V1_BINDING_PATH, binding], [T020_V1_RISK_PATH, risk], [T020_V1_SCHEMA_PATH, schema], [T020_V1_FORENSICS_PATH, forensics], [T020_V1_PLAN_PATH, plan], [T020_V1_PENDING_PATH, pending]] as const;
  for (const [path, value] of expected) {
    const bytes = readFileSync(resolve(root, path), "utf8");
    const rendered = path === T020_V1_PLAN_PATH ? renderT020Plan(plan) : renderT020CanonicalJson(value);
    if (bytes !== rendered) throw new Error(`tracked T020 artifact changed: ${path}`);
  }
  return { plan, plan_sha256: t020PlanSha256(plan), pending_sha256: sha256T020(renderT020CanonicalJson(pending)), authorized: isT020Authorized(root, plan) };
}

function summary(command: string, result: ReturnType<typeof checkT020Preparation>): Record<string, unknown> {
  return {
    command, plan_sha256: result.plan_sha256, pending_disclosure_sha256: result.pending_sha256, authorized: result.authorized,
    assets: T020_V1_ASSET_COUNT, batches: T020_V1_BATCH_COUNT, total_credit_cap_units: T020_V1_TOTAL_CAP_UNITS,
    total_credit_cap_decimal: decimalT020(T020_V1_TOTAL_CAP_UNITS), automatic_paid_retry_reserve_decimal: "0.00",
  };
}

function loadBalance(root: string, path: string | undefined): T020BalanceObservation | null {
  if (path === undefined) return null;
  // Operator-supplied observations stay inside the repository so safeResolve can reject
  // absolute paths, traversal, and symlinks before the disclosure is built.
  if (isAbsolute(path) || path.includes("\\") || path.split("/").some((part) => part === "" || part === "." || part === "..")) throw new Error("T020 --balance-file must be a repository-relative path");
  const target = safeResolve(root, path);
  const info = lstatSync(target);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error("T020 balance file must be a regular file");
  return parseT020BalanceFile(JSON.parse(readFileSync(target, "utf8")) as unknown);
}

/**
 * Read-only end-to-end derivation check. It submits nothing, contacts nothing, and writes
 * nothing: it re-derives the plan from the pinned manifest, re-verifies every tracked
 * artifact byte-for-byte, cross-checks a sample of effective prompts, and reports the
 * layout an operator would be approving.
 */
export function dryRunT020(root = repositoryRoot): Record<string, unknown> {
  const checked = checkT020Preparation(root);
  const plan = checked.plan;
  // Samples straddle the aspect-group boundary so both aspects are cross-checked.
  const sample = [0, 1, T020_V1_BACKGROUND_ASSET_COUNT - 1, T020_V1_BACKGROUND_ASSET_COUNT, T020_V1_ASSET_COUNT - 1];
  const crossChecked = crossCheckT020EffectivePrompts(root, plan, sample);
  const batches = plan.batches.map((batch) => ({ batch_id: batch.id, group: batch.group, aspect_ratio: batch.aspect_ratio, size: batch.size, credit_units: batch.size * 150, credit_decimal: decimalT020(batch.size * 150), first_asset_id: batch.asset_ids[0], last_asset_id: batch.asset_ids.at(-1) }));
  const plannedUnits = plan.batches.reduce((sum, batch) => sum + batch.size * 150, 0);
  if (plannedUnits !== T020_V1_TOTAL_CAP_UNITS) throw new Error("T020 dry-run: planned spend does not equal the cap");
  return {
    command: "dry-run", submitted_anything: false, wrote_anything: false,
    plan_sha256: checked.plan_sha256, pending_disclosure_sha256: checked.pending_sha256,
    asset_count: plan.assets.length, asset_ids: plan.assets.map(({ id }) => id),
    enemy_asset_count: plan.assets.filter(({ group }) => group === "ENEMY").length, expected_enemy_asset_count: T020_V1_ENEMY_ASSET_COUNT,
    background_asset_count: plan.assets.filter(({ group }) => group === "BACKGROUND").length, expected_background_asset_count: T020_V1_BACKGROUND_ASSET_COUNT,
    aspect_ratio_counts: plan.assets.reduce<Record<string, number>>((counts, { aspect_ratio }) => ({ ...counts, [aspect_ratio]: (counts[aspect_ratio] ?? 0) + 1 }), {}),
    local_paths_sample: plan.assets.filter((_, index) => sample.includes(index)).map(({ id, path, aspect_ratio }) => ({ id, local_relative_path: path, aspect_ratio })),
    batch_count: plan.batches.length, batch_layout: batches, batch_sizes: plan.batches.map(({ size }) => size),
    batches_are_aspect_homogeneous: true, batch_max: 12,
    unit_cost_units: 150, planned_spend_units: plannedUnits, total_credit_cap_units: T020_V1_TOTAL_CAP_UNITS, total_credit_cap_decimal: decimalT020(T020_V1_TOTAL_CAP_UNITS),
    canary_batch_id: T020_V1_CANARY_BATCH_ID, expected_provider_reported_model: T020_V1_EXPECTED_MODEL,
    model_canary_applies_to_every_batch: true, canary_exposure_decimal: decimalT020(T020_V1_CANARY_EXPOSURE_UNITS),
    aspect_canary_batch_id: T020_V1_CANARY_BATCH_ID, aspect_expectation: plan.recovery_policy.aspect_expectation,
    effective_prompts_cross_checked: crossChecked,
    disclosure_chain_status: checked.authorized ? "approved" : "pending approval",
    exact_approval_phrase_required: T020_V1_EXACT_APPROVAL_PHRASE,
    authorized: checked.authorized,
  };
}

/**
 * Re-deriving the plan or re-pinning the binding after a run has started would change
 * `plan_sha256`, and the live journal's header is bound to the old one — the journal would
 * become unreadable with real spend on record. Both writers are clobbering by design, so the
 * guard is on the door.
 */
function assertNoLiveJournal(root: string, command: string): void {
  if (existsSync(resolve(root, T020_V1_JOURNAL_PATH))) throw new Error(`T020 ${command} is refused while a run journal exists at ${T020_V1_JOURNAL_PATH}; re-deriving the plan or binding mid-run would orphan the journal's header hashes`);
}

export function runT020Preparation(args: readonly string[]): Record<string, unknown> {
  const command = args[0];
  if (command === "binding-gen") {
    if (args.length !== 1) throw new Error("usage: t020-world-art binding-gen");
    assertNoLiveJournal(repositoryRoot, command);
    const binding = buildT020Binding(repositoryRoot);
    atomicWriteJson(repositoryRoot, T020_V1_BINDING_PATH, binding);
    return { command, binding_sha256: sha256T020(renderT020CanonicalJson(binding)), files: Object.keys(binding.files).length };
  }
  if (command === "gen") {
    if (args.length !== 1) throw new Error("usage: t020-world-art gen");
    assertNoLiveJournal(repositoryRoot, command);
    atomicWriteJson(repositoryRoot, T020_V1_RISK_PATH, buildT020Risk());
    atomicWriteJson(repositoryRoot, T020_V1_SCHEMA_PATH, buildT020Schema());
    atomicWriteJson(repositoryRoot, T020_V1_FORENSICS_PATH, buildT020Forensics(repositoryRoot));
    const plan = buildT020Plan(repositoryRoot);
    atomicWriteJson(repositoryRoot, T020_V1_PLAN_PATH, plan);
    atomicWriteJson(repositoryRoot, T020_V1_PENDING_PATH, buildT020Pending(repositoryRoot, plan));
    return summary(command, checkT020Preparation());
  }
  if (command === "check") { if (args.length !== 1) throw new Error("usage: t020-world-art check"); return summary(command, checkT020Preparation()); }
  if (command === "dry-run") { if (args.length !== 1) throw new Error("usage: t020-world-art dry-run"); return dryRunT020(); }
  if (command === "disclosure-build") {
    const disclosedAt = option(args, "--disclosed-at");
    const balancePath = optional(args, "--balance-file");
    if (args.length !== (balancePath === undefined ? 3 : 5) || args[1] !== "--disclosed-at") throw new Error("usage: t020-world-art disclosure-build --disclosed-at <timestamp> [--balance-file <path>]");
    const checked = checkT020Preparation();
    const controller = buildT020ControllerDisclosure(repositoryRoot, checked.plan, disclosedAt);
    validateT020ControllerDisclosure(controller, repositoryRoot, checked.plan);
    writeT020NoClobber(repositoryRoot, T020_V1_CONTROLLER_DISCLOSURE_PATH, controller);
    const presentation = buildT020Presentation(repositoryRoot, checked.plan, loadBalance(repositoryRoot, balancePath));
    validateT020Presentation(presentation, repositoryRoot, checked.plan);
    writeT020NoClobber(repositoryRoot, T020_V1_PRESENTATION_PATH, presentation);
    const disclosure = presentation.balance_disclosure as Record<string, unknown>;
    return { command, presentation_sha256: sha256T020(renderT020CanonicalJson(presentation)), balance_observation_present: disclosure.balance_observation_present === true, observed_balance_decimal: disclosure.observed_balance_decimal ?? null, covers_total_cap: disclosure.covers_total_cap ?? null, authorized: false };
  }
  if (command === "approval-build") {
    if (args.length !== 3 || args[1] !== "--approved-at") throw new Error("usage: t020-world-art approval-build --approved-at <timestamp>");
    const checked = checkT020Preparation();
    const presentation = JSON.parse(readFileSync(resolve(repositoryRoot, T020_V1_PRESENTATION_PATH), "utf8")) as T020Presentation;
    validateT020Presentation(presentation, repositoryRoot, checked.plan);
    const approvedAt = option(args, "--approved-at");
    const now = new Date(approvedAt);
    const controller = buildT020ControllerApproval(repositoryRoot, checked.plan, presentation, approvedAt, now);
    validateT020ControllerApproval(controller, repositoryRoot, checked.plan, presentation, now);
    writeT020NoClobber(repositoryRoot, T020_V1_CONTROLLER_APPROVAL_PATH, controller);
    const approval = buildT020Approval(repositoryRoot, checked.plan, presentation, now);
    validateT020Approval(approval, repositoryRoot, checked.plan, presentation, now);
    writeT020NoClobber(repositoryRoot, T020_V1_APPROVAL_PATH, approval);
    return { command, approval_sha256: sha256T020(renderT020CanonicalJson(approval)), authorized: true };
  }
  throw new Error("usage: t020-world-art <binding-gen|gen|check|dry-run|disclosure-build|approval-build>");
}
