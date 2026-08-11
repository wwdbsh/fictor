import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildStyleCandidatesManifest,
  canonicalJson,
  renderStyleCandidatesManifest,
  type StyleCandidate,
} from "./style-candidates";

export const STYLE_V2_MANIFEST_VERSION = "style-candidates-v2" as const;
export const STYLE_V1_MANIFEST_PATH = "assets/manifests/style-candidates-v1.json" as const;
export const STYLE_V1_MANIFEST_SHA256 = "1903baa41ad99f22bcd12d832f0be09879e6537c58b4d28a1b1233e053a86a7c" as const;
export const STYLE_V2_APPROVAL_PATH = "assets/evidence/t011-limited-ready-approval-v2.json" as const;
export const STYLE_V2_APPROVAL_SHA256 = "f96fafb18e8e8a24978adc2529fb34462e7285331e0c5706b8c9b3e6032fa018" as const;

const V2_GATE_CONTRACT = {
  MCP_SCHEMA: ["PASS", "mcp-schema-fields"],
  MODEL_PROVIDER: ["PASS", "model-provider"],
  COST: ["PASS_BUT_CHANGED", "cost-observation"],
  BALANCE: ["PASS", "balance-observation"],
  PRIVATE_DEFAULT: ["PASS", "private-default"],
  PUBLIC_TERMS_COMMERCIAL_USE: ["PASS_WITH_LIMITATION", "public-terms-commercial-use"],
  TRAINING_USE_ACKNOWLEDGED: ["PASS", "training-use-acknowledged"],
  LIMITED_INPUT_SCOPE: ["PASS", "limited-input-scope"],
  NO_EXTERNAL_REFERENCE: ["PASS", "no-external-reference"],
  SINGLE_REQUEST_TOPOLOGY: ["PASS", "single-request-topology"],
  USER_CREDIT_APPROVAL: ["PASS", "user-credit-approval"],
  SUPPORT_QUESTIONS: ["USER_ACCEPTED_RISK", "support-questions-waived"],
  ACCOUNT_TERMS_REVISION: ["USER_ACCEPTED_RISK", "account-terms-risk-accepted"],
  ACCOUNT_PRIVACY_REVISION: ["USER_ACCEPTED_RISK", "account-privacy-risk-accepted"],
  PROVIDER_SUPPLEMENTAL_TERMS: ["USER_ACCEPTED_RISK", "provider-supplemental-risk-accepted"],
  MCP_PRIVACY_OPT_OUT: ["USER_ACCEPTED_RISK", "mcp-opt-out-risk-accepted"],
  EXPIRY_EXACT_TIME: ["USER_ACCEPTED_RISK", "expiry-risk-accepted"],
  BATCH_LIMIT: ["NOT_APPLICABLE_COUNT1_ONLY", "single-request-topology"],
} as const;

type V2GateName = keyof typeof V2_GATE_CONTRACT;
type V2GateStatus = (typeof V2_GATE_CONTRACT)[V2GateName][0];

export interface StyleCandidatesV2Manifest {
  schema_version: 2;
  manifest_version: typeof STYLE_V2_MANIFEST_VERSION;
  predecessor: {
    path: typeof STYLE_V1_MANIFEST_PATH;
    sha256: typeof STYLE_V1_MANIFEST_SHA256;
    state: "HISTORICAL_HOLD_IMMUTABLE";
  };
  purpose: "STYLE_STUDY_ONLY";
  remote_generation_state: "READY_FOR_LIMITED_T011";
  scope: {
    candidate_count: 4;
    material_generation_allowed: false;
    bulk_generation_allowed: false;
  };
  model: "nano_banana_2";
  upstream_provider: "Google";
  tool: "generate_image";
  use_unlim: false;
  submission_topology: "ONE_REQUEST_PER_CANDIDATE";
  batch_calls_allowed: false;
  reference_policy: "NO_EXTERNAL_REFERENCE";
  references: [];
  budget: {
    unit_cost_decimal: "1.50";
    request_count: 4;
    count_per_request: 1;
    total_cap_decimal: "6.00";
  };
  approval: {
    path: typeof STYLE_V2_APPROVAL_PATH;
    sha256: typeof STYLE_V2_APPROVAL_SHA256;
    recorded_at: "2026-08-11T18:23:21+09:00";
  };
  gates: Record<V2GateName, {
    status: V2GateStatus;
    evidence: {
      path: typeof STYLE_V2_APPROVAL_PATH;
      sha256: typeof STYLE_V2_APPROVAL_SHA256;
      observation_id: string;
    };
  }>;
  candidates: StyleCandidate[];
  requests: Array<{
    candidate_id: string;
    paid_request: StyleCandidate["request"] & { get_cost: false };
    paid_request_sha256: string;
    preflight_request: StyleCandidate["request"] & { get_cost: true };
    preflight_request_sha256: string;
  }>;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${label} fields changed`);
}

export function validateStyleV2ApprovalEvidence(value: unknown): void {
  if (!isRecord(value)) throw new Error("v2 approval evidence must be an object");
  exactKeys(value, ["schema_version", "evidence_version", "recorded_at", "timezone", "secret_free", "chronology", "disclosed_plan", "approval", "observations"], "v2 approval evidence");
  if (value.schema_version !== 2 || value.evidence_version !== "t011-limited-ready-approval-v2" ||
      value.recorded_at !== "2026-08-11T18:23:21+09:00" || value.timezone !== "Asia/Seoul" || value.secret_free !== true) {
    throw new Error("invalid v2 approval evidence envelope");
  }
  if (!Array.isArray(value.chronology) || value.chronology.length !== 3) throw new Error("v2 approval chronology is required");
  const chronologyContract = [
    ["user-support-free-request", "user", "FAITHFUL_CONTEXT_SUMMARY"],
    ["assistant-limited-plan-disclosure", "assistant", "FAITHFUL_CONTEXT_SUMMARY"],
    ["user-credit-authorization", "user", "VERBATIM_EXCERPT"],
  ] as const;
  value.chronology.forEach((entry, index) => {
    if (!isRecord(entry)) throw new Error("invalid v2 approval chronology entry");
    exactKeys(entry, index === 1 ? ["id", "speaker", "representation", "text_ko", "disclosed_plan_sha256"] : ["id", "speaker", "representation", "text_ko"], "v2 approval chronology entry");
    const [id, speaker, representation] = chronologyContract[index];
    if (entry.id !== id || entry.speaker !== speaker || entry.representation !== representation || typeof entry.text_ko !== "string" || entry.text_ko.length < 20) {
      throw new Error("v2 approval chronology changed");
    }
  });
  const finalUserEntry = value.chronology[2] as Record<string, unknown>;
  if (finalUserEntry.text_ko !== "크레딧 사용하는 것은 문제 없어... 마음껏 사용해도 돼") throw new Error("v2 final user authorization excerpt changed");
  if (!isRecord(value.disclosed_plan)) throw new Error("v2 disclosed plan is required");
  exactKeys(value.disclosed_plan, [
    "official_public_terms_commercial_use_evidence_disclosed", "training_and_improvement_use_acknowledged",
    "account_terms_privacy_and_provider_revision_ambiguity_disclosed", "tool", "sequential_calls", "count_per_call", "use_unlim",
    "external_references_allowed", "sensitive_inputs_allowed", "credit_cap_decimal", "materials_allowed", "bulk_allowed",
  ], "v2 disclosed plan");
  const disclosedPlanSha = sha256(canonicalJson(value.disclosed_plan));
  if (disclosedPlanSha !== "45839c391512deceb626759b9c074f5c2fabe55294e6e210d5ffdf02f55f5e46" ||
      value.disclosed_plan.official_public_terms_commercial_use_evidence_disclosed !== true ||
      value.disclosed_plan.training_and_improvement_use_acknowledged !== true ||
      value.disclosed_plan.account_terms_privacy_and_provider_revision_ambiguity_disclosed !== true ||
      value.disclosed_plan.tool !== "generate_image" || value.disclosed_plan.sequential_calls !== 4 || value.disclosed_plan.count_per_call !== 1 ||
      value.disclosed_plan.use_unlim !== false || value.disclosed_plan.external_references_allowed !== false ||
      value.disclosed_plan.sensitive_inputs_allowed !== false || value.disclosed_plan.credit_cap_decimal !== "6.00" ||
      value.disclosed_plan.materials_allowed !== false || value.disclosed_plan.bulk_allowed !== false ||
      (value.chronology[1] as Record<string, unknown>).disclosed_plan_sha256 !== disclosedPlanSha) {
    throw new Error("v2 disclosed limited plan changed");
  }
  if (!isRecord(value.approval)) throw new Error("v2 user approval is required");
  exactKeys(value.approval, ["decision", "source", "interpretation", "chronology_ids", "disclosed_plan_sha256", "risk_acceptance", "supersedes_t010_scope", "credit_cap_decimal", "candidate_count", "materials_allowed", "bulk_allowed"], "v2 approval");
  if (value.approval.decision !== "APPROVE_LIMITED_T011_STYLE_CANDIDATES" || value.approval.source !== "current user conversation" ||
      value.approval.interpretation !== "CONTEXTUAL_APPROVAL_OF_IMMEDIATELY_PRECEDING_DISCLOSED_LIMITED_PLAN" ||
      JSON.stringify(value.approval.chronology_ids) !== JSON.stringify(chronologyContract.map(([id]) => id)) ||
      value.approval.disclosed_plan_sha256 !== disclosedPlanSha ||
      value.approval.risk_acceptance !== "PROCEED_WITHOUT_HIGGSFIELD_SUPPORT_FOR_THIS_LIMITED_T011_RUN" ||
      value.approval.supersedes_t010_scope !== "ONLY_THE_FOUR_STYLE_CANDIDATES_IN_STYLE_CANDIDATES_V2" ||
      value.approval.credit_cap_decimal !== "6.00" || value.approval.candidate_count !== 4 ||
      value.approval.materials_allowed !== false || value.approval.bulk_allowed !== false) {
    throw new Error("v2 user approval scope changed");
  }
  if (!Array.isArray(value.observations)) throw new Error("v2 observations are required");
  const ids = value.observations.map((observation) => isRecord(observation) ? observation.id : undefined);
  const requiredIds = new Set(Object.values(V2_GATE_CONTRACT).map(([, observationId]) => observationId));
  if (new Set(ids).size !== value.observations.length || [...requiredIds].some((id) => !ids.includes(id))) {
    throw new Error("v2 gate-specific observations are incomplete");
  }
  for (const observation of value.observations) {
    if (!isRecord(observation)) throw new Error("invalid v2 observation");
    exactKeys(observation, ["id", "source", "tool", "facts"], "v2 observation");
    if (typeof observation.id !== "string" || typeof observation.source !== "string" || typeof observation.tool !== "string" || !isRecord(observation.facts)) {
      throw new Error("invalid v2 observation values");
    }
  }
}

function buildGates(): StyleCandidatesV2Manifest["gates"] {
  return Object.fromEntries(Object.entries(V2_GATE_CONTRACT).map(([name, [status, observationId]]) => [name, {
    status,
    evidence: { path: STYLE_V2_APPROVAL_PATH, sha256: STYLE_V2_APPROVAL_SHA256, observation_id: observationId },
  }])) as StyleCandidatesV2Manifest["gates"];
}

export function buildStyleCandidatesV2Manifest(repositoryRoot: string): StyleCandidatesV2Manifest {
  const v1 = buildStyleCandidatesManifest(repositoryRoot);
  const v1Bytes = readFileSync(resolve(repositoryRoot, STYLE_V1_MANIFEST_PATH));
  if (sha256(v1Bytes) !== STYLE_V1_MANIFEST_SHA256 || v1Bytes.toString("utf8") !== renderStyleCandidatesManifest(v1)) {
    throw new Error("historical style-candidates-v1 changed");
  }
  const approvalBytes = readFileSync(resolve(repositoryRoot, STYLE_V2_APPROVAL_PATH));
  if (sha256(approvalBytes) !== STYLE_V2_APPROVAL_SHA256) throw new Error("v2 approval evidence changed");
  validateStyleV2ApprovalEvidence(JSON.parse(approvalBytes.toString("utf8")) as unknown);
  const manifest: StyleCandidatesV2Manifest = {
    schema_version: 2,
    manifest_version: STYLE_V2_MANIFEST_VERSION,
    predecessor: { path: STYLE_V1_MANIFEST_PATH, sha256: STYLE_V1_MANIFEST_SHA256, state: "HISTORICAL_HOLD_IMMUTABLE" },
    purpose: "STYLE_STUDY_ONLY",
    remote_generation_state: "READY_FOR_LIMITED_T011",
    scope: { candidate_count: 4, material_generation_allowed: false, bulk_generation_allowed: false },
    model: "nano_banana_2",
    upstream_provider: "Google",
    tool: "generate_image",
    use_unlim: false,
    submission_topology: "ONE_REQUEST_PER_CANDIDATE",
    batch_calls_allowed: false,
    reference_policy: "NO_EXTERNAL_REFERENCE",
    references: [],
    budget: { unit_cost_decimal: "1.50", request_count: 4, count_per_request: 1, total_cap_decimal: "6.00" },
    approval: { path: STYLE_V2_APPROVAL_PATH, sha256: STYLE_V2_APPROVAL_SHA256, recorded_at: "2026-08-11T18:23:21+09:00" },
    gates: buildGates(),
    candidates: JSON.parse(JSON.stringify(v1.candidates)) as StyleCandidate[],
    requests: v1.candidates.map((candidate) => {
      const paidRequest = { ...candidate.request, get_cost: false as const };
      const preflightRequest = { ...paidRequest, get_cost: true as const };
      return {
        candidate_id: candidate.id,
        paid_request: paidRequest,
        paid_request_sha256: sha256(canonicalJson(paidRequest)),
        preflight_request: preflightRequest,
        preflight_request_sha256: sha256(canonicalJson(preflightRequest)),
      };
    }),
  };
  validateStyleCandidatesV2Manifest(manifest, repositoryRoot);
  return manifest;
}

export function validateStyleCandidatesV2Manifest(manifest: StyleCandidatesV2Manifest, repositoryRoot: string): void {
  if (!isRecord(manifest)) throw new Error("v2 manifest must be an object");
  exactKeys(manifest as unknown as Record<string, unknown>, [
    "schema_version", "manifest_version", "predecessor", "purpose", "remote_generation_state", "scope", "model",
    "upstream_provider", "tool", "use_unlim", "submission_topology", "batch_calls_allowed", "reference_policy",
    "references", "budget", "approval", "gates", "candidates", "requests",
  ], "v2 manifest");
  if (manifest.schema_version !== 2 || manifest.manifest_version !== STYLE_V2_MANIFEST_VERSION ||
      manifest.purpose !== "STYLE_STUDY_ONLY" || manifest.remote_generation_state !== "READY_FOR_LIMITED_T011") {
    throw new Error("invalid v2 READY identity");
  }
  if (manifest.model !== "nano_banana_2" || manifest.upstream_provider !== "Google" || manifest.tool !== "generate_image" ||
      manifest.use_unlim !== false || manifest.submission_topology !== "ONE_REQUEST_PER_CANDIDATE" || manifest.batch_calls_allowed !== false) {
    throw new Error("unsafe v2 provider topology");
  }
  if (manifest.scope.candidate_count !== 4 || manifest.scope.material_generation_allowed !== false || manifest.scope.bulk_generation_allowed !== false) {
    throw new Error("v2 scope escaped four style candidates");
  }
  if (manifest.reference_policy !== "NO_EXTERNAL_REFERENCE" || manifest.references.length !== 0) throw new Error("v2 references are forbidden");
  if (manifest.budget.unit_cost_decimal !== "1.50" || manifest.budget.request_count !== 4 ||
      manifest.budget.count_per_request !== 1 || manifest.budget.total_cap_decimal !== "6.00") throw new Error("v2 budget cap changed");
  if (manifest.predecessor.path !== STYLE_V1_MANIFEST_PATH || manifest.predecessor.sha256 !== STYLE_V1_MANIFEST_SHA256 ||
      manifest.predecessor.state !== "HISTORICAL_HOLD_IMMUTABLE" || manifest.approval.path !== STYLE_V2_APPROVAL_PATH ||
      manifest.approval.sha256 !== STYLE_V2_APPROVAL_SHA256 || manifest.approval.recorded_at !== "2026-08-11T18:23:21+09:00") {
    throw new Error("v2 predecessor or approval binding changed");
  }
  const gateNames = Object.keys(V2_GATE_CONTRACT) as V2GateName[];
  if (Object.keys(manifest.gates).length !== gateNames.length) throw new Error("v2 gate set changed");
  for (const name of gateNames) {
    const [status, observationId] = V2_GATE_CONTRACT[name];
    const gate = manifest.gates[name];
    if (!gate || gate.status !== status || gate.evidence.path !== STYLE_V2_APPROVAL_PATH ||
        gate.evidence.sha256 !== STYLE_V2_APPROVAL_SHA256 || gate.evidence.observation_id !== observationId) {
      throw new Error(`v2 gate binding changed: ${name}`);
    }
  }
  const v1 = buildStyleCandidatesManifest(repositoryRoot);
  if (JSON.stringify(manifest.candidates) !== JSON.stringify(v1.candidates)) throw new Error("v2 candidates differ from immutable v1");
  if (manifest.candidates.length !== 4 || manifest.candidates.some((candidate) =>
    candidate.request.model !== "nano_banana_2" || candidate.request.aspect_ratio !== "3:4" ||
    candidate.request.resolution !== "1k" || candidate.request.use_unlim !== false || candidate.request.count !== 1)) {
    throw new Error("v2 canonical request escaped the approved shape");
  }
  if (!Array.isArray(manifest.requests) || manifest.requests.length !== 4) throw new Error("v2 must contain exactly four request pairs");
  manifest.requests.forEach((entry, index) => {
    const candidate = manifest.candidates[index];
    const paid = { ...candidate.request, get_cost: false as const };
    const preflight = { ...paid, get_cost: true as const };
    if (entry.candidate_id !== candidate.id || canonicalJson(entry.paid_request) !== canonicalJson(paid) ||
        entry.paid_request_sha256 !== sha256(canonicalJson(paid)) || canonicalJson(entry.preflight_request) !== canonicalJson(preflight) ||
        entry.preflight_request_sha256 !== sha256(canonicalJson(preflight))) {
      throw new Error("v2 paid/preflight request derivation changed");
    }
  });
  const approvalBytes = readFileSync(resolve(repositoryRoot, STYLE_V2_APPROVAL_PATH));
  if (sha256(approvalBytes) !== STYLE_V2_APPROVAL_SHA256) throw new Error("v2 approval evidence SHA mismatch");
  validateStyleV2ApprovalEvidence(JSON.parse(approvalBytes.toString("utf8")) as unknown);
}

export function isStyleV2GenerationReady(manifest: StyleCandidatesV2Manifest, repositoryRoot: string): boolean {
  try {
    validateStyleCandidatesV2Manifest(manifest, repositoryRoot);
    return true;
  } catch {
    return false;
  }
}

export function renderStyleCandidatesV2Manifest(manifest: StyleCandidatesV2Manifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function styleV2ManifestSha256(manifest: StyleCandidatesV2Manifest): string {
  return sha256(renderStyleCandidatesV2Manifest(manifest));
}
