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
    label: "서리 낀 들판",
    labelKo: "서리 낀 들판",
    asset: asset("background__still__depth_01", "/assets/backgrounds/background__still__depth_01.png"),
    assetId: "background__still__depth_01",
    assetPath: "/assets/backgrounds/background__still__depth_01.png",
  }),
  Object.freeze({
    depth: 2,
    label: "얼어붙은 폭포와 계단",
    labelKo: "얼어붙은 폭포와 계단",
    asset: asset("background__still__depth_02", "/assets/backgrounds/background__still__depth_02.png"),
    assetId: "background__still__depth_02",
    assetPath: "/assets/backgrounds/background__still__depth_02.png",
  }),
  Object.freeze({
    depth: 3,
    label: "완전히 정지한 거대 구조",
    labelKo: "완전히 정지한 거대 구조",
    asset: asset("background__still__depth_03", "/assets/backgrounds/background__still__depth_03.png"),
    assetId: "background__still__depth_03",
    assetPath: "/assets/backgrounds/background__still__depth_03.png",
  }),
]);

const NORMALS: readonly NormalEnemyDescriptor[] = Object.freeze([
  Object.freeze({
    id: "enemy__still__swarm",
    shape: "SWARM",
    labelKo: "무리",
    asset: asset("enemy__still__swarm", "/assets/enemies/enemy__still__swarm.png"),
    assetId: "enemy__still__swarm",
    assetPath: "/assets/enemies/enemy__still__swarm.png",
  }),
  Object.freeze({
    id: "enemy__still__bulk",
    shape: "BULK",
    labelKo: "덩치",
    asset: asset("enemy__still__bulk", "/assets/enemies/enemy__still__bulk.png"),
    assetId: "enemy__still__bulk",
    assetPath: "/assets/enemies/enemy__still__bulk.png",
  }),
  Object.freeze({
    id: "enemy__still__shell",
    shape: "SHELL",
    labelKo: "껍데기",
    asset: asset("enemy__still__shell", "/assets/enemies/enemy__still__shell.png"),
    assetId: "enemy__still__shell",
    assetPath: "/assets/enemies/enemy__still__shell.png",
  }),
  Object.freeze({
    id: "enemy__still__reach",
    shape: "REACH",
    labelKo: "손길",
    asset: asset("enemy__still__reach", "/assets/enemies/enemy__still__reach.png"),
    assetId: "enemy__still__reach",
    assetPath: "/assets/enemies/enemy__still__reach.png",
  }),
  Object.freeze({
    id: "enemy__still__mimic",
    shape: "MIMIC",
    labelKo: "흉내",
    asset: asset("enemy__still__mimic", "/assets/enemies/enemy__still__mimic.png"),
    assetId: "enemy__still__mimic",
    assetPath: "/assets/enemies/enemy__still__mimic.png",
  }),
]);

const ELITE: EliteEnemyDescriptor = Object.freeze({
  id: "elite__still__burn",
  labelKo: "눌린 불",
  mechanicId: "PRESSED_FIRE",
  mechanic: Object.freeze({ id: "PRESSED_FIRE", status: "PENDING_2026_08_21" }),
  asset: asset("elite__still__burn", "/assets/enemies/elite__still__burn.png"),
  assetId: "elite__still__burn",
  assetPath: "/assets/enemies/elite__still__burn.png",
});

const BOSS: BossEnemyDescriptor = Object.freeze({
  id: "the_stilling",
  name: "The Stilling",
  labelKo: "어름, 처음 멈춘 신",
  mechanicId: "TOTAL_STOP",
  mechanic: Object.freeze({ id: "TOTAL_STOP", status: "PENDING_2026_08_21" }),
  asset: asset("heart__still", "/assets/cards/heart__still.png"),
  assetId: "heart__still",
  assetPath: "/assets/cards/heart__still.png",
  reusesCardAssetId: "heart__still",
});

const EVENTS: readonly EventDescriptor[] = Object.freeze([
  Object.freeze({
    type: "CACHE",
    labelKo: "조각 무더기",
    asset: asset("event__cache__still", "/assets/events/event__cache__still.png"),
    assetId: "event__cache__still",
    assetPath: "/assets/events/event__cache__still.png",
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
    asset: asset("event__collapse", "/assets/events/event__collapse.png"),
    assetId: "event__collapse",
    assetPath: "/assets/events/event__collapse.png",
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
    asset: asset("event__oddity__still", "/assets/events/event__oddity__still.png"),
    assetId: "event__oddity__still",
    assetPath: "/assets/events/event__oddity__still.png",
  }),
]);

export const STILL_GROUND_ENCOUNTERS: GroundEncounters = Object.freeze({
  normals: NORMALS,
  elite: ELITE,
  boss: BOSS,
});

export const STILL_GROUND_EVENTS = EVENTS;

export const STILL_GROUND_REWARDS: GroundRewardMapping = Object.freeze({
  normal: Object.freeze({
    source: "NORMAL",
    allowedMaterialCategories: Object.freeze(["ORE", "GROUND_PRODUCT"] as const),
    origin: "GROUND_STILL",
  }),
  elite: Object.freeze({
    source: "ELITE",
    allowedMaterialCategories: Object.freeze(["TOOL", "ODDITY"] as const),
  }),
  boss: Object.freeze({ source: "BOSS", heartId: "heart__still" }),
});

export const ICE_GROUND_DESCRIPTOR: GroundDescriptor = Object.freeze({
  id: "GROUND_STILL",
  nameKo: "어름의 터",
  labelKo: "어름의 터",
  attribute: "STILL",
  status: "ENABLED",
  enabled: true,
  depths: DEPTHS,
  encounters: STILL_GROUND_ENCOUNTERS,
  rewards: STILL_GROUND_REWARDS,
  events: EVENTS,
});

export const GROUND_STILL_DESCRIPTOR = ICE_GROUND_DESCRIPTOR;

export default ICE_GROUND_DESCRIPTOR;
