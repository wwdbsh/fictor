import { createEnabledGround } from "./factory";

export const ROT_GROUND_DESCRIPTOR = createEnabledGround({
  id: "GROUND_ROT",
  stem: "rot",
  nameKo: "삭음의 터",
  attribute: "ROT",
  depthLabels: ["주저앉은 지표", "겹겹이 무너진 층", "바닥이 계속 내려앉는 곳"],
  normalLabels: ["딱지", "무른 뿌리", "곰팡이 꽃", "번지는 얼룩", "내려앉은 냄새"],
  elite: { id: "elite__rot__wash", labelKo: "중화", mechanicId: "NEUTRALIZED" },
  boss: {
    id: "the_rotting",
    name: "The Rotting",
    labelKo: "삭음, 스스로를 먹은 신",
    mechanicId: "SELF_EATING",
    heartId: "heart__rot",
  },
  eventAssetOverrides: {
    CACHE: "event__cache__rot",
    ODDITY: "event__oddity__rot",
  },
});

export const ROT_GROUND_ENCOUNTERS = /* @__PURE__ */ (() => ROT_GROUND_DESCRIPTOR.encounters!)();
export const ROT_GROUND_EVENTS = /* @__PURE__ */ (() => ROT_GROUND_DESCRIPTOR.events)();
export const ROT_GROUND_REWARDS = /* @__PURE__ */ (() => ROT_GROUND_DESCRIPTOR.rewards!)();
export const GROUND_ROT_DESCRIPTOR = ROT_GROUND_DESCRIPTOR;

export default ROT_GROUND_DESCRIPTOR;
