// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { AssetImage, isSafeLocalAssetUrl, resolveSafeLocalAssetUrl, type AssetUrlContext } from "../../src/presentation/assets";

const urlContext: AssetUrlContext = { origin: "https://fictor.test", basePath: "/fictor-test/" };

afterEach(cleanup);

describe("AssetImage", () => {
  it("tries one subpath-safe fallback and then renders a named CSS placeholder", () => {
    render(<AssetImage assetRole="DISCOVERY_RESULT" src="/assets/cards/missing.png" fallbackSrc="/assets/cards/ore_still.png" placeholderLabel="굳은 서리꽃" alt="굳은 서리꽃" />);
    const primary = screen.getByRole("img", { name: "굳은 서리꽃" });
    expect(primary).toHaveAttribute("src", "/assets/cards/missing.png");
    expect(primary).toHaveAttribute("data-asset-attempt", "primary");

    fireEvent.error(primary);
    const fallback = screen.getByRole("img", { name: "굳은 서리꽃" });
    expect(fallback).toHaveAttribute("src", "/assets/cards/ore_still.png");
    expect(fallback).toHaveAttribute("data-asset-attempt", "fallback");
    expect(fallback).toHaveAttribute("data-track1-asset-id", "ore_still");

    fireEvent.error(fallback);
    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "굳은 서리꽃" })).toHaveClass("asset-placeholder");
    expect(document.querySelector("[data-asset-placeholder='굳은 서리꽃']")).toBeInTheDocument();
  });

  it("does not retry when no distinct fallback exists", () => {
    render(<AssetImage assetRole="HAND" src="./assets/cards/missing.png" placeholderLabel="기록 없음" alt="" />);
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
    "ht\ntps://example.invalid/card.png",
    "/assets/%2e%2e/cards/ore_still.png",
    "/assets/%252e%252e/cards/ore_still.png",
  ])("blocks an unsafe primary before it reaches img src: %s", (unsafeSrc) => {
    expect(isSafeLocalAssetUrl(unsafeSrc)).toBe(false);
    render(<AssetImage assetRole="HAND" src={unsafeSrc} placeholderLabel="차단된 도판" alt="차단된 도판" />);
    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "차단된 도판" })).toHaveClass("asset-placeholder");
  });

  it("skips an unsafe primary and permits only one safe local fallback", () => {
    render(<AssetImage assetRole="DISCOVERY_RESULT" src="https://example.invalid/card.png" fallbackSrc="/assets/cards/ore_still.png" placeholderLabel="굳은 광석" alt="굳은 광석" />);
    const fallback = screen.getByRole("img", { name: "굳은 광석" });
    expect(fallback).toHaveAttribute("src", "/assets/cards/ore_still.png");
    expect(fallback).toHaveAttribute("data-asset-attempt", "fallback");

    fireEvent.error(fallback);
    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "굳은 광석" })).toHaveClass("asset-placeholder");
  });

  it("does not request an unsafe fallback after a safe primary fails", () => {
    render(<AssetImage assetRole="DISCOVERY_RESULT" src="./assets/cards/missing.png" fallbackSrc="//example.invalid/fallback.png" placeholderLabel="기록 없음" alt="" />);
    fireEvent.error(document.querySelector("img")!);
    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect(document.querySelector("[data-asset-placeholder='기록 없음']")).toBeInTheDocument();
  });

  it("rejects every literal ASCII control before URL parsing", () => {
    for (const code of [...Array.from({ length: 32 }, (_, index) => index), 127]) {
      expect(resolveSafeLocalAssetUrl(`/fictor-test/assets/cards/card${String.fromCharCode(code)}.png`, urlContext)).toBeNull();
    }
  });

  it("canonicalizes only same-origin PNGs under the explicit base assets prefix", () => {
    expect(resolveSafeLocalAssetUrl("./assets/cards/ore_still.png?revision=1", urlContext)).toBe("/fictor-test/assets/cards/ore_still.png?revision=1");
    expect(resolveSafeLocalAssetUrl("https://fictor.test/fictor-test/assets/cards/ore_still.png", urlContext)).toBe("/fictor-test/assets/cards/ore_still.png");
    expect(resolveSafeLocalAssetUrl("https://other.test/fictor-test/assets/cards/ore_still.png", urlContext)).toBeNull();
    expect(resolveSafeLocalAssetUrl("/assets/cards/ore_still.png", urlContext)).toBeNull();
    expect(resolveSafeLocalAssetUrl("/fictor-test/assets/%2f..%2fcards/ore_still.png", urlContext)).toBeNull();
  });

  it("fails closed when the slot is unbound or the declared policy forbids fallback", () => {
    const RuntimeAssetImage = AssetImage as unknown as ComponentType<Record<string, unknown>>;
    const unbound = render(<RuntimeAssetImage src="/assets/cards/ore_still.png" placeholderLabel="미결속" alt="미결속" />);
    expect(screen.getByRole("img", { name: "미결속" })).toHaveAttribute("data-asset-role", "unbound");
    unbound.unmount();

    render(<RuntimeAssetImage assetRole="HAND" src="/assets/cards/missing.png" fallbackSrc="/assets/cards/ore_still.png" placeholderLabel="잘못된 fallback" alt="잘못된 fallback" />);
    fireEvent.error(screen.getByRole("img", { name: "잘못된 fallback" }));
    expect(screen.getByRole("img", { name: "잘못된 fallback" })).toHaveClass("asset-placeholder");
  });

  it("requires STATIC_MANIFEST sources to bind an exact pinned record", () => {
    render(<AssetImage assetRole="STATIC_MANIFEST" src="/assets/cards/not-pinned.png" placeholderLabel="정적 미결속" alt="정적 미결속" />);
    expect(screen.getByRole("img", { name: "정적 미결속" })).toHaveClass("asset-placeholder");
  });
});
