import { getMaterialAuthorityEntry, selectBoundReward } from "../../domain/rewards";
import { selectEventChoice } from "../../domain/events";
import { decodeRunFlowCommand, decodeRunFlowState } from "./boundary";
import {
  RUN_FLOW_ENGINE_VERSION,
  RUN_FLOW_SCHEMA_VERSION,
  type EncounterNodeV1,
  type EventNodeV1,
  type RunFlowCommandV1,
  type RunFlowEventV1,
  type RunFlowResultV1,
  type RunFlowStateV1,
  type RunScenarioV1,
} from "./types";

export function createDormantRunFlowState(): RunFlowStateV1 {
  return {
    schemaVersion: RUN_FLOW_SCHEMA_VERSION,
    engineVersion: RUN_FLOW_ENGINE_VERSION,
    revision: 0,
    phase: "DORMANT",
    scenario: null,
    nextNodeIndex: 0,
    currentNodeIndex: null,
    pendingReward: null,
    workshopEntitlements: 0,
    grantedUniqueToolIds: [],
  };
}

function reject(state: RunFlowStateV1, command: RunFlowCommandV1["type"] | "UNKNOWN", reason: string): RunFlowResultV1 {
  return { state, applied: false, events: [{ type: "COMMAND_REJECTED", command, reason }] };
}

function commit(state: RunFlowStateV1, events: RunFlowEventV1[]): RunFlowResultV1 {
  if (state.revision === Number.MAX_SAFE_INTEGER) return reject(state, "UNKNOWN", "REVISION_EXHAUSTED");
  const decoded = decodeRunFlowState({ ...state, revision: state.revision + 1 });
  return decoded ? { state: decoded, applied: true, events } : reject(state, "UNKNOWN", "POSTCONDITION_FAILED");
}

function start(state: RunFlowStateV1, scenario: RunScenarioV1, tools: readonly string[], restarted: boolean): RunFlowResultV1 {
  if (scenario.status !== "APPROVED") return reject(state, restarted ? "RESTART" : "START", "CONFIGURATION_PENDING");
  return commit({
    ...state,
    phase: "BETWEEN_NODES",
    scenario,
    nextNodeIndex: 0,
    currentNodeIndex: null,
    pendingReward: null,
    workshopEntitlements: 0,
    grantedUniqueToolIds: [...tools].sort(),
  }, [{ type: restarted ? "RUN_RESTARTED" : "RUN_STARTED", scenarioId: scenario.scenarioId }]);
}

function currentEncounter(state: RunFlowStateV1): EncounterNodeV1 | null {
  const node = state.currentNodeIndex === null ? undefined : state.scenario?.nodes[state.currentNodeIndex];
  return node?.kind === "ENCOUNTER" ? node : null;
}

function currentEvent(state: RunFlowStateV1): EventNodeV1 | null {
  const node = state.currentNodeIndex === null ? undefined : state.scenario?.nodes[state.currentNodeIndex];
  return node?.kind === "EVENT" ? node : null;
}

export function reduceRunFlow(rawState: unknown, rawCommand: unknown): RunFlowResultV1 {
  const state = decodeRunFlowState(rawState);
  if (!state) return { state: createDormantRunFlowState(), applied: false, events: [{ type: "COMMAND_REJECTED", command: "UNKNOWN", reason: "INVALID_STATE" }] };
  const command = decodeRunFlowCommand(rawCommand);
  if (!command) return reject(state, "UNKNOWN", "INVALID_COMMAND");

  switch (command.type) {
    case "START":
      if (state.phase !== "DORMANT") return reject(state, command.type, "INVALID_PHASE");
      return start(state, command.scenario, command.ownedUniqueToolIds, false);
    case "RESTART":
      if (state.phase !== "RUN_WON" && state.phase !== "RUN_LOST") return reject(state, command.type, "INVALID_PHASE");
      return start(state, command.scenario, command.ownedUniqueToolIds, true);
    case "ENTER_NEXT_NODE": {
      if (state.phase !== "BETWEEN_NODES" || !state.scenario) return reject(state, command.type, "INVALID_PHASE");
      const node = state.scenario.nodes[state.nextNodeIndex];
      if (!node) return reject(state, command.type, "NO_NEXT_NODE");
      return commit({
        ...state,
        phase: node.kind === "ENCOUNTER" ? "IN_COMBAT" : "IN_EVENT",
        currentNodeIndex: state.nextNodeIndex,
        nextNodeIndex: state.nextNodeIndex + 1,
        pendingReward: null,
      }, [{ type: "NODE_ENTERED", nodeId: node.nodeId }]);
    }
    case "RESOLVE_COMBAT": {
      if (state.phase !== "IN_COMBAT") return reject(state, command.type, "INVALID_PHASE");
      const encounter = currentEncounter(state);
      if (!encounter) return reject(state, command.type, "INVALID_NODE");
      if (command.result === "DEFEAT") return commit({ ...state, phase: "RUN_LOST", pendingReward: null }, [
        { type: "COMBAT_CLEANED" }, { type: "RUN_LOST" },
      ]);
      const events: RunFlowEventV1[] = [{ type: "COMBAT_CLEANED" }, { type: "ENCOUNTER_WON", encounterId: encounter.encounterId }];
      if (encounter.encounterKind === "BOSS") {
        events.push({ type: "HEART_OWNED", heartId: "heart__still" }, { type: "RUN_WON" });
        return commit({ ...state, phase: "RUN_WON", pendingReward: null }, events);
      }
      if (!encounter.rewardOffer) return reject(state, command.type, "REWARD_NOT_BOUND");
      events.push({ type: "REWARD_AVAILABLE", offerId: encounter.rewardOffer.offerId });
      return commit({ ...state, phase: "AWAITING_REWARD", pendingReward: encounter.rewardOffer }, events);
    }
    case "CHOOSE_REWARD": {
      if (state.phase !== "AWAITING_REWARD" || !state.pendingReward) return reject(state, command.type, "INVALID_PHASE");
      const choice = selectBoundReward(state.pendingReward, command.choiceId);
      if (!choice) return reject(state, command.type, "CHOICE_NOT_BOUND");
      const tools = [...state.grantedUniqueToolIds];
      if (choice.kind === "MATERIAL" && getMaterialAuthorityEntry(choice.materialId)?.category === "TOOL") {
        if (tools.includes(choice.materialId)) return reject(state, command.type, "UNIQUE_TOOL_ALREADY_OWNED");
        tools.push(choice.materialId);
        tools.sort();
      }
      return commit({ ...state, phase: "BETWEEN_NODES", pendingReward: null, grantedUniqueToolIds: tools }, [{ type: "REWARD_SELECTED", choice }]);
    }
    case "RESOLVE_EVENT": {
      if (state.phase !== "IN_EVENT") return reject(state, command.type, "INVALID_PHASE");
      const event = currentEvent(state);
      if (!event) return reject(state, command.type, "INVALID_NODE");
      const choice = selectEventChoice({ eventType: event.eventType, choices: event.choices }, command.choiceId);
      if (!choice) return reject(state, command.type, "CHOICE_NOT_BOUND");
      let entitlements = state.workshopEntitlements;
      const events: RunFlowEventV1[] = [{ type: "EVENT_RESOLVED", effect: choice.effect }];
      const tools = [...state.grantedUniqueToolIds];
      if (choice.effect.kind === "WORKSHOP_ENTITLEMENT") {
        if (entitlements === Number.MAX_SAFE_INTEGER) return reject(state, command.type, "ENTITLEMENT_EXHAUSTED");
        entitlements += 1;
        events.push({ type: "WORKSHOP_ENTITLEMENT_GRANTED", remaining: entitlements });
      } else if (choice.effect.kind === "REWARD") {
        const effect = choice.effect;
        const rewards = effect.rewardChoiceIds.map((choiceId) => selectBoundReward(effect.offer, choiceId));
        if (rewards.some((reward) => reward === undefined)) return reject(state, command.type, "CHOICE_NOT_BOUND");
        for (const reward of rewards) {
          if (!reward) continue;
          if (reward.kind === "MATERIAL" && getMaterialAuthorityEntry(reward.materialId)?.category === "TOOL") {
            if (tools.includes(reward.materialId)) return reject(state, command.type, "UNIQUE_TOOL_ALREADY_OWNED");
            tools.push(reward.materialId);
            tools.sort();
          }
          events.push({ type: "REWARD_SELECTED", choice: reward });
        }
      }
      return commit({ ...state, phase: "EVENT_RESOLVED", workshopEntitlements: entitlements, grantedUniqueToolIds: tools }, events);
    }
    case "LEAVE_EVENT":
      if (state.phase !== "EVENT_RESOLVED") return reject(state, command.type, "INVALID_PHASE");
      if (currentEvent(state)?.eventType === "WORKSHOP" && state.workshopEntitlements > 0) return reject(state, command.type, "WORKSHOP_ENTITLEMENT_UNSETTLED");
      return commit({ ...state, phase: "BETWEEN_NODES" }, []);
    case "SETTLE_FREE_WORKSHOP":
      if (state.phase !== "EVENT_RESOLVED" || currentEvent(state)?.eventType !== "WORKSHOP") return reject(state, command.type, "INVALID_PHASE");
      if (state.workshopEntitlements === 0) return reject(state, command.type, "NO_WORKSHOP_ENTITLEMENT");
      if (command.outcome === "FAILED") return { state, applied: false, events: [{ type: "WORKSHOP_EXECUTION_FAILED", remaining: state.workshopEntitlements }] };
      return commit({ ...state, workshopEntitlements: state.workshopEntitlements - 1 }, [
        { type: "WORKSHOP_ENTITLEMENT_CONSUMED", remaining: state.workshopEntitlements - 1 },
      ]);
  }
}
