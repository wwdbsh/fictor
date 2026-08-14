import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  T020_CORE_PLAN_PATH, T020_CORE_PLAN_SHA256, canonicalJsonT020, readPinnedT020, readRegularT020, renderT020CanonicalJson, sha256T020,
} from "./t020-world-art-production-v1";

/**
 * T016 coverage selection — 160 of the 994 unmade CANONICAL pairs.
 *
 * THIS IS NOT A FREQUENCY SCORE, and the artifact says so on its face. The contract originally
 * asked for a deterministic exposure-frequency score over the three playable species' starting
 * decks and per-ground drop pools. That data does not exist in the repository: there is no
 * species, deck, or pool definition anywhere in src/ or docs/, and the material-level weights a
 * fallback would need are absent or unsettled — `rarity` is null for 30 of 52 materials
 * (PENDING_DEPTH_CLASSIFICATION), `potency` and `cost_base` are null for all 52, and every
 * material carries `balance_status: PENDING_2026_08_21`, which falls after the 2026-08-17
 * credit expiry. Waiting for the real inputs forecloses the run entirely.
 *
 * So this selects for COVERAGE instead: it guarantees the 160 are spread across the origin-pair
 * structure of the candidate set rather than clustered. That matters because the obvious
 * fallback is not neutral — the first 160 candidates in manifest order contain `join_03/04/05`
 * 44 times each, `join_01` zero times, and almost nothing from the BURN group: five of its six
 * materials (`burn_01`..`burn_05`) never appear, and the only 4 BURN-group appearances all come
 * through `ore_burn`. That ships a 160-card set with one of six symmetric grounds represented
 * by a single material. The adopted rule takes BURN from 4 cards to 6 and removes the
 * 44x clustering.
 *
 * The algorithm, stated exactly because the artifact is pinned by sha and quoted in the
 * disclosure:
 *
 *   1. Candidates are the CANONICAL assets in manifest order after T015's first 332
 *      (indices 332..1325, exactly 994). Manifest order is the file's own array order.
 *   2. Each `forge__A__B` id decomposes into material ids A and B. Each material maps to a
 *      GROUP: its `origin` with the `GROUND_` prefix removed, or — when `origin` is `NONE` —
 *      its `category`. Every one of the 52 materials resolves; nothing falls through.
 *   3. A candidate's BUCKET is the pair of its two groups, sorted lexicographically, so
 *      `A x B` and `B x A` are the same bucket. The 994 candidates fall into 35 buckets.
 *   4. Allocation is largest-remainder on integers only, never floats. For a bucket of size s
 *      out of total t, quota = 160 * s; base = floor(quota / t); remainder = quota mod t.
 *      Every bucket receives `base`; the leftover 160 - sum(base) seats go to the buckets with
 *      the largest remainder. Note `base` is 0 for every bucket here (994 > 160), so a bucket
 *      is represented only if it wins a remainder seat — which is why 34 of 35 buckets appear
 *      and `BURN x JOIN`, with 4 candidates, does not. The guarantee this rule makes is at the
 *      GROUP level, not the bucket level, and the disclosure says so in those words.
 *   5. Ties on remainder break by bucket order, and bucket order is the manifest index of that
 *      bucket's first candidate — ascending. This is a total order (each bucket has exactly one
 *      first candidate), so the outcome is unique.
 *   6. Within a bucket the allocated seats are filled in manifest order, taking the first n.
 *
 * Every step is a pure function of committed, sha-pinned bytes. No clock, no randomness, no
 * float. The same inputs always produce the same 160 ids in the same order.
 */

export const T016_SELECTION_PATH = "assets/manifests/t016-canonical-selection-v1.json" as const;
export const T016_MATERIALS_PATH = "src/data/source/materials.json" as const;
/** T015 consumed the first 332 CANONICAL assets; T016 selects from what remains. */
export const T016_CANDIDATE_START = 332 as const;
export const T016_CANDIDATE_COUNT = 994 as const;
export const T016_SELECTION_COUNT = 160 as const;
export const T016_TOTAL_CANONICAL = 1_326 as const;

export interface T016Material { id: string; attribute: string; representation: string; category: string; origin: string; rarity: string | null }
export interface T016Candidate { manifest_index: number; id: string; path: string; aspect_ratio: string; left: string; right: string; bucket: string }
export interface T016BucketAllocation { bucket: string; candidate_count: number; base: number; remainder: number; extra_seat: boolean; allocated: number; first_candidate_index: number }

export function loadT016Materials(root: string): Map<string, T016Material> {
  const bytes = readRegularT020(root, T016_MATERIALS_PATH);
  const items = JSON.parse(bytes.toString("utf8")) as T016Material[];
  if (!Array.isArray(items) || items.length !== 52) throw new Error(`T016 expected 52 materials, found ${Array.isArray(items) ? items.length : "non-array"}`);
  const byId = new Map(items.map((item) => [item.id, item]));
  if (byId.size !== items.length) throw new Error("T016 material ids are not unique");
  for (const item of items) {
    if (typeof item.origin !== "string" || item.origin.length === 0) throw new Error(`T016 material ${item.id} has no origin`);
    if (typeof item.category !== "string" || item.category.length === 0) throw new Error(`T016 material ${item.id} has no category`);
  }
  return byId;
}

/** `GROUND_BURN` -> `BURN`; `NONE` -> the material's category (TOOL, ODDITY, ...). */
export function t016GroupOf(material: T016Material): string {
  return material.origin === "NONE" ? material.category : material.origin.replace(/^GROUND_/, "");
}

export function buildT016Candidates(root: string): T016Candidate[] {
  const core = JSON.parse(readPinnedT020(root, T020_CORE_PLAN_PATH, T020_CORE_PLAN_SHA256).toString("utf8")) as { assets: Array<{ id: string; category: string; path: string; aspect_ratio: string }> };
  const canonical = core.assets.filter(({ category }) => category === "CANONICAL");
  if (canonical.length !== T016_TOTAL_CANONICAL) throw new Error(`T016 expected ${T016_TOTAL_CANONICAL} CANONICAL assets, found ${canonical.length}`);
  const materials = loadT016Materials(root);
  const candidates = canonical.slice(T016_CANDIDATE_START).map((asset, offset) => {
    const parsed = /^forge__(.+?)__(.+)$/.exec(asset.id);
    if (!parsed) throw new Error(`T016 candidate id is not a forge pair: ${asset.id}`);
    const [, left, right] = parsed;
    const leftMaterial = materials.get(left);
    const rightMaterial = materials.get(right);
    if (!leftMaterial || !rightMaterial) throw new Error(`T016 candidate ${asset.id} references an unknown material`);
    // Every candidate must be 3:4; a different aspect would need its own tolerance treatment.
    if (asset.aspect_ratio !== "3:4") throw new Error(`T016 candidate ${asset.id} is ${asset.aspect_ratio}, not 3:4`);
    if (!asset.path.startsWith("cards/") || !asset.path.endsWith(".png")) throw new Error(`T016 candidate path changed: ${asset.path}`);
    const bucket = [t016GroupOf(leftMaterial), t016GroupOf(rightMaterial)].sort().join(" x ");
    return { manifest_index: T016_CANDIDATE_START + offset, id: asset.id, path: asset.path, aspect_ratio: asset.aspect_ratio, left, right, bucket };
  });
  if (candidates.length !== T016_CANDIDATE_COUNT) throw new Error(`T016 expected ${T016_CANDIDATE_COUNT} candidates, found ${candidates.length}`);
  return candidates;
}

/**
 * Largest-remainder allocation on integers. Floats are avoided deliberately: the same
 * arithmetic has to reproduce byte-identically on any machine that re-derives the artifact,
 * and a rounding difference here would silently change which cards get generated.
 */
export function allocateT016Seats(candidates: readonly T016Candidate[]): T016BucketAllocation[] {
  const total = candidates.length;
  const grouped = new Map<string, { count: number; firstIndex: number }>();
  for (const candidate of candidates) {
    const existing = grouped.get(candidate.bucket);
    if (existing) existing.count += 1;
    else grouped.set(candidate.bucket, { count: 1, firstIndex: candidate.manifest_index });
  }
  const rows = [...grouped.entries()].map(([bucket, { count, firstIndex }]) => {
    const quota = T016_SELECTION_COUNT * count;
    return { bucket, candidate_count: count, base: Math.floor(quota / total), remainder: quota % total, extra_seat: false, allocated: 0, first_candidate_index: firstIndex };
  });
  // Bucket order is the manifest index of the bucket's first candidate — a total order, so
  // the tie-break below is unique rather than dependent on Map iteration.
  rows.sort((first, second) => first.first_candidate_index - second.first_candidate_index);
  const seatsFromBase = rows.reduce((sum, row) => sum + row.base, 0);
  const leftover = T016_SELECTION_COUNT - seatsFromBase;
  if (leftover < 0 || leftover > rows.length) throw new Error("T016 largest-remainder allocation is out of range");
  const byRemainder = [...rows].sort((first, second) => second.remainder - first.remainder || first.first_candidate_index - second.first_candidate_index);
  for (const row of byRemainder.slice(0, leftover)) row.extra_seat = true;
  for (const row of rows) row.allocated = row.base + (row.extra_seat ? 1 : 0);
  const allocated = rows.reduce((sum, row) => sum + row.allocated, 0);
  if (allocated !== T016_SELECTION_COUNT) throw new Error(`T016 allocation summed to ${allocated}, expected ${T016_SELECTION_COUNT}`);
  if (rows.some((row) => row.allocated > row.candidate_count)) throw new Error("T016 allocated more seats than a bucket has candidates");
  return rows;
}

export function selectT016Ids(candidates: readonly T016Candidate[], allocations: readonly T016BucketAllocation[]): T016Candidate[] {
  const remaining = new Map(allocations.map(({ bucket, allocated }) => [bucket, allocated]));
  const selected = candidates.filter((candidate) => {
    const seats = remaining.get(candidate.bucket) ?? 0;
    if (seats <= 0) return false;
    remaining.set(candidate.bucket, seats - 1);
    return true;
  });
  if (selected.length !== T016_SELECTION_COUNT) throw new Error(`T016 selected ${selected.length}, expected ${T016_SELECTION_COUNT}`);
  if (new Set(selected.map(({ id }) => id)).size !== T016_SELECTION_COUNT) throw new Error("T016 selection contains duplicates");
  return selected;
}

export type T016Selection = ReturnType<typeof buildT016Selection>;
export function buildT016Selection(root: string) {
  const candidates = buildT016Candidates(root);
  const allocations = allocateT016Seats(candidates);
  const selected = selectT016Ids(candidates, allocations);
  const idList = `${selected.map(({ id }) => id).join("\n")}\n`;
  const groups = new Map<string, number>();
  for (const candidate of selected) for (const group of candidate.bucket.split(" x ")) groups.set(group, (groups.get(group) ?? 0) + 1);
  return {
    schema_version: 1, artifact_version: "t016-canonical-selection-v1", secret_free: true,
    // Stated first, because a reader must not mistake this for what the contract first asked for.
    selection_kind: "COVERAGE_NOT_FREQUENCY",
    frequency_score_unavailable: {
      requested_by_original_contract: "deterministic exposure-frequency score over the 3 playable species' starting decks and per-ground material drop pools",
      missing_inputs: ["no species definition in src/ or docs/", "no starting-deck definition", "no per-ground drop pool or drop rates"],
      unusable_material_weights: { rarity_null: 30, rarity_total: 52, rarity_null_status: "PENDING_DEPTH_CLASSIFICATION", potency_null: 52, cost_base_null: 52, balance_status_all: "PENDING_2026_08_21" },
      candidates_with_at_least_one_unrated_material: 763,
      candidates_with_two_unrated_materials: 257,
      date_math: { material_balance_settles: "2026-08-21", credit_expiry: "2026-08-17", waiting_forecloses_the_run: true },
    },
    rejected_alternatives: {
      manifest_order_top_160: {
        rejected: true, reason: "NOT_NEUTRAL_NEARLY_OMITS_THE_BURN_GROUND",
        observed: "join_03/join_04/join_05 appear 44 times each and join_01 appears zero times; of the BURN group's six materials, burn_01..burn_05 appear zero times and the only BURN-group appearances are 4, all via ore_burn",
        burn_group_material_count: 6, burn_group_appearances_in_top_160: 4, burn_cards_under_this_rule: 4, burn_cards_under_the_adopted_rule: 6,
      },
      wait_for_real_frequency_data: { rejected: true, reason: "SETTLES_AFTER_CREDIT_EXPIRY" },
    },
    formula: {
      step_1_candidates: `CANONICAL assets in manifest order after T015's first ${T016_CANDIDATE_START}; exactly ${T016_CANDIDATE_COUNT}`,
      step_2_group: "each material maps to origin with the GROUND_ prefix removed, or its category when origin is NONE",
      step_3_bucket: "a candidate's bucket is its two groups sorted lexicographically and joined, so A x B and B x A are one bucket",
      step_4_allocation: `largest remainder on integers only: quota = ${T016_SELECTION_COUNT} * bucket_size, base = floor(quota / ${T016_CANDIDATE_COUNT}), remainder = quota mod ${T016_CANDIDATE_COUNT}`,
      step_5_tie_break: "equal remainders break by bucket order, where bucket order is the manifest index of that bucket's first candidate, ascending",
      step_6_within_bucket: "allocated seats are filled in manifest order, taking the first n",
      no_clock_no_randomness_no_float: true,
    },
    inputs: {
      core_plan: { path: T020_CORE_PLAN_PATH, sha256: T020_CORE_PLAN_SHA256 },
      materials: { path: T016_MATERIALS_PATH, sha256: sha256T020(readRegularT020(root, T016_MATERIALS_PATH)) },
    },
    totals: {
      total_canonical: T016_TOTAL_CANONICAL, t015_consumed: T016_CANDIDATE_START, candidates: T016_CANDIDATE_COUNT,
      buckets: allocations.length, buckets_with_at_least_one_seat: allocations.filter(({ allocated }) => allocated > 0).length,
      selected: T016_SELECTION_COUNT,
    },
    group_representation: Object.fromEntries([...groups.entries()].sort(([first], [second]) => first.localeCompare(second))),
    // BURN is lowest because the candidate pool genuinely holds few unmade BURN pairs — T015
    // already took most of them. The rule does not create that asymmetry, it just does not hide it.
    allocation: allocations.map(({ bucket, candidate_count, base, remainder, extra_seat, allocated, first_candidate_index }) => ({ bucket, candidate_count, base, remainder, extra_seat, allocated, first_candidate_index })),
    selection_list_encoding: "UTF-8_IDS_JOINED_BY_NEWLINE_WITH_TRAILING_NEWLINE",
    selection_list_sha256: sha256T020(idList),
    selected: selected.map(({ manifest_index, id, path, bucket, left, right }) => ({ manifest_index, id, path, bucket, left, right })),
  } as const;
}

export function renderT016Selection(selection: T016Selection): string { return renderT020CanonicalJson(selection); }
export function t016SelectionSha256(selection: T016Selection): string { return sha256T020(renderT016Selection(selection)); }

/** Reads the committed artifact and re-derives it, refusing any drift. */
export function loadT016Selection(root: string): { value: T016Selection; sha256: string } {
  const bytes = readFileSync(resolve(root, T016_SELECTION_PATH), "utf8");
  const value = JSON.parse(bytes) as T016Selection;
  const expected = buildT016Selection(root);
  if (bytes !== renderT016Selection(expected) || canonicalJsonT020(value) !== canonicalJsonT020(expected)) throw new Error("T016 selection artifact does not match a fresh derivation");
  return { value, sha256: sha256T020(bytes) };
}
