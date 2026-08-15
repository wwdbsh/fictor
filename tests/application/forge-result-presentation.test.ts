import { describe, expect, it } from "vitest";

import { buildForgePresentation, type StillkinTrack1Event } from "../../src/application";

const created = Object.freeze({
  type: "FORGE_RESULT_CREATED",
  mode: "INSTANT",
  instanceId: "forge-instance-v1-1",
  cardId: "forge__ore_still__still_01",
  recipeId: "ore_still|still_01",
  location: "HAND",
}) satisfies StillkinTrack1Event;

describe("forge result presentation seam", () => {
  it("builds immutable FIRST and REPEAT presentations from the canonical T029 builder", () => {
    const first = buildForgePresentation([created, { type: "RECIPE_DISCOVERED", recipeId: created.recipeId }], "/nested/fictor/", "run:4");
    const repeat = buildForgePresentation([created], "/nested/fictor/", "run:9");

    expect(first).toMatchObject({ discovery: "FIRST", mode: "INSTANT", location: "HAND", presentationId: "run:4:forge-result:INSTANT:ore_still|still_01" });
    expect(repeat).toMatchObject({ discovery: "REPEAT", canonical: first?.canonical });
    expect(first?.canonical).toMatchObject({ recipeId: created.recipeId, cardId: created.cardId });
    expect(first?.canonical.result.artSrc).toBe("/nested/fictor/assets/cards/forge__ore_still__still_01.png");
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first?.canonical)).toBe(true);
    expect(Object.isFrozen(first?.canonical.result)).toBe(true);
  });

  it("suppresses contradictory or ambiguous event presentations", () => {
    expect(buildForgePresentation([created, { type: "RECIPE_DISCOVERED", recipeId: "ore_still|still_02" }], "/", "mismatch")).toBeNull();
    expect(buildForgePresentation([created, { type: "RECIPE_DISCOVERED", recipeId: created.recipeId }, { type: "RECIPE_DISCOVERED", recipeId: created.recipeId }], "/", "duplicate-discovery")).toBeNull();
    expect(buildForgePresentation([{ ...created, cardId: "forge__ore_still__still_02" }], "/", "card-mismatch")).toBeNull();
    expect(buildForgePresentation([created, created], "/", "ambiguous")).toBeNull();
    expect(buildForgePresentation([{ ...created, recipeId: "not-a-recipe" }], "/", "invalid")).toBeNull();
    expect(buildForgePresentation([], "/", "none")).toBeNull();
  });
});
