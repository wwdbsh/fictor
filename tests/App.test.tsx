// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "../src/presentation/App";

afterEach(cleanup);

describe("App", () => {
  it("renders the Korean bootstrap surface with semantic landmarks", () => {
    render(<App />);

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "FICTOR · 픽토르" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("게임의 실행 기반을 준비했습니다.");
  });
});
