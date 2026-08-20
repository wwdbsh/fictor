import { resolveForgeCard, type GeneratedCard } from "../../domain/forge";
import type { ForgeResolverContextV1 } from "../../domain/forge-runtime";
import type { StorageLike } from "../../persistence";
import { BURNKIN_TRACK1_RULES, createTrack1Controller, STILLKIN_TRACK1_PROVISIONAL_CONFIG as CONFIG } from "../run";
import type { StillkinTrack1Command, StillkinTrack1Snapshot, Track1RaceId } from "../run";
import { BROWSER_RUNTIME_PACKET } from "./runtime-packet.generated";
import { browserPacketHasCanonicalArt, type BrowserMaterialDisplay } from "./runtime-packet";
import { buildCanonicalForgePreview, buildThirdOverlayPreview, projectCanonicalCodex } from "./forge-codex-preview";
import { buildForgePresentation } from "./forge-result-presentation";
import type {
  StillkinTrack1UiSession,
  Track1UiActionDescriptor,
  Track1UiActionKind,
  Track1UiCard,
  Track1UiDispatchResult,
  Track1UiEventChoice,
  Track1UiForgeMaterial,
  Track1UiForgeMode,
  Track1UiForgePreview,
  Track1UiForgeReview,
  Track1UiJourneyNode,
  Track1UiProjection,
  Track1UiRewardChoice,
} from "./ui-types";

export interface StillkinTrack1UiSessionOptions {
  readonly storage: StorageLike;
  readonly baseUrl: string;
  readonly generationFactory?: () => string;
  readonly raceId?: Track1RaceId;
}

type Feedback = null | { tone: "STATUS" | "ERROR"; messageKo: string };

const EVENT_COPY: Record<string, { title: string; description: string; art: string }> = {
  CACHE: { title: "조각 무더기", description: "얼음 아래 남은 조각을 살핍니다.", art: "events/event__cache__still.png" },
  WORKSHOP: { title: "버려진 공방", description: "한 번의 빚기를 연료 없이 마칠 수 있습니다.", art: "events/event__workshop.png" },
  COLLAPSE: { title: "무너진 갱도", description: "남은 길을 조사합니다.", art: "events/event__collapse.png" },
  FICTOR: { title: "다른 빚는 자", description: "연료와 기록을 교환합니다.", art: "events/event__fictor.png" },
  RECORD: { title: "옛 기록", description: "남겨진 빚기 기록을 읽습니다.", art: "events/event__record.png" },
  ODDITY: { title: "이상한 것", description: "형태가 어긋난 조각이 놓여 있습니다.", art: "events/event__oddity__still.png" },
};
const EVENT_CHOICE_LABELS: Record<string, string> = {
  "take-cache": "조각 가져가기",
  "use-workshop": "공방 살피기",
  "risk-collapse": "갱도 조사하기",
  "fictor-still-04": "굳은 숨 받기",
  "fictor-tool-02": "집게 받기",
  "fictor-recipe": "제법 기록 읽기",
  "fictor-skip": "아무것도 고르지 않고 떠나기",
  "read-record": "기록 읽기",
  "take-oddity": "이상한 것 가져가기",
};
const ENEMY_NAMES: Record<string, string> = {
  enemy__still__swarm: "얼어붙은 무리",
  elite__still__burn: "눌린 불의 잔해",
  the_stilling: "어름, 처음 멈춘 신",
};
const ISSUE_MESSAGES: Record<string, string> = {
  INVALID_JSON: "저장 기록의 형식을 읽을 수 없습니다.",
  UNSUPPORTED_VERSION: "현재 빌드에서 지원하지 않는 저장 기록입니다.",
  INVALID_ENVELOPE: "저장 기록의 바깥 구조가 손상되었습니다.",
  INVALID_PROFILE: "영구 기록이 손상되었습니다.",
  INVALID_RUN: "진행 중인 런 기록이 손상되었습니다.",
  READ_FAILED: "브라우저 저장소를 읽을 수 없습니다.",
};
const FAILURE_MESSAGES: Record<string, string> = {
  INVALID_ACTION: "현재 화면에서 사용할 수 없는 행동입니다.",
  INVALID_PHASE: "지금은 그 행동을 할 수 없습니다.",
  STALE_REVISION: "화면이 오래되었습니다. 최신 기록을 다시 표시했습니다.",
  STALE_RUN: "다른 런의 행동은 적용할 수 없습니다.",
  STALE_WRITE: "다른 탭에서 저장 기록이 바뀌었습니다. 이 행동은 되돌렸습니다.",
  WRITE_FAILED: "진행 기록을 저장하지 못해 이 행동을 되돌렸습니다.",
  WRITE_BLOCKED: "손상되거나 지원하지 않는 기록을 보존하고 있어 저장이 차단되었습니다.",
  PERSISTENCE_FAILED: "진행 기록을 저장하지 못해 이 행동을 되돌렸습니다.",
  RUNTIME_REJECTED: "게임 규칙이 이 행동을 받아들이지 않았습니다.",
  INSUFFICIENT_HP: "지불 뒤에도 체력이 남아 있어야 합니다.",
  ENERGY_CAP_EXCEEDED: "에너지가 가득 차 있어 태울 수 없습니다.",
  RACE_COMMAND_UNAVAILABLE: "선택한 붙이에게 없는 행동입니다.",
  INSUFFICIENT_FUEL: "연료가 부족합니다.",
  WORKSHOP_SELECTION_INVALID: "서로 다른 재료 두 장을 골라야 합니다.",
  JOINKIN_EXTEND_UNAVAILABLE: "이어붙이기는 턴마다 빚기 행동이 남아 있을 때 한 번만 쓸 수 있습니다.",
};

function normalizedBaseUrl(value: string): string {
  const base = value.trim() || "./";
  return base.endsWith("/") ? base : `${base}/`;
}

function assetUrl(baseUrl: string, path: string): string {
  return `${baseUrl}assets/${path.replace(/^\/+/, "")}`;
}

function routeNode(snapshot: StillkinTrack1Snapshot) {
  return snapshot.flow.currentNodeIndex === null ? null : CONFIG.route[snapshot.flow.currentNodeIndex] ?? null;
}

function currentDepth(snapshot: StillkinTrack1Snapshot): 1 | 2 | 3 {
  const current = routeNode(snapshot);
  if (current) return current.depth;
  const next = CONFIG.route[snapshot.flow.nextNodeIndex];
  return next?.depth ?? 3;
}

function nodeLabel(node: (typeof CONFIG.route)[number]): string {
  if (node.kind === "ENCOUNTER") {
    if (node.encounterKind === "BOSS") return "옛 신의 잔영";
    if (node.encounterKind === "ELITE") return "깊은 조우";
    return "첫 조우";
  }
  return EVENT_COPY[node.eventType]?.title ?? "기록되지 않은 곳";
}

function journey(snapshot: StillkinTrack1Snapshot): Track1UiJourneyNode[] {
  const isActiveNode = snapshot.flow.phase !== "BETWEEN_NODES";
  const currentIndex = isActiveNode ? snapshot.flow.currentNodeIndex : snapshot.flow.phase === "BETWEEN_NODES" ? snapshot.flow.nextNodeIndex : null;
  const completedBefore = currentIndex ?? snapshot.flow.nextNodeIndex;
  return CONFIG.route.map((node, index) => ({
    nodeId: node.nodeId,
    depth: node.depth,
    labelKo: nodeLabel(node),
    status: index === currentIndex ? "CURRENT" : index < completedBefore ? "COMPLETED" : "UPCOMING",
  }));
}

function focusKey(snapshot: StillkinTrack1Snapshot): string {
  const node = snapshot.flow.phase === "BETWEEN_NODES"
    ? CONFIG.route[snapshot.flow.nextNodeIndex]
    : routeNode(snapshot);
  return `${snapshot.flow.runId}:${snapshot.persistence.writeBlocked ? "BLOCKED" : snapshot.flow.phase}:${node?.nodeId ?? "none"}`;
}

function screenKey(snapshot: StillkinTrack1Snapshot): string {
  return `${snapshot.flow.runId}:${snapshot.flow.revision}:${snapshot.flow.phase}`;
}

interface ForgeAuthorityIdentity {
  readonly revision: number;
  readonly runId: string;
  readonly focusKey: string;
  readonly screenKey: string;
}

function forgeAuthorityIdentity(snapshot: StillkinTrack1Snapshot): ForgeAuthorityIdentity {
  return {
    revision: snapshot.flow.revision,
    runId: snapshot.flow.runId,
    focusKey: focusKey(snapshot),
    screenKey: screenKey(snapshot),
  };
}

function matchesForgeAuthority(authority: ForgeAuthorityIdentity, snapshot: StillkinTrack1Snapshot): boolean {
  const current = forgeAuthorityIdentity(snapshot);
  return authority.revision === current.revision
    && authority.runId === current.runId
    && authority.focusKey === current.focusKey
    && authority.screenKey === current.screenKey;
}

function displayMap(items: readonly BrowserMaterialDisplay[]): Map<string, BrowserMaterialDisplay> {
  return new Map(items.map((item) => [item.id, item]));
}

function resolveCanonical(cardId: string, context: ForgeResolverContextV1): GeneratedCard | null {
  if (!cardId.startsWith("forge__")) return null;
  const body = cardId.slice("forge__".length);
  for (const left of context.materials) {
    const prefix = `${left.id}__`;
    if (!body.startsWith(prefix)) continue;
    const right = context.materials.find(({ id }) => id === body.slice(prefix.length));
    if (!right) continue;
    try {
      const resolved = resolveForgeCard(left, right, context.inputs);
      return resolved.card_id === cardId ? resolved : null;
    } catch { return null; }
  }
  return null;
}

function recipeDisplay(recipeId: string, context: ForgeResolverContextV1): { nameKo: string; art: string } | null {
  const [leftId, rightId, ...rest] = recipeId.split("|");
  if (!leftId || !rightId || rest.length > 0) return null;
  const left = context.materials.find(({ id }) => id === leftId);
  const right = context.materials.find(({ id }) => id === rightId);
  if (!left || !right) return null;
  try {
    const resolved = resolveForgeCard(left, right, context.inputs);
    return { nameKo: resolved.name_ko, art: resolved.art };
  } catch { return null; }
}

function commandFeedback(events: readonly { type: string }[]): Feedback {
  const last = events.at(-1)?.type;
  if (events.some(({ type }) => type === "INSTANT_FORGE_CLEANED")) return { tone: "STATUS", messageKo: "전투가 끝나 즉석 결과가 사라지고 사용한 재료가 덱으로 복구되었습니다." };
  if (last === "RUN_WON") return { tone: "STATUS", messageKo: "어름의 잔영이 멈췄습니다." };
  if (last === "RUN_LOST") return { tone: "STATUS", messageKo: "런이 끝났습니다." };
  if (events.some(({ type }) => type === "REWARD_AVAILABLE")) return { tone: "STATUS", messageKo: "전투 보상이 도착했습니다." };
  if (events.some(({ type }) => type === "WORKSHOP_ENTITLEMENT_GRANTED")) return { tone: "STATUS", messageKo: "연료 없이 한 번 빚을 수 있습니다." };
  const created = events.find((event): event is { type: "FORGE_RESULT_CREATED"; mode: "INSTANT" | "WORKSHOP"; location: "HAND" | "DECK" | "EQUIPMENT" } => event.type === "FORGE_RESULT_CREATED" && "mode" in event && "location" in event);
  if (created?.mode === "INSTANT" && created.location === "EQUIPMENT") return { tone: "STATUS", messageKo: "즉석 장비 결과는 전투 동안만 보유하며 손에 놓이지 않습니다. 전투 종료 시 장비 결과는 사라지고 재료는 복구됩니다." };
  if (created?.mode === "INSTANT") return { tone: "STATUS", messageKo: "즉석 결과가 손에 놓였습니다. 전투 종료 시 결과는 사라지고 재료는 복구됩니다." };
  if (created?.mode === "WORKSHOP") return { tone: "STATUS", messageKo: "두 재료가 영구 소모되고 결과가 덱에 편입되었습니다." };
  if (events.some(({ type }) => type === "BURNKIN_RESONANCE_BROKEN")) return { tone: "STATUS", messageKo: "공명이 끊겨 자해 피해를 받았습니다." };
  if (events.some(({ type }) => type === "CARD_PLAYED")) return { tone: "STATUS", messageKo: "카드를 사용했습니다." };
  if (events.some(({ type }) => type === "BURNKIN_CARD_KINDLED")) return { tone: "STATUS", messageKo: "카드 한 장을 지펴 에너지로 바꿨습니다." };
  if (events.some(({ type }) => type === "BURNKIN_HP_PAID")) return { tone: "STATUS", messageKo: "체력을 태워 에너지를 얻었습니다." };
  if (events.some(({ type }) => type === "TURN_STARTED")) return { tone: "STATUS", messageKo: "새 턴을 시작했습니다." };
  if (events.some(({ type }) => type === "EVENT_RESOLVED")) return { tone: "STATUS", messageKo: "사건을 기록했습니다." };
  return last ? { tone: "STATUS", messageKo: "진행 기록을 저장했습니다." } : null;
}

function failureFeedback(reason: string | undefined, persistenceReason?: string): Feedback {
  const code = persistenceReason ?? reason ?? "INVALID_ACTION";
  return { tone: "ERROR", messageKo: FAILURE_MESSAGES[code] ?? "행동을 적용하지 못했습니다. 진행 상태는 바뀌지 않았습니다." };
}

export function createStillkinTrack1UiSession(options: StillkinTrack1UiSessionOptions): StillkinTrack1UiSession {
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const packet = BROWSER_RUNTIME_PACKET;
  const context = packet.resolverContext;
  const materials = displayMap(packet.materialDisplay);
  const codexCanonical = projectCanonicalCodex(baseUrl);
  const controller = createTrack1Controller({
    storage: options.storage,
    resolverContext: context,
    ...(options.generationFactory ? { generationFactory: options.generationFactory } : {}),
  }, options.raceId ?? "Stillkin");
  const commandByDescriptor = new WeakMap<Track1UiActionDescriptor, StillkinTrack1Command>();
  const previewAuthority = new WeakMap<Track1UiForgePreview, ForgeAuthorityIdentity & { mode: Track1UiForgeMode; command: StillkinTrack1Command }>();
  const reviewAuthority = new WeakMap<Track1UiForgeReview, ForgeAuthorityIdentity & { mode: "WORKSHOP_PAID" | "WORKSHOP_FREE"; command: StillkinTrack1Command }>();
  let acceptedSnapshot: StillkinTrack1Snapshot | null = null;
  let feedback: Feedback = null;
  let latchedBlockingIssuesKo: readonly string[] | null = null;

  const bind = (actionId: string, kind: Track1UiActionKind, labelKo: string, command: StillkinTrack1Command, disabled = false): Track1UiActionDescriptor => {
    const descriptor = Object.freeze({ actionId, kind, labelKo, disabled });
    commandByDescriptor.set(descriptor, command);
    return descriptor;
  };

  const baseCommand = (snapshot: StillkinTrack1Snapshot) => ({ expectedRevision: snapshot.flow.revision, runId: snapshot.flow.runId });
  const stats = (snapshot: StillkinTrack1Snapshot) => {
    const active = snapshot.runtime.run.activeCombat?.state;
    return {
      hp: active?.player.hp ?? snapshot.flow.playerHp,
      maxHp: active?.player.maxHp ?? CONFIG.maxPlayerHp,
      block: active?.player.block ?? 0,
      fuel: snapshot.runtime.run.fuel,
      deckCount: snapshot.runtime.run.deck.length,
    };
  };
  const activeForgeActions = (snapshot: StillkinTrack1Snapshot): 0 | 1 | 2 => snapshot.runtime.run.activeCombat?.forgeActionsRemaining ?? 0;

  const workshopMaterials = (snapshot: StillkinTrack1Snapshot): Track1UiForgeMaterial[] => snapshot.runtime.run.ownedInstances.flatMap((instance) => {
    const material = materials.get(instance.cardId);
    return material ? [{
      instanceId: instance.instanceId,
      cardId: instance.cardId,
      nameKo: material.nameKo,
      artSrc: assetUrl(baseUrl, material.art),
      category: material.category,
    }] : [];
  });

  const hasDistinctPair = (items: readonly { cardId: string }[]) => new Set(items.map(({ cardId }) => cardId)).size >= 2;
  const hasJoinkinTriple = (items: readonly { cardId: string; category?: string }[]) => {
    for (let first = 0; first < items.length; first += 1) for (let second = first + 1; second < items.length; second += 1) {
      if (items[first].cardId === items[second].cardId || (items[first].category === "TOOL" && items[second].category === "TOOL")) continue;
      if (items.some((item, index) => index !== first && index !== second && item.cardId !== items[first].cardId && item.cardId !== items[second].cardId)) return true;
    }
    return false;
  };

  const cardProjection = (snapshot: StillkinTrack1Snapshot, instanceId: string): Track1UiCard | null => {
    const active = snapshot.runtime.run.activeCombat?.state;
    const binding = snapshot.flow.combatBinding;
    if (!active || !binding) return null;
    const instance = active.instances.find((item) => item.instanceId === instanceId);
    const card = active.cards.find((item) => item.cardId === instance?.cardId);
    if (!instance || !card) return null;
    const material = materials.get(card.cardId);
    const resolved = resolveCanonical(card.cardId, context);
    const nameKo = material?.nameKo ?? resolved?.name_ko ?? card.cardId;
    const fallbackMaterial = resolved?.material_ids
      .map((id) => materials.get(id))
      .filter((item): item is BrowserMaterialDisplay => item !== undefined)
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)[0];
    const usesFallbackArt = resolved !== null && !browserPacketHasCanonicalArt(packet, resolved.material_ids);
    const art = material?.art ?? (usesFallbackArt ? fallbackMaterial?.art : resolved?.art);
    const program = active.programs.find(({ effectId }) => effectId === card.effectId);
    const disabled = active.phase !== "PLAYER_ACTION" || card.cost === null || card.cost > active.player.energy;
    const forgeSelectable = material !== undefined && active.phase === "PLAYER_ACTION" && active.zones.hand.includes(instanceId) && activeForgeActions(snapshot) > 0;
    const action = bind(
      `play:${snapshot.flow.revision}:${instanceId}`,
      "PLAY_CARD",
      `${nameKo} 사용`,
      {
        type: "APPLY_COMBAT",
        expectedRevision: snapshot.flow.revision,
        ...binding,
        command: {
          type: "PLAY_CARD",
          instanceId,
          target: program?.targetRule.kind === "NONE" ? null : { kind: "ENEMY", enemyId: binding.encounterId },
        },
      },
      disabled,
    );
    const kindleDisabled = snapshot.raceId !== "Burnkin"
      || active.phase !== "PLAYER_ACTION"
      || card.cost === null
      || active.player.energy + card.cost > active.rules.maxEnergy;
    const kindleAction = snapshot.raceId === "Burnkin" ? bind(
      `kindle:${snapshot.flow.revision}:${instanceId}`,
      "BURNKIN_KINDLE",
      `${nameKo} 지피기`,
      {
        type: "BURNKIN_KINDLE",
        expectedRevision: snapshot.flow.revision,
        ...binding,
        instanceId,
      },
      kindleDisabled,
    ) : null;
    return {
      instanceId,
      cardId: card.cardId,
      nameKo,
      artSrc: assetUrl(baseUrl, art ?? "cards/ore_still.png"),
      artFallbackLabelKo: usesFallbackArt ? `${fallbackMaterial?.nameKo ?? "구성 재료"} 재료 도판` : null,
      cost: card.cost,
      power: card.power,
      effectLabelKo: card.power === null ? "수치 확정 전" : `효과 수치 ${card.power}`,
      forgeSelectable,
      action,
      kindleAction,
    };
  };

  const project = (snapshot: StillkinTrack1Snapshot): Track1UiProjection => {
    const depth = currentDepth(snapshot);
    const shared = {
      screenKey: screenKey(snapshot),
      focusKey: focusKey(snapshot),
      headingKo: `어름의 터 · 깊이 ${depth} / 3`,
      focusHeadingKo: `어름의 터 · 깊이 ${depth} / 3`,
      depth,
      stats: stats(snapshot),
      journey: journey(snapshot),
      feedback,
      featureFlags: { heartForge: false },
      codexDiscoveredCount: snapshot.profile.discoveredRecipeIds.length,
      raceId: snapshot.raceId,
      raceLabelKo: snapshot.raceLabelKo,
    } as const;
    if (snapshot.persistence.writeBlocked || latchedBlockingIssuesKo) {
      return {
        ...shared,
        focusKey: `${snapshot.flow.runId}:BLOCKED`,
        phase: "BLOCKED",
        headingKo: "저장 기록을 열 수 없습니다",
        focusHeadingKo: "저장 기록을 열 수 없습니다",
        issuesKo: latchedBlockingIssuesKo ?? snapshot.persistence.issues.map((issue) => ISSUE_MESSAGES[issue] ?? `저장 기록 오류: ${issue}`),
      };
    }
    if (snapshot.flow.phase === "BETWEEN_NODES") {
      const next = CONFIG.route[snapshot.flow.nextNodeIndex];
      const forgeMaterials = workshopMaterials(snapshot);
      const enoughMaterials = snapshot.raceId === "Joinkin" ? hasJoinkinTriple(forgeMaterials) : hasDistinctPair(forgeMaterials);
      return {
        ...shared,
        phase: "BETWEEN_NODES",
        backgroundSrc: assetUrl(baseUrl, `backgrounds/background__still__depth_0${depth}.png`),
        nextLabelKo: next ? nodeLabel(next) : "기록의 끝",
        action: bind(`enter:${snapshot.flow.revision}`, "ENTER_NEXT_NODE", "다음 기록으로", { type: "ENTER_NEXT_NODE", ...baseCommand(snapshot) }, !next),
        workshopMaterials: forgeMaterials,
        paidWorkshopEnabled: snapshot.runtime.run.fuel >= 1 && enoughMaterials,
        paidWorkshopDisabledReasonKo: snapshot.runtime.run.fuel < 1 ? "연료가 부족합니다." : enoughMaterials ? null : snapshot.raceId === "Joinkin" ? "서로 다른 재료 세 장이 필요합니다. 첫 두 칸에는 도구 둘을 함께 놓을 수 없습니다." : "서로 다른 재료 두 장이 필요합니다.",
      };
    }
    if (snapshot.flow.phase === "IN_COMBAT") {
      const active = snapshot.runtime.run.activeCombat?.state;
      const binding = snapshot.flow.combatBinding;
      if (!active || !binding) throw new Error("controller combat projection is unavailable");
      const intent = active.enemy.intents[active.enemy.currentIntentIndex];
      const hand = active.zones.hand.map((id) => cardProjection(snapshot, id)).filter((card): card is Track1UiCard => card !== null);
      const selectable = hand.filter(({ forgeSelectable }) => forgeSelectable).map((card) => ({ ...card, category: materials.get(card.cardId)?.category }));
      const instantForgeAvailable = active.phase === "PLAYER_ACTION" && activeForgeActions(snapshot) > 0
        && (snapshot.raceId === "Joinkin" ? hasJoinkinTriple(selectable) : hasDistinctPair(selectable));
      let primaryAction: Track1UiActionDescriptor | null = null;
      if (active.phase === "TURN_READY") {
        primaryAction = bind(`start:${snapshot.flow.revision}`, "START_TURN", "턴 시작", { type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...binding, command: { type: "START_TURN" } });
      } else if (active.phase === "PLAYER_ACTION") {
        primaryAction = bind(`end:${snapshot.flow.revision}`, "END_TURN", "턴 종료", { type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...binding, command: { type: "END_TURN" } });
      }
      const burnkinPassiveDisabled = snapshot.raceId !== "Burnkin"
        || active.phase !== "PLAYER_ACTION"
        || active.player.hp <= BURNKIN_TRACK1_RULES.hpToEnergy.hpCost
        || active.player.energy + BURNKIN_TRACK1_RULES.hpToEnergy.energyGain > active.rules.maxEnergy;
      const burnkinPassiveAction = snapshot.raceId === "Burnkin" ? bind(
        `burnkin-passive:${snapshot.flow.revision}`,
        "BURNKIN_PAY_HP",
        "피 태우기",
        { type: "BURNKIN_PAY_HP", expectedRevision: snapshot.flow.revision, ...binding },
        burnkinPassiveDisabled,
      ) : null;
      const joinkinExtendAction = snapshot.raceId === "Joinkin" ? bind(
        `joinkin-extend:${snapshot.flow.revision}`,
        "JOINKIN_EXTEND",
        "이어붙이기",
        { type: "JOINKIN_EXTEND", expectedRevision: snapshot.flow.revision, ...binding },
        active.phase !== "PLAYER_ACTION" || activeForgeActions(snapshot) !== 1 || snapshot.runtime.run.activeCombat?.joinkinSkillUsedTurn === active.turn,
      ) : null;
      const enemyArt = binding.encounterId === "the_stilling" ? "cards/heart__still.png" : `enemies/${binding.encounterId}.png`;
      return {
        ...shared,
        phase: "IN_COMBAT",
        backgroundSrc: assetUrl(baseUrl, `backgrounds/background__still__depth_0${depth}.png`),
        enemy: {
          id: active.enemy.enemyId,
          nameKo: ENEMY_NAMES[active.enemy.enemyId] ?? active.enemy.enemyId,
          artSrc: assetUrl(baseUrl, enemyArt),
          hp: active.enemy.hp,
          maxHp: active.enemy.maxHp,
          block: active.enemy.block,
          intentKo: intent?.labelKo ?? "의도 없음",
          intentAmount: intent?.displayAmount ?? null,
        },
        turn: active.turn,
        energy: active.player.energy,
        maxEnergy: active.rules.maxEnergy,
        drawCount: active.zones.deck.length,
        discardCount: active.zones.discard.length,
        hand,
        instantForgeAvailable,
        instantForgeDisabledReasonKo: active.phase !== "PLAYER_ACTION" ? "플레이어 행동 단계에서 사용할 수 있습니다." : activeForgeActions(snapshot) === 0 ? "이번 턴의 빚기 행동을 이미 사용했습니다." : instantForgeAvailable ? null : snapshot.raceId === "Joinkin" ? "손에 서로 다른 재료 세 장이 필요합니다." : "손에 서로 다른 재료 두 장이 필요합니다.",
        primaryAction,
        instructionKo: active.phase === "TURN_READY" ? "턴을 시작해 손패를 펼치세요." : "카드를 선택하면 현재 적에게 적용됩니다.",
        burnkinPassiveAction,
        burnkinRulesKo: snapshot.raceId === "Burnkin"
          ? `체력 ${BURNKIN_TRACK1_RULES.hpToEnergy.hpCost} → 에너지 ${BURNKIN_TRACK1_RULES.hpToEnergy.energyGain} · 공명 2배 · 단절 시 체력 ${BURNKIN_TRACK1_RULES.resonanceBreakSelfDamage} 피해`
          : null,
        joinkinExtendAction,
        joinkinRulesKo: snapshot.raceId === "Joinkin" ? "기본 결과 유지. 세 번째 속성만 공명." : null,
      };
    }
    if (snapshot.flow.phase === "AWAITING_REWARD") {
      const choices: Track1UiRewardChoice[] = snapshot.rewardChoices.flatMap((raw) => {
        if (!raw || typeof raw !== "object" || !("choiceId" in raw) || typeof raw.choiceId !== "string" || !("kind" in raw)) return [];
        if (raw.kind === "MATERIAL" && "materialId" in raw && typeof raw.materialId === "string") {
          const material = materials.get(raw.materialId);
          if (!material) return [];
          return [{ choiceId: raw.choiceId, nameKo: material.nameKo, kindLabelKo: material.category === "TOOL" ? "도구" : material.category === "ODDITY" ? "기괴 산물" : "재료", artSrc: assetUrl(baseUrl, material.art), action: bind(`reward:${snapshot.flow.revision}:${raw.choiceId}`, "CHOOSE_REWARD", `${material.nameKo} 선택`, { type: "CHOOSE_REWARD", ...baseCommand(snapshot), choiceId: raw.choiceId }) }];
        }
        if (raw.kind === "RECIPE" && "recipeId" in raw && typeof raw.recipeId === "string") {
          const display = recipeDisplay(raw.recipeId, context);
          return [{ choiceId: raw.choiceId, nameKo: display?.nameKo ?? "제법 기록", kindLabelKo: "제법", artSrc: display ? assetUrl(baseUrl, display.art) : null, action: bind(`reward:${snapshot.flow.revision}:${raw.choiceId}`, "CHOOSE_REWARD", "제법 선택", { type: "CHOOSE_REWARD", ...baseCommand(snapshot), choiceId: raw.choiceId }) }];
        }
        return [];
      });
      return { ...shared, phase: "AWAITING_REWARD", focusHeadingKo: "전투에서 살아남았습니다", choices };
    }
    const node = routeNode(snapshot);
    if ((snapshot.flow.phase === "IN_EVENT" || snapshot.flow.phase === "EVENT_RESOLVED") && node?.kind === "EVENT") {
      const copy = EVENT_COPY[node.eventType];
      if (!copy) throw new Error("event presentation is unavailable");
      if (snapshot.flow.phase === "IN_EVENT") {
        const choices: Track1UiEventChoice[] = snapshot.eventChoices.map(({ choiceId, price }) => ({
          choiceId,
          labelKo: EVENT_CHOICE_LABELS[choiceId] ?? "기록하기",
          price,
          action: bind(
            `event:${snapshot.flow.revision}:${choiceId}`,
            "RESOLVE_EVENT",
            EVENT_CHOICE_LABELS[choiceId] ?? "기록하기",
            { type: "RESOLVE_EVENT", ...baseCommand(snapshot), choiceId },
            price > snapshot.runtime.run.fuel,
          ),
        }));
        return { ...shared, phase: "IN_EVENT", eventType: node.eventType, titleKo: copy.title, descriptionKo: copy.description, artSrc: assetUrl(baseUrl, copy.art), choices };
      }
      const availableWorkshopMaterials: Track1UiForgeMaterial[] = snapshot.flow.workshopEntitlementNodeId === node.nodeId
        ? workshopMaterials(snapshot)
        : [];
      const leaveAction = snapshot.flow.workshopEntitlementNodeId === null
        ? bind(`leave:${snapshot.flow.revision}`, "LEAVE_EVENT", "다음 길로", { type: "LEAVE_EVENT", ...baseCommand(snapshot) })
        : null;
      return { ...shared, phase: "EVENT_RESOLVED", eventType: node.eventType, titleKo: copy.title, artSrc: assetUrl(baseUrl, copy.art), workshopMaterials: availableWorkshopMaterials, leaveAction };
    }
    const won = snapshot.flow.phase === "RUN_WON";
    return {
      ...shared,
      phase: won ? "RUN_WON" : "RUN_LOST",
      headingKo: won ? "어름의 잔영이 멈췄습니다" : "기록이 여기서 끊겼습니다",
      focusHeadingKo: won ? "어름의 잔영이 멈췄습니다" : "기록이 여기서 끊겼습니다",
      messageKo: won ? "신의 심장이 도감에 남았습니다." : "영구 기록은 남아 있습니다. 새 런을 시작할 수 있습니다.",
      artSrc: assetUrl(baseUrl, won ? "cards/heart__still.png" : `backgrounds/background__still__depth_0${depth}.png`),
      action: bind(`restart:${snapshot.flow.revision}`, "RESTART", "새 런", { type: "RESTART", ...baseCommand(snapshot) }),
    };
  };

  const ensureLoaded = (): StillkinTrack1Snapshot => {
    if (!acceptedSnapshot) acceptedSnapshot = controller.load().snapshot;
    return acceptedSnapshot;
  };

  const session: StillkinTrack1UiSession = {
    load() {
      acceptedSnapshot = controller.load().snapshot;
      latchedBlockingIssuesKo = acceptedSnapshot.persistence.writeBlocked
        ? acceptedSnapshot.persistence.issues.map((issue) => ISSUE_MESSAGES[issue] ?? `저장 기록 오류: ${issue}`)
        : null;
      feedback = acceptedSnapshot.persistence.writeBlocked
        ? { tone: "ERROR", messageKo: "원본 저장 기록은 삭제하지 않았습니다." }
        : { tone: "STATUS", messageKo: "진행 기록을 불러왔습니다." };
      return project(acceptedSnapshot);
    },
    snapshot() { return project(ensureLoaded()); },
    dispatch(action): Track1UiDispatchResult {
      const snapshot = ensureLoaded();
      if (latchedBlockingIssuesKo) return { applied: false, projection: project(snapshot), forgePresentation: null };
      const command = commandByDescriptor.get(action);
      if (!command || action.disabled) {
        feedback = failureFeedback("INVALID_ACTION");
        return { applied: false, projection: project(snapshot), forgePresentation: null };
      }
      const result = controller.dispatch(command);
      if (!result.applied) {
        const persistenceReason = result.persistence && !result.persistence.ok ? result.persistence.reason : undefined;
        feedback = failureFeedback(result.reason, persistenceReason);
        if (persistenceReason === "WRITE_BLOCKED" || persistenceReason === "READ_FAILED") {
          latchedBlockingIssuesKo = [persistenceReason === "READ_FAILED"
            ? ISSUE_MESSAGES.READ_FAILED
            : "저장 기록이 외부에서 손상되었거나 지원하지 않는 형식으로 바뀌었습니다."];
        }
        return { applied: false, projection: project(snapshot), forgePresentation: null };
      }
      acceptedSnapshot = result.snapshot;
      feedback = commandFeedback(result.events);
      const forgePresentation = result.persistence?.ok
        ? buildForgePresentation(result.events, baseUrl, `${acceptedSnapshot.flow.runId}:${acceptedSnapshot.flow.revision}`)
        : null;
      return { applied: true, projection: project(acceptedSnapshot), forgePresentation };
    },
    previewForge(mode, materialInstanceIds) {
      const snapshot = ensureLoaded();
      const requiredMaterialCount = snapshot.raceId === "Joinkin" ? 3 : 2;
      if (latchedBlockingIssuesKo || materialInstanceIds.length !== requiredMaterialCount
        || new Set(materialInstanceIds).size !== requiredMaterialCount) return null;
      const selectedIds = [...materialInstanceIds] as [string, string] | [string, string, string];
      let selected: Array<{ instanceId: string; cardId: string }>;
      let command: StillkinTrack1Command;
      let executable = true;
      let disabledReasonKo: string | null = null;
      if (mode === "INSTANT") {
        const active = snapshot.runtime.run.activeCombat;
        const binding = snapshot.flow.combatBinding;
        if (snapshot.flow.phase !== "IN_COMBAT" || !active || !binding) return null;
        const inHand = (instanceId: string) => active.state.zones.hand.includes(instanceId)
          ? active.state.instances.find((instance) => instance.instanceId === instanceId)
          : undefined;
        selected = selectedIds.map(inHand).filter((item): item is { instanceId: string; cardId: string } => item !== undefined);
        if (active.state.phase !== "PLAYER_ACTION") { executable = false; disabledReasonKo = "플레이어 행동 단계에서 사용할 수 있습니다."; }
        else if (active.forgeActionsRemaining === 0) { executable = false; disabledReasonKo = "이번 턴의 빚기 행동을 이미 사용했습니다."; }
        command = snapshot.raceId === "Joinkin"
          ? { type: "JOINKIN_FORGE_INSTANT", expectedRevision: snapshot.flow.revision, ...binding, materialInstanceIds: selectedIds as [string, string, string] }
          : { type: "FORGE_INSTANT", expectedRevision: snapshot.flow.revision, ...binding, materialInstanceIds: selectedIds as [string, string] };
      } else {
        if (mode === "WORKSHOP_PAID" && snapshot.flow.phase !== "BETWEEN_NODES") return null;
        const node = routeNode(snapshot);
        if (mode === "WORKSHOP_FREE" && (snapshot.flow.phase !== "EVENT_RESOLVED" || node?.kind !== "EVENT" || node.eventType !== "WORKSHOP" || snapshot.flow.workshopEntitlementNodeId !== node.nodeId)) return null;
        selected = selectedIds.map((id) => snapshot.runtime.run.ownedInstances.find(({ instanceId }) => instanceId === id)).filter((item): item is { instanceId: string; cardId: string } => item !== undefined);
        if (mode === "WORKSHOP_PAID" && snapshot.runtime.run.fuel < 1) { executable = false; disabledReasonKo = "연료가 부족합니다."; }
        command = snapshot.raceId === "Joinkin"
          ? mode === "WORKSHOP_PAID"
            ? { type: "JOINKIN_FORGE_WORKSHOP", ...baseCommand(snapshot), materialInstanceIds: selectedIds as [string, string, string] }
            : { type: "JOINKIN_USE_FREE_WORKSHOP", ...baseCommand(snapshot), materialInstanceIds: selectedIds as [string, string, string] }
          : mode === "WORKSHOP_PAID"
            ? { type: "FORGE_WORKSHOP", ...baseCommand(snapshot), materialInstanceIds: selectedIds as [string, string] }
            : { type: "USE_FREE_WORKSHOP", ...baseCommand(snapshot), materialInstanceIds: selectedIds as [string, string] };
      }
      if (selected.length !== requiredMaterialCount || new Set(selected.map(({ cardId }) => cardId)).size !== requiredMaterialCount
        || selected.some(({ cardId }) => !materials.has(cardId))) return null;
      const leftDisplay = materials.get(selected[0].cardId)!;
      const rightDisplay = materials.get(selected[1].cardId)!;
      if (snapshot.raceId === "Joinkin" && leftDisplay.category === "TOOL" && rightDisplay.category === "TOOL") return null;
      const canonical = buildCanonicalForgePreview([selected[0].cardId, selected[1].cardId], baseUrl);
      if (!canonical) return null;
      const thirdOverlay = requiredMaterialCount === 3 ? buildThirdOverlayPreview(selected[2].cardId, baseUrl) : null;
      if (requiredMaterialCount === 3 && !thirdOverlay) return null;
      const fuelBefore = snapshot.runtime.run.fuel;
      const preview: Track1UiForgePreview = Object.freeze({
        previewId: `forge-preview:${snapshot.flow.revision}:${mode}:${selected.map(({ instanceId }) => instanceId).join(":")}`,
        mode,
        selectedInstanceIds: Object.freeze(selected.map(({ instanceId }) => instanceId)) as unknown as readonly [string, string] | readonly [string, string, string],
        requiredMaterialCount,
        canonical,
        thirdOverlay,
        cost: Object.freeze({
          kind: mode === "INSTANT" ? "ACTION" : mode === "WORKSHOP_PAID" ? "FUEL" : "FREE_ENTITLEMENT",
          labelKo: mode === "INSTANT" ? "행동 1회" : mode === "WORKSHOP_PAID" ? "연료 1" : "무료 공방 권리",
          fuelBefore,
          fuelAfter: mode === "WORKSHOP_PAID" && fuelBefore > 0 ? fuelBefore - 1 : fuelBefore,
        }),
        lifetime: mode === "INSTANT" ? "TEMPORARY" : "PERMANENT",
        lifetimeLabelKo: mode === "INSTANT" ? "전투 종료 시 결과 소멸 · 재료 복구" : "재료 영구 소모 · 결과 덱 편입",
        executable,
        disabledReasonKo,
      });
      previewAuthority.set(preview, { ...forgeAuthorityIdentity(snapshot), mode, command });
      return preview;
    },
    describeInstantForgeAction(preview) {
      const snapshot = ensureLoaded();
      const authority = previewAuthority.get(preview);
      if (!authority || authority.mode !== "INSTANT" || !matchesForgeAuthority(authority, snapshot) || !preview.executable) return null;
      return bind(`instant-forge:${preview.previewId}`, "FORGE_INSTANT", "즉석 빚기", authority.command);
    },
    reviewWorkshopForge(preview) {
      const snapshot = ensureLoaded();
      const authority = previewAuthority.get(preview);
      if (!authority || authority.mode === "INSTANT" || !matchesForgeAuthority(authority, snapshot) || !preview.executable) return null;
      const review: Track1UiForgeReview = Object.freeze({
        reviewId: `forge-review:${preview.previewId}`,
        preview,
        headingKo: authority.mode === "WORKSHOP_PAID" ? "공방 빚기 최종 확인" : "무료 공방 빚기 최종 확인",
        warningKo: `선택한 ${preview.requiredMaterialCount === 3 ? "세" : "두"} 재료는 영구적으로 소모되며 되돌릴 수 없습니다.`,
      });
      reviewAuthority.set(review, { ...authority, mode: authority.mode, command: authority.command });
      return review;
    },
    confirmForgeReview(review) {
      const snapshot = ensureLoaded();
      const authority = reviewAuthority.get(review);
      if (!authority || !matchesForgeAuthority(authority, snapshot)) return null;
      return bind(
        `confirm:${review.reviewId}`,
        authority.mode === "WORKSHOP_PAID" ? "FORGE_WORKSHOP" : "USE_FREE_WORKSHOP",
        authority.mode === "WORKSHOP_PAID" ? "영구 소모하고 빚기" : "영구 소모하고 무료로 빚기",
        authority.command,
      );
    },
    codexSnapshot() {
      const snapshot = ensureLoaded();
      const discovered = new Set(snapshot.profile.discoveredRecipeIds);
      return Object.freeze({
        total: 1326,
        pageSize: 48,
        discoveredCount: discovered.size,
        entries: Object.freeze(codexCanonical.map((canonical, index) => {
          const isDiscovered = discovered.has(canonical.recipeId);
          return Object.freeze({
            entryKey: `codex-entry-${String(index + 1).padStart(4, "0")}`,
            ordinal: index + 1,
            discovered: isDiscovered,
            recipeId: isDiscovered ? canonical.recipeId : null,
            preview: isDiscovered ? canonical : null,
            availableModes: isDiscovered ? Object.freeze(["INSTANT", "WORKSHOP"] as const) : null,
          });
        })),
      });
    },
  };
  return Object.freeze(session);
}
