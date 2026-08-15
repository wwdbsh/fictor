// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createStillkinTrack1UiSession, type Track1UiActionDescriptor, type Track1UiProjection } from "../src/application";
import { FICTOR_SAVE_V2_KEY, type StorageLike } from "../src/persistence";
import { App } from "../src/presentation/App";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  failSet = false;
  failGet = false;
  setCalls = 0;
  getItem(key: string) { if (this.failGet) throw new Error("read"); return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failSet) throw new Error("quota"); this.setCalls += 1; this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function mounted(storage = new MemoryStorage()) {
  const session = createStillkinTrack1UiSession({ storage, baseUrl: "/fictor-test/", generationFactory: () => "ui-test-generation" });
  const initialProjection = session.load();
  return { storage, session, initialProjection, ...render(<App session={session} initialProjection={initialProjection} />) };
}

function firstRewardProjection() {
  const storage = new MemoryStorage();
  const session = createStillkinTrack1UiSession({ storage, baseUrl: "/fictor-test/", generationFactory: () => "reward-heading-generation" });
  let projection = session.load();
  projection = session.dispatch((projection as Extract<Track1UiProjection, { phase: "BETWEEN_NODES" }>).action).projection;
  let steps = 0;
  while (projection.phase === "IN_COMBAT") {
    expect(steps++).toBeLessThan(1_000);
    const action = projection.primaryAction?.kind === "START_TURN"
      ? projection.primaryAction
      : projection.hand.find(({ action: cardAction }) => cardAction && !cardAction.disabled)?.action ?? projection.primaryAction;
    if (!action) throw new Error("combat action unavailable");
    projection = session.dispatch(action).projection;
  }
  expect(projection.phase).toBe("AWAITING_REWARD");
  return { session, projection };
}

function instantForgeProjection() {
  const storage = new MemoryStorage();
  const session = createStillkinTrack1UiSession({ storage, baseUrl: "/fictor-test/", generationFactory: () => "instant-ui-generation" });
  let projection = session.load();
  projection = session.dispatch(asBetween(projection).action).projection;
  for (let turn = 0; turn < 8 && projection.phase === "IN_COMBAT"; turn += 1) {
    if (projection.primaryAction?.kind === "START_TURN") projection = session.dispatch(projection.primaryAction).projection;
    if (projection.phase !== "IN_COMBAT") break;
    const selectable = projection.hand.filter(({ forgeSelectable }) => forgeSelectable);
    if (new Set(selectable.map(({ cardId }) => cardId)).size >= 2) return { storage, session, projection };
    projection = session.dispatch(projection.primaryAction!).projection;
  }
  throw new Error("instant forge pair unavailable");
}

function asBetween(projection: Track1UiProjection) {
  if (projection.phase !== "BETWEEN_NODES") throw new Error("expected BETWEEN_NODES");
  return projection;
}

afterEach(cleanup);

describe("Track-1 App", () => {
  it("renders the fixed journey with native controls and focuses the screen heading", async () => {
    mounted();

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByText("FICTOR", { exact: false })).toBeInTheDocument();
    const heading = screen.getByRole("heading", { level: 1, name: "어름의 터 · 깊이 1 / 3" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole("list", { name: "고정된 런 여정" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "다음 기록으로" }).tagName).toBe("BUTTON");
  });

  it("opens a paginated masked Codex and restores focus when closed", async () => {
    const { storage } = mounted();
    const underlay = screen.getByRole("main");
    const backgroundAction = screen.getByRole("button", { name: "다음 기록으로" });
    const screenKey = underlay.getAttribute("data-screen-key");
    const open = screen.getByRole("button", { name: "도감 열기 · 발견 0 / 1326" });
    fireEvent.click(open);
    const dialog = screen.getByRole("dialog", { name: "도감" });
    expect(dialog).toBeInTheDocument();
    expect(underlay).toHaveAttribute("inert");
    expect(underlay).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(backgroundAction);
    expect(storage.setCalls).toBe(0);
    expect(underlay).toHaveAttribute("data-screen-key", screenKey);
    const codexHeading = screen.getByRole("heading", { level: 2, name: "도감" });
    await waitFor(() => expect(codexHeading).toHaveFocus());
    expect(document.querySelectorAll(".codex-entry")).toHaveLength(48);
    expect(document.querySelectorAll(".codex-entry.is-masked")).toHaveLength(48);
    expect(screen.getByText("1 / 28")).toBeVisible();
    const close = screen.getByRole("button", { name: "도감 닫기" });
    const next = screen.getByRole("button", { name: "다음 도감 페이지" });
    fireEvent.keyDown(codexHeading, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(next).toHaveFocus();
    fireEvent.keyDown(next, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "다음 도감 페이지" }));
    expect(screen.getByText("2 / 28")).toBeVisible();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(open).toHaveFocus());
    expect(underlay).not.toHaveAttribute("inert");
    expect(underlay).not.toHaveAttribute("aria-hidden");
  });

  it("requires review and confirmation for irreversible workshop forging, with cancel focus return", async () => {
    const { storage } = mounted();
    const codexOpen = screen.getByRole("button", { name: "도감 열기 · 발견 0 / 1326" });
    fireEvent.click(codexOpen);
    expect(screen.getByText("발견한 기록 0 / 1326")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "도감 닫기" }));
    fireEvent.click(screen.getByRole("button", { name: "공방 열기" }));
    const materialButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".workshop-materials button"));
    const left = materialButtons[0];
    const right = materialButtons.find((button) => button.dataset.materialCardId !== left.dataset.materialCardId)!;
    fireEvent.click(left);
    fireEvent.click(right);
    expect(left).toHaveAttribute("aria-pressed", "true");
    expect(right).toHaveAttribute("aria-pressed", "true");
    const review = screen.getByRole("button", { name: "최종 확인으로" });
    expect(storage.setCalls).toBe(0);
    fireEvent.click(review);
    const dialog = screen.getByRole("dialog", { name: "공방 빚기 최종 확인" });
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "공방 빚기 최종 확인" })).toHaveFocus());
    expect(dialog).toHaveTextContent("선택한 두 재료는 영구적으로 소모");
    expect(dialog).toHaveTextContent("결과");
    expect(dialog).toHaveTextContent("연료");
    expect(storage.setCalls).toBe(0);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(review).toHaveFocus());
    expect(storage.setCalls).toBe(0);

    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(review).toHaveFocus());
    expect(storage.setCalls).toBe(0);
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "영구 소모 확인" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("영구 소모되고 결과가 덱에 편입"));
    expect(storage.setCalls).toBe(1);
    const refreshedOpen = screen.getByRole("button", { name: "도감 열기 · 발견 1 / 1326" });
    fireEvent.click(refreshedOpen);
    expect(screen.getByText("발견한 기록 1 / 1326")).toBeVisible();
  });

  it("separates instant-forge selection from card play and puts the canonical result in hand", async () => {
    const { session, projection } = instantForgeProjection();
    render(<App session={session} initialProjection={projection} />);
    const mode = screen.getByRole("button", { name: "즉석 빚기 선택 모드" });
    fireEvent.click(mode);
    expect(mode).toHaveAttribute("aria-pressed", "true");
    const cards = Array.from(document.querySelectorAll<HTMLButtonElement>("button.combat-card:not(:disabled)"));
    const left = cards[0];
    const right = cards.find((card) => card.dataset.cardId !== left.dataset.cardId)!;
    const screenKey = screen.getByRole("main").getAttribute("data-screen-key");
    fireEvent.click(left);
    fireEvent.click(right);
    expect(left).toHaveAttribute("aria-pressed", "true");
    expect(right).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("main")).toHaveAttribute("data-screen-key", screenKey);
    expect(document.querySelector(".instant-preview > p")).toHaveTextContent("전투 종료 시 결과 소멸 · 재료 복구");
    fireEvent.click(screen.getByRole("button", { name: /^즉석 빚기$/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("즉석 결과가 손에 놓였습니다"));
    expect(document.querySelector('button.combat-card[data-card-id^="forge__"]')).toBeInTheDocument();
  });

  it("enters combat by keyboard-focusable button and moves focus to the new heading", async () => {
    mounted();
    const enter = screen.getByRole("button", { name: "다음 기록으로" });
    enter.focus();
    expect(enter).toHaveFocus();
    fireEvent.click(enter);

    expect(await screen.findByRole("button", { name: "턴 시작" })).toBeEnabled();
    const heading = screen.getByRole("heading", { level: 1, name: "어름의 터 · 깊이 1 / 3" });
    await waitFor(() => expect(heading).toHaveFocus());
    const enemy = screen.getByRole("img", { name: "얼어붙은 무리" });
    expect(enemy).toHaveAttribute("src", "/fictor-test/assets/enemies/enemy__still__swarm.png");
  });

  it("keeps heading focus stable within combat and advances focus after a used card disappears", async () => {
    mounted();
    fireEvent.click(screen.getByRole("button", { name: "다음 기록으로" }));
    const heading = screen.getByRole("heading", { level: 1, name: "어름의 터 · 깊이 1 / 3" });
    await waitFor(() => expect(heading).toHaveFocus());

    const startTurn = await screen.findByRole("button", { name: "턴 시작" });
    startTurn.focus();
    fireEvent.click(startTurn);
    const initialCards = await waitFor(() => {
      const cards = Array.from(document.querySelectorAll<HTMLButtonElement>("button.combat-card"));
      expect(cards).toHaveLength(4);
      return cards;
    });
    expect(heading).not.toHaveFocus();

    const nextInstanceId = initialCards[1].dataset.cardInstanceId;
    initialCards[0].focus();
    fireEvent.click(initialCards[0]);
    await waitFor(() => {
      const nextCard = document.querySelector<HTMLButtonElement>(`button[data-card-instance-id="${nextInstanceId}"]`);
      expect(nextCard).toHaveFocus();
    });
    expect(heading).not.toHaveFocus();

    const remainingCards = Array.from(document.querySelectorAll<HTMLButtonElement>("button.combat-card"));
    const lastCard = remainingCards.at(-1)!;
    lastCard.focus();
    fireEvent.click(lastCard);
    await waitFor(() => expect(screen.getByRole("button", { name: "턴 종료" })).toHaveFocus());
  });

  it("keeps the depth in the shared reward header and focuses the reward screen title", async () => {
    const { session, projection } = firstRewardProjection();
    render(<App session={session} initialProjection={projection} />);

    expect(document.querySelector(".screen-header .depth-label")).toHaveTextContent("어름의 터 · 깊이 1 / 3");
    expect(screen.getByRole("heading", { level: 2, name: "전투에서 살아남았습니다." })).toBeInTheDocument();
    const focusHeading = screen.getByRole("heading", { level: 1, name: "전투에서 살아남았습니다" });
    await waitFor(() => expect(focusHeading).toHaveFocus());
  });

  it("announces FICTOR fuel prices, zero-cost skip, and insufficient-fuel disabled state", () => {
    const storage = new MemoryStorage();
    const session = createStillkinTrack1UiSession({ storage, baseUrl: "/fictor-test/", generationFactory: () => "fictor-cost-generation" });
    const base = session.load();
    const costlyAction: Track1UiActionDescriptor = Object.freeze({ actionId: "costly", kind: "RESOLVE_EVENT", labelKo: "굳은 숨 받기", disabled: true });
    const skipAction: Track1UiActionDescriptor = Object.freeze({ actionId: "skip", kind: "RESOLVE_EVENT", labelKo: "아무것도 고르지 않고 떠나기", disabled: false });
    const projection: Track1UiProjection = {
      ...base,
      phase: "IN_EVENT",
      focusKey: `${base.focusKey}:fictor-cost-test`,
      focusHeadingKo: "다른 빚는 자",
      eventType: "FICTOR",
      titleKo: "다른 빚는 자",
      descriptionKo: "연료와 기록을 교환합니다.",
      artSrc: "/fictor-test/assets/events/event__fictor.png",
      choices: [
        { choiceId: "fictor-still-04", labelKo: costlyAction.labelKo, price: 1, action: costlyAction },
        { choiceId: "fictor-skip", labelKo: skipAction.labelKo, price: 0, action: skipAction },
      ],
    };
    render(<App session={session} initialProjection={projection} />);

    expect(screen.getByRole("button", { name: "굳은 숨 받기 · 연료 1 · 연료 부족" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "아무것도 고르지 않고 떠나기 · 연료 없음" })).toBeEnabled();
    expect(screen.getByText("연료 1")).toBeVisible();
    expect(screen.getByText("연료 없음")).toBeVisible();
  });

  it("keeps the accepted screen on write failure and announces the Korean rollback error", async () => {
    const storage = new MemoryStorage();
    storage.failSet = true;
    mounted(storage);
    fireEvent.click(screen.getByRole("button", { name: "다음 기록으로" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("저장하지 못해 이 행동을 되돌렸습니다");
    expect(screen.getByRole("button", { name: "다음 기록으로" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "턴 시작" })).not.toBeInTheDocument();
  });

  it("shows a blocking error without deleting a corrupt save", () => {
    const storage = new MemoryStorage();
    storage.values.set(FICTOR_SAVE_V2_KEY, "{bad");
    mounted(storage);

    expect(screen.getByRole("alert")).toHaveTextContent("저장 기록을 보존했습니다");
    expect(screen.getByRole("alert")).toHaveTextContent("형식을 읽을 수 없습니다");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(storage.values.get(FICTOR_SAVE_V2_KEY)).toBe("{bad");
  });

  it("removes active controls when saved bytes become corrupt during combat", async () => {
    const storage = new MemoryStorage();
    mounted(storage);
    fireEvent.click(screen.getByRole("button", { name: "다음 기록으로" }));
    const start = await screen.findByRole("button", { name: "턴 시작" });
    storage.values.set(FICTOR_SAVE_V2_KEY, "{bad");
    fireEvent.click(start);

    expect(await screen.findByRole("heading", { level: 1, name: "저장 기록을 열 수 없습니다" })).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("저장 기록을 보존했습니다");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(storage.values.get(FICTOR_SAVE_V2_KEY)).toBe("{bad");
  });
});
