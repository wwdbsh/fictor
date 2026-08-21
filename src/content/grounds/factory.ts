import type {
  AssetReference,
  BossEnemyDescriptor,
  BossMechanicId,
  EliteMechanicId,
  EventDescriptor,
  EventType,
  GroundDepth,
  GroundDescriptor,
  GroundId,
} from "../types";
import { freeze } from "../../freeze";

const SHAPES = ["SWARM", "BULK", "SHELL", "REACH", "MIMIC"] as const;
const EVENT_TYPES = ["CACHE", "WORKSHOP", "COLLAPSE", "FICTOR", "RECORD", "ODDITY"] as const;
const EVENT_LABELS: Readonly<Record<EventType, string>> = freeze({
  CACHE: "조각 무더기",
  WORKSHOP: "버려진 공방",
  COLLAPSE: "무너진 갱도",
  FICTOR: "다른 빚는 자",
  RECORD: "옛 기록",
  ODDITY: "이상한 것",
});
const GENERIC_EVENT_ASSETS: Readonly<Partial<Record<EventType, string>>> = freeze({
  WORKSHOP: "event__workshop",
  COLLAPSE: "event__collapse",
  FICTOR: "event__fictor",
  RECORD: "event__record",
});

export const PLAYABLE_GROUND_IDS = /* @__PURE__ */ freeze([
  "GROUND_STILL",
  "GROUND_BURN",
  "GROUND_SCATTER",
  "GROUND_ROT",
  "GROUND_WASH",
] as const);

type GroundStem = "still" | "burn" | "scatter" | "rot" | "wash";

interface EnabledGroundConfig {
  readonly id: Exclude<GroundId, "GROUND_JOIN">;
  readonly stem: GroundStem;
  readonly nameKo: string;
  readonly attribute: "STILL" | "BURN" | "SCATTER" | "ROT" | "WASH";
  readonly depthLabels: readonly [string, string, string];
  readonly normalLabels: readonly [string, string, string, string, string];
  readonly elite: {
    readonly id: string;
    readonly labelKo: string;
    readonly mechanicId: EliteMechanicId;
  };
  readonly boss: {
    readonly id: BossEnemyDescriptor["id"];
    readonly name: BossEnemyDescriptor["name"];
    readonly labelKo: string;
    readonly mechanicId: BossMechanicId;
    readonly heartId: BossEnemyDescriptor["reusesCardAssetId"];
  };
  readonly eventAssetOverrides: Readonly<Partial<Record<EventType, string>>>;
}

function assetPath(id: string): string {
  const directory = id.startsWith("background__")
    ? "backgrounds"
    : id.startsWith("heart__")
      ? "cards"
      : id.startsWith("event__")
        ? "events"
        : "enemies";
  return `/assets/${directory}/${id}.png`;
}

function withAsset(id: string) {
  const path = assetPath(id);
  const asset: AssetReference = freeze({ id, path });
  return { asset, assetId: id, assetPath: path };
}

export function createEnabledGround(config: EnabledGroundConfig): GroundDescriptor {
  const depths = freeze(config.depthLabels.map((label, index) => {
    const depth = (index + 1) as GroundDepth;
    return freeze({
      depth,
      label,
      labelKo: label,
      ...withAsset(`background__${config.stem}__depth_0${depth}`),
    });
  }));
  const normals = freeze(SHAPES.map((shape, index) => freeze({
    id: `enemy__${config.stem}__${shape.toLowerCase()}`,
    shape,
    labelKo: config.normalLabels[index],
    ...withAsset(`enemy__${config.stem}__${shape.toLowerCase()}`),
  })));
  const elite = freeze({
    ...config.elite,
    mechanic: freeze({ id: config.elite.mechanicId, status: "PENDING_2026_08_21" as const }),
    ...withAsset(config.elite.id),
  });
  const boss = freeze({
    id: config.boss.id,
    name: config.boss.name,
    labelKo: config.boss.labelKo,
    mechanicId: config.boss.mechanicId,
    mechanic: freeze({ id: config.boss.mechanicId, status: "PENDING_2026_08_21" as const }),
    ...withAsset(config.boss.heartId),
    reusesCardAssetId: config.boss.heartId,
  });
  const events: readonly EventDescriptor[] = freeze(EVENT_TYPES.map((type) => {
    const assetId = config.eventAssetOverrides[type] ?? GENERIC_EVENT_ASSETS[type];
    if (!assetId) throw new Error(`Missing ${type} asset for ${config.id}`);
    return freeze({ type, labelKo: EVENT_LABELS[type], ...withAsset(assetId) });
  }));
  const encounters = freeze({ normals, elite, boss });
  const rewards = freeze({
    normal: freeze({
      source: "NORMAL" as const,
      allowedMaterialCategories: freeze(["ORE", "GROUND_PRODUCT"] as const),
      origin: config.id,
    }),
    elite: freeze({
      source: "ELITE" as const,
      allowedMaterialCategories: freeze(["TOOL", "ODDITY"] as const),
    }),
    boss: freeze({ source: "BOSS" as const, heartId: config.boss.heartId }),
  });
  return freeze({
    id: config.id,
    nameKo: config.nameKo,
    labelKo: config.nameKo,
    attribute: config.attribute,
    status: "ENABLED",
    enabled: true,
    depths,
    encounters,
    rewards,
    events,
  });
}
