// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BURNKIN_TRACK1_SAVE_KEY, createTrack1RaceSelection, FICTOR_RACE_SELECTION_KEY } from "../../src/application";
import { RaceSelectApp } from "../../src/presentation/race-select";
import { FICTOR_SAVE_V2_KEY, type StorageLike } from "../../src/persistence";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

afterEach(cleanup);

describe("race selection", () => {
  it("focuses the first heading, offers enabled races, and starts a Burnkin ice run without touching Stillkin save bytes", async () => {
    const storage = new MemoryStorage();
    render(<RaceSelectApp selection={createTrack1RaceSelection({ storage, baseUrl: "/fictor-test/" })} />);

    const selectionHeading = screen.getByRole("heading", { name: "붙이를 고르세요" });
    await waitFor(() => expect(document.activeElement).toBe(selectionHeading));
    const legalBefore = screen.getAllByRole("link", { name: "제3자 라이선스 고지" });
    expect(legalBefore).toHaveLength(1);
    expect(legalBefore[0]).toHaveAttribute("href", "/fictor-test/THIRD_PARTY_NOTICES.txt");
    expect(legalBefore[0]).not.toHaveAttribute("target");
    expect(legalBefore[0]).not.toHaveAttribute("tabindex");
    legalBefore[0].focus();
    expect(legalBefore[0]).toHaveFocus();
    expect(screen.getByRole("button", { name: "어름붙이로 시작" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "사름붙이로 시작" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "다음 기록으로" })).toBeTruthy());
    const legalAfter = screen.getAllByRole("link", { name: "제3자 라이선스 고지" });
    expect(legalAfter).toHaveLength(1);
    expect(legalAfter[0]).toHaveAttribute("href", "/fictor-test/THIRD_PARTY_NOTICES.txt");
    legalAfter[0].focus();
    expect(legalAfter[0]).toHaveFocus();
    expect(storage.values.get(FICTOR_RACE_SELECTION_KEY)).toBe("Burnkin");
    fireEvent.click(screen.getByRole("button", { name: "다음 기록으로" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "턴 시작" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "턴 시작" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /피 태우기/ })).toBeTruthy());
    expect(storage.values.has(BURNKIN_TRACK1_SAVE_KEY)).toBe(true);
    expect(storage.values.has(FICTOR_SAVE_V2_KEY)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "붙이 바꾸기 · 현재 사름붙이" }));
    expect(screen.getByRole("button", { name: "어름붙이로 시작" })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "붙이를 고르세요" })));
  });

  it("keeps existing Stillkin v2 users on their current run without showing a new gate", () => {
    const storage = new MemoryStorage();
    storage.values.set(FICTOR_SAVE_V2_KEY, "existing");
    render(<RaceSelectApp selection={createTrack1RaceSelection({ storage, baseUrl: "/fictor-test/" })} />);
    expect(screen.queryByRole("heading", { name: "붙이를 고르세요" })).toBeNull();
    expect(screen.getByRole("heading", { name: "저장 기록을 열 수 없습니다" })).toBeTruthy();
  });

  it("renders Joinkin's ordered A/B/third slots and traps keyboard focus in irreversible confirmation", async () => {
    const storage = new MemoryStorage();
    const { container } = render(<RaceSelectApp selection={createTrack1RaceSelection({ storage, baseUrl: "/fictor-test/" })} />);
    fireEvent.click(screen.getByRole("button", { name: "이음붙이로 시작" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /공방 열기/ })).toBeTruthy());
    const opener = screen.getByRole("button", { name: /공방 열기/ });
    opener.focus();
    fireEvent.click(opener);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "공방 빚기" })));

    const slotList = screen.getByRole("list", { name: "빚기 재료 슬롯" });
    expect(slotList.textContent).toContain("기본 재료 A");
    expect(slotList.textContent).toContain("기본 재료 B");
    expect(slotList.textContent).toContain("세 번째 공명 재료");
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button[data-material-card-id]"));
    const chosen: HTMLButtonElement[] = [];
    const seen = new Set<string>();
    for (const button of buttons) {
      const cardId = button.dataset.materialCardId!;
      if (seen.has(cardId)) continue;
      seen.add(cardId);
      chosen.push(button);
      if (chosen.length === 3) break;
    }
    expect(chosen).toHaveLength(3);
    chosen.forEach((button) => fireEvent.click(button));
    expect(slotList.textContent).not.toContain("비어 있음");
    expect(screen.getByText(/세 번째 재료 · .* · JOIN 공명 오버레이/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "최종 확인으로" }));

    const dialog = screen.getByRole("dialog", { name: "공방 빚기 최종 확인" });
    expect(dialog.textContent).toContain("선택한 세 재료는 영구적으로 소모");
    expect(dialog.textContent).toContain("영구 소모 세 번째 재료");
    const cancel = screen.getByRole("button", { name: "취소" });
    const confirm = screen.getByRole("button", { name: "영구 소모 확인" });
    const heading = screen.getByRole("heading", { name: "공방 빚기 최종 확인" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirm);
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirm);
    confirm.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "공방 빚기 최종 확인" })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "최종 확인으로" }));
  });
});
