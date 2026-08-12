import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicWriteJson, safeResolve } from "./filesystem";
import {
  MATERIAL_STYLE_APPROVAL_PATH,
  buildMaterialStyleApprovalManifest,
  renderMaterialStyleApprovalManifest,
  validateMaterialStyleApprovalManifest,
  type MaterialStyleApprovalManifest,
} from "./material-style-approval";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function checkManifest(): Record<string, unknown> {
  const expected = buildMaterialStyleApprovalManifest(repositoryRoot);
  const target = safeResolve(repositoryRoot, MATERIAL_STYLE_APPROVAL_PATH);
  if (!existsSync(target)) throw new Error("material-style-approval-v1 manifest is missing; run assets:material-style:gen");
  const bytes = readFileSync(target, "utf8");
  if (bytes !== renderMaterialStyleApprovalManifest(expected)) throw new Error("material-style-approval-v1 output bytes changed");
  const parsed = JSON.parse(bytes) as MaterialStyleApprovalManifest;
  validateMaterialStyleApprovalManifest(parsed, repositoryRoot);
  return {
    manifest_sha256: sha256(bytes),
    reviewed: parsed.review.reviewed,
    approved: parsed.review.approved,
    canonical_bulk_style_gate: parsed.downstream.canonical_bulk_style_gate,
    provider_call_authorized: parsed.downstream.t014_authorizes_provider_call,
  };
}

export function runMaterialStyleApprovalCli(args: readonly string[]): Record<string, unknown> {
  if (args.length !== 1 || (args[0] !== "gen" && args[0] !== "check")) {
    throw new Error("usage: assets:material-style <gen|check>");
  }
  if (args[0] === "gen") atomicWriteJson(repositoryRoot, MATERIAL_STYLE_APPROVAL_PATH, buildMaterialStyleApprovalManifest(repositoryRoot));
  return { command: args[0], ...checkManifest() };
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    console.log(JSON.stringify(runMaterialStyleApprovalCli(process.argv.slice(2))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "material style approval command failed");
    process.exitCode = 1;
  }
}
