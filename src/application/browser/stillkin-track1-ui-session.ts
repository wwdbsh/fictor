import { resolveForgeCard, type GeneratedCard } from "../../domain/forge";
import type { ForgeResolverContextV1 } from "../../domain/forge-runtime";
import type { StorageLike } from "../../persistence";
import { createStillkinTrack1Controller, STILLKIN_TRACK1_PROVISIONAL_CONFIG as CONFIG } from "../run";
import type { StillkinTrack1Command, StillkinTrack1Snapshot } from "../run";
import { BROWSER_RUNTIME_PACKET } from "./runtime-packet.generated";
import { browserPacketHasCanonicalArt, type BrowserMaterialDisplay } from "./runtime-packet";
import type {
  StillkinTrack1UiSession,
  Track1UiActionDescriptor,
  Track1UiActionKind,
  Track1UiCard,
  Track1UiDispatchResult,
  Track1UiEventChoice,
  Track1UiJourneyNode,
  Track1UiProjection,
  Track1UiRewardChoice,
  Track1UiWorkshopMaterial,
} from "./ui-types";

export interface StillkinTrack1UiSessionOptions {
  readonly storage: StorageLike;
  readonly baseUrl: string;
  readonly generationFactory?: () => string;
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
  INSUFFICIENT_FUEL: "연료가 부족합니다.",
  WORKSHOP_SELECTION_INVALID: "서로 다른 재료 두 장을 골라야 합니다.",
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
  if (last === "RUN_WON") return { tone: "STATUS", messageKo: "어름의 잔영이 멈췄습니다." };
  if (last === "RUN_LOST") return { tone: "STATUS", messageKo: "런이 끝났습니다." };
  if (events.some(({ type }) => type === "REWARD_AVAILABLE")) return { tone: "STATUS", messageKo: "전투 보상이 도착했습니다." };
  if (events.some(({ type }) => type === "WORKSHOP_ENTITLEMENT_GRANTED")) return { tone: "STATUS", messageKo: "연료 없이 한 번 빚을 수 있습니다." };
  if (events.some(({ type }) => type === "FORGE_RESULT_CREATED")) return { tone: "STATUS", messageKo: "두 재료를 빚어 덱에 기록했습니다." };
  if (events.some(({ type }) => type === "CARD_PLAYED")) return { tone: "STATUS", messageKo: "카드를 사용했습니다." };
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
  const controller = createStillkinTrack1Controller({
    storage: options.storage,
    resolverContext: context,
    ...(options.generationFactory ? { generationFactory: options.generationFactory } : {}),
  });
  const commandByDescriptor = new WeakMap<Track1UiActionDescriptor, StillkinTrack1Command>();
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
    return {
      instanceId,
      cardId: card.cardId,
      nameKo,
      artSrc: assetUrl(baseUrl, art ?? "cards/ore_still.png"),
      artFallbackLabelKo: usesFallbackArt ? `${fallbackMaterial?.nameKo ?? "구성 재료"} 재료 도판` : null,
      cost: card.cost,
      power: card.power,
      effectLabelKo: card.power === null ? "수치 확정 전" : `효과 수치 ${card.power}`,
      action,
    };
  };

  const project = (snapshot: StillkinTrack1Snapshot): Track1UiProjection => {
    const depth = currentDepth(snapshot);
    const shared = {
      screenKey: `${snapshot.flow.runId}:${snapshot.flow.revision}:${snapshot.flow.phase}`,
      focusKey: focusKey(snapshot),
      headingKo: `어름의 터 · 깊이 ${depth} / 3`,
      focusHeadingKo: `어름의 터 · 깊이 ${depth} / 3`,
      depth,
      stats: stats(snapshot),
      journey: journey(snapshot),
      feedback,
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
      return {
        ...shared,
        phase: "BETWEEN_NODES",
        backgroundSrc: assetUrl(baseUrl, `backgrounds/background__still__depth_0${depth}.png`),
        nextLabelKo: next ? nodeLabel(next) : "기록의 끝",
        action: bind(`enter:${snapshot.flow.revision}`, "ENTER_NEXT_NODE", "다음 기록으로", { type: "ENTER_NEXT_NODE", ...baseCommand(snapshot) }, !next),
      };
    }
    if (snapshot.flow.phase === "IN_COMBAT") {
      const active = snapshot.runtime.run.activeCombat?.state;
      const binding = snapshot.flow.combatBinding;
      if (!active || !binding) throw new Error("controller combat projection is unavailable");
      const intent = active.enemy.intents[active.enemy.currentIntentIndex];
      const hand = active.zones.hand.map((id) => cardProjection(snapshot, id)).filter((card): card is Track1UiCard => card !== null);
      let primaryAction: Track1UiActionDescriptor | null = null;
      if (active.phase === "TURN_READY") {
        primaryAction = bind(`start:${snapshot.flow.revision}`, "START_TURN", "턴 시작", { type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...binding, command: { type: "START_TURN" } });
      } else if (active.phase === "PLAYER_ACTION") {
        primaryAction = bind(`end:${snapshot.flow.revision}`, "END_TURN", "턴 종료", { type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...binding, command: { type: "END_TURN" } });
      }
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
        primaryAction,
        instructionKo: active.phase === "TURN_READY" ? "턴을 시작해 손패를 펼치세요." : "카드를 선택하면 현재 적에게 적용됩니다.",
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
      const workshopMaterials: Track1UiWorkshopMaterial[] = snapshot.flow.workshopEntitlementNodeId === node.nodeId
        ? snapshot.runtime.run.ownedInstances.flatMap((instance) => {
          const material = materials.get(instance.cardId);
          return material ? [{ instanceId: instance.instanceId, cardId: instance.cardId, nameKo: material.nameKo, artSrc: assetUrl(baseUrl, material.art) }] : [];
        })
        : [];
      const leaveAction = snapshot.flow.workshopEntitlementNodeId === null
        ? bind(`leave:${snapshot.flow.revision}`, "LEAVE_EVENT", "다음 길로", { type: "LEAVE_EVENT", ...baseCommand(snapshot) })
        : null;
      return { ...shared, phase: "EVENT_RESOLVED", eventType: node.eventType, titleKo: copy.title, artSrc: assetUrl(baseUrl, copy.art), workshopMaterials, leaveAction };
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
      if (latchedBlockingIssuesKo) return { applied: false, projection: project(snapshot) };
      const command = commandByDescriptor.get(action);
      if (!command || action.disabled) {
        feedback = failureFeedback("INVALID_ACTION");
        return { applied: false, projection: project(snapshot) };
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
        return { applied: false, projection: project(snapshot) };
      }
      acceptedSnapshot = result.snapshot;
      feedback = commandFeedback(result.events);
      return { applied: true, projection: project(acceptedSnapshot) };
    },
    describeWorkshopAction(materialInstanceIds) {
      const snapshot = ensureLoaded();
      if (latchedBlockingIssuesKo) return null;
      if (snapshot.flow.phase !== "EVENT_RESOLVED" || materialInstanceIds.length !== 2) return null;
      const [leftId, rightId] = materialInstanceIds;
      const left = snapshot.runtime.run.ownedInstances.find(({ instanceId }) => instanceId === leftId);
      const right = snapshot.runtime.run.ownedInstances.find(({ instanceId }) => instanceId === rightId);
      if (!left || !right || left.instanceId === right.instanceId || left.cardId === right.cardId || !materials.has(left.cardId) || !materials.has(right.cardId)) return null;
      return bind(
        `free-workshop:${snapshot.flow.revision}:${leftId}:${rightId}`,
        "USE_FREE_WORKSHOP",
        "두 재료 빚기",
        { type: "USE_FREE_WORKSHOP", ...baseCommand(snapshot), materialInstanceIds: [leftId, rightId] },
      );
    },
  };
  return Object.freeze(session);
}
