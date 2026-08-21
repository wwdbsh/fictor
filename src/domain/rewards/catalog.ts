import type { MaterialAuthorityEntryV1 } from "./types";
import { freeze } from "../../freeze";

const grounds = ["still", "burn", "scat", "rot", "wash", "join"] as const;
const groundIds = ["GROUND_STILL", "GROUND_BURN", "GROUND_SCATTER", "GROUND_ROT", "GROUND_WASH", "GROUND_JOIN"] as const;

const authority: MaterialAuthorityEntryV1[] = [];
for (let index = 0; index < grounds.length; index += 1) {
  const stem = grounds[index];
  const oreStem = stem === "scat" ? "scatter" : stem;
  authority.push({ id: `ore_${oreStem}`, category: "ORE", origin: groundIds[index] });
  for (let depth = 1; depth <= 5; depth += 1) {
    authority.push({ id: `${stem}_${String(depth).padStart(2, "0")}`, category: "GROUND_PRODUCT", origin: groundIds[index] });
  }
}
for (let index = 1; index <= 10; index += 1) {
  authority.push({ id: `tool_${String(index).padStart(2, "0")}`, category: "TOOL", origin: "NONE" });
}
for (let index = 1; index <= 6; index += 1) {
  authority.push({ id: `odd_${String(index).padStart(2, "0")}`, category: "ODDITY", origin: "NONE" });
}

export const CANONICAL_MATERIAL_AUTHORITY_V1: readonly MaterialAuthorityEntryV1[] = freeze(
  authority.map((item) => freeze(item)),
);
export const CANONICAL_MATERIAL_IDS_V1 = freeze(CANONICAL_MATERIAL_AUTHORITY_V1.map(({ id }) => id).sort());
export const TOOL_MATERIAL_IDS_V1 = freeze(CANONICAL_MATERIAL_AUTHORITY_V1.filter(({ category }) => category === "TOOL").map(({ id }) => id));
export const ODDITY_MATERIAL_IDS_V1 = freeze(CANONICAL_MATERIAL_AUTHORITY_V1.filter(({ category }) => category === "ODDITY").map(({ id }) => id));
export const STILL_GROUND_MATERIAL_IDS_V1 = freeze(CANONICAL_MATERIAL_AUTHORITY_V1.filter(({ origin }) => origin === "GROUND_STILL").map(({ id }) => id));

const byId = new Map(CANONICAL_MATERIAL_AUTHORITY_V1.map((item) => [item.id, item]));

export function getMaterialAuthorityEntry(id: unknown): MaterialAuthorityEntryV1 | undefined {
  return typeof id === "string" ? byId.get(id) : undefined;
}

export function isCanonicalRecipeId(id: unknown): id is string {
  if (typeof id !== "string") return false;
  const parts = id.split("|");
  return parts.length === 2 && parts[0] < parts[1] && byId.has(parts[0]) && byId.has(parts[1]);
}
