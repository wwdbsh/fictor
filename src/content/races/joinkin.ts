import type { RaceDescriptor } from "../types";
import { freeze } from "../../freeze";

export const JOINKIN_DESCRIPTOR: RaceDescriptor = freeze({
  id: "Joinkin",
  nameKo: "이음붙이",
  labelKo: "이음붙이",
  attribute: "JOIN",
  status: "ENABLED",
  enabled: true,
  groundIds: freeze(["GROUND_STILL", "GROUND_BURN", "GROUND_SCATTER", "GROUND_ROT"] as const),
  policyId: "Joinkin",
});

export default JOINKIN_DESCRIPTOR;
