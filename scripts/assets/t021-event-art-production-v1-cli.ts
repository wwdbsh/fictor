import { randomUUID } from "node:crypto";
import { closeSync, constants, existsSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicWriteJson, safeResolve } from "./filesystem";
import {
  T021_V1_APPROVAL_PATH, T021_V1_ASSET_COUNT, T021_V1_BATCH_COUNT, T021_V1_BINDING_PATH, T021_V1_CANARY_BATCH_ID,
  T021_V1_CONTROLLER_APPROVAL_PATH, T021_V1_CONTROLLER_DISCLOSURE_PATH, T021_V1_EXACT_APPROVAL_PHRASE, T021_V1_EXPECTED_MODEL,
  T021_V1_FORENSICS_PATH, T021_V1_JOURNAL_PATH, T021_V1_PENDING_PATH, T021_V1_PLAN_PATH, T021_V1_PRESENTATION_PATH, T021_V1_RISK_PATH, T021_V1_SCHEMA_PATH, T021_V1_TOTAL_CAP_UNITS,
  buildT021Approval, buildT021Binding, buildT021ControllerApproval, buildT021ControllerDisclosure, buildT021Forensics, buildT021Pending, buildT021Plan,
  buildT021Presentation, buildT021Risk, buildT021Schema, crossCheckT021EffectivePrompts, decimalT021, isT021Authorized, loadT021Binding, parseT021BalanceFile,
  renderT021CanonicalJson, renderT021Plan, sha256T021, t021PlanSha256,
  validateT021Approval, validateT021ControllerApproval, validateT021ControllerDisclosure, validateT021Presentation,
  type T021BalanceObservation, type T021Plan, type T021Presentation,
} from "./t021-event-art-production-v1";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
function option(args: readonly string[], name: string): string { const index = args.indexOf(name); const value = index < 0 ? undefined : args[index + 1]; if (!value || value.startsWith("--")) throw new Error(`missing ${name}`); return value; }
function optional(args: readonly string[], name: string): string | undefined { const index = args.indexOf(name); if (index < 0) return undefined; return option(args, name); }

export function writeT021NoClobber(root: string, path: string, value: unknown): string {
  const target = resolve(root, path);
  const bytes = renderT021CanonicalJson(value);
  if (existsSync(target)) { if (lstatSync(target).isSymbolicLink() || readFileSync(target, "utf8") !== bytes) throw new Error("T021 evidence no-clobber conflict"); return bytes; }
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try { writeFileSync(descriptor, bytes); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  try {
    try { linkSync(temporary, target); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; if (lstatSync(target).isSymbolicLink() || readFileSync(target, "utf8") !== bytes) throw new Error("T021 evidence no-clobber conflict"); }
    unlinkSync(temporary);
  } finally { rmSync(temporary, { force: true }); }
  return bytes;
}

export function checkT021Preparation(root = repositoryRoot): { plan: T021Plan; plan_sha256: string; pending_sha256: string; authorized: boolean } {
  const binding = loadT021Binding(root);
  const risk = buildT021Risk();
  const schema = buildT021Schema();
  const forensics = buildT021Forensics(root);
  const plan = buildT021Plan(root);
  const pending = buildT021Pending(root, plan);
  const expected = [[T021_V1_BINDING_PATH, binding], [T021_V1_RISK_PATH, risk], [T021_V1_SCHEMA_PATH, schema], [T021_V1_FORENSICS_PATH, forensics], [T021_V1_PLAN_PATH, plan], [T021_V1_PENDING_PATH, pending]] as const;
  for (const [path, value] of expected) {
    const bytes = readFileSync(resolve(root, path), "utf8");
    const rendered = path === T021_V1_PLAN_PATH ? renderT021Plan(plan) : renderT021CanonicalJson(value);
    if (bytes !== rendered) throw new Error(`tracked T021 artifact changed: ${path}`);
  }
  return { plan, plan_sha256: t021PlanSha256(plan), pending_sha256: sha256T021(renderT021CanonicalJson(pending)), authorized: isT021Authorized(root, plan) };
}

function summary(command: string, result: ReturnType<typeof checkT021Preparation>): Record<string, unknown> {
  return {
    command, plan_sha256: result.plan_sha256, pending_disclosure_sha256: result.pending_sha256, authorized: result.authorized,
    assets: T021_V1_ASSET_COUNT, batches: T021_V1_BATCH_COUNT,
    total_credit_cap_units: T021_V1_TOTAL_CAP_UNITS, total_credit_cap_decimal: decimalT021(T021_V1_TOTAL_CAP_UNITS),
    automatic_paid_retry_reserve_decimal: "0.00",
  };
}

function loadBalance(root: string, path: string | undefined): T021BalanceObservation | null {
  if (path === undefined) return null;
  // Operator-supplied observations stay inside the repository so safeResolve can reject
  // absolute paths, traversal, and symlinks before the disclosure is built.
  if (isAbsolute(path) || path.includes("\\") || path.split("/").some((part) => part === "" || part === "." || part === "..")) throw new Error("T021 --balance-file must be a repository-relative path");
  const target = safeResolve(root, path);
  const info = lstatSync(target);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error("T021 balance file must be a regular file");
  return parseT021BalanceFile(JSON.parse(readFileSync(target, "utf8")) as unknown);
}

/**
 * Read-only end-to-end derivation check. It submits nothing, contacts nothing, and writes
 * nothing: it re-derives the plan from the pinned manifest, re-verifies every tracked
 * artifact byte-for-byte, cross-checks a sample of effective prompts, and reports the
 * layout an operator would be approving.
 */
export function dryRunT021(root = repositoryRoot): Record<string, unknown> {
  const checked = checkT021Preparation(root);
  const plan = checked.plan;
  const crossChecked = crossCheckT021EffectivePrompts(root, plan, [0, 5, 6, 19]);
  const batches = plan.batches.map((batch) => ({ batch_id: batch.id, aspect_ratio: batch.aspect_ratio, size: batch.size, credit_units: batch.size * 150, credit_decimal: decimalT021(batch.size * 150), first_asset_id: batch.asset_ids[0], last_asset_id: batch.asset_ids.at(-1) }));
  const plannedUnits = plan.batches.reduce((sum, batch) => sum + batch.size * 150, 0);
  if (plannedUnits !== T021_V1_TOTAL_CAP_UNITS) throw new Error("T021 dry-run: planned spend does not equal the cap");
  return {
    command: "dry-run", submitted_anything: false, wrote_anything: false,
    plan_sha256: checked.plan_sha256, pending_disclosure_sha256: checked.pending_sha256,
    asset_count: plan.assets.length, asset_ids: plan.assets.map(({ id }) => id),
    event_types: [...new Set(plan.assets.map(({ event_type }) => event_type))],
    assets_by_event_type: plan.assets.reduce<Record<string, number>>((counts, { event_type }) => ({ ...counts, [event_type]: (counts[event_type] ?? 0) + 1 }), {}),
    aspect_ratio_counts: plan.assets.reduce<Record<string, number>>((counts, { aspect_ratio }) => ({ ...counts, [aspect_ratio]: (counts[aspect_ratio] ?? 0) + 1 }), {}),
    aspect_tolerance_ppm: { "3:4": 5_000 }, declared_aspects: ["3:4"],
    batch_count: plan.batches.length, batch_layout: batches, batch_sizes: plan.batches.map(({ size }) => size),
    batches_are_aspect_homogeneous: true, batch_max: 12,
    unit_cost_units: 150, planned_spend_units: plannedUnits, total_credit_cap_units: T021_V1_TOTAL_CAP_UNITS, total_credit_cap_decimal: decimalT021(T021_V1_TOTAL_CAP_UNITS),
    cumulative_budget: plan.cumulative_budget,
    canary_batch_id: T021_V1_CANARY_BATCH_ID, expected_provider_reported_model: T021_V1_EXPECTED_MODEL,
    effective_prompts_cross_checked: crossChecked,
    disclosure_chain_status: checked.authorized ? "approved" : "pending approval",
    exact_approval_phrase_required: T021_V1_EXACT_APPROVAL_PHRASE, authorized: checked.authorized,
  };
}

/**
 * Re-deriving the plan or re-pinning the binding after a run has started would change
 * `plan_sha256`, and the live journal's header is bound to the old one.
 */
function assertNoLiveJournal(root: string, command: string): void {
  if (existsSync(resolve(root, T021_V1_JOURNAL_PATH))) throw new Error(`T021 ${command} is refused while a run journal exists at ${T021_V1_JOURNAL_PATH}; re-deriving the plan or binding mid-run would orphan the journal's header hashes`);
}

export function runT021Preparation(args: readonly string[], root: string = repositoryRoot): Record<string, unknown> {
  const command = args[0];
  if (command === "binding-gen") {
    if (args.length !== 1) throw new Error("usage: t021-event-art binding-gen");
    assertNoLiveJournal(root, command);
    const binding = buildT021Binding(root);
    atomicWriteJson(root, T021_V1_BINDING_PATH, binding);
    return { command, binding_sha256: sha256T021(renderT021CanonicalJson(binding)), files: Object.keys(binding.files).length };
  }
  if (command === "gen") {
    if (args.length !== 1) throw new Error("usage: t021-event-art gen");
    assertNoLiveJournal(root, command);
    atomicWriteJson(root, T021_V1_RISK_PATH, buildT021Risk());
    atomicWriteJson(root, T021_V1_SCHEMA_PATH, buildT021Schema());
    atomicWriteJson(root, T021_V1_FORENSICS_PATH, buildT021Forensics(root));
    const plan = buildT021Plan(root);
    atomicWriteJson(root, T021_V1_PLAN_PATH, plan);
    atomicWriteJson(root, T021_V1_PENDING_PATH, buildT021Pending(root, plan));
    return summary(command, checkT021Preparation(root));
  }
  if (command === "check") { if (args.length !== 1) throw new Error("usage: t021-event-art check"); return summary(command, checkT021Preparation(root)); }
  if (command === "dry-run") { if (args.length !== 1) throw new Error("usage: t021-event-art dry-run"); return dryRunT021(root); }
  if (command === "disclosure-build") {
    const disclosedAt = option(args, "--disclosed-at");
    const balancePath = optional(args, "--balance-file");
    if (args.length !== (balancePath === undefined ? 3 : 5) || args[1] !== "--disclosed-at") throw new Error("usage: t021-event-art disclosure-build --disclosed-at <timestamp> [--balance-file <path>]");
    const checked = checkT021Preparation(root);
    const controller = buildT021ControllerDisclosure(root, checked.plan, disclosedAt);
    validateT021ControllerDisclosure(controller, root, checked.plan);
    writeT021NoClobber(root, T021_V1_CONTROLLER_DISCLOSURE_PATH, controller);
    const presentation = buildT021Presentation(root, checked.plan, loadBalance(root, balancePath));
    validateT021Presentation(presentation, root, checked.plan);
    writeT021NoClobber(root, T021_V1_PRESENTATION_PATH, presentation);
    const disclosure = presentation.balance_disclosure as Record<string, unknown>;
    return { command, presentation_sha256: sha256T021(renderT021CanonicalJson(presentation)), balance_observation_present: disclosure.balance_observation_present === true, observed_balance_decimal: disclosure.observed_balance_decimal ?? null, covers_total_cap: disclosure.covers_total_cap ?? null, projected_remainder_decimal: disclosure.projected_remainder_decimal ?? null, authorized: false };
  }
  if (command === "approval-build") {
    if (args.length !== 3 || args[1] !== "--approved-at") throw new Error("usage: t021-event-art approval-build --approved-at <timestamp>");
    const checked = checkT021Preparation(root);
    const presentation = JSON.parse(readFileSync(resolve(root, T021_V1_PRESENTATION_PATH), "utf8")) as T021Presentation;
    validateT021Presentation(presentation, root, checked.plan);
    const approvedAt = option(args, "--approved-at");
    const now = new Date(approvedAt);
    const controller = buildT021ControllerApproval(root, checked.plan, presentation, approvedAt, now);
    validateT021ControllerApproval(controller, root, checked.plan, presentation, now);
    writeT021NoClobber(root, T021_V1_CONTROLLER_APPROVAL_PATH, controller);
    const approval = buildT021Approval(root, checked.plan, presentation, now);
    validateT021Approval(approval, root, checked.plan, presentation, now);
    writeT021NoClobber(root, T021_V1_APPROVAL_PATH, approval);
    return { command, approval_sha256: sha256T021(renderT021CanonicalJson(approval)), authorized: true };
  }
  throw new Error("usage: t021-event-art <binding-gen|gen|check|dry-run|disclosure-build|approval-build>");
}
