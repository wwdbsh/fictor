import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, existsSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicWriteJson, safeResolve } from "./filesystem";
import {
  T013_APPROVAL_PATH,
  T013_DISCLOSURE_PRESENTATION_PATH,
  T013_PLAN_PATH,
  T013_RISK_PATH,
  T013_SCHEMA_EVIDENCE_PATH,
  buildT013ApprovalEvidence,
  buildT013DisclosurePresentationEvidence,
  buildT013MaterialsPlan,
  buildT013ProviderSchemaEvidence,
  buildT013RiskDisclosure,
  isT013Authorized,
  renderCanonicalJson,
  renderT013MaterialsPlan,
  t013PlanSha256,
  validateT013ApprovalEvidence,
  validateT013DisclosurePresentationEvidence,
  validateT013MaterialsPlan,
  type T013MaterialsPlan,
} from "./materials-v1";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function writeApprovalArtifactNoClobber(relativePath: string, value: unknown): string {
  const target = safeResolve(repositoryRoot, relativePath, true);
  const bytes = renderCanonicalJson(value);
  if (existsSync(target)) {
    if (lstatSync(target).isSymbolicLink()) throw new Error("T013 approval artifact path is a symlink");
    if (readFileSync(target, "utf8") !== bytes) throw new Error("T013 approval artifact already exists with different bytes");
    return bytes;
  }
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    writeFileSync(descriptor, bytes, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    try {
      linkSync(temporary, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (lstatSync(target).isSymbolicLink() || readFileSync(target, "utf8") !== bytes) throw new Error("T013 approval artifact no-clobber conflict");
    }
    unlinkSync(temporary);
  } finally {
    rmSync(temporary, { force: true });
  }
  return bytes;
}

function option(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`missing ${name}`);
  return value;
}

function checkTracked(): { plan: T013MaterialsPlan; plan_sha256: string; risk_sha256: string; schema_sha256: string; authorized: boolean } {
  const expectedPlan = buildT013MaterialsPlan(repositoryRoot);
  const expectedRisk = buildT013RiskDisclosure();
  const planBytes = readFileSync(safeResolve(repositoryRoot, T013_PLAN_PATH), "utf8");
  const riskBytes = readFileSync(safeResolve(repositoryRoot, T013_RISK_PATH), "utf8");
  const schemaBytes = readFileSync(safeResolve(repositoryRoot, T013_SCHEMA_EVIDENCE_PATH), "utf8");
  if (planBytes !== renderT013MaterialsPlan(expectedPlan)) throw new Error("tracked T013 plan bytes changed");
  if (riskBytes !== renderCanonicalJson(expectedRisk)) throw new Error("tracked T013 risk disclosure bytes changed");
  if (schemaBytes !== renderCanonicalJson(buildT013ProviderSchemaEvidence())) throw new Error("tracked T013 provider schema evidence bytes changed");
  const parsed = JSON.parse(planBytes) as T013MaterialsPlan;
  validateT013MaterialsPlan(parsed, repositoryRoot);
  return { plan: parsed, plan_sha256: sha256(planBytes), risk_sha256: sha256(riskBytes), schema_sha256: sha256(schemaBytes), authorized: isT013Authorized(repositoryRoot, parsed) };
}

export function runT013MaterialsCli(args: readonly string[]): Record<string, unknown> {
  const command = args[0];
  if (command === "gen") {
    if (args.length !== 1) throw new Error("usage: assets:materials:v1 gen");
    atomicWriteJson(repositoryRoot, T013_RISK_PATH, buildT013RiskDisclosure());
    atomicWriteJson(repositoryRoot, T013_SCHEMA_EVIDENCE_PATH, buildT013ProviderSchemaEvidence());
    atomicWriteJson(repositoryRoot, T013_PLAN_PATH, buildT013MaterialsPlan(repositoryRoot));
    const result = checkTracked();
    return { command, plan_sha256: result.plan_sha256, risk_sha256: result.risk_sha256, schema_sha256: result.schema_sha256, authorized: result.authorized };
  }
  if (command === "check") {
    if (args.length !== 1) throw new Error("usage: assets:materials:v1 check");
    const result = checkTracked();
    return { command, plan_sha256: result.plan_sha256, risk_sha256: result.risk_sha256, schema_sha256: result.schema_sha256, authorized: result.authorized };
  }
  if (command === "disclosure-record") {
    if (args.length !== 3) throw new Error("usage: assets:materials:v1 disclosure-record --disclosed-at <actual-ISO-timestamp>");
    const tracked = checkTracked();
    const evidence = buildT013DisclosurePresentationEvidence(tracked.plan, buildT013RiskDisclosure(), option(args, "--disclosed-at"));
    validateT013DisclosurePresentationEvidence(evidence, tracked.plan, buildT013RiskDisclosure());
    const bytes = writeApprovalArtifactNoClobber(T013_DISCLOSURE_PRESENTATION_PATH, evidence);
    return { command, path: T013_DISCLOSURE_PRESENTATION_PATH, evidence_sha256: sha256(bytes), disclosed_at: evidence.disclosed_at };
  }
  if (command === "approval-build") {
    if (args.length !== 5) throw new Error("usage: assets:materials:v1 approval-build --quote <exact-user-quote> --approved-at <ISO-timestamp>");
    const tracked = checkTracked();
    const presentationBytes = readFileSync(safeResolve(repositoryRoot, T013_DISCLOSURE_PRESENTATION_PATH), "utf8");
    const presentation = JSON.parse(presentationBytes) as unknown;
    if (presentationBytes !== renderCanonicalJson(presentation)) throw new Error("T013 disclosure presentation is not canonical");
    validateT013DisclosurePresentationEvidence(presentation, tracked.plan, buildT013RiskDisclosure());
    const evidence = buildT013ApprovalEvidence(tracked.plan, buildT013RiskDisclosure(), presentation, option(args, "--quote"), option(args, "--approved-at"));
    validateT013ApprovalEvidence(evidence, tracked.plan, buildT013RiskDisclosure(), presentation);
    const bytes = writeApprovalArtifactNoClobber(T013_APPROVAL_PATH, evidence);
    return { command, path: T013_APPROVAL_PATH, evidence_sha256: sha256(bytes), plan_sha256: t013PlanSha256(tracked.plan), authorized: true };
  }
  throw new Error("usage: assets:materials:v1 <gen|check|disclosure-record|approval-build>");
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    console.log(JSON.stringify(runT013MaterialsCli(process.argv.slice(2))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "T013 materials command failed");
    process.exitCode = 1;
  }
}
