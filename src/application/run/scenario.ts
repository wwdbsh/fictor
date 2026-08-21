import { RUN_SCENARIO_SCHEMA_VERSION, type RunScenarioV1 } from "./types";
import { freeze } from "../../freeze";

export const STILLKIN_PRODUCTION_SCENARIO_V1: RunScenarioV1 = freeze({
  schemaVersion: RUN_SCENARIO_SCHEMA_VERSION,
  scenarioId: "stillkin-production-v1",
  status: "CONFIGURATION_PENDING",
  raceId: "Stillkin",
  groundId: "GROUND_STILL",
  nodes: freeze([]),
  pendingReasons: freeze([
    "combat numeric configuration pending 2026-08-21",
    "reward quantities and route probabilities pending",
    "event economy and starting fuel pending",
  ]),
});
