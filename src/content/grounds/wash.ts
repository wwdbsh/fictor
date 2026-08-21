import { createEnabledGround } from "./factory";

export const WASH_GROUND_DESCRIPTOR = createEnabledGround({
  id: "GROUND_WASH",
  stem: "wash",
  nameKo: "씻음의 터",
  attribute: "WASH",
  depthLabels: ["닳은 돌밭", "매끈하게 파인 수로", "완전한 공백"],
  normalLabels: ["맑은 눈물", "닳은 돌", "빈 껍질", "지워진 자국", "가라앉은 앙금"],
  elite: { id: "elite__wash__join", labelKo: "더 맑아진 것", mechanicId: "CLARIFIED" },
  boss: {
    id: "the_washing",
    name: "The Washing",
    labelKo: "씻음, 흔적을 지운 신",
    mechanicId: "EMPTIED",
    heartId: "heart__wash",
  },
  eventAssetOverrides: {
    CACHE: "event__cache__wash",
    COLLAPSE: "event__collapse__wash",
    ODDITY: "event__oddity__wash",
  },
});

export const WASH_GROUND_ENCOUNTERS = /* @__PURE__ */ (() => WASH_GROUND_DESCRIPTOR.encounters!)();
export const WASH_GROUND_EVENTS = /* @__PURE__ */ (() => WASH_GROUND_DESCRIPTOR.events)();
export const WASH_GROUND_REWARDS = /* @__PURE__ */ (() => WASH_GROUND_DESCRIPTOR.rewards!)();
export const GROUND_WASH_DESCRIPTOR = WASH_GROUND_DESCRIPTOR;

export default WASH_GROUND_DESCRIPTOR;
