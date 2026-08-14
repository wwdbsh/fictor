# T019 신의 심장 카드 — 유료 실행 준비 기록 (2026-08-14)

Issue #21 / contract sha256 `7c5b1e3d94a2f60c8b3e7d51a9f4c02e6b8d3a175f9e2c48b06d1a73e5c9f284`.
이 문서는 **준비 단계**만 기록한다. provider 호출 0건, 공시·승인 체인은 `pending approval`.

## 1. 범위와 manifest 실측

고정 원본 `assets/manifests/core-v1.plan.json` (sha256 `54e3af3f…3fd0c`, 재검증 완료).

**HEART 6장, 전부 `3:4`, path 접두사 `cards/`, manifest index 1378–1383.**

| id | attribute | composition | density | colors |
|---|---|---|---|---|
| `heart__still` | STILL | CELESTIAL | MAX | GOLD+TEAL |
| `heart__burn` | BURN | CELESTIAL | MAX | GOLD+VERMILION |
| `heart__scatter` | SCATTER | CELESTIAL | MAX | GOLD+SULPHUR |
| `heart__rot` | ROT | CELESTIAL | MAX | GOLD+ACID_GREEN |
| `heart__wash` | WASH | CELESTIAL | MAX | GOLD+ULTRAMARINE |
| `heart__join` | JOIN | CELESTIAL | MAX | GOLD+MAGENTA |

수용 기준이 대조를 요구하는 세 가지(CELESTIAL / MAX / 지정 명명)를 selector가 자산마다
확인하고, `id === heart__<attribute 소문자>` 규칙도 함께 검증한다. 하나라도 어긋나면 크레딧을
쓰기 전에 정지한다. ID 목록 sha256 `e1b132635564a4c930139d09ea0d03e18f39c4f0611c2c450f02e9adcf666885`.

**범위 밖:** 심장 빚기(HEART_FORGE) 36종은 예산 재배분으로 미생성이며 런타임 폴백 대상이다.
이 승인은 그 36장을 만들 권한을 포함하지 않는다. style 재결정과 manifest ID 변경도 범위 밖.

## 2. 이 실행에만 있는 위험 두 가지

**① 배치가 하나뿐이라 모호 제출 구간이 상한 전체를 노출한다.** T021은 30.00 중 18.00이
한 구간의 최대 노출이었지만, T019는 9.00 중 9.00이다. 그 한 번을 잃으면 6장 전부를 잃고
"남은 배치는 계속 진행" 경로 자체가 없다.

**② 이 6장은 보스 아트를 겸한다.** T020 계약에서 보스는 별도 세계 아트를 만들지 않고 신의 심장
카드 아트를 재사용하기로 했다. 따라서 생성에 실패한 속성이 있으면 그 터의 보스 표현도 함께
비게 된다 — 걸린 것은 "카드 6장"보다 넓다.

## 3. 배치·경제

- 단일 배치 `heart-cards-001` (6장), 상한 **9.00** (1.50 × 6), 자동 유료 재시도 0
- 종횡비 허용치는 **3:4 5,000ppm만 선언**하고 미선언 종횡비는 조회 시 예외 — T021 관례
- 누적 예산: 잔액 252.90 → 실행 후 243.90, 남은 계획 T016 240.00, **여유 3.90**.
  이 실행에서 배치를 잃으면 여유가 **−5.10**이 되어 T016 범위를 줄여야 한다.
  (계획의 수치는 as-of이며 승인 시점 관찰 잔액으로 공시 문서가 다시 계산한다.)

## 4. 파생 산출물

- plan `assets/manifests/t019-heart-cards-v1.plan.json`
- 증거 `assets/evidence/t019-heart-cards-{risk-disclosure,higgsfield-schema,forensics,implementation-binding}-v1.json`
- 런타임 `scripts/assets/t019-heart-cards-production-v1{,-ops,-cli,-controller}.ts`
- 실행 진입점은 npm 스크립트가 아니라
  `npx tsx scripts/assets/t019-heart-cards-production-v1-controller.ts`

## 5. 운영 runbook 주의사항

명령 형식과 순서는 T020/T021과 동일하다(`init` → `preflight-request` → `preflight-result` →
`prepare`(첫 지출) → `response` → `recovery-open` → `jobs-handoff` → `balance-after` → `audit`).
배치가 하나이므로 `preflight-request`부터 `balance-after`까지 한 번만 돈다.

**두 주인을 가진 디렉터리 — `public/assets/cards/`.** 이 실행은 다른 Task가 이미 소유한
디렉터리에 쓰는 첫 사례다. T015가 만든 canonical 카드 384장이 같은 폴더에 있고, T019는 거기에
`heart__*.png` 6장을 더한다. 안전한 이유는 관례가 아니라 구조다.

- 이름이 겹치지 않는다(`heart__` 접두사)
- 저장은 무클로버다 — 같은 경로에 내용이 다른 파일이 있으면 덮어쓰지 않고 `FILE_CONFLICT`로
  정지한다. 리뷰어가 `cards/heart__still.png`에 이물 PNG를 심고 실제 유료 경로를 구동해
  확인했다: 정지, 회수 0, 원본 바이트 그대로.
- 백업 루트는 `assets/backups/t019-heart-cards/`로 이 Task 전용이며, 감사 시 계획 밖 경로가
  거기 있으면 실패한다. 리뷰어가 가짜 canonical을 심어도 감사는 그것을 보지 않고 COMPLETE로
  닫혔다.

**앞으로 같은 디렉터리를 쓰는 Task를 만들 때는** 위 세 가지(접두사 분리, 무클로버 저장,
Task 전용 백업 루트)가 모두 성립하는지 확인할 것. 셋 중 하나라도 빠지면 다른 Task의 산출물을
덮어쓸 수 있고, 그 사고는 감사로 잡히지 않는다.
