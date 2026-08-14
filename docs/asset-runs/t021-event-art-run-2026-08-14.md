# T021 이벤트 세계 아트 — 실행 기록 (2026-08-14)

Issue #23 / contract sha256 `9f83f23ac3872814a96819771f9b23a98082899b7488f86c662a388d9f61186f`.

## 1. 결론

이벤트 세계 아트 **20장 전부 확보, 사고 0건.** `public/assets/events/`와
`assets/backups/t021-event-art/` 양쪽에 1:1로 존재하고 sha256이 서로 일치한다.

| 항목 | 값 |
|---|---|
| 지출 | **30.00** (상한 정확 일치) |
| 잔액 | 282.90 → **252.90** |
| 유료 재시도 / 손실 / 재제출 | 0 / 0.00 / 0 |
| fail-stop | **0건** |
| 최종 `run_state` | **COMPLETE** (exact closure) |

T015 이후 처음으로 fail-stop 없이 끝난 유료 실행이다. T020에서 확보한 provider 격자 지식이
사전에 반영돼 종횡비 사고가 재발하지 않았고, cost 파일 규격도 T020 운영 경험대로 준비됐다.

## 2. 범위

6개 이벤트 유형 기본 6장 + 주요 터 변주 14장 = 20장, 전부 3:4.

| 유형 | 총 | 구성 |
|---|---|---|
| cache | 7 | 기본 1 + 6터 |
| oddity | 7 | 기본 1 + 6터 |
| collapse | 3 | 기본 1 + burn, wash |
| workshop / fictor / record | 각 1 | 기본만 |

6유형 전부 최소 하나의 승인 아트로 대표된다(수용 기준 ②). 이벤트 36변주 전체, 이벤트 런타임,
style 재결정, manifest ID 변경은 범위 밖이며 손대지 않았다.

## 3. 배치 원장

| 배치 | 자산 | before | after | delta | job | 회수 | terminal |
|---|---|---|---|---|---|---|---|
| `event-art-001` | 12 | 282.90 | 264.90 | 18.00 | 12 | 12 | 없음 |
| `event-art-002` | 8 | 264.90 | 252.90 | 12.00 | 8 | 8 | 없음 |
| **합계** | **20** | **282.90** | **252.90** | **30.00** | 20 | **20** | **0건** |

delta는 각각 12 × 1.50, 8 × 1.50으로 정확히 일치하고 `charged_job_count`도 12/8이다.
모델 canary는 두 배치 모두 통과했으며 provider 계약 드리프트는 0건이다.

## 4. 누적 예산 (수용 기준 ③)

| 항목 | 값 |
|---|---|
| 실행 전 잔액 | 282.90 |
| T021 지출 | 30.00 |
| 실행 후 잔액 | **252.90** |
| 남은 계획 (T019 9.00 + T016 240.00) | 249.00 |
| **여유** | **3.90 — 공시 시점 그대로 유지** |

손실이 0이었으므로 공시 때 경고한 시나리오(배치 하나 손실 → T016 축소)는 발생하지 않았다.
**남은 계획은 계획대로 수행 가능하다.** 다만 여유가 3.90뿐이라는 사실은 변하지 않으므로,
남은 T019·T016에서는 배치 하나의 손실도 곧바로 T016 범위 축소로 이어진다.

## 5. 불변식 준수

| 불변식 | 결과 |
|---|---|
| 배치당 제출 1회, 자동 유료 재시도 0 | ✅ `paid_retry_count: 0`, 재제출 0 |
| 배치 ≤ 12장 | ✅ 12 / 8 |
| `use_unlim: false` | ✅ 20/20, `canonical_request_sha256`에 고정 |
| 과금은 `credits_exact`만 | ✅ delta 18.00 / 12.00 정확 |
| 상한 준수 | ✅ 30.00 정확 일치 |
| 즉시 저장 + 무클로버 이중 저장 | ✅ 20/20 양쪽 존재, sha256 일치 |
| 종횡비 검증 | ✅ 전부 896×1200 = 4445ppm (허용 5000) |
| 모델 canary 전 배치 | ✅ 2/2 통과 |
| signed URL/host/raw error 미기록 | ✅ 저널·증거 전수 스캔 0건 |

## 6. 최종 감사

```
run_state COMPLETE, exact_closure true
assets_recovered 20 / assets_planned 20
assets_not_delivered 0, assets_paid_and_lost 0
cap_used 30.00, closes_at_exact_cap true
```

독립 검증(저널을 믿지 않고 파일에서 직접 계산): 20/20 존재, public↔backup sha256 불일치 0,
저널 기록 sha와 불일치 0, 허용치 초과 0, 전부 896×1200.

## 7. 고정 샘플 육안 QA

`event__fictor` 검수 통과 — SEQUENCE 3-panel 구성, ACHROMATIC 팔레트, 승인 스타일에 부합.
전체 검수는 contact sheet: `docs/asset-runs/contact-sheets/t021-event-art-v1.html`.

## 8. T020 carry-over 검증 — contact sheet 링크 수정이 실제로 작동했다

T020 v2는 index 링크 템플릿에 다른 버전의 디렉터리를 문자열로 박아 넣어 깨진 링크를 만들었고,
그 소스는 마감된 저널에 sha로 묶여 있어 사후 수정이 불가능했다. T021은 링크와 세그먼트 경로를
같은 상수(`T021_V1_CONTACT_SEGMENT_DIR`)에서 파생하도록 고쳤다.

**이번이 그 수정이 실제 산출물에서 처음 검증된 실행이다.** 생성된 index를 실측한 결과:

- 링크 2개 모두 `t021-event-art-v1/segment-00N.html`로 올바른 디렉터리를 가리키고 **전부 존재**
- 이미지 src 20개, 중복 없이 **20장 전부** 포함 (T020 v2는 유료분만 담아 legacy 6장이 빠졌다)
- index 자체에는 `<img>` 없음(지연 로딩 규율 유지), title `T021 event art`

## 9. 증거

- 저널(런타임, gitignore): `assets/runs/t021-event-art/operations-v1.json`
- 저널 포렌식 사본(커밋됨): `assets/evidence/t021-event-art-v1-final-journal-forensic.json`
  (`a41ca419…`)
- 승인 체인: risk / schema / forensics / binding / pending / presentation / approval
- 배치별 operator 증거: `assets/evidence/t021-event-art-b{1,2}-{costs,preflight-balance,response,balance-after}.json`
- 백업 사본은 저장소 정책(`.gitignore`)에 따라 커밋하지 않는다. git이 durable copy이고
  백업은 로컬 실수에 대비한 이중화다 — T015·T020과 같은 관례.
