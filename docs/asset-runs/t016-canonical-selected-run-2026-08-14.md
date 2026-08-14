# T016 canonical 선별 카드 — 유료 실행 기록 (2026-08-14)

Issue #18 / plan sha256 `e3925eb033eb852ac8f1e7f8765991ae749a9c508c8aee48601d58bd4a61044e` /
승인 문구 `T016 canonical 선별 카드 160장 생성을 승인한다. 한도 240.00 크레딧.`
(승인 2026-08-14T02:54:52Z, 만료 2026-08-15T02:41:50Z). 준비 기록은
`t016-canonical-selected-preparation-2026-08-14.md`.

## 결과 요약

| 항목 | 값 |
|---|---|
| 최종 run_state | `CLOSED_WITH_LOSSES` |
| 회수 | **157 / 160** (로컬 `public/assets/cards/` + 백업 `assets/backups/t016-canonical-cards/` 양측 sha256 일치) |
| 지출 (credits_exact) | **235.50** (상한 240.00 이내, 잔액 243.90 → 8.40) |
| 인정 손실 | **0.00** — 실패 3건 전부 provider 미과금 |
| 유료 재시도 | 0 |
| 모델 카나리 | 14/14 배치 전부 `nano_banana_flash` (기대값 일치) |

## 배치별

| 배치 | 회수 | delta | 잔액 후 | 비고 |
|---|---|---|---|---|
| 001 | 12/12 | 18.00 | 225.90 | 카나리 green (이전 세션) |
| 002 | 12/12 | 18.00 | 207.90 | |
| 003 | 11/12 | 16.50 | 191.40 | job 480ab25a `failed`, 미과금, GENERATION_FAILED → 손실 0.00 방면 |
| 004–007 | 각 12/12 | 각 18.00 | 173.40→119.40 | |
| 008 | 10/12 | 15.00 | 104.40 | job 88bbb8dd·94203d0c `failed`, 미과금, 손실 0.00 방면 |
| 009–013 | 각 12/12 | 각 18.00 | 86.40→14.40 | |
| 014 | 4/4 | 6.00 | 8.40 | 마지막 배치 |

## 미생성 3장 (이 승인으로 재생성하지 않음)

`forge__odd_01__ore_scatter`, `forge__ore_rot__tool_03`, `forge__ore_rot__wash_01`
— 전부 provider가 job `failed`를 보고했고 과금하지 않았다. 준비 공시의 규칙("잃은 1.50마다
카드 한 장, 이 승인 아래 재제출 없음")에 따라 세 배치는 acknowledge-loss(0.00) 후 resume으로
방면됐고, 실행은 157장으로 마감된다. 후속 생성은 새 공시·승인이 필요하다.

## 검증

- 감사: `production audit` → 회수 157 재현, per-asset sha256 로컬=백업, 종횡비 3:4 157/157,
  범위 밖 백업 경로 0, 캡 내 지출, contact sheet 14 세그먼트 재생성.
- 실행 후 전체 스위트 재실행: **503/503 통과** (규칙 (b)).
- 고정 샘플 육안 감사: index 12(`forge__join_03__rot_01`), 101(`forge__ore_scatter__scat_01`),
  159(`forge__tool_01__tool_08`) — 동판화 선 처리·단일 중심 피사체·3:4 확인.
- 배치별 증거: `assets/evidence/t016-canonical-cards-b{1..14}-*.json`
  (preflight 잔액, 12/4건 get_cost, 제출 응답, 사후 잔액; 실패 배치는 손실 잔액 관측 포함).
- 저널: `assets/runs/t016-canonical-cards/operations-v1.json` (로컬 전용, 커밋 대상 아님).
