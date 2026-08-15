import { useEffect, useState } from "react";

import { DISCOVERY_PHASE_DURATIONS_MS, nextDiscoveryPhase, type DiscoveryPhase } from "./phase-machine";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

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

export function useDiscoveryPhase(presentationId: string): readonly [DiscoveryPhase, () => void] {
  const reducedMotion = usePrefersReducedMotion();
  const initialPhase = reducedMotion ? "FINAL" : "BURNING";
  const [state, setState] = useState<{ presentationId: string; phase: DiscoveryPhase }>(() => ({ presentationId, phase: initialPhase }));
  const phase = state.presentationId === presentationId ? state.phase : initialPhase;

  useEffect(() => {
    const resetPhase = reducedMotion ? "FINAL" : "BURNING";
    setState((current) => {
      if (current.presentationId !== presentationId) return { presentationId, phase: resetPhase };
      if (reducedMotion && current.phase !== "FINAL") return { presentationId, phase: "FINAL" };
      return current;
    });
  }, [presentationId, reducedMotion]);

  useEffect(() => {
    if (phase === "FINAL") return undefined;
    const guardedPresentationId = presentationId;
    const timer = window.setTimeout(() => {
      setState((current) => current.presentationId === guardedPresentationId
        ? { presentationId: guardedPresentationId, phase: nextDiscoveryPhase(current.phase) }
        : current);
    }, DISCOVERY_PHASE_DURATIONS_MS[phase]);
    return () => window.clearTimeout(timer);
  }, [phase, presentationId]);

  const skip = () => setState({ presentationId, phase: "FINAL" });
  return [phase, skip] as const;
}
