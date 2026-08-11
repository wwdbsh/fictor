import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { DEFAULT_MAX_PNG_BYTES, verifyExistingPng } from "./filesystem";

export const MASTER_STYLE_MANIFEST_PATH = "assets/manifests/master-style-v1.json" as const;
export const T012_CONTRACT_SHA256 = "33a89a7632127a88b4176f71ab05fc72447d1a779e04024a650f67ffb1869d5c" as const;
export const T011_STYLE_MANIFEST_SHA256 = "67b84dcab57f5197112fb81c3134afc329f55f0b4580030e6a05c044cfce27bf" as const;
export const T011_ACTUAL_EVIDENCE_SHA256 = "1b633074376cdb8d93dfa738a7a0c5c85d05c74b9b184c29fc94331018859058" as const;
export const T011_CONTACT_SHEET_SHA256 = "5bfb09cbd4684d7833299d19f276fc04bf01322433f798fa78385322d920ee29" as const;
export const CORE_V1_PLAN_SHA256 = "54e3af3f68d53b17ba360e92050c361f87cb5bbc676899a0c671a95117fd3c0f" as const;
export const MASTER_STYLE_IMAGE_SHA256 = "3cadedb377db1e299bf2ac355404df3c8c092a3d229665c5e519243bbb5efde3" as const;

const SOURCE_STYLE_MANIFEST_PATH = "assets/manifests/style-candidates-v2.json";
const ACTUAL_EVIDENCE_PATH = "assets/evidence/t011-style-actual-run-v2.json";
const CONTACT_SHEET_PATH = "docs/asset-runs/contact-sheets/t011-style-candidates-v2.html";
const CORE_PLAN_PATH = "assets/manifests/core-v1.plan.json";
const SELECTED_CANDIDATE_ID = "style/master-candidate-01";
const SELECTED_CANDIDATE_PATH = "style/master-candidate-01.png";
const PUBLIC_IMAGE_PATH = `public/assets/${SELECTED_CANDIDATE_PATH}`;

export interface MasterStyleManifest {
  schema_version: 1;
  manifest_version: "master-style-v1";
  decision: {
    decision_id: "T012_MASTER_STYLE_APPROVAL";
    revision: 1;
    contract_sha256: typeof T012_CONTRACT_SHA256;
    state: "APPROVED_LOCAL_MEDIA_STYLE_LOCK";
    selected_candidate_count: 1;
    user_evidence: {
      exact_text_ko: "후보 1 채택";
      approved_at: "2026-08-11T12:05:07.373Z";
      local_date: "2026-08-11";
      local_timezone: "Asia/Seoul";
      source: "current user conversation";
    };
  };
  sources: {
    t011_style_manifest: { path: typeof SOURCE_STYLE_MANIFEST_PATH; sha256: typeof T011_STYLE_MANIFEST_SHA256 };
    t011_actual_run_evidence: { path: typeof ACTUAL_EVIDENCE_PATH; sha256: typeof T011_ACTUAL_EVIDENCE_SHA256 };
    t011_contact_sheet: { path: typeof CONTACT_SHEET_PATH; sha256: typeof T011_CONTACT_SHEET_SHA256 };
    immutable_core_plan: { path: typeof CORE_PLAN_PATH; sha256: typeof CORE_V1_PLAN_SHA256 };
  };
  selected_candidate: {
    id: typeof SELECTED_CANDIDATE_ID;
    candidate_path: typeof SELECTED_CANDIDATE_PATH;
    public_image_path: typeof PUBLIC_IMAGE_PATH;
    image_sha256: typeof MASTER_STYLE_IMAGE_SHA256;
    size_bytes: 1618931;
    target_aspect_ratio: "3:4";
    actual_width: 896;
    actual_height: 1200;
    aspect_error_ppm: 4445;
    provider_native_unmodified: true;
    requested_model: "nano_banana_2";
    provider_reported_model: "nano_banana_flash";
    job_id: "e0f36c95-2e1b-4e38-9931-7e10e562f209";
  };
  candidate_selection: readonly [
    { id: "style/master-candidate-01"; status: "SELECTED" },
    { id: "style/master-candidate-02"; status: "NOT_SELECTED" },
    { id: "style/master-candidate-03"; status: "NOT_SELECTED" },
    { id: "style/master-candidate-04"; status: "NOT_SELECTED" },
  ];
  reference_element: {
    reference_id: "fictor-copperplate-media-master";
    revision: 1;
    kind: "LOCAL_MASTER_IMAGE";
    source_candidate_id: typeof SELECTED_CANDIDATE_ID;
    source_image_sha256: typeof MASTER_STYLE_IMAGE_SHA256;
    reference_instruction: "Use this local master image as a MEDIA_ONLY reference for 17th-century copperplate line treatment; do not copy its subject, geometry, pose, composition, whitespace, colors, paper tone, density, representation, or aspect ratio.";
    revision_policy: {
      provider_upload_binding_crop_resize_deferred_to: "T013";
      new_bytes_require_new_binding_revision: true;
      revision_change_requires_user_reapproval: true;
    };
    provider_registration: {
      status: "NOT_REGISTERED";
      provider_media_id: null;
      provider_reference_id: null;
      deferred_to: "T013";
    };
  };
  media_style_lock: {
    lock_scope: "MEDIA_ONLY";
    required_traits: readonly [
      "SEVENTEENTH_CENTURY_COPPERPLATE_OBSERVATIONAL_PLATE",
      "HAIRLINE_CONTOURS",
      "RESTRAINED_FORM_FOLLOWING_PARALLEL_HATCHING",
      "LIMITED_CROSSHATCH_WITH_PAPER_VISIBLE_HIGHLIGHTS",
      "LINE_LED_SHADING",
      "CRISP_THUMBNAIL_SILHOUETTE",
      "SUBTLE_AGED_TEXTURE",
    ];
    subject_geometry_locked: false;
    source_subject_note: "SOURCE_LIMB_COUNT_DIFFERS_FROM_PROMPT_BUT_IS_IRRELEVANT_TO_MEDIA_STYLE_APPROVAL";
  };
  allowed_variations: readonly [
    "SUBJECT_OVOID_OPENING_LIMBS_FEET_COUNT_POSE_AND_GEOMETRY",
    "COMPOSITION_BY_ASSET_CLASS",
    "CENTRAL_PLACEMENT_AND_WHITESPACE",
    "COLORS_INCLUDING_MAGENTA_ATTRIBUTE_ACCENTS",
    "DENSITY_TIERS",
    "FOUR_PAPER_TONES_INCLUDING_CREAM",
    "SOLID_OR_PHENOMENON_REPRESENTATION",
    "CARD_3_4_OR_LANDSCAPE_16_9_ASPECT",
  ];
  forbidden_drift: readonly [
    "MIXING_CANDIDATES_02_03_04",
    "PLATE_BORDER_FRAME_MAT_OR_SHADOW",
    "TEXT_LOGO_BRAND_PEOPLE_UI_OR_WATERMARK",
    "PHOTOREAL_3D_PAINTERLY_OR_FULL_COLOR_DRIFT",
    "OVER_DENSE_HATCH_THAT_DESTROYS_THUMBNAIL_SILHOUETTE",
    "REFERENCE_REVISION_CHANGE_WITHOUT_USER_REAPPROVAL",
  ];
  authorization_boundary: {
    t011_approval_scope: "EXACTLY_FOUR_STYLE_CANDIDATES_ONLY";
    t011_approval_inherited_by_t013_materials: false;
    t013_material_scope: {
      asset_count: 52;
      authorization_status: "NOT_AUTHORIZED";
    };
    t013_authorization_paths: readonly [
      {
        path_id: "T010_POLICY_REVISION_AND_T011_FULL_SCOPE_REVALIDATION";
        status: "NOT_SATISFIED";
        requirements: readonly [
          "T010_POLICY_REVISION_APPROVED_FOR_T013_MATERIAL_52",
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
        ];
      },
      {
        path_id: "NEW_T013_MATERIAL_52_USER_RISK_APPROVAL";
        status: "NOT_SATISFIED";
        requirements: readonly [
          "NEW_USER_APPROVAL_EXPLICITLY_SCOPED_TO_EXACTLY_52_T013_MATERIAL_ASSETS",
          "CURRENT_OBSERVED_RISKS_DISCLOSED_BEFORE_APPROVAL",
        ];
      },
    ];
    satisfaction_rule: "AT_LEAST_ONE_PATH_MUST_BE_SATISFIED_IN_A_NEW_MANIFEST_REVISION";
    authorization_path_satisfied: false;
  };
  downstream: {
    t013_state: "BLOCKED";
    unblock_requirements: readonly [
      "PROVIDER_REFERENCE_ROLE_AND_SCHEMA_PREPARED_FOR_THIS_REVISION",
      "CURRENT_COST_AND_BUDGET_PLAN_PREPARED_FOR_THIS_REVISION",
      "T013_MATERIAL_52_AUTHORIZATION_PATH_SATISFIED",
    ];
    remote_execution_allowed: false;
  };
}

function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertFileSha(root: string, path: string, expected: string): Buffer {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) throw new Error(`required T012 source is missing: ${path}`);
  const bytes = readFileSync(absolute);
  if (sha256(bytes) !== expected) throw new Error(`T012 source SHA mismatch: ${path}`);
  return bytes;
}

function buildUnchecked(repositoryRoot: string): MasterStyleManifest {
  const styleManifestBytes = assertFileSha(repositoryRoot, SOURCE_STYLE_MANIFEST_PATH, T011_STYLE_MANIFEST_SHA256);
  const actualEvidenceBytes = assertFileSha(repositoryRoot, ACTUAL_EVIDENCE_PATH, T011_ACTUAL_EVIDENCE_SHA256);
  assertFileSha(repositoryRoot, CONTACT_SHEET_PATH, T011_CONTACT_SHEET_SHA256);
  assertFileSha(repositoryRoot, CORE_PLAN_PATH, CORE_V1_PLAN_SHA256);
  const styleManifest = JSON.parse(styleManifestBytes.toString("utf8")) as { candidates?: Array<{ id?: string; path?: string }> };
  const evidence = JSON.parse(actualEvidenceBytes.toString("utf8")) as {
    candidates?: Array<Record<string, unknown>>;
  };
  const sourceCandidate = styleManifest.candidates?.find(({ id }) => id === SELECTED_CANDIDATE_ID);
  const actualCandidate = evidence.candidates?.find(({ candidate_id }) => candidate_id === SELECTED_CANDIDATE_ID);
  if (!sourceCandidate || sourceCandidate.path !== SELECTED_CANDIDATE_PATH || !actualCandidate) throw new Error("selected T012 candidate is absent from T011 sources");
  const recovery = actualCandidate.recovery as Record<string, unknown> | undefined;
  if (actualCandidate.job_id !== "e0f36c95-2e1b-4e38-9931-7e10e562f209" || actualCandidate.requested_model !== "nano_banana_2" ||
      actualCandidate.provider_reported_model !== "nano_banana_flash" || !recovery || recovery.sha256 !== MASTER_STYLE_IMAGE_SHA256 ||
      recovery.size_bytes !== 1618931 || recovery.actual_width !== 896 || recovery.actual_height !== 1200 || recovery.aspect_error_ppm !== 4445 ||
      recovery.provider_native_unmodified !== true) {
    throw new Error("selected T012 candidate evidence changed");
  }
  const image = verifyExistingPng(resolve(repositoryRoot, "public/assets"), SELECTED_CANDIDATE_PATH, "3:4", MASTER_STYLE_IMAGE_SHA256, DEFAULT_MAX_PNG_BYTES, 5_000);
  if (image.size !== 1618931 || image.width !== 896 || image.height !== 1200 || image.aspect_error_ppm !== 4445) {
    throw new Error("selected T012 source image changed");
  }
  return {
    schema_version: 1,
    manifest_version: "master-style-v1",
    decision: {
      decision_id: "T012_MASTER_STYLE_APPROVAL",
      revision: 1,
      contract_sha256: T012_CONTRACT_SHA256,
      state: "APPROVED_LOCAL_MEDIA_STYLE_LOCK",
      selected_candidate_count: 1,
      user_evidence: {
        exact_text_ko: "후보 1 채택",
        approved_at: "2026-08-11T12:05:07.373Z",
        local_date: "2026-08-11",
        local_timezone: "Asia/Seoul",
        source: "current user conversation",
      },
    },
    sources: {
      t011_style_manifest: { path: SOURCE_STYLE_MANIFEST_PATH, sha256: T011_STYLE_MANIFEST_SHA256 },
      t011_actual_run_evidence: { path: ACTUAL_EVIDENCE_PATH, sha256: T011_ACTUAL_EVIDENCE_SHA256 },
      t011_contact_sheet: { path: CONTACT_SHEET_PATH, sha256: T011_CONTACT_SHEET_SHA256 },
      immutable_core_plan: { path: CORE_PLAN_PATH, sha256: CORE_V1_PLAN_SHA256 },
    },
    selected_candidate: {
      id: SELECTED_CANDIDATE_ID,
      candidate_path: SELECTED_CANDIDATE_PATH,
      public_image_path: PUBLIC_IMAGE_PATH,
      image_sha256: MASTER_STYLE_IMAGE_SHA256,
      size_bytes: 1618931,
      target_aspect_ratio: "3:4",
      actual_width: 896,
      actual_height: 1200,
      aspect_error_ppm: 4445,
      provider_native_unmodified: true,
      requested_model: "nano_banana_2",
      provider_reported_model: "nano_banana_flash",
      job_id: "e0f36c95-2e1b-4e38-9931-7e10e562f209",
    },
    candidate_selection: [
      { id: "style/master-candidate-01", status: "SELECTED" },
      { id: "style/master-candidate-02", status: "NOT_SELECTED" },
      { id: "style/master-candidate-03", status: "NOT_SELECTED" },
      { id: "style/master-candidate-04", status: "NOT_SELECTED" },
    ],
    reference_element: {
      reference_id: "fictor-copperplate-media-master",
      revision: 1,
      kind: "LOCAL_MASTER_IMAGE",
      source_candidate_id: SELECTED_CANDIDATE_ID,
      source_image_sha256: MASTER_STYLE_IMAGE_SHA256,
      reference_instruction: "Use this local master image as a MEDIA_ONLY reference for 17th-century copperplate line treatment; do not copy its subject, geometry, pose, composition, whitespace, colors, paper tone, density, representation, or aspect ratio.",
      revision_policy: {
        provider_upload_binding_crop_resize_deferred_to: "T013",
        new_bytes_require_new_binding_revision: true,
        revision_change_requires_user_reapproval: true,
      },
      provider_registration: {
        status: "NOT_REGISTERED",
        provider_media_id: null,
        provider_reference_id: null,
        deferred_to: "T013",
      },
    },
    media_style_lock: {
      lock_scope: "MEDIA_ONLY",
      required_traits: [
        "SEVENTEENTH_CENTURY_COPPERPLATE_OBSERVATIONAL_PLATE",
        "HAIRLINE_CONTOURS",
        "RESTRAINED_FORM_FOLLOWING_PARALLEL_HATCHING",
        "LIMITED_CROSSHATCH_WITH_PAPER_VISIBLE_HIGHLIGHTS",
        "LINE_LED_SHADING",
        "CRISP_THUMBNAIL_SILHOUETTE",
        "SUBTLE_AGED_TEXTURE",
      ],
      subject_geometry_locked: false,
      source_subject_note: "SOURCE_LIMB_COUNT_DIFFERS_FROM_PROMPT_BUT_IS_IRRELEVANT_TO_MEDIA_STYLE_APPROVAL",
    },
    allowed_variations: [
      "SUBJECT_OVOID_OPENING_LIMBS_FEET_COUNT_POSE_AND_GEOMETRY",
      "COMPOSITION_BY_ASSET_CLASS",
      "CENTRAL_PLACEMENT_AND_WHITESPACE",
      "COLORS_INCLUDING_MAGENTA_ATTRIBUTE_ACCENTS",
      "DENSITY_TIERS",
      "FOUR_PAPER_TONES_INCLUDING_CREAM",
      "SOLID_OR_PHENOMENON_REPRESENTATION",
      "CARD_3_4_OR_LANDSCAPE_16_9_ASPECT",
    ],
    forbidden_drift: [
      "MIXING_CANDIDATES_02_03_04",
      "PLATE_BORDER_FRAME_MAT_OR_SHADOW",
      "TEXT_LOGO_BRAND_PEOPLE_UI_OR_WATERMARK",
      "PHOTOREAL_3D_PAINTERLY_OR_FULL_COLOR_DRIFT",
      "OVER_DENSE_HATCH_THAT_DESTROYS_THUMBNAIL_SILHOUETTE",
      "REFERENCE_REVISION_CHANGE_WITHOUT_USER_REAPPROVAL",
    ],
    authorization_boundary: {
      t011_approval_scope: "EXACTLY_FOUR_STYLE_CANDIDATES_ONLY",
      t011_approval_inherited_by_t013_materials: false,
      t013_material_scope: {
        asset_count: 52,
        authorization_status: "NOT_AUTHORIZED",
      },
      t013_authorization_paths: [
        {
          path_id: "T010_POLICY_REVISION_AND_T011_FULL_SCOPE_REVALIDATION",
          status: "NOT_SATISFIED",
          requirements: [
            "T010_POLICY_REVISION_APPROVED_FOR_T013_MATERIAL_52",
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
          ],
        },
        {
          path_id: "NEW_T013_MATERIAL_52_USER_RISK_APPROVAL",
          status: "NOT_SATISFIED",
          requirements: [
            "NEW_USER_APPROVAL_EXPLICITLY_SCOPED_TO_EXACTLY_52_T013_MATERIAL_ASSETS",
            "CURRENT_OBSERVED_RISKS_DISCLOSED_BEFORE_APPROVAL",
          ],
        },
      ],
      satisfaction_rule: "AT_LEAST_ONE_PATH_MUST_BE_SATISFIED_IN_A_NEW_MANIFEST_REVISION",
      authorization_path_satisfied: false,
    },
    downstream: {
      t013_state: "BLOCKED",
      unblock_requirements: [
        "PROVIDER_REFERENCE_ROLE_AND_SCHEMA_PREPARED_FOR_THIS_REVISION",
        "CURRENT_COST_AND_BUDGET_PLAN_PREPARED_FOR_THIS_REVISION",
        "T013_MATERIAL_52_AUTHORIZATION_PATH_SATISFIED",
      ],
      remote_execution_allowed: false,
    },
  };
}

export function buildMasterStyleManifest(repositoryRoot: string): MasterStyleManifest {
  return buildUnchecked(repositoryRoot);
}

export function validateMasterStyleManifest(manifest: MasterStyleManifest, repositoryRoot: string): void {
  const expected = buildUnchecked(repositoryRoot);
  if (JSON.stringify(manifest) !== JSON.stringify(expected)) throw new Error("master-style-v1 changed from the approved T012 decision");
}

export function renderMasterStyleManifest(manifest: MasterStyleManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function masterStyleManifestSha256(manifest: MasterStyleManifest): string {
  return sha256(renderMasterStyleManifest(manifest));
}
