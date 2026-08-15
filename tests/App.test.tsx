// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createStillkinTrack1UiSession } from "../src/application";
import { FICTOR_SAVE_V2_KEY, type StorageLike } from "../src/persistence";
import { App } from "../src/presentation/App";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  failSet = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failSet) throw new Error("quota"); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function mounted(storage = new MemoryStorage()) {
  const session = createStillkinTrack1UiSession({ storage, baseUrl: "/fictor-test/", generationFactory: () => "ui-test-generation" });
  const initialProjection = session.load();
  return { storage, session, initialProjection, ...render(<App session={session} initialProjection={initialProjection} />) };
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
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "다음 기록으로" }).tagName).toBe("BUTTON");
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
});
