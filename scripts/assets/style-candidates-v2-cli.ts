import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_MAX_PNG_BYTES,
  acquireRunnerLock,
  atomicWriteJson,
  atomicWriteVerifiedPng,
  assertNonOverlappingRoots,
  backupVerifiedFile,
  safeResolve,
  verifyExistingPng,
} from "./filesystem";
import { writeContactSheetNoClobber } from "./style-candidates-cli";
import {
  buildStyleCandidatesV2Manifest,
  isStyleV2GenerationReady,
  renderStyleCandidatesV2Manifest,
  styleV2ManifestSha256,
  type StyleCandidatesV2Manifest,
} from "./style-candidates-v2";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = "assets/manifests/style-candidates-v2.json";
const runRoot = "assets/runs/t011-style";
const journalPath = `${runRoot}/operations-v2.json`;
const completionPath = `${runRoot}/completion-v2.json`;
const lockPath = `${runRoot}/operations-v2.lock`;
const localRoot = "public/assets";
const backupRoot = "assets/backups/t011-style";
const actualRunEvidencePath = "assets/evidence/t011-style-actual-run-v2.json";
const contactSheetPath = "docs/asset-runs/contact-sheets/t011-style-candidates-v2.html";
const STYLE_V2_ASPECT_TOLERANCE_PPM = 5_000;
const STYLE_V2_EXPECTED_PROVIDER_REPORTED_MODEL = "nano_banana_flash";

const STYLE_V2_VISUAL_QA = [
  {
    candidate_id: "style/master-candidate-01",
    prohibited_elements_absent: ["text", "logo", "brand", "person"],
    border_observation: "NO_BORDER_OBSERVED",
    subject_observation: "NEUTRAL_SUBJECT_WITH_LIMB_COUNT_DIFFERENT_FROM_PROMPT",
    flags: ["LIMB_COUNT_DIFFERS_FROM_PROMPT"],
  },
  {
    candidate_id: "style/master-candidate-02",
    prohibited_elements_absent: ["text", "logo", "brand", "person"],
    border_observation: "FAINT_PLATE_EDGE_OBSERVED",
    subject_observation: "NEUTRAL_SUBJECT",
    flags: ["FAINT_PLATE_EDGE_DESPITE_NO_BORDER_PROMPT"],
  },
  {
    candidate_id: "style/master-candidate-03",
    prohibited_elements_absent: ["text", "logo", "brand", "person"],
    border_observation: "VISIBLE_PLATE_BORDER_OBSERVED",
    subject_observation: "NEUTRAL_SUBJECT",
    flags: ["VISIBLE_PLATE_BORDER_DESPITE_NO_BORDER_PROMPT"],
  },
  {
    candidate_id: "style/master-candidate-04",
    prohibited_elements_absent: ["text", "logo", "brand", "person"],
    border_observation: "STRONG_FRAMED_SHEET_MAT_SHADOW_ARTIFACT",
    subject_observation: "NEUTRAL_SUBJECT",
    flags: ["STRONG_FRAMED_SHEET_MAT_SHADOW_DESPITE_NO_BORDER_PROMPT"],
  },
] as const;

const STATES = [
  "PLANNED", "SUBMITTING", "SUBMITTED", "RESULT_ID_RECORDED", "LOCAL_VERIFIED", "BACKUP_VERIFIED",
  "BALANCE_AFTER_VERIFIED", "COMPLETE", "AMBIGUOUS_SUBMISSION", "AMBIGUOUS_BALANCE", "PRICE_CHANGED", "UNEXPECTED_JOB_CREATED", "MODEL_DRIFT",
] as const;
type OperationState = (typeof STATES)[number];

type StyleV2TerminalObservation =
  | {
    code: "UNEXPECTED_PREFLIGHT_JOB_CREATED";
    observed_at: string;
    cost_observed_at: string;
    balance_observed_at: string;
    actual_job_created: true;
    actual_unit_cost_decimal: string;
    actual_balance_before_decimal: string;
    credit_cap_decimal: "6.00";
    cumulative_authorized_cost_decimal: string;
  }
  | {
    code: "PRICE_CHANGED";
    observed_at: string;
    cost_observed_at: string;
    balance_observed_at: string;
    actual_job_created: false;
    actual_unit_cost_decimal: string;
    actual_balance_before_decimal: string;
    credit_cap_decimal: "6.00";
    cumulative_authorized_cost_decimal: string;
  }
  | {
    code: "AMBIGUOUS_BALANCE";
    observed_at: string;
    actual_balance_before_decimal: string;
    actual_balance_after_decimal: string;
    actual_delta_decimal: string;
    credit_cap_decimal: "6.00";
    cumulative_authorized_cost_decimal: string;
  }
  | {
    code: "AMBIGUOUS_SUBMISSION";
    observed_at: string;
    reason_code: "TIMEOUT" | "TRANSPORT_ERROR" | "MISSING_DEFINITE_RESULT";
    actual_outcome: "UNKNOWN";
    auto_retry: false;
    credit_cap_decimal: "6.00";
    cumulative_authorized_cost_decimal: string;
  }
  | {
    code: "MODEL_DRIFT";
    observed_at: string;
    requested_model: "nano_banana_2";
    expected_provider_reported_model: "nano_banana_flash";
    actual_provider_reported_model: string;
    credit_cap_decimal: "6.00";
    cumulative_authorized_cost_decimal: string;
  };

export interface StyleV2OperationRecord {
  candidate_id: string;
  state: OperationState;
  transitions: Array<{ state: OperationState; observed_at: string }>;
  preflight?: {
    tool: "generate_image";
    get_cost: true;
    job_created: false;
    unit_cost_decimal: "1.50";
    balance_before_decimal: string;
    cost_observed_at: string;
    balance_observed_at: string;
    observed_at: string;
    paid_request_sha256: string;
    preflight_request_sha256: string;
  };
  provider?: {
    invocation_id: string;
    provider_result_id: string;
    paid_request_sha256: string;
    tool: "generate_image";
    requested_model: "nano_banana_2";
    provider_reported_model: string;
    use_unlim: false;
    get_cost: false;
    submitted_at: string;
    completed_at: string;
  };
  recovery?: {
    local_relative_path: string;
    backup_relative_path: string;
    sha256: string;
    size_bytes: number;
    target_aspect_ratio: "3:4";
    actual_width: number;
    actual_height: number;
    aspect_error_ppm: number;
    provider_native_unmodified: true;
  };
  balance_after?: { decimal: string; observed_at: string };
  terminal_observation?: StyleV2TerminalObservation;
}

export interface StyleV2OperationsJournal {
  schema_version: 2;
  journal_version: "t011-style-operations-v2";
  redacted: true;
  manifest_sha256: string;
  run_state: "ACTIVE" | "FAIL_STOP" | "COMPLETE";
  credit_cap_decimal: "6.00";
  local_root: "public/assets";
  backup_root: "assets/backups/t011-style";
  records: StyleV2OperationRecord[];
}

export interface StyleV2CompletionEvidence {
  schema_version: 2;
  evidence_version: "t011-style-completion-v2";
  manifest_sha256: string;
  journal_sha256: string;
  expected_provider_reported_model: "nano_banana_flash";
  completed_at: string;
  candidate_records: Array<{
    candidate_id: string;
    preflight: NonNullable<StyleV2OperationRecord["preflight"]>;
    provider: NonNullable<StyleV2OperationRecord["provider"]>;
    balance_after: NonNullable<StyleV2OperationRecord["balance_after"]>;
    recovery: NonNullable<StyleV2OperationRecord["recovery"]>;
  }>;
}

function usage(): never {
  throw new Error("usage: assets:style:v2 <gen|check|init|preflight-request|prepare|result|ambiguous|ingest|balance-after|complete|contact-sheet|evidence-check> with command-specific options");
}

function option(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (!value || value.startsWith("--")) usage();
  return value;
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

function isDecimal(value: string): boolean {
  return /^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(value);
}

function decimalUnits(value: string): bigint {
  if (!isDecimal(value)) throw new Error("invalid decimal checkpoint");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
}

function signedDecimal(units: bigint): string {
  const sign = units < 0n ? "-" : "";
  const magnitude = units < 0n ? -units : units;
  const whole = magnitude / 1_000_000_000n;
  const fraction = (magnitude % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}

function cumulativeAuthorizedCost(index: number): string {
  return ["1.50", "3.00", "4.50", "6.00"][index] ?? "OUT_OF_SCOPE";
}

function isTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}

function requireTimestamp(value: string, fresh = false): string {
  if (!isTimestamp(value)) throw new Error("timestamp must be strict RFC3339 with timezone");
  if (fresh && Math.abs(Date.now() - Date.parse(value)) > 15 * 60 * 1000) throw new Error("balance/cost observation is not fresh");
  return value;
}

function safeOpaqueId(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function safeProviderReportedModel(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,63}$/.test(value)) throw new Error("provider reported model is invalid");
  return value;
}

function checkedManifest(): StyleCandidatesV2Manifest {
  const expected = buildStyleCandidatesV2Manifest(repositoryRoot);
  const expectedBytes = renderStyleCandidatesV2Manifest(expected);
  const target = safeResolve(repositoryRoot, manifestPath);
  if (!existsSync(target) || readFileSync(target, "utf8") !== expectedBytes || !isStyleV2GenerationReady(expected, repositoryRoot)) {
    throw new Error("style-candidates-v2 is missing, stale, or not READY; run npm run assets:style:v2:gen");
  }
  return expected;
}

export function buildInitialStyleV2OperationsJournal(manifest: StyleCandidatesV2Manifest): StyleV2OperationsJournal {
  return {
    schema_version: 2,
    journal_version: "t011-style-operations-v2",
    redacted: true,
    manifest_sha256: styleV2ManifestSha256(manifest),
    run_state: "ACTIVE",
    credit_cap_decimal: "6.00",
    local_root: localRoot,
    backup_root: backupRoot,
    records: manifest.candidates.map(({ id }) => ({ candidate_id: id, state: "PLANNED", transitions: [] })),
  };
}

export function validateStyleV2OperationsJournal(journal: StyleV2OperationsJournal, manifest: StyleCandidatesV2Manifest): void {
  if (!isRecord(journal)) throw new Error("v2 operations journal must be an object");
  exactKeys(journal as unknown as Record<string, unknown>, [
    "schema_version", "journal_version", "redacted", "manifest_sha256", "run_state", "credit_cap_decimal", "local_root", "backup_root", "records",
  ], "v2 operations journal");
  if (journal.schema_version !== 2 || journal.journal_version !== "t011-style-operations-v2" || journal.redacted !== true ||
      journal.manifest_sha256 !== styleV2ManifestSha256(manifest) || journal.credit_cap_decimal !== "6.00" ||
      journal.local_root !== localRoot || journal.backup_root !== backupRoot || journal.records.length !== 4) {
    throw new Error("invalid or stale v2 operations journal");
  }
  if (!["ACTIVE", "FAIL_STOP", "COMPLETE"].includes(journal.run_state)) throw new Error("invalid v2 journal run state");
  const invocationIds = new Set<string>();
  const resultIds = new Set<string>();
  journal.records.forEach((record, index) => {
    exactKeys(record as unknown as Record<string, unknown>, [
      "candidate_id", "state", "transitions", ...(record.preflight ? ["preflight"] : []), ...(record.provider ? ["provider"] : []),
      ...(record.recovery ? ["recovery"] : []), ...(record.balance_after ? ["balance_after"] : []),
      ...(record.terminal_observation ? ["terminal_observation"] : []),
    ], "v2 operation record");
    if (record.candidate_id !== manifest.candidates[index].id || !STATES.includes(record.state)) throw new Error("invalid v2 operation record");
    record.transitions.forEach((transition) => exactKeys(transition as unknown as Record<string, unknown>, ["state", "observed_at"], "v2 transition"));
    if (record.transitions.some((transition) => !STATES.includes(transition.state) || !isTimestamp(transition.observed_at))) {
      throw new Error("invalid v2 operation transition");
    }
    if (record.transitions.some((transition, transitionIndex) => transitionIndex > 0 &&
        Date.parse(transition.observed_at) < Date.parse(record.transitions[transitionIndex - 1].observed_at))) {
      throw new Error("v2 operation timestamps moved backwards");
    }
    const base = ["SUBMITTING", "SUBMITTED", "RESULT_ID_RECORDED", "LOCAL_VERIFIED", "BACKUP_VERIFIED", "BALANCE_AFTER_VERIFIED", "COMPLETE"];
    const states = record.transitions.map(({ state }) => state);
    const validSequence = record.state === "PLANNED" ? states.length === 0
      : record.state === "AMBIGUOUS_SUBMISSION" ? states.join("|") === "SUBMITTING|AMBIGUOUS_SUBMISSION"
      : record.state === "PRICE_CHANGED" ? states.join("|") === "PRICE_CHANGED"
      : record.state === "UNEXPECTED_JOB_CREATED" ? states.join("|") === "UNEXPECTED_JOB_CREATED"
      : record.state === "MODEL_DRIFT" ? states.join("|") === "SUBMITTING|SUBMITTED|RESULT_ID_RECORDED|MODEL_DRIFT"
      : record.state === "AMBIGUOUS_BALANCE" ? states.join("|") === [...base.slice(0, 5), "AMBIGUOUS_BALANCE"].join("|")
      : states.join("|") === base.slice(0, base.indexOf(record.state) + 1).join("|");
    if (!validSequence) throw new Error("invalid v2 operation state sequence");
    if (record.preflight) {
      exactKeys(record.preflight as unknown as Record<string, unknown>, [
        "tool", "get_cost", "job_created", "unit_cost_decimal", "balance_before_decimal", "cost_observed_at", "balance_observed_at",
        "observed_at", "paid_request_sha256", "preflight_request_sha256",
      ], "v2 preflight checkpoint");
      if (record.preflight.tool !== "generate_image" || record.preflight.get_cost !== true || record.preflight.job_created !== false ||
          record.preflight.unit_cost_decimal !== "1.50" ||
          record.preflight.paid_request_sha256 !== manifest.requests[index].paid_request_sha256 || !isDecimal(record.preflight.balance_before_decimal) ||
          record.preflight.preflight_request_sha256 !== manifest.requests[index].preflight_request_sha256 ||
          !isTimestamp(record.preflight.cost_observed_at) || !isTimestamp(record.preflight.balance_observed_at) ||
          record.preflight.observed_at !== (Date.parse(record.preflight.cost_observed_at) >= Date.parse(record.preflight.balance_observed_at)
            ? record.preflight.cost_observed_at : record.preflight.balance_observed_at) ||
          !isTimestamp(record.preflight.observed_at)) throw new Error("invalid fresh preflight checkpoint");
      if (record.state !== "PRICE_CHANGED" && record.transitions[0]?.observed_at !== record.preflight.observed_at) {
        throw new Error("preflight timestamp is not bound to submission preparation");
      }
    }
    if (record.provider) {
      exactKeys(record.provider as unknown as Record<string, unknown>, [
        "invocation_id", "provider_result_id", "paid_request_sha256", "tool", "requested_model", "provider_reported_model",
        "use_unlim", "get_cost", "submitted_at", "completed_at",
      ], "v2 provider record");
      if (record.provider.tool !== "generate_image" || record.provider.requested_model !== "nano_banana_2" ||
          safeProviderReportedModel(record.provider.provider_reported_model) !== record.provider.provider_reported_model || record.provider.use_unlim !== false ||
          (record.state !== "MODEL_DRIFT" && record.provider.provider_reported_model !== STYLE_V2_EXPECTED_PROVIDER_REPORTED_MODEL) ||
          record.provider.get_cost !== false || record.provider.paid_request_sha256 !== manifest.requests[index].paid_request_sha256 ||
          !isTimestamp(record.provider.submitted_at) || !isTimestamp(record.provider.completed_at) ||
          Date.parse(record.provider.completed_at) < Date.parse(record.provider.submitted_at)) throw new Error("invalid paid provider metadata");
      safeOpaqueId(record.provider.invocation_id, "invocation id");
      safeOpaqueId(record.provider.provider_result_id, "provider result id");
      const submitted = record.transitions.find(({ state }) => state === "SUBMITTED")?.observed_at;
      const resultRecorded = record.transitions.find(({ state }) => state === "RESULT_ID_RECORDED")?.observed_at;
      if (submitted !== record.provider.submitted_at || resultRecorded !== record.provider.completed_at ||
          (record.preflight && Date.parse(record.provider.submitted_at) < Date.parse(record.preflight.observed_at))) {
        throw new Error("provider timestamps are not bound to journal transitions");
      }
      if (invocationIds.has(record.provider.invocation_id) || resultIds.has(record.provider.provider_result_id)) throw new Error("duplicate provider identifiers");
      invocationIds.add(record.provider.invocation_id);
      resultIds.add(record.provider.provider_result_id);
    }
    const terminalPreflightState = record.state === "PRICE_CHANGED" || record.state === "UNEXPECTED_JOB_CREATED";
    if (terminalPreflightState) {
      const observation = record.terminal_observation;
      if (!observation) throw new Error("terminal preflight observation is missing");
      exactKeys(observation as unknown as Record<string, unknown>, [
        "code", "observed_at", "cost_observed_at", "balance_observed_at", "actual_job_created", "actual_unit_cost_decimal", "actual_balance_before_decimal",
        "credit_cap_decimal", "cumulative_authorized_cost_decimal",
      ], "terminal preflight observation");
      const expectedCode = record.state === "PRICE_CHANGED" ? "PRICE_CHANGED" : "UNEXPECTED_PREFLIGHT_JOB_CREATED";
      const expectedJobCreated = record.state === "UNEXPECTED_JOB_CREATED";
      if (observation.code !== expectedCode || observation.actual_job_created !== expectedJobCreated ||
          !isTimestamp(observation.cost_observed_at) || !isTimestamp(observation.balance_observed_at) ||
          observation.observed_at !== (Date.parse(observation.cost_observed_at) >= Date.parse(observation.balance_observed_at)
            ? observation.cost_observed_at : observation.balance_observed_at) || !isTimestamp(observation.observed_at) ||
          !isDecimal(observation.actual_unit_cost_decimal) ||
          !isDecimal(observation.actual_balance_before_decimal) || observation.credit_cap_decimal !== "6.00" ||
          observation.cumulative_authorized_cost_decimal !== cumulativeAuthorizedCost(index)) {
        throw new Error("invalid terminal preflight observation");
      }
    }
    if (record.state === "AMBIGUOUS_BALANCE") {
      const observation = record.terminal_observation;
      if (!observation || observation.code !== "AMBIGUOUS_BALANCE") throw new Error("terminal balance observation is missing");
      exactKeys(observation as unknown as Record<string, unknown>, [
        "code", "observed_at", "actual_balance_before_decimal", "actual_balance_after_decimal", "actual_delta_decimal",
        "credit_cap_decimal", "cumulative_authorized_cost_decimal",
      ], "terminal balance observation");
      if (!isTimestamp(observation.observed_at) || !isDecimal(observation.actual_balance_before_decimal) ||
          !isDecimal(observation.actual_balance_after_decimal) || observation.actual_delta_decimal !==
            signedDecimal(decimalUnits(observation.actual_balance_before_decimal) - decimalUnits(observation.actual_balance_after_decimal)) ||
          observation.credit_cap_decimal !== "6.00" || observation.cumulative_authorized_cost_decimal !== cumulativeAuthorizedCost(index)) {
        throw new Error("invalid terminal balance observation");
      }
    }
    if (record.state === "AMBIGUOUS_SUBMISSION") {
      const observation = record.terminal_observation;
      if (!observation || observation.code !== "AMBIGUOUS_SUBMISSION") throw new Error("terminal submission observation is missing");
      exactKeys(observation as unknown as Record<string, unknown>, [
        "code", "observed_at", "reason_code", "actual_outcome", "auto_retry", "credit_cap_decimal", "cumulative_authorized_cost_decimal",
      ], "terminal submission observation");
      if (!isTimestamp(observation.observed_at) || !["TIMEOUT", "TRANSPORT_ERROR", "MISSING_DEFINITE_RESULT"].includes(observation.reason_code) ||
          observation.actual_outcome !== "UNKNOWN" || observation.auto_retry !== false || observation.credit_cap_decimal !== "6.00" ||
          observation.cumulative_authorized_cost_decimal !== cumulativeAuthorizedCost(index)) {
        throw new Error("invalid terminal submission observation");
      }
    }
    if (record.state === "MODEL_DRIFT") {
      const observation = record.terminal_observation;
      if (!observation || observation.code !== "MODEL_DRIFT") throw new Error("terminal model drift observation is missing");
      exactKeys(observation as unknown as Record<string, unknown>, [
        "code", "observed_at", "requested_model", "expected_provider_reported_model", "actual_provider_reported_model",
        "credit_cap_decimal", "cumulative_authorized_cost_decimal",
      ], "terminal model drift observation");
      if (!isTimestamp(observation.observed_at) || observation.requested_model !== "nano_banana_2" ||
          observation.expected_provider_reported_model !== STYLE_V2_EXPECTED_PROVIDER_REPORTED_MODEL ||
          safeProviderReportedModel(observation.actual_provider_reported_model) !== observation.actual_provider_reported_model ||
          observation.actual_provider_reported_model === STYLE_V2_EXPECTED_PROVIDER_REPORTED_MODEL ||
          observation.credit_cap_decimal !== "6.00" || observation.cumulative_authorized_cost_decimal !== cumulativeAuthorizedCost(index)) {
        throw new Error("invalid terminal model drift observation");
      }
    }
    if (!["PRICE_CHANGED", "UNEXPECTED_JOB_CREATED", "AMBIGUOUS_BALANCE", "AMBIGUOUS_SUBMISSION", "MODEL_DRIFT"].includes(record.state) && record.terminal_observation) {
      throw new Error("non-terminal record contains a terminal observation");
    }
    const progressedPastSubmit = record.state !== "PLANNED" && !terminalPreflightState;
    if (progressedPastSubmit && !record.preflight) throw new Error("submitted record lacks preflight evidence");
    const providerStates: OperationState[] = ["SUBMITTED", "RESULT_ID_RECORDED", "MODEL_DRIFT", "LOCAL_VERIFIED", "BACKUP_VERIFIED", "AMBIGUOUS_BALANCE", "BALANCE_AFTER_VERIFIED", "COMPLETE"];
    if (providerStates.includes(record.state) && !record.provider) throw new Error("submitted record lacks provider evidence");
    const recoveryStates: OperationState[] = ["BACKUP_VERIFIED", "AMBIGUOUS_BALANCE", "BALANCE_AFTER_VERIFIED", "COMPLETE"];
    if (recoveryStates.includes(record.state)) {
      const candidate = manifest.candidates[index];
      if (record.recovery) exactKeys(record.recovery as unknown as Record<string, unknown>, [
        "local_relative_path", "backup_relative_path", "sha256", "size_bytes", "target_aspect_ratio", "actual_width", "actual_height",
        "aspect_error_ppm", "provider_native_unmodified",
      ], "v2 recovery record");
      if (!record.recovery || record.recovery.local_relative_path !== candidate.path || record.recovery.backup_relative_path !== candidate.path ||
          !/^[a-f0-9]{64}$/.test(record.recovery.sha256) || !Number.isSafeInteger(record.recovery.size_bytes) || record.recovery.size_bytes <= 0 ||
          record.recovery.target_aspect_ratio !== "3:4" || !Number.isSafeInteger(record.recovery.actual_width) ||
          !Number.isSafeInteger(record.recovery.actual_height) || record.recovery.actual_width <= 0 || record.recovery.actual_height <= 0 ||
          !Number.isSafeInteger(record.recovery.aspect_error_ppm) || record.recovery.aspect_error_ppm < 0 ||
          record.recovery.aspect_error_ppm > STYLE_V2_ASPECT_TOLERANCE_PPM ||
          record.recovery.aspect_error_ppm !== Math.ceil((Math.abs(record.recovery.actual_width * 4 - record.recovery.actual_height * 3) * 1_000_000) /
            (record.recovery.actual_height * 3)) || record.recovery.provider_native_unmodified !== true) {
        throw new Error("invalid recovery evidence");
      }
    }
    if (["BALANCE_AFTER_VERIFIED", "COMPLETE"].includes(record.state)) {
      if (record.balance_after) exactKeys(record.balance_after as unknown as Record<string, unknown>, ["decimal", "observed_at"], "v2 balance-after record");
      if (!record.balance_after || !isDecimal(record.balance_after.decimal) || !isTimestamp(record.balance_after.observed_at) ||
          !record.preflight || decimalUnits(record.preflight.balance_before_decimal) - decimalUnits(record.balance_after.decimal) !== decimalUnits("1.50")) {
        throw new Error("invalid balance-after evidence");
      }
      const backupAt = record.transitions.find(({ state }) => state === "BACKUP_VERIFIED")?.observed_at;
      const balanceAt = record.transitions.find(({ state }) => state === "BALANCE_AFTER_VERIFIED")?.observed_at;
      if (!backupAt || Date.parse(record.balance_after.observed_at) < Date.parse(backupAt) || balanceAt !== record.balance_after.observed_at) {
        throw new Error("balance-after timestamp is not bound after backup");
      }
    }
    if (index > 0 && record.preflight) {
      const previous = journal.records[index - 1];
      const previousBackupAt = [...previous.transitions].reverse().find(({ state }) => state === "BACKUP_VERIFIED")?.observed_at;
      if (previous.state !== "COMPLETE" || !previousBackupAt || Date.parse(record.preflight.observed_at) <= Date.parse(previousBackupAt) ||
          previous.balance_after?.decimal !== record.preflight.balance_before_decimal) {
        throw new Error("journal does not prove backup and fresh balance before the next submit");
      }
    }
  });
  if (journal.run_state === "ACTIVE" && journal.records.some(({ state }) => state === "AMBIGUOUS_SUBMISSION" || state === "AMBIGUOUS_BALANCE" || state === "PRICE_CHANGED" || state === "UNEXPECTED_JOB_CREATED" || state === "MODEL_DRIFT")) {
    throw new Error("terminal operation must set FAIL_STOP");
  }
  if (journal.run_state === "FAIL_STOP" && !journal.records.some(({ state }) => state === "AMBIGUOUS_SUBMISSION" || state === "AMBIGUOUS_BALANCE" || state === "PRICE_CHANGED" || state === "UNEXPECTED_JOB_CREATED" || state === "MODEL_DRIFT")) {
    throw new Error("FAIL_STOP has no terminal record");
  }
  if (journal.run_state === "COMPLETE" && journal.records.some(({ state }) => state !== "COMPLETE")) throw new Error("incomplete journal is marked complete");
}

function readJournal(manifest: StyleCandidatesV2Manifest, runtimeRoot = repositoryRoot): StyleV2OperationsJournal {
  const bytes = readFileSync(safeResolve(runtimeRoot, journalPath), "utf8");
  const value = JSON.parse(bytes) as StyleV2OperationsJournal;
  if (bytes !== `${JSON.stringify(value, null, 2)}\n`) throw new Error("v2 operations journal must use canonical JSON serialization");
  validateStyleV2OperationsJournal(value, manifest);
  return value;
}

function writeJournal(journal: StyleV2OperationsJournal, runtimeRoot = repositoryRoot): void {
  atomicWriteJson(runtimeRoot, journalPath, journal);
}

function transition(record: StyleV2OperationRecord, state: OperationState, observedAt: string): void {
  record.state = state;
  record.transitions.push({ state, observed_at: observedAt });
}

function withJournal<T>(manifest: StyleCandidatesV2Manifest, operation: (journal: StyleV2OperationsJournal) => T, runtimeRoot = repositoryRoot): T {
  const lock = acquireRunnerLock(runtimeRoot, lockPath);
  try {
    const journal = readJournal(manifest, runtimeRoot);
    if (journal.run_state !== "ACTIVE") throw new Error(`v2 run is fail-stopped: ${journal.run_state}`);
    return operation(journal);
  } finally {
    lock.release();
  }
}

function requireCandidate(journal: StyleV2OperationsJournal, manifest: StyleCandidatesV2Manifest, candidateId: string): { record: StyleV2OperationRecord; index: number } {
  const index = manifest.candidates.findIndex(({ id }) => id === candidateId);
  if (index < 0) throw new Error("candidate is outside style-candidates-v2");
  if (journal.records.slice(0, index).some(({ state }) => state !== "COMPLETE")) throw new Error("previous candidate must be COMPLETE first");
  if (journal.records.slice(index + 1).some(({ state }) => state !== "PLANNED")) throw new Error("candidate order changed");
  return { record: journal.records[index], index };
}

function writeTerminalAndThrow(
  journal: StyleV2OperationsJournal,
  record: StyleV2OperationRecord,
  state: "PRICE_CHANGED" | "UNEXPECTED_JOB_CREATED" | "AMBIGUOUS_BALANCE" | "MODEL_DRIFT",
  observation: StyleV2TerminalObservation,
  message: string,
  runtimeRoot = repositoryRoot,
): never {
  record.terminal_observation = observation;
  const observedAt = observation.observed_at;
  transition(record, state, observedAt);
  journal.run_state = "FAIL_STOP";
  writeJournal(journal, runtimeRoot);
  throw new Error(message);
}

export function buildStyleV2CompletionEvidence(
  journal: StyleV2OperationsJournal,
  manifest: StyleCandidatesV2Manifest,
): StyleV2CompletionEvidence {
  validateStyleV2OperationsJournal(journal, manifest);
  if (journal.run_state !== "COMPLETE" || journal.records.some(({ state }) => state !== "COMPLETE")) {
    throw new Error("all four candidates must be COMPLETE");
  }
  return {
    schema_version: 2,
    evidence_version: "t011-style-completion-v2",
    manifest_sha256: styleV2ManifestSha256(manifest),
    journal_sha256: sha256(`${JSON.stringify(journal, null, 2)}\n`),
    expected_provider_reported_model: STYLE_V2_EXPECTED_PROVIDER_REPORTED_MODEL,
    completed_at: journal.records[3].balance_after!.observed_at,
    candidate_records: journal.records.map((record) => ({
      candidate_id: record.candidate_id,
      preflight: record.preflight!,
      provider: record.provider!,
      balance_after: record.balance_after!,
      recovery: record.recovery!,
    })),
  };
}

export function validateStyleV2CompletionEvidence(
  value: unknown,
  journal: StyleV2OperationsJournal,
  manifest: StyleCandidatesV2Manifest,
): asserts value is StyleV2CompletionEvidence {
  const expected = buildStyleV2CompletionEvidence(journal, manifest);
  if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error("v2 completion evidence is not bound to the complete provider journal");
}

export function buildStyleV2ActualRunEvidence(
  manifest: StyleCandidatesV2Manifest,
  journal: StyleV2OperationsJournal,
  completion: unknown,
  root: string,
): Record<string, unknown> {
  validateStyleV2OperationsJournal(journal, manifest);
  validateStyleV2CompletionEvidence(completion, journal, manifest);
  const journalBytes = readFileSync(safeResolve(root, journalPath), "utf8");
  if (journalBytes !== `${JSON.stringify(journal, null, 2)}\n`) throw new Error("actual-run journal bytes are not canonical or do not match");
  const completionBytes = readFileSync(safeResolve(root, completionPath), "utf8");
  if (completionBytes !== `${JSON.stringify(completion, null, 2)}\n`) throw new Error("actual-run completion bytes are not canonical or do not match");
  const expectedContactSheet = renderStyleV2ContactSheetHtmlAtRoot(manifest, journal, completion, root);
  const contactSheetBytes = readFileSync(safeResolve(root, contactSheetPath), "utf8");
  if (contactSheetBytes !== expectedContactSheet) throw new Error("tracked contact sheet is stale or does not match verified files");
  return {
    schema_version: 2,
    evidence_version: "t011-style-actual-run-v2",
    secret_free: true,
    run_state: "COMPLETE",
    actual_call_mode: "generate_image_sequential_count_1",
    source_artifacts: {
      manifest: { path: manifestPath, sha256: styleV2ManifestSha256(manifest), tracked: true },
      provider_journal: { path: journalPath, sha256: sha256(journalBytes), redacted: true, tracked: false },
      completion: { path: completionPath, sha256: sha256(completionBytes), tracked: false },
      contact_sheet: { path: contactSheetPath, sha256: sha256(contactSheetBytes), tracked: true },
    },
    totals: {
      candidate_count: 4,
      balance_before_decimal: journal.records[0].preflight!.balance_before_decimal,
      balance_after_decimal: journal.records[3].balance_after!.decimal,
      credits_consumed_decimal: "6.00",
      completed_at: completion.completed_at,
      requested_model: "nano_banana_2",
      expected_provider_reported_model: STYLE_V2_EXPECTED_PROVIDER_REPORTED_MODEL,
    },
    candidates: journal.records.map((record, index) => {
      const qa = STYLE_V2_VISUAL_QA[index];
      if (qa.candidate_id !== record.candidate_id) throw new Error("actual-run visual QA mapping is not 1:1");
      return {
        candidate_id: record.candidate_id,
        job_id: record.provider!.provider_result_id,
        invocation_id: record.provider!.invocation_id,
        tool: record.provider!.tool,
        requested_model: record.provider!.requested_model,
        provider_reported_model: record.provider!.provider_reported_model,
        use_unlim: record.provider!.use_unlim,
        count: 1,
        paid_request_sha256: record.provider!.paid_request_sha256,
        submitted_at: record.provider!.submitted_at,
        completed_at: record.provider!.completed_at,
        cost_preflight: {
          get_cost: record.preflight!.get_cost,
          job_created: record.preflight!.job_created,
          unit_cost_decimal: record.preflight!.unit_cost_decimal,
          observed_at: record.preflight!.cost_observed_at,
        },
        balance_before: { decimal: record.preflight!.balance_before_decimal, observed_at: record.preflight!.balance_observed_at },
        balance_after: record.balance_after,
        recovery: record.recovery,
        visual_qa: qa,
      };
    }),
  };
}

export function validateStyleV2ActualRunEvidence(
  value: unknown,
  manifest: StyleCandidatesV2Manifest,
  journal: StyleV2OperationsJournal,
  completion: unknown,
  root: string,
): void {
  const expected = buildStyleV2ActualRunEvidence(manifest, journal, completion, root);
  if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error("tracked actual-run evidence is stale or not bound to verified artifacts");
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function contactSheetAssetUrl(path: string): string {
  if (!/^style\/[a-z0-9][a-z0-9_-]*\.png$/.test(path)) throw new Error("unsafe v2 contact sheet asset path");
  return `../../../public/assets/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function renderStyleV2ContactSheetHtmlAtRoot(
  manifest: StyleCandidatesV2Manifest,
  journal: StyleV2OperationsJournal,
  completion: unknown,
  root: string,
): string {
  if (!isStyleV2GenerationReady(manifest, repositoryRoot)) throw new Error("v2 contact sheet renderer requires the validated READY manifest");
  validateStyleV2OperationsJournal(journal, manifest);
  validateStyleV2CompletionEvidence(completion, journal, manifest);
  const canonicalLocalRoot = resolve(root, localRoot);
  const canonicalBackupRoot = resolve(root, backupRoot);
  assertNonOverlappingRoots(canonicalLocalRoot, canonicalBackupRoot);
  for (const [index, record] of journal.records.entries()) {
    const recovery = record.recovery!;
    const local = verifyExistingPng(canonicalLocalRoot, manifest.candidates[index].path, "3:4", recovery.sha256, DEFAULT_MAX_PNG_BYTES, STYLE_V2_ASPECT_TOLERANCE_PPM);
    const backup = verifyExistingPng(canonicalBackupRoot, manifest.candidates[index].path, "3:4", recovery.sha256, DEFAULT_MAX_PNG_BYTES, STYLE_V2_ASPECT_TOLERANCE_PPM);
    if (local.size !== backup.size || local.size !== recovery.size_bytes || local.width !== recovery.actual_width ||
        local.height !== recovery.actual_height || local.aspect_error_ppm !== recovery.aspect_error_ppm) {
      throw new Error("v2 contact sheet PNG evidence mismatch");
    }
  }
  const cards = manifest.candidates.map((candidate, index) => {
    const recovery = journal.records[index].recovery!;
    const qa = STYLE_V2_VISUAL_QA[index];
    if (qa.candidate_id !== candidate.id) throw new Error("visual QA mapping is not 1:1");
    return `      <figure>\n        <img src="${escapeHtml(contactSheetAssetUrl(candidate.path))}" alt="${escapeHtml(candidate.id)}" width="${recovery.actual_width}" height="${recovery.actual_height}">\n        <figcaption><strong>${escapeHtml(candidate.id)}</strong><span>${escapeHtml(candidate.prompt_inputs.media_treatment)}</span><span class="qa">QA: ${escapeHtml(qa.flags.join(", "))}</span><code>${recovery.sha256}</code></figcaption>\n      </figure>`;
  }).join("\n");
  return `<!doctype html>\n<html lang="ko">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>T011 style candidates v2</title>\n  <style>\n    :root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; background: #ece4cf; color: #281f22; }\n    body { margin: 0; padding: 2rem; }\n    header, main { max-width: 72rem; margin-inline: auto; }\n    header { margin-bottom: 1.5rem; }\n    h1, p { margin: 0 0 .5rem; }\n    main { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }\n    figure { margin: 0; padding: .75rem; border: 1px solid #7d6672; background: #f6efd9; }\n    img { display: block; width: 100%; height: auto; background: #d8cfb9; }\n    figcaption { display: grid; gap: .35rem; margin-top: .65rem; }\n    span, code { overflow-wrap: anywhere; font-size: .78rem; }\n    @media (max-width: 700px) { body { padding: 1rem; } main { grid-template-columns: 1fr; } }\n  </style>\n</head>\n<body>\n  <header>\n    <h1>마스터 스타일 후보 4종</h1>\n    <p>v2 완료 evidence, provider journal, local/backup PNG 검증을 통과한 연락표입니다.</p>\n  </header>\n  <main>\n${cards}\n  </main>\n</body>\n</html>\n`;
}

export function renderStyleV2ContactSheetHtml(
  manifest: StyleCandidatesV2Manifest,
  journal: StyleV2OperationsJournal,
  completion: unknown,
): string {
  return renderStyleV2ContactSheetHtmlAtRoot(manifest, journal, completion, repositoryRoot);
}

/** @internal Filesystem-isolated CLI seam; production runStyleV2Cli always passes repositoryRoot. */
export function runStyleV2ContactSheetAfterReadyGate(
  args: readonly string[],
  manifest: StyleCandidatesV2Manifest,
  journal: StyleV2OperationsJournal,
  completion: unknown,
  root: string,
): Record<string, unknown> {
  if (args.length !== 3 || args[0] !== "contact-sheet" || args[1] !== "--output") usage();
  const output = option(args, "--output");
  const html = renderStyleV2ContactSheetHtmlAtRoot(manifest, journal, completion, root);
  return { command: "contact-sheet", candidates: 4, output_path: writeContactSheetNoClobber(root, output, html) };
}

function runStyleV2CliAtRuntimeRoot(args: readonly string[], runtimeRoot: string): Record<string, unknown> {
  const command = args[0];
  if (!command || !["gen", "check", "init", "preflight-request", "prepare", "result", "ambiguous", "ingest", "balance-after", "complete", "contact-sheet", "evidence-check"].includes(command)) usage();
  if (command === "gen") {
    if (args.length !== 1) usage();
    const manifest = buildStyleCandidatesV2Manifest(repositoryRoot);
    atomicWriteJson(repositoryRoot, manifestPath, manifest);
    return { command, manifest_sha256: styleV2ManifestSha256(manifest), candidates: 4, credit_cap_decimal: "6.00" };
  }
  const manifest = checkedManifest();
  if (command === "check") {
    if (args.length !== 1) usage();
    return { command, ready: true, manifest_sha256: styleV2ManifestSha256(manifest) };
  }
  if (command === "init") {
    if (args.length !== 1) usage();
      const lock = acquireRunnerLock(runtimeRoot, lockPath);
    try {
      if (existsSync(safeResolve(runtimeRoot, journalPath))) {
        const existing = readJournal(manifest, runtimeRoot);
        return { command, state: existing.run_state, journal_path: journalPath };
      }
      writeJournal(buildInitialStyleV2OperationsJournal(manifest), runtimeRoot);
      return { command, state: "ACTIVE", journal_path: journalPath };
    } finally {
      lock.release();
    }
  }
  if (command === "preflight-request") {
    const candidateId = option(args, "--candidate-id");
    return withJournal(manifest, (journal) => {
      const { record, index } = requireCandidate(journal, manifest, candidateId);
      if (record.state !== "PLANNED") throw new Error("preflight request is available only for the next PLANNED candidate");
      return {
        command,
        candidate_id: candidateId,
        preflight_request: manifest.requests[index].preflight_request,
        preflight_request_sha256: manifest.requests[index].preflight_request_sha256,
      };
    }, runtimeRoot);
  }
  if (command === "prepare") {
    const candidateId = option(args, "--candidate-id");
    const unitCost = option(args, "--unit-cost");
    const jobCreated = option(args, "--job-created");
    const balanceBefore = option(args, "--balance-before");
    const costObservedAt = requireTimestamp(option(args, "--cost-observed-at"), true);
    const balanceObservedAt = requireTimestamp(option(args, "--balance-observed-at"), true);
    const observedAt = Date.parse(costObservedAt) >= Date.parse(balanceObservedAt) ? costObservedAt : balanceObservedAt;
    return withJournal(manifest, (journal) => {
      const { record, index } = requireCandidate(journal, manifest, candidateId);
      if (record.state !== "PLANNED") throw new Error("candidate is not PLANNED; never auto-retry a submission");
      if (jobCreated !== "false" && jobCreated !== "true") throw new Error("job-created must be true or false");
      decimalUnits(unitCost);
      decimalUnits(balanceBefore);
      const capEvidence = { credit_cap_decimal: "6.00" as const, cumulative_authorized_cost_decimal: cumulativeAuthorizedCost(index) };
      if (jobCreated === "true") writeTerminalAndThrow(journal, record, "UNEXPECTED_JOB_CREATED", {
        code: "UNEXPECTED_PREFLIGHT_JOB_CREATED", observed_at: observedAt, cost_observed_at: costObservedAt,
        balance_observed_at: balanceObservedAt, actual_job_created: true,
        actual_unit_cost_decimal: unitCost, actual_balance_before_decimal: balanceBefore, ...capEvidence,
      }, "get_cost unexpectedly created a job; fail-stop without retry", runtimeRoot);
      if (unitCost !== "1.50") writeTerminalAndThrow(journal, record, "PRICE_CHANGED", {
        code: "PRICE_CHANGED", observed_at: observedAt, cost_observed_at: costObservedAt,
        balance_observed_at: balanceObservedAt, actual_job_created: false,
        actual_unit_cost_decimal: unitCost, actual_balance_before_decimal: balanceBefore, ...capEvidence,
      }, "unit price changed; fail-stop and request reapproval", runtimeRoot);
      if (decimalUnits(balanceBefore) < decimalUnits("1.50")) throw new Error("insufficient balance for the next capped request");
      if ((BigInt(index + 1) * decimalUnits("1.50")) > decimalUnits("6.00")) throw new Error("cumulative credit cap exceeded");
      if (index > 0) {
        const previous = journal.records[index - 1];
        const backupAt = [...previous.transitions].reverse().find(({ state }) => state === "BACKUP_VERIFIED")?.observed_at;
        if (!backupAt || Date.parse(observedAt) <= Date.parse(backupAt)) throw new Error("next submit must occur after previous backup verification");
        if (previous.balance_after?.decimal !== balanceBefore) throw new Error("fresh balance does not continue the previous checkpoint");
        if (!previous.recovery) throw new Error("previous recovery evidence is missing");
        const previousLocal = verifyExistingPng(resolve(runtimeRoot, localRoot), previous.recovery.local_relative_path, "3:4", previous.recovery.sha256, DEFAULT_MAX_PNG_BYTES, STYLE_V2_ASPECT_TOLERANCE_PPM);
        const previousBackup = verifyExistingPng(resolve(runtimeRoot, backupRoot), previous.recovery.backup_relative_path, "3:4", previous.recovery.sha256, DEFAULT_MAX_PNG_BYTES, STYLE_V2_ASPECT_TOLERANCE_PPM);
        if (previousLocal.size !== previousBackup.size || previousLocal.size !== previous.recovery.size_bytes ||
            previousLocal.width !== previous.recovery.actual_width || previousLocal.height !== previous.recovery.actual_height ||
            previousLocal.aspect_error_ppm !== previous.recovery.aspect_error_ppm) {
          throw new Error("previous local/backup files changed before the next submit");
        }
      }
      record.preflight = {
        tool: "generate_image", get_cost: true, job_created: false, unit_cost_decimal: "1.50", balance_before_decimal: balanceBefore,
        cost_observed_at: costObservedAt, balance_observed_at: balanceObservedAt, observed_at: observedAt,
        paid_request_sha256: manifest.requests[index].paid_request_sha256,
        preflight_request_sha256: manifest.requests[index].preflight_request_sha256,
      };
      transition(record, "SUBMITTING", observedAt);
      writeJournal(journal, runtimeRoot);
      return { command, candidate_id: candidateId, state: record.state, paid_request: manifest.requests[index].paid_request };
    }, runtimeRoot);
  }
  if (command === "result") {
    const candidateId = option(args, "--candidate-id");
    const invocationId = safeOpaqueId(option(args, "--invocation-id"), "invocation id");
    const providerResultId = safeOpaqueId(option(args, "--provider-result-id"), "provider result id");
    const providerReportedModel = safeProviderReportedModel(option(args, "--provider-reported-model"));
    const submittedAt = requireTimestamp(option(args, "--submitted-at"));
    const completedAt = requireTimestamp(option(args, "--completed-at"));
    return withJournal(manifest, (journal) => {
      const { record, index } = requireCandidate(journal, manifest, candidateId);
      if (record.state !== "SUBMITTING" || !record.preflight) throw new Error("candidate was not prepared for submission");
      if (Date.parse(submittedAt) < Date.parse(record.preflight.observed_at) || Date.parse(completedAt) < Date.parse(submittedAt)) throw new Error("provider timestamps are out of order");
      if (journal.records.some((other) => other !== record &&
          (other.provider?.invocation_id === invocationId || other.provider?.provider_result_id === providerResultId))) {
        throw new Error("provider identifiers must be unique across all four calls");
      }
      transition(record, "SUBMITTED", submittedAt);
      record.provider = {
        invocation_id: invocationId, provider_result_id: providerResultId, tool: "generate_image",
        requested_model: "nano_banana_2", provider_reported_model: providerReportedModel,
        use_unlim: false, get_cost: false, paid_request_sha256: record.preflight.paid_request_sha256,
        submitted_at: submittedAt, completed_at: completedAt,
      };
      transition(record, "RESULT_ID_RECORDED", completedAt);
      if (providerReportedModel !== STYLE_V2_EXPECTED_PROVIDER_REPORTED_MODEL) {
        writeTerminalAndThrow(journal, record, "MODEL_DRIFT", {
          code: "MODEL_DRIFT", observed_at: completedAt, requested_model: "nano_banana_2",
          expected_provider_reported_model: STYLE_V2_EXPECTED_PROVIDER_REPORTED_MODEL,
          actual_provider_reported_model: providerReportedModel, credit_cap_decimal: "6.00",
          cumulative_authorized_cost_decimal: cumulativeAuthorizedCost(index),
        }, "provider reported model drifted; fail-stop without retry", runtimeRoot);
      }
      writeJournal(journal, runtimeRoot);
      return { command, candidate_id: candidateId, state: record.state };
    }, runtimeRoot);
  }
  if (command === "ambiguous") {
    const candidateId = option(args, "--candidate-id");
    const observedAt = requireTimestamp(option(args, "--observed-at"));
    const reasonCode = option(args, "--reason-code");
    if (!["TIMEOUT", "TRANSPORT_ERROR", "MISSING_DEFINITE_RESULT"].includes(reasonCode)) throw new Error("invalid ambiguous submission reason code");
    return withJournal(manifest, (journal) => {
      const { record, index } = requireCandidate(journal, manifest, candidateId);
      if (record.state !== "SUBMITTING") throw new Error("only an in-flight submission can become ambiguous");
      if (!record.preflight || Date.parse(observedAt) < Date.parse(record.preflight.observed_at)) throw new Error("ambiguous timestamp precedes submission preparation");
      record.terminal_observation = {
        code: "AMBIGUOUS_SUBMISSION", observed_at: observedAt,
        reason_code: reasonCode as "TIMEOUT" | "TRANSPORT_ERROR" | "MISSING_DEFINITE_RESULT",
        actual_outcome: "UNKNOWN", auto_retry: false, credit_cap_decimal: "6.00",
        cumulative_authorized_cost_decimal: cumulativeAuthorizedCost(index),
      };
      transition(record, "AMBIGUOUS_SUBMISSION", observedAt);
      journal.run_state = "FAIL_STOP";
      writeJournal(journal, runtimeRoot);
      return { command, candidate_id: candidateId, state: record.state, auto_retry: false };
    }, runtimeRoot);
  }
  if (command === "ingest") {
    const candidateId = option(args, "--candidate-id");
    const inputPng = option(args, "--input-png");
    return withJournal(manifest, (journal) => {
      const { record, index } = requireCandidate(journal, manifest, candidateId);
      if (record.state !== "RESULT_ID_RECORDED" || !record.provider) throw new Error("provider result id must be recorded before ingest");
      const inputPath = isAbsolute(inputPng) ? resolve(inputPng) : safeResolve(runtimeRoot, inputPng);
      if (lstatSync(inputPath).isSymbolicLink() || !lstatSync(inputPath).isFile()) throw new Error("input PNG must be a regular file");
      const candidate = manifest.candidates[index];
      const local = atomicWriteVerifiedPng(resolve(runtimeRoot, localRoot), candidate.path, readFileSync(inputPath), "3:4", DEFAULT_MAX_PNG_BYTES, STYLE_V2_ASPECT_TOLERANCE_PPM);
      transition(record, "LOCAL_VERIFIED", new Date().toISOString());
      const backup = backupVerifiedFile(resolve(runtimeRoot, localRoot), resolve(runtimeRoot, backupRoot), candidate.path, local.sha256, "3:4", DEFAULT_MAX_PNG_BYTES, STYLE_V2_ASPECT_TOLERANCE_PPM);
      transition(record, "BACKUP_VERIFIED", new Date().toISOString());
      record.recovery = {
        local_relative_path: candidate.path, backup_relative_path: candidate.path, sha256: local.sha256,
        size_bytes: local.size, target_aspect_ratio: "3:4", actual_width: local.width, actual_height: local.height,
        aspect_error_ppm: local.aspect_error_ppm, provider_native_unmodified: true,
      };
      if (backup.sha256 !== local.sha256 || backup.size !== local.size || backup.width !== local.width || backup.height !== local.height ||
          backup.aspect_error_ppm !== local.aspect_error_ppm) throw new Error("backup verification mismatch");
      writeJournal(journal, runtimeRoot);
      return { command, candidate_id: candidateId, state: record.state, sha256: local.sha256, local_path: candidate.path, backup_path: candidate.path };
    }, runtimeRoot);
  }
  if (command === "balance-after") {
    const candidateId = option(args, "--candidate-id");
    const balanceAfter = option(args, "--balance-after");
    const observedAt = requireTimestamp(option(args, "--observed-at"), true);
    return withJournal(manifest, (journal) => {
      const { record, index } = requireCandidate(journal, manifest, candidateId);
      if (record.state !== "BACKUP_VERIFIED" || !record.preflight || !record.recovery) throw new Error("backup must be verified before balance-after");
      const backupAt = [...record.transitions].reverse().find(({ state }) => state === "BACKUP_VERIFIED")?.observed_at;
      if (!backupAt || Date.parse(observedAt) < Date.parse(backupAt)) throw new Error("balance-after timestamp precedes backup verification");
      const actualDelta = decimalUnits(record.preflight.balance_before_decimal) - decimalUnits(balanceAfter);
      if (actualDelta !== decimalUnits("1.50")) {
        writeTerminalAndThrow(journal, record, "AMBIGUOUS_BALANCE", {
          code: "AMBIGUOUS_BALANCE", observed_at: observedAt,
          actual_balance_before_decimal: record.preflight.balance_before_decimal,
          actual_balance_after_decimal: balanceAfter,
          actual_delta_decimal: signedDecimal(actualDelta), credit_cap_decimal: "6.00",
          cumulative_authorized_cost_decimal: cumulativeAuthorizedCost(index),
        }, "balance delta is not exactly 1.50; fail-stop", runtimeRoot);
      }
      record.balance_after = { decimal: balanceAfter, observed_at: observedAt };
      transition(record, "BALANCE_AFTER_VERIFIED", observedAt);
      transition(record, "COMPLETE", observedAt);
      if (journal.records.every(({ state }) => state === "COMPLETE")) journal.run_state = "COMPLETE";
      writeJournal(journal, runtimeRoot);
      return { command, candidate_id: candidateId, state: record.state, run_state: journal.run_state };
    }, runtimeRoot);
  }
  if (command === "complete") {
    if (args.length !== 1) usage();
    const lock = acquireRunnerLock(runtimeRoot, lockPath);
    try {
      const journal = readJournal(manifest, runtimeRoot);
      if (journal.run_state !== "COMPLETE" || journal.records.some(({ state }) => state !== "COMPLETE")) throw new Error("all four candidates must be COMPLETE");
      assertNonOverlappingRoots(resolve(runtimeRoot, localRoot), resolve(runtimeRoot, backupRoot));
      for (const record of journal.records) {
        if (!record.recovery) throw new Error("missing recovery record");
        const local = verifyExistingPng(resolve(runtimeRoot, localRoot), record.recovery.local_relative_path, "3:4", record.recovery.sha256, DEFAULT_MAX_PNG_BYTES, STYLE_V2_ASPECT_TOLERANCE_PPM);
        const backup = verifyExistingPng(resolve(runtimeRoot, backupRoot), record.recovery.backup_relative_path, "3:4", record.recovery.sha256, DEFAULT_MAX_PNG_BYTES, STYLE_V2_ASPECT_TOLERANCE_PPM);
        if (local.size !== backup.size || local.size !== record.recovery.size_bytes || local.width !== record.recovery.actual_width ||
            local.height !== record.recovery.actual_height || local.aspect_error_ppm !== record.recovery.aspect_error_ppm) {
          throw new Error("completion PNG evidence mismatch");
        }
      }
      const completion = buildStyleV2CompletionEvidence(journal, manifest);
      const completionTarget = safeResolve(runtimeRoot, completionPath, true);
      const completionBytes = `${JSON.stringify(completion, null, 2)}\n`;
      if (existsSync(completionTarget)) {
        if (lstatSync(completionTarget).isSymbolicLink()) throw new Error("completion evidence path is a symlink");
        if (readFileSync(completionTarget, "utf8") !== completionBytes) throw new Error("completion evidence already exists with different bytes");
      } else {
        atomicWriteJson(runtimeRoot, completionPath, completion);
      }
      return { command, evidence_path: completionPath, manifest_sha256: completion.manifest_sha256, journal_sha256: completion.journal_sha256 };
    } finally {
      lock.release();
    }
  }
  if (command === "contact-sheet") {
    const lock = acquireRunnerLock(runtimeRoot, lockPath);
    try {
      const journal = readJournal(manifest, runtimeRoot);
      const completionBytes = readFileSync(safeResolve(runtimeRoot, completionPath), "utf8");
      const completion = JSON.parse(completionBytes) as unknown;
      if (completionBytes !== `${JSON.stringify(completion, null, 2)}\n`) throw new Error("v2 completion evidence must use canonical JSON serialization");
      return runStyleV2ContactSheetAfterReadyGate(args, manifest, journal, completion, runtimeRoot);
    } finally {
      lock.release();
    }
  }
  if (command === "evidence-check") {
    if (args.length !== 1) usage();
    const lock = acquireRunnerLock(runtimeRoot, lockPath);
    try {
      const journal = readJournal(manifest, runtimeRoot);
      const completionBytes = readFileSync(safeResolve(runtimeRoot, completionPath), "utf8");
      const completion = JSON.parse(completionBytes) as unknown;
      if (completionBytes !== `${JSON.stringify(completion, null, 2)}\n`) throw new Error("v2 completion evidence must use canonical JSON serialization");
      const evidenceBytes = readFileSync(safeResolve(runtimeRoot, actualRunEvidencePath), "utf8");
      const evidence = JSON.parse(evidenceBytes) as unknown;
      if (evidenceBytes !== `${JSON.stringify(evidence, null, 2)}\n`) throw new Error("tracked actual-run evidence must use canonical JSON serialization");
      validateStyleV2ActualRunEvidence(evidence, manifest, journal, completion, runtimeRoot);
      return { command, evidence_path: actualRunEvidencePath, evidence_sha256: sha256(evidenceBytes), candidates: 4 };
    } finally {
      lock.release();
    }
  }
  usage();
}

export function runStyleV2Cli(args: readonly string[]): Record<string, unknown> {
  return runStyleV2CliAtRuntimeRoot(args, repositoryRoot);
}

/** @internal Filesystem-isolated end-to-end test seam; the production CLI cannot select another runtime root. */
export function runStyleV2CliForTest(args: readonly string[], runtimeRoot: string): Record<string, unknown> {
  const root = resolve(runtimeRoot);
  if (root === repositoryRoot) throw new Error("test runtime root must be isolated from the repository");
  return runStyleV2CliAtRuntimeRoot(args, root);
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    console.log(JSON.stringify(runStyleV2Cli(process.argv.slice(2))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "style v2 command failed");
    process.exitCode = 1;
  }
}
