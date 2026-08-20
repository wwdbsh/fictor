import type { RaceDescriptor } from "../types";

export const STILLKIN_DESCRIPTOR: RaceDescriptor = Object.freeze({
  id: "Stillkin",
  nameKo: "어름붙이",
  labelKo: "어름붙이",
  attribute: "STILL",
  status: "ENABLED",
  enabled: true,
  groundIds: Object.freeze(["GROUND_STILL", "GROUND_BURN", "GROUND_SCATTER"] as const),
  policyId: "Stillkin",
});

export default STILLKIN_DESCRIPTOR;
