import { randomUUID } from "node:crypto";
import { closeSync, constants, existsSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicWriteJson, safeResolve } from "./filesystem";
import {
  T015_V2_APPROVAL_PATH,
  T015_V2_DISCLOSURE_PACKET_PATH,
  T015_V2_FORENSICS_PATH,
  T015_V2_IMPLEMENTATION_BINDING_PATH,
  T015_V2_PLAN_PATH,
  T015_V2_PRESENTATION_PATH,
  T015_V2_RISK_PATH,
  T015_V2_SCHEMA_PATH,
  buildT015V1ForensicMigrationEvidence,
  buildT015V2ApprovalEvidence,
  buildT015V2CanonicalShardPlan,
  buildT015V2DisclosurePacket,
  buildT015V2DisclosurePresentationEvidence,
  buildT015V2ImplementationBinding,
  buildT015V2ProviderSchemaEvidence,
  buildT015V2RiskDisclosure,
  isT015V2Authorized,
  renderT015CanonicalJson,
  renderT015V2Plan,
  sha256T015,
  t015V2PlanSha256,
  validateT015V2ApprovalEvidence,
  validateT015V2CanonicalShardPlan,
  validateT015V2DisclosurePresentationEvidence,
  type T015V2CanonicalShardPlan,
} from "./canonical-shard-1-v1-continuation-v2";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function writeNoClobber(path: string, value: unknown): string {
  const target = safeResolve(repositoryRoot, path, true); const bytes = renderT015CanonicalJson(value);
  if (existsSync(target)) { if (lstatSync(target).isSymbolicLink() || readFileSync(target, "utf8") !== bytes) throw new Error("T015 v2 evidence no-clobber conflict"); return bytes; }
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`; const descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600); try { writeFileSync(descriptor, bytes, "utf8"); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  try { try { linkSync(temporary, target); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; if (lstatSync(target).isSymbolicLink() || readFileSync(target, "utf8") !== bytes) throw new Error("T015 v2 evidence no-clobber conflict"); } unlinkSync(temporary); } finally { rmSync(temporary, { force: true }); }
  return bytes;
}

function checkTracked(): { plan: T015V2CanonicalShardPlan; plan_sha256: string; packet_sha256: string; authorized: boolean } {
  const expectedPlan = buildT015V2CanonicalShardPlan(repositoryRoot); const expectedRisk = buildT015V2RiskDisclosure(); const expectedSchema = buildT015V2ProviderSchemaEvidence(); const expectedForensics = buildT015V1ForensicMigrationEvidence(); const expectedPacket = buildT015V2DisclosurePacket(repositoryRoot, expectedPlan, expectedRisk, expectedSchema);
  const planBytes = readFileSync(safeResolve(repositoryRoot, T015_V2_PLAN_PATH), "utf8"); const riskBytes = readFileSync(safeResolve(repositoryRoot, T015_V2_RISK_PATH), "utf8"); const schemaBytes = readFileSync(safeResolve(repositoryRoot, T015_V2_SCHEMA_PATH), "utf8"); const forensicBytes = readFileSync(safeResolve(repositoryRoot, T015_V2_FORENSICS_PATH), "utf8"); const packetBytes = readFileSync(safeResolve(repositoryRoot, T015_V2_DISCLOSURE_PACKET_PATH), "utf8");
  if (planBytes !== renderT015V2Plan(expectedPlan) || riskBytes !== renderT015CanonicalJson(expectedRisk) || schemaBytes !== renderT015CanonicalJson(expectedSchema) || forensicBytes !== renderT015CanonicalJson(expectedForensics) || packetBytes !== renderT015CanonicalJson(expectedPacket)) throw new Error("tracked T015 v2 preparation artifacts changed");
  const plan = JSON.parse(planBytes) as T015V2CanonicalShardPlan; validateT015V2CanonicalShardPlan(plan, repositoryRoot); return { plan, plan_sha256: sha256T015(planBytes), packet_sha256: sha256T015(packetBytes), authorized: isT015V2Authorized(repositoryRoot, plan) };
}

export function runT015V2PreparationCli(args: readonly string[]): Record<string, unknown> {
  const command = args[0];
  if (command === "binding-gen") { if (args.length !== 1) throw new Error("usage: continuation-v2 binding-gen"); const binding = buildT015V2ImplementationBinding(repositoryRoot); atomicWriteJson(repositoryRoot, T015_V2_IMPLEMENTATION_BINDING_PATH, binding); return { command, path: T015_V2_IMPLEMENTATION_BINDING_PATH, binding_sha256: sha256T015(renderT015CanonicalJson(binding)), runtime_inputs: Object.keys(binding.files).length }; }
  if (command === "gen") { if (args.length !== 1) throw new Error("usage: continuation-v2 gen"); atomicWriteJson(repositoryRoot, T015_V2_RISK_PATH, buildT015V2RiskDisclosure()); atomicWriteJson(repositoryRoot, T015_V2_SCHEMA_PATH, buildT015V2ProviderSchemaEvidence()); atomicWriteJson(repositoryRoot, T015_V2_FORENSICS_PATH, buildT015V1ForensicMigrationEvidence()); const plan = buildT015V2CanonicalShardPlan(repositoryRoot); atomicWriteJson(repositoryRoot, T015_V2_PLAN_PATH, plan); atomicWriteJson(repositoryRoot, T015_V2_DISCLOSURE_PACKET_PATH, buildT015V2DisclosurePacket(repositoryRoot, plan)); const checked = checkTracked(); return { command, plan_sha256: checked.plan_sha256, pending_disclosure_packet_sha256: checked.packet_sha256, authorized: checked.authorized, legacy_recovery_assets: 12, new_paid_assets: 320, additional_credit_cap_decimal: "480.00", total_credit_cap_decimal: "498.00" }; }
  if (command === "check") { if (args.length !== 1) throw new Error("usage: continuation-v2 check"); const checked = checkTracked(); return { command, plan_sha256: checked.plan_sha256, pending_disclosure_packet_sha256: checked.packet_sha256, authorized: checked.authorized, legacy_recovery_assets: 12, new_paid_assets: 320, additional_credit_cap_decimal: "480.00", total_credit_cap_decimal: "498.00" }; }
  if (command === "disclosure-record") { if (args.length !== 1) throw new Error("usage: continuation-v2 disclosure-record"); const checked = checkTracked(); const risk = buildT015V2RiskDisclosure(); const schema = buildT015V2ProviderSchemaEvidence(); const evidence = buildT015V2DisclosurePresentationEvidence(repositoryRoot, checked.plan, risk, schema); validateT015V2DisclosurePresentationEvidence(evidence, repositoryRoot, checked.plan, risk, schema); const bytes = writeNoClobber(T015_V2_PRESENTATION_PATH, evidence); return { command, path: T015_V2_PRESENTATION_PATH, evidence_sha256: sha256T015(bytes), disclosed_at: evidence.disclosed_at, authorized: false }; }
  if (command === "approval-build") { if (args.length !== 1) throw new Error("usage: continuation-v2 approval-build"); const checked = checkTracked(); const risk = buildT015V2RiskDisclosure(); const schema = buildT015V2ProviderSchemaEvidence(); const presentationBytes = readFileSync(safeResolve(repositoryRoot, T015_V2_PRESENTATION_PATH), "utf8"); const presentation = JSON.parse(presentationBytes) as unknown; if (presentationBytes !== renderT015CanonicalJson(presentation)) throw new Error("T015 v2 presentation is not canonical"); validateT015V2DisclosurePresentationEvidence(presentation, repositoryRoot, checked.plan, risk, schema); const evidence = buildT015V2ApprovalEvidence(repositoryRoot, checked.plan, risk, schema, presentation); validateT015V2ApprovalEvidence(evidence, repositoryRoot, checked.plan, risk, schema, presentation); const bytes = writeNoClobber(T015_V2_APPROVAL_PATH, evidence); return { command, path: T015_V2_APPROVAL_PATH, evidence_sha256: sha256T015(bytes), plan_sha256: t015V2PlanSha256(checked.plan), authorized: true }; }
  throw new Error("usage: continuation-v2 <binding-gen|gen|check|disclosure-record|approval-build>");
}

