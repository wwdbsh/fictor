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

선택은 결정론적이다: `[BACKGROUND (16:9), ENEMY+ELITE (3:4)]` 그룹 순서, 그룹 안에서는
manifest 순서. ID 목록 sha256 `8ed8dae20fbbc3edaee02163edf435f0829ccf3bb8cf78c99abc095be38b0ab7`
(첫 `background__still__depth_01`, 끝 `elite__join__still`)로 고정된다.

### 저장 경로에 대한 결정 (기록해 둘 것)

**touches 예고와 실제 경로의 차이:** 작업 계약 `tasks.json`의 `touches`에는
`public/assets/grounds/`가 적혀 있으나 실제 산출 경로는 `public/assets/backgrounds/`이다
(`touches`는 착수 전 "건드릴 만한 표면" 예고이지 경로 계약이 아니며, 이 차이는 orchestrator
판정으로 승인되었다).

고정 manifest의 `path` 필드는 배경 18장 전부에 대해 `backgrounds/<id>.png`이다. T020 수용
기준이 "manifest와 일치한다"이므로 **manifest의 `path`를 그대로 쓴다**. 결과 경로는
`public/assets/backgrounds/`, `public/assets/enemies/`이고 백업은
`assets/backups/t020-world-art/` 아래 동일한 상대 경로다. `grounds/`로 바꾸려면
고정 manifest와 의도적으로 어긋나는 것이므로 새 공시가 필요하다.

## 2. 파생 plan

- 경로: `assets/manifests/t020-world-art-v1.plan.json`
- **plan sha256: `6fe3b6f0beebe3d8181b4c52599a32618bf6d6939d1790474e7a5b1ea1a9eccb`**
- pending 공시 패킷 sha256: `ac6246a85849491518200aa3542637f39896afc439ec596cb7d65da055e4d8ac`
- 구현 바인딩 sha256: `be13a88ec079fe43d05cf0543dc158aa5d9db64cb1ab23b3e4b4f1cadfdc32a0` (7개 파일)

파생은 완전 결정론적이다. `Date.now()`/`Math.random()`을 쓰지 않고, plan 바이트 안에
타임스탬프가 존재하지 않는다. 같은 입력이면 항상 같은 sha가 나온다(회귀 테스트로 고정).

## 3. 배치 구성

배치는 **종횡비 동질(aspect-homogeneous)** 이어야 한다. 하나의 배치는 하나의 provider
envelope이고, 저장·검증 경로가 PNG마다 그 자산의 종횡비로 검사하기 때문이다. T015 v4는
`"3:4"`를 소스에 하드코딩했으나 T020은 자산별 종횡비를 plan → 배치 → 요청 → 저장·검증까지
그대로 실어 나른다.

| # | batch_id | group | aspect | size | credits |
|---|---|---|---|---|---|
| 1 | `world-art-001` | BACKGROUND | 16:9 | 6 | 9.00 |
| 2 | `world-art-002` | BACKGROUND | 16:9 | 12 | 18.00 |
| 3 | `world-art-003` | ENEMY | 3:4 | 12 | 18.00 |
| 4 | `world-art-004` | ENEMY | 3:4 | 12 | 18.00 |
| 5 | `world-art-005` | ENEMY | 3:4 | 12 | 18.00 |

`[6,12,12,12,12]`, 합계 54, 각 배치 ≤ 12. 배치 크기는 그룹마다 명시 선언하고 검증한다
(chunking의 부산물이 아니다). 배치 1은 배경 6장이므로 노출이 9.00뿐이고, 모델 canary와
16:9 종횡비 canary를 겸한다.

**왜 16:9를 먼저 두는가.** 16:9는 이 provider에게 유료·무료 어느 쪽으로도 관찰된 적이 없는
유일한 미검증 변수다. 허용치를 벗어난 이미지도 provider는 이미 과금하므로, 이 변수는
plan이 허용하는 최소 노출(9.00)에서 먼저 확인한다.

**기각된 대안 (A): `[12,12,12,12,6]` 적 먼저.** 같은 배치 크기 다중집합을 쓰면서 적(3:4)
36장을 배치 1~3에, 배경(16:9) 18장을 배치 4~5에 두는 안이다. 이 안에서는 canary가 이미
실증된 3:4에서 돌아 모델 변수만 분리된다는 장점이 있으나, 16:9 위험이 배치 4에서, 이미
54.00을 지출한 뒤에야 드러난다. 미검증 변수를 최대 노출 뒤로 미루는 셈이므로 기각했다.
모델 변수 분리는 배치 순서가 아니라 **모든 배치에 적용되는 모델 canary**와 서로 다른 증거를
읽는 두 종료 코드(`MODEL_DRIFT` 대 `ASPECT_MISMATCH`)로 해결했다(아래 참조).

### 종횡비 허용 기준 (지출 전에 명시)

저장 검증은 **비율만** 본다. `inspectPng`가 가로:세로를 자산 선언 종횡비와 비교해
5000ppm을 넘으면 실패시키며, 절대 화소 크기는 요구하지도 단언하지도 않는다.

- 3:4 실측 기준점: T015 회수 PNG 896×1200 (1k), 오차 4445ppm — 허용 5000ppm에 여유가 크지 않다.
- 16:9 가정(미검증): 같은 약 1,075,200화소 예산에서 정확 비율(1344×756, 1408×792, 1280×720)은
  0ppm으로 통과.
- 실패 예: 7:4 (1344×768) = 15625ppm, 4:3 (1024×768) = 250000ppm — 둘 다 허용치 초과.

### 두 canary는 서로 다른 증거를 본다

- **모델 identity**: 모든 배치의 모든 완료 job이 `model === nano_banana_flash`여야 한다.
  배치 1회성이 아니라 **모든 배치**에 적용되고, 다음 배치는 직전 배치가 모델 확인을
  통과해야 열린다. 위반 코드 `MODEL_DRIFT`.
- **종횡비**: 실제 전달된 화소 크기로 판정한다. 위반 코드 `ASPECT_MISMATCH`.

두 검사가 읽는 증거가 다르므로 배치 1이 실패해도 원인을 구분할 수 있다.

**provider 계약 드리프트 = 영구 정지.** `MODEL_DRIFT`와 `ASPECT_MISMATCH`는 "승인한 것과
다른 것을 사고 있다"는 증거이므로, 한 번이라도 관찰되면 이후 모든 배치가 열리지 않는다.
손실 확인·재개 문구로도 열리지 않으며 새 고지와 새 승인이 필요하다. 동시에 두 코드는 손실
코드이기도 하므로 이미 지출된 금액은 저널에 정직하게 기록되고 실행은 CLOSED_WITH_LOSSES로
닫힌다.

### 종료 코드 분류와 방면(discharge) 규칙

독립 적대적 리뷰에서 이 분류가 실행을 막다른 상태로 만들 수 있다는 결함 4건이 드러나
아래와 같이 고쳤다.

- **`RECOVERY_FAILED`는 "polling을 읽지 못했다"만 의미한다.** 그 자체로는 과금을 뜻하지
  않는다. 다만 이 코드가 붙은 배치라도 이미 `prepare`를 지났다면 지출은 실재한다. 즉
  "이 코드는 무과금"이 아니라 "이 관찰 자체가 지출을 증명하지 않는다"가 정확한 서술이다.
  (이전 판의 "무과금·재시도 가능 코드" 서술은 틀렸다.)
- **사실이 관찰을 이긴다.** 확정된 job이 전부 회수되면 `RECOVERY_FAILED`는 비활성이 된다.
  이 규칙이 없으면 일시적 다운로드 실패 한 번으로 54/54를 정확히 81.00에 회수한 실행조차
  영구히 `COMPLETE`에 도달하지 못하고 감사도 마감도 불가능해진다.
- **과금된 뒤 쓸 수 없는 바이트는 별도 코드로 기록한다.** `INVALID_PNG`, `FILE_TOO_LARGE`,
  `EMPTY_FILE`은 `PAYLOAD_UNUSABLE`, 로컬 저장 충돌(`LOCAL_VERIFY_FAILED` 포함)은
  `FILE_CONFLICT`, 종횡비 초과는 `ASPECT_MISMATCH`. ingest 단계에 도달한 실패는 모두 이미
  과금된 job에 관한 것이므로 어느 것도 `RECOVERY_FAILED`로 기록되지 않는다.
- **방면 가능 여부는 코드 이름이 아니라 "유료 envelope이 나갔는가"로 판정한다.**
  `prepare` 이후에 발생한 모든 terminal은 실지출 위에 놓인다. 이름으로 걸러내면
  `FILE_CONFLICT` 같은 코드가 방면도 재개도 불가능한 흡수 상태를 만든다. 저널 검증기도
  같은 규칙을 쓰므로 명령이 쓴 저널을 읽기에서 거부하는 일이 없다.
- 지출이 0인 배치는 방면 대상이 아니라 `reset` 대상이다(무비용 재실행).
- **`COMPLETE`도 코드 이름이 아니라 사실로 판정한다.** 계획된 자산이 전부 양쪽 저장소에 있고
  provider가 정확히 그만큼만 과금했으면 완료다. terminal은 포렌식으로 그대로 남는다.
  "활성 terminal이 없을 것"을 조건으로 두면, 문서화된 선택 키 `warning` 하나로 발생하는
  `PROVIDER_RESPONSE_SIGNAL`처럼 회수에는 아무 지장이 없는 terminal이 완벽한 배치의 완료를
  영구히 막고, 그 뒤 `balance-after`를 기록하면 방면 경로마저 닫혀 실행이 마감 불가능해진다.
- `status`의 `discharge_possible`은 명령이 실제로 쓰는 술어(`t020Dischargeable`)에서 파생한다.
  이전에는 코드 이름 목록을 참조해 방면이 가능한 상황에서도 `NONE`을 보고했고, 그것이
  operator를 정확히 잘못된 명령으로 안내했다.

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
   배치 간 balance 체인 연결 검증. 사전·사후 모두 동일한 2-키 계약(`credits`,
   `provider_observed_at`)을 요구한다. 사후 관측값은 다음 배치의 preflight 기준점이자
   손실 계산의 기준점이므로 날짜 없는 단일 값은 받지 않는다.
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

### 승인 증거의 한계 (고지문 (viii)에 명시)

승인 파일(controller approval attestation, approval evidence)은 agent가 직접 쓸 수 있고 그
안의 "정확한 사용자 발화"는 코드 상수에서 나온다. 따라서 이 파일들의 존재는 사용자 승인의
증거가 아니라 승인이 있었다고 기록되었다는 사실일 뿐이다. **실제 인적 게이트는 절차적이다**
— 사용자가 고지를 본 뒤 세션에서 정확한 문구를 직접 입력해야 하며, 그 사실은 파일이 아니라
대화 기록으로만 확인된다.

### 준비 명령의 안전장치

`gen`과 `binding-gen`은 `assets/runs/t020-world-art/operations-v1.json`이 존재하면 거부한다.
실행 중 plan을 다시 파생하면 `plan_sha256`이 바뀌어 이미 지출이 기록된 저널의 헤더가
고아가 되기 때문이다.

### 러너 락

`jobs-handoff`는 다운로드 전체 구간에서 락을 쥔다. 같은 호스트에서 보유 프로세스가 죽은 것이
확인되고(PID 검사) 생성 후 60초가 지났으면 회수한다. 다른 호스트가 쥔 락은 PID를 신뢰할 수
없으므로 기존의 15분 staleness 창을 그대로 기다린다.

**남은 한계(단일 호스트 가정):** `hostname()`은 네임스페이스 고유 식별자가 아니다. 같은
저장소를 네트워크 파일시스템으로 공유하는 두 컨테이너가 hostname이 같고 PID 네임스페이스가
분리돼 있으면, 서로를 죽은 것으로 판정해 락을 동시에 쥘 수 있다. 60초 유예는 이 창을 좁힐 뿐
없애지 못한다. 두 보유자는 같은 배치에 유료 envelope을 두 번 내보낼 수 있으므로, **이 도구는
단일 호스트에서만 실행한다**는 것이 운영 전제다.

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
npx tsx …-controller.ts preparation gen           → plan sha 6fe3b6f0…
npx tsx …-controller.ts preparation check         → authorized:false
npx tsx …-controller.ts preparation dry-run       → 제출 0, 쓰기 0,
    54 asset id, 배치 [6,12,12,12,12], 상한 8100 units,
    disclosure_chain_status "pending approval"
npm run typecheck / npm run build                 → 통과
npm test                                          → 362 passed (신규 75)
```

## 8. 다음 단계 (아직 하지 않음)

1. provider balance 관찰 → `disclosure-build --disclosed-at … --balance-file …`
2. 사용자에게 risk 공시 제시 → 정확 승인 문구 수신 → `approval-build --approved-at …`
3. 런타임 파일과 plan을 커밋(committed-clean 요구) → `production init` → 배치 1(canary)부터
   순서대로 실행.
