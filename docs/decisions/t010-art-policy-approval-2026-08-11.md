# T010 아트 권리·AI 표기 정책 조건부 승인

## 결정 메타데이터

| 항목 | 값 |
| --- | --- |
| `decision_id` | `T010` |
| `status` | `CONDITIONAL_APPROVAL` |
| `approvedAt` (UTC) | `2026-08-11T06:38:39.077Z` |
| `approvedAt` (KST) | `2026-08-11T15:38:39.077+09:00` (2026-08-11 15:38:39.077 KST) |
| 승인자 | 상헌 님 |
| 승인 원문 | `T010 권고안 승인` |
| 근거 revision | [`t009-art-policy-r1`](../legal/art-policy-decision-2026-08-11.md) |
| 승인 evidence | [GitHub Issue #12 승인 댓글](https://github.com/wwdbsh/fictor/issues/12#issuecomment-5249868011) |

이 기록은 법률 보증, 상표 클리어런스, 최종 제출 승인 또는 공개 타이틀 승인이 아닙니다. T009의 공개 자료 조사와 미확인 사항을 근거로, 아래 조건을 모두 지키는 Higgsfield 유료 생성만 단계적으로 허용합니다.

## 승인한 정책

### 허용

- T011은 아래 preflight 증거가 **모두 통과한 뒤에만** `nano_banana_2`로 소량의 마스터 스타일 후보를 생성할 수 있습니다.
- 후보는 무브랜드·비민감·텍스트 없는 이미지로 제한합니다. 프롬프트와 reference에는 로고, 레터링, `FICTOR`·`픽토르` 표장, 제3자 캐릭터·상표·이미지, 실존 인물, 개인정보와 비공개 자료를 넣지 않습니다.
- 모든 생성 호출은 `use_unlim=false`로 고정합니다.
- Higgsfield 출력의 게임 포함·수정·해커톤 제출·공개·상업 이용은 계정 적용 약관과 모델별 조건이 아래 preflight 및 재확인 gate에서 계속 충족되는 경우에만 조건부 허용합니다.
- AI 표기는 T009의 B안에 따라 게임 크레딧, README, 제출 설명과 `docs/ASSET_LICENSES.md`에 일관되게 둡니다. 승인 문구는 다음과 같습니다.

> 카드와 세계 아트는 Higgsfield의 생성형 AI 모델을 활용해 제작했으며, 프롬프트 설계·선별·편집은 FICTOR 제작 과정에서 수행했습니다.

이 문구는 승인된 **표기 템플릿**이며 즉시 공개할 수 있는 문구가 아닙니다. `FICTOR`가 별도 공개 타이틀 gate를 통과하면 그대로 사용하고, 다른 타이틀이 승인되면 `FICTOR`를 그 승인 타이틀로 치환한 최종 문구를 같은 gate evidence에 결속합니다. 공개 타이틀이 확정되기 전에는 이 템플릿을 게임 크레딧, 공개 README, 제출 설명이나 다른 공개 표면에 게시하지 않습니다.

모델명은 실제 run ledger와 일치할 때만 최종 공개 문구에 추가하며, provider가 적용한 C2PA·워터마크·provenance 표시는 제거하지 않습니다.

### 금지

- T010 자체는 이미지를 생성하지 않았으며, 이 결정만으로 재료 52장이나 canonical·세계 아트 bulk 생성을 시작할 수 없습니다.
- T011은 preflight가 하나라도 미확인·실패 상태이면 후보도 생성할 수 없습니다. 통과 후에도 허용 범위는 소량 스타일 후보뿐이며 재료 52장과 bulk는 T011 범위 밖입니다.
- `FICTOR` 공개 타이틀은 승인되지 않았습니다. 확대 상표 조사와 별도 공개 전 결정을 마치기 전에는 공개 빌드, 썸네일, 스토어·제출 표장에 사용하지 않습니다.
- 공개 타이틀 gate 전에는 위 AI 표기 템플릿의 `FICTOR` 문자열도 공개 표면에 적용하지 않습니다.
- 승인된 manifest 밖 생성, 권리 상태가 `APPROVED`가 아닌 reference 사용, `use_unlim=true`, 민감·식별 가능 입력, 확인되지 않은 공개 설정에서의 생성은 금지합니다.

## T011 preflight 선행 조건

다음 증거를 공개 저장소에 비밀값 없이 기록하고 모두 통과시켜야 소량 스타일 후보 호출을 시작할 수 있습니다.

1. T008의 파이프라인 안전 규칙을 따르는 T011 전용 후보 manifest를 먼저 고정하고, 후보 ID·경로·프롬프트 hash와 reference 권리 상태를 그 manifest에 기록해야 합니다. 승인된 manifest 밖 후보는 생성하지 않습니다.
2. 실제 Higgsfield MCP 도구 목록과 호출 schema에서 model, batch 제한과 `use_unlim` 인자를 확인하고, `nano_banana_2`의 실제 비용을 호출 전에 확인해야 합니다.
3. 계정에 적용되는 Terms revision·효력일과 Privacy revision·효력일을 확인하고, 입력·출력의 학습·개선 및 제3자 처리 조건을 상헌 님의 이번 승인 범위와 대조해야 합니다. 이는 T009의 U-01과 U-08을 닫는 증거여야 합니다.
4. `nano_banana_2`의 실제 상위 provider와 추가 acceptable-use·출력 조건을 확인해 상업 이용·제3자 재허락·해커톤 공개와 충돌이 없어야 합니다. 이는 U-02를 닫는 증거여야 합니다.
5. MCP 생성물의 공개 기본값, private 설정, 학습 opt-out 가능 여부와 필수 attribution을 확인해야 합니다. private 설정을 적용했음을 검증할 수 없으면 중지합니다. 이는 U-03을 닫는 증거여야 합니다.
6. 시작 balance, 965 크레딧 보유 여부, 2026-08-17 만료의 정확한 시각·시간대와 후보 생성에 충분한 잔액을 확인해야 합니다. 이는 U-04를 닫는 증거여야 합니다.
7. 모든 호출이 `use_unlim=false`이고, batch당 최대 12장이라는 실행 제한과 완료 즉시 local·별도 backup 저장, job ID·balance 전후·SHA-256 ledger 경로가 준비되어 있어야 합니다.

위 조건 중 공개 자료나 계정 화면만으로 닫히지 않는 항목은 Higgsfield support 답변 등 검증 가능한 증거가 필요합니다. 증거가 없거나 조건이 승인 범위와 충돌하면 T011은 `HOLD_FOR_CLARIFICATION` 또는 `NO-GO_FOR_REMOTE_GENERATION`으로 멈춥니다.

## 단계별 사람 gate

### 첫 52장 gate

T011의 소량 후보 생성과 보존만으로 재료 52장은 허용되지 않습니다. 상헌 님이 T012에서 단일 마스터 스타일·reference와 허용·금지 특성을 명시 승인하고, T011 preflight 조건을 다시 확인한 뒤에만 T013이 기본 재료 52장을 생성할 수 있습니다.

### bulk gate

52장이 생성됐다는 사실만으로 bulk는 허용되지 않습니다. 상헌 님이 T014에서 52장 전수를 육안 검토하고, 미검토·보류·교체 미완료 이미지가 없는 manifest revision에 대해 명시적으로 go를 기록한 뒤에만 canonical·세계 아트 bulk를 시작할 수 있습니다. bulk 직전에는 약관 URL의 updated/effective date, Privacy revision, model ID·상위 provider, 계정 plan·공개 기본값·attribution, `use_unlim=false`와 AI 표기 정책을 다시 확인합니다.

## 재승인 trigger

다음 중 하나라도 발생하면 다음 호출 전에 fail closed하고 상헌 님의 재승인을 받습니다.

- Terms·Privacy의 revision, updated/effective date 또는 계정 적용 상태 변경
- model ID·상위 provider·추가 정책·가격·attribution 또는 provenance 요구 변경
- 계정 plan, 공개/private 기본값, 학습·개선·opt-out 또는 제3자 처리 조건 변경
- `use_unlim=false`, batch 제한, 저장·backup·hash ledger 또는 승인 manifest를 보장할 수 없음
- 입력·reference의 권리 상태 변경, 승인 범위 밖 콘텐츠 필요 또는 공개 타이틀 사용 필요
- 잔액·만료 시각이 계획과 달라 승인된 회수·보존 절차를 지킬 수 없음

각 batch 전에는 승인 policy revision, model, `use_unlim=false`, balance와 manifest 범위를 검사합니다. 공개·제출 전에는 타이틀 확대 조사와 별도 승인, AI 표기 이행, 행사 규정·마감 시각을 다시 검증합니다.

## 승계·철회·rollback

- 이 결정은 `t009-art-policy-r1`의 권고안을 조건부 정책으로 확정하지만, T009의 사실·미확인 사항을 대체하거나 법률적 확실성으로 바꾸지 않습니다.
- 후속 결정이 이 기록을 변경하면 새 `decision_id`, 승인자, 시각, 근거 revision, 변경 범위와 이 문서를 supersede한다는 선언을 남겨야 합니다. 그 전에는 이 기록이 T010의 권위 있는 승인 범위입니다.
- 조건 위반, 권리 악화 또는 재확인 실패 시 승인은 해당 시점부터 중지됩니다. 새 생성과 다음 batch를 멈추고 기존 출력·job·hash·약관 증거는 삭제하지 않은 채 격리합니다.
- 격리 출력은 공개 빌드·썸네일·제출물에서 제외하고 플레이 가능한 placeholder로 되돌립니다. 증거 검토와 상헌 님의 별도 재승인 전에는 재사용하거나 bulk를 재개하지 않습니다.

## T010 완료 확인

- [x] 상헌 님의 선택, 승인 시각과 `t009-art-policy-r1`을 기록했습니다.
- [x] 허용·금지 범위, T011 preflight, 첫 52장과 bulk의 독립 gate를 기록했습니다.
- [x] AI 표기 B안과 승인 문구를 확정했습니다.
- [x] `FICTOR` 공개 타이틀을 미승인 상태로 유지했습니다.
- [x] 재승인 trigger와 rollback을 기록했습니다.
- [x] T010에서는 원격 생성이나 에셋 변경을 수행하지 않았습니다.
