import { createHash } from "node:crypto";

import type { GeneratedCard } from "../../domain/forge";
import type { GeneratedEquipmentDetail } from "./generate-catalog";

export const GENERATOR_VERSION = "canonical-v1";

export interface GeneratedEnvelope<T> {
  schema_version: 1;
  generator_version: typeof GENERATOR_VERSION;
  source_hash: string;
  content_hash: string;
  count: number;
  items: T[];
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
  return value;
}

export function canonicalSerialize(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function calculateSourceHash(sourcesInFixedOrder: readonly unknown[]): string {
  return sha256(canonicalSerialize(sourcesInFixedOrder));
}

export function makeEnvelope<T>(items: T[], sourceHash: string): GeneratedEnvelope<T> {
  return {
    schema_version: 1,
    generator_version: GENERATOR_VERSION,
    source_hash: sourceHash,
    content_hash: sha256(canonicalSerialize(items)),
    count: items.length,
    items,
  };
}

export function renderEnvelope<T>(envelope: GeneratedEnvelope<T>): string {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

export interface RenderedCatalog {
  cardsEnvelope: GeneratedEnvelope<GeneratedCard>;
  equipmentEnvelope: GeneratedEnvelope<GeneratedEquipmentDetail>;
  cardsText: string;
  equipmentText: string;
}

export function renderCatalog(
  cards: GeneratedCard[],
  equipment: GeneratedEquipmentDetail[],
  sourceHash: string,
): RenderedCatalog {
  const cardsEnvelope = makeEnvelope(cards, sourceHash);
  const equipmentEnvelope = makeEnvelope(equipment, sourceHash);
  return {
    cardsEnvelope,
    equipmentEnvelope,
    cardsText: renderEnvelope(cardsEnvelope),
    equipmentText: renderEnvelope(equipmentEnvelope),
  };
}
