import { RUN_SCENARIO_SCHEMA_VERSION, type RunScenarioV1 } from "./types";

export const STILLKIN_PRODUCTION_SCENARIO_V1: RunScenarioV1 = Object.freeze({
  schemaVersion: RUN_SCENARIO_SCHEMA_VERSION,
  scenarioId: "stillkin-production-v1",
  status: "CONFIGURATION_PENDING",
  raceId: "Stillkin",
  groundId: "GROUND_STILL",
  nodes: Object.freeze([]),
  pendingReasons: Object.freeze([
    "combat numeric configuration pending 2026-08-21",
    "reward quantities and route probabilities pending",
    "event economy and starting fuel pending",
  ]),
});
