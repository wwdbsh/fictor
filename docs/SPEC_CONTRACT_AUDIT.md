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
- 불안정 화합물은 Track 1 구현 범위에서 보류한다. 향후 확장할 때에만 별도 카드·`result_class`·아트가 아닌 상태 플래그와 코드 오버레이로 표현한다.
- Joinkin 3장 빚기는 2단계 처리하며 canonical catalog 밖의 카드 ID, `recipeId`, 아트를 만들지 않는다.
- 밸런싱 계수는 `SAME_BONUS`, `COST_DIVISOR`, 법칙별 `power_coefficient`, `RESONANCE_RATE` 네 가지다. `power_coefficient`는 필수 필드이되 `PENDING_2026_08_21` 동안 `null`이며, 8/21 이후 승인할 때만 유한한 양수다.

## 수정한 불일치

- `Law` 스키마에 누락된 `power_coefficient`와 승인 시점을 명시했다. T003에서 필수 number와 임의 수치 금지 사이의 모순을 `balance_status`로 판별되는 `null | number` 계약으로 정합화했다.
- 두 빚기 모드가 동일한 정렬 조합 키, `recipeId`, 단일 도감 영구 키를 공유한다는 계약을 명시했다.
- Joinkin 처리에서 catalog 밖 ID·`recipeId`·아트 생성을 금지했다.
- 세계 아트 74장과 재사용 보스 6장을 분리해 기존 합계의 중복 집계를 제거했다.
- Core 물량·비용·배치를 1,494장, 179.28(약 179) 크레딧, 125배치로 정합화했다.
- UI/프레임·트레일러·TTS를 Core 범위 밖의 선택 산출물로 분리하고, 7일 계획에서 Core 생성·회수·검증을 우선하도록 명료화했다.
- 모든 카드가 직접 조합 가능하다는 오해를 낳는 표현을 조합 문법으로 설명된다는 표현으로 최소 교정했다.
- 재료 필드 예시의 잘못된 `Law` 변수·타입을 실제 `Material` 필드와 일치하도록 바로잡았다.
- 아트 변주 축을 표의 실제 구성과 맞는 5개로, 강조색을 승인된 6속성으로, 종이 톤을 정확히 4종으로 정합화했다.
- 불안정 화합물이 Track 1에서는 구현 보류이며 향후 확장 시에만 상태 플래그와 코드 오버레이를 사용한다는 범위를 명확히 했다.

## T003 원본 데이터 상태 계약

- 손으로 작성하는 데이터는 `materials.json` 52개, `laws.json` 21개, `resultClasses.json` 34개뿐이다.
- 속성 canonical 순서는 `STILL → BURN → SCATTER → ROT → WASH → JOIN`이며 Law의 `actor`는 `pair[0]`이다.
- 재료와 Law의 밸런스 값은 `PENDING_2026_08_21`이면 모두 `null`, `APPROVED`이면 허용 범위의 수를 모두 갖는다. 부분 승인과 자리표시자 숫자는 거부한다.
- 터 산물 30개의 희귀도는 깊이 경계가 정해질 때까지 `PENDING_DEPTH_CLASSIFICATION`과 `null`로 둔다.
- 촉매 밀도는 미확정 값이 아니라 재료 정체성과 `representation`에서 파생하는 승인 규칙(`DERIVED_FROM_MATERIAL`)이다. T008 프롬프트가 두 필드를 반영한다.
- 장비 밀도는 45개 `CUTAWAY` 내부 구조도에 `DENSE`를 일관 적용한다. 이는 T003 구현 결정이며 T012 마스터 스타일 승인 전까지 수정 가능하다.
- 촉매는 Law 21의 기존 효과군을 재사용한다. 특히 결속은 새 `AMPLIFY_JOIN`이 아니라 `DOUBLE_FORGE`다.
- 심장은 상대 속성 효과의 최상위 강화형이라는 의미가 확정되어 `ATTRIBUTE_MAXIMUM_RULE`로 기록한다. 8/21 이후 확정하는 것은 수치뿐이다.
- 희귀도는 보상 테이블, 밸런스 값은 전투 수치를 차단한다. 촉매 파생 규칙과 장비 밀도가 확정되어 최종 아트 manifest는 `READY`다.
- semantic validator는 52개 재료 문구나 21개 Law 표를 복제하지 않는다. ID와 쌍은 규칙으로 생성하고 source 간 참조 관계를 검증한다. 한국어 이름·수식어·명사는 세 source가 단일 원본이며 T005/T006의 사용자 검수와 source revision hash가 승인본을 보호한다.

## 무수정 및 정합 판단

- `AGENTS.md`의 즉석 빚기 전투 한정 소모, Joinkin 2단계 처리, 에셋 수량·비용·배치 불변조건은 승인 계약과 정합하므로 내용을 수정하지 않았다.
- 기존 `docs/*.md` 제출 문서는 해커톤 제출 요건과 기록 양식을 다루며 데이터 계약을 다시 정의하지 않으므로 수정하지 않았다.
- 이번 작업은 수량이나 제품 범위를 새로 결정한 것이 아니라 승인된 계약값에 기존 문서를 정합화한 것이다.

## 검증 명령

```bash
git ls-files --error-unmatch \
  AGENTS.md \
  fictor-codex-spec.md \
  game-design-doc.md \
  docs/ASSET_LICENSES.md \
  docs/CODEX_USAGE_LOG.md \
  docs/HACKATHON_RULES.md \
  docs/SPEC_CONTRACT_AUDIT.md \
  docs/SUBMISSION_CHECKLIST.md
git diff --check main...HEAD
sed -n '/### 재료 필드 (추가)/,/### 파생 공식/p' game-design-doc.md | rg -n "const law: Law"
rg -n "4개의 변주 축|8속성|4~5종|약 170|80장|계수는 셋" fictor-codex-spec.md game-design-doc.md
```

## 검증 결과

- **PASS** — `git ls-files --error-unmatch`가 대상 8개 파일을 모두 출력하고 종료 코드 0을 반환했다.
- **PASS** — `git diff --check main...HEAD`가 출력 없이 종료 코드 0을 반환했다.
- **PASS** — 재료 필드 절과 나머지 오래된 문구에 대한 두 stale scan이 각각 일치 항목 없이 종료 코드 1을 반환했다. `rg`에서 일치 없음은 기대 결과다.
