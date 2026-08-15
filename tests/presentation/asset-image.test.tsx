// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AssetImage, isSafeLocalAssetUrl } from "../../src/presentation/assets";

afterEach(cleanup);

describe("AssetImage", () => {
  it("tries one subpath-safe fallback and then renders a named CSS placeholder", () => {
    render(<AssetImage src="/nested/fictor/assets/cards/missing.png" fallbackSrc="/nested/fictor/assets/cards/ore_still.png" placeholderLabel="굳은 서리꽃" alt="굳은 서리꽃" />);
    const primary = screen.getByRole("img", { name: "굳은 서리꽃" });
    expect(primary).toHaveAttribute("src", "/nested/fictor/assets/cards/missing.png");
    expect(primary).toHaveAttribute("data-asset-attempt", "primary");

    fireEvent.error(primary);
    const fallback = screen.getByRole("img", { name: "굳은 서리꽃" });
    expect(fallback).toHaveAttribute("src", "/nested/fictor/assets/cards/ore_still.png");
    expect(fallback).toHaveAttribute("data-asset-attempt", "fallback");
    expect(fallback).toHaveAttribute("data-track1-asset-id", "ore_still");

    fireEvent.error(fallback);
    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "굳은 서리꽃" })).toHaveClass("asset-placeholder");
    expect(document.querySelector("[data-asset-placeholder='굳은 서리꽃']")).toBeInTheDocument();
  });

  it("does not retry when no distinct fallback exists", () => {
    render(<AssetImage src="./assets/cards/missing.png" fallbackSrc="./assets/cards/missing.png" placeholderLabel="기록 없음" alt="" />);
    fireEvent.error(document.querySelector("img")!);
    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect(document.querySelector("[data-asset-placeholder='기록 없음']")).toHaveAttribute("aria-hidden", "true");
  });

  it.each([
    "https://example.invalid/card.png",
    "http://example.invalid/card.png",
    "//example.invalid/card.png",
    "data:image/png;base64,AAAA",
    "blob:https://example.invalid/id",
    "javascript:alert(1)",
    "\\\\example.invalid\\card.png",
    "./assets/cards/ore_still.png\u0000.png",
  ])("blocks an unsafe primary before it reaches img src: %s", (unsafeSrc) => {
    expect(isSafeLocalAssetUrl(unsafeSrc)).toBe(false);
    render(<AssetImage src={unsafeSrc} placeholderLabel="차단된 도판" alt="차단된 도판" />);
    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "차단된 도판" })).toHaveClass("asset-placeholder");
  });

  it("skips an unsafe primary and permits only one safe local fallback", () => {
    render(<AssetImage src="https://example.invalid/card.png" fallbackSrc="/nested/fictor/assets/cards/ore_still.png" placeholderLabel="굳은 광석" alt="굳은 광석" />);
    const fallback = screen.getByRole("img", { name: "굳은 광석" });
    expect(fallback).toHaveAttribute("src", "/nested/fictor/assets/cards/ore_still.png");
    expect(fallback).toHaveAttribute("data-asset-attempt", "fallback");

    fireEvent.error(fallback);
    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "굳은 광석" })).toHaveClass("asset-placeholder");
  });

  it("does not request an unsafe fallback after a safe primary fails", () => {
    render(<AssetImage src="./assets/cards/missing.png" fallbackSrc="//example.invalid/fallback.png" placeholderLabel="기록 없음" alt="" />);
    fireEvent.error(document.querySelector("img")!);
    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect(document.querySelector("[data-asset-placeholder='기록 없음']")).toBeInTheDocument();
  });
});
