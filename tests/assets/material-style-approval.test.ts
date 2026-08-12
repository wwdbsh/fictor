import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  MATERIAL_STYLE_APPROVAL_PATH,
  T014_ACTUAL_EVIDENCE_SHA256,
  T014_CONTACT_SHEET_SHA256,
  T014_CONTRACT_SHA256,
  T014_CONTROLLER_APPROVED_AT,
  T014_EXACT_APPROVAL,
  T014_MASTER_STYLE_SHA256,
  T014_PLAN_SHA256,
  buildMaterialStyleApprovalManifest,
  renderMaterialStyleApprovalManifest,
  validateMaterialStyleApprovalManifest,
  type MaterialStyleApprovalManifest,
} from "../../scripts/assets/material-style-approval";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const pinnedSourcePaths = [
  "assets/manifests/materials-v1.plan.json",
  "assets/evidence/t013-materials-actual-run-v1.json",
  "docs/asset-runs/contact-sheets/t013-materials-v1.html",
  "assets/manifests/master-style-v1.json",
] as const;

let fixtureRoot: string;
let fixtureManifest: MaterialStyleApprovalManifest;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sha256(root: string, path: string): string {
  return createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");
}

function copyIntoFixture(path: string, targetPath = path): void {
  const target = resolve(fixtureRoot, targetPath);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(resolve(repositoryRoot, path), target);
}

describe("T014 material style approval", () => {
  beforeAll(() => {
    fixtureRoot = mkdtempSync(resolve(tmpdir(), "fictor-t014-"));
    for (const path of pinnedSourcePaths) copyIntoFixture(path);
    const plan = JSON.parse(readFileSync(resolve(repositoryRoot, "assets/manifests/materials-v1.plan.json"), "utf8")) as {
      assets: Array<{ path: string }>;
    };
    for (const { path } of plan.assets) {
      copyIntoFixture(`public/assets/${path}`);
      copyIntoFixture(`public/assets/${path}`, `assets/backups/t013-materials/${path}`);
    }
    fixtureManifest = buildMaterialStyleApprovalManifest(fixtureRoot);
  }, 30_000);

  afterAll(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  test("builds deterministic canonical bytes for exactly the recovered T013 52-image order", () => {
    const first = fixtureManifest;
    const second = buildMaterialStyleApprovalManifest(fixtureRoot);
    expect(renderMaterialStyleApprovalManifest(first)).toBe(renderMaterialStyleApprovalManifest(second));
    expect(readFileSync(resolve(repositoryRoot, MATERIAL_STYLE_APPROVAL_PATH), "utf8"))
      .toBe(renderMaterialStyleApprovalManifest(first));
    expect(first.decision).toEqual({
      decision_id: "T014_MATERIAL_STYLE_APPROVAL",
      issue_contract_sha256: T014_CONTRACT_SHA256,
      state: "APPROVED_EXISTING_T013_52_ONLY",
      user_evidence: {
        exact_text_ko: T014_EXACT_APPROVAL,
        controller_approved_at: T014_CONTROLLER_APPROVED_AT,
        source: "current user conversation",
        sequence: "AFTER_FULL_SET_HANDOFF_AND_QA_DISCLOSURE",
      },
    });
    expect(first.review).toMatchObject({ total: 52, reviewed: 52, approved: 52, pending: 0, rejected: 0, replacement_required: 0 });
    expect(first.review.assets).toHaveLength(52);
    expect(first.review.assets.map(({ index }) => index)).toEqual(Array.from({ length: 52 }, (_, index) => index));
    expect(new Set(first.review.assets.map(({ id }) => id)).size).toBe(52);
    expect(first.review.assets.every(({ status }) => status === "APPROVED")).toBe(true);
  }, 30_000);

  test("binds pinned sources and every approved local and backup image hash", () => {
    expect(sha256(repositoryRoot, "assets/manifests/materials-v1.plan.json")).toBe(T014_PLAN_SHA256);
    expect(sha256(repositoryRoot, "assets/evidence/t013-materials-actual-run-v1.json")).toBe(T014_ACTUAL_EVIDENCE_SHA256);
    expect(sha256(repositoryRoot, "docs/asset-runs/contact-sheets/t013-materials-v1.html")).toBe(T014_CONTACT_SHEET_SHA256);
    expect(sha256(repositoryRoot, "assets/manifests/master-style-v1.json")).toBe(T014_MASTER_STYLE_SHA256);
    for (const path of pinnedSourcePaths) expect(sha256(fixtureRoot, path)).toBe(sha256(repositoryRoot, path));
    for (const asset of fixtureManifest.review.assets) {
      expect(sha256(fixtureRoot, `public/assets/${asset.path}`)).toBe(asset.image_sha256);
      expect(sha256(fixtureRoot, `assets/backups/t013-materials/${asset.path}`)).toBe(asset.image_sha256);
    }
  });

  test("accepts disclosed flags only for existing bytes and keeps future policies strict", () => {
    const manifest = fixtureManifest;
    expect(manifest.accepted_qa_flags.map(({ flag_id, disposition }) => ({ flag_id, disposition }))).toEqual([
      { flag_id: "TOOL_08_TEXT_LIKE_LABEL", disposition: "ACCEPTED_FOR_EXISTING_T013_52_ONLY" },
      { flag_id: "ODD_01_MASTER_COMPOSITION_AND_JOINTED_LEG_LEAKAGE", disposition: "ACCEPTED_FOR_EXISTING_T013_52_ONLY" },
      { flag_id: "GENERAL_STYLE_PAPER_3D_COLOR_DRIFT", disposition: "ACCEPTED_FOR_EXISTING_T013_52_ONLY" },
    ]);
    expect(manifest.future_policy).toEqual({
      existing_byte_acceptance_is_precedent: false,
      no_text_policy: "UNCHANGED_REQUIRED",
      media_only_non_copy_policy: "UNCHANGED_REQUIRED",
      prompt_policy: "UNCHANGED_REQUIRED",
      style_policy: "UNCHANGED_REQUIRED",
      replacement_or_new_bytes_require_new_revision_and_approval: true,
    });
  });

  test("opens the T015 dependency but does not authorize a provider call", () => {
    const downstream = fixtureManifest.downstream;
    expect(downstream).toMatchObject({
      canonical_bulk_style_gate: "GO",
      t015_dependency: "SATISFIED",
      t014_authorizes_provider_call: false,
      immediate_provider_call: "NOT_AUTHORIZED",
      t015_requires_selected_task_cycle: true,
    });
    expect(downstream.t015_execution_requirements).toEqual(expect.arrayContaining([
      "FROZEN_RUN_PLAN",
      "CURRENT_COST_BALANCE_AND_PREFLIGHT",
      "CURRENT_PROVIDER_SCHEMA_MODEL_AND_BATCH_CONSTRAINTS",
      "BATCH_SIZE_AT_MOST_12",
      "USE_UNLIM_FALSE",
      "IMMEDIATE_LOCAL_AND_DISTINCT_BACKUP_RECOVERY",
    ]));
  });

  test("fails closed when the distinct fixture backup is missing", () => {
    const asset = fixtureManifest.review.assets[0];
    const backupPath = resolve(fixtureRoot, "assets/backups/t013-materials", asset.path);
    unlinkSync(backupPath);
    try {
      expect(() => buildMaterialStyleApprovalManifest(fixtureRoot)).toThrow("LOCAL_VERIFY_FAILED");
    } finally {
      copyFileSync(resolve(fixtureRoot, "public/assets", asset.path), backupPath);
    }
  });

  test("fails closed on QA flag or exact-set decision tampering", () => {
    const withoutFlag = clone(fixtureManifest) as unknown as Record<string, any>;
    withoutFlag.accepted_qa_flags.pop();
    expect(() => validateMaterialStyleApprovalManifest(withoutFlag as unknown as MaterialStyleApprovalManifest, fixtureRoot))
      .toThrow("approved T014 decision");

    const duplicatedAsset = clone(fixtureManifest) as unknown as Record<string, any>;
    duplicatedAsset.review.assets[1] = duplicatedAsset.review.assets[0];
    expect(() => validateMaterialStyleApprovalManifest(duplicatedAsset as unknown as MaterialStyleApprovalManifest, fixtureRoot))
      .toThrow("approved T014 decision");
  }, 30_000);
});
