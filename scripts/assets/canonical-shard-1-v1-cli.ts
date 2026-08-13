import { randomUUID } from "node:crypto";
import { closeSync, constants, existsSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicWriteJson, safeResolve } from "./filesystem";
import {
  T015_APPROVAL_PATH,
  T015_IMPLEMENTATION_BINDING_PATH,
  T015_PLAN_PATH,
  T015_PRESENTATION_PATH,
  T015_RISK_PATH,
  T015_SCHEMA_PATH,
  buildT015ApprovalEvidence,
  buildT015CanonicalShardPlan,
  buildT015DisclosurePresentationEvidence,
  buildT015ImplementationBinding,
  buildT015ProviderSchemaEvidence,
  buildT015RiskDisclosure,
  isT015Authorized,
  renderT015CanonicalJson,
  renderT015Plan,
  sha256T015,
  t015PlanSha256,
  validateT015ApprovalEvidence,
  validateT015CanonicalShardPlan,
  validateT015DisclosurePresentationEvidence,
  type T015CanonicalShardPlan,
} from "./canonical-shard-1-v1";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function writeNoClobber(relativePath: string, value: unknown): string {
  const target = safeResolve(repositoryRoot, relativePath, true);
  const bytes = renderT015CanonicalJson(value);
  if (existsSync(target)) {
    if (lstatSync(target).isSymbolicLink() || readFileSync(target, "utf8") !== bytes) throw new Error("T015 evidence no-clobber conflict");
    return bytes;
  }
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try { writeFileSync(descriptor, bytes, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  try {
    try { linkSync(temporary, target); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (lstatSync(target).isSymbolicLink() || readFileSync(target, "utf8") !== bytes) throw new Error("T015 evidence no-clobber conflict");
    }
    unlinkSync(temporary);
  } finally { rmSync(temporary, { force: true }); }
  return bytes;
}

function checkTracked(): { plan: T015CanonicalShardPlan; plan_sha256: string; risk_sha256: string; schema_sha256: string; authorized: boolean } {
  const expectedPlan = buildT015CanonicalShardPlan(repositoryRoot);
  const expectedRisk = buildT015RiskDisclosure();
  const expectedSchema = buildT015ProviderSchemaEvidence();
  const planBytes = readFileSync(safeResolve(repositoryRoot, T015_PLAN_PATH), "utf8");
  const riskBytes = readFileSync(safeResolve(repositoryRoot, T015_RISK_PATH), "utf8");
  const schemaBytes = readFileSync(safeResolve(repositoryRoot, T015_SCHEMA_PATH), "utf8");
  if (planBytes !== renderT015Plan(expectedPlan) || riskBytes !== renderT015CanonicalJson(expectedRisk) || schemaBytes !== renderT015CanonicalJson(expectedSchema)) throw new Error("tracked T015 preparation artifacts changed");
  const plan = JSON.parse(planBytes) as T015CanonicalShardPlan;
  validateT015CanonicalShardPlan(plan, repositoryRoot);
  return { plan, plan_sha256: sha256T015(planBytes), risk_sha256: sha256T015(riskBytes), schema_sha256: sha256T015(schemaBytes), authorized: isT015Authorized(repositoryRoot, plan) };
}

export function runT015CanonicalShardCli(args: readonly string[]): Record<string, unknown> {
  const command = args[0];
  if (command === "binding-gen") {
    if (args.length !== 1) throw new Error("usage: assets:canonical:shard1:v1 binding-gen");
    const binding = buildT015ImplementationBinding(repositoryRoot);
    atomicWriteJson(repositoryRoot, T015_IMPLEMENTATION_BINDING_PATH, binding);
    return { command, path: T015_IMPLEMENTATION_BINDING_PATH, binding_sha256: sha256T015(renderT015CanonicalJson(binding)), runtime_inputs: Object.keys(binding.files).length };
  }
  if (command === "gen") {
    if (args.length !== 1) throw new Error("usage: assets:canonical:shard1:v1 gen");
    atomicWriteJson(repositoryRoot, T015_RISK_PATH, buildT015RiskDisclosure());
    atomicWriteJson(repositoryRoot, T015_SCHEMA_PATH, buildT015ProviderSchemaEvidence());
    atomicWriteJson(repositoryRoot, T015_PLAN_PATH, buildT015CanonicalShardPlan(repositoryRoot));
    const checked = checkTracked();
    return { command, plan_sha256: checked.plan_sha256, risk_sha256: checked.risk_sha256, schema_sha256: checked.schema_sha256, authorized: checked.authorized };
  }
  if (command === "check") {
    if (args.length !== 1) throw new Error("usage: assets:canonical:shard1:v1 check");
    const checked = checkTracked();
    return { command, plan_sha256: checked.plan_sha256, risk_sha256: checked.risk_sha256, schema_sha256: checked.schema_sha256, authorized: checked.authorized };
  }
  if (command === "disclosure-record") {
    if (args.length !== 1) throw new Error("usage: assets:canonical:shard1:v1 disclosure-record");
    const checked = checkTracked();
    const risk = buildT015RiskDisclosure();
    const schema = buildT015ProviderSchemaEvidence();
    const evidence = buildT015DisclosurePresentationEvidence(repositoryRoot, checked.plan, risk, schema);
    validateT015DisclosurePresentationEvidence(evidence, repositoryRoot, checked.plan, risk, schema);
    const bytes = writeNoClobber(T015_PRESENTATION_PATH, evidence);
    return { command, path: T015_PRESENTATION_PATH, evidence_sha256: sha256T015(bytes), disclosed_at: evidence.disclosed_at };
  }
  if (command === "approval-build") {
    if (args.length !== 1) throw new Error("usage: assets:canonical:shard1:v1 approval-build");
    const checked = checkTracked();
    const risk = buildT015RiskDisclosure();
    const schema = buildT015ProviderSchemaEvidence();
    const presentationBytes = readFileSync(safeResolve(repositoryRoot, T015_PRESENTATION_PATH), "utf8");
    const presentation = JSON.parse(presentationBytes) as unknown;
    if (presentationBytes !== renderT015CanonicalJson(presentation)) throw new Error("T015 presentation evidence is not canonical");
    validateT015DisclosurePresentationEvidence(presentation, repositoryRoot, checked.plan, risk, schema);
    const evidence = buildT015ApprovalEvidence(repositoryRoot, checked.plan, risk, schema, presentation);
    validateT015ApprovalEvidence(evidence, repositoryRoot, checked.plan, risk, schema, presentation);
    const bytes = writeNoClobber(T015_APPROVAL_PATH, evidence);
    return { command, path: T015_APPROVAL_PATH, evidence_sha256: sha256T015(bytes), plan_sha256: t015PlanSha256(checked.plan), authorized: true };
  }
  throw new Error("usage: assets:canonical:shard1:v1 <binding-gen|gen|check|disclosure-record|approval-build>");
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { console.log(JSON.stringify(runT015CanonicalShardCli(process.argv.slice(2)))); }
  catch (error) { console.error(error instanceof Error ? error.message : "T015 preparation command failed"); process.exitCode = 1; }
}
