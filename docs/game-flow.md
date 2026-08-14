# Track 1 run flow

T027 introduces a strict, serializable `run-scenario-v1` contract and a deterministic
`run-flow-state-v1` reducer. A scenario supplies the complete node order, depths,
encounter references, event choices, and reward offers. The reducer never selects a
random reward and accepts only a pre-bound `choiceId`.

## Fail-closed production configuration

`STILLKIN_PRODUCTION_SCENARIO_V1` is deliberately `CONFIGURATION_PENDING`. Combat
HP/damage, reward quantities, route probabilities, mechanic configuration, event
economy, and starting fuel remain unapproved until the 2026-08-21 balance gate. A
pending scenario cannot start; test scenarios marked `APPROVED` are fixtures only.

## Progression and rewards

An approved scenario proceeds through explicit depth 1, 2, and 3 nodes and ends with
`the_stilling`. Combat cleanup is acknowledged before `ENCOUNTER_WON`. Normal and
elite victories expose their bound offer; defeat moves directly to `RUN_LOST`; the
boss sequence is `ENCOUNTER_WON`, `HEART_OWNED`, `RUN_WON`.
`adaptTerminalCombatToRunCommand` accepts a strict terminal combat state only alongside
a strict forge runtime whose `activeCombat` has already been cleared.
The application wrapper requires that terminal state for every combat result and uses
the derived victory or defeat as authority. A missing, ongoing, uncleared, or
caller-mismatched result is rejected atomically.

The browser-safe material authority contains exactly 52 canonical material IDs and
does not import source or generated catalogs. Normal rewards are three distinct
non-tool, non-oddity materials. Elite rewards are tools or oddities. CACHE is limited
to Still-ground materials, ODDITY to `odd_01` through `odd_06`, and RECORD to a sorted
canonical recipe ID. `forge__*` Tier 2 cards and generated equipment are not reward
types. Tools are material IDs and remain unique within a run.

Material rewards add one validated instance to both `ownedInstances` and the deck.
Recipe events update both persistent and runtime discovery. The Still heart is stored
idempotently while `heartForge` remains literally false. These changes use the
existing `VersionedSaveStore` generation/revision CAS envelope; stale, quota, or
validation failure returns the original logical game session and run flow.

## Events and workshop seam

All six event variants use scenario-bound choices. FICTOR is executable only when a
trusted approved scenario binds its economy; the production scenario does not.
WORKSHOP grants exactly one free-workshop entitlement and never decrements fuel during
event resolution. T027 exposes settlement semantics: a failed execution retains the
entitlement and a successful settlement consumes one. Connecting the entitlement to
an atomic zero-fuel forge operation requires a later reviewed forge-runtime contract
change; T027 does not fake a `FUEL_SPENT` event or alter the existing reducer.

## Persistence boundary

The run-flow state itself is in memory for T027 and reload persistence is not claimed.
Only mutations already represented by the T025 profile/runtime save envelope are
persisted. Restart takes an approved scenario and a validated starter runtime,
preserves recipes and hearts, and does not call `VersionedSaveStore.reset`.
