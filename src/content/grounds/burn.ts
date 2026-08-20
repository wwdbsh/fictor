import type {
  AssetReference,
  BossEnemyDescriptor,
  EliteEnemyDescriptor,
  EventDescriptor,
  GroundDepthDescriptor,
  GroundDescriptor,
  GroundEncounters,
  GroundRewardMapping,
  NormalEnemyDescriptor,
} from "../types";

function asset(id: string, path: string): AssetReference {
  return Object.freeze({ id, path });
}

const DEPTHS: readonly GroundDepthDescriptor[] = Object.freeze([
  Object.freeze({
    depth: 1,
    label: "식은 재밭",
    labelKo: "식은 재밭",
    asset: asset("background__burn__depth_01", "/assets/backgrounds/background__burn__depth_01.png"),
    assetId: "background__burn__depth_01",
    assetPath: "/assets/backgrounds/background__burn__depth_01.png",
  }),
  Object.freeze({
    depth: 2,
    label: "균열 사이로 보이는 불빛",
    labelKo: "균열 사이로 보이는 불빛",
    asset: asset("background__burn__depth_02", "/assets/backgrounds/background__burn__depth_02.png"),
    assetId: "background__burn__depth_02",
    assetPath: "/assets/backgrounds/background__burn__depth_02.png",
  }),
  Object.freeze({
    depth: 3,
    label: "꺼지지 않는 화심",
    labelKo: "꺼지지 않는 화심",
    asset: asset("background__burn__depth_03", "/assets/backgrounds/background__burn__depth_03.png"),
    assetId: "background__burn__depth_03",
    assetPath: "/assets/backgrounds/background__burn__depth_03.png",
  }),
]);

const NORMALS: readonly NormalEnemyDescriptor[] = Object.freeze([
  Object.freeze({
    id: "enemy__burn__swarm",
    shape: "SWARM",
    labelKo: "달군 잉걸",
    asset: asset("enemy__burn__swarm", "/assets/enemies/enemy__burn__swarm.png"),
    assetId: "enemy__burn__swarm",
    assetPath: "/assets/enemies/enemy__burn__swarm.png",
  }),
  Object.freeze({
    id: "enemy__burn__bulk",
    shape: "BULK",
    labelKo: "그을린 심지",
    asset: asset("enemy__burn__bulk", "/assets/enemies/enemy__burn__bulk.png"),
    assetId: "enemy__burn__bulk",
    assetPath: "/assets/enemies/enemy__burn__bulk.png",
  }),
  Object.freeze({
    id: "enemy__burn__shell",
    shape: "SHELL",
    labelKo: "눌어붙은 재",
    asset: asset("enemy__burn__shell", "/assets/enemies/enemy__burn__shell.png"),
    assetId: "enemy__burn__shell",
    assetPath: "/assets/enemies/enemy__burn__shell.png",
  }),
  Object.freeze({
    id: "enemy__burn__reach",
    shape: "REACH",
    labelKo: "뜨거운 열",
    asset: asset("enemy__burn__reach", "/assets/enemies/enemy__burn__reach.png"),
    assetId: "enemy__burn__reach",
    assetPath: "/assets/enemies/enemy__burn__reach.png",
  }),
  Object.freeze({
    id: "enemy__burn__mimic",
    shape: "MIMIC",
    labelKo: "불붙은 불티",
    asset: asset("enemy__burn__mimic", "/assets/enemies/enemy__burn__mimic.png"),
    assetId: "enemy__burn__mimic",
    assetPath: "/assets/enemies/enemy__burn__mimic.png",
  }),
]);

const ELITE: EliteEnemyDescriptor = Object.freeze({
  id: "elite__burn__scatter",
  labelKo: "폭발",
  mechanicId: "BLAST",
  mechanic: Object.freeze({ id: "BLAST", status: "PENDING_2026_08_21" }),
  asset: asset("elite__burn__scatter", "/assets/enemies/elite__burn__scatter.png"),
  assetId: "elite__burn__scatter",
  assetPath: "/assets/enemies/elite__burn__scatter.png",
});

const BOSS: BossEnemyDescriptor = Object.freeze({
  id: "the_burning",
  name: "The Burning",
  labelKo: "사름, 꺼지지 못한 신",
  mechanicId: "BURNOUT",
  mechanic: Object.freeze({ id: "BURNOUT", status: "PENDING_2026_08_21" }),
  asset: asset("heart__burn", "/assets/cards/heart__burn.png"),
  assetId: "heart__burn",
  assetPath: "/assets/cards/heart__burn.png",
  reusesCardAssetId: "heart__burn",
});

const EVENTS: readonly EventDescriptor[] = Object.freeze([
  Object.freeze({
    type: "CACHE",
    labelKo: "조각 무더기",
    asset: asset("event__cache__burn", "/assets/events/event__cache__burn.png"),
    assetId: "event__cache__burn",
    assetPath: "/assets/events/event__cache__burn.png",
  }),
  Object.freeze({
    type: "WORKSHOP",
    labelKo: "버려진 공방",
    asset: asset("event__workshop", "/assets/events/event__workshop.png"),
    assetId: "event__workshop",
    assetPath: "/assets/events/event__workshop.png",
  }),
  Object.freeze({
    type: "COLLAPSE",
    labelKo: "무너진 갱도",
    asset: asset("event__collapse__burn", "/assets/events/event__collapse__burn.png"),
    assetId: "event__collapse__burn",
    assetPath: "/assets/events/event__collapse__burn.png",
  }),
  Object.freeze({
    type: "FICTOR",
    labelKo: "다른 빚는 자",
    asset: asset("event__fictor", "/assets/events/event__fictor.png"),
    assetId: "event__fictor",
    assetPath: "/assets/events/event__fictor.png",
  }),
  Object.freeze({
    type: "RECORD",
    labelKo: "옛 기록",
    asset: asset("event__record", "/assets/events/event__record.png"),
    assetId: "event__record",
    assetPath: "/assets/events/event__record.png",
  }),
  Object.freeze({
    type: "ODDITY",
    labelKo: "이상한 것",
    asset: asset("event__oddity__burn", "/assets/events/event__oddity__burn.png"),
    assetId: "event__oddity__burn",
    assetPath: "/assets/events/event__oddity__burn.png",
  }),
]);

export const BURN_GROUND_ENCOUNTERS: GroundEncounters = Object.freeze({
  normals: NORMALS,
  elite: ELITE,
  boss: BOSS,
});

export const BURN_GROUND_EVENTS = EVENTS;

export const BURN_GROUND_REWARDS: GroundRewardMapping = Object.freeze({
  normal: Object.freeze({
    source: "NORMAL",
    allowedMaterialCategories: Object.freeze(["ORE", "GROUND_PRODUCT"] as const),
    origin: "GROUND_BURN",
  }),
  elite: Object.freeze({
    source: "ELITE",
    allowedMaterialCategories: Object.freeze(["TOOL", "ODDITY"] as const),
  }),
  boss: Object.freeze({ source: "BOSS", heartId: "heart__burn" }),
});

export const BURN_GROUND_DESCRIPTOR: GroundDescriptor = Object.freeze({
  id: "GROUND_BURN",
  nameKo: "사름의 터",
  labelKo: "사름의 터",
  attribute: "BURN",
  status: "ENABLED",
  enabled: true,
  depths: DEPTHS,
  encounters: BURN_GROUND_ENCOUNTERS,
  rewards: BURN_GROUND_REWARDS,
  events: EVENTS,
});

export const GROUND_BURN_DESCRIPTOR = BURN_GROUND_DESCRIPTOR;

export default BURN_GROUND_DESCRIPTOR;
