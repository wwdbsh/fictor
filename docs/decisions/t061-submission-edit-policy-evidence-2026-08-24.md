# T061 B-06 제출 운영 disposition 근거 — 2026-08-24

## 상태와 범위

- 상태: `IN_PROGRESS` / `DRAFT_NON_SUBMITTABLE` — local-only 계약 개정과 초안 재개만 승인됐습니다. T061 complete와 PR #119 merge는 blocked이며, 이 문서는 완료·merge 또는 T047 공개 release 증거가 아닙니다.
- disposition: `B06_OPERATIONALLY_CLOSED_WITH_UNKNOWN_CUTOFF_AND_NO_LATE_MUTATION_DEPENDENCY`
- 범위: 이미 확인한 공식 공개 자료의 두 YES와 세 UNKNOWN을 보존하고, UNKNOWN에 의존하지 않는 FICTOR 운영 경계를 기록합니다.
- 제외: 추가 외부 조사·운영진 문의·live form 접근, 플레이테스트·게임 변경·test/build, 데모 capture/upload, T062/T047/T048 실행, release·배포·QA·제출, 이미지 생성, provider·유료 호출.
- 이 문서는 [T046 공개 직전 감사](../legal/t046-release-audit-2026-08-22.md)를 변경하거나 소급하지 않습니다. 제출 수정 가능성에 관한 지식만 이 문서의 최신 관찰로 보완합니다.

## 공식 공개 근거

확인 시각은 `2026-08-24T10:16:10Z` (`2026-08-24 19:16:10 KST`)입니다. 폼 화면, payload, 이메일, 쿠키, 계정 정보와 개인정보는 수집하거나 저장하지 않았습니다.

| 출처 | 공개 상태 | 확인한 사실 |
| --- | --- | --- |
| [Track 1 공식 FAQ](https://openaigame2026.com/ko/news/online-warm-up-challenge-track-1) | 게시 `2026-08-10`; metadata 수정 `2026-08-21T18:00:49.285422Z` | 마감 전에는 수정한 전체 버전을 다시 제출할 수 있습니다. 복수 제출 시 운영진은 원칙적으로 가장 최신에 제출된 버전을 기준으로 확인할 예정이라고 안내하며, 최신본 사용·대체를 무조건 보장하지는 않습니다. 개별 입력 필드 편집 가능 여부도 열거하지 않습니다. |
| 같은 공식 FAQ | 위와 같음 | 제출한 동일 URL에 연결된 게임 업데이트에는 별도 제한이 없습니다. 다만 늦은 변경은 심사에 보이지 않을 수 있고 링크는 계속 플레이 가능해야 합니다. |
| [참가 약관](https://openaigame2026.com/ko/terms) | 시행 `2026-08-03` | 마감 뒤 제출 정보 수정 가능 여부와 방법은 공개 조항만으로 확정되지 않습니다. 운영 사무국에 문의할 수 있다고만 안내하며 문의 의무를 부과하지 않습니다. |
| [공식 홈페이지](https://openaigame2026.com/) | 접수 기간 `08/04–08/26` | countdown target과 사용자가 제공한 공식 홈페이지 화면은 `2026-08-27 00:00 +09:00`을 강하게 시사합니다. T061 계약에 따라 이는 정확한 cutoff 확인 근거로 사용하지 않습니다. 화면 파일은 저장소에 복사하거나 보관하지 않습니다. |

## 정책 판정표

| 질문 | 판정 | 근거와 한계 |
| --- | --- | --- |
| 정확한 접수 cutoff | `UNKNOWN / NOT_DEPENDED_ON` | 접수 종료 날짜는 8월 26일입니다. countdown 관찰만으로 정확한 시각을 확정하지 않고 일정 보증에 사용하지 않습니다. |
| 마감 전 수정본 전체 재제출 | `YES` | FAQ가 허용합니다. 운영진은 원칙적으로 가장 최신에 제출된 버전을 기준으로 확인할 예정이며, 최신본 사용·대체 보장은 아닙니다. 개별 필드 편집 가능 여부도 열거되지 않았습니다. |
| 제출 후 동일 URL의 게임 콘텐츠 업데이트 | `YES` | FAQ상 별도 제한이 없습니다. 늦은 업데이트가 심사에 반영된다는 보장은 없으며 링크는 플레이 가능해야 합니다. |
| 마감 후 제출 폼 정보 수정 | `UNKNOWN / NOT_REQUIRED / OUT_OF_SCOPE` | 약관은 가능 여부를 확정하지 않습니다. 프로젝트는 마감 후 폼을 수정할 계획이 없고 이 기능에 의존하지 않습니다. |
| 마감 후 플레이 URL 교체 | `UNKNOWN / NOT_REQUIRED / OUT_OF_SCOPE` | 동일 URL 콘텐츠 업데이트 허용이 URL 교체 허용을 뜻하지 않습니다. 프로젝트는 stable URL을 교체하지 않습니다. |

## 사실과 운영 가정

공식 FAQ로 확인된 사실은 마감 전 수정본 전체 재제출, 운영진이 원칙적으로 가장 최신 제출 버전을 기준으로 확인할 예정이라는 안내, 동일 제출 URL의 게임 업데이트 허용입니다. 최신본 사용·대체는 보장되지 않으며, 정확한 cutoff, 마감 후 제출 폼 정보 수정, 마감 후 URL 교체도 확인되지 않았습니다.

소유자는 세 UNKNOWN을 사실상 YES 또는 NO로 바꾸지 않고 다음 disposition으로 운영상 닫습니다.

```text
B06_OPERATIONALLY_CLOSED_WITH_UNKNOWN_CUTOFF_AND_NO_LATE_MUTATION_DEPENDENCY
```

이 disposition은 정책 확인 PASS, 법률 보증 또는 제출·심사 운영 보증이 아닙니다. 정확한 cutoff를 일정 보증에 쓰지 않고, 마감 후 폼 수정·URL 교체·최신 재제출본 선택 보장·늦은 업데이트의 심사 반영에 의존하지 않는다는 소유자 결정입니다.

프로젝트 소유자의 운영 전략은 다음과 같습니다.

1. 실제 폼에 입력하지 않고 [repository-safe 폼 필드 초안](../submission/track1-form-field-draft.md)과 [완성 프로젝트 데모 프리프로덕션](../submission/track1-demo-preproduction.md)을 먼저 준비합니다.
2. 상헌 님이 dated exact commit을 직접 플레이하고 `NO_CHANGE_REQUIRED` 또는 구체적인 개선 필요를 결정합니다.
3. 개선이 필요하면 별도 bounded change Tasks를 정의·완료하고, 변경된 exact commit을 다시 플레이테스트합니다.
4. exact-candidate-ready 별도 승인 뒤 T062 재감사, T047 공개 release 결정을 순서대로 수행합니다.
5. T049가 T062/T047 exact artifact를 stable public URL에 배포한 뒤, 그 URL과 exact artifact에 결속된 완성 프로젝트 데모와 제출 패키지를 T048의 별도 승인 아래 제작합니다.
6. T050 공개 URL QA, T051 exact tuple 승인, T052 제출, T053 종료 감사를 순서대로 수행합니다.
7. 제출 뒤 허용된 업데이트가 필요하면 제출한 동일 stable URL 안에서만 수행합니다. URL 교체나 늦은 변경의 심사 반영은 가정하지 않습니다.

## 차단과 다음 증거

T061은 승인된 local-only drafting 범위에서 in-progress이고, T061 complete와 PR #119 merge는 계속 blocked입니다. T062, T047과 후속 Task도 blocked입니다. 현재 승인은 계약 개정과 T061 local-only drafting 재개에만 적용되며 완료·merge 증거로 재사용할 수 없습니다. T061의 다음 결정은 초안 검토와 별도 완료·merge 승인입니다. 이후에는 상헌 님의 dated exact-commit 직접 플레이테스트 disposition과 exact-candidate-ready 별도 승인이 필요합니다.

정확한 cutoff나 마감 후 mutation 정책을 추가로 해소하는 것은 T061 완료 조건이 아닙니다. 실제 폼, 개인정보, 화면, payload, 이메일, 쿠키, 계정, 연락처, session, token은 저장하지 않습니다. release·배포·QA·데모 capture/upload·제출은 수행하지 않았습니다.
