import { describe, expect, it } from "vitest";

import { createStillkinTrack1UiSession, type StillkinTrack1UiSession, type Track1UiForgeReview, type Track1UiProjection } from "../../src/application";
import { projectCanonicalCodex } from "../../src/application/browser/forge-codex-preview";
import { FICTOR_SAVE_V2_KEY, type StorageLike } from "../../src/persistence";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  failSet = false;
  failGet = false;
  setCalls = 0;
  getItem(key: string) { if (this.failGet) throw new Error("read"); return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failSet) throw new Error("quota"); this.setCalls += 1; this.values.set(key, value); }
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

function currentJourneyNode(projection: Track1UiProjection) {
  const current = projection.journey.filter(({ status }) => status === "CURRENT");
  expect(current).toHaveLength(1);
  return current[0];
}

function combatWithDistinctForgePair(session: StillkinTrack1UiSession, initial: Track1UiProjection) {
  let projection = enter(session, initial);
  for (let turn = 0; turn < 8 && projection.phase === "IN_COMBAT"; turn += 1) {
    if (projection.primaryAction?.kind === "START_TURN") projection = apply(session, projection.primaryAction);
    const combat = asPhase(projection, "IN_COMBAT");
    const selectable = combat.hand.filter(({ forgeSelectable }) => forgeSelectable);
    const left = selectable[0];
    const right = selectable.find(({ cardId }) => cardId !== left?.cardId);
    if (left && right) return { combat, pair: [left, right] as const };
    projection = apply(session, combat.primaryAction!);
  }
  throw new Error("combat never produced a distinct forge pair");
}

function firstDistinct<T extends { cardId: string; instanceId: string }>(items: readonly T[]): [T, T] {
  const left = items[0];
  const right = items.find(({ cardId }) => cardId !== left?.cardId);
  if (!left || !right) throw new Error("distinct material pair unavailable");
  return [left, right];
}

describe("Stillkin Track-1 browser UI session", () => {
  it("builds one canonical preview for instant, paid, free, and reversed pairs", () => {
    const instantSession = create().session;
    const { pair: [instantLeft, instantRight] } = combatWithDistinctForgePair(instantSession, instantSession.snapshot());
    const instant = instantSession.previewForge("INSTANT", [instantLeft.instanceId, instantRight.instanceId])!;
    const reversed = instantSession.previewForge("INSTANT", [instantRight.instanceId, instantLeft.instanceId])!;
    expect(reversed.canonical).toEqual(instant.canonical);
    expect(instant).toMatchObject({ cost: { kind: "ACTION", labelKo: "행동 1회" }, lifetime: "TEMPORARY" });

    const paidSession = create().session;
    const between = asPhase(paidSession.snapshot(), "BETWEEN_NODES");
    const paidLeft = between.workshopMaterials.find(({ cardId }) => cardId === instantLeft.cardId)!;
    const paidRight = between.workshopMaterials.find(({ cardId }) => cardId === instantRight.cardId)!;
    const paid = paidSession.previewForge("WORKSHOP_PAID", [paidRight.instanceId, paidLeft.instanceId])!;
    expect(paid.canonical).toEqual(instant.canonical);
    expect(paid).toMatchObject({ cost: { kind: "FUEL", fuelBefore: 4, fuelAfter: 3 }, lifetime: "PERMANENT" });
    expect(paidSession.previewForge("WORKSHOP_FREE", [paidLeft.instanceId, paidRight.instanceId])).toBeNull();
  });

  it("keeps previews current-instance-only and descriptors opaque, confirmation-only, and stale-safe", () => {
    const { storage, session } = create();
    const between = asPhase(session.snapshot(), "BETWEEN_NODES");
    const [left, right] = firstDistinct(between.workshopMaterials);
    expect(session.previewForge("INSTANT", [left.instanceId, right.instanceId])).toBeNull();
    expect(session.previewForge("WORKSHOP_PAID", [left.instanceId, "missing-instance"])).toBeNull();
    const duplicate = between.workshopMaterials.find(({ cardId, instanceId }) => cardId === left.cardId && instanceId !== left.instanceId)!;
    expect(session.previewForge("WORKSHOP_PAID", [left.instanceId, duplicate.instanceId])).toBeNull();

    const preview = session.previewForge("WORKSHOP_PAID", [left.instanceId, right.instanceId])!;
    const writesBefore = storage.setCalls;
    expect(session.dispatch(preview as unknown as Parameters<StillkinTrack1UiSession["dispatch"]>[0]).applied).toBe(false);
    expect(storage.setCalls).toBe(writesBefore);
    expect(session.reviewWorkshopForge({} as typeof preview)).toBeNull();
    const review = session.reviewWorkshopForge(preview)!;
    expect(storage.setCalls).toBe(writesBefore);
    expect(session.confirmForgeReview({} as Track1UiForgeReview)).toBeNull();
    const action = session.confirmForgeReview(review)!;
    expect(storage.setCalls).toBe(writesBefore);

    const stalePreview = session.previewForge("WORKSHOP_PAID", [left.instanceId, right.instanceId])!;
    const staleReview = session.reviewWorkshopForge(stalePreview)!;
    const applied = session.dispatch(action);
    expect(applied.applied).toBe(true);
    expect(storage.setCalls).toBe(writesBefore + 1);
    expect(session.confirmForgeReview(staleReview)).toBeNull();
    expect(session.dispatch(action).applied).toBe(false);
    expect(storage.setCalls).toBe(writesBefore + 1);
  });

  it("forges instantly into the hand, records one discovery, then reports cleanup and restoration", () => {
    const { storage, session } = create();
    const available = combatWithDistinctForgePair(session, session.snapshot());
    let projection: Track1UiProjection = available.combat;
    const [left, right] = available.pair;
    const preview = session.previewForge("INSTANT", [right.instanceId, left.instanceId])!;
    const action = session.describeInstantForgeAction(preview)!;
    projection = apply(session, action);
    const forged = asPhase(projection, "IN_COMBAT");
    expect(forged.hand.some(({ cardId }) => cardId === preview.canonical.cardId)).toBe(true);
    expect(forged.hand.some(({ instanceId }) => instanceId === left.instanceId || instanceId === right.instanceId)).toBe(false);
    expect(forged.feedback?.messageKo).toContain("전투 종료 시 결과는 사라지고 재료는 복구");
    expect(session.codexSnapshot().entries.filter(({ discovered }) => discovered)).toHaveLength(1);

    projection = winCombat(session, projection);
    expect(projection.feedback?.messageKo).toContain("즉석 결과가 사라지고 사용한 재료가 덱으로 복구");
    const envelope = JSON.parse(storage.values.get(FICTOR_SAVE_V2_KEY)!);
    expect(envelope.runtime.run.activeCombat).toBeNull();
    expect(envelope.runtime.run.deck).toEqual(expect.arrayContaining([left.instanceId, right.instanceId]));
    expect(envelope.runtime.run.ownedInstances.some(({ cardId }: { cardId: string }) => cardId === preview.canonical.cardId)).toBe(false);
  });

  it("derives a lexical 1326-entry masked Codex without exposing heart forge", () => {
    const all = projectCanonicalCodex("/preview/subpath/");
    expect(all).toHaveLength(1326);
    expect(new Set(all.map(({ recipeId }) => recipeId)).size).toBe(1326);
    expect(all.map(({ recipeId }) => recipeId)).toEqual([...all.map(({ recipeId }) => recipeId)].sort());
    const { storage, session } = create();
    let codex = session.codexSnapshot();
    expect(codex).toMatchObject({ total: 1326, pageSize: 48, discoveredCount: 0 });
    expect(codex.entries).toHaveLength(1326);
    expect(new Set(codex.entries.map(({ entryKey }) => entryKey)).size).toBe(1326);
    expect(codex.entries.every(({ recipeId, preview, discovered }) => !discovered && recipeId === null && preview === null)).toBe(true);
    expect(session.snapshot().featureFlags.heartForge).toBe(false);

    const between = asPhase(session.snapshot(), "BETWEEN_NODES");
    const [left, right] = firstDistinct(between.workshopMaterials);
    const preview = session.previewForge("WORKSHOP_PAID", [left.instanceId, right.instanceId])!;
    const review = session.reviewWorkshopForge(preview)!;
    apply(session, session.confirmForgeReview(review)!);
    codex = session.codexSnapshot();
    expect(codex.discoveredCount).toBe(1);
    expect(codex.entries.filter(({ discovered }) => discovered)).toEqual([
      expect.objectContaining({ recipeId: preview.canonical.recipeId, discoverySources: ["INSTANT", "WORKSHOP"] }),
    ]);
    const reloaded = createStillkinTrack1UiSession({ storage, baseUrl: "/preview/subpath/", generationFactory: () => "reloaded-generation" });
    reloaded.load();
    expect(reloaded.codexSnapshot().entries.filter(({ discovered }) => discovered)).toHaveLength(1);
  });

  it("disables paid forging at fuel zero while a real free entitlement remains executable", () => {
    const { session } = create();
    let projection: Track1UiProjection = session.snapshot();
    for (let expectedFuel = 3; expectedFuel >= 0; expectedFuel -= 1) {
      const between = asPhase(projection, "BETWEEN_NODES");
      const [left, right] = firstDistinct(between.workshopMaterials);
      const preview = session.previewForge("WORKSHOP_PAID", [left.instanceId, right.instanceId])!;
      const beforeDeck = between.stats.deckCount;
      projection = apply(session, session.confirmForgeReview(session.reviewWorkshopForge(preview)!)!);
      expect(projection.stats.fuel).toBe(expectedFuel);
      expect(projection.stats.deckCount).toBe(beforeDeck - 1);
    }
    const exhausted = asPhase(projection, "BETWEEN_NODES");
    expect(exhausted.paidWorkshopEnabled).toBe(false);
    expect(exhausted.paidWorkshopDisabledReasonKo).toContain("연료");
    const [left, right] = firstDistinct(exhausted.workshopMaterials);
    const disabledPreview = session.previewForge("WORKSHOP_PAID", [left.instanceId, right.instanceId])!;
    expect(disabledPreview).toMatchObject({ executable: false, cost: { fuelBefore: 0, fuelAfter: 0 } });
    expect(session.reviewWorkshopForge(disabledPreview)).toBeNull();

    projection = winCombat(session, enter(session, projection));
    projection = apply(session, asPhase(projection, "AWAITING_REWARD").choices[0].action);
    projection = resolveAndLeave(session, enter(session, projection));
    projection = enter(session, projection);
    projection = apply(session, asPhase(projection, "IN_EVENT").choices[0].action);
    const free = asPhase(projection, "EVENT_RESOLVED");
    const [freeLeft, freeRight] = firstDistinct(free.workshopMaterials);
    const freePreview = session.previewForge("WORKSHOP_FREE", [freeLeft.instanceId, freeRight.instanceId])!;
    expect(freePreview).toMatchObject({ executable: true, cost: { kind: "FREE_ENTITLEMENT", fuelBefore: 0, fuelAfter: 0 } });
    projection = apply(session, session.confirmForgeReview(session.reviewWorkshopForge(freePreview)!)!);
    expect(projection.stats.fuel).toBe(0);
    expect(asPhase(projection, "EVENT_RESOLVED").leaveAction).not.toBeNull();
  });
  it("plays the real first combat through reward, cache, free workshop picker, and next encounter", () => {
    const { session } = create();
    const between = session.snapshot();
    expect(currentJourneyNode(between).nodeId).toBe("d1-normal-swarm");
    expect(between.journey.filter(({ status }) => status === "COMPLETED")).toHaveLength(0);
    let projection = enter(session, between);
    let combat = asPhase(projection, "IN_COMBAT");
    expect(currentJourneyNode(combat).nodeId).toBe("d1-normal-swarm");
    expect(combat.journey.find(({ nodeId }) => nodeId === "d1-cache")?.status).toBe("UPCOMING");
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
    const pair = workshop.workshopMaterials.find(({ cardId }) => cardId === "ore_still");
    const other = workshop.workshopMaterials.find(({ cardId }) => cardId === "still_03");
    expect(pair).toBeDefined();
    expect(other).toBeDefined();
    expect(session.previewForge("WORKSHOP_FREE", [pair!.instanceId])).toBeNull();
    const duplicate = workshop.workshopMaterials.find(({ cardId, instanceId }) => cardId === pair!.cardId && instanceId !== pair!.instanceId);
    expect(session.previewForge("WORKSHOP_FREE", [pair!.instanceId, duplicate?.instanceId ?? pair!.instanceId])).toBeNull();
    const freePreview = session.previewForge("WORKSHOP_FREE", [pair!.instanceId, other!.instanceId]);
    expect(freePreview).not.toBeNull();
    const freeReview = session.reviewWorkshopForge(freePreview!);
    expect(freeReview).not.toBeNull();
    const freeForge = session.confirmForgeReview(freeReview!);
    expect(freeForge).not.toBeNull();
    projection = apply(session, freeForge!);
    workshop = asPhase(projection, "EVENT_RESOLVED");
    expect(workshop.workshopMaterials).toHaveLength(0);
    projection = apply(session, workshop.leaveAction!);

    projection = enter(session, projection);
    combat = asPhase(projection, "IN_COMBAT");
    expect(combat.enemy.id).toBe("elite__still__burn");
    let fallbackCard: Extract<Track1UiProjection, { phase: "IN_COMBAT" }>["hand"][number] | undefined;
    for (let turns = 0; turns < 12 && combat.phase === "IN_COMBAT"; turns += 1) {
      if (combat.primaryAction?.kind === "START_TURN") combat = asPhase(apply(session, combat.primaryAction), "IN_COMBAT");
      fallbackCard = combat.hand.find(({ cardId }) => cardId === "forge__ore_still__still_03");
      if (fallbackCard) break;
      if (!combat.primaryAction) break;
      const advanced = apply(session, combat.primaryAction);
      if (advanced.phase !== "IN_COMBAT") break;
      combat = advanced;
    }
    expect(fallbackCard).toMatchObject({
      cardId: "forge__ore_still__still_03",
      artSrc: "/preview/subpath/assets/cards/ore_still.png",
      artFallbackLabelKo: "굳은 조각 재료 도판",
    });
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

  it("latches a blocking projection when active-run bytes become corrupt, unsupported, or unreadable", () => {
    for (const mutation of [
      () => "{bad",
      (bytes: string) => JSON.stringify({ ...JSON.parse(bytes), schemaVersion: "fictor-save-v999" }),
    ]) {
      const storage = new MemoryStorage();
      const created = create(storage, `runtime-block-${storage.values.size}`);
      const combat = asPhase(enter(created.session, created.projection), "IN_COMBAT");
      const original = storage.values.get(FICTOR_SAVE_V2_KEY)!;
      const poisoned = mutation(original);
      storage.values.set(FICTOR_SAVE_V2_KEY, poisoned);
      const rejected = created.session.dispatch(combat.primaryAction!);
      expect(rejected.applied).toBe(false);
      expect(rejected.projection.phase).toBe("BLOCKED");
      expect(storage.values.get(FICTOR_SAVE_V2_KEY)).toBe(poisoned);
      expect(created.session.dispatch(combat.primaryAction!).projection.phase).toBe("BLOCKED");
    }

    const storage = new MemoryStorage();
    const created = create(storage, "runtime-read-block");
    const combat = asPhase(enter(created.session, created.projection), "IN_COMBAT");
    storage.failGet = true;
    const rejected = created.session.dispatch(combat.primaryAction!);
    expect(rejected.applied).toBe(false);
    expect(rejected.projection.phase).toBe("BLOCKED");
    expect((rejected.projection as Extract<Track1UiProjection, { phase: "BLOCKED" }>).issuesKo).toContain("브라우저 저장소를 읽을 수 없습니다.");
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
    expect(currentJourneyNode(lost).nodeId).toBe("d1-normal-swarm");
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
    const preview = session.previewForge("WORKSHOP_FREE", [left.instanceId, right.instanceId])!;
    projection = apply(session, session.confirmForgeReview(session.reviewWorkshopForge(preview)!)!);
    projection = apply(session, (projection as Extract<Track1UiProjection, { phase: "EVENT_RESOLVED" }>).leaveAction!);
    projection = winCombat(session, enter(session, projection)); // elite
    projection = apply(session, (projection as Extract<Track1UiProjection, { phase: "AWAITING_REWARD" }>).choices[1].action);
    projection = resolveAndLeave(session, enter(session, projection)); // collapse
    projection = enter(session, projection); // FICTOR
    const fictor = asPhase(projection, "IN_EVENT");
    expect(fictor.eventType).toBe("FICTOR");
    expect(currentJourneyNode(fictor).nodeId).toBe("d2-fictor");
    expect(fictor.journey.filter(({ status }) => status === "COMPLETED").map(({ nodeId }) => nodeId)).toEqual([
      "d1-normal-swarm",
      "d1-cache",
      "d1-workshop",
      "d2-elite",
      "d2-collapse",
    ]);
    expect(fictor.journey.find(({ nodeId }) => nodeId === "d2-record")?.status).toBe("UPCOMING");
    const fuel = fictor.stats.fuel;
    const skip = fictor.choices.find(({ choiceId }) => choiceId === "fictor-skip");
    expect(fictor.choices.filter(({ choiceId }) => choiceId !== "fictor-skip").map(({ price }) => price)).toEqual([1, 1, 1]);
    expect(skip).toBeDefined();
    expect(skip?.price).toBe(0);
    projection = apply(session, skip!.action);
    expect(projection.phase).toBe("EVENT_RESOLVED");
    expect(projection.stats.fuel).toBe(fuel);
  });
});
