import type { StillkinTrack1Event } from "../run";
import { freeze } from "../../freeze";
import { buildCanonicalForgePreview, buildThirdOverlayPreview } from "./forge-codex-preview";
import type { Track1UiForgePresentation } from "./ui-types";

type ForgeCreatedEvent = Extract<StillkinTrack1Event, { type: "FORGE_RESULT_CREATED" }>;
type RecipeDiscoveredEvent = Extract<StillkinTrack1Event, { type: "RECIPE_DISCOVERED" }>;

function exactRecipeMaterialIds(recipeId: string): readonly [string, string] | null {
  const parts = recipeId.split("|");
  if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0] === parts[1]) return null;
  return freeze([parts[0], parts[1]]) as unknown as readonly [string, string];
}

/**
 * Builds the ephemeral presentation seam from one accepted, persisted dispatch.
 * Event disagreement suppresses presentation without changing the accepted game result.
 */
export function buildForgePresentation(
  events: readonly StillkinTrack1Event[],
  baseUrl: string,
  presentationScopeId: string,
): Track1UiForgePresentation | null {
  const createdEvents = events.filter((event): event is ForgeCreatedEvent => event.type === "FORGE_RESULT_CREATED");
  if (createdEvents.length !== 1) return null;

  const created = createdEvents[0];
  const discoveredEvents = events.filter((event): event is RecipeDiscoveredEvent => event.type === "RECIPE_DISCOVERED");
  if (discoveredEvents.length > 1 || discoveredEvents.some(({ recipeId }) => recipeId !== created.recipeId)) return null;

  const materialIds = exactRecipeMaterialIds(created.recipeId);
  if (!materialIds) return null;
  const canonical = buildCanonicalForgePreview(materialIds, baseUrl);
  if (!canonical || canonical.recipeId !== created.recipeId || canonical.cardId !== created.cardId) return null;
  const thirdOverlay = created.thirdOverlay
    ? buildThirdOverlayPreview(created.thirdOverlay.thirdMaterialId, baseUrl, created.thirdOverlay.resonanceAttribute)
    : null;
  if (created.thirdOverlay && !thirdOverlay) return null;

  return freeze({
    presentationId: `${presentationScopeId}:forge-result:${created.mode}:${created.recipeId}`,
    discovery: discoveredEvents.length === 1 ? "FIRST" : "REPEAT",
    mode: created.mode,
    location: created.location,
    canonical,
    thirdOverlay,
  });
}
