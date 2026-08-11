import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicWriteJson, safeResolve } from "./filesystem";
import {
  MASTER_STYLE_MANIFEST_PATH,
  buildMasterStyleManifest,
  renderMasterStyleManifest,
  validateMasterStyleManifest,
  type MasterStyleManifest,
} from "./master-style";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function checkManifest(): { manifest_sha256: string; selected_candidate: string; t013_state: "BLOCKED" } {
  const expected = buildMasterStyleManifest(repositoryRoot);
  const target = safeResolve(repositoryRoot, MASTER_STYLE_MANIFEST_PATH);
  if (!existsSync(target)) throw new Error("master-style-v1 manifest is missing; run assets:master-style:gen");
  const bytes = readFileSync(target, "utf8");
  if (bytes !== renderMasterStyleManifest(expected)) throw new Error("master-style-v1 bytes differ from the approved T012 decision");
  const parsed = JSON.parse(bytes) as MasterStyleManifest;
  validateMasterStyleManifest(parsed, repositoryRoot);
  return {
    manifest_sha256: sha256(bytes),
    selected_candidate: parsed.selected_candidate.id,
    t013_state: parsed.downstream.t013_state,
  };
}

export function runMasterStyleCli(args: readonly string[]): Record<string, unknown> {
  if (args.length !== 1 || (args[0] !== "gen" && args[0] !== "check")) {
    throw new Error("usage: assets:master-style <gen|check>");
  }
  if (args[0] === "gen") {
    const manifest = buildMasterStyleManifest(repositoryRoot);
    atomicWriteJson(repositoryRoot, MASTER_STYLE_MANIFEST_PATH, manifest);
  }
  return { command: args[0], ...checkManifest() };
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    console.log(JSON.stringify(runMasterStyleCli(process.argv.slice(2))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "master style command failed");
    process.exitCode = 1;
  }
}
