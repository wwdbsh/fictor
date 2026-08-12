# T014 재료 스타일 승인 결정 — 2026-08-12

## 결정

상헌 님은 T013 재료 52장 전체 연락표와 QA 고지를 받은 뒤 controller 시각
`2026-08-12T01:34:36.573Z`에 정확히 **“승인”**이라고 결정했다. Issue #16 계약 SHA-256은
`aa64fa1b7737c67ce3acca9587668ab996674e80faf27f119bee1d5a4f30da50`이며, canonical 결정은
`assets/manifests/material-style-approval-v1.json` (SHA-256
`72f5e863806cdee5b7638d8bb1cd9f1fab2c20feb6aeae3c53ba7ef6be872c96`)이다.

승인은 T013에서 회수한 **기존 PNG 바이트 정확히 52개에만** 적용된다. manifest는 T013 plan의 index
`0..51` 순서로 각 `index`, `id`, `path`, `image_sha256`, `status: APPROVED`를 기록한다. 집계는
`reviewed=52`, `approved=52`, `pending=0`, `rejected=0`, `replacement_required=0`이다.

## 고정 근거

| 근거 | SHA-256 |
| --- | --- |
| T013 plan | `22cc0b976501b6d2f9fc0df5d584e891c214ec0c4da4797ddcbf8b98c86b7611` |
| T013 actual evidence | `722937487ecf6d4248c1ce6aa0fdec44cd730b3ddfbc4ca3a008762d6812d610` |
| T013 전체 연락표 | `2334fac68feefddd2069625aa8e461f9525e3ba5733f34d72b2657f7bd8e0908` |
| T012 master manifest | `b03c82a3b4ad352de62b8364b158ede047c62c0fd3defea7ad96b83366d15e0d` |

검증기는 네 근거의 파일 바이트를 먼저 고정 SHA와 대조한다. 그 뒤 plan/actual의 52개 순서와 batch별
membership, recovery index·ID·path·`JOBS_HANDOFF_STDIN` provenance, provider-native 상태,
크기·치수·aspect를 검사하고 `public/assets`와 별도 `assets/backups/t013-materials`의 실제 PNG를 같은
SHA로 다시 연다. 누락·중복·순서 변경·미완료·거절 상태, recovery 불일치, 원본/backup byte 변경은 모두
fail-closed다.

## 수용한 QA 플래그

다음 세 항목은 삭제하거나 완화한 것이 아니라 `ACCEPTED_FOR_EXISTING_T013_52_ONLY`로 기록한다.

- `tool_08`: 표본 상자 전면의 판독 가능한 문자형 라벨. T013 `No text` prompt 제약 위반이다.
- `odd_01`: core가 요구한 걸어다니는 주전자 subject 일치 외에도 master의 중앙 단독 구도와 몸체 아래
  관절 다리 형태·배치를 강하게 이어받았다. 해당 자산은 `MEDIA_ONLY` 구도·형상 비복제 경계를 충분히
  지켰다고 판정하지 않는다.
- 전체 경향: 일부 이미지가 선각 위주의 동판화에서 매끈한 채색·입체 표현으로 기울었고, 배경 명도와
  종이 질감 편차가 있다.

이 예외 수용은 향후 생성의 선례가 아니다. 미래의 `NO_TEXT`, `MEDIA_ONLY` 비복제, prompt, style 정책은
모두 그대로 필수이며, replacement 또는 새 bytes에는 새 revision과 별도 승인이 필요하다.

## 다음 단계 경계

이 결정으로 canonical bulk style gate는 `GO`, T015 dependency는 `SATISFIED`다. 그러나 T014 artifact는
provider 호출을 실행하거나 즉시 승인하지 않는다. T015가 실제 실행되려면 별도의 선택된 Task cycle과
동결 run plan, 현재 cost·balance·preflight, 현재 provider schema/model 제약, batch `<=12`,
`use_unlim=false`, 각 결과의 즉시 local 및 별도 backup 회수가 모두 필요하다.

검증 명령:

```bash
npm run assets:material-style:check
```
