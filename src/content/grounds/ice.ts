import { createEnabledGround } from "./factory";

export const ICE_GROUND_DESCRIPTOR = createEnabledGround({
  id: "GROUND_STILL",
  stem: "still",
  nameKo: "어름의 터",
  attribute: "STILL",
  depthLabels: ["서리 낀 들판", "얼어붙은 폭포와 계단", "완전히 정지한 거대 구조"],
  normalLabels: ["무리", "덩치", "껍데기", "손길", "흉내"],
  elite: { id: "elite__still__burn", labelKo: "눌린 불", mechanicId: "PRESSED_FIRE" },
  boss: {
    id: "the_stilling",
    name: "The Stilling",
    labelKo: "어름, 처음 멈춘 신",
    mechanicId: "TOTAL_STOP",
    heartId: "heart__still",
  },
  eventAssetOverrides: {
    CACHE: "event__cache__still",
    ODDITY: "event__oddity__still",
  },
});

export const STILL_GROUND_ENCOUNTERS = /* @__PURE__ */ (() => ICE_GROUND_DESCRIPTOR.encounters!)();
export const STILL_GROUND_EVENTS = /* @__PURE__ */ (() => ICE_GROUND_DESCRIPTOR.events)();
export const STILL_GROUND_REWARDS = /* @__PURE__ */ (() => ICE_GROUND_DESCRIPTOR.rewards!)();
export const GROUND_STILL_DESCRIPTOR = ICE_GROUND_DESCRIPTOR;

export default ICE_GROUND_DESCRIPTOR;
