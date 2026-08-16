// @vitest-environment jsdom
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
  it("offers both enabled races and starts a Burnkin ice run without touching Stillkin save bytes", async () => {
    const storage = new MemoryStorage();
    render(<RaceSelectApp selection={createTrack1RaceSelection({ storage, baseUrl: "/fictor-test/" })} />);

    expect(screen.getByRole("heading", { name: "붙이를 고르세요" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "어름붙이로 시작" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "사름붙이로 시작" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "다음 기록으로" })).toBeTruthy());
    expect(storage.values.get(FICTOR_RACE_SELECTION_KEY)).toBe("Burnkin");
    fireEvent.click(screen.getByRole("button", { name: "다음 기록으로" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "턴 시작" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "턴 시작" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /피 태우기/ })).toBeTruthy());
    expect(storage.values.has(BURNKIN_TRACK1_SAVE_KEY)).toBe(true);
    expect(storage.values.has(FICTOR_SAVE_V2_KEY)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "붙이 바꾸기 · 현재 사름붙이" }));
    expect(screen.getByRole("button", { name: "어름붙이로 시작" })).toBeTruthy();
  });

  it("keeps existing Stillkin v2 users on their current run without showing a new gate", () => {
    const storage = new MemoryStorage();
    storage.values.set(FICTOR_SAVE_V2_KEY, "existing");
    render(<RaceSelectApp selection={createTrack1RaceSelection({ storage, baseUrl: "/fictor-test/" })} />);
    expect(screen.queryByRole("heading", { name: "붙이를 고르세요" })).toBeNull();
    expect(screen.getByRole("heading", { name: "저장 기록을 열 수 없습니다" })).toBeTruthy();
  });
});
