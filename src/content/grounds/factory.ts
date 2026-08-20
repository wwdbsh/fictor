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

const SHAPES = ["SWARM", "BULK", "SHELL", "REACH", "MIMIC"] as const;
const EVENT_TYPES = ["CACHE", "WORKSHOP", "COLLAPSE", "FICTOR", "RECORD", "ODDITY"] as const;
const EVENT_LABELS: Readonly<Record<EventType, string>> = Object.freeze({
  CACHE: "조각 무더기",
  WORKSHOP: "버려진 공방",
  COLLAPSE: "무너진 갱도",
  FICTOR: "다른 빚는 자",
  RECORD: "옛 기록",
  ODDITY: "이상한 것",
});
const GENERIC_EVENT_ASSETS: Readonly<Partial<Record<EventType, string>>> = Object.freeze({
  WORKSHOP: "event__workshop",
  COLLAPSE: "event__collapse",
  FICTOR: "event__fictor",
  RECORD: "event__record",
});

type GroundStem = "still" | "burn" | "scatter";

interface EnabledGroundConfig {
  readonly id: Extract<GroundId, "GROUND_STILL" | "GROUND_BURN" | "GROUND_SCATTER">;
  readonly stem: GroundStem;
  readonly nameKo: string;
  readonly attribute: "STILL" | "BURN" | "SCATTER";
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
  const asset: AssetReference = Object.freeze({ id, path });
  return { asset, assetId: id, assetPath: path };
}

export function createEnabledGround(config: EnabledGroundConfig): GroundDescriptor {
  const depths = Object.freeze(config.depthLabels.map((label, index) => {
    const depth = (index + 1) as GroundDepth;
    return Object.freeze({
      depth,
      label,
      labelKo: label,
      ...withAsset(`background__${config.stem}__depth_0${depth}`),
    });
  }));
  const normals = Object.freeze(SHAPES.map((shape, index) => Object.freeze({
    id: `enemy__${config.stem}__${shape.toLowerCase()}`,
    shape,
    labelKo: config.normalLabels[index],
    ...withAsset(`enemy__${config.stem}__${shape.toLowerCase()}`),
  })));
  const elite = Object.freeze({
    ...config.elite,
    mechanic: Object.freeze({ id: config.elite.mechanicId, status: "PENDING_2026_08_21" as const }),
    ...withAsset(config.elite.id),
  });
  const boss = Object.freeze({
    id: config.boss.id,
    name: config.boss.name,
    labelKo: config.boss.labelKo,
    mechanicId: config.boss.mechanicId,
    mechanic: Object.freeze({ id: config.boss.mechanicId, status: "PENDING_2026_08_21" as const }),
    ...withAsset(config.boss.heartId),
    reusesCardAssetId: config.boss.heartId,
  });
  const events: readonly EventDescriptor[] = Object.freeze(EVENT_TYPES.map((type) => {
    const assetId = config.eventAssetOverrides[type] ?? GENERIC_EVENT_ASSETS[type];
    if (!assetId) throw new Error(`Missing ${type} asset for ${config.id}`);
    return Object.freeze({ type, labelKo: EVENT_LABELS[type], ...withAsset(assetId) });
  }));
  const encounters = Object.freeze({ normals, elite, boss });
  const rewards = Object.freeze({
    normal: Object.freeze({
      source: "NORMAL" as const,
      allowedMaterialCategories: Object.freeze(["ORE", "GROUND_PRODUCT"] as const),
      origin: config.id,
    }),
    elite: Object.freeze({
      source: "ELITE" as const,
      allowedMaterialCategories: Object.freeze(["TOOL", "ODDITY"] as const),
    }),
    boss: Object.freeze({ source: "BOSS" as const, heartId: config.boss.heartId }),
  });
  return Object.freeze({
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
