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
| `예: 파일명 또는 패키지명` | `제공자 / 모델 또는 버전` | `라이선스·약관 revision` | `APPROVED/PENDING/BLOCKED` | `URL 또는 보관 경로` | `manifest/lockfile/job ledger` | `표기 위치` | `이름, YYYY-MM-DD` |

## AI 생성물 provenance 연결

- 계획과 ID·경로·프롬프트 hash: `assets/manifests/core-v1.plan.json`
- 실행 증거: 이후 생성되는 batch/job ledger의 provider, model, policy revision, job ID, balance 전후, local·backup SHA-256
- 정책 결정: [T010 조건부 승인](decisions/t010-art-policy-approval-2026-08-11.md)의 승인자·시각, 허용 범위, T011 preflight, 첫 52장·bulk gate와 재승인 trigger
- 개별 이미지: manifest asset ID에서 run ledger와 local·backup 파일 hash로 연결

계정 ID, 이메일, API 키, 세션 URL, 서명된 다운로드 URL과 원문 prompt에 포함된 비공개 정보는 공개 저장소에 기록하지 않습니다.

T010은 이미지를 생성하지 않았습니다. T011 스타일 후보 4장과 T013 재료 표본 52장은 각각의 제한 승인 아래 생성됐습니다. T013은 balance `939.90→861.90`, 총 `78.00 credits`, 자동 유료 재시도 0으로 완료됐고 local+backup SHA가 actual evidence에 결속됩니다. T014는 고지된 QA flag를 포함한 기존 T013 52개 bytes를 승인해 canonical bulk style gate와 T015 dependency를 열었지만 provider 호출은 승인하지 않습니다. T015는 별도 Task cycle과 최신 실행 gate가 필요하며, `FICTOR` 공개 타이틀은 계속 미승인입니다. 승인된 AI 표기 템플릿도 공개 타이틀 gate 전에는 게시하지 않습니다.

## 확인 메모

- [ ] 이미지·오디오·폰트·데이터·AI 생성물·오픈소스·외부 코드와 서비스가 모두 표에 있습니다.
- [ ] 출처, 라이선스 원문, 허가·구매·생성 기록을 나중에 확인할 수 있습니다.
- [ ] 저작자 표시, 공유·수정 의무, 배포 범위와 게임 공개 조건을 지켰습니다.
- [ ] API 키·개인정보·비공개 자료를 에셋이나 증빙에 포함하지 않았습니다.
- [ ] provider·model·약관 revision이 승인된 정책 revision과 일치합니다.
- [ ] 모든 AI 에셋이 manifest와 batch/job/local/backup SHA-256으로 연결됩니다.
- [ ] 약관·model·계정 plan·공개 기본값 변경 시 다음 batch 전에 중지했습니다.
