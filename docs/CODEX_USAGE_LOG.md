# Codex 사용 기록

이 문서는 제출용 exact 서술과 실제 T048 작업 기록만 보관합니다. owner live entry와 이후 Task 값은 저장하지 않습니다.

## 제출용 요약 메모

FICTOR는 Codex와 함께 TypeScript/React 정적 웹 게임으로 개발했습니다. Codex는 52개 재료와 21개 법칙에서 1,326개 canonical 조합을 결정론적으로 생성하는 데이터 파이프라인, 즉석·공방 빚기가 같은 recipe resolver를 공유하는 전투 규칙, 도감과 localStorage 저장, 정적 빌드 검증을 구현·점검했습니다. 사람은 두 카드를 빚어 발견하는 핵심 경험, 세계관과 명칭, 밸런스 경계, 공개 위험 수용 여부를 결정하고 최종 공개·제출 승인 경계를 관리했습니다. 서버나 런타임 OpenAI API는 사용하지 않습니다.

- exact value: 319 Unicode code points / 642 UTF-8 bytes
- SHA-256: `e0f7af59959d57673fd124994b602d4aa998133f061eebdeda6fff39dae77b56`

## T048 제출 패키지 기록

- 날짜(KST): `2026-08-26`
- 목표: exact T049/T062 production bytes에 결속된 PII-free Track 1 제출 패키지와 16:9 썸네일을 준비합니다.
- Codex 사용: repository-safe 필드의 길이·hash 검증, 기존 production 배경의 결정론적 crop-only 변환, manifest hash DAG와 집중 회귀 테스트를 작성했습니다.
- 구현 결과: title, canonical description, 공개 URL, deployment, production artifact, optional Codex 서술, 빈 demo disposition, 썸네일 provenance를 하나의 detached-hash package에 결속했습니다.
- 해결한 문제: 향후 직접 플레이로 최종 후보를 확정한다는 이전 Codex draft의 가정을 실제 승인 경계 설명으로 교체하고, Edge·Firefox·Safari 미검증 상태를 README에 명시했습니다.
- 사람의 결정: 핵심 경험·세계관·명칭·밸런스 경계, 공개 위험 수용, optional demo timebox defer, 최종 공개·제출 승인은 사람이 관리합니다.
- 증거/커밋: base `fd92ae54cf792e77e03431f743573b1669e674b3`; candidate `f434656cdf3fce0fa35e8598169da6b678cdf627`; deployment `dpl_EASQhMvfgBVw3U2sXSCuPLV5QtrC`; T062 tree `43ee3cbcc3c5b3681890ba3082fb882b1b89dfb564003d1cd23dfb7746df1b0e`.
- 챌린지 기간 신규 작업인가: `예` — 저장소가 입증하는 최초 범위는 commit `3fa3e69597e51c305ecbe24b570fe80a4a465b7f` (`2026-08-10T20:12:57+09:00`)부터입니다. pre-repository 기획 범위와 시점은 이 저장소만으로 입증하지 않습니다.

이 기록은 T050 공개 URL QA, T051 승인, 라이브 폼 입력·전송 또는 제출 완료를 뜻하지 않습니다.
