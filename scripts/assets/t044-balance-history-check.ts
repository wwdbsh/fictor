import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  T016_CORE_PLAN_PATH,
  T016_CORE_PLAN_SHA256,
  T016_NO_COPY_BOUNDARY,
  T016_REFERENCE_INSTRUCTION,
  T016_V1_BINDING_PATH,
  T016_V1_ID_LIST_SHA256,
  T016_V1_PENDING_PATH,
  T016_V1_PLAN_PATH,
  canonicalJsonT016,
  loadT016Binding,
  sha256T016,
  t016PlanSha256,
  type T016Pending,
  type T016Plan,
} from "./t016-canonical-cards-production-v1";
import {
  T016_MATERIALS_PATH,
  T016_SELECTION_PATH,
  buildT016Selection,
  type T016Selection,
} from "./t016-canonical-selection-v1";
import { readPinnedT020 } from "./t020-world-art-production-v1";

const T044_APPROVAL_PATH = "docs/balance/t043-approved-values-2026-08-21.json" as const;
export const T016_T044_BALANCE_REBIND = {
  trackedSelectionSha256: "6eab6fe7b563973a82eff3f98447eced4c3b462f360c4e6d048afb8f735e2c4c",
  trackedPlanSha256: "e3925eb033eb852ac8f1e7f8765991ae749a9c508c8aee48601d58bd4a61044e",
  trackedPendingSha256: "ce1d656be34cecb0b2e75a10120271fa2798a6f7aba4ade0cc9e92980323cd56",
  trackedBindingSha256: "2489ab80ff53d58e7958804dd6af7f751879772bb3d92e282b89497e46a9daa8",
  historicalMaterialsSha256: "c1ce53ac380f637b9947211250313db25d03503f837de219dfb1ba8d7c897931",
  currentMaterialsSha256: "607266635b128fe73dcde391362b0f1ea16619e879081db7c3c06eabe136cd8c",
  historicalStableMaterialsProjectionSha256: "2b57d9b7838a929fde8355495595b1974c500b72dcd14a1ed40628d4a895340d",
  historicalStableSelectionProjectionSha256: "73dbf89632a7a12603426c7741c2eddbf92e2bafc61bbabcf973571e267b3fca",
  approvalSha256: "1b97e425bd857279f48470c2b59681b012935e6f7d45cf97e7c46b567a9ba086",
} as const;

function stableMaterialsProjection(materialsBytes: string | Uint8Array): unknown[] {
  const parsed = JSON.parse(Buffer.from(materialsBytes).toString("utf8")) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 52) throw new Error("T044_BALANCE_REBIND requires exactly 52 materials");
  return parsed.map((value, index) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`T044_BALANCE_REBIND material ${index} is not an object`);
    }
    const { balance_status: balanceStatus, potency, cost_base: costBase, ...stable } = value as Record<string, unknown>;
    void balanceStatus;
    void potency;
    void costBase;
    return stable;
  });
}

function stableSelectionProjection(selection: T016Selection): unknown {
  const { sha256: materialsSha256, ...stableMaterialsInput } = selection.inputs.materials;
  void materialsSha256;
  return { ...selection, inputs: { ...selection.inputs, materials: stableMaterialsInput } };
}

function validateT044Approval(approvalBytes: string): void {
  if (sha256T016(approvalBytes) !== T016_T044_BALANCE_REBIND.approvalSha256) {
    throw new Error("T044_BALANCE_REBIND approval artifact bytes mismatch");
  }
  const approval = JSON.parse(approvalBytes) as {
    status?: unknown;
    task?: { key?: unknown };
    scope?: {
      approved_value_sets?: unknown;
      card_exceptions?: unknown;
      structural_changes?: unknown;
      application_task?: unknown;
    };
  };
  if (
    approval.status !== "APPROVED_NOT_APPLIED" ||
    approval.task?.key !== "T043" ||
    canonicalJsonT016(approval.scope?.approved_value_sets) !== canonicalJsonT016(["global_coefficients", "laws", "materials"]) ||
    !Array.isArray(approval.scope?.card_exceptions) ||
    approval.scope.card_exceptions.length !== 0 ||
    approval.scope.structural_changes !== false ||
    approval.scope.application_task !== "T044"
  ) {
    throw new Error("T044_BALANCE_REBIND approval scope mismatch");
  }
}

export function validateT044T016SelectionRebind(
  trackedSelectionBytes: string,
  currentSelection: T016Selection,
  currentMaterialsBytes: string | Uint8Array,
  approvalBytes: string,
): { value: T016Selection; sha256: string } {
  if (sha256T016(trackedSelectionBytes) !== T016_T044_BALANCE_REBIND.trackedSelectionSha256) {
    throw new Error("T044_BALANCE_REBIND tracked T016 selection bytes mismatch");
  }
  const trackedSelection = JSON.parse(trackedSelectionBytes) as T016Selection;
  if (trackedSelection.inputs.materials.sha256 !== T016_T044_BALANCE_REBIND.historicalMaterialsSha256) {
    throw new Error("T044_BALANCE_REBIND historical T016 materials hash mismatch");
  }
  if (
    sha256T016(canonicalJsonT016(stableMaterialsProjection(currentMaterialsBytes))) !==
    T016_T044_BALANCE_REBIND.historicalStableMaterialsProjectionSha256
  ) {
    throw new Error("T044_BALANCE_REBIND stable T016 material projection mismatch");
  }
  if (sha256T016(currentMaterialsBytes) !== T016_T044_BALANCE_REBIND.currentMaterialsSha256) {
    throw new Error("T044_BALANCE_REBIND current T016 materials bytes mismatch");
  }
  if (currentSelection.inputs.materials.sha256 !== T016_T044_BALANCE_REBIND.currentMaterialsSha256) {
    throw new Error("T044_BALANCE_REBIND current T016 selection source hash mismatch");
  }
  const trackedProjection = canonicalJsonT016(stableSelectionProjection(trackedSelection));
  if (sha256T016(trackedProjection) !== T016_T044_BALANCE_REBIND.historicalStableSelectionProjectionSha256) {
    throw new Error("T044_BALANCE_REBIND historical T016 selection projection mismatch");
  }
  if (trackedProjection !== canonicalJsonT016(stableSelectionProjection(currentSelection))) {
    throw new Error("T044_BALANCE_REBIND stable T016 selection projection mismatch");
  }
  validateT044Approval(approvalBytes);
  return { value: trackedSelection, sha256: sha256T016(trackedSelectionBytes) };
}

export function loadT016SelectionForT044Check(root: string): { value: T016Selection; sha256: string } {
  const trackedBytes = readFileSync(resolve(root, T016_SELECTION_PATH), "utf8");
  const materialsBytes = readFileSync(resolve(root, T016_MATERIALS_PATH));
  return validateT044T016SelectionRebind(
    trackedBytes,
    buildT016Selection(root),
    materialsBytes,
    readFileSync(resolve(root, T044_APPROVAL_PATH), "utf8"),
  );
}

function validateT016PlanBindings(root: string, plan: T016Plan, selection: T016Selection): void {
  const bindingBytes = readFileSync(resolve(root, T016_V1_BINDING_PATH), "utf8");
  if (sha256T016(bindingBytes) !== T016_T044_BALANCE_REBIND.trackedBindingSha256) {
    throw new Error("T044_BALANCE_REBIND tracked T016 binding bytes mismatch");
  }
  const binding = loadT016Binding(root);
  if (plan.sources.implementation_binding.sha256 !== sha256T016(bindingBytes)) {
    throw new Error("T044_BALANCE_REBIND T016 plan binding hash mismatch");
  }
  if (
    plan.selection.artifact_sha256 !== T016_T044_BALANCE_REBIND.trackedSelectionSha256 ||
    plan.selection.id_list_sha256 !== T016_V1_ID_LIST_SHA256 ||
    selection.selection_list_sha256 !== T016_V1_ID_LIST_SHA256 ||
    canonicalJsonT016(plan.sources.implementation_binding.files) !== canonicalJsonT016(binding.files)
  ) {
    throw new Error("T044_BALANCE_REBIND T016 plan selection or implementation binding mismatch");
  }
  const core = JSON.parse(readPinnedT020(root, T016_CORE_PLAN_PATH, T016_CORE_PLAN_SHA256).toString("utf8")) as {
    assets: Array<{ id: string; path: string; aspect_ratio: string; prompt: string }>;
  };
  const coreById = new Map(core.assets.map((asset) => [asset.id, asset]));
  if (plan.assets.length !== selection.selected.length) throw new Error("T044_BALANCE_REBIND T016 selected asset count mismatch");
  for (const [index, entry] of selection.selected.entries()) {
    const asset = plan.assets[index];
    const coreAsset = coreById.get(entry.id);
    const effectivePrompt = coreAsset === undefined
      ? null
      : `${coreAsset.prompt}\n\nMaster-style reference instruction: ${T016_REFERENCE_INSTRUCTION}\n${T016_NO_COPY_BOUNDARY}`;
    if (
      !asset || !coreAsset || asset.id !== entry.id || asset.path !== entry.path || asset.path !== coreAsset.path ||
      asset.aspect_ratio !== coreAsset.aspect_ratio || asset.bucket !== entry.bucket || asset.left !== entry.left ||
      asset.right !== entry.right || asset.manifest_index !== entry.manifest_index || asset.core_prompt !== coreAsset.prompt ||
      asset.effective_prompt !== effectivePrompt
    ) {
      throw new Error(`T044_BALANCE_REBIND T016 art or selection drift at index ${index}`);
    }
  }
}

export function loadT016PlanForT044Check(root: string): T016Plan {
  const selection = loadT016SelectionForT044Check(root).value;
  const planBytes = readFileSync(resolve(root, T016_V1_PLAN_PATH), "utf8");
  if (sha256T016(planBytes) !== T016_T044_BALANCE_REBIND.trackedPlanSha256) {
    throw new Error("T044_BALANCE_REBIND tracked T016 plan bytes mismatch");
  }
  const plan = JSON.parse(planBytes) as T016Plan;
  validateT016PlanBindings(root, plan, selection);
  return plan;
}

export function loadT016PendingForT044Check(root: string, plan: T016Plan): T016Pending {
  const pendingBytes = readFileSync(resolve(root, T016_V1_PENDING_PATH), "utf8");
  if (sha256T016(pendingBytes) !== T016_T044_BALANCE_REBIND.trackedPendingSha256) {
    throw new Error("T044_BALANCE_REBIND tracked T016 pending bytes mismatch");
  }
  const pending = JSON.parse(pendingBytes) as T016Pending;
  if (
    pending.plan_sha256 !== t016PlanSha256(plan) ||
    pending.selection_artifact_sha256 !== T016_T044_BALANCE_REBIND.trackedSelectionSha256 ||
    pending.selection_list_sha256 !== T016_V1_ID_LIST_SHA256
  ) {
    throw new Error("T044_BALANCE_REBIND T016 pending binding mismatch");
  }
  return pending;
}

export function checkT016HistoryForT044(root: string): {
  decision_binding: "T044_BALANCE_REBIND";
  selection: T016Selection;
  plan: T016Plan;
  pending: T016Pending;
} {
  const selection = loadT016SelectionForT044Check(root).value;
  const plan = loadT016PlanForT044Check(root);
  const pending = loadT016PendingForT044Check(root, plan);
  return { decision_binding: "T044_BALANCE_REBIND", selection, plan, pending };
}
