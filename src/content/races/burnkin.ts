import type { RaceDescriptor } from "../types";

export const BURNKIN_DESCRIPTOR: RaceDescriptor = Object.freeze({
  id: "Burnkin",
  nameKo: "사름붙이",
  labelKo: "사름붙이",
  attribute: "BURN",
  status: "ENABLED",
  enabled: true,
  groundIds: Object.freeze(["GROUND_STILL", "GROUND_BURN"] as const),
  policyId: "Burnkin",
});

export default BURNKIN_DESCRIPTOR;
