import Ajv, { type ErrorObject } from "ajv";

import type { GeneratedCard } from "../../domain/forge";
import type { GeneratedEquipmentDetail } from "../generator/generate-catalog";
import {
  calculateSourceHash,
  canonicalSerialize,
  sha256,
  type GeneratedEnvelope,
} from "../generator/render-generated";
import { cardsEnvelopeSchema, equipmentEnvelopeSchema } from "./generated-card.schema";
import type { SourceData } from "./validate-source-data";

export interface GeneratedValidationResult {
  valid: boolean;
  errors: string[];
  schemaErrors: ErrorObject[];
}

const ajv = new Ajv({ allErrors: true, strict: true });
const validateCardsEnvelope = ajv.compile(cardsEnvelopeSchema);
const validateEquipmentEnvelope = ajv.compile(equipmentEnvelopeSchema);

export function validateGeneratedCatalog(
  cardsEnvelope: GeneratedEnvelope<GeneratedCard>,
  equipmentEnvelope: GeneratedEnvelope<GeneratedEquipmentDetail>,
  source: SourceData,
): GeneratedValidationResult {
  const cardsSchemaValid = validateCardsEnvelope(cardsEnvelope);
  const equipmentSchemaValid = validateEquipmentEnvelope(equipmentEnvelope);
  const schemaErrors = [
    ...(validateCardsEnvelope.errors ?? []),
    ...(validateEquipmentEnvelope.errors ?? []),
  ];
  const errors: string[] = [];
  const cards = cardsEnvelope.items;
  const equipment = equipmentEnvelope.items;
  const expectedSourceHash = calculateSourceHash([
    source.materials,
    source.laws,
    source.resultClasses,
  ]);

  if (cardsEnvelope.source_hash !== equipmentEnvelope.source_hash) {
    errors.push("generated envelopes must share one source hash");
  }
  if (cardsEnvelope.source_hash !== expectedSourceHash) {
    errors.push("generated source hash does not match the injected source");
  }
  if (cardsEnvelope.count !== cards.length || equipmentEnvelope.count !== equipment.length) {
    errors.push("envelope count must match payload length");
  }
  if (cardsEnvelope.content_hash !== sha256(canonicalSerialize(cards))) {
    errors.push("cards content hash mismatch");
  }
  if (equipmentEnvelope.content_hash !== sha256(canonicalSerialize(equipment))) {
    errors.push("equipment content hash mismatch");
  }

  const unique = (values: readonly string[]) => new Set(values).size === values.length;
  if (!unique(cards.map(({ card_id }) => card_id))) errors.push("card ids must be unique");
  if (!unique(cards.map(({ recipe_id }) => recipe_id))) errors.push("recipe ids must be unique");
  if (!unique(cards.map(({ art }) => art))) errors.push("card art paths must be unique");

  const expectedBranches = { LAW: 861, CATALYST: 420, EQUIPMENT: 45 } as const;
  for (const [branch, count] of Object.entries(expectedBranches)) {
    if (cards.filter((card) => card.branch === branch).length !== count) {
      errors.push(`branch count mismatch ${branch}`);
    }
  }

  for (const card of cards) {
    const [low, high] = card.material_ids;
    if (low >= high) errors.push(`non-canonical material ids ${card.recipe_id}`);
    if (card.recipe_id !== `${low}|${high}`) errors.push(`recipe mismatch ${card.card_id}`);
    if (card.card_id !== `forge__${low}__${high}`) errors.push(`card id mismatch ${card.recipe_id}`);
    if (card.art !== `cards/${card.card_id}.png`) errors.push(`art mismatch ${card.card_id}`);
    if (card.branch !== "EQUIPMENT" && card.balance_status === "PENDING_2026_08_21") {
      if (!card.stats || Object.values(card.stats).some((value) => value !== null)) {
        errors.push(`pending stats must be null ${card.card_id}`);
      }
    }
  }

  const equipmentCards = new Map(
    cards.filter((card) => card.branch === "EQUIPMENT").map((card) => [card.card_id, card]),
  );
  const sourceMaterials = new Map(source.materials.map((material) => [material.id, material]));
  const equipmentClasses = source.resultClasses.filter(({ id }) => id === "EQUIPMENT");
  const sourceInteractions = equipmentClasses[0]?.equipment_interactions ?? [];
  if (equipmentClasses.length !== 1 || sourceInteractions.length !== 45) {
    errors.push("injected source must contain one complete EQUIPMENT interaction table");
  }
  if (!unique(equipment.map(({ card_id }) => card_id))) errors.push("equipment ids must be unique");
  for (const detail of equipment) {
    const card = equipmentCards.get(detail.card_id);
    if (
      !card ||
      card.recipe_id !== detail.recipe_id ||
      card.passive_effect_id !== detail.passive_effect_id ||
      card.material_ids.join("|") !== detail.tool_ids.join("|")
    ) {
      errors.push(`equipment detail mismatch ${detail.card_id}`);
    }

    const leftTool = sourceMaterials.get(detail.tool_ids[0]);
    const rightTool = sourceMaterials.get(detail.tool_ids[1]);
    if (
      leftTool?.category !== "TOOL" ||
      rightTool?.category !== "TOOL" ||
      !leftTool.tool_domain ||
      !rightTool.tool_domain
    ) {
      errors.push(`equipment source tools missing ${detail.card_id}`);
      continue;
    }
    const expectedDomains = [leftTool.tool_domain, rightTool.tool_domain] as const;
    if (
      detail.domains[0] !== expectedDomains[0] ||
      detail.domains[1] !== expectedDomains[1]
    ) {
      errors.push(`equipment source domains mismatch ${detail.card_id}`);
    }
    const matchingInteractions = sourceInteractions.filter(
      ({ domains }) =>
        domains[0] === expectedDomains[0] && domains[1] === expectedDomains[1],
    );
    if (
      matchingInteractions.length !== 1 ||
      matchingInteractions[0].passive_effect_id !== detail.passive_effect_id ||
      matchingInteractions[0].passive_effect_ko !== detail.passive_effect_ko
    ) {
      errors.push(`equipment source interaction mismatch ${detail.card_id}`);
    }
  }

  return { valid: cardsSchemaValid && equipmentSchemaValid && errors.length === 0, errors, schemaErrors };
}
