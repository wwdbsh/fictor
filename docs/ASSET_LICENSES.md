# 에셋·라이선스 기록

이미지, 오디오, 폰트, 데이터, AI 생성물, 오픈소스, 코드·모델·외부 서비스 등 제출물에 들어간 모든 외부 항목을 기록합니다. 각 항목의 공개·배포·상업적 사용 권리를 확인하고 증빙을 보관합니다. 이 문서는 서비스 수준 요약 인덱스이며, AI 에셋 1,494개의 개별 provenance를 수기로 복제하지 않습니다.

| 에셋/서비스 | provider·model | 약관 revision·적용 상태 | 권리 상태 | 결정·증빙 | manifest·run ledger | AI 표기 | 확인자·일자 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FICTOR 카드·세계 아트 계획 1,494개 | Higgsfield / `nano_banana_2` 계획 | Terms updated 2026-07-26 / 계정 적용 revision·Privacy·모델 추가 조건 `PENDING_T011_PREFLIGHT` | `CONDITIONAL_APPROVAL` — 무브랜드·비민감·텍스트 없는 입력만, `use_unlim=false`; 공개 타이틀 미승인 | [T009 report r1](legal/art-policy-decision-2026-08-11.md) / [T010 조건부 승인](decisions/t010-art-policy-approval-2026-08-11.md) | `assets/manifests/core-v1.plan.json` / T010 생성 없음, T011 preflight 전 | 공개 타이틀 승인 뒤 표기 템플릿을 최종 타이틀에 결속해 게임 크레딧·README·제출 설명·이 문서에 적용; 그 전 공개 적용 금지 | 상헌 님, 2026-08-11 |
| T013 기본 재료 52장 | Higgsfield / 요청 `nano_banana_2`, 보고 `nano_banana_flash` | T013 위험 공개·정확 범위 승인 적용; 미확인 계정 약관 항목은 기존 조건부 상태 유지 | `APPROVED_EXISTING_T013_52_ONLY` — `tool_08` 텍스트, 일부 style·paper·3D·color drift, `odd_01` 마스터 구도·관절 다리 형상 누출 flag를 기존 bytes에만 수용; 미래 정책 완화 아님 | [T013 실행 기록](asset-runs/t013-materials-local-preparation-2026-08-11.md) / [T014 결정](decisions/t014-material-style-approval-2026-08-12.md) | `assets/manifests/materials-v1.plan.json` / `assets/evidence/t013-materials-actual-run-v1.json` / `assets/manifests/material-style-approval-v1.json` / ignored canonical journal+별도 backup | 공개 타이틀과 최종 attribution gate 전 게시 금지; 현재 저장소 내부 표본 | 상헌 님, 2026-08-12 |
| T015 canonical 332장 | Higgsfield / 요청 `nano_banana_2`, 보고 `nano_banana_flash` | T015 범위별 위험 공개·승인 및 T010 조건 유지 | `CONDITIONAL_APPROVAL_EXISTING_BYTES_ONLY` — 생성 완료는 미확인 약관·공개 타이틀 권리를 확장하지 않음 | [T015 실행·복구 기록](asset-runs/t015-canonical-shard-1-v3-recovery-2026-08-13.md) | `assets/manifests/canonical-shard-1-v1.plan.json`, `canonical-shard-1-v4.plan.json` / T015 tracked evidence / owner backup | 최종 attribution·공개 타이틀 gate 전 공개 금지 | 상헌 님, 2026-08-13 |
| T016 선별 canonical 157장 | Higgsfield / 요청 `nano_banana_2`, 보고 `nano_banana_flash` | T016 위험 공개·160장 승인 중 157장 회수; 기존 조건 유지 | `CONDITIONAL_APPROVAL_EXISTING_BYTES_ONLY`; 실패 3개는 권리나 생성 완료를 주장하지 않음 | [T016 실행 기록](asset-runs/t016-canonical-selected-run-2026-08-14.md) | `assets/manifests/t016-canonical-cards-v1.plan.json` / per-batch tracked evidence / owner backup | 최종 attribution·공개 타이틀 gate 전 공개 금지 | 상헌 님, 2026-08-14 |
| T019 신의 심장 6장 | Higgsfield / 요청 `nano_banana_2`, 보고 `nano_banana_flash` | T019 정확 범위 승인; 기존 조건 유지 | `CONDITIONAL_APPROVAL_EXISTING_BYTES_ONLY` | [T019 실행 기록](asset-runs/t019-heart-cards-run-2026-08-14.md) | `assets/manifests/t019-heart-cards-v1.plan.json` / tracked evidence / owner backup | 최종 attribution·공개 타이틀 gate 전 공개 금지 | 상헌 님, 2026-08-14 |
| T020 세계 아트 54장 | Higgsfield / 요청 `nano_banana_2`, 보고 `nano_banana_flash` | T020 v1/v2 위험 공개·승인; 기존 조건 유지 | `CONDITIONAL_APPROVAL_EXISTING_BYTES_ONLY` | [T020 실행 기록](asset-runs/t020-world-art-run-2026-08-13.md) | `assets/manifests/t020-world-art-v1.plan.json`, `t020-world-art-v2.plan.json` / tracked evidence / owner backup | 최종 attribution·공개 타이틀 gate 전 공개 금지 | 상헌 님, 2026-08-13 |
| T021 이벤트 아트 20장 | Higgsfield / 요청 `nano_banana_2`, 보고 `nano_banana_flash` | T021 정확 범위 승인; 기존 조건 유지 | `CONDITIONAL_APPROVAL_EXISTING_BYTES_ONLY` | [T021 실행 기록](asset-runs/t021-event-art-run-2026-08-14.md) | `assets/manifests/t021-event-art-v1.plan.json` / tracked evidence / owner backup | 최종 attribution·공개 타이틀 gate 전 공개 금지 | 상헌 님, 2026-08-14 |
| T022 M2 감사 621장 | 새 생성 없음 / 기존 T013·T015·T016·T019·T020·T021 bytes | point-in-time local+backup byte 감사; provider 호출·지출 0 | `NO_RIGHTS_STATUS_CHANGE` — 기존 conditional 상태를 승인·상업 이용 가능으로 격상하지 않음 | [T022 감사 기록](asset-runs/t022-m2-assets-audit-2026-08-14.md) | `assets/manifests/t022-m2-assets-audit-v1.json` / `docs/milestones/m2-assets.json` | 기존 최종 attribution·공개 타이틀 gate 유지 | 상헌 님, 2026-08-14 |

## T046 배포 snapshot — 2026-08-22 KST

[T046 공개 직전 감사](legal/t046-release-audit-2026-08-22.md)의 판정은
`AUDIT_COMPLETE_WITH_BLOCKERS`다. 이 snapshot은 기존 provenance 행을 대체하거나 권리 상태를
격상하지 않는다.

| 실제 정적 산출물 항목 | 수량·버전 | 증빙·원문 | 공개 상태 |
| --- | --- | --- | --- |
| AI 카드 PNG | 547 | T022 manifest·감사 547 | `BLOCKED_FOR_RELEASE` |
| AI 배경 PNG | 18 | T022 manifest·감사 18 | `BLOCKED_FOR_RELEASE` |
| AI 적·엘리트 PNG | 36 | T022 manifest·감사 36 | `BLOCKED_FOR_RELEASE` |
| AI 이벤트 PNG | 20 | T022 manifest·감사 20 | `BLOCKED_FOR_RELEASE` |
| AI 스타일 후보 PNG | 4 | T011 v2 evidence·[T012 결정](decisions/t012-master-style-approval-2026-08-11.md) | 01 `SELECTED`; 02–04 `NOT_SELECTED`; 네 파일 모두 dist-copied, 전체 `BLOCKED_FOR_RELEASE` |
| 결정론적 폴백 | 873 | T022: canonical 837 + `HEART_FORGE` 36 | 파일·외부 에셋 아님 |
| 번들 폰트·오디오·비디오 | 0 | `dist` 확장자 inventory | system font fallback only; 외부 media 없음 |
| React / react-dom / scheduler | 19.2.8 / 19.2.8 / 0.27.0 | MIT; 공통 LICENSE SHA-256 `da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93` | 코드 포함, 배포 고지 누락으로 `BLOCKED_FOR_RELEASE` |
| Vite modulepreload polyfill + preload helper | Vite 8.2.1 | MIT; `LICENSE.md` SHA-256 `387dd7baa307083401a27c58c362c30832f5ba1dba84f10cc22c33401523f45c` | 코드 포함, 배포 고지 누락으로 `BLOCKED_FOR_RELEASE` |
| 작성 데이터·FICTOR 코드 | repository authored | Git history·handwritten source·결정론적 generator | 외부 항목 아님 |

`package-lock.json` SHA-256은
`13471a5f8fefa27551d342f9c0d45863cad31677557f528d7039524ff4abe6c4`다. modulepreload polyfill 외 Vite
구현과 나머지 package-lock 항목은 빌드·개발 도구 inventory이며 독립 package 파일로 현재 public dist에 포함되지 않는다. `dist`에는
제3자 `LICENSE`/`NOTICE`/`COPYING` 파일과 보존된 license header가 없다. 공개 전 후속 구현에서 고지를
포함하고 새 산출물을 재감사해야 한다. 이 React·Vite 계열 고지 누락은
[T046 blocker `B-04`](legal/t046-release-audit-2026-08-22.md#공개-blocker-원장과-t047-handoff)와 같은 항목이다.

현재 Higgsfield 공개 Terms(updated 2026-07-26)의 commercial use 조건과 AI disclosure 조항, live UI에
`Updated Aug 3, 2026`으로 표시된 공식 Help Center의 attribution 불필요·commercial use 가능 안내를
확인했다. 같은 Help Center의 semantic text extractor가 `Aug 2, 2026`으로 렌더링한 하루 차이는 T046
감사에 기록했으며 어느 표시도 생성 당시 적용 약관 revision으로 쓰지 않는다. 그러나 2026-08-11–14 생성
당시 계정 적용 revision·조기 동의와 요청 `nano_banana_2` 대 보고 `nano_banana_flash`의 supplemental
policy가 미확인이다. 현재 도움말을 과거 권리로 소급하지 않으며 AI PNG 625장 전부를 비면제 공개
blocker로 유지한다. 원문은 [Terms](https://higgsfield.ai/terms-of-use-agreement),
[Help Center](https://higgsfield.ai/creator-hub/help-center/account/who-owns-my-generations-and-can-i-use-them-commercially),
[Privacy Policy](https://higgsfield.ai/privacy-policy)다.

T009/T010의 다음 문구는 **T047 판단용 미승인 초안**이다.

> 카드와 세계 아트는 Higgsfield의 생성형 AI 모델을 활용해 제작했으며, 프롬프트 설계·선별·편집은 FICTOR 제작 과정에서 수행했습니다.

T047에서 타이틀과 최종 문구를 승인한 뒤에만 게임 크레딧·README·제출 설명·이 문서의 네 위치에 같은
문구를 적용한다. 요청/보고 모델 불일치를 해소하기 전에는 모델명을 추가하지 않는다. 현재 게임 UI,
README와 dist에는 이 표기를 적용하지 않았다.

## AI 생성물 provenance 연결

- 계획과 ID·경로·프롬프트 hash: `assets/manifests/core-v1.plan.json`
- 실행 증거: 이후 생성되는 batch/job ledger의 provider, model, policy revision, job ID, balance 전후, local·backup SHA-256
- 정책 결정: [T010 조건부 승인](decisions/t010-art-policy-approval-2026-08-11.md)의 승인자·시각, 허용 범위, T011 preflight, 첫 52장·bulk gate와 재승인 trigger
- 개별 이미지: manifest asset ID에서 run ledger와 local·backup 파일 hash로 연결

계정 ID, 이메일, API 키, 세션 URL, 서명된 다운로드 URL과 원문 prompt에 포함된 비공개 정보는 공개 저장소에 기록하지 않습니다.

T010은 이미지를 생성하지 않았습니다. T011 스타일 후보 4장과 T013 재료 표본 52장은 각각의 제한 승인 아래 생성됐습니다. T013은 balance `939.90→861.90`, 총 `78.00 credits`, 자동 유료 재시도 0으로 완료됐고 local+backup SHA가 actual evidence에 결속됩니다. T014는 고지된 QA flag를 포함한 기존 T013 52개 bytes를 승인해 canonical bulk style gate와 T015 dependency를 열었지만 provider 호출은 승인하지 않습니다. T015–T021의 후속 생성·회수는 각 행의 독립 승인·증거에 결속됩니다. `FICTOR` 공개 타이틀과 최종 AI 표기는 계속 미승인입니다.

## 확인 메모

- [x] T046 기준 실제 이미지·폰트·오디오·비디오·AI·오픈소스·작성 항목 inventory를 구분했습니다.
- [x] T022 621장과 T011 스타일 4장의 provenance·manifest·결정 링크를 보존했습니다.
- [x] T046 문서에 계정 ID, 이메일, API 키, form 개인정보나 signed URL을 복제하지 않았습니다.
- [x] 번들 폰트·오디오·비디오가 없고 system font fallback만 쓰는 것을 확인했습니다.
- [ ] 생성 당시 계정 적용 Terms·Privacy와 요청/보고 모델의 supplemental policy가 확인됐습니다.
- [ ] 게임 크레딧·README·제출 설명·이 문서의 AI 표기가 T047 승인 문구로 일치합니다.
- [ ] 배포 산출물에 React·Vite 계열 MIT 고지가 포함됐습니다.
- [ ] `FICTOR` 공개 타이틀과 스타일 후보 02–04의 배포 포함 여부가 승인됐습니다.
