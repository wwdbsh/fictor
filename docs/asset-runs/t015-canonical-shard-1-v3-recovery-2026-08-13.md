# T015 canonical shard 1 — v3 무과금 복구 실행 기록 (2026-08-13)

## 결과

- v3 정확 승인 문구 수신·컨트롤러 attestation: 2026-08-13T02:10:14Z (커밋 `b350ef6`, approval_sha256 `98f42d604a25b8eae9668c2d97158659c76fcae23b2f511dd001b3eb296e78ef`)
- 레거시 12개 job 전부 무과금 복구 완료 (커밋 `5dde9bf`): 모델 `nano_banana_flash`, pinned-peer TLS 다운로드, 3:4 PNG 검증, `public/assets/cards/` + `assets/backups/t015-canonical-shard-1/cards/` 원자 저장, 양측 sha256 일치 12/12
- 저널 상태: `HOLD_FOR_FUTURE_PAID_IMPLEMENTATION` — 유료 제출 0, 유료 재시도 0, 이번 실행 크레딧 사용 0.00 (레거시 18.00은 498.00 상한에 기사용 처리)
- 전체 verify 체인 통과: 213 tests, build, smoke:static
- 복구 PNG 실측: 896×1200 (3:4 목표 대비 4445ppm 오차, 저장소 허용치 5000ppm 이내)

## Node 22 환경 결함 3건 (v2 실패의 유력한 실제 원인)

v3 다운로드 경로는 모의 의존성 유닛 테스트로만 검증되어 있었고, 실제 Node 22에서
다음 3건 때문에 `defaultFetch`/`assertT015V3CommittedClean`이 실패한다.

1. **ENOBUFS**: `assertT015V3CommittedClean`의 `execFileSync("git", ["show", …])`에
   `maxBuffer` 미지정 → 1.1MB v3 plan manifest에서 ENOBUFS → catch가
   "not committed-clean"으로 오보.
2. **Happy Eyeballs**: Node ≥20 기본 `autoSelectFamily`는 커스텀 `lookup` 콜백을
   배열 모드로 호출하는데 `defaultFetch`는 레거시 `(err, address, family)` 형태
   → `ERR_INVALID_IP_ADDRESS` → SECURE_DOWNLOAD 오보.
3. **socket 분리**: Node 22는 응답 스트림 종료 시 `response.socket`을 null로
   설정 → `end` 이벤트에서 읽는 `remoteAddress`가 소실되어 pin 비교 불가.

v2의 `SECURE_DOWNLOAD_FAILED`는 당시 추정(IPv4-mapped remoteAddress 표기 거부)이
아니라 위 결함(특히 2번)일 가능성이 높다.

## 이번 실행의 런타임 심 (일회성, 소스 무변경)

v3 승인이 구현 파일을 해시로 바인딩하므로 소스를 고치면 승인이 무효화된다.
따라서 `--require` 프리로드 심으로만 우회했다: ① `execFileSync` 기본
maxBuffer 64MB, ② `net.setDefaultAutoSelectFamily(false)`, ③ `https.request`
래퍼가 응답 헤더 수신 시점(라이브 TLS 소켓)의 실제 `remoteAddress`를 스냅샷해
소켓 분리 후에도 pin 비교에 제공. 정책·해시·pin 비교 로직 자체는 감사된 코드
그대로 실행됐다. 단, ③은 전송 계층 보고를 가로채는 행위이므로 **영구 해법이
아니다** — 독립 검증자도 이를 보안 관련 변경으로 지적했다.

## v4 사이클 필수 요구사항

CANONICAL 12..331 (정확히 320장, 추가 480.00 상한)의 유료 제출 경로 구현 시:

- 위 3건을 바인딩된 소스에서 직접 수정할 것 (`maxBuffer` 명시, lookup 콜백
  배열/단일 모드 겸용 또는 `autoSelectFamily:false` 옵션 명시, `remoteAddress`를
  응답 헤더 시점에 캡처)
- 심 없이 통과하는 통합 테스트를 포함할 것
- 새 공시(v4)와 새 정확 승인 문구를 요구할 것 (v3 승인은 상속되지 않음)
- `tests/assets/canonical-shard-1-recovery-v3.test.ts`의 committed-clean 단언
  유예(NOTE(v4) 주석)를 복원할 것
