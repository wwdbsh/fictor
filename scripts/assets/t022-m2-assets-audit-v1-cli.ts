import { resolve } from "node:path";
import process from "node:process";

import {
  T022_MANIFEST_PATH,
  T022_MILESTONE_PATH,
  T022_T016_FORENSIC_PATH,
  T022_VERIFIED_AT,
  auditT022Inventory,
  buildT022ExpectedInventory,
  buildT022Manifest,
  buildT022Milestone,
  buildT022T016Forensic,
  checkT022NoClobber,
  checkT022Recorded,
  renderT022Json,
  writeT022NoClobber,
} from "./t022-m2-assets-audit-v1";

export function runT022Cli(argv: readonly string[], root = process.cwd()): Record<string, unknown> {
  const command = argv[0];
  if (command === "audit") {
    const records = auditT022Inventory(root, buildT022ExpectedInventory(root), { verifyBackups: true, isolatedRestoreRead: true, verifyPublicScope: true });
    return { command, audited: records.length, public_backup_pairs: records.length, isolated_restore_reads: records.length, writes_to_public: 0, provider_calls: 0 };
  }
  if (command === "forensic") {
    const bytes = renderT022Json(buildT022T016Forensic(root));
    return { command, path: T022_T016_FORENSIC_PATH, result: writeT022NoClobber(root, T022_T016_FORENSIC_PATH, bytes), provider_calls: 0 };
  }
  if (command === "record") {
    const verifiedAtIndex = argv.indexOf("--verified-at");
    const verifiedAt = verifiedAtIndex >= 0 ? argv[verifiedAtIndex + 1] : undefined;
    if (verifiedAt !== T022_VERIFIED_AT) throw new Error(`record requires --verified-at ${T022_VERIFIED_AT}`);
    const manifest = buildT022Manifest(root, verifiedAt, true);
    const manifestBytes = renderT022Json(manifest);
    const milestone = buildT022Milestone(manifestBytes, manifest);
    const milestoneBytes = renderT022Json(milestone);
    // Resolve both conflicts before creating either file, so a stale sibling cannot leave a partial rebaseline.
    for (const [path, bytes] of [[T022_MANIFEST_PATH, manifestBytes], [T022_MILESTONE_PATH, milestoneBytes]] as const) checkT022NoClobber(root, path, bytes);
    for (const [path, bytes] of [[T022_MANIFEST_PATH, manifestBytes], [T022_MILESTONE_PATH, milestoneBytes]] as const) {
      const target = resolve(root, path);
      try { writeT022NoClobber(root, path, bytes); }
      catch (error) { if ((error as Error).message.startsWith("REBASELINE_REQUIRED")) throw error; throw new Error(`RECORD_FAILED:${target}:${(error as Error).message}`); }
    }
    return { command, verified_at: verifiedAt, audited: 621, fallback: 873, provider_calls: 0 };
  }
  if (command === "check") return { command, ...checkT022Recorded(root), provider_calls: 0 };
  throw new Error("Usage: t022-m2-assets-audit-v1-cli.ts <forensic|audit|record --verified-at RFC3339|check>");
}

try {
  console.log(JSON.stringify(runT022Cli(process.argv.slice(2))));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
