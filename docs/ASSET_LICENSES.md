# 에셋·라이선스 기록

이미지, 오디오, 폰트, 데이터, AI 생성물, 오픈소스, 코드·모델·외부 서비스 등 제출물에 들어간 모든 외부 항목을 기록합니다. 각 항목의 공개·배포·상업적 사용 권리를 확인하고 증빙을 보관합니다. 이 문서는 서비스 수준 요약 인덱스이며, AI 에셋 1,494개의 개별 provenance를 수기로 복제하지 않습니다.

| 에셋/서비스 | provider·model | 약관 revision·적용 상태 | 권리 상태 | 결정·증빙 | manifest·run ledger | AI 표기 | 확인자·일자 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FICTOR 카드·세계 아트 계획 1,494개 | Higgsfield / `nano_banana_2` 계획 | Terms updated 2026-07-26 / 계정 적용 revision·Privacy·모델 추가 조건 `PENDING_T011_PREFLIGHT` | `CONDITIONAL_APPROVAL` — 무브랜드·비민감·텍스트 없는 입력만, `use_unlim=false`; 공개 타이틀 미승인 | [T009 report r1](legal/art-policy-decision-2026-08-11.md) / [T010 조건부 승인](decisions/t010-art-policy-approval-2026-08-11.md) | `assets/manifests/core-v1.plan.json` / T010 생성 없음, T011 preflight 전 | 공개 타이틀 승인 뒤 표기 템플릿을 최종 타이틀에 결속해 게임 크레딧·README·제출 설명·이 문서에 적용; 그 전 공개 적용 금지 | 상헌 님, 2026-08-11 |
| `예: 파일명 또는 패키지명` | `제공자 / 모델 또는 버전` | `라이선스·약관 revision` | `APPROVED/PENDING/BLOCKED` | `URL 또는 보관 경로` | `manifest/lockfile/job ledger` | `표기 위치` | `이름, YYYY-MM-DD` |

## AI 생성물 provenance 연결

- 계획과 ID·경로·프롬프트 hash: `assets/manifests/core-v1.plan.json`
- 실행 증거: 이후 생성되는 batch/job ledger의 provider, model, policy revision, job ID, balance 전후, local·backup SHA-256
- 정책 결정: [T010 조건부 승인](decisions/t010-art-policy-approval-2026-08-11.md)의 승인자·시각, 허용 범위, T011 preflight, 첫 52장·bulk gate와 재승인 trigger
- 개별 이미지: manifest asset ID에서 run ledger와 local·backup 파일 hash로 연결

계정 ID, 이메일, API 키, 세션 URL, 서명된 다운로드 URL과 원문 prompt에 포함된 비공개 정보는 공개 저장소에 기록하지 않습니다.

T010은 이미지를 생성하지 않았습니다. T011은 계정 적용 약관·Privacy, 모델별 추가 조건, 공개/private 기본값, attribution, balance·만료 시각과 `use_unlim=false`를 증거로 확인한 뒤에만 소량의 무브랜드·비민감·텍스트 없는 스타일 후보를 생성할 수 있습니다. 재료 52장과 bulk는 각각 별도 사람 gate를 통과해야 하며, `FICTOR` 공개 타이틀은 계속 미승인입니다. 승인된 AI 표기 템플릿도 공개 타이틀 gate 전에는 게시하지 않습니다.

## 확인 메모

- [ ] 이미지·오디오·폰트·데이터·AI 생성물·오픈소스·외부 코드와 서비스가 모두 표에 있습니다.
- [ ] 출처, 라이선스 원문, 허가·구매·생성 기록을 나중에 확인할 수 있습니다.
- [ ] 저작자 표시, 공유·수정 의무, 배포 범위와 게임 공개 조건을 지켰습니다.
- [ ] API 키·개인정보·비공개 자료를 에셋이나 증빙에 포함하지 않았습니다.
- [ ] provider·model·약관 revision이 승인된 정책 revision과 일치합니다.
- [ ] 모든 AI 에셋이 manifest와 batch/job/local/backup SHA-256으로 연결됩니다.
- [ ] 약관·model·계정 plan·공개 기본값 변경 시 다음 batch 전에 중지했습니다.
