import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { acquireRunnerLock, atomicWriteJson, safeResolve } from "./filesystem";
import { FakeAssetProvider } from "./fake-provider";
import { buildPlanManifest, renderPlanManifest } from "./manifest";
import {
  AssetRunner,
  createMaterialApprovalEvidence,
  readOrCreateLedger,
  validateRunId,
  verifyMaterialApprovalFiles,
} from "./runner";
import type { AssetPlanManifest, MaterialApprovalEvidence } from "./types";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultManifestRelativePath = "assets/manifests/core-v1.plan.json";

function usage(): never {
  throw new Error(
    "usage: assets <gen|check|run-fake|approve-materials> [--approval-evidence RELATIVE_PATH] [--backup-root PATH] [--run-id ID] [--approved-by NAME --approved-at RFC3339 --approval-reference REF]",
  );
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) usage();
  return value;
}

function checkedPlan(): AssetPlanManifest {
  const defaultManifestPath = safeResolve(repositoryRoot, defaultManifestRelativePath);
  const expected = buildPlanManifest(repositoryRoot);
  const expectedBytes = renderPlanManifest(expected);
  if (!existsSync(defaultManifestPath) || readFileSync(defaultManifestPath, "utf8") !== expectedBytes) {
    throw new Error("asset plan is missing, stale, or has been edited; run npm run gen:assets");
  }
  return expected;
}

function validateOptions(args: readonly string[], allowed: readonly string[]): void {
  const valueOptions = new Set(allowed);
  for (let index = 1; index < args.length; index += 1) {
    const value = args[index];
    if (valueOptions.has(value)) {
      if (!args[index + 1] || args[index + 1].startsWith("--")) usage();
      index += 1;
    } else {
      usage();
    }
  }
}

export async function runAssetCli(args: readonly string[]): Promise<Record<string, unknown>> {
  const command = args[0];
  if (!command || !["gen", "check", "run-fake", "approve-materials"].includes(command)) usage();
  if (command === "gen" || command === "check") {
    if (args.length !== 1) usage();
    const plan = buildPlanManifest(repositoryRoot);
    const expected = renderPlanManifest(plan);
    const defaultManifestPath = safeResolve(repositoryRoot, defaultManifestRelativePath, command === "gen");
    if (command === "check") {
      if (!existsSync(defaultManifestPath) || readFileSync(defaultManifestPath, "utf8") !== expected) {
        throw new Error("asset plan is missing, stale, or has been edited; run npm run gen:assets");
      }
    } else {
      atomicWriteJson(repositoryRoot, defaultManifestRelativePath, plan);
    }
    return { command, assets: plan.assets.length, batches: plan.batches.length, cost_decimal: plan.budget.total_cost_decimal };
  }

  validateOptions(args, command === "run-fake"
    ? ["--approval-evidence", "--backup-root", "--run-id"]
    : ["--backup-root", "--run-id", "--approved-by", "--approved-at", "--approval-reference"]);
  const plan = checkedPlan();
  const runId = option(args, "--run-id") ?? "fake-local";
  validateRunId(runId);
  const ledgerPath = safeResolve(repositoryRoot, `assets/runs/${runId}/ledger.json`, true);
  const runRoot = dirname(ledgerPath);
  if (command === "approve-materials") {
    const lock = acquireRunnerLock(runRoot, "runner.lock");
    try {
      const ledger = readOrCreateLedger(plan, runRoot, "ledger.json", runId);
      const backupRoot = option(args, "--backup-root") ?? resolve(repositoryRoot, "assets/backups", runId);
      verifyMaterialApprovalFiles(plan, ledger, resolve(repositoryRoot, "public/assets"), backupRoot);
      const approvedBy = option(args, "--approved-by");
      const approvedAt = option(args, "--approved-at");
      const approvalReference = option(args, "--approval-reference");
      if (!approvedBy || !approvedAt || !approvalReference) usage();
      const evidence = createMaterialApprovalEvidence(plan, ledger, {
        approved_by: approvedBy,
        approved_at: approvedAt,
        approval_reference: approvalReference,
      });
      const evidencePath = safeResolve(runRoot, "material-approval.json", true);
      atomicWriteJson(runRoot, "material-approval.json", evidence);
      return { command, run_id: runId, evidence_path: evidencePath, plan_sha256: evidence.plan_sha256 };
    } finally {
      lock.release();
    }
  }

  const backupRoot = option(args, "--backup-root") ?? resolve(repositoryRoot, "assets/backups", runId);
  const evidencePath = option(args, "--approval-evidence");
  const approvalEvidence = evidencePath
    ? JSON.parse(readFileSync(safeResolve(runRoot, evidencePath), "utf8")) as MaterialApprovalEvidence
    : undefined;
  const runner = new AssetRunner({
    plan,
    provider: new FakeAssetProvider(),
    controlRoot: runRoot,
    ledgerRelativePath: "ledger.json",
    localRoot: resolve(repositoryRoot, "public/assets"),
    backupRoot,
    lockRelativePath: "runner.lock",
    runId,
    ...(approvalEvidence ? { approvalEvidence } : {}),
  });
  const ledger = await runner.run();
  return {
    command,
    run_id: runId,
    complete_batches: Object.values(ledger.batches).filter(({ state }) => state === "COMPLETE").length,
    successful: ledger.successful,
  };
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runAssetCli(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result))).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "asset command failed");
    process.exitCode = 1;
  });
}
