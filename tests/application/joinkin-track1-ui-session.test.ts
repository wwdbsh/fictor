import { describe, expect, it } from "vitest";

import {
  createStillkinTrack1UiSession,
  JOINKIN_TRACK1_SAVE_KEY,
  type StillkinTrack1UiSession,
  type Track1UiProjection,
} from "../../src/application";
import type { StorageLike } from "../../src/persistence";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  failSet = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failSet) throw new Error("quota"); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function create(storage = new MemoryStorage(), generation = "joinkin-ui-generation") {
  const session = createStillkinTrack1UiSession({ storage, baseUrl: "/joinkin/", generationFactory: () => generation, raceId: "Joinkin" });
  return { storage, session, projection: session.load() };
}

function phase<P extends Track1UiProjection["phase"]>(projection: Track1UiProjection, expected: P): Extract<Track1UiProjection, { phase: P }> {
  expect(projection.phase).toBe(expected);
  return projection as Extract<Track1UiProjection, { phase: P }>;
}

function apply(session: StillkinTrack1UiSession, action: Parameters<StillkinTrack1UiSession["dispatch"]>[0]) {
  const result = session.dispatch(action);
  expect(result.applied, result.projection.feedback?.messageKo).toBe(true);
  return result;
}

function distinctTriple<T extends { cardId: string; instanceId: string; category?: string }>(items: readonly T[]): [T, T, T] {
  for (let first = 0; first < items.length; first += 1) for (let second = first + 1; second < items.length; second += 1) {
    if (items[first].cardId === items[second].cardId || (items[first].category === "TOOL" && items[second].category === "TOOL")) continue;
    const third = items.find((item, index) => index !== first && index !== second && item.cardId !== items[first].cardId && item.cardId !== items[second].cardId);
    if (third) return [items[first], items[second], third];
  }
  throw new Error("Joinkin triple unavailable");
}

function winCombat(session: StillkinTrack1UiSession, initial: Track1UiProjection): Track1UiProjection {
  let projection = initial;
  for (let step = 0; step < 1_000 && projection.phase === "IN_COMBAT"; step += 1) {
    if (projection.primaryAction?.kind === "START_TURN") projection = apply(session, projection.primaryAction).projection;
    else {
      const card = projection.hand.find(({ action }) => action && !action.disabled);
      projection = card?.action ? apply(session, card.action).projection : apply(session, projection.primaryAction!).projection;
    }
  }
  return projection;
}

describe("Joinkin Track 1 browser session", () => {
  it("keeps A/B canonical while exposing C as an honest per-instance overlay in all three modes", () => {
    const paid = create();
    const between = phase(paid.projection, "BETWEEN_NODES");
    const [a, b, c] = distinctTriple(between.workshopMaterials);
    const preview = paid.session.previewForge("WORKSHOP_PAID", [a.instanceId, b.instanceId, c.instanceId])!;
    const reversed = paid.session.previewForge("WORKSHOP_PAID", [b.instanceId, a.instanceId, c.instanceId])!;
    const cAsBase = paid.session.previewForge("WORKSHOP_PAID", [a.instanceId, c.instanceId, b.instanceId])!;
    expect(preview).toMatchObject({ requiredMaterialCount: 3, cost: { kind: "FUEL", fuelBefore: 4, fuelAfter: 3 }, lifetime: "PERMANENT" });
    expect(preview.canonical).toEqual(reversed.canonical);
    expect(preview.canonical.recipeId).not.toBe(cAsBase.canonical.recipeId);
    expect(preview.thirdOverlay).toMatchObject({ materialId: c.cardId, labelKo: "JOIN 공명 오버레이" });
    expect(paid.session.previewForge("WORKSHOP_PAID", [a.instanceId, b.instanceId])).toBeNull();

    const instant = create(new MemoryStorage(), "joinkin-instant");
    let combat = apply(instant.session, phase(instant.projection, "BETWEEN_NODES").action).projection;
    combat = apply(instant.session, phase(combat, "IN_COMBAT").primaryAction!).projection;
    const hand = phase(combat, "IN_COMBAT");
    const [ia, ib, ic] = distinctTriple(hand.hand.filter(({ forgeSelectable }) => forgeSelectable));
    const instantPreview = instant.session.previewForge("INSTANT", [ia.instanceId, ib.instanceId, ic.instanceId])!;
    expect(instantPreview).toMatchObject({ requiredMaterialCount: 3, cost: { kind: "ACTION" }, lifetime: "TEMPORARY", thirdOverlay: { materialId: ic.cardId } });
    const forged = apply(instant.session, instant.session.describeInstantForgeAction(instantPreview)!);
    expect(phase(forged.projection, "IN_COMBAT").hand.some(({ cardId }) => cardId === instantPreview.canonical.cardId)).toBe(true);
    expect(instant.session.codexSnapshot()).toMatchObject({ total: 1326, discoveredCount: 1 });
  });

  it("requires confirmation, rejects stale capabilities, and rolls back a failed persisted paid forge", () => {
    const first = create();
    const between = phase(first.projection, "BETWEEN_NODES");
    const [a, b, c] = distinctTriple(between.workshopMaterials);
    const preview = first.session.previewForge("WORKSHOP_PAID", [a.instanceId, b.instanceId, c.instanceId])!;
    const review = first.session.reviewWorkshopForge(preview)!;
    expect(review.warningKo).toContain("세 재료");
    expect(first.session.dispatch(preview as never).applied).toBe(false);
    expect(first.session.confirmForgeReview({} as typeof review)).toBeNull();
    const action = first.session.confirmForgeReview(review)!;
    const applied = apply(first.session, action);
    expect(applied.projection.stats).toMatchObject({ fuel: 3, deckCount: 28 });
    expect(applied.projection.feedback?.messageKo).toContain("세 재료 소모");
    expect(first.session.confirmForgeReview(review)).toBeNull();

    const storage = new MemoryStorage();
    const failing = create(storage, "joinkin-write-failure");
    const original = phase(failing.projection, "BETWEEN_NODES");
    const [fa, fb, fc] = distinctTriple(original.workshopMaterials);
    const failedPreview = failing.session.previewForge("WORKSHOP_PAID", [fa.instanceId, fb.instanceId, fc.instanceId])!;
    const failedAction = failing.session.confirmForgeReview(failing.session.reviewWorkshopForge(failedPreview)!)!;
    storage.failSet = true;
    const rejected = failing.session.dispatch(failedAction);
    expect(rejected).toMatchObject({ applied: false, forgePresentation: null });
    expect(rejected.projection.stats).toEqual(original.stats);
    expect(rejected.projection.codexDiscoveredCount).toBe(0);
  });

  it("uses one free entitlement atomically, keeps fuel unchanged, reloads, and completes the full ice route", () => {
    const { storage, session } = create();
    let projection: Track1UiProjection = session.snapshot();
    let usedFree = false;
    for (let step = 0; step < 2_500 && projection.phase !== "RUN_WON"; step += 1) {
      if (projection.phase === "BETWEEN_NODES") projection = apply(session, projection.action).projection;
      else if (projection.phase === "IN_COMBAT") projection = winCombat(session, projection);
      else if (projection.phase === "AWAITING_REWARD") projection = apply(session, (projection.choices.find(({ kindLabelKo }) => kindLabelKo !== "도구") ?? projection.choices[0]).action).projection;
      else if (projection.phase === "IN_EVENT") {
        const choice = projection.choices.find(({ price }) => price === 0) ?? projection.choices[0];
        projection = apply(session, choice.action).projection;
      } else if (projection.phase === "EVENT_RESOLVED") {
        if (projection.workshopMaterials.length > 0) {
          const beforeFuel = projection.stats.fuel;
          const beforeDeck = projection.stats.deckCount;
          const [a, b, c] = distinctTriple(projection.workshopMaterials);
          const preview = session.previewForge("WORKSHOP_FREE", [a.instanceId, b.instanceId, c.instanceId])!;
          expect(preview).toMatchObject({ cost: { kind: "FREE_ENTITLEMENT", fuelBefore: beforeFuel, fuelAfter: beforeFuel } });
          projection = apply(session, session.confirmForgeReview(session.reviewWorkshopForge(preview)!)!).projection;
          expect(projection.stats).toMatchObject({ fuel: beforeFuel, deckCount: beforeDeck - 2 });
          expect(phase(projection, "EVENT_RESOLVED").workshopMaterials).toHaveLength(0);
          usedFree = true;
        }
        if (projection.phase === "EVENT_RESOLVED" && projection.leaveAction) projection = apply(session, projection.leaveAction).projection;
      } else if (projection.phase === "RUN_LOST") throw new Error("Joinkin route lost before completion");
    }
    expect(usedFree).toBe(true);
    expect(projection).toMatchObject({ phase: "RUN_WON", raceId: "Joinkin" });
    expect(storage.values.has(JOINKIN_TRACK1_SAVE_KEY)).toBe(true);
    const reloaded = createStillkinTrack1UiSession({ storage, baseUrl: "/joinkin/", raceId: "Joinkin" }).load();
    expect(reloaded).toMatchObject({ phase: "RUN_WON", raceId: "Joinkin" });
  });
});
