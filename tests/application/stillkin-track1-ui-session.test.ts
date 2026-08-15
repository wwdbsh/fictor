import { describe, expect, it } from "vitest";

import { createStillkinTrack1UiSession, type StillkinTrack1UiSession, type Track1UiProjection } from "../../src/application";
import { FICTOR_SAVE_V2_KEY, type StorageLike } from "../../src/persistence";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  failSet = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failSet) throw new Error("quota"); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function create(storage = new MemoryStorage(), generation = "browser-session-generation") {
  const session = createStillkinTrack1UiSession({ storage, baseUrl: "/preview/subpath/", generationFactory: () => generation });
  return { storage, session, projection: session.load() };
}

function apply(session: StillkinTrack1UiSession, action: Parameters<StillkinTrack1UiSession["dispatch"]>[0]): Track1UiProjection {
  const result = session.dispatch(action);
  expect(result.applied, result.projection.feedback?.messageKo).toBe(true);
  return result.projection;
}

function asPhase<P extends Track1UiProjection["phase"]>(projection: Track1UiProjection, expected: P): Extract<Track1UiProjection, { phase: P }> {
  expect(projection.phase).toBe(expected);
  if (projection.phase !== expected) throw new Error(`expected ${expected}, received ${projection.phase}`);
  return projection as Extract<Track1UiProjection, { phase: P }>;
}

function enter(session: StillkinTrack1UiSession, projection: Track1UiProjection): Track1UiProjection {
  expect(projection.phase).toBe("BETWEEN_NODES");
  return apply(session, (projection as Extract<Track1UiProjection, { phase: "BETWEEN_NODES" }>).action);
}

function winCombat(session: StillkinTrack1UiSession, initial: Track1UiProjection): Track1UiProjection {
  let projection = initial;
  let steps = 0;
  while (projection.phase === "IN_COMBAT") {
    expect(steps++).toBeLessThan(1_000);
    if (projection.primaryAction?.kind === "START_TURN") {
      projection = apply(session, projection.primaryAction);
      continue;
    }
    const card = projection.hand.find(({ action }) => action && !action.disabled);
    projection = card?.action ? apply(session, card.action) : apply(session, projection.primaryAction!);
  }
  return projection;
}

function resolveAndLeave(session: StillkinTrack1UiSession, projection: Track1UiProjection, choiceIndex = 0): Track1UiProjection {
  const event = asPhase(projection, "IN_EVENT");
  projection = apply(session, event.choices[choiceIndex].action);
  if (projection.phase === "EVENT_RESOLVED" && projection.leaveAction) projection = apply(session, projection.leaveAction);
  return projection;
}

describe("Stillkin Track-1 browser UI session", () => {
  it("plays the real first combat through reward, cache, free workshop picker, and next encounter", () => {
    const { session } = create();
    let projection = enter(session, session.snapshot());
    let combat = asPhase(projection, "IN_COMBAT");
    expect(combat.backgroundSrc).toBe("/preview/subpath/assets/backgrounds/background__still__depth_01.png");
    expect(combat.enemy.artSrc).toBe("/preview/subpath/assets/enemies/enemy__still__swarm.png");

    projection = winCombat(session, projection);
    const reward = asPhase(projection, "AWAITING_REWARD");
    expect(reward.choices).toHaveLength(3);
    projection = apply(session, reward.choices[0].action);

    projection = enter(session, projection);
    expect(asPhase(projection, "IN_EVENT").eventType).toBe("CACHE");
    projection = resolveAndLeave(session, projection);

    projection = enter(session, projection);
    const workshopEvent = asPhase(projection, "IN_EVENT");
    expect(workshopEvent.eventType).toBe("WORKSHOP");
    projection = apply(session, workshopEvent.choices[0].action);
    let workshop = asPhase(projection, "EVENT_RESOLVED");
    const pair = workshop.workshopMaterials.find((left) => workshop.workshopMaterials.some((right) => right.cardId !== left.cardId));
    expect(pair).toBeDefined();
    const other = workshop.workshopMaterials.find(({ cardId }) => cardId !== pair!.cardId)!;
    expect(session.describeWorkshopAction([pair!.instanceId])).toBeNull();
    const duplicate = workshop.workshopMaterials.find(({ cardId, instanceId }) => cardId === pair!.cardId && instanceId !== pair!.instanceId);
    expect(session.describeWorkshopAction([pair!.instanceId, duplicate?.instanceId ?? pair!.instanceId])).toBeNull();
    const freeForge = session.describeWorkshopAction([pair!.instanceId, other.instanceId]);
    expect(freeForge).not.toBeNull();
    projection = apply(session, freeForge!);
    workshop = asPhase(projection, "EVENT_RESOLVED");
    expect(workshop.workshopMaterials).toHaveLength(0);
    projection = apply(session, workshop.leaveAction!);

    projection = enter(session, projection);
    combat = asPhase(projection, "IN_COMBAT");
    expect(combat.enemy.id).toBe("elite__still__burn");
  });

  it("preserves the accepted snapshot across write and stale-write failures", () => {
    const storage = new MemoryStorage();
    const first = create(storage, "first-generation");
    const stale = create(storage, "second-generation");
    const staleAction = (stale.projection as Extract<Track1UiProjection, { phase: "BETWEEN_NODES" }>).action;
    const accepted = first.session.dispatch((first.projection as Extract<Track1UiProjection, { phase: "BETWEEN_NODES" }>).action);
    expect(accepted.applied).toBe(true);
    const rejected = stale.session.dispatch(staleAction);
    expect(rejected.applied).toBe(false);
    expect(rejected.projection.phase).toBe("BETWEEN_NODES");
    expect(rejected.projection.feedback).toMatchObject({ tone: "ERROR" });

    const failing = create(new MemoryStorage(), "write-failure");
    (failing.storage as MemoryStorage).failSet = true;
    const writeRejected = failing.session.dispatch((failing.projection as Extract<Track1UiProjection, { phase: "BETWEEN_NODES" }>).action);
    expect(writeRejected.applied).toBe(false);
    expect(writeRejected.projection.phase).toBe("BETWEEN_NODES");
  });

  it("blocks and preserves corrupt and unsupported saves", () => {
    for (const bytes of ["{bad", JSON.stringify({ schemaVersion: 999 })]) {
      const storage = new MemoryStorage();
      storage.values.set(FICTOR_SAVE_V2_KEY, bytes);
      const { projection } = create(storage);
      expect(projection.phase).toBe("BLOCKED");
      expect(projection.feedback).toMatchObject({ tone: "ERROR" });
      expect(storage.values.get(FICTOR_SAVE_V2_KEY)).toBe(bytes);
    }
  });

  it("supports defeat and restart using only bound UI actions", () => {
    const { session } = create();
    let projection = enter(session, session.snapshot());
    let turns = 0;
    while (projection.phase === "IN_COMBAT") {
      expect(turns++).toBeLessThan(100);
      projection = apply(session, projection.primaryAction!);
    }
    const lost = asPhase(projection, "RUN_LOST");
    const previousKey = lost.screenKey;
    projection = apply(session, lost.action);
    expect(projection.phase).toBe("BETWEEN_NODES");
    expect(projection.screenKey).not.toBe(previousKey);
    expect(projection.stats.hp).toBe(projection.stats.maxHp);
  });

  it("reaches FICTOR and exposes the explicit zero-cost skip path", () => {
    const { session } = create();
    let projection: Track1UiProjection = session.snapshot();
    projection = winCombat(session, enter(session, projection));
    projection = apply(session, (projection as Extract<Track1UiProjection, { phase: "AWAITING_REWARD" }>).choices[0].action);
    projection = resolveAndLeave(session, enter(session, projection)); // cache
    projection = enter(session, projection); // workshop
    projection = apply(session, (projection as Extract<Track1UiProjection, { phase: "IN_EVENT" }>).choices[0].action);
    const workshop = projection as Extract<Track1UiProjection, { phase: "EVENT_RESOLVED" }>;
    const left = workshop.workshopMaterials[0];
    const right = workshop.workshopMaterials.find(({ cardId }) => cardId !== left.cardId)!;
    projection = apply(session, session.describeWorkshopAction([left.instanceId, right.instanceId])!);
    projection = apply(session, (projection as Extract<Track1UiProjection, { phase: "EVENT_RESOLVED" }>).leaveAction!);
    projection = winCombat(session, enter(session, projection)); // elite
    projection = apply(session, (projection as Extract<Track1UiProjection, { phase: "AWAITING_REWARD" }>).choices[1].action);
    projection = resolveAndLeave(session, enter(session, projection)); // collapse
    projection = enter(session, projection); // FICTOR
    const fictor = asPhase(projection, "IN_EVENT");
    expect(fictor.eventType).toBe("FICTOR");
    const fuel = fictor.stats.fuel;
    const skip = fictor.choices.find(({ choiceId }) => choiceId === "fictor-skip");
    expect(skip).toBeDefined();
    projection = apply(session, skip!.action);
    expect(projection.phase).toBe("EVENT_RESOLVED");
    expect(projection.stats.fuel).toBe(fuel);
  });
});
