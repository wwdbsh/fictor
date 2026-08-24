import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import {
  T055_AUDIT_PATH,
  T055_OBSERVED_PATH,
  assertT055Complete,
  checkT055,
  validateT055Audit,
  validateT055Observed,
} from "../../scripts/assets/t055-account-model-rights-audit";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const observedBytes = readFileSync(resolve(repositoryRoot, T055_OBSERVED_PATH));
const observed = JSON.parse(observedBytes.toString("utf8"));
const audit = JSON.parse(readFileSync(resolve(repositoryRoot, T055_AUDIT_PATH), "utf8"));

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
