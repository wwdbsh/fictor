import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import {
  CORE_V1_PLAN_SHA256,
  MASTER_STYLE_IMAGE_SHA256,
  MASTER_STYLE_MANIFEST_PATH,
  T011_ACTUAL_EVIDENCE_SHA256,
  T011_CONTACT_SHEET_SHA256,
  T011_STYLE_MANIFEST_SHA256,
  T012_CONTRACT_SHA256,
  buildMasterStyleManifest,
  renderMasterStyleManifest,
  validateMasterStyleManifest,
  type MasterStyleManifest,
} from "../../scripts/assets/master-style";

const repositoryRoot = resolve(import.meta.dirname, "../..");

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fileSha(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(repositoryRoot, path))).digest("hex");
}

function expectTamper(mutator: (manifest: Record<string, any>) => void): void {
  const manifest = clone(buildMasterStyleManifest(repositoryRoot)) as unknown as Record<string, any>;
  mutator(manifest);
  expect(() => validateMasterStyleManifest(manifest as unknown as MasterStyleManifest, repositoryRoot))
    .toThrow("approved T012 decision");
}

describe("T012 master style approval", () => {
  test("builds deterministic canonical bytes with one explicit selection", () => {
    const first = buildMasterStyleManifest(repositoryRoot);
    const second = buildMasterStyleManifest(repositoryRoot);
    expect(renderMasterStyleManifest(first)).toBe(renderMasterStyleManifest(second));
    expect(readFileSync(resolve(repositoryRoot, MASTER_STYLE_MANIFEST_PATH), "utf8"))
      .toBe(renderMasterStyleManifest(first));
    expect(first.decision).toMatchObject({
      decision_id: "T012_MASTER_STYLE_APPROVAL",
      revision: 1,
      contract_sha256: T012_CONTRACT_SHA256,
      selected_candidate_count: 1,
      user_evidence: { exact_text_ko: "후보 1 채택", approved_at: "2026-08-11T12:05:07.373Z" },
    });
    expect(first.candidate_selection).toEqual([
      { id: "style/master-candidate-01", status: "SELECTED" },
      { id: "style/master-candidate-02", status: "NOT_SELECTED" },
      { id: "style/master-candidate-03", status: "NOT_SELECTED" },
      { id: "style/master-candidate-04", status: "NOT_SELECTED" },
    ]);
    expect(first.reference_element).toMatchObject({
      reference_id: "fictor-copperplate-media-master",
      revision: 1,
      kind: "LOCAL_MASTER_IMAGE",
      provider_registration: { status: "NOT_REGISTERED", provider_media_id: null, provider_reference_id: null },
    });
    expect(first.media_style_lock.lock_scope).toBe("MEDIA_ONLY");
    expect(first.media_style_lock.subject_geometry_locked).toBe(false);
    expect(first.authorization_boundary).toMatchObject({
      t011_approval_scope: "EXACTLY_FOUR_STYLE_CANDIDATES_ONLY",
      t011_approval_inherited_by_t013_materials: false,
      t013_material_scope: { asset_count: 52, authorization_status: "NOT_AUTHORIZED" },
      satisfaction_rule: "AT_LEAST_ONE_PATH_MUST_BE_SATISFIED_IN_A_NEW_MANIFEST_REVISION",
      authorization_path_satisfied: false,
    });
    expect(first.downstream).toMatchObject({ t013_state: "BLOCKED", remote_execution_allowed: false });
  });

  test("fails closed because the four-candidate T011 approval does not authorize T013 materials", () => {
    const manifest = buildMasterStyleManifest(repositoryRoot);
    expect(manifest.authorization_boundary.t013_authorization_paths.map(({ path_id, status }) => ({ path_id, status })))
      .toEqual([
        { path_id: "T010_POLICY_REVISION_AND_T011_FULL_SCOPE_REVALIDATION", status: "NOT_SATISFIED" },
        { path_id: "NEW_T013_MATERIAL_52_USER_RISK_APPROVAL", status: "NOT_SATISFIED" },
      ]);
    expect(manifest.authorization_boundary.t013_authorization_paths[0].requirements).toEqual(expect.arrayContaining([
      "ACCOUNT_APPLICABLE_TERMS_AND_PRIVACY_REVALIDATED",
      "GOOGLE_SUPPLEMENTAL_TERMS_AND_PROVIDER_CONDITIONS_REVALIDATED",
      "TRAINING_USE_AND_MCP_PRIVACY_OPT_OUT_REVALIDATED",
      "REFERENCE_INPUT_RIGHTS_REVALIDATED",
      "PUBLICATION_DEFAULT_AND_ATTRIBUTION_REVALIDATED",
      "EXACT_CREDIT_EXPIRY_TIME_AND_TIMEZONE_REVALIDATED",
      "CURRENT_MODEL_UNIT_PRICE_AND_BALANCE_REVALIDATED",
      "USE_UNLIM_FALSE_REVALIDATED",
      "CURRENT_BATCH_LIMIT_AND_TOPOLOGY_REVALIDATED",
      "IMMEDIATE_LOCAL_AND_DISTINCT_BACKUP_RECOVERY_REVALIDATED",
    ]));
    expect(manifest.downstream.unblock_requirements).toContain("T013_MATERIAL_52_AUTHORIZATION_PATH_SATISFIED");
    expect(manifest.downstream.remote_execution_allowed).toBe(false);
  });

  test("binds every source and the selected native PNG by exact hash and size", () => {
    const expected = [
      ["assets/manifests/style-candidates-v2.json", T011_STYLE_MANIFEST_SHA256],
      ["assets/evidence/t011-style-actual-run-v2.json", T011_ACTUAL_EVIDENCE_SHA256],
      ["docs/asset-runs/contact-sheets/t011-style-candidates-v2.html", T011_CONTACT_SHEET_SHA256],
      ["assets/manifests/core-v1.plan.json", CORE_V1_PLAN_SHA256],
      ["public/assets/style/master-candidate-01.png", MASTER_STYLE_IMAGE_SHA256],
    ] as const;
    for (const [path, hash] of expected) {
      expect(existsSync(resolve(repositoryRoot, path))).toBe(true);
      expect(fileSha(path)).toBe(hash);
    }
    expect(statSync(resolve(repositoryRoot, "public/assets/style/master-candidate-01.png")).size).toBe(1_618_931);
    expect(() => validateMasterStyleManifest(buildMasterStyleManifest(repositoryRoot), repositoryRoot)).not.toThrow();
  });

  test("rejects hash, candidate, path, revision, selection, variation, and drift-policy tampering", () => {
    const mutations: Array<(manifest: Record<string, any>) => void> = [
      (m) => { m.sources.t011_actual_run_evidence.sha256 = "0".repeat(64); },
      (m) => { m.selected_candidate.image_sha256 = "0".repeat(64); },
      (m) => { m.selected_candidate.id = "style/master-candidate-02"; },
      (m) => { m.selected_candidate.candidate_path = "style/master-candidate-02.png"; },
      (m) => { m.decision.revision = 2; },
      (m) => { m.reference_element.revision = 2; },
      (m) => { m.decision.selected_candidate_count = 2; },
      (m) => { m.candidate_selection[1].status = "SELECTED"; },
      (m) => { m.allowed_variations.pop(); },
      (m) => { m.forbidden_drift.pop(); },
      (m) => { m.media_style_lock.subject_geometry_locked = true; },
      (m) => { m.reference_element.provider_registration.provider_reference_id = "invented"; },
      (m) => { m.reference_element.reference_instruction = "copy the subject"; },
      (m) => { m.authorization_boundary.t011_approval_inherited_by_t013_materials = true; },
      (m) => { m.authorization_boundary.t013_material_scope.asset_count = 4; },
      (m) => { m.authorization_boundary.t013_authorization_paths[0].status = "SATISFIED"; },
      (m) => { m.authorization_boundary.t013_authorization_paths[0].requirements.pop(); },
      (m) => { m.authorization_boundary.t013_authorization_paths[1].status = "SATISFIED"; },
      (m) => { m.authorization_boundary.authorization_path_satisfied = true; },
      (m) => { m.downstream.remote_execution_allowed = true; },
    ];
    for (const mutation of mutations) expectTamper(mutation);
  });
});
