import type { RaceDescriptor } from "../types";

export const JOINKIN_DESCRIPTOR: RaceDescriptor = Object.freeze({
  id: "Joinkin",
  nameKo: "이음붙이",
  labelKo: "이음붙이",
  attribute: "JOIN",
  status: "ENABLED",
  enabled: true,
  groundIds: Object.freeze(["GROUND_STILL", "GROUND_BURN", "GROUND_SCATTER"] as const),
  policyId: "Joinkin",
});

export default JOINKIN_DESCRIPTOR;
