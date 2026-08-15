import { useEffect, useState } from "react";

import { discoveryPhaseAt, discoveryPhaseDeadlineMs, type DiscoveryPhase } from "./phase-machine";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const monotonicNow = () => performance.now();

export type DiscoveryClock = () => number;

interface DiscoveryPhaseState {
  readonly presentationId: string;
  readonly phase: DiscoveryPhase;
  readonly startedAtMs: number;
  readonly wake: number;
}

function initialReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_MOTION_QUERY).matches
    : false;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(initialReducedMotion);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function useDiscoveryPhase(presentationId: string, now: DiscoveryClock = monotonicNow): readonly [DiscoveryPhase, () => void] {
  const reducedMotion = usePrefersReducedMotion();
  const initialPhase = reducedMotion ? "FINAL" : "BURNING";
  const [state, setState] = useState<DiscoveryPhaseState>(() => ({ presentationId, phase: initialPhase, startedAtMs: now(), wake: 0 }));
  const phase = state.presentationId === presentationId ? state.phase : initialPhase;

  useEffect(() => {
    setState((current) => {
      if (current.presentationId !== presentationId) {
        return { presentationId, phase: reducedMotion ? "FINAL" : "BURNING", startedAtMs: now(), wake: 0 };
      }
      if (reducedMotion && current.phase !== "FINAL") return { ...current, phase: "FINAL" };
      return current;
    });
  }, [now, presentationId, reducedMotion]);

  useEffect(() => {
    if (phase === "FINAL" || state.presentationId !== presentationId) return undefined;
    const guardedPresentationId = presentationId;
    const deadline = discoveryPhaseDeadlineMs(phase);
    if (deadline === null) return undefined;
    const elapsedAtSchedule = Math.max(0, now() - state.startedAtMs);
    const timer = window.setTimeout(() => {
      setState((current) => {
        if (current.presentationId !== guardedPresentationId || current.phase === "FINAL") return current;
        const elapsedAtWake = Math.max(0, now() - current.startedAtMs);
        const observedPhase = discoveryPhaseAt(elapsedAtWake);
        return observedPhase === current.phase
          ? { ...current, wake: current.wake + 1 }
          : { ...current, phase: observedPhase };
      });
    }, Math.max(0, deadline - elapsedAtSchedule));
    return () => window.clearTimeout(timer);
  }, [now, phase, presentationId, state.presentationId, state.startedAtMs, state.wake]);

  const skip = () => setState((current) => current.presentationId === presentationId ? { ...current, phase: "FINAL" } : current);
  return [phase, skip] as const;
}
