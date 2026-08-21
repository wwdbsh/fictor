import type { RaceDescriptor } from "../types";
import { freeze } from "../../freeze";

export const STILLKIN_DESCRIPTOR: RaceDescriptor = freeze({
  id: "Stillkin",
  nameKo: "어름붙이",
  labelKo: "어름붙이",
  attribute: "STILL",
  status: "ENABLED",
  enabled: true,
  groundIds: freeze(["GROUND_STILL", "GROUND_BURN", "GROUND_SCATTER", "GROUND_ROT"] as const),
  policyId: "Stillkin",
});

export default STILLKIN_DESCRIPTOR;
