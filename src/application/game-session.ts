import {
  decodeForgeRuntimeState,
  reduceForgeRuntime,
  type ForgeResolverContextV1,
  type ForgeRuntimeCommand,
  type ForgeRuntimeReducerResult,
  type ForgeRuntimeStateV1,
} from "../domain/forge-runtime";
import {
  HEART_IDS,
  VersionedSaveStore,
  type HeartId,
  type PersistentProfileV1,
  type SaveLoadIssue,
  type SaveWriteResult,
} from "../persistence";

const HEART_ID_SET = new Set<string>(HEART_IDS);

export interface GameSession {
  profile: PersistentProfileV1;
  runtimeState: ForgeRuntimeStateV1;
  persistenceRevision: number;
  writeBlocked: boolean;
  loadIssues: SaveLoadIssue[];
}

export interface SessionMutationResult {
  session: GameSession;
  applied: boolean;
  persistence: SaveWriteResult | null;
  runtimeResult: ForgeRuntimeReducerResult | null;
}

function runtimeWithProfile(store: VersionedSaveStore, rawRuntime: unknown, profile: PersistentProfileV1): ForgeRuntimeStateV1 | null {
  const decoded = decodeForgeRuntimeState(rawRuntime);
  if (!decoded.valid) return null;
  const hydrated = decodeForgeRuntimeState({
    ...decoded.value,
    profile: { discoveredRecipeIds: [...profile.discoveredRecipeIds] },
  });
  return hydrated.valid ? store.decodeRuntime(hydrated.value) : null;
}

function cloneSession(store: VersionedSaveStore, session: GameSession): GameSession {
  const profile = store.decodeProfile(session.profile);
  if (!profile) throw new TypeError("session profile is invalid");
  const runtimeState = runtimeWithProfile(store, session.runtimeState, profile);
  if (!runtimeState) throw new TypeError("session runtime state is invalid");
  return {
    profile,
    runtimeState,
    persistenceRevision: session.persistenceRevision,
    writeBlocked: session.writeBlocked,
    loadIssues: [...session.loadIssues],
  };
}

function persist(
  store: VersionedSaveStore,
  session: GameSession,
  runtimeResult: ForgeRuntimeReducerResult | null = null,
): SessionMutationResult {
  const persistence: SaveWriteResult = session.writeBlocked
    ? { ok: false, persisted: false, reason: "WRITE_BLOCKED" }
    : store.save(session.profile, session.runtimeState, session.persistenceRevision);
  return {
    session: {
      ...session,
      persistenceRevision: persistence.ok ? persistence.revision : session.persistenceRevision,
      writeBlocked: session.writeBlocked || (!persistence.ok && persistence.reason === "WRITE_BLOCKED"),
    },
    applied: true,
    persistence,
    runtimeResult,
  };
}

function rejected(result: ForgeRuntimeReducerResult): boolean {
  return result.state === null || result.events.some((event) => event.type === "FORGE_REJECTED" || event.type === "COMMAND_REJECTED");
}

export function loadGameSession(store: VersionedSaveStore, strictStarterTemplate: unknown): GameSession {
  const loaded = store.load(strictStarterTemplate);
  return {
    profile: loaded.profile,
    runtimeState: loaded.runtimeState,
    persistenceRevision: loaded.revision,
    writeBlocked: loaded.writeBlocked,
    loadIssues: loaded.issues,
  };
}

export function executeForgeRuntimeCommand(
  store: VersionedSaveStore,
  rawSession: GameSession,
  command: ForgeRuntimeCommand | unknown,
  context: ForgeResolverContextV1 | unknown,
): SessionMutationResult {
  const session = cloneSession(store, rawSession);
  const result = reduceForgeRuntime(session.runtimeState, command, context);
  if (rejected(result) || result.state === null) {
    return { session, applied: false, persistence: null, runtimeResult: result };
  }
  const discoveries = [...new Set([
    ...session.profile.discoveredRecipeIds,
    ...result.state.profile.discoveredRecipeIds,
  ])].sort();
  const profile = store.decodeProfile({ ...session.profile, discoveredRecipeIds: discoveries });
  if (!profile) return { session, applied: false, persistence: null, runtimeResult: result };
  const runtimeState = runtimeWithProfile(store, result.state, profile);
  if (!runtimeState) return { session, applied: false, persistence: null, runtimeResult: result };
  return persist(store, { ...session, profile, runtimeState }, result);
}

export function startNewRun(
  store: VersionedSaveStore,
  rawSession: GameSession,
  strictStarterTemplate: unknown,
): SessionMutationResult {
  const session = cloneSession(store, rawSession);
  const starter = store.decodeRuntime(strictStarterTemplate);
  if (!starter) return { session, applied: false, persistence: null, runtimeResult: null };
  const runtimeState = runtimeWithProfile(store, starter, session.profile);
  if (!runtimeState) return { session, applied: false, persistence: null, runtimeResult: null };
  return persist(store, { ...session, runtimeState });
}

export function recordOwnedHeart(
  store: VersionedSaveStore,
  rawSession: GameSession,
  heartId: string,
): SessionMutationResult {
  const session = cloneSession(store, rawSession);
  if (!HEART_ID_SET.has(heartId)) return { session, applied: false, persistence: null, runtimeResult: null };
  const profile = store.decodeProfile({
    ...session.profile,
    ownedHeartIds: [...new Set([...session.profile.ownedHeartIds, heartId])].sort(),
  });
  if (!profile) return { session, applied: false, persistence: null, runtimeResult: null };
  return persist(store, { ...session, profile });
}

export function ownsHeart(session: GameSession, heartId: HeartId): boolean {
  return session.profile.ownedHeartIds.includes(heartId);
}
