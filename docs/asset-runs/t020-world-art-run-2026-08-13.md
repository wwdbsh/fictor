# T020 세계 아트 — 실행 기록 (2026-08-13)

Issue #22 / contract sha256 `0612a8cc46a3e9db8b8c8ad82e132c15484d77c18205ff5530507f55a794aea9`.
준비 단계 기록은 `t020-world-art-preparation-2026-08-13.md`에 있다. 이 문서는 **실행 결과**다.

## 1. 결론

세계 아트 **54장 전부 확보**. 배경 18장(16:9) + 적 30장 + 엘리트 6장(3:4)이
`public/assets/{backgrounds,enemies}/`와 `assets/backups/t020-world-art/` 양쪽에 1:1로 존재하고
sha256이 서로 일치한다.

| 항목 | 값 |
|---|---|
| v1 지출 (배치 1, 종횡비 정지) | 9.00 — 확정 손실로 기록 후 v2가 무비용 회수 |
| v2 신규 지출 | **72.00** (정확히 상한) |
| T020 총지출 | **81.00** — 최초 승인 총액과 동일 |
| 순 금전 손실 | **0.00** |
| 잔액 | 363.90 → 354.90 (v1) → 282.90 (v2) |
| 유료 재시도 | 0 |
| 최종 `run_state` | v1 `CLOSED_WITH_LOSSES`, v2 `COMPLETE` (exact closure) |

## 2. v1 사고와 v2 교정

**v1 배치 `world-art-001`(배경 6장, 16:9, 9.00)이 `ASPECT_MISMATCH`로 정지했다.** 제출·완료는
정상이었고 provider가 보고한 model도 6개 모두 `nano_banana_flash`였다(모델 canary 통과).
실패 원인은 전달 화소였다 — 요청은 16:9인데 **1376×768**이 왔고, 정확한 16:9 대비 **7813ppm**으로
v1 허용치 5000ppm을 넘었다. 규율대로 이미지는 한 장도 저장하지 않고 정지했다.

**canary 설계가 값을 했다.** 이 결함이 배치 1(노출 9.00)에서 드러났기 때문에 손실이 9.00에서
멈췄다. 준비 문서에 기각 사유를 적어둔 "적 먼저" 순서였다면 같은 결함이 배치 4에서, 이미
54.00을 쓴 뒤에 나타났을 것이다.

**원인:** provider는 출력 크기를 32픽셀 격자에 맞춘다(1376 = 43×32, 768 = 24×32). 높이 h = 32k인
16:9에서 이상적 너비는 512k/9이고 실제로는 가장 가까운 격자점이 오므로 비율 오차는 **0.25/k**로
제한된다. 3:4의 4445ppm도 같은 현상이며 단지 5000 안쪽이었을 뿐이다. 결함이 아니라 크기 정책이고,
v1의 허용치가 그 정책을 담기에 좁았다.

**v2 교정:** 16:9 허용치를 **12,500ppm**으로 넓히고 3:4는 5,000ppm 유지. 10,000을 택하지 않은
이유는 h=800(k=25)이 정확히 10,000ppm에 떨어져 경계 위에 앉고, k≥22의 이론적 최악값
약 11,364ppm을 덮지도 못하기 때문이다. 12,500은 격자 메커니즘을 여유 있게 덮으면서 실제 비율이
다른 전달은 그대로 거부한다(7:4 15,625 / 4:3 250,000).

**의도한 경계:** provider가 반올림 대신 내림을 택했다면 1344×768이 왔을 것이고 그 값은
15,625ppm으로 진짜 7:4 전달과 화소만으로는 구별되지 않는다. v2는 반올림 양자화는 받고 내림은
거부한다. 정책이 바뀌면 조용히 통과시키지 않고 새 승인을 요구하겠다는 뜻이다.

v1 저널은 한 바이트도 고치지 않았고 바이트 사본을 sha256으로 고정해 v2 포렌식에 실었다.

## 3. v2 배치 원장

무비용 legacy 회수가 모든 유료 배치보다 **먼저** 실행됐다. 비용이 0이면서 동시에 새 허용치가
실제 전달물에서 통하는지 확인하는 검문이었다 — 6장 모두 1376×768 / 7813ppm으로 통과했다.

| 단계 | 자산 | 종횡비 | before | after | delta | job | 회수 |
|---|---|---|---|---|---|---|---|
| legacy 회수 | 6 (배경) | 16:9 | 354.90 | 354.90 | **0.00** | v1 job ID 6개 재조회 | 6 |
| `world-art-v2-001` | 12 (배경) | 16:9 | 354.90 | 336.90 | 18.00 | 12 | 12 |
| `world-art-v2-002` | 12 (적) | 3:4 | 336.90 | 318.90 | 18.00 | 12 | 12 |
| `world-art-v2-003` | 12 (적) | 3:4 | 318.90 | 300.90 | 18.00 | 12 | 12 |
| `world-art-v2-004` | 12 (적/엘리트) | 3:4 | 300.90 | 282.90 | 18.00 | 12 | 12 |
| **합계** | **54** | | **354.90** | **282.90** | **72.00** | 48 유료 + 6 무비용 | **54** |

배치별 delta가 모두 정확히 18.00(12장 × 1.50)이고 `charged_job_count`도 모두 12다.
모델 canary는 모든 배치에서 통과했고 provider 계약 드리프트는 0건이다.

## 4. 무비용 사고 1건: `PRICE_CHANGED` (배치 v2-001 preflight)

- **시각:** 2026-08-13T23:09:30Z, `stage: PER_REQUEST_COST_BINDING`, `item_index: 0`
- **원인:** operator가 cost 파일의 `request_sha256`에 `canonical_request_sha256`(유료 요청 해시)를
  넣었다. 검증기가 요구하는 값은 `get_cost: true`가 붙은 **preflight 요청**의 해시다.
- **비용: 0.00.** 유료 envelope이 나가기 전(`prepare` 이전) 단계라 지출이 없었다.
- **처리:** 규율대로 `resume`(disposition `ZERO_SPEND`) → `reset`(`from_state: FAIL_STOP`,
  `zero_spend: true`) → preflight 재실행. 배치는 PLANNED로 돌아가 처음부터 다시 진행했다.
- **저널 보존:** terminal 기록은 지워지지 않고 그대로 남아 있다. 최종 상태가 COMPLETE라도
  `world-art-v2-001`의 이력에는 `PRICE_CHANGED`가 남는다 — 설계대로다.

이 사고는 "지출 0 배치만 되돌려 재실행할 수 있다"는 불변식이 실제로 작동한 사례다.

## 5. 불변식 준수

| 불변식 | 결과 |
|---|---|
| 배치당 제출 1회, 자동 유료 재시도 0 | ✅ `paid_retry_count: 0`, 재제출 0건 |
| 배치 ≤ 12장 | ✅ 유료 4배치 모두 12장 |
| `use_unlim: false` | ✅ 54개 요청 전부, `canonical_request_sha256`에 고정 |
| 과금은 `credits_exact`만 | ✅ 배치별 delta 18.00 = 12 × 1.50 |
| 상한 준수 | ✅ 72.00 정확 일치, 초과 0 |
| 즉시 저장 + 무클로버 이중 저장 | ✅ 54/54 양쪽 존재, sha256 일치 |
| 종횡비 검증 | ✅ 배경 7813ppm(≤12500), 적/엘리트 4445ppm(≤5000) |
| 모델 canary 전 배치 | ✅ 4/4 통과, 드리프트 0 |
| signed URL/host/raw error 미기록 | ✅ 저널·증거 전수 스캔 결과 0건 |
| v1 저널 불변 | ✅ 바이트 사본 sha256 고정 |

## 6. 최종 감사

```
run_state COMPLETE, exact_closure true
paid_assets_recovered 48 / legacy_assets_recovered 6 / total_assets_delivered 54
assets_not_delivered 0, assets_paid_and_lost 0
cap_used 72.00, closes_at_exact_cap true
v1_sunk_units_now_backed_by_images true
```

독립 검증(저널을 믿지 않고 파일에서 직접 계산): 54/54 존재, public↔backup sha256 불일치 0,
저널 기록 sha와 불일치 0, 허용치 초과 0.

**커버리지:** 6터 × 3깊이 = 배경 18, 6터 × 5형태 = 적 30, 엘리트 6. 누락 조합 없음.
**보스:** 신의 심장 카드 아트를 재사용하므로 별도 세계 아트를 만들지 않았다(수용 기준 2).

## 7. 고정 샘플 육안 QA

`enemy__still__swarm`, `elite__join__still` 두 고정 샘플을 검수했고 스타일·팔레트·실루엣이
승인된 기준에 부합한다. v1 정지 당시 내려받았던 배경 2장도 별도로 확인했고 품질에는 문제가
없었다(정지 사유는 품질이 아니라 화소 비율이었다).

전체 육안 검수는 터별 contact sheet로 한다:
`docs/asset-runs/contact-sheets/t020-world-art-complete.html` — 터마다 배경 3장 + 적 5장을
한 화면에 묶어 "터별 광원·강조색" 감사를 바로 할 수 있게 배치했다(엘리트 6장은 별도 세그먼트).

> **알려진 결함(수정 불가, 기록만):** 실행 중 `audit`이 자동 생성한
> `t020-world-art-v2.html`은 세그먼트 링크가 `t020-world-art-v1/`을 가리켜 깨져 있고, 유료 48장만
> 담고 있다. 원인은 v2 ops의 문자열 상수다. 지금 고치면 구현 바인딩 → plan sha가 바뀌고, 마감된
> v2 저널의 헤더가 그 sha에 묶여 있어 저널을 읽을 수 없게 된다. 따라서 생성물은 그대로 두고
> (재-audit 멱등성 보존) 54장 전체를 담은 올바른 sheet를 위 경로에 따로 만들었다. 다음 버전에서
> 소스를 고칠 것.

## 8. 증거

- 저널(런타임, gitignore): `assets/runs/t020-world-art/operations-v{1,2}.json`
- 저널 포렌식 사본(커밋됨): `assets/evidence/t020-world-art-v1-final-journal-forensic.json`
  (`2f017a34…`), `assets/evidence/t020-world-art-v2-final-journal-forensic.json` (`8cd7e479…`)
- 승인 체인 v1/v2: risk / schema / forensics / binding / pending / presentation / approval
- 배치별 operator 증거: `assets/evidence/t020-world-art-v2-b{1..4}-{costs,preflight-balance,response,balance-after}.json`
- 전 증거 파일 URL 스캔 결과 signed URL·host·raw error 0건
