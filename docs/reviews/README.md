# 이름 검수 패키지

이 디렉터리는 canonical 빚기 카드 1,326장의 이름을 누락 없이 사람이 검수하기 위한 T005 산출물이다. 범위는 `LAW` 861장, `CATALYST` 420장, `EQUIPMENT` 45장이며 Tier 3, 재료 설명문, 아트 품질은 포함하지 않는다.

## 파일 소유권

- `name-review.generated.csv`: 기계 생성 전용이다. 직접 수정하지 않고 `npm run review:names`로만 갱신한다.
- `name-review.decisions.json`: 현재 target의 사람 검수 전용이다. 명령은 파일이 없을 때 초기 `PENDING` 본을 한 번 만들 뿐, 기존 파일을 덮어쓰지 않는다.
- `archive/<full-source-hash>/name-review.decisions.json`: 이전 target의 결정 bytes를 source hash별로 보존한다. archive 파일은 수정하거나 새 target의 근거로 재사용하지 않는다.
- `src/data/generated/cards.generated.json`과 `equipment.generated.json`: canonical 생성물이다. 이름을 고치기 위해 직접 수정하지 않는다. 승인된 이름 처분은 이미 source에 반영되었으며, 이후 변경은 새 승인 근거에 따라 세 source 또는 생성 규칙을 수정하고 다시 생성한다.

CSV는 UTF-8(BOM 없음), LF, RFC4180 quoting을 사용하며 `card_id`의 raw Unicode code-point 순서다. 1부터 시작하는 `ordinal`은 이 순서의 검수 위치다. `LAW` 행만 `law_pair`와 `rule_text_ko`를 채우며 `rule_key`도 canonical attribute pair다. 결과군은 별도 `result_class` 열에 둔다. `CATALYST`는 `rule_type=RESULT_CLASS`와 결과군을, `EQUIPMENT`는 `rule_type=DOMAIN_PAIR`와 domain 쌍·패시브 id·패시브 문구를 `rule_key`에 기록한다.

## 명명 공식과 검수 방법

모든 이름은 다음 공식의 결과다.

```text
<actor의 modifier_form> + 공백 + <receptor의 noun_form>
```

검수자는 CSV를 `ordinal` 순서로 전부 읽고, 기본 상태를 `PENDING`에서 `APPROVED`로 바꾸기 전에 전 행 검수를 완료해야 한다. 개별 예외는 `overrides`에서 카드 id별로 기록한다.

```json
{
  "default_status": "APPROVED",
  "all_rows_reviewed": true,
  "reviewer": "검수자 식별자",
  "reviewed_at": "2026-08-11T12:00:00+09:00",
  "evidence": "검수 방식 또는 체크리스트 위치",
  "overrides": {
    "forge__example_a__example_b": {
      "status": "CHANGE_REQUIRED",
      "reason": "바꿔야 하는 이유",
      "proposed_name_ko": "제안 이름",
      "application_hint": "SOURCE:tool_05.modifier_form"
    }
  }
}
```

기본 상태는 sparse decision model에 따라 `PENDING` 또는 `APPROVED`만 허용한다. override 상태는 `PENDING`, `APPROVED`, `CHANGE_REQUIRED`, `HOLD`를 허용한다. `CHANGE_REQUIRED.application_hint`는 해당 행의 실제 이름 구성 요소인 `SOURCE:<actor_id>.modifier_form` 또는 `SOURCE:<receptor_id>.noun_form`, 혹은 공백 없이 시작하고 끝나는 `GENERATOR_RULE:<설명>` 형식이어야 한다.

모든 `CHANGE_REQUIRED.proposed_name_ko`는 현재 `generated_name_ko`와 달라야 한다. actor source 변경이면 제안은 정확히 `<비어 있지 않은 새 modifier> <현재 receptor_noun_form>`으로, receptor source 변경이면 `<현재 actor_modifier_form> <비어 있지 않은 새 noun>`으로 분해되어야 한다. 따라서 `SOURCE:`를 적고 공식과 무관한 이름 전체를 제안할 수 없다. `GENERATOR_RULE:` 제안도 현재 이름과 다른 경우만 허용한다.

종료 게이트는 `all_rows_reviewed=true`, timezone 또는 `Z`가 포함된 실제 ISO 검수 시각, 유효한 검수자·증거, effective `PENDING/HOLD` 0건을 요구한다. 플래그가 있는 행은 반드시 명시적인 `APPROVED`와 사유 또는 완전한 `CHANGE_REQUIRED` 제안을 가져야 한다.

## 자동 플래그

플래그는 오류 판정이 아니라 검수 우선순위 힌트다. 문맥상 자연스러운 결과도 있으므로 false positive를 사람이 승인할 수 있다.

- `EXACT_DUPLICATE`, `NORMALIZED_DUPLICATE`: 정확히 같거나 NFKC·공백 정규화 후 같은 이름
- `EXCLAMATION`, `SECOND_PERSON`, `OVERSTATEMENT`: `!`, `당신`, 확정 목록 `놀라운`·`엄청난`·`경이로운`·`압도적인`·`궁극의`
- `APOSTROPHE`, `EDGE_WHITESPACE`, `REPEATED_WHITESPACE`: 표기·공백 이상 후보
- `ADJACENT_TOKEN_REPEAT`: 인접 토큰의 정확 반복
- `MODIFIER_NOUN_EXACT_COLLISION`: NFKC 뒤 JavaScript 공백을 모두 제거한 비어 있지 않은 수식어가 비어 있지 않은 명사 전체로 시작함
- `FIRST_SYLLABLE_REPEAT`: 같은 정규화 뒤 수식어와 명사의 첫 code point가 같은 완성형 한글 음절(`U+AC00..U+D7A3`)임
- `SENTENCE_MARK`: 이름에 들어간 문장부호

두 form-repeat 플래그는 서로 독립이며 위 순서로 보고한다. 중간 포함, 역방향 포함, 선행 문장부호는 건너뛰지 않는다. 플래그는 이름을 자동 수정하지 않는다. 현재 exact 충돌은 0건, 첫 음절 반복은 8건이며 정확한 대상은 `npm run review:names:check`의 `flagged_rows`에서 확인한다. 카드 설명문은 이 데이터에 존재하지 않으므로 “2문장 이내”와 관찰 기록체 검사는 N/A다. 이를 이름에 대한 가짜 품질 검사로 대체하지 않는다.

## 명령과 handoff

```bash
npm run review:names
npm run review:names:check
npm run review:names:check -- --require-closed
npm run verify
```

`review:names`는 source와 canonical envelope를 먼저 검증하고 CSV만 원자적으로 재생성한다. 결정 파일은 최초 부재 시에만 만든다. `review:names:check`는 어떤 파일도 쓰지 않고 CSV bytes, 전체 id, 분기 수, 정렬, hash, 결정 스키마·target·override id를 확인한다. `--require-closed`는 T006 종료 조건이다.

T006은 현재 v2 CSV 전 행의 사람 검수와 결정 기록만 담당한다. `flagged_rows` 8건은 각각 명시적인 disposition과 사유가 필요하고, 나머지 행도 `all_rows_reviewed=true` 전에 실제로 확인해야 한다. 현재 live 결정은 전 행 검수와 flagged 8건의 명시적 승인을 담은 `APPROVED` 종료 상태다. target의 source·cards·review hash가 바뀌면 기존 결정이 의도적으로 fail closed하여, 검수 근거가 다른 입력의 결과에 조용히 재사용되거나 덮어써지는 일을 막는다.

## Archive와 rebaseline

source 또는 검출 규칙을 바꿀 때는 현재 결정 파일을 target의 **전체** `source_hash` 경로로 먼저 옮기고 bytes를 그대로 보존한다. 그 뒤 반드시 `npm run gen:data`, `npm run review:names` 순서로 실행한다. 새 결정 파일은 이전 결정을 복사하지 않고 새 v2 target의 initial `PENDING` 상태로 만든다. 같은 두 명령을 반복했을 때 생성 catalog와 CSV bytes/hash가 같아야 하며, `gen:data:check`와 `review:names:check`가 모두 통과해야 한다.

이번 rebaseline에서 v1 결정은 `archive/285ab100c7b209c4557dccca91c3372aebb90f0de20700ea53b2c55060a34e9a/name-review.decisions.json`에 원래 bytes로 보존했다. 상헌 님의 명시적 지시에 따라 `tool_05.modifier_form`을 `헤아린`, `tool_10.modifier_form`을 `부려놓은`으로 적용했다. 이 지시는 두 source 변경의 근거였고, 현재 live v2 결정 파일에는 새 target의 전 행 검수와 종료 승인이 기록되어 있다.

현재 target의 source/catalog/review hash는 [live 결정 파일](name-review.decisions.json)이 유일한 문서 근거다. 기계 검증 결과와 정렬된 실제 플래그 행은 `npm run review:names:check` 출력으로 확인한다. 이 문서에 hash 표를 수동 복사하지 않는다.

T007이 닫은 M1 Phase 0의 불변 기준선은 [데이터 마일스톤](../milestones/README.md)에서 관리한다. 이름 검수 target을 다시 잡으면 기존 milestone record가 의도적으로 실패하며, 재검수 종료와 별도 승인 없이 자동 갱신하지 않는다.
