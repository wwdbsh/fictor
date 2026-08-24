import { appendFileSync, copyFileSync, mkdirSync, readFileSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import {
  T055_AUDIT_PATH,
  T055_DISPOSITION_PATH,
  T055_OWNER_DISPOSITION,
  T055_OBSERVED_PATH,
  T055_SELECTED_STYLE_PATH,
  T055_T022_PATH,
  assertT055Complete,
  assertT055OwnerDisposition,
  checkT055,
  checkT055Disposition,
  validateT055Audit,
  validateT055Disposition,
  validateT055Observed,
} from "../../scripts/assets/t055-account-model-rights-audit";
import { createOwnedTempManager } from "../helpers/owned-temp";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const observedBytes = readFileSync(resolve(repositoryRoot, T055_OBSERVED_PATH));
const observed = JSON.parse(observedBytes.toString("utf8"));
const auditBytes = readFileSync(resolve(repositoryRoot, T055_AUDIT_PATH));
const audit = JSON.parse(auditBytes.toString("utf8"));
const disposition = JSON.parse(readFileSync(resolve(repositoryRoot, T055_DISPOSITION_PATH), "utf8"));
const t022 = JSON.parse(readFileSync(resolve(repositoryRoot, T055_T022_PATH), "utf8"));
const tempManager = createOwnedTempManager("t055-account-model-rights-audit");

describe("T055 blocked account and model rights audit", () => {
  test("verifies 622 structural rows while preserving six substantive blockers", () => {
    expect(checkT055(repositoryRoot)).toEqual({
      result: "PASS_BLOCKED",
      release_assets: 622,
      structural_gaps: 0,
      substantive_gaps: 6,
      completion_eligible: false,
      raw_evidence_stored: false,
    });
  });

  test("keeps completion assertion fail-closed and separate from blocked-state check", () => {
    expect(() => assertT055Complete(repositoryRoot)).toThrow("T055_NOT_COMPLETE:6");
  });

  test("rejects account observation expansion, raw capture, and forbidden identity fields", () => {
    const expanded = structuredClone(observed);
    expanded.account_ui.visible_asset_count = 686;
    expect(() => validateT055Observed(expanded, repositoryRoot)).toThrow(/T055_ACCOUNT_VALUES/);

    const raw = structuredClone(observed);
    raw.raw_evidence_stored = true;
    expect(() => validateT055Observed(raw, repositoryRoot)).toThrow(/T055_OBSERVED_BOUNDARY/);

    const identity = structuredClone(observed);
    identity.account_ui.email = "redacted";
    expect(() => validateT055Observed(identity, repositoryRoot)).toThrow(/T055_FORBIDDEN_FIELD:email/);
  });

  test("rejects coordinated attempts to erase gaps or release candidates 02-04", () => {
    const completed = structuredClone(audit);
    completed.coverage.substantive = { status: "VERIFIED", claims: 6, verified: 6, unresolved: 0, not_applicable: 0, gaps: 0 };
    completed.decision.completion_eligible = true;
    expect(() => validateT055Audit(completed, observedBytes, repositoryRoot)).toThrow(/T055_SUBSTANTIVE_COVERAGE/);

    const leaked = structuredClone(audit);
    leaked.release_inventory.evidence_only_candidates[0].production_count = 1;
    expect(() => validateT055Audit(leaked, observedBytes, repositoryRoot)).toThrow(/T055_INVENTORY_VALUES/);
  });

  test("exact-binds claim reasons and rejects sensitive values recursively", () => {
    const rewritten = structuredClone(audit);
    rewritten.substantive_claims[0].reason += " 별도 추정을 허용한다.";
    expect(() => validateT055Audit(rewritten, observedBytes, repositoryRoot)).toThrow(/T055_CLAIM_VALUES/);

    for (const injected of [
      " 담당자 victim@example.com",
      " Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaWN0b3IifQ.signaturevalue",
      " https://cdn.example.invalid/file?token=secret-value-1234",
      " /@private-profile",
    ]) {
      const sensitive = structuredClone(audit);
      sensitive.substantive_claims[0].reason += injected;
      expect(() => validateT055Audit(sensitive, observedBytes, repositoryRoot)).toThrow(/T055_FORBIDDEN_VALUE/);
    }
  });
});

describe("T055 owner release-risk disposition", () => {
  test("accepts the exact owner disposition without changing the historical blocked audit", () => {
    const expected = {
      result: "PASS_OWNER_DISPOSITION",
      disposition: T055_OWNER_DISPOSITION,
      release_assets: 622,
      structural_gaps: 0,
      substantive_gaps: 6,
      historical_completion_eligible: false,
      rights_verified: false,
      legal_warranty: false,
      release_authorized: false,
    };
    expect(checkT055Disposition(repositoryRoot)).toEqual(expected);
    expect(assertT055OwnerDisposition(repositoryRoot)).toEqual(expected);
    expect(checkT055(repositoryRoot).completion_eligible).toBe(false);
    expect(() => assertT055Complete(repositoryRoot)).toThrow("T055_NOT_COMPLETE:6");
  });

  test("rejects mutations to audit, Goal, Task, release digest, and owner statement bindings", () => {
    const cases: Array<[string, (candidate: typeof disposition) => void, RegExp]> = [
      ["audit hash", (candidate) => { candidate.historical_audit_binding.sha256 = "0".repeat(64); }, /T055_DISPOSITION_AUDIT_BINDING/],
      ["Goal contract", (candidate) => { candidate.goal_binding.contract_sha256 = "0".repeat(64); }, /T055_DISPOSITION_GOAL_BINDING/],
      ["Task contract", (candidate) => { candidate.task_contract_sha256 = "0".repeat(64); }, /T055_DISPOSITION_TASK_CONTRACT/],
      ["approval time", (candidate) => { candidate.approved_at = "2026-08-24T04:05:08Z"; }, /T055_DISPOSITION_APPROVED_AT/],
      ["release digest", (candidate) => { candidate.release_scope.digest_sha256 = "0".repeat(64); }, /T055_DISPOSITION_RELEASE_SCOPE/],
      ["release count", (candidate) => { candidate.release_scope.production_ai_png = 621; }, /T055_DISPOSITION_RELEASE_SCOPE/],
      ["gap count", (candidate) => { candidate.release_scope.substantive_gaps = 5; }, /T055_DISPOSITION_RELEASE_SCOPE/],
      ["disposition", (candidate) => { candidate.owner_decision.disposition = "VERIFIED"; }, /T055_DISPOSITION_OWNER_DECISION/],
      ["owner statement", (candidate) => { candidate.owner_decision.exact_statement += " 추가 해석"; }, /T055_DISPOSITION_OWNER_DECISION/],
    ];
    for (const [, mutate, error] of cases) {
      const candidate = structuredClone(disposition);
      mutate(candidate);
      expect(() => validateT055Disposition(candidate, auditBytes)).toThrow(error);
    }

    const changedAuditBytes = Buffer.concat([auditBytes, Buffer.from("\n")]);
    expect(() => validateT055Disposition(disposition, changedAuditBytes)).toThrow(/T055_DISPOSITION_AUDIT_BYTES/);
  });

  test("rejects rights claims, widened authorization, or weakened rollback", () => {
    const rightsClaim = structuredClone(disposition);
    rightsClaim.non_claims.rights_verification = true;
    expect(() => validateT055Disposition(rightsClaim, auditBytes)).toThrow(/T055_DISPOSITION_NON_CLAIMS/);

    const releaseApproval = structuredClone(disposition);
    releaseApproval.authorization_boundaries.release = true;
    expect(() => validateT055Disposition(releaseApproval, auditBytes)).toThrow(/T055_DISPOSITION_AUTHORIZATION_BOUNDARIES/);

    const inferredCarryForward = structuredClone(disposition);
    inferredCarryForward.rollback.automatic_carry_forward = true;
    expect(() => validateT055Disposition(inferredCarryForward, auditBytes)).toThrow(/T055_DISPOSITION_ROLLBACK/);

    const missingConflict = structuredClone(disposition);
    missingConflict.rollback.conditions.pop();
    expect(() => validateT055Disposition(missingConflict, auditBytes)).toThrow(/T055_DISPOSITION_ROLLBACK/);
  });

  test("rejects forbidden sensitive fields and values recursively", () => {
    const sensitiveField = structuredClone(disposition);
    sensitiveField.owner_decision.email = "redacted";
    expect(() => validateT055Disposition(sensitiveField, auditBytes)).toThrow(/T055_FORBIDDEN_FIELD:email/);

    for (const injected of [
      " 담당자 victim@example.com",
      " Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaWN0b3IifQ.signaturevalue",
      " https://cdn.example.invalid/file?token=secret-value-1234",
      " /@private-profile",
    ]) {
      const sensitiveValue = structuredClone(disposition);
      sensitiveValue.owner_decision.exact_statement += injected;
      expect(() => validateT055Disposition(sensitiveValue, auditBytes)).toThrow(/T055_FORBIDDEN_VALUE/);
    }
  });

  test("rejects a changed production PNG byte without mutating repository assets", () => {
    const root = tempManager.create("fictor-t055-disposition-bytes-");
    mkdirSync(resolve(root, "assets"), { recursive: true });
    symlinkSync(resolve(repositoryRoot, "assets/evidence"), resolve(root, "assets/evidence"));
    symlinkSync(resolve(repositoryRoot, "assets/manifests"), resolve(root, "assets/manifests"));
    mkdirSync(resolve(root, "scripts"), { recursive: true });
    symlinkSync(resolve(repositoryRoot, "scripts/assets"), resolve(root, "scripts/assets"));

    const productionPaths = [
      ...t022.assets.records.map(({ public_path }: { public_path: string }) => public_path),
      T055_SELECTED_STYLE_PATH,
    ];
    for (const path of productionPaths) {
      const destination = resolve(root, path);
      mkdirSync(dirname(destination), { recursive: true });
      symlinkSync(resolve(repositoryRoot, path), destination);
    }

    const changedPath = t022.assets.records[0].public_path as string;
    const changedDestination = resolve(root, changedPath);
    unlinkSync(changedDestination);
    copyFileSync(resolve(repositoryRoot, changedPath), changedDestination);
    appendFileSync(changedDestination, Buffer.from([0]));

    expect(() => assertT055OwnerDisposition(root)).toThrow(`T055_DISPOSITION_RELEASE_BYTES:${changedPath}`);
  });
});
