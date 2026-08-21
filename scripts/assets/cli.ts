import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { acquireRunnerLock, atomicWriteJson, safeResolve } from "./filesystem";
import { FakeAssetProvider } from "./fake-provider";
import { buildPlanManifest, renderPlanManifest } from "./manifest";
import { canonicalSerialize } from "../../src/data/generator/render-generated";
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
const T044_APPROVAL_RELATIVE_PATH = "docs/balance/t043-approved-values-2026-08-21.json";

const T044_ASSET_PLAN_REBIND = {
  trackedPlanSha256: "54e3af3f68d53b17ba360e92050c361f87cb5bbc676899a0c671a95117fd3c0f",
  approvalSha256: "1b97e425bd857279f48470c2b59681b012935e6f7d45cf97e7c46b567a9ba086",
  historicalSourceHashes: {
    materials: "c1ce53ac380f637b9947211250313db25d03503f837de219dfb1ba8d7c897931",
    laws: "8e4370daf8584c3125e7dd32fc9a26599a5d7b00489f64d6b3ed5e183291ee83",
    result_classes: "b986c8e787008fd76eb87b396e7153aad8a6679d23dca1111eabd9969c740975",
    canonical_cards: "71eb299228432f906edc0423f6dc5b90ea546e886f0bf12e7a7ebac6ace6f84f",
  },
  currentSourceHashes: {
    materials: "607266635b128fe73dcde391362b0f1ea16619e879081db7c3c06eabe136cd8c",
    laws: "d4116f3f0f84d01c178940e64198a522eacd6118f57f8e97b0d36ebd6260f85b",
    result_classes: "b986c8e787008fd76eb87b396e7153aad8a6679d23dca1111eabd9969c740975",
    canonical_cards: "5f7511623cd1b1890da3dcb8fc85a09deb4909fb713b284805bed3d0962eea9b",
  },
} as const;

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function planWithoutSourceHashes(plan: AssetPlanManifest): Omit<AssetPlanManifest, "source_hashes"> {
  const { source_hashes: sourceHashes, ...stablePlan } = plan;
  void sourceHashes;
  return stablePlan;
}

export function validateT044AssetPlanRebind(
  trackedPlanBytes: string,
  currentPlan: AssetPlanManifest,
  approvalBytes: string,
): "T044_BALANCE_REBIND" {
  if (sha256Text(trackedPlanBytes) !== T044_ASSET_PLAN_REBIND.trackedPlanSha256) {
    throw new Error("T044_BALANCE_REBIND tracked asset plan bytes mismatch");
  }
  const trackedPlan = JSON.parse(trackedPlanBytes) as AssetPlanManifest;
  if (
    canonicalSerialize(trackedPlan.source_hashes) !==
    canonicalSerialize(T044_ASSET_PLAN_REBIND.historicalSourceHashes)
  ) {
    throw new Error("T044_BALANCE_REBIND historical asset source hashes mismatch");
  }
  if (
    canonicalSerialize(currentPlan.source_hashes) !==
    canonicalSerialize(T044_ASSET_PLAN_REBIND.currentSourceHashes)
  ) {
    throw new Error("T044_BALANCE_REBIND current asset source hashes mismatch");
  }
  if (
    canonicalSerialize(planWithoutSourceHashes(trackedPlan)) !==
    canonicalSerialize(planWithoutSourceHashes(currentPlan))
  ) {
    throw new Error("T044_BALANCE_REBIND stable asset plan projection mismatch");
  }
  if (sha256Text(approvalBytes) !== T044_ASSET_PLAN_REBIND.approvalSha256) {
    throw new Error("T044_BALANCE_REBIND approval artifact bytes mismatch");
  }
  const approval = JSON.parse(approvalBytes) as {
    scope?: { card_exceptions?: unknown; structural_changes?: unknown };
  };
  if (
    !Array.isArray(approval.scope?.card_exceptions) ||
    approval.scope.card_exceptions.length !== 0 ||
    approval.scope.structural_changes !== false
  ) {
    throw new Error("T044_BALANCE_REBIND approval scope permits structural asset changes");
  }
  return "T044_BALANCE_REBIND";
}

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
    let decisionBinding = "CURRENT_TARGET";
    if (command === "check") {
      if (!existsSync(defaultManifestPath)) {
        throw new Error("asset plan is missing, stale, or has been edited; run npm run gen:assets");
      }
      const trackedBytes = readFileSync(defaultManifestPath, "utf8");
      if (trackedBytes !== expected) {
        const approvalBytes = readFileSync(
          safeResolve(repositoryRoot, T044_APPROVAL_RELATIVE_PATH),
          "utf8",
        );
        decisionBinding = validateT044AssetPlanRebind(trackedBytes, plan, approvalBytes);
      }
    } else {
      atomicWriteJson(repositoryRoot, defaultManifestRelativePath, plan);
    }
    return {
      command,
      assets: plan.assets.length,
      batches: plan.batches.length,
      cost_decimal: plan.budget.total_cost_decimal,
      ...(command === "check" ? { decision_binding: decisionBinding } : {}),
    };
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
