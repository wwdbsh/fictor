import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { assertNonOverlappingRoots, verifyExistingPng } from "./filesystem";

export const STYLE_MANIFEST_VERSION = "style-candidates-v1" as const;
export const STYLE_COMPLETION_VERSION = "style-candidates-completion-v1" as const;
export const STYLE_PROVIDER_LEDGER_VERSION = "style-provider-ledger-v1" as const;
export const STYLE_CANDIDATE_COUNT = 4 as const;
export const CORE_V1_SHA256 = "54e3af3f68d53b17ba360e92050c361f87cb5bbc676899a0c671a95117fd3c0f" as const;
export const PREFLIGHT_EVIDENCE_PATH = "assets/evidence/t011-preflight-observed-v1.json" as const;
export const PREFLIGHT_EVIDENCE_SHA256 = "6d7209e6ff6815cffdb8677635558bf9dc9b8c0bbe594d0e7c0c79546330c732" as const;

const SUBJECT =
  "an impossible unlabeled brass specimen: a smooth ovoid shell standing on three jointed legs with one hollow spiral opening";
const NEGATIVE_PROMPT = "No text, lettering, border, UI, logo, brand, watermark, or people.";
const MEDIA_TREATMENTS = [
  "hairline contour engraving with restrained parallel hatching and broad untouched paper",
  "crisp burin linework with short curved hatching that follows the specimen form",
  "fine crossed hatchwork with alternating shallow angles and clean highlight gaps",
  "delicate etched contour lines with sparse stipple accents between hatch groups",
] as const;

const GATE_NAMES = [
  "MCP_SCHEMA",
  "MODEL_PROVIDER",
  "COST",
  "BALANCE",
  "AUTO_PUBLISH_PRIVATE",
  "ACCOUNT_TERMS",
  "ACCOUNT_PRIVACY",
  "PROVIDER_SUPPLEMENTAL_TERMS",
  "MCP_PRIVACY_OPT_OUT",
  "EXPIRY_EXACT_TIME",
  "BATCH_LIMIT",
  "USER_REAPPROVAL",
] as const;

const CURRENT_PASS_OBSERVATIONS: Partial<Record<PreflightGateName, readonly string[]>> = {
  MCP_SCHEMA: ["mcp-schema"],
  MODEL_PROVIDER: ["mcp-schema"],
  COST: ["cost"],
  BALANCE: ["balance"],
  AUTO_PUBLISH_PRIVATE: ["private-default"],
};

export type PreflightGateName = (typeof GATE_NAMES)[number];
export type PreflightGateStatus = "PASS" | "PASS_BUT_CHANGED" | "OPEN" | "BLOCKED";
export interface PreflightEvidenceBinding {
  path: typeof PREFLIGHT_EVIDENCE_PATH;
  sha256: typeof PREFLIGHT_EVIDENCE_SHA256;
  observation_ids: string[];
}

export interface StyleReference {
  source: string;
  sha256: string;
  rights_status: "APPROVED";
}

export interface StyleCandidateRequest {
  model: "nano_banana_2";
  aspect_ratio: "3:4";
  resolution: "1k";
  prompt: string;
  use_unlim: false;
  count: 1;
}

export interface StyleCandidate {
  id: string;
  path: string;
  purpose: "STYLE_STUDY_ONLY";
  core_asset_reuse: false;
  prompt_inputs: {
    subject: string;
    composition: "SPECIMEN";
    specimen: "UNLABELED_BRASS_OVOID";
    paper: "CREAM";
    colors: ["MAGENTA"];
    density: "SPARSE";
    representation: "SOLID";
    media_treatment: string;
  };
  prompt: string;
  prompt_sha256: string;
  request: StyleCandidateRequest;
  canonical_request_sha256: string;
}

export interface StyleCandidatesManifest {
  schema_version: 1;
  manifest_version: typeof STYLE_MANIFEST_VERSION;
  purpose: "STYLE_STUDY_ONLY";
  core_asset_reuse: false;
  remote_generation_state: "HOLD_FOR_CLARIFICATION";
  model: "nano_banana_2";
  upstream_provider: "Google";
  use_unlim: false;
  provider_limit: {
    status: "UNCONFIRMED";
    schema_max_batch_size: null;
    note: "ACTUAL_BATCH_MAX_SCHEMA_ANNOTATION_NOT_OBSERVED";
  };
  submission_topology: "UNRESOLVED";
  reference_policy: "NO_EXTERNAL_REFERENCE" | "APPROVED_EXTERNAL_REFERENCES_ONLY";
  references: StyleReference[];
  core_v1: {
    manifest_path: "assets/manifests/core-v1.plan.json";
    manifest_sha256: typeof CORE_V1_SHA256;
    remote_budget_status: "STALE_FOR_REMOTE_EXECUTION";
  };
  budget_observation: {
    unit_cost_decimal: "1.50";
    candidate_count: 4;
    candidate_upper_bound_decimal: "6.00";
    balance_decimal: "945.9";
    observed_date: "2026-08-11";
    timezone: "Asia/Seoul";
    core_asset_count: 1494;
    core_cost_at_observed_unit_decimal: "2241.00";
  };
  preflight_gates: Record<PreflightGateName, PreflightGateStatus>;
  preflight_gate_evidence: Partial<Record<PreflightGateName, PreflightEvidenceBinding>>;
  candidates: StyleCandidate[];
}

export interface StyleProviderLedger {
  schema_version: 1;
  ledger_version: typeof STYLE_PROVIDER_LEDGER_VERSION;
  manifest_sha256: string;
  redacted: true;
  invocations: Array<{
    candidate_id: string;
    invocation_id: string;
    tool: "generate_image";
    model: "nano_banana_2";
    use_unlim: false;
    canonical_request_sha256: string;
    provider_result_id: string;
    submitted_at: string;
    completed_at: string;
    balance_before: { decimal: string; observed_at: string };
    balance_after: { decimal: string; observed_at: string };
  }>;
}

export interface StyleCompletionEvidence {
  schema_version: 1;
  evidence_version: typeof STYLE_COMPLETION_VERSION;
  complete: true;
  manifest_sha256: string;
  provider_ledger_sha256: string;
  actual_call_mode: "generate_image";
  balances: {
    before_decimal: string;
    after_decimal: string;
  };
  candidate_records: Array<{
    candidate_id: string;
    invocation_id: string;
    provider_result_id: string;
    canonical_request_sha256: string;
    local_relative_path: string;
    backup_relative_path: string;
    local_sha256: string;
    backup_sha256: string;
    png_recovery: {
      format: "PNG";
      width: number;
      height: number;
      size_bytes: number;
      local_verified: true;
      backup_verified: true;
    };
  }>;
}

interface CorePlanShape {
  assets?: Array<{ id?: unknown; path?: unknown }>;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validatePreflightObservedEvidence(value: unknown): void {
  if (!isRecord(value)) throw new Error("preflight observed evidence must be an object");
  assertExactKeys(value, ["schema_version", "evidence_version", "observed_at", "timezone", "secret_free", "observations"], "preflight observed evidence");
  if (value.schema_version !== 1 || value.evidence_version !== "t011-preflight-observed-v1" ||
      value.observed_at !== "2026-08-11" || value.timezone !== "Asia/Seoul" || value.secret_free !== true ||
      !Array.isArray(value.observations) || value.observations.length !== 4) {
    throw new Error("invalid preflight observed evidence envelope");
  }
  const expectedIds = ["mcp-schema", "cost", "balance", "private-default"];
  value.observations.forEach((observation, index) => {
    if (!isRecord(observation)) throw new Error("invalid preflight observation");
    assertExactKeys(observation, ["id", "source", "tool", "facts"], "preflight observation");
    if (observation.id !== expectedIds[index] || typeof observation.source !== "string" || observation.source.length < 3 ||
        typeof observation.tool !== "string" || observation.tool.length < 3 || !isRecord(observation.facts) || Object.keys(observation.facts).length < 1) {
      throw new Error("invalid preflight observation facts");
    }
  });
  assertNoSensitiveEvidence(value);
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has unexpected or missing fields`);
  }
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isDecimal(value: unknown): value is string {
  return typeof value === "string" && /^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(value);
}

function decimalParts(value: string): { units: bigint; scale: number } {
  const [whole, fraction = ""] = value.split(".");
  return { units: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function decimalDifferenceEquals(before: string, after: string, expected: string): boolean {
  const values = [decimalParts(before), decimalParts(after), decimalParts(expected)];
  const scale = Math.max(...values.map((value) => value.scale));
  const normalize = ({ units, scale: valueScale }: { units: bigint; scale: number }) =>
    units * (10n ** BigInt(scale - valueScale));
  return normalize(values[0]) - normalize(values[1]) === normalize(values[2]);
}

function assertSafeRelativePngPath(value: unknown, expected: string, label: string): void {
  if (value !== expected || !/^style\/master-candidate-0[1-4]\.png$/.test(value)) {
    throw new Error(`${label} must match the candidate manifest path`);
  }
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  const rendered = JSON.stringify(value);
  if (rendered === undefined) throw new Error("canonical JSON does not support undefined");
  return rendered;
}

export function canonicalRequestSha256(request: StyleCandidateRequest): string {
  return sha256(canonicalJson(request));
}

function candidatePrompt(mediaTreatment: string): string {
  return [
    "Antique copperplate engraving plate, 17th century manuscript style.",
    `Media treatment: ${mediaTreatment}.`,
    `Composition: SPECIMEN; subject: ${SUBJECT}; paper: CREAM; colors: MAGENTA; density: SPARSE; representation: SOLID.`,
    "Single centered subject with a strong readable silhouette at small size.",
    NEGATIVE_PROMPT,
  ].join(" ");
}

function buildCandidate(index: number, mediaTreatment: string): StyleCandidate {
  const suffix = String(index + 1).padStart(2, "0");
  const prompt = candidatePrompt(mediaTreatment);
  const request: StyleCandidateRequest = {
    model: "nano_banana_2",
    aspect_ratio: "3:4",
    resolution: "1k",
    prompt,
    use_unlim: false,
    count: 1,
  };
  return {
    id: `style/master-candidate-${suffix}`,
    path: `style/master-candidate-${suffix}.png`,
    purpose: "STYLE_STUDY_ONLY",
    core_asset_reuse: false,
    prompt_inputs: {
      subject: SUBJECT,
      composition: "SPECIMEN",
      specimen: "UNLABELED_BRASS_OVOID",
      paper: "CREAM",
      colors: ["MAGENTA"],
      density: "SPARSE",
      representation: "SOLID",
      media_treatment: mediaTreatment,
    },
    prompt,
    prompt_sha256: sha256(prompt),
    request,
    canonical_request_sha256: canonicalRequestSha256(request),
  };
}

export function buildStyleCandidatesManifest(repositoryRoot: string): StyleCandidatesManifest {
  const corePath = resolve(repositoryRoot, "assets/manifests/core-v1.plan.json");
  const coreBytes = readFileSync(corePath);
  if (sha256(coreBytes) !== CORE_V1_SHA256) throw new Error("core-v1 manifest changed; T011 is fail-closed");
  const preflightEvidenceBytes = readFileSync(resolve(repositoryRoot, PREFLIGHT_EVIDENCE_PATH));
  if (sha256(preflightEvidenceBytes) !== PREFLIGHT_EVIDENCE_SHA256) throw new Error("T011 preflight evidence changed; manifest is fail-closed");
  validatePreflightObservedEvidence(JSON.parse(preflightEvidenceBytes.toString("utf8")) as unknown);
  const corePlan = JSON.parse(coreBytes.toString("utf8")) as CorePlanShape;
  const manifest: StyleCandidatesManifest = {
    schema_version: 1,
    manifest_version: STYLE_MANIFEST_VERSION,
    purpose: "STYLE_STUDY_ONLY",
    core_asset_reuse: false,
    remote_generation_state: "HOLD_FOR_CLARIFICATION",
    model: "nano_banana_2",
    upstream_provider: "Google",
    use_unlim: false,
    provider_limit: {
      status: "UNCONFIRMED",
      schema_max_batch_size: null,
      note: "ACTUAL_BATCH_MAX_SCHEMA_ANNOTATION_NOT_OBSERVED",
    },
    submission_topology: "UNRESOLVED",
    reference_policy: "NO_EXTERNAL_REFERENCE",
    references: [],
    core_v1: {
      manifest_path: "assets/manifests/core-v1.plan.json",
      manifest_sha256: CORE_V1_SHA256,
      remote_budget_status: "STALE_FOR_REMOTE_EXECUTION",
    },
    budget_observation: {
      unit_cost_decimal: "1.50",
      candidate_count: 4,
      candidate_upper_bound_decimal: "6.00",
      balance_decimal: "945.9",
      observed_date: "2026-08-11",
      timezone: "Asia/Seoul",
      core_asset_count: 1494,
      core_cost_at_observed_unit_decimal: "2241.00",
    },
    preflight_gates: {
      MCP_SCHEMA: "PASS",
      MODEL_PROVIDER: "PASS",
      COST: "PASS_BUT_CHANGED",
      BALANCE: "PASS",
      AUTO_PUBLISH_PRIVATE: "PASS",
      ACCOUNT_TERMS: "OPEN",
      ACCOUNT_PRIVACY: "OPEN",
      PROVIDER_SUPPLEMENTAL_TERMS: "OPEN",
      MCP_PRIVACY_OPT_OUT: "OPEN",
      EXPIRY_EXACT_TIME: "OPEN",
      BATCH_LIMIT: "OPEN",
      USER_REAPPROVAL: "BLOCKED",
    },
    preflight_gate_evidence: {
      MCP_SCHEMA: { path: PREFLIGHT_EVIDENCE_PATH, sha256: PREFLIGHT_EVIDENCE_SHA256, observation_ids: ["mcp-schema"] },
      MODEL_PROVIDER: { path: PREFLIGHT_EVIDENCE_PATH, sha256: PREFLIGHT_EVIDENCE_SHA256, observation_ids: ["mcp-schema"] },
      COST: { path: PREFLIGHT_EVIDENCE_PATH, sha256: PREFLIGHT_EVIDENCE_SHA256, observation_ids: ["cost"] },
      BALANCE: { path: PREFLIGHT_EVIDENCE_PATH, sha256: PREFLIGHT_EVIDENCE_SHA256, observation_ids: ["balance"] },
      AUTO_PUBLISH_PRIVATE: { path: PREFLIGHT_EVIDENCE_PATH, sha256: PREFLIGHT_EVIDENCE_SHA256, observation_ids: ["private-default"] },
    },
    candidates: MEDIA_TREATMENTS.map((treatment, index) => buildCandidate(index, treatment)),
  };
  validateStyleCandidatesManifest(manifest, corePlan);
  return manifest;
}

export function preflightAllowsRemoteGeneration(gates: Record<PreflightGateName, PreflightGateStatus>): boolean {
  return GATE_NAMES.every((name) => gates[name] === "PASS" || (name === "COST" && gates[name] === "PASS_BUT_CHANGED"));
}

export function canGenerateRemotely(_manifest: StyleCandidatesManifest): boolean {
  // style-candidates-v1 is structurally HOLD-only. READY requires a new manifest revision and validator.
  return false;
}

export function validateStyleCandidatesManifest(manifest: StyleCandidatesManifest, corePlan?: CorePlanShape): void {
  if (!isRecord(manifest)) throw new Error("style manifest must be an object");
  assertExactKeys(manifest as unknown as Record<string, unknown>, [
    "schema_version", "manifest_version", "purpose", "core_asset_reuse", "remote_generation_state",
    "model", "upstream_provider", "use_unlim", "provider_limit", "submission_topology",
    "reference_policy", "references", "core_v1", "budget_observation", "preflight_gates", "preflight_gate_evidence", "candidates",
  ], "style manifest");
  if (manifest.schema_version !== 1 || manifest.manifest_version !== STYLE_MANIFEST_VERSION) throw new Error("invalid style manifest schema");
  if (manifest.purpose !== "STYLE_STUDY_ONLY" || manifest.core_asset_reuse !== false) throw new Error("style candidates must remain isolated studies");
  if (manifest.remote_generation_state !== "HOLD_FOR_CLARIFICATION") throw new Error("style-candidates-v1 is HOLD-only");
  if (manifest.model !== "nano_banana_2" || manifest.upstream_provider !== "Google" || manifest.use_unlim !== false) {
    throw new Error("unsafe style provider configuration");
  }
  if (!isRecord(manifest.provider_limit)) throw new Error("provider limit record is required");
  assertExactKeys(manifest.provider_limit as unknown as Record<string, unknown>, ["status", "schema_max_batch_size", "note"], "provider limit");
  if (manifest.provider_limit.status !== "UNCONFIRMED" || manifest.provider_limit.schema_max_batch_size !== null ||
      manifest.provider_limit.note !== "ACTUAL_BATCH_MAX_SCHEMA_ANNOTATION_NOT_OBSERVED" || manifest.submission_topology !== "UNRESOLVED") {
    throw new Error("HOLD requires unconfirmed batch limit and unresolved topology");
  }
  if (!isRecord(manifest.core_v1)) throw new Error("core-v1 isolation record is required");
  assertExactKeys(manifest.core_v1 as unknown as Record<string, unknown>, ["manifest_path", "manifest_sha256", "remote_budget_status"], "core-v1 isolation record");
  if (manifest.core_v1.manifest_path !== "assets/manifests/core-v1.plan.json" ||
      manifest.core_v1.manifest_sha256 !== CORE_V1_SHA256 ||
      manifest.core_v1.remote_budget_status !== "STALE_FOR_REMOTE_EXECUTION") {
    throw new Error("invalid core-v1 isolation record");
  }
  const budget = manifest.budget_observation;
  if (!isRecord(budget)) throw new Error("budget observation is required");
  assertExactKeys(budget as unknown as Record<string, unknown>, [
    "unit_cost_decimal", "candidate_count", "candidate_upper_bound_decimal", "balance_decimal",
    "observed_date", "timezone", "core_asset_count", "core_cost_at_observed_unit_decimal",
  ], "budget observation");
  if (budget.unit_cost_decimal !== "1.50" || budget.candidate_count !== STYLE_CANDIDATE_COUNT ||
      budget.candidate_upper_bound_decimal !== "6.00" || budget.balance_decimal !== "945.9" ||
      budget.observed_date !== "2026-08-11" || budget.timezone !== "Asia/Seoul" ||
      budget.core_asset_count !== 1494 || budget.core_cost_at_observed_unit_decimal !== "2241.00") {
    throw new Error("invalid observed budget record");
  }
  if (!Array.isArray(manifest.references)) throw new Error("references must be an array");
  if (manifest.references.length === 0) {
    if (manifest.reference_policy !== "NO_EXTERNAL_REFERENCE") throw new Error("empty references require NO_EXTERNAL_REFERENCE");
  } else {
    if (manifest.reference_policy !== "APPROVED_EXTERNAL_REFERENCES_ONLY") throw new Error("references require approved-only policy");
    for (const reference of manifest.references) {
      if (!isRecord(reference)) throw new Error("invalid reference record");
      assertExactKeys(reference as unknown as Record<string, unknown>, ["source", "sha256", "rights_status"], "reference");
      if (typeof reference.source !== "string" || reference.source.length === 0 || !isSha256(reference.sha256) || reference.rights_status !== "APPROVED") {
        throw new Error("reference source, SHA-256, and APPROVED rights are required");
      }
    }
  }
  if (!isRecord(manifest.preflight_gates)) throw new Error("preflight gates are required");
  const gateKeys = Object.keys(manifest.preflight_gates).sort();
  if (gateKeys.length !== GATE_NAMES.length || gateKeys.some((key, index) => key !== [...GATE_NAMES].sort()[index])) {
    throw new Error("invalid preflight gate set");
  }
  for (const value of Object.values(manifest.preflight_gates)) {
    if (!["PASS", "PASS_BUT_CHANGED", "OPEN", "BLOCKED"].includes(value)) throw new Error("invalid preflight gate status");
  }
  if (manifest.preflight_gates.COST !== "PASS_BUT_CHANGED") throw new Error("changed cost must remain explicit");
  if (!isRecord(manifest.preflight_gate_evidence)) throw new Error("preflight gate evidence bindings are required");
  for (const key of Object.keys(manifest.preflight_gate_evidence)) {
    if (!(GATE_NAMES as readonly string[]).includes(key)) throw new Error(`unknown preflight evidence gate: ${key}`);
  }
  for (const name of GATE_NAMES) {
    const status = manifest.preflight_gates[name];
    const binding = manifest.preflight_gate_evidence[name];
    const passed = status === "PASS" || status === "PASS_BUT_CHANGED";
    if (!passed) {
      if (binding !== undefined) throw new Error(`non-passing gate may not claim evidence: ${name}`);
      continue;
    }
    if (!isRecord(binding)) throw new Error(`passing gate is missing evidence: ${name}`);
    assertExactKeys(binding as unknown as Record<string, unknown>, ["path", "sha256", "observation_ids"], `gate evidence ${name}`);
    if (binding.path !== PREFLIGHT_EVIDENCE_PATH || binding.sha256 !== PREFLIGHT_EVIDENCE_SHA256 ||
        !Array.isArray(binding.observation_ids) || binding.observation_ids.length < 1 ||
        binding.observation_ids.some((id) => typeof id !== "string" || !/^[a-z][a-z0-9-]*$/.test(id))) {
      throw new Error(`invalid preflight evidence binding: ${name}`);
    }
    const currentObservations = CURRENT_PASS_OBSERVATIONS[name];
    if (!currentObservations || binding.observation_ids.length !== currentObservations.length ||
        binding.observation_ids.some((id, index) => id !== currentObservations[index])) {
      throw new Error(`HOLD gate is bound to the wrong observation: ${name}`);
    }
  }
  if (!Array.isArray(manifest.candidates) || manifest.candidates.length !== STYLE_CANDIDATE_COUNT) throw new Error("style manifest must contain exactly 4 candidates");
  const ids = new Set<string>();
  const paths = new Set<string>();
  const promptHashes = new Set<string>();
  const requestHashes = new Set<string>();
  const treatments = new Set<string>();
  manifest.candidates.forEach((candidate, index) => {
    if (!isRecord(candidate)) throw new Error("invalid style candidate");
    assertExactKeys(candidate as unknown as Record<string, unknown>, [
      "id", "path", "purpose", "core_asset_reuse", "prompt_inputs", "prompt", "prompt_sha256",
      "request", "canonical_request_sha256",
    ], "style candidate");
    const suffix = String(index + 1).padStart(2, "0");
    const expectedId = `style/master-candidate-${suffix}`;
    const expectedPath = `style/master-candidate-${suffix}.png`;
    if (candidate.id !== expectedId || candidate.path !== expectedPath) throw new Error("style candidate order, id, or path changed");
    if (ids.has(candidate.id) || paths.has(candidate.path)) throw new Error("duplicate style candidate id or path");
    ids.add(candidate.id);
    paths.add(candidate.path);
    if (candidate.purpose !== "STYLE_STUDY_ONLY" || candidate.core_asset_reuse !== false) throw new Error("candidate escaped style-only scope");
    const inputs = candidate.prompt_inputs;
    if (!isRecord(inputs)) throw new Error("candidate prompt inputs are required");
    assertExactKeys(inputs as unknown as Record<string, unknown>, [
      "subject", "composition", "specimen", "paper", "colors", "density", "representation", "media_treatment",
    ], "candidate prompt inputs");
    if (inputs.subject !== SUBJECT || inputs.composition !== "SPECIMEN" || inputs.specimen !== "UNLABELED_BRASS_OVOID" ||
        inputs.paper !== "CREAM" || inputs.colors.length !== 1 || inputs.colors[0] !== "MAGENTA" ||
        inputs.density !== "SPARSE" || inputs.representation !== "SOLID" || inputs.media_treatment !== MEDIA_TREATMENTS[index]) {
      throw new Error("candidate may vary only by the approved media treatment axis");
    }
    treatments.add(inputs.media_treatment);
    if (!candidate.prompt.endsWith(NEGATIVE_PROMPT) || /\b(?:FICTOR|픽토르)\b/i.test(candidate.prompt)) throw new Error("unsafe style prompt");
    if (candidate.prompt !== candidatePrompt(inputs.media_treatment) || candidate.prompt_sha256 !== sha256(candidate.prompt)) throw new Error("prompt hash mismatch");
    if (!isSha256(candidate.prompt_sha256)) throw new Error("invalid prompt SHA-256");
    promptHashes.add(candidate.prompt_sha256);
    const request = candidate.request;
    if (!isRecord(request)) throw new Error("canonical style request is required");
    assertExactKeys(request as unknown as Record<string, unknown>, ["model", "aspect_ratio", "resolution", "prompt", "use_unlim", "count"], "canonical style request");
    if (request.model !== "nano_banana_2" || request.aspect_ratio !== "3:4" || request.resolution !== "1k" ||
        request.prompt !== candidate.prompt || request.use_unlim !== false || request.count !== 1) {
      throw new Error("unsafe canonical style request");
    }
    if (candidate.canonical_request_sha256 !== canonicalRequestSha256(request) || !isSha256(candidate.canonical_request_sha256)) {
      throw new Error("canonical request hash mismatch");
    }
    requestHashes.add(candidate.canonical_request_sha256);
  });
  if (ids.size !== 4 || paths.size !== 4 || promptHashes.size !== 4 || requestHashes.size !== 4 || treatments.size !== 4) {
    throw new Error("style candidates and hashes must be unique");
  }
  if (corePlan) {
    if (!Array.isArray(corePlan.assets)) throw new Error("invalid core-v1 asset list");
    const coreIds = new Set(corePlan.assets.map(({ id }) => id).filter((id): id is string => typeof id === "string"));
    const corePaths = new Set(corePlan.assets.map(({ path }) => path).filter((path): path is string => typeof path === "string"));
    if (manifest.candidates.some(({ id, path }) => coreIds.has(id) || corePaths.has(path))) throw new Error("style candidate intersects core-v1");
  }
  if (canGenerateRemotely(manifest)) throw new Error("style-candidates-v1 unexpectedly permits remote generation");
}

export function renderStyleCandidatesManifest(manifest: StyleCandidatesManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function styleManifestSha256(manifest: StyleCandidatesManifest): string {
  return sha256(renderStyleCandidatesManifest(manifest));
}

export function renderStyleProviderLedger(ledger: StyleProviderLedger): string {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}

export function styleProviderLedgerSha256(ledger: StyleProviderLedger): string {
  return sha256(renderStyleProviderLedger(ledger));
}

function assertNoSensitiveEvidence(value: unknown): void {
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (isRecord(item)) {
      for (const [key, nested] of Object.entries(item)) {
        if (/(?:signed.?url|token|account|email|raw.?error|session)/i.test(key)) throw new Error("completion evidence contains a forbidden field");
        visit(nested);
      }
      return;
    }
    if (typeof item === "string" && (/(?:https?:\/\/|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/.test(item) || /(?:token|signature|account_id)=/i.test(item))) {
      throw new Error("completion evidence contains sensitive-looking data");
    }
  };
  visit(value);
}

function isObservedAt(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function assertSafeOpaqueId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value)) throw new Error(`${label} is invalid`);
}

export function validateStyleProviderLedger(ledger: unknown, manifest: StyleCandidatesManifest): asserts ledger is StyleProviderLedger {
  if (!isRecord(ledger)) throw new Error("redacted provider ledger must be an object");
  assertNoSensitiveEvidence(ledger);
  assertExactKeys(ledger, ["schema_version", "ledger_version", "manifest_sha256", "redacted", "invocations"], "redacted provider ledger");
  if (ledger.schema_version !== 1 || ledger.ledger_version !== STYLE_PROVIDER_LEDGER_VERSION || ledger.redacted !== true ||
      ledger.manifest_sha256 !== styleManifestSha256(manifest)) {
    throw new Error("provider ledger is not bound to the style manifest");
  }
  if (!Array.isArray(ledger.invocations) || ledger.invocations.length !== STYLE_CANDIDATE_COUNT) {
    throw new Error("provider ledger must contain exactly 4 invocations");
  }
  const invocationRecords = ledger.invocations;
  const invocationIds = new Set<string>();
  const resultIds = new Set<string>();
  invocationRecords.forEach((value, index) => {
    if (!isRecord(value)) throw new Error("invalid provider invocation");
    assertExactKeys(value, [
      "candidate_id", "invocation_id", "tool", "model", "use_unlim", "canonical_request_sha256",
      "provider_result_id", "submitted_at", "completed_at", "balance_before", "balance_after",
    ], "provider invocation");
    const candidate = manifest.candidates[index];
    if (value.candidate_id !== candidate.id || value.tool !== "generate_image" || value.model !== manifest.model ||
        value.use_unlim !== false || value.canonical_request_sha256 !== candidate.canonical_request_sha256) {
      throw new Error("provider invocation does not match the canonical candidate request");
    }
    assertSafeOpaqueId(value.invocation_id, "invocation id");
    assertSafeOpaqueId(value.provider_result_id, "provider result id");
    if (invocationIds.has(value.invocation_id) || resultIds.has(value.provider_result_id)) throw new Error("provider invocation/result ids must be 1:1");
    invocationIds.add(value.invocation_id);
    resultIds.add(value.provider_result_id);
    if (!isObservedAt(value.submitted_at) || !isObservedAt(value.completed_at) || Date.parse(value.completed_at) < Date.parse(value.submitted_at)) {
      throw new Error("provider invocation timestamps are invalid");
    }
    if (!isRecord(value.balance_before) || !isRecord(value.balance_after)) throw new Error("per-job balance checkpoints are required");
    for (const [label, checkpoint] of [["before", value.balance_before], ["after", value.balance_after]] as const) {
      assertExactKeys(checkpoint, ["decimal", "observed_at"], `${label} balance checkpoint`);
      if (!isDecimal(checkpoint.decimal) || !isObservedAt(checkpoint.observed_at)) throw new Error("invalid per-job balance checkpoint");
    }
    if (!decimalDifferenceEquals(value.balance_before.decimal as string, value.balance_after.decimal as string, "1.50")) {
      throw new Error("each provider invocation must account for exactly 1.50 credits");
    }
    if (Date.parse(value.balance_before.observed_at as string) > Date.parse(value.submitted_at as string) ||
        Date.parse(value.balance_after.observed_at as string) < Date.parse(value.completed_at as string)) {
      throw new Error("balance checkpoint timestamps do not surround the provider invocation");
    }
    if (index > 0) {
      const previous = invocationRecords[index - 1] as Record<string, unknown>;
      const previousAfter = previous.balance_after as Record<string, unknown>;
      if (previousAfter.decimal !== value.balance_before.decimal) throw new Error("per-job balance checkpoints must form one chain");
    }
  });
}

export function validateStyleCompletionEvidence(
  evidence: unknown,
  manifest: StyleCandidatesManifest,
  providerLedger: unknown,
): asserts evidence is StyleCompletionEvidence {
  validateStyleProviderLedger(providerLedger, manifest);
  if (!isRecord(evidence)) throw new Error("completion evidence must be an object");
  assertNoSensitiveEvidence(evidence);
  assertExactKeys(evidence, ["schema_version", "evidence_version", "complete", "manifest_sha256", "provider_ledger_sha256", "actual_call_mode", "balances", "candidate_records"], "completion evidence");
  if (evidence.schema_version !== 1 || evidence.evidence_version !== STYLE_COMPLETION_VERSION || evidence.complete !== true) {
    throw new Error("completion evidence is not complete");
  }
  if (evidence.manifest_sha256 !== styleManifestSha256(manifest)) throw new Error("completion evidence manifest SHA-256 mismatch");
  if (evidence.provider_ledger_sha256 !== styleProviderLedgerSha256(providerLedger)) throw new Error("completion evidence provider ledger SHA-256 mismatch");
  if (evidence.actual_call_mode !== "generate_image") throw new Error("batch call mode requires a future READY topology revision");
  if (!isRecord(evidence.balances)) throw new Error("completion balances are required");
  assertExactKeys(evidence.balances, ["before_decimal", "after_decimal"], "completion balances");
  if (!isDecimal(evidence.balances.before_decimal) || !isDecimal(evidence.balances.after_decimal)) throw new Error("completion balances must be decimal strings");
  if (!decimalDifferenceEquals(evidence.balances.before_decimal, evidence.balances.after_decimal, "6.00")) {
    throw new Error("completion balance difference must equal the observed 6.00 credit cost");
  }
  if (evidence.balances.before_decimal !== providerLedger.invocations[0].balance_before.decimal ||
      evidence.balances.after_decimal !== providerLedger.invocations[STYLE_CANDIDATE_COUNT - 1].balance_after.decimal) {
    throw new Error("completion balances do not match the provider ledger checkpoints");
  }
  if (!Array.isArray(evidence.candidate_records) || evidence.candidate_records.length !== STYLE_CANDIDATE_COUNT) {
    throw new Error("completion evidence must contain exactly 4 candidate records");
  }
  const records = evidence.candidate_records;
  const candidateIds = new Set<string>();
  const invocationIds = new Set<string>();
  const resultIds = new Set<string>();
  for (const [index, item] of records.entries()) {
    if (!isRecord(item)) throw new Error("invalid candidate completion record");
    assertExactKeys(item, ["candidate_id", "invocation_id", "provider_result_id", "canonical_request_sha256", "local_relative_path", "backup_relative_path", "local_sha256", "backup_sha256", "png_recovery"], "candidate completion record");
    if (typeof item.candidate_id !== "string") throw new Error("candidate id is required");
    const candidate = manifest.candidates.find(({ id }) => id === item.candidate_id);
    if (!candidate || candidateIds.has(item.candidate_id)) throw new Error("candidate records must map 1:1 to the manifest");
    candidateIds.add(item.candidate_id);
    assertSafeOpaqueId(item.invocation_id, "completion invocation id");
    assertSafeOpaqueId(item.provider_result_id, "completion provider result id");
    if (invocationIds.has(item.invocation_id) || resultIds.has(item.provider_result_id)) throw new Error("completion invocation/result ids must be 1:1");
    invocationIds.add(item.invocation_id);
    resultIds.add(item.provider_result_id);
    const invocation = providerLedger.invocations[index];
    if (invocation.candidate_id !== item.candidate_id || invocation.invocation_id !== item.invocation_id ||
        invocation.provider_result_id !== item.provider_result_id || invocation.canonical_request_sha256 !== item.canonical_request_sha256 ||
        item.canonical_request_sha256 !== candidate.canonical_request_sha256) {
      throw new Error("completion record is not bound 1:1 to the provider ledger and manifest");
    }
    assertSafeRelativePngPath(item.local_relative_path, candidate.path, "local path");
    assertSafeRelativePngPath(item.backup_relative_path, candidate.path, "backup path");
    if (!isSha256(item.local_sha256) || item.local_sha256 !== item.backup_sha256) throw new Error("local and backup SHA-256 must be equal");
    if (!isRecord(item.png_recovery)) throw new Error("PNG recovery evidence is required");
    assertExactKeys(item.png_recovery, ["format", "width", "height", "size_bytes", "local_verified", "backup_verified"], "PNG recovery evidence");
    const png = item.png_recovery;
    if (png.format !== "PNG" || png.local_verified !== true || png.backup_verified !== true ||
        !Number.isSafeInteger(png.width) || !Number.isSafeInteger(png.height) || !Number.isSafeInteger(png.size_bytes) ||
        (png.width as number) <= 0 || (png.height as number) <= 0 || (png.size_bytes as number) <= 0 ||
        (png.width as number) * 4 !== (png.height as number) * 3) {
      throw new Error("invalid recovered PNG metadata");
    }
  }
  if (candidateIds.size !== STYLE_CANDIDATE_COUNT || invocationIds.size !== STYLE_CANDIDATE_COUNT || resultIds.size !== STYLE_CANDIDATE_COUNT) {
    throw new Error("completion evidence is not 1:1");
  }
}

export function validateStyleCompletionFiles(
  evidence: unknown,
  manifest: StyleCandidatesManifest,
  providerLedger: unknown,
  localRoot: string,
  backupRoot: string,
): asserts evidence is StyleCompletionEvidence {
  validateStyleCompletionEvidence(evidence, manifest, providerLedger);
  assertNonOverlappingRoots(localRoot, backupRoot);
  for (const record of evidence.candidate_records) {
    const local = verifyExistingPng(localRoot, record.local_relative_path, "3:4", record.local_sha256);
    const backup = verifyExistingPng(backupRoot, record.backup_relative_path, "3:4", record.backup_sha256);
    const recovered = record.png_recovery;
    if (local.sha256 !== backup.sha256 || local.size !== backup.size || local.width !== backup.width || local.height !== backup.height) {
      throw new Error("local and backup PNG files differ");
    }
    if (local.sha256 !== record.local_sha256 || local.size !== recovered.size_bytes ||
        local.width !== recovered.width || local.height !== recovered.height) {
      throw new Error("recovered PNG metadata does not match the actual file");
    }
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function publicAssetUrl(path: string): string {
  return `/assets/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function renderStyleContactSheetHtml(
  manifest: StyleCandidatesManifest,
  evidence: unknown,
  providerLedger: unknown,
  repositoryRoot: string,
  backupRoot: string,
): string {
  validateStyleCandidatesManifest(manifest);
  if (!canGenerateRemotely(manifest)) throw new Error("contact sheet renderer requires a READY manifest");
  const localRoot = resolve(repositoryRoot, "public/assets");
  validateStyleCompletionFiles(evidence, manifest, providerLedger, localRoot, backupRoot);
  const cards = manifest.candidates.map((candidate) => {
    const record = evidence.candidate_records.find(({ candidate_id }) => candidate_id === candidate.id)!;
    return `      <figure>\n        <img src="${escapeHtml(publicAssetUrl(candidate.path))}" alt="${escapeHtml(candidate.id)}" width="768" height="1024">\n        <figcaption><strong>${escapeHtml(candidate.id)}</strong><span>${escapeHtml(candidate.prompt_inputs.media_treatment)}</span><code>${record.local_sha256}</code></figcaption>\n      </figure>`;
  }).join("\n");
  return `<!doctype html>\n<html lang="ko">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Style candidate contact sheet</title>\n  <style>\n    :root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; background: #ece4cf; color: #281f22; }\n    body { margin: 0; padding: 2rem; }\n    header { max-width: 72rem; margin: 0 auto 1.5rem; }\n    h1 { margin: 0 0 .4rem; font-size: 1.5rem; }\n    p { margin: 0; }\n    main { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; max-width: 72rem; margin: 0 auto; }\n    figure { margin: 0; padding: .75rem; border: 1px solid #7d6672; background: #f6efd9; }\n    img { display: block; width: 100%; height: auto; background: #d8cfb9; }\n    figcaption { display: grid; gap: .35rem; margin-top: .65rem; }\n    span, code { overflow-wrap: anywhere; font-size: .78rem; }\n    @media (max-width: 700px) { body { padding: 1rem; } main { grid-template-columns: 1fr; } }\n  </style>\n</head>\n<body>\n  <header>\n    <h1>마스터 스타일 후보 4종</h1>\n    <p>완료 evidence와 local/backup SHA-256 검증을 통과한 정적 연락표입니다.</p>\n  </header>\n  <main>\n${cards}\n  </main>\n</body>\n</html>\n`;
}
