import { resolveForgeCard } from "../../domain/forge";
import { freeze } from "../../freeze";
import { BROWSER_RUNTIME_PACKET } from "./runtime-packet.generated";
import { browserPacketHasCanonicalArt, type BrowserMaterialDisplay } from "./runtime-packet";
import type { Track1UiForgeCanonicalPreview, Track1UiForgeThirdOverlay } from "./ui-types";

interface CanonicalPreviewRecord {
  readonly recipeId: string;
  readonly cardId: string;
  readonly materialIds: readonly [string, string];
  readonly materialNamesKo: readonly [string, string];
  readonly materialArt: readonly [string, string];
  readonly resultNameKo: string;
  readonly resultArt: string;
  readonly resultArtFallbackLabelKo: string | null;
  readonly branch: "LAW" | "CATALYST" | "EQUIPMENT";
  readonly effectId: string | null;
  readonly effectLabelKo: string;
}

const materialDisplayById = new Map<string, BrowserMaterialDisplay>(
  BROWSER_RUNTIME_PACKET.materialDisplay.map((material) => [material.id, material]),
);
const materialById = new Map(
  BROWSER_RUNTIME_PACKET.resolverContext.materials.map((material) => [material.id, material]),
);

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalRecord(firstId: string, secondId: string): CanonicalPreviewRecord | null {
  if (firstId === secondId) return null;
  const first = materialById.get(firstId);
  const second = materialById.get(secondId);
  if (!first || !second) return null;
  const resolved = resolveForgeCard(first, second, BROWSER_RUNTIME_PACKET.resolverContext.inputs);
  const leftDisplay = materialDisplayById.get(resolved.material_ids[0]);
  const rightDisplay = materialDisplayById.get(resolved.material_ids[1]);
  if (!leftDisplay || !rightDisplay) return null;
  const displays: [BrowserMaterialDisplay, BrowserMaterialDisplay] = [leftDisplay, rightDisplay];
  const hasCanonicalArt = browserPacketHasCanonicalArt(BROWSER_RUNTIME_PACKET, resolved.material_ids);
  const fallback = [...displays].sort((left, right) => compareIds(left.id, right.id))[0];
  const effectId = resolved.combat_effect ?? resolved.passive_effect_id;
  return freeze({
    recipeId: resolved.recipe_id,
    cardId: resolved.card_id,
    materialIds: freeze([...resolved.material_ids]) as unknown as readonly [string, string],
    materialNamesKo: freeze([displays[0].nameKo, displays[1].nameKo]) as unknown as readonly [string, string],
    materialArt: freeze([displays[0].art, displays[1].art]) as unknown as readonly [string, string],
    resultNameKo: resolved.name_ko,
    resultArt: hasCanonicalArt ? resolved.art : fallback.art,
    resultArtFallbackLabelKo: hasCanonicalArt ? null : `${fallback.nameKo} 재료 도판`,
    branch: resolved.branch,
    effectId,
    effectLabelKo: resolved.branch === "EQUIPMENT" ? "상시 장비 효과" : "전투 효과 · 수치 확정 전",
  });
}

const canonicalCatalog: readonly CanonicalPreviewRecord[] = freeze(
  BROWSER_RUNTIME_PACKET.resolverContext.materials
    .flatMap((left, leftIndex, materials) => materials.slice(leftIndex + 1).map((right) => canonicalRecord(left.id, right.id)))
    .filter((record): record is CanonicalPreviewRecord => record !== null)
    .sort((left, right) => compareIds(left.recipeId, right.recipeId)),
);
const canonicalByRecipeId = new Map(canonicalCatalog.map((record) => [record.recipeId, record]));

function assetUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}assets/${path.replace(/^\/+/, "")}`;
}

function projectRecord(record: CanonicalPreviewRecord, baseUrl: string): Track1UiForgeCanonicalPreview {
  return freeze({
    recipeId: record.recipeId,
    cardId: record.cardId,
    materials: freeze([
      freeze({ materialId: record.materialIds[0], nameKo: record.materialNamesKo[0], artSrc: assetUrl(baseUrl, record.materialArt[0]) }),
      freeze({ materialId: record.materialIds[1], nameKo: record.materialNamesKo[1], artSrc: assetUrl(baseUrl, record.materialArt[1]) }),
    ]) as unknown as Track1UiForgeCanonicalPreview["materials"],
    result: freeze({
      nameKo: record.resultNameKo,
      artSrc: assetUrl(baseUrl, record.resultArt),
      artFallbackLabelKo: record.resultArtFallbackLabelKo,
      branch: record.branch,
      effectId: record.effectId,
      effectLabelKo: record.effectLabelKo,
    }),
  });
}

/** The only application-owned canonical preview builder used by both forge modes and the Codex. */
export function buildCanonicalForgePreview(
  materialIds: readonly [string, string],
  baseUrl: string,
): Track1UiForgeCanonicalPreview | null {
  const recipeId = [...materialIds].sort(compareIds).join("|");
  const record = canonicalByRecipeId.get(recipeId);
  return record ? projectRecord(record, baseUrl) : null;
}

export function buildThirdOverlayPreview(
  materialId: string,
  baseUrl: string,
  expectedAttribute?: string | null,
): Track1UiForgeThirdOverlay | null {
  const display = materialDisplayById.get(materialId);
  const material = materialById.get(materialId);
  if (!display || !material) return null;
  const rawAttribute = Array.isArray(material.attribute) ? material.attribute[0] : material.attribute;
  const resonanceAttribute = rawAttribute === "NONE" ? null : rawAttribute;
  if (expectedAttribute !== undefined && resonanceAttribute !== expectedAttribute) return null;
  return freeze({
    materialId,
    nameKo: display.nameKo,
    artSrc: assetUrl(baseUrl, display.art),
    labelKo: resonanceAttribute === null ? "기본 결과 공명 유지" : `${resonanceAttribute} 공명 오버레이`,
  });
}

export function projectCanonicalCodex(baseUrl: string): readonly Track1UiForgeCanonicalPreview[] {
  return canonicalCatalog.map((record) => projectRecord(record, baseUrl));
}
