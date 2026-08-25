import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BURNKIN_TRACK1_CONFIG_HASH,
  BURNKIN_TRACK1_SAVE_KEY,
  BURNKIN_TRACK1_SCENARIO_HASH,
  FICTOR_RACE_SELECTION_KEY,
  JOINKIN_TRACK1_CONFIG_HASH,
  JOINKIN_TRACK1_SAVE_KEY,
  JOINKIN_TRACK1_SCENARIO_HASH,
  STILLKIN_TRACK1_CONFIG_HASH,
  STILLKIN_TRACK1_SCENARIO_HASH,
} from "../../src/application";
import { listEnabledGrounds, listEnabledRaces } from "../../src/content";
import { PUBLIC_NAMES } from "../../src/content/public-names";
import { FORGE_RUNTIME_SOURCE_HASH } from "../../src/domain/forge-runtime";
import { FICTOR_SAVE_KEY, FICTOR_SAVE_V2_KEY, SAVE_SCHEMA_VERSION_V2 } from "../../src/persistence";

const root = resolve(import.meta.dirname, "../..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

function leafStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(leafStrings);
}

function expectRecursivelyFrozen(value: unknown): void {
  if (!value || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  Object.values(value).forEach(expectRecursivelyFrozen);
}

describe("T057 exact public naming contract", () => {
  it("contains exactly the approved 20 values under the existing race and boss IDs and is recursively immutable", () => {
    expect(PUBLIC_NAMES).toEqual({
      title: { en: "FICTOR", ko: "픽토르" },
      races: {
        Stillkin: { en: "Stillkin", ko: "어름붙이" },
        Burnkin: { en: "Burnkin", ko: "사름붙이" },
        Joinkin: { en: "Joinkin", ko: "이음붙이" },
      },
      elderGods: {
        the_stilling: { en: "The Stilling", ko: "어름" },
        the_burning: { en: "The Burning", ko: "사름" },
        the_scattering: { en: "The Scattering", ko: "흩음" },
        the_rotting: { en: "The Rotting", ko: "삭음" },
        the_washing: { en: "The Washing", ko: "씻음" },
        the_joining: { en: "The Joining", ko: "이음" },
      },
    });
    expect(leafStrings(PUBLIC_NAMES)).toHaveLength(20);
    expectRecursivelyFrozen(PUBLIC_NAMES);
  });

  it("binds every race, ground, boss, and composed epithet to the manifest", () => {
    expect(listEnabledRaces().map(({ id, nameKo, labelKo }) => [id, nameKo, labelKo])).toEqual([
      ["Stillkin", PUBLIC_NAMES.races.Stillkin.ko, PUBLIC_NAMES.races.Stillkin.ko],
      ["Burnkin", PUBLIC_NAMES.races.Burnkin.ko, PUBLIC_NAMES.races.Burnkin.ko],
      ["Joinkin", PUBLIC_NAMES.races.Joinkin.ko, PUBLIC_NAMES.races.Joinkin.ko],
    ]);
    expect(listEnabledGrounds().map((ground) => [
      ground.id,
      ground.nameKo,
      ground.encounters?.boss.id,
      ground.encounters?.boss.name,
      ground.encounters?.boss.labelKo,
    ])).toEqual([
      ["GROUND_STILL", "어름의 터", "the_stilling", PUBLIC_NAMES.elderGods.the_stilling.en, "어름, 처음 멈춘 신"],
      ["GROUND_BURN", "사름의 터", "the_burning", PUBLIC_NAMES.elderGods.the_burning.en, "사름, 꺼지지 못한 신"],
      ["GROUND_SCATTER", "흩음의 터", "the_scattering", PUBLIC_NAMES.elderGods.the_scattering.en, "흩음, 붙잡히지 않은 신"],
      ["GROUND_ROT", "삭음의 터", "the_rotting", PUBLIC_NAMES.elderGods.the_rotting.en, "삭음, 스스로를 먹은 신"],
      ["GROUND_WASH", "씻음의 터", "the_washing", PUBLIC_NAMES.elderGods.the_washing.en, "씻음, 흔적을 지운 신"],
      ["GROUND_JOIN", "이음의 터", "the_joining", PUBLIC_NAMES.elderGods.the_joining.en, "이음, 아무것도 아니었던 신"],
    ]);
  });

  it("keeps active presentation sources on direct manifest imports and excludes screened variant aliases", () => {
    const activeSurfaces = [
      "src/presentation/App.tsx",
      "src/presentation/race-select/RaceSelectApp.tsx",
      "src/presentation/discovery/DiscoveryPresentation.tsx",
      "src/application/browser/race-selection.ts",
      "src/application/browser/stillkin-track1-ui-session.ts",
      "src/application/browser/ui-types.ts",
      "src/application/run/stillkin-track1-controller.ts",
      "src/application/run/track1-types.ts",
      "src/content/types.ts",
      "src/content/races/stillkin.ts",
      "src/content/races/burnkin.ts",
      "src/content/races/joinkin.ts",
      "src/content/grounds/ice.ts",
      "src/content/grounds/burn.ts",
      "src/content/grounds/scatter.ts",
      "src/content/grounds/rot.ts",
      "src/content/grounds/wash.ts",
      "src/content/grounds/join.ts",
    ];
    const combined = activeSurfaces.map((path) => source(path)).join("\n");
    for (const path of activeSurfaces) expect(source(path)).toContain("public-names");
    for (const alias of ["FICTER", "FIKTOR", "FICTORUM", "PIKTOR", "PICTOR", "Stilkin", "Steelkin", "Joynkin", "Still Kin", "Burn Kin", "Join Kin"]) {
      expect(combined).not.toContain(alias);
    }
    for (const publicNameKo of [PUBLIC_NAMES.title.ko, ...Object.values(PUBLIC_NAMES.races).map(({ ko }) => ko), ...Object.values(PUBLIC_NAMES.elderGods).map(({ ko }) => ko)]) {
      expect(combined).not.toContain(publicNameKo);
    }
  });

  it("keeps index metadata exact and singular", () => {
    const html = source("index.html");
    expect(html.match(/<title>FICTOR · 픽토르<\/title>/g)).toHaveLength(1);
    expect(html.match(/<meta name="description" content="조합 기반 로그라이크 덱빌더 픽토르" \/>/g)).toHaveLength(1);
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/<meta name="description"/g)).toHaveLength(1);
  });

  it("extracts the exact title and public pairs from README and preserves the release gates", () => {
    const readme = source("README.md");
    expect(readme.split("\n", 1)[0]).toBe("# FICTOR · 픽토르");
    for (const pair of [
      "Stillkin · 어름붙이", "Burnkin · 사름붙이", "Joinkin · 이음붙이",
      "The Stilling · 어름", "The Burning · 사름", "The Scattering · 흩음",
      "The Rotting · 삭음", "The Washing · 씻음", "The Joining · 이음",
    ]) expect(readme).toContain(`\`${pair}\``);
    expect(readme).toContain("docs/decisions/t057-public-naming-decision-2026-08-24.md");

    const checklist = source("docs/SUBMISSION_CHECKLIST.md");
    expect(checklist).toContain("- [x] [T057 공개 명칭 결정](decisions/t057-public-naming-decision-2026-08-24.md)");
    expect(checklist).toContain("- [ ] T047에서 T057의 exact 공개 명칭 결정");
    expect(checklist).toContain("- [ ] required 게임 제목 source가 `src/content/public-names.ts`의 `FICTOR · 픽토르`");
    expect(checklist).toContain("- [x] exact candidate의 정적 production build");
    expect(checklist).toContain("- [ ] 심사 기간 내 링크가 공개 상태이고");

    const assetLicenses = source("docs/ASSET_LICENSES.md");
    expect(assetLicenses).toContain("2026-08-11 당시 공개 타이틀 미승인");
    expect(assetLicenses.match(/공개 타이틀 미승인/g)).toHaveLength(1);
    expect(assetLicenses).toContain("현재는 T057이 `FICTOR · 픽토르` 명칭을, T058이 AI 표기를 승인했지만 T047 release는 미승인");
  });

  it("records all 20 retained decisions, approval evidence, limitations, and authorization boundaries once", () => {
    const decision = source("docs/decisions/t057-public-naming-decision-2026-08-24.md");
    const rows = [...decision.matchAll(/^\| (N\d{2}) \|[^\n]+\| `([^`]+)` \| `RETAIN_WITH_RECORDED_RESIDUAL_RISK` \|/gm)];
    expect(rows.map((match) => match[1])).toEqual(Array.from({ length: 20 }, (_, index) => `N${String(index + 1).padStart(2, "0")}`));
    expect(rows.map((match) => match[2])).toEqual(leafStrings(PUBLIC_NAMES));
    expect(decision.match(/T056의 조사 결과와 기록된 모든 잔여 위험 및 LIMITED\/UNAVAILABLE 검색 공백을 확인하고 수용하며/g)).toHaveLength(1);
    expect(decision).toContain("`approvedAt`: `2026-08-24T14:53:06.474+09:00` (ledger: `2026-08-24T05:53:06.474Z`)");
    for (const riskClass of ["US-02 LIMITED", "KR-12 LIMITED", "KR-13 LIMITED_NOT_REPRODUCED", "WO-01 UNAVAILABLE", "SG-01 LIMITED", "Steam S/P 미완료"]) expect(decision).toContain(riskClass);
    expect(decision).toContain("상표 clearance, 비침해 판단 또는 다른 법률 보증이 아니다");
    expect(decision).toContain("`T047`, `T061`, `T062`, 공개 release, 배포·제출, 이미지 생성, provider 호출과 유료 호출은 승인하지 않는다");
  });

  it("preserves exact persistence, schema, source, config, and scenario identities", () => {
    expect({
      FICTOR_SAVE_KEY,
      FICTOR_SAVE_V2_KEY,
      BURNKIN_TRACK1_SAVE_KEY,
      JOINKIN_TRACK1_SAVE_KEY,
      FICTOR_RACE_SELECTION_KEY,
      SAVE_SCHEMA_VERSION_V2,
      FORGE_RUNTIME_SOURCE_HASH,
      STILLKIN_TRACK1_CONFIG_HASH,
      STILLKIN_TRACK1_SCENARIO_HASH,
      BURNKIN_TRACK1_CONFIG_HASH,
      BURNKIN_TRACK1_SCENARIO_HASH,
      JOINKIN_TRACK1_CONFIG_HASH,
      JOINKIN_TRACK1_SCENARIO_HASH,
    }).toEqual({
      FICTOR_SAVE_KEY: "fictor.save.v1",
      FICTOR_SAVE_V2_KEY: "fictor.save.v2",
      BURNKIN_TRACK1_SAVE_KEY: "fictor.burnkin.save.v2",
      JOINKIN_TRACK1_SAVE_KEY: "fictor.joinkin.save.v2",
      FICTOR_RACE_SELECTION_KEY: "fictor.race.v1",
      SAVE_SCHEMA_VERSION_V2: 2,
      FORGE_RUNTIME_SOURCE_HASH: "be7a99ea52ecd92438ca8171e4d9d397ff68e56cc9ac59b6b33b9b78dc5446de",
      STILLKIN_TRACK1_CONFIG_HASH: "f3c423e65d86446b36d6453549c759b9673064ca43ee3e151b9a8f6df39ff310",
      STILLKIN_TRACK1_SCENARIO_HASH: "c1d68c5c875889ab57cdc7eca0576bbdb3a5e4e7185072b53c178568681e9aae",
      BURNKIN_TRACK1_CONFIG_HASH: "be29042a378e6fb7bb2a48ed860fb2c48b4e1a4a4740fa745966d1c4d84fed96",
      BURNKIN_TRACK1_SCENARIO_HASH: "b3bda36b89c57b44295c2da839d4be879ebc4bc94ffa131b4afc2488cbb0f0e7",
      JOINKIN_TRACK1_CONFIG_HASH: "055a32defe5cdfb465ce423b3b1f1842e823c9c30ed576990ef88482f2dfb80b",
      JOINKIN_TRACK1_SCENARIO_HASH: "20e06a700d7899137a7f5a629179eac13b04dcebe4a324b2b8f6ef12edf0b209",
    });
  });
});
