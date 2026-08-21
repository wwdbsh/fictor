import { createEnabledGround } from "./factory";

export const BURN_GROUND_DESCRIPTOR = createEnabledGround({
  id: "GROUND_BURN",
  stem: "burn",
  nameKo: "사름의 터",
  attribute: "BURN",
  depthLabels: ["식은 재밭", "균열 사이로 보이는 불빛", "꺼지지 않는 화심"],
  normalLabels: ["달군 잉걸", "그을린 심지", "눌어붙은 재", "뜨거운 열", "불붙은 불티"],
  elite: { id: "elite__burn__scatter", labelKo: "폭발", mechanicId: "BLAST" },
  boss: {
    id: "the_burning",
    name: "The Burning",
    labelKo: "사름, 꺼지지 못한 신",
    mechanicId: "BURNOUT",
    heartId: "heart__burn",
  },
  eventAssetOverrides: {
    CACHE: "event__cache__burn",
    COLLAPSE: "event__collapse__burn",
    ODDITY: "event__oddity__burn",
  },
});

export const BURN_GROUND_ENCOUNTERS = /* @__PURE__ */ (() => BURN_GROUND_DESCRIPTOR.encounters!)();
export const BURN_GROUND_EVENTS = /* @__PURE__ */ (() => BURN_GROUND_DESCRIPTOR.events)();
export const BURN_GROUND_REWARDS = /* @__PURE__ */ (() => BURN_GROUND_DESCRIPTOR.rewards!)();
export const GROUND_BURN_DESCRIPTOR = BURN_GROUND_DESCRIPTOR;

export default BURN_GROUND_DESCRIPTOR;
