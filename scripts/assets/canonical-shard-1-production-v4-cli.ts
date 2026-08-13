import { randomUUID } from "node:crypto";
import { closeSync, constants, existsSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicWriteJson, safeResolve } from "./filesystem";
import {
  T015_V4_APPROVAL_PATH, T015_V4_BINDING_PATH, T015_V4_CONTROLLER_APPROVAL_PATH, T015_V4_CONTROLLER_DISCLOSURE_PATH, T015_V4_FORENSICS_PATH, T015_V4_PAID_ASSET_COUNT,
  T015_V4_PAID_BATCH_COUNT, T015_V4_PENDING_PATH, T015_V4_PLAN_PATH, T015_V4_PRESENTATION_PATH, T015_V4_RISK_PATH, T015_V4_SCHEMA_PATH,
  buildT015V4Approval, buildT015V4Binding, buildT015V4ControllerApproval, buildT015V4ControllerDisclosure, buildT015V4Forensics, buildT015V4Pending, buildT015V4Plan,
  buildT015V4Presentation, buildT015V4Risk, buildT015V4Schema, isT015V4Authorized, loadT015V4Binding, parseT015V4BalanceFile, renderT015CanonicalJson, renderT015V4Plan,
  sha256T015V4, t015V4PlanSha256, validateT015V4Approval, validateT015V4ControllerApproval, validateT015V4ControllerDisclosure, validateT015V4Presentation,
  type T015V4BalanceObservation, type T015V4Plan, type T015V4Presentation,
} from "./canonical-shard-1-production-v4";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
function option(args: readonly string[], name: string): string { const index = args.indexOf(name); const value = index < 0 ? undefined : args[index + 1]; if (!value || value.startsWith("--")) throw new Error(`missing ${name}`); return value; }
function optional(args: readonly string[], name: string): string | undefined { const index = args.indexOf(name); if (index < 0) return undefined; return option(args, name); }

export function writeT015V4NoClobber(root: string, path: string, value: unknown): string {
  const target = resolve(root, path);
  const bytes = renderT015CanonicalJson(value);
  if (existsSync(target)) { if (lstatSync(target).isSymbolicLink() || readFileSync(target, "utf8") !== bytes) throw new Error("T015 v4 evidence no-clobber conflict"); return bytes; }
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try { writeFileSync(descriptor, bytes); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  try {
    try { linkSync(temporary, target); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; if (lstatSync(target).isSymbolicLink() || readFileSync(target, "utf8") !== bytes) throw new Error("T015 v4 evidence no-clobber conflict"); }
    unlinkSync(temporary);
  } finally { rmSync(temporary, { force: true }); }
  return bytes;
}

export function checkT015V4Preparation(root = repositoryRoot): { plan: T015V4Plan; plan_sha256: string; pending_sha256: string; authorized: boolean } {
  const binding = loadT015V4Binding(root);
  const risk = buildT015V4Risk();
  const schema = buildT015V4Schema();
  const forensics = buildT015V4Forensics(root);
  const plan = buildT015V4Plan(root);
  const pending = buildT015V4Pending(root, plan);
  const expected = [[T015_V4_BINDING_PATH, binding], [T015_V4_RISK_PATH, risk], [T015_V4_SCHEMA_PATH, schema], [T015_V4_FORENSICS_PATH, forensics], [T015_V4_PLAN_PATH, plan], [T015_V4_PENDING_PATH, pending]] as const;
  for (const [path, value] of expected) {
    const bytes = readFileSync(resolve(root, path), "utf8");
    const rendered = path === T015_V4_PLAN_PATH ? renderT015V4Plan(plan) : renderT015CanonicalJson(value);
    if (bytes !== rendered) throw new Error(`tracked T015 v4 artifact changed: ${path}`);
  }
  return { plan, plan_sha256: t015V4PlanSha256(plan), pending_sha256: sha256T015V4(renderT015CanonicalJson(pending)), authorized: isT015V4Authorized(root, plan) };
}

function summary(command: string, result: ReturnType<typeof checkT015V4Preparation>): Record<string, unknown> {
  return { command, plan_sha256: result.plan_sha256, pending_disclosure_sha256: result.pending_sha256, authorized: result.authorized, paid_assets: T015_V4_PAID_ASSET_COUNT, paid_batches: T015_V4_PAID_BATCH_COUNT, additional_credit_cap_decimal: "480.00", total_credit_cap_decimal: "498.00", automatic_paid_retry_reserve_decimal: "0.00" };
}

function loadBalance(root: string, path: string | undefined): T015V4BalanceObservation | null {
  if (path === undefined) return null;
  // Operator-supplied observations stay inside the repository so safeResolve can reject
  // absolute paths, traversal, and symlinks before the disclosure is built.
  if (isAbsolute(path) || path.includes("\\") || path.split("/").some((part) => part === "" || part === "." || part === "..")) throw new Error("T015 v4 --balance-file must be a repository-relative path");
  const target = safeResolve(root, path);
  const info = lstatSync(target);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error("T015 v4 balance file must be a regular file");
  return parseT015V4BalanceFile(JSON.parse(readFileSync(target, "utf8")) as unknown);
}

export function runT015V4Preparation(args: readonly string[]): Record<string, unknown> {
  const command = args[0];
  if (command === "binding-gen") {
    if (args.length !== 1) throw new Error("usage: production-v4 binding-gen");
    const binding = buildT015V4Binding(repositoryRoot);
    atomicWriteJson(repositoryRoot, T015_V4_BINDING_PATH, binding);
    return { command, binding_sha256: sha256T015V4(renderT015CanonicalJson(binding)), files: Object.keys(binding.files).length };
  }
  if (command === "gen") {
    if (args.length !== 1) throw new Error("usage: production-v4 gen");
    atomicWriteJson(repositoryRoot, T015_V4_RISK_PATH, buildT015V4Risk());
    atomicWriteJson(repositoryRoot, T015_V4_SCHEMA_PATH, buildT015V4Schema());
    atomicWriteJson(repositoryRoot, T015_V4_FORENSICS_PATH, buildT015V4Forensics(repositoryRoot));
    const plan = buildT015V4Plan(repositoryRoot);
    atomicWriteJson(repositoryRoot, T015_V4_PLAN_PATH, plan);
    atomicWriteJson(repositoryRoot, T015_V4_PENDING_PATH, buildT015V4Pending(repositoryRoot, plan));
    return summary(command, checkT015V4Preparation());
  }
  if (command === "check") { if (args.length !== 1) throw new Error("usage: production-v4 check"); return summary(command, checkT015V4Preparation()); }
  if (command === "disclosure-build") {
    const disclosedAt = option(args, "--disclosed-at");
    const balancePath = optional(args, "--balance-file");
    if (args.length !== (balancePath === undefined ? 3 : 5) || args[1] !== "--disclosed-at") throw new Error("usage: production-v4 disclosure-build --disclosed-at <timestamp> [--balance-file <path>]");
    const checked = checkT015V4Preparation();
    const controller = buildT015V4ControllerDisclosure(repositoryRoot, checked.plan, disclosedAt);
    validateT015V4ControllerDisclosure(controller, repositoryRoot, checked.plan);
    writeT015V4NoClobber(repositoryRoot, T015_V4_CONTROLLER_DISCLOSURE_PATH, controller);
    const presentation = buildT015V4Presentation(repositoryRoot, checked.plan, loadBalance(repositoryRoot, balancePath));
    validateT015V4Presentation(presentation, repositoryRoot, checked.plan);
    writeT015V4NoClobber(repositoryRoot, T015_V4_PRESENTATION_PATH, presentation);
    const legacy = presentation.legacy_balance_disclosure as Record<string, unknown>;
    return { command, presentation_sha256: sha256T015V4(renderT015CanonicalJson(presentation)), balance_observation_present: legacy.balance_observation_present === true, observed_balance_decimal: legacy.observed_balance_decimal ?? null, implied_legacy_delta_decimal: legacy.implied_legacy_delta_decimal ?? null, legacy_delta_mismatch: legacy.legacy_delta_mismatch ?? null, authorized: false };
  }
  if (command === "approval-build") {
    if (args.length !== 3 || args[1] !== "--approved-at") throw new Error("usage: production-v4 approval-build --approved-at <timestamp>");
    const checked = checkT015V4Preparation();
    const presentation = JSON.parse(readFileSync(resolve(repositoryRoot, T015_V4_PRESENTATION_PATH), "utf8")) as T015V4Presentation;
    validateT015V4Presentation(presentation, repositoryRoot, checked.plan);
    const approvedAt = option(args, "--approved-at");
    const now = new Date(approvedAt);
    const controller = buildT015V4ControllerApproval(repositoryRoot, checked.plan, presentation, approvedAt, now);
    validateT015V4ControllerApproval(controller, repositoryRoot, checked.plan, presentation, now);
    writeT015V4NoClobber(repositoryRoot, T015_V4_CONTROLLER_APPROVAL_PATH, controller);
    const approval = buildT015V4Approval(repositoryRoot, checked.plan, presentation, now);
    validateT015V4Approval(approval, repositoryRoot, checked.plan, presentation, now);
    writeT015V4NoClobber(repositoryRoot, T015_V4_APPROVAL_PATH, approval);
    return { command, approval_sha256: sha256T015V4(renderT015CanonicalJson(approval)), authorized: true };
  }
  throw new Error("usage: production-v4 <binding-gen|gen|check|disclosure-build|approval-build>");
}
