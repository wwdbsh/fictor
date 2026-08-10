# T001 스펙 계약 정합성 검토 기록

- 검토일: 2026-08-11
- 대상: `fictor-codex-spec.md`, `game-design-doc.md`, `AGENTS.md`, 제출 문서
- 목적: 승인된 데이터·에셋·조합 계약을 문서 전반에 동일하게 반영

## 승인 계약값

- canonical 카드 1,326장 = 일반 Tier 2 1,281장 + 장비 45장
- `resultClasses` 34개
- 카드 아트 1,420장
- 고유 신규 세계 아트 74장 = 배경 18장 + 일반 적 30장 + 엘리트 적 6장 + 이벤트 20장
- 보스 6종은 신의 심장 카드 아트 6장을 재사용하며 신규 세계 아트는 0장
- Core 아트 합계 1,494장 = 카드 1,420장 + 세계 아트 74장
- 배치 수 `ceil(1,494 / 12) = 125`
- Core 예상 비용 `1,494 * 0.12 = 179.28`, 즉 약 179 크레딧
- 즉석 빚기와 공방 빚기는 정렬된 재료 id 쌍을 기반으로 동일한 canonical 카드와 동일한 `recipeId`를 사용하며, 단일 도감 영구 키를 공유한다. 두 모드의 차이는 비용과 수명이다.
- 불안정 화합물은 별도 카드·`result_class`·아트가 아니라 상태 플래그와 코드 오버레이로만 표현한다.
- Joinkin 3장 빚기는 2단계 처리하며 canonical catalog 밖의 카드 ID, `recipeId`, 아트를 만들지 않는다.
- 밸런싱 계수는 `SAME_BONUS`, `COST_DIVISOR`, 법칙별 `power_coefficient`, `RESONANCE_RATE` 네 가지다. `power_coefficient`는 필수 `number` 필드이며 정확한 승인값은 8/21 이후 확정한다.

## 수정한 불일치

- `Law` 스키마에 누락된 필수 `power_coefficient: number`와 승인 시점을 명시했다.
- 두 빚기 모드가 동일한 정렬 조합 키, `recipeId`, 단일 도감 영구 키를 공유한다는 계약을 명시했다.
- Joinkin 처리에서 catalog 밖 ID·`recipeId`·아트 생성을 금지했다.
- 세계 아트 74장과 재사용 보스 6장을 분리해 기존 합계의 중복 집계를 제거했다.
- Core 물량·비용·배치를 1,494장, 179.28(약 179) 크레딧, 125배치로 정합화했다.
- UI/프레임·트레일러·TTS를 Core 범위 밖의 선택 산출물로 분리하고, 7일 계획에서 Core 생성·회수·검증을 우선하도록 명료화했다.
- 모든 카드가 직접 조합 가능하다는 오해를 낳는 표현을 조합 문법으로 설명된다는 표현으로 최소 교정했다.

## 무수정 및 정합 판단

- `AGENTS.md`의 즉석 빚기 전투 한정 소모, Joinkin 2단계 처리, 에셋 수량·비용·배치 불변조건은 승인 계약과 정합하므로 내용을 수정하지 않았다.
- 기존 `docs/*.md` 제출 문서는 해커톤 제출 요건과 기록 양식을 다루며 데이터 계약을 다시 정의하지 않으므로 수정하지 않았다.
- 이번 작업은 수량이나 제품 범위를 새로 결정한 것이 아니라 승인된 계약값에 기존 문서를 정합화한 것이다.

## 검증 명령

```bash
rg -n "약 170|80장|계수는 셋" fictor-codex-spec.md game-design-doc.md
rg -n "1,326|1,281|1,420|1,494|1494|179|recipeId|RESONANCE_RATE" fictor-codex-spec.md game-design-doc.md docs/SPEC_CONTRACT_AUDIT.md
git diff --check -- fictor-codex-spec.md game-design-doc.md docs/SPEC_CONTRACT_AUDIT.md
```
