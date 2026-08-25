import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { AI_DISCLOSURE_TEXT, STATIC_RUNTIME_AI_NOTICE } from "../../src/content/ai-disclosure";

const root = resolve(import.meta.dirname, "../..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const occurrences = (value: string, needle: string) => value.split(needle).length - 1;

describe("T058 exact AI disclosure contract", () => {
  it("pins the approved canonical payload without normalization", () => {
    expect(AI_DISCLOSURE_TEXT).toBe("카드와 세계 아트는 Higgsfield의 생성형 AI 모델을 활용해 제작했으며, 프롬프트 설계·선별·편집은 FICTOR 제작 과정에서 수행했습니다.");
    expect(AI_DISCLOSURE_TEXT.length).toBe(82);
    expect([...AI_DISCLOSURE_TEXT]).toHaveLength(82);
    expect(Buffer.byteLength(AI_DISCLOSURE_TEXT, "utf8")).toBe(176);
    expect(createHash("sha256").update(AI_DISCLOSURE_TEXT, "utf8").digest("hex")).toBe("1219abc0ea8e7621e93a0b802577aba7dd0288a57c010594fd81f6f911080644");
    expect(STATIC_RUNTIME_AI_NOTICE).toBe("게임 실행 중에는 생성형 AI나 외부 API를 호출하지 않습니다.");
  });

  it("keeps one exact raw disclosure block in each durable public source", () => {
    for (const path of ["README.md", "docs/ASSET_LICENSES.md"]) {
      const bytes = source(path);
      expect(bytes.split("\n").filter((line) => line === AI_DISCLOSURE_TEXT)).toHaveLength(1);
      expect(occurrences(bytes, AI_DISCLOSURE_TEXT)).toBe(1);
    }

    const constantSource = source("src/content/ai-disclosure.ts");
    expect(occurrences(constantSource, AI_DISCLOSURE_TEXT)).toBe(1);
    const componentSource = source("src/presentation/legal/AiDisclosure.tsx");
    expect(componentSource).toContain("{AI_DISCLOSURE_TEXT}");
    expect(componentSource).not.toMatch(/dangerouslySetInnerHTML|innerHTML|fetch\s*\(|https?:\/\//);
  });

  it("extracts the canonical submission JSON value raw and keeps it ready for the 200-character field", () => {
    const bytes = source("docs/submission/track1-description.ko.json");
    const match = bytes.match(/^\{"description_ko":"([^"]+)"\}\n$/);
    expect(match).not.toBeNull();
    const rawValue = match![1];
    expect(rawValue).not.toMatch(/^\s|\s$/);
    expect(rawValue).not.toContain("\\");
    expect(occurrences(rawValue, AI_DISCLOSURE_TEXT)).toBe(1);
    expect(Buffer.from(rawValue, "utf8").includes(Buffer.from(AI_DISCLOSURE_TEXT, "utf8"))).toBe(true);

    const parsed = JSON.parse(bytes) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["description_ko"]);
    expect(parsed.description_ko).toBe(rawValue);
    expect(rawValue.length).toBeLessThanOrEqual(200);
    expect([...rawValue].length).toBeLessThanOrEqual(200);
    expect(rawValue).toMatch(/카드 2장을 빚어 새 카드를 발견/);
    expect(rawValue).toMatch(/세 붙이의 규칙/);
    expect(rawValue).toMatch(/어름의 터 3단계/);
    expect(rawValue).not.toMatch(/TODO|TBD|PLACEHOLDER|YYYY|https?:\/\//i);
  });

  it("preserves T055 non-warranty evidence and every release boundary", () => {
    const licenses = source("docs/ASSET_LICENSES.md");
    for (const signal of [
      "release digest `a691621e04e44c1ee45d79722e83fbe1765c3f1e148b9740985fe60a6f81d632`",
      "AI PNG 622개",
      "substantive gap은 6",
      "`completionEligible=false`",
      "T047 공개 release는 별도 gate",
      "[ ] 생성 당시 계정 적용 Terms·Privacy와 요청/보고 모델의 supplemental policy가 확인됐습니다.",
    ]) expect(licenses).toContain(signal);

    const decision = source("docs/decisions/t058-ai-disclosure-approval-2026-08-24.md");
    expect(decision).toContain("`2026-08-24T07:07:48.848Z`");
    expect(decision).toContain("구조적 gap은 `0`, substantive gap은 `6`, 역사적 `completionEligible=false`");
    expect(decision).toContain("권리를 검증하거나 법률적 비침해·상업 이용 가능성을 보증하지 않는다");
    expect(decision).toContain("T047 공개 release, T061, T062, 배포·제출은 승인하지 않는다");
    expect(decision).toContain("이미지 생성, provider 호출, 유료 호출은 승인하지 않는다");

    const checklist = source("docs/SUBMISSION_CHECKLIST.md");
    expect(checklist).toContain("- [x] [T058 AI 제작 고지 승인]");
    expect(checklist).toContain("- [x] [T047 공개 release 결정](decisions/t047-public-release-decision-2026-08-25.md)");
    expect(checklist).toContain("- [x] [T062 production 재감사](legal/t062-production-reaudit-2026-08-25.md)");
    expect(checklist).toContain("- [x] exact candidate의 정적 production build");
    expect(checklist).toContain("실제 제출 폼 반영은 아직 하지 않았습니다");

    const releaseDecision = source("docs/decisions/t047-public-release-decision-2026-08-25.md");
    expect(releaseDecision).toContain("OWNER_RELEASE_RISK_ACCEPTED_WITH_UNRESOLVED_GENERATION_TIME_RIGHTS_EVIDENCE");
    expect(releaseDecision).toContain("substantive gap 6, historical `completionEligible=false`");
    expect(releaseDecision).toContain("생성 당시 권리 검증 또는 법률 보증이 아니다");
  });
});
