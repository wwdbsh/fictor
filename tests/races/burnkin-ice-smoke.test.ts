import { describe, expect, it } from "vitest";

import {
  createStillkinTrack1UiSession,
  type StillkinTrack1UiSession,
  type Track1UiProjection,
} from "../../src/application";
import type { StorageLike } from "../../src/persistence";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function apply(session: StillkinTrack1UiSession, action: Parameters<StillkinTrack1UiSession["dispatch"]>[0]) {
  const result = session.dispatch(action);
  expect(result.applied, result.projection.feedback?.messageKo).toBe(true);
  return result.projection;
}

function winCombat(session: StillkinTrack1UiSession, initial: Track1UiProjection) {
  let projection = initial;
  for (let step = 0; step < 1_000 && projection.phase === "IN_COMBAT"; step += 1) {
    if (projection.primaryAction?.kind === "START_TURN") projection = apply(session, projection.primaryAction);
    else {
      const card = projection.hand.find(({ action }) => action && !action.disabled);
      projection = card?.action ? apply(session, card.action) : apply(session, projection.primaryAction!);
    }
  }
  return projection;
}

describe("Burnkin ice vertical-slice smoke", () => {
  it("selects Burnkin rules and completes the existing fixed ice journey once", () => {
    const session = createStillkinTrack1UiSession({
      storage: new MemoryStorage(),
      baseUrl: "/burnkin-smoke/",
      generationFactory: () => "burnkin-ui-smoke-generation",
      raceId: "Burnkin",
    });
    let projection = session.load();
    expect(projection).toMatchObject({ raceId: "Burnkin", raceLabelKo: "사름붙이" });

    for (let step = 0; step < 2_000 && projection.phase !== "RUN_WON"; step += 1) {
      if (projection.phase === "BETWEEN_NODES") projection = apply(session, projection.action);
      else if (projection.phase === "IN_COMBAT") {
        if (projection.turn === 0) expect(projection.burnkinRulesKo).toContain("공명 2배");
        projection = winCombat(session, projection);
      } else if (projection.phase === "AWAITING_REWARD") projection = apply(session, projection.choices[0].action);
      else if (projection.phase === "IN_EVENT") {
        const choice = projection.choices.find(({ price }) => price === 0) ?? projection.choices[0];
        projection = apply(session, choice.action);
      } else if (projection.phase === "EVENT_RESOLVED") {
        if (projection.workshopMaterials.length > 0) {
          const left = projection.workshopMaterials[0];
          const right = projection.workshopMaterials.find(({ cardId }) => cardId !== left.cardId)!;
          const preview = session.previewForge("WORKSHOP_FREE", [left.instanceId, right.instanceId])!;
          const review = session.reviewWorkshopForge(preview)!;
          projection = apply(session, session.confirmForgeReview(review)!);
        }
        if (projection.phase === "EVENT_RESOLVED" && projection.leaveAction) projection = apply(session, projection.leaveAction);
      } else if (projection.phase === "RUN_LOST") throw new Error("Burnkin UI smoke lost before boss completion");
    }

    expect(projection.phase).toBe("RUN_WON");
    if (projection.phase !== "RUN_WON") throw new Error(`expected RUN_WON, received ${projection.phase}`);
    expect(projection.raceId).toBe("Burnkin");
    expect(projection.messageKo).toContain("신의 심장");
  });
});
