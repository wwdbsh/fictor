// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildForgePresentation, type StillkinTrack1Event, type Track1UiForgePresentation } from "../../src/application";
import { FirstDiscoveryOverlay, RepeatDiscoveryToast, discoveryPhaseAt } from "../../src/presentation/discovery";

function presentation(scope = "presentation-1", discovery = true): Track1UiForgePresentation {
  const events: StillkinTrack1Event[] = [{
    type: "FORGE_RESULT_CREATED",
    mode: "INSTANT",
    instanceId: "forge-instance-v1-1",
    cardId: "forge__ore_still__still_01",
    recipeId: "ore_still|still_01",
    location: "HAND",
  }];
  if (discovery) events.push({ type: "RECIPE_DISCOVERED", recipeId: "ore_still|still_01" });
  return buildForgePresentation(events, "/fictor-test/", scope)!;
}

function installMotionPreference(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((media: string) => ({
      matches: reduced,
      media,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  installMotionPreference(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("discovery phase machine", () => {
  it("uses the exact 899/900, 2099/2100, and 2999/3000 boundaries", () => {
    expect(discoveryPhaseAt(0)).toBe("BURNING");
    expect(discoveryPhaseAt(899)).toBe("BURNING");
    expect(discoveryPhaseAt(900)).toBe("REVEALING");
    expect(discoveryPhaseAt(2_099)).toBe("REVEALING");
    expect(discoveryPhaseAt(2_100)).toBe("PRINTING");
    expect(discoveryPhaseAt(2_999)).toBe("PRINTING");
    expect(discoveryPhaseAt(3_000)).toBe("FINAL");
  });

  it("runs one guarded timer per phase and cleans up under StrictMode", () => {
    const onDismiss = vi.fn();
    const timerSpy = vi.spyOn(window, "setTimeout");
    const view = render(<StrictMode><FirstDiscoveryOverlay presentation={presentation()} onDismiss={onDismiss} /></StrictMode>);
    const overlay = screen.getByRole("dialog", { name: "빚기 기록" });
    expect(overlay).toHaveAttribute("data-discovery-phase", "BURNING");
    expect(timerSpy.mock.calls.filter(([, delay]) => delay === 900)).toHaveLength(2); // StrictMode setup, cleanup, setup.

    act(() => vi.advanceTimersByTime(899));
    expect(overlay).toHaveAttribute("data-discovery-phase", "BURNING");
    act(() => vi.advanceTimersByTime(1));
    expect(overlay).toHaveAttribute("data-discovery-phase", "REVEALING");
    expect(timerSpy.mock.calls.filter(([, delay]) => delay === 1_200)).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1_199));
    expect(overlay).toHaveAttribute("data-discovery-phase", "REVEALING");
    act(() => vi.advanceTimersByTime(1));
    expect(overlay).toHaveAttribute("data-discovery-phase", "PRINTING");
    act(() => vi.advanceTimersByTime(899));
    expect(overlay).toHaveAttribute("data-discovery-phase", "PRINTING");
    act(() => vi.advanceTimersByTime(1));
    expect(overlay).toHaveAttribute("data-discovery-phase", "FINAL");
    expect(screen.getByRole("button", { name: "계속" })).toHaveFocus();
    expect(screen.getByText("굳은 조각과 서리꽃의 제법이 도감에 남았습니다.")).toBeVisible();
    expect(timerSpy.mock.calls.filter(([, delay]) => delay === 900)).toHaveLength(3);

    view.unmount();
    const phaseTimerCalls = timerSpy.mock.calls.filter(([, delay]) => delay === 900 || delay === 1_200);
    act(() => vi.runOnlyPendingTimers());
    expect(phaseTimerCalls).toHaveLength(4);
  });

  it("skips or handles Escape by showing the informative final state without dismissing", () => {
    const onDismiss = vi.fn();
    render(<FirstDiscoveryOverlay presentation={presentation()} onDismiss={onDismiss} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "새 제법 발견" })).toHaveAttribute("data-discovery-phase", "FINAL");
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "계속" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("starts at the static final state for reduced motion and schedules no three-second wait", () => {
    installMotionPreference(true);
    const timerSpy = vi.spyOn(window, "setTimeout");
    render(<FirstDiscoveryOverlay presentation={presentation()} onDismiss={() => undefined} />);
    expect(screen.getByRole("dialog", { name: "새 제법 발견" })).toHaveAttribute("data-discovery-phase", "FINAL");
    expect(screen.queryByRole("button", { name: "연출 건너뛰기" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "계속" })).toBeEnabled();
    expect(timerSpy.mock.calls.some(([, delay]) => delay === 900 || delay === 1_200)).toBe(false);
  });

  it("jumps monotonically to FINAL when reduced motion turns on and never replays when it turns off", () => {
    let matches = false;
    const listeners = new Set<() => void>();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((media: string) => ({
        get matches() { return matches; },
        media,
        onchange: null,
        addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    render(<FirstDiscoveryOverlay presentation={presentation()} onDismiss={() => undefined} />);
    act(() => vi.advanceTimersByTime(900));
    expect(screen.getByRole("dialog")).toHaveAttribute("data-discovery-phase", "REVEALING");

    act(() => { matches = true; listeners.forEach((listener) => listener()); });
    expect(screen.getByRole("dialog", { name: "새 제법 발견" })).toHaveAttribute("data-discovery-phase", "FINAL");
    expect(screen.getByRole("button", { name: "계속" })).toBeEnabled();

    act(() => { matches = false; listeners.forEach((listener) => listener()); });
    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.getByRole("dialog", { name: "새 제법 발견" })).toHaveAttribute("data-discovery-phase", "FINAL");
  });

  it("does not let a stale presentation timer advance a replacement", () => {
    const view = render(<FirstDiscoveryOverlay presentation={presentation("old")} onDismiss={() => undefined} />);
    act(() => vi.advanceTimersByTime(899));
    view.rerender(<FirstDiscoveryOverlay presentation={presentation("new")} onDismiss={() => undefined} />);
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("dialog")).toHaveAttribute("data-discovery-phase", "BURNING");
    act(() => vi.advanceTimersByTime(899));
    expect(screen.getByRole("dialog")).toHaveAttribute("data-discovery-phase", "REVEALING");
  });

  it("renders repeat discovery as a non-modal dismissible status toast", () => {
    const onDismiss = vi.fn();
    render(<RepeatDiscoveryToast presentation={presentation("repeat", false)} onDismiss={onDismiss} />);
    expect(screen.getByRole("status")).toHaveTextContent("알고 있는 제법");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "굳은 서리꽃 알림 닫기" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
