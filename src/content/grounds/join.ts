import { createEnabledGround } from "./factory";
import { PUBLIC_NAMES } from "../public-names";

export const JOIN_GROUND_DESCRIPTOR = createEnabledGround({
  id: "GROUND_JOIN",
  stem: "join",
  nameKo: `${PUBLIC_NAMES.elderGods.the_joining.ko}의 터`,
  attribute: "JOIN",
  depthLabels: ["붙기 시작한 것들", "구분 불가능한 덩어리", "하나의 거대한 유기체"],
  normalLabels: ["엉킨 실", "붙은 손", "자란 매듭", "이어진 그림자", "겹친 소리"],
  elite: { id: "elite__join__still", labelKo: "더 굳은 것", mechanicId: "HARDENED" },
  boss: {
    id: "the_joining",
    name: PUBLIC_NAMES.elderGods.the_joining.en,
    labelKo: `${PUBLIC_NAMES.elderGods.the_joining.ko}, 아무것도 아니었던 신`,
    mechanicId: "KNOT",
    heartId: "heart__join",
  },
  eventAssetOverrides: {
    CACHE: "event__cache__join",
    ODDITY: "event__oddity__join",
  },
});

export const JOIN_GROUND_ENCOUNTERS = /* @__PURE__ */ (() => JOIN_GROUND_DESCRIPTOR.encounters!)();
export const JOIN_GROUND_EVENTS = /* @__PURE__ */ (() => JOIN_GROUND_DESCRIPTOR.events)();
export const JOIN_GROUND_REWARDS = /* @__PURE__ */ (() => JOIN_GROUND_DESCRIPTOR.rewards!)();
export const GROUND_JOIN_DESCRIPTOR = JOIN_GROUND_DESCRIPTOR;

export default JOIN_GROUND_DESCRIPTOR;
