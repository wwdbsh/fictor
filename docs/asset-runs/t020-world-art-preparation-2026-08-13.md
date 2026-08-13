# T020 세계 아트 — 유료 실행 준비 기록 (2026-08-13)

Issue #22 / contract sha256 `0612a8cc46a3e9db8b8c8ad82e132c15484d77c18205ff5530507f55a794aea9`.
이 문서는 **준비 단계**만 기록한다. 이 시점까지 provider 호출은 유료·무료 모두 0건이고,
공시·승인 체인은 `pending approval` 상태이며 저널은 아직 생성되지 않았다.

## 1. 범위와 manifest 실측

고정 원본은 `assets/manifests/core-v1.plan.json` (sha256
`54e3af3f68d53b17ba360e92050c361f87cb5bbc676899a0c671a95117fd3c0f`, 재검증 완료).
manifest에서 실제로 관찰된 category 값과 수치는 다음과 같다.

| category | 수량 | aspect_ratio | manifest path 접두사 |
|---|---|---|---|
| `ENEMY` | 30 | `3:4` | `enemies/` |
| `ELITE` | 6 | `3:4` | `enemies/` |
| `BACKGROUND` | 18 | `16:9` | `backgrounds/` |

"적 36장"은 단일 category가 아니라 `ENEMY`(30) + `ELITE`(6)이다. 합계 54장.
범위 밖: `EVENT`(20, T021), `HEART`(6), `HEART_FORGE`(36), `MATERIAL`(52), `CANONICAL`(1326).
보스는 신의 심장 카드 아트를 재사용하므로 별도 세계 아트를 만들지 않는다.

선택은 결정론적이다: `[ENEMY+ELITE (3:4), BACKGROUND (16:9)]` 그룹 순서, 그룹 안에서는
manifest 순서. ID 목록 sha256 `86e01cf9775b46da778a2d7f1d9cb0918c9acbe981ccf54f974a5f2c24447bf9`
(첫 `enemy__still__swarm`, 끝 `background__join__depth_03`)로 고정된다.

### 저장 경로에 대한 결정 (기록해 둘 것)

작업 계약의 `touches`에는 `public/assets/grounds/`가 적혀 있으나 고정 manifest의 `path`
필드는 배경 18장 전부에 대해 `backgrounds/<id>.png`이다. T020 수용 기준이 "manifest와
일치한다"이므로 **manifest의 `path`를 그대로 쓴다**. 결과 경로는
`public/assets/backgrounds/`, `public/assets/enemies/`이고 백업은
`assets/backups/t020-world-art/` 아래 동일한 상대 경로다. `grounds/`로 바꾸려면
고정 manifest와 의도적으로 어긋나는 것이므로 새 공시가 필요하다.

## 2. 파생 plan

- 경로: `assets/manifests/t020-world-art-v1.plan.json`
- **plan sha256: `c334249e3211b847b92b32e6c133f73c345bf3f476951fa5875fa2f07899584f`**
- pending 공시 패킷 sha256: `fa64907c27a852522b48c5d88d7408c0cc1fcedcc979171187d80c9875567e8d`
- 구현 바인딩 sha256: `a09d19193bb0cbcf89b65922343b8070fc83ec005237530a8cda7be3b512bd20` (7개 파일)

파생은 완전 결정론적이다. `Date.now()`/`Math.random()`을 쓰지 않고, plan 바이트 안에
타임스탬프가 존재하지 않는다. 같은 입력이면 항상 같은 sha가 나온다(회귀 테스트로 고정).

## 3. 배치 구성

배치는 **종횡비 동질(aspect-homogeneous)** 이어야 한다. 하나의 배치는 하나의 provider
envelope이고, 저장·검증 경로가 PNG마다 그 자산의 종횡비로 검사하기 때문이다. T015 v4는
`"3:4"`를 소스에 하드코딩했으나 T020은 자산별 종횡비를 plan → 배치 → 요청 → 저장·검증까지
그대로 실어 나른다.

| # | batch_id | group | aspect | size | credits |
|---|---|---|---|---|---|
| 1 | `world-art-001` | ENEMY | 3:4 | 12 | 18.00 |
| 2 | `world-art-002` | ENEMY | 3:4 | 12 | 18.00 |
| 3 | `world-art-003` | ENEMY | 3:4 | 12 | 18.00 |
| 4 | `world-art-004` | BACKGROUND | 16:9 | 12 | 18.00 |
| 5 | `world-art-005` | BACKGROUND | 16:9 | 6 | 9.00 |

`[12,12,12,12,6]`, 합계 54, 각 배치 ≤ 12. 3:4 그룹을 앞에 두어야 승인된 배치 크기 순서를
그대로 지키면서 종횡비 경계를 가로지르는 배치가 생기지 않는다. 배치 1이 모델 canary이고,
canary가 `nano_banana_flash`를 확인하기 전에는 배치 2가 열리지 않는다.

**미검증 위험(공시됨):** 16:9는 이 provider에게 유료·무료 어느 쪽으로도 관찰된 적이 없다.
3:4는 T015에서 실측되었다(896×1200, 오차 약 4445ppm, 허용 5000ppm). 위 순서에서는 16:9
위험이 배치 4에서 드러나며, 그 시점에 이미 최대 54.00 credits가 3:4 배치에 지출된 뒤다.
이 절충은 risk 공시문 (iv)에 명시되어 있다. 16:9를 먼저 소량으로 검증하려면 배치 순서를
`[6,12,12,12,12]`(배경 6장 먼저)로 바꿔야 하며, 이는 plan sha가 바뀌는 변경이다.

## 4. 경제 계약

- 정수 단위 = 크레딧의 1/100
- `UNIT_COST_UNITS = 150` (1.50/장) — provider가 보고하는 **`credits_exact`만** 사용.
  화면 표시값 `credits`(1.00)는 기록만 하고 상한 계산에 절대 쓰지 않는다.
- `TOTAL_CAP_UNITS = 8_100` (81.00) — 하드 상한. legacy 기사용분 없음(clean start).
- 54 × 150 = 8,100 — 계획 지출이 상한과 정확히 일치한다(테스트로 고정).
- 자동 유료 재시도 예산 0. 배치당 최대 노출 18.00, 모호 제출 구간 총 5회.

## 5. T015에서 그대로 가져온 불변식

1. **Node 22 결함 3건 수정**: `execFileSync`에 명시적 `maxBuffer`(64MB),
   `agent:false` + `autoSelectFamily:false` + 배열/레거시 **이중 모드** lookup 콜백,
   `remoteAddress`를 **응답 헤더 수신 시점**에 캡처(소켓 분리 이후에도 pin 비교 가능).
2. **topology 검증**: 완료되지 않은 job의 `model`/`result_url`은 선택적으로 허용하되 타입만
   검증하고, 완료된 job은 둘 다 필수이며, 완료되지 않은 job은 어떤 경우에도 내려받지 않는다.
3. **`retryable`**: `status === "lookup_failed"`일 때만 존재해야 하고 boolean이어야 한다.
   그 밖의 조합은 전부 fail-stop.
4. **과금**: `credits_exact`만. 표시값은 기록 전용.
5. **제출 1회**: 배치당 단 한 번. 모호/부분 제출은 절대 자동 재제출하지 않는다. fail-stop은
   배치 단위. 지출 0 배치만 재실행 가능하고, 지출이 있었던 배치는 정확한 손실 확인 문구가
   있어야만 다음 배치가 열린다.
6. **balance**: 신선도 10분, provider 타임스탬프 순증가 강제, 배치별 사전·사후 기록,
   배치 간 balance 체인 연결 검증.
7. **저널**: 원자적 쓰기 + 락(mkdir 원자성, stale 탈취), 유료 제출 전에 `SUBMITTING`을 먼저
   durable 기록, 종결된 배치 레코드는 변형 금지, 쓰기 전에 읽기 검증기를 먼저 통과시킨다.
8. **무클로버 이중 저장**: 로컬 + 백업, 양측 sha256 동일 검증.
9. **승인 체인**: pending packet → controller 공시 attestation → presentation(바이트 단위
   재파생) → 승인. 승인 문구는 정확히
   `T020 세계 아트 54장 생성을 승인한다. 한도 81.00 크레딧.`
   보조 문구(복구 개시/재개/손실 확인)는 T020 표현으로 별도 정의되어 있고 서로 구별된다.
   승인 창은 공시 후 24시간.
10. **구현 바인딩**: 런타임 파일 7개를 sha256으로 고정. `package.json`은 **바인딩에 없다**.
    실행 진입점은 npm 스크립트가 아니라
    `npx tsx scripts/assets/t020-world-art-production-v1-controller.ts`이다.
    (T015 v4에서 package.json 바이트가 바인딩에 묶여 npm 스크립트 실행이 승인을 무효화한
    함정을 되풀이하지 않기 위해, T020에는 npm 스크립트를 일부러 추가하지 않았다.)
11. **결정론**: plan 파생 단계에 시계·난수 없음. 타임스탬프는 런타임 저널 레코드에만 존재.

T015 v4에 있었으나 T020에서 **제거한** 기계장치: legacy 회수 체인, legacy 기사용 상한,
`excluded_first_id`, 저널 이관(`migrate`) 명령, 상실 지수 재생성(remediation) 배치.
T020은 선행 저널이 없는 clean start이므로 이 경로들은 존재해서는 안 된다.

## 6. 산출물

런타임:
- `scripts/assets/t020-world-art-production-v1.ts` (계약·상수·plan·공시 체인)
- `scripts/assets/t020-world-art-production-v1-ops.ts` (저널·상태기계·다운로드·감사)
- `scripts/assets/t020-world-art-production-v1-cli.ts` (준비 명령)
- `scripts/assets/t020-world-art-production-v1-controller.ts` (진입점)

증거·manifest:
- `assets/manifests/t020-world-art-v1.plan.json`
- `assets/evidence/t020-world-art-{risk-disclosure,higgsfield-schema,forensics,implementation-binding}-v1.json`
- `assets/evidence/t020-world-art-disclosure-presentation-v1.pending.json`

아직 만들어지지 않은 것(승인 시점에 생성): controller 공시/승인 attestation,
presentation, approval, `assets/runs/t020-world-art/operations-v1.json`.

## 7. 검증 결과

```
npx tsx …-controller.ts preparation binding-gen   → 7 files pinned
npx tsx …-controller.ts preparation gen           → plan sha c334249e…
npx tsx …-controller.ts preparation check         → authorized:false
npx tsx …-controller.ts preparation dry-run       → 제출 0, 쓰기 0,
    54 asset id, 배치 [12,12,12,12,6], 상한 8100 units,
    disclosure_chain_status "pending approval"
npm run typecheck / npm run build                 → 통과
npm test                                          → 338 passed (신규 51)
```

## 8. 다음 단계 (아직 하지 않음)

1. provider balance 관찰 → `disclosure-build --disclosed-at … --balance-file …`
2. 사용자에게 risk 공시 제시 → 정확 승인 문구 수신 → `approval-build --approved-at …`
3. 런타임 파일과 plan을 커밋(committed-clean 요구) → `production init` → 배치 1(canary)부터
   순서대로 실행.
