import { createEnabledGround } from "./factory";
import { PUBLIC_NAMES } from "../public-names";

export const SCATTER_GROUND_DESCRIPTOR = createEnabledGround({
  id: "GROUND_SCATTER",
  stem: "scatter",
  nameKo: `${PUBLIC_NAMES.elderGods.the_scattering.ko}의 터`,
  attribute: "SCATTER",
  depthLabels: ["먼지 자욱한 분지", "떠 있는 바위 군", "지면이 아예 없는 공중"],
  normalLabels: ["가벼운 뼈", "흩날리는 씨", "벗겨진 껍데기", "뜬 먼지", "마른 바람"],
  elite: { id: "elite__scatter__rot", labelKo: "번짐", mechanicId: "SPREADING" },
  boss: {
    id: "the_scattering",
    name: PUBLIC_NAMES.elderGods.the_scattering.en,
    labelKo: `${PUBLIC_NAMES.elderGods.the_scattering.ko}, 붙잡히지 않은 신`,
    mechanicId: "DISPERSAL",
    heartId: "heart__scatter",
  },
  eventAssetOverrides: {
    CACHE: "event__cache__scatter",
    ODDITY: "event__oddity__scatter",
  },
});

export const SCATTER_GROUND_ENCOUNTERS = /* @__PURE__ */ (() => SCATTER_GROUND_DESCRIPTOR.encounters!)();
export const SCATTER_GROUND_EVENTS = /* @__PURE__ */ (() => SCATTER_GROUND_DESCRIPTOR.events)();
export const SCATTER_GROUND_REWARDS = /* @__PURE__ */ (() => SCATTER_GROUND_DESCRIPTOR.rewards!)();
export const GROUND_SCATTER_DESCRIPTOR = SCATTER_GROUND_DESCRIPTOR;

export default SCATTER_GROUND_DESCRIPTOR;
