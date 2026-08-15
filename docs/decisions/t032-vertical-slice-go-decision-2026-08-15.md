# T032 수직 슬라이스 확장 GO 결정 — 2026-08-15

## 결정

```text
decision_id: T032
decision_status: GO_FOR_EXISTING_T033_SCOPE_WITH_DIRECT_PLAY_PREREQUISITE_WAIVED
task_contract_sha256: 4831aaacd77eb63515ceebd5636928373034228ae2d3ec25e8c3e01e3c1d1eda
approver: 상헌 님
approval_literal: 진행하자. go
approval_recorded_at_utc: 2026-08-15T08:18:19Z
approval_issue_comment: https://github.com/wwdbsh/fictor/issues/34#issuecomment-5301337721
direct_play_prerequisite_waiver_literal: 8월 21일 직접 플레이 선행 조건을 면제하고, 사람 플레이 관찰 없이 기존 T033 범위로 지금 진행한다.
direct_play_prerequisite_waived_at_utc: 2026-08-15T08:42:16Z
direct_play_prerequisite_waiver_comment: https://github.com/wwdbsh/fictor/issues/34#issuecomment-5301426374
planned_direct_play_condition_satisfied_by_play: false
planned_direct_play_condition_waived_by_owner: true
human_play_observations: NOT_PROVIDED
user_play_environment: NOT_PROVIDED
subjective_fun_observation: NOT_OBSERVED
combination_comprehension_observation: NOT_OBSERVED
tension_observation: NOT_OBSERVED
repeat_intent_observation: NOT_OBSERVED
goal_ledger_reconciliation_required: false
downstream_implementation_performed: false
deployment_or_submission_performed: false
remote_generation_performed: false
```

상헌 님의 원문 `진행하자. go`와 후속 원문 `8월 21일 직접 플레이 선행 조건을 면제하고, 사람 플레이
관찰 없이 기존 T033 범위로 지금 진행한다.`를 Stillkin×어름의 터 수직 슬라이스의 현재 검증 후보에
결속한다. 두 번째 원문은 원래 2026-08-21로 예정된 사람 직접 플레이 선행 조건을 명시적으로 면제하고,
Burnkin 확장 Task T033의 기존 범위를 다음 별도 사이클에서 선택할 수 있도록 승인한다. 선행 조건은
실제 플레이로 충족된 것이 아니라 권한자인 상헌 님이 면제했다. 플레이 환경·관찰 노트·상세 재미 근거는
제공되지 않았으므로 추론하지 않는다.

이 GO는 사람의 재미·이해도·긴장·반복 의향이 검증됐다는 뜻이 아니다. T031 녹화는 Codex가 정적 빌드의
기능 완주를 확인한 증거이며 사람 플레이나 주관적 재미 판정의 대체물이 아니다. 최종 밸런스 수치 승인,
T033 구현 착수·완료, M4 전체 자동 실행, 공개 배포·제출도 이 결정에 포함하지 않는다.

## 결속된 T031 후보

| 역할 | 값 |
|---|---|
| 검증된 실행 후보 Candidate A2 | `be79bfbd8d4524523fc89c6a1d0308f62c78d000` |
| Candidate tree SHA-1 | `49c58f13a6c9434e2bbf35cca6a8b3d143f8729b` |
| direct-child Evidence B2 | `ad9ca8bde59c05e88dd4fc888a86605a0e4b52ae` |
| 병합된 보존 지점 | `44e93e4d405d238c611ac35bf88850e93bc3c037` |
| T031 변경 전 부모 | `ba0ffbbd0a4cdcf336fc04970a89ddfefb547e1a` |
| 정적 빌드 dist tree SHA-256 | `f48c65f7c7c282b0ad1a397499d6671145c88ecb63b2f5cdb625dd86b9a0a422` |
| T031 audit manifest SHA-256 | `6faaf7799f9f93a41936bfd7f2ed58276d1bb955e4cace1923654005db60e356` |
| 연속 QA 영상 SHA-256 | `41c9157e60510929ccc1e809aed1184e6a44cdfcb34572403f0d38093231065b` |

근거 원장은 [M3 milestone](../milestones/m3-vertical-slice.json),
[T031 audit manifest](../../assets/manifests/t031-m3-candidate-audit-v1.json),
[QA provenance](../milestones/evidence/t031/manual-evidence.json),
[known issues](../milestones/evidence/t031/known-issues.json)에 있다. Candidate A2와 Evidence B2는 실행 후보와
직계 증거의 검증 경계다. 병합 지점 `44e93e4…`는 build hash나 direct-child evidence commit으로 해석하지
않는다.

T031에서 확인된 범위는 패배·재시작, 즉석 빚기 수명주기, 무료·유료 공방, 보상 제한, 보스 승리·재시작,
정적 PNG 621/621, 외부/API/WebSocket/브라우저 오류 0이다. QA 실행자와 녹화 주체는 `CODEX`이며 인앱
Browser에 연결 가능한 인스턴스가 없어 Puppeteer 지속 세션을 사용했다.

## 유지되는 위험과 비승인 범위

- T015 owner journal과 owner backup은 clean checkout에서 재검증되지 않았다. owner-only suite의 명시적
  skip과 tracked T022 감사의 신뢰 경계를 유지한다.
- T027 Track 1 수치는 계속 provisional이다. 이번 GO는 `SAME_BONUS`, `COST_DIVISOR`,
  `power_coefficient`, `RESONANCE_RATE` 또는 다른 최종 밸런스 값을 승인하지 않는다.
- 사람 직접 플레이에서 조합 이해도·긴장·반복 의향·발견 연출의 감정 효과는 아직 관찰되지 않았다.
- Firefox·Safari 사람 검증, 공개 URL 배포, 해커톤 제출은 수행되지 않았다.

## 후속 범위와 원장 정합성

다음에 선택 가능한 범위는 기존 Issue #35 T033 “M4 Burnkin 종족 규칙과 콘텐츠 활성화” 계약뿐이다.
그 계약 hash는 `840ed0dcd20f76647f28e0bfc1f9fbf0ceae55f9f9fac5adb8744dea9c5dfae5`이며,
Burnkin 패시브·지피기·공명·시작 덱, 종족 선택, 체력 지불 원자성의 기존 범위를 바꾸지 않는다. T032는
T033 구현을 수행하거나 시작 상태로 전이하지 않는다.

직접 플레이 선행 조건의 면제는 위 두 번째 승인 원문으로 충족되며, 관찰이 존재했다는 주장으로 대체하지
않는다. 이번 결정은 Goal의 제품 범위·T033 수용 기준을 변경하지 않으므로
`goal_ledger_reconciliation_required: false`다. T032 병합으로 T033 의존성이 충족되는 것은 일반 Task 상태
전이이며 계약 reconciliation이 아니다. 이후 코어 규칙, Task 범위 또는 수용 기준을 바꾸려면 별도
Goal·ledger reconciliation과 상헌 님의 재승인이 필요하다.

## 승계·철회

이 기록은 편집이나 삭제로 결론을 바꾸지 않는다. 이후 사람 플레이에서 조건부 GO 또는 NO-GO가 내려지면
새 결정 문서가 이 T032 기록을 명시적으로 supersede해야 한다. T033 시작 전 철회라면 다음 Task 선택을
중단한다. T033 진행 후 철회라면 구현을 되돌리는 별도 rollback Task와 검증이 필요하다. T032 자체는
런타임 변경이 없으므로 코드 rollback 대상이 없다.

## 수용 기준 대조

| 기준 | 처분 |
|---|---|
| 명시적 go/no-go와 build hash 기록 | `진행하자. go`, 직접 플레이 선행 조건 면제 원문, dist tree SHA-256을 위에 고정했다. |
| 조건부 또는 no-go의 유한한 코어 수정 기준 | 해당 없음. 결론은 기존 T033 범위에 대한 GO다. |
| 후속 범위 변경 시 reconciliation 표시 | 현재는 변경 없음으로 `false`; 향후 범위·수용 기준 변경 시 reconciliation과 재승인을 요구한다. |

Docs impact: required — 확장 전 사용자 결정, 정확한 검증 후보, 관찰되지 않은 항목, 유지되는 위험,
후속 범위 및 supersession 규칙을 장기 결정 기록으로 남긴다.
