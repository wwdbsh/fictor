import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { BROWSER_RUNTIME_PACKET } from "../../src/application/browser";
import {
  createBurnkinTrack1Controller,
  createJoinkinTrack1Controller,
  createStillkinTrack1Controller,
  type StillkinTrack1Controller,
} from "../../src/application/run/stillkin-track1-controller";
import type {
  StillkinTrack1DispatchResult,
  StillkinTrack1Event,
  StillkinTrack1Snapshot,
  Track1RaceId,
} from "../../src/application/run/track1-types";
import lawsSource from "../../src/data/source/laws.json";
import materialsSource from "../../src/data/source/materials.json";
import type { ForgeAttribute } from "../../src/domain/forge";

export const T042_BASELINE = {
  taskKey: "T042",
  gitRevision: "4465dab1f70c600654bd2fb997627e7482f2c953",
  distTreeSha256: "fbd45ca32a50fdb35f98997a1bdbfbe8dc620e0c84637b5d77dfabc8d51aac58",
  sourceHash: BROWSER_RUNTIME_PACKET.sourceHash,
  runtimeGroundId: "GROUND_STILL",
} as const;

export const RECOMMENDED_TUNING = {
  status: "PROPOSED_NOT_APPROVED",
  SAME_BONUS: 1,
  COST_DIVISOR: 3,
  RESONANCE_RATE: 0.08,
  powerCoefficientByEffect: {
    DELAYED_EXPLOSION: 2.25,
    SLOW_TARGET: 0.75,
    EXTEND_DOT: 0.75,
    PERMANENT_BLOCK: 1.75,
    AMPLIFY_STILL: 0.9,
    BURST_AOE: 1.5,
    EXILE_AND_DAMAGE: 1.5,
    DEBUFF_TO_DAMAGE: 1.25,
    AMPLIFY_BURN: 1,
    SPREAD_DEBUFF: 0.75,
    EXILE: 0.75,
    AMPLIFY_SCATTER: 0.9,
    RESET_STATES: 0.75,
    AMPLIFY_ROT: 1,
    AMPLIFY_WASH: 0.9,
    MASSIVE_BLOCK: 2,
    MAX_DAMAGE: 2,
    MAX_EVASION: 1.75,
    HEAVY_DOT: 1.75,
    CLEAR_ALL_STATES: 1,
    DOUBLE_FORGE: 1,
  },
} as const;

export const CONSERVATIVE_ALTERNATIVE = {
  status: "PROPOSED_NOT_APPROVED",
  SAME_BONUS: 0,
  COST_DIVISOR: 2,
  RESONANCE_RATE: 0.05,
} as const;

export const CONSERVATIVE_DERIVATION = {
  powerCoefficientScale: 0.85,
} as const;

type MaterialSource = (typeof materialsSource)[number];
type LawSource = (typeof lawsSource)[number];
type ProposalKind = "RECOMMENDED" | "CONSERVATIVE";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

type EncounterMetrics = {
  encounterId: string;
  turns: number;
  cardPlays: number;
  damageDealt: number;
  damageTaken: number;
  blockGained: number;
  maxResonanceStreak: number;
  instantForges: number;
};

type RunMetrics = {
  race: Track1RaceId;
  groundId: "GROUND_STILL";
  terminalPhase: "RUN_WON";
  playerHpRemaining: number;
  fuelStart: number;
  fuelEnd: number;
  workshopPaidForges: number;
  workshopFreeForges: number;
  instantForges: number;
  encounters: EncounterMetrics[];
};

function base(snapshot: StillkinTrack1Snapshot) {
  return { expectedRevision: snapshot.flow.revision, runId: snapshot.flow.runId };
}

function primaryAttribute(material: MaterialSource): ForgeAttribute | "NONE" {
  return (Array.isArray(material.attribute) ? material.attribute[0] : material.attribute) as ForgeAttribute | "NONE";
}

function chooseOwnedMaterials(snapshot: StillkinTrack1Snapshot, count: 2 | 3): [string, string] | [string, string, string] {
  const candidates = snapshot.runtime.run.ownedInstances;
  for (let first = 0; first < candidates.length; first += 1) {
    for (let second = first + 1; second < candidates.length; second += 1) {
      if (candidates[first].cardId === candidates[second].cardId) continue;
      if (count === 2) return [candidates[first].instanceId, candidates[second].instanceId];
      if (candidates[first].cardId.startsWith("tool_") && candidates[second].cardId.startsWith("tool_")) continue;
      for (let third = second + 1; third < candidates.length; third += 1) {
        if (new Set([candidates[first].cardId, candidates[second].cardId, candidates[third].cardId]).size !== 3) continue;
        return [candidates[first].instanceId, candidates[second].instanceId, candidates[third].instanceId];
      }
    }
  }
  throw new Error(`No ${count}-material owned selection`);
}

function chooseHandMaterials(snapshot: StillkinTrack1Snapshot, count: 2 | 3): [string, string] | [string, string, string] | null {
  const active = snapshot.runtime.run.activeCombat;
  if (!active) return null;
  const candidates = active.state.zones.hand
    .map((instanceId) => active.state.instances.find((instance) => instance.instanceId === instanceId))
    .filter((instance): instance is NonNullable<typeof instance> => instance !== undefined && !instance.cardId.startsWith("forge__"));
  for (let first = 0; first < candidates.length; first += 1) {
    for (let second = first + 1; second < candidates.length; second += 1) {
      if (candidates[first].cardId === candidates[second].cardId) continue;
      if (count === 2) return [candidates[first].instanceId, candidates[second].instanceId];
      if (candidates[first].cardId.startsWith("tool_") && candidates[second].cardId.startsWith("tool_")) continue;
      for (let third = second + 1; third < candidates.length; third += 1) {
        if (new Set([candidates[first].cardId, candidates[second].cardId, candidates[third].cardId]).size !== 3) continue;
        return [candidates[first].instanceId, candidates[second].instanceId, candidates[third].instanceId];
      }
    }
  }
  return null;
}

function eventMetrics(events: readonly StillkinTrack1Event[], metrics: EncounterMetrics): void {
  for (const event of events) {
    if (event.type === "TURN_STARTED") metrics.turns = Math.max(metrics.turns, event.turn);
    if (event.type === "CARD_PLAYED") metrics.cardPlays += 1;
    if (event.type === "RESONANCE_ADVANCED") metrics.maxResonanceStreak = Math.max(metrics.maxResonanceStreak, event.streak);
    if (event.type === "FORGE_RESULT_CREATED" && event.mode === "INSTANT") metrics.instantForges += 1;
    if (event.type !== "OPERATION_APPLIED") continue;
    if (event.operation === "DAMAGE" && event.target.kind === "ENEMY" && event.source === "CARD") metrics.damageDealt += event.amount;
    if (event.operation === "DAMAGE" && event.target.kind === "PLAYER" && event.source === "ENEMY_INTENT") metrics.damageTaken += event.amount;
    if (event.operation === "GAIN_BLOCK" && event.target.kind === "PLAYER" && event.source === "CARD") metrics.blockGained += event.amount;
  }
}

function applied(result: StillkinTrack1DispatchResult, label: string): StillkinTrack1DispatchResult {
  if (!result.applied) throw new Error(`${label}: ${result.reason ?? "rejected"}`);
  return result;
}

function nextCombatCommand(snapshot: StillkinTrack1Snapshot) {
  const active = snapshot.runtime.run.activeCombat!;
  const binding = snapshot.flow.combatBinding!;
  if (active.state.phase === "TURN_READY") return { type: "START_TURN" as const };
  const playable = active.state.zones.hand.find((instanceId) => {
    const instance = active.state.instances.find((item) => item.instanceId === instanceId);
    const card = active.state.cards.find((item) => item.cardId === instance?.cardId);
    return card?.cost !== null && card !== undefined && card.cost <= active.state.player.energy;
  });
  if (!playable) return { type: "END_TURN" as const };
  const instance = active.state.instances.find((item) => item.instanceId === playable)!;
  const card = active.state.cards.find((item) => item.cardId === instance.cardId)!;
  const program = active.state.programs.find((item) => item.effectId === card.effectId)!;
  return {
    type: "PLAY_CARD" as const,
    instanceId: playable,
    target: program.targetRule.kind === "NONE" ? null : { kind: "ENEMY" as const, enemyId: binding.encounterId },
  };
}

function controllerFor(race: Track1RaceId): StillkinTrack1Controller {
  const options = {
    storage: new MemoryStorage(),
    resolverContext: BROWSER_RUNTIME_PACKET.resolverContext,
    generationFactory: () => `t042-${race.toLowerCase()}`,
  };
  if (race === "Burnkin") return createBurnkinTrack1Controller(options);
  if (race === "Joinkin") return createJoinkinTrack1Controller(options);
  return createStillkinTrack1Controller(options);
}

function runCombat(controller: StillkinTrack1Controller, allowInstantForge: boolean): { snapshot: StillkinTrack1Snapshot; metrics: EncounterMetrics } {
  let snapshot = controller.snapshot();
  const encounterId = snapshot.flow.combatBinding!.encounterId;
  const metrics: EncounterMetrics = { encounterId, turns: 0, cardPlays: 0, damageDealt: 0, damageTaken: 0, blockGained: 0, maxResonanceStreak: 0, instantForges: 0 };
  let forgePending = allowInstantForge;
  let steps = 0;
  while (snapshot.flow.phase === "IN_COMBAT") {
    if (steps++ > 1_000) throw new Error(`${snapshot.raceId}/${encounterId}: combat step limit`);
    const binding = snapshot.flow.combatBinding!;
    const active = snapshot.runtime.run.activeCombat!;
    if (active.state.phase === "TURN_READY") {
      const started = applied(controller.dispatch({ type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...binding, command: { type: "START_TURN" } }), "start turn");
      eventMetrics(started.events, metrics);
      snapshot = started.snapshot;
      continue;
    }
    if (forgePending) {
      const count = snapshot.raceId === "Joinkin" ? 3 : 2;
      const selected = chooseHandMaterials(snapshot, count);
      if (selected) {
        if (snapshot.raceId === "Joinkin") {
          const extended = applied(controller.dispatch({ type: "JOINKIN_EXTEND", expectedRevision: snapshot.flow.revision, ...binding }), "Joinkin extend");
          eventMetrics(extended.events, metrics);
          snapshot = extended.snapshot;
          const forged = applied(controller.dispatch({ type: "JOINKIN_FORGE_INSTANT", expectedRevision: snapshot.flow.revision, ...binding, materialInstanceIds: selected as [string, string, string] }), "Joinkin instant forge");
          eventMetrics(forged.events, metrics);
          snapshot = forged.snapshot;
        } else {
          const forged = applied(controller.dispatch({ type: "FORGE_INSTANT", expectedRevision: snapshot.flow.revision, ...binding, materialInstanceIds: selected as [string, string] }), "instant forge");
          eventMetrics(forged.events, metrics);
          snapshot = forged.snapshot;
        }
        forgePending = false;
        continue;
      }
    }
    const command = nextCombatCommand(snapshot);
    const result = applied(controller.dispatch({ type: "APPLY_COMBAT", expectedRevision: snapshot.flow.revision, ...binding, command }), `combat ${command.type}`);
    eventMetrics(result.events, metrics);
    snapshot = result.snapshot;
  }
  if (snapshot.flow.phase !== "AWAITING_REWARD" && snapshot.flow.phase !== "RUN_WON") throw new Error(`${snapshot.raceId}/${encounterId}: unexpected ${snapshot.flow.phase}`);
  return { snapshot, metrics };
}

function resolveEvent(controller: StillkinTrack1Controller, choiceId: string): StillkinTrack1Snapshot {
  let snapshot = controller.snapshot();
  const resolved = applied(controller.dispatch({ type: "RESOLVE_EVENT", ...base(snapshot), choiceId }), `event ${choiceId}`);
  snapshot = resolved.snapshot;
  if (snapshot.flow.phase === "EVENT_RESOLVED" && snapshot.flow.workshopEntitlementNodeId === null) {
    snapshot = applied(controller.dispatch({ type: "LEAVE_EVENT", ...base(snapshot) }), "leave event").snapshot;
  }
  return snapshot;
}

export function runRuntimePlaytest(race: Track1RaceId): RunMetrics {
  const controller = controllerFor(race);
  let snapshot = controller.load().snapshot;
  const fuelStart = snapshot.runtime.run.fuel;
  const paidSelection = chooseOwnedMaterials(snapshot, race === "Joinkin" ? 3 : 2);
  const paid = race === "Joinkin"
    ? controller.dispatch({ type: "JOINKIN_FORGE_WORKSHOP", ...base(snapshot), materialInstanceIds: paidSelection as [string, string, string] })
    : controller.dispatch({ type: "FORGE_WORKSHOP", ...base(snapshot), materialInstanceIds: paidSelection as [string, string] });
  snapshot = applied(paid, "paid workshop").snapshot;

  const encounters: EncounterMetrics[] = [];
  let workshopFreeForges = 0;
  while (snapshot.flow.phase !== "RUN_WON") {
    if (snapshot.flow.phase === "BETWEEN_NODES") {
      snapshot = applied(controller.dispatch({ type: "ENTER_NEXT_NODE", ...base(snapshot) }), "enter node").snapshot;
      continue;
    }
    if (snapshot.flow.phase === "IN_COMBAT") {
      const result = runCombat(controller, true);
      snapshot = result.snapshot;
      encounters.push(result.metrics);
      continue;
    }
    if (snapshot.flow.phase === "AWAITING_REWARD") {
      const choiceId = snapshot.flow.pendingOfferId === "normal-d1" ? "normal-ore" : "elite-odd-02";
      snapshot = applied(controller.dispatch({ type: "CHOOSE_REWARD", ...base(snapshot), choiceId }), `reward ${choiceId}`).snapshot;
      continue;
    }
    if (snapshot.flow.phase === "IN_EVENT") {
      const eventType = (snapshot.currentNode as { eventType?: string } | null)?.eventType;
      const choiceId = eventType === "CACHE" ? "take-cache"
        : eventType === "WORKSHOP" ? "use-workshop"
          : eventType === "COLLAPSE" ? "risk-collapse"
            : eventType === "FICTOR" ? "fictor-skip"
              : eventType === "RECORD" ? "read-record" : "take-oddity";
      snapshot = resolveEvent(controller, choiceId);
      if (eventType === "WORKSHOP") {
        const selection = chooseOwnedMaterials(snapshot, race === "Joinkin" ? 3 : 2);
        const forged = race === "Joinkin"
          ? controller.dispatch({ type: "JOINKIN_USE_FREE_WORKSHOP", ...base(snapshot), materialInstanceIds: selection as [string, string, string] })
          : controller.dispatch({ type: "USE_FREE_WORKSHOP", ...base(snapshot), materialInstanceIds: selection as [string, string] });
        snapshot = applied(forged, "free workshop").snapshot;
        workshopFreeForges += 1;
        snapshot = applied(controller.dispatch({ type: "LEAVE_EVENT", ...base(snapshot) }), "leave workshop").snapshot;
      }
      continue;
    }
    throw new Error(`${race}: unsupported phase ${snapshot.flow.phase}`);
  }

  return {
    race,
    groundId: "GROUND_STILL",
    terminalPhase: "RUN_WON",
    playerHpRemaining: snapshot.flow.playerHp,
    fuelStart,
    fuelEnd: snapshot.runtime.run.fuel,
    workshopPaidForges: 1,
    workshopFreeForges,
    instantForges: encounters.reduce((sum, encounter) => sum + encounter.instantForges, 0),
    encounters,
  };
}

function proposalFor(material: MaterialSource, kind: ProposalKind) {
  const category = material.category;
  let potency: number;
  let costBase: number;
  if (category === "ORE") { potency = 1; costBase = 1; }
  else if (category === "TOOL") { potency = 1; costBase = kind === "RECOMMENDED" ? 0 : 1; }
  else if (category === "ODDITY") { potency = 3; costBase = 2; }
  else {
    const suffix = Number(material.id.slice(-2));
    potency = suffix <= 2 ? 1 : suffix <= 4 ? 2 : 3;
    costBase = suffix === 5 ? 2 : 1;
  }
  return { id: material.id, potency, cost_base: costBase };
}

export function materialProposals(kind: ProposalKind) {
  return materialsSource.map((material) => proposalFor(material, kind));
}

function lawCoefficient(law: LawSource, kind: ProposalKind): number {
  const base = RECOMMENDED_TUNING.powerCoefficientByEffect[law.combat_effect as keyof typeof RECOMMENDED_TUNING.powerCoefficientByEffect];
  return kind === "RECOMMENDED" ? base : Number((base * CONSERVATIVE_DERIVATION.powerCoefficientScale).toFixed(4));
}

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

export function simulateCatalog(kind: ProposalKind) {
  const proposal = new Map(materialProposals(kind).map((item) => [item.id, item]));
  const sameBonus = kind === "RECOMMENDED" ? RECOMMENDED_TUNING.SAME_BONUS : CONSERVATIVE_ALTERNATIVE.SAME_BONUS;
  const divisor = kind === "RECOMMENDED" ? RECOMMENDED_TUNING.COST_DIVISOR : CONSERVATIVE_ALTERNATIVE.COST_DIVISOR;
  const lawByPair = new Map(lawsSource.map((law) => [[...law.pair].sort().join("|"), law]));
  const rows: Array<{ recipeId: string; potency: number; cost: number; power: number; effect: string; sameAttribute: boolean }> = [];
  for (let left = 0; left < materialsSource.length; left += 1) {
    for (let right = left + 1; right < materialsSource.length; right += 1) {
      const first = materialsSource[left];
      const second = materialsSource[right];
      if (first.category === "TOOL" && second.category === "TOOL") continue;
      const firstAttribute = primaryAttribute(first);
      const secondAttribute = primaryAttribute(second);
      const material = first.category === "TOOL" ? second : first;
      const materialAttribute = primaryAttribute(material) as ForgeAttribute;
      const pair = first.category === "TOOL" || second.category === "TOOL"
        ? [materialAttribute, materialAttribute]
        : [firstAttribute, secondAttribute] as ForgeAttribute[];
      const law = lawByPair.get([...pair].sort().join("|"));
      if (!law) throw new Error(`Missing law for ${first.id}|${second.id}`);
      const sameAttribute = first.category !== "TOOL" && second.category !== "TOOL" && firstAttribute === secondAttribute;
      const potency = proposal.get(first.id)!.potency + proposal.get(second.id)!.potency + (sameAttribute ? sameBonus : 0);
      rows.push({
        recipeId: [first.id, second.id].sort().join("|"),
        potency,
        cost: Math.ceil(potency / divisor),
        power: Number((potency * lawCoefficient(law, kind)).toFixed(4)),
        effect: law.combat_effect,
        sameAttribute,
      });
    }
  }
  const powers = rows.map(({ power }) => power).sort((a, b) => a - b);
  const potencies = rows.map(({ potency }) => potency).sort((a, b) => a - b);
  const costDistribution = Object.fromEntries([...new Set(rows.map(({ cost }) => cost))].sort((a, b) => a - b).map((cost) => [cost, rows.filter((row) => row.cost === cost).length]));
  return {
    kind,
    cardCount: rows.length,
    potency: { min: potencies[0], median: percentile(potencies, 0.5), p90: percentile(potencies, 0.9), max: potencies.at(-1)! },
    power: { min: powers[0], median: percentile(powers, 0.5), p90: percentile(powers, 0.9), max: powers.at(-1)! },
    costDistribution,
    sameAttributeCount: rows.filter(({ sameAttribute }) => sameAttribute).length,
    extremeSame: (() => {
      const sameRows = rows.filter(({ sameAttribute }) => sameAttribute).sort((a, b) => a.power - b.power);
      return {
        count: sameRows.length,
        lowest: sameRows.slice(0, 6),
        highest: sameRows.slice(-6),
        byEffect: [...new Set(sameRows.map(({ effect }) => effect))].sort().map((effect) => {
          const effectRows = sameRows.filter((row) => row.effect === effect);
          return { effect, minPower: effectRows[0].power, maxPower: effectRows.at(-1)!.power, count: effectRows.length };
        }),
      };
    })(),
  };
}

export function resonanceStress(kind: ProposalKind) {
  const catalog = simulateCatalog(kind);
  const basePower = catalog.power.median;
  const rate = kind === "RECOMMENDED" ? RECOMMENDED_TUNING.RESONANCE_RATE : CONSERVATIVE_ALTERNATIVE.RESONANCE_RATE;
  return (["Stillkin", "Burnkin", "Joinkin"] as const).map((race) => ({
    race,
    effectiveRate: race === "Burnkin" ? rate * 2 : rate,
    values: [1, 3, 5].map((streak) => ({ streak, power: Number((basePower * (1 + streak * (race === "Burnkin" ? rate * 2 : rate))).toFixed(4)) })),
  }));
}

export function createReport() {
  const runtimeRuns = (["Stillkin", "Burnkin", "Joinkin"] as const).map(runRuntimePlaytest);
  const grounds = ["GROUND_STILL", "GROUND_BURN", "GROUND_SCATTER", "GROUND_ROT", "GROUND_WASH", "GROUND_JOIN"] as const;
  const coverage = runtimeRuns.flatMap((run) => grounds.map((groundId) => groundId === "GROUND_STILL"
    ? { race: run.race, groundId, evidenceKind: "RUNTIME_AUTOPLAY", terminalPhase: run.terminalPhase }
    : { race: run.race, groundId, evidenceKind: "STRUCTURAL_ONLY", terminalPhase: null }));
  return {
    schema_version: 1,
    task_key: T042_BASELINE.taskKey,
    status: "PROPOSAL_ONLY_NOT_APPROVED_OR_APPLIED",
    baseline: T042_BASELINE,
    provenance: {
      executor: "CODEX_DETERMINISTIC_CONTROLLER_AUTOPLAY",
      human_performed: false,
      limitation: "Only GROUND_STILL is executable in the current runtime; the other five grounds are content-level registry routes and are not represented as playtested completions.",
    },
    coverage,
    runtime_runs: runtimeRuns,
    proposals: {
      recommended: {
        tuning: RECOMMENDED_TUNING,
        laws: lawsSource.map((law) => ({ pair: law.pair, combat_effect: law.combat_effect, power_coefficient: lawCoefficient(law, "RECOMMENDED") })),
        materials: materialProposals("RECOMMENDED"),
        catalog: simulateCatalog("RECOMMENDED"),
        resonance: resonanceStress("RECOMMENDED"),
      },
      conservative: {
        tuning: CONSERVATIVE_ALTERNATIVE,
        derivation: CONSERVATIVE_DERIVATION,
        laws: lawsSource.map((law) => ({ pair: law.pair, combat_effect: law.combat_effect, power_coefficient: lawCoefficient(law, "CONSERVATIVE") })),
        materials: materialProposals("CONSERVATIVE"),
        catalog: simulateCatalog("CONSERVATIVE"),
        resonance: resonanceStress("CONSERVATIVE"),
      },
    },
    fuel_stress: {
      startFuel: 4,
      paidForgeCost: 1,
      freeWorkshopEntitlementsPerCurrentRoute: 1,
      paidForgeCapacityWithoutPurchases: 4,
      representativePlan: { paidForges: 1, freeForges: 1, endingFuel: 3 },
    },
  };
}

function checkArtifact(path: string, report: ReturnType<typeof createReport>): void {
  const raw = JSON.parse(readFileSync(resolve(path), "utf8")) as { evidence_sha?: string; report?: unknown };
  if (JSON.stringify(raw.report) !== JSON.stringify(report)) throw new Error(`${path}: report drift`);
  if (raw.evidence_sha !== reportSha256(report)) throw new Error(`${path}: evidence_sha mismatch`);
}

export function reportSha256(report: ReturnType<typeof createReport>): string {
  return createHash("sha256").update(JSON.stringify(report)).digest("hex");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = createReport();
  if (process.argv.includes("--check")) {
    checkArtifact("docs/playtests/t042/balance-playtest-raw.json", report);
    process.stdout.write("T042 balance evidence check: PASS\n");
  } else if (process.argv.includes("--artifact")) {
    process.stdout.write(`${JSON.stringify({ evidence_sha: reportSha256(report), report }, null, 2)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}
