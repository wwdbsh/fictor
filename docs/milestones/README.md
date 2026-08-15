# 데이터 마일스톤

`m1-phase-0-data.json`은 M1 Phase 0 데이터의 불변 기준선이다. 세 수기 원본, canonical 카드 1,326장, 장비 상세 45장, 닫힌 이름 검수 1,326행과 사람 승인 증거를 byte·content hash로 함께 고정한다. 현재 값은 JSON 한 곳만 기계 권위로 두며 이 문서에는 변경 가능한 hash를 복제하지 않는다.

```bash
npm run milestone:phase0:check
```

검사 명령은 파일을 쓰지 않는다. 코드에 고정된 경로만 읽고 source schema·semantic, 생성기 재현성, catalog 수량과 분기, 이름 검수의 닫힌 상태, CSV의 카드 ID·이름 대응, 모든 기록 hash를 다시 계산한다. 마일스톤 JSON의 경로를 파일 입력으로 사용하지 않으므로 경로 변조나 traversal도 허용하지 않는다.

## Rebaseline

이 기준선은 일반 개발 중 자동 갱신하지 않는다. 승인된 source·생성 규칙·이름 처분이 바뀌면 기존 이름 검수의 archive·rebaseline 절차를 먼저 수행하고, 전체 사람 검수를 다시 닫은 뒤 새 Task와 승인 근거 아래에서 마일스톤의 실제 재계산 값만 갱신한다. 한 hash만 맞추거나 이전 승인 증거를 새 target에 재사용하는 것은 rebaseline이 아니다.

## M2 Phase 0.5 에셋

`m2-assets.json`은 T022가 검증한 에셋 621장과 결정론적 폴백 873개의 얇은 마일스톤이다. 전체
per-asset record와 22-batch 원장을 복제하지 않고 `assets/manifests/t022-m2-assets-audit-v1.json`의
전체 파일 SHA-256, 동결 계약 hash, 고정 검증 시각, 수량과 신뢰 경계만 고정한다.

```bash
npx tsx scripts/assets/t022-m2-assets-audit-v1-cli.ts check
```

검사는 tracked source와 public PNG 621장의 구조·비율·SHA-256, ordered list hash, 원장 evidence hash,
manifest와 milestone을 읽기 전용으로 재계산한다. T016 최종 결과는 raw ignored journal이 아니라
tracked allowlist forensic evidence를 사용하므로 CI에서도 실패 ID·model·recovery SHA·balance·retry와
`use_unlim`을 검증할 수 있다. CI는 로컬의 gitignored owner backup 여섯 곳이
존재한다고 주장하지 않으므로 `backup_presence_reverified_in_ci=false`다. backup까지 다시 확인하려면
기록 워크스테이션에서 `npx tsx scripts/assets/t022-m2-assets-audit-v1-cli.ts audit`을 실행한다.

M2 재기준선도 자동 갱신하지 않는다. 승인된 범위·바이트·소유 라우팅이 변하면 별도 Task에서 전체
621쌍과 폴백·원장을 다시 감사하고 새 기준선을 승인받는다. 기존 JSON hash만 손으로 맞추지 않는다.

## M3 수직 슬라이스 후보 — 두 커밋 신뢰 경계

T031은 코드와 증거를 한 커밋에서 자기 참조로 고정하지 않는다. 먼저 **candidate Commit A**에 게임 코드와
검증 도구만 둔다. 깨끗한 checkout에서 install/data/T022/test/typecheck/build/smoke를 순서대로 실행하고,
실제 Chromium 수동 완주 영상과 체크리스트를 만든 다음에만 record를 실행한다. `dist/`는 계속 ignored이며
manifest에는 그 시점의 파일별 SHA-256과 결정론적 tree SHA-256만 남긴다.

```bash
npx tsx scripts/t031-m3-candidate-audit-cli.ts audit
npx tsx scripts/t031-m3-candidate-audit-cli.ts record \
  --commands docs/milestones/evidence/t031/commands.json \
  --known-issues docs/milestones/evidence/t031/known-issues.json \
  --manual-evidence docs/milestones/evidence/t031/manual-evidence.json
```

record는 실제 영상 파일, 아홉 명령의 exit 0 로그(`gen:data` 실행과 generated diff 0, freshness 포함),
별도 필수 T022 check, 다섯 수동 항목의 `PASS`가 없으면
실패한다. 기존 record와 같은 바이트는 성공하고 다른 바이트는 `REBASELINE_REQUIRED`로 중단한다. 템플릿은
[`templates/`](templates/)에 있으며 `PENDING`과 placeholder를 포함하므로 그 자체로 record할 수 없다.
각 명령의 시작 시각은 직전 명령 종료 시각 이후여야 하며, 전체 증거 완료 시각은 마지막 smoke 종료 이후여야
한다. 이 순서가 역행하거나 겹치면 record는 fail-closed로 거부한다.
두 출력은 모두 사전 no-clobber 검사 후 `wx`로 설치한다. 두 번째 target의 동시 생성·충돌로 실패하면 이
호출이 같은 바이트로 새로 만든 첫 번째 파일만 제거하고, 경쟁자가 만든 바이트는 보존한다.
수동 입력은 Browser·OS·viewport·reduced-motion 환경과 녹화 시간·도구·연속성·실제 실행 주체를 기록한다.
Codex가 Browser와 녹화를 조작했다면 `CODEX`로 쓰며 사람 수행으로 표현하지 않는다.

생성된 manifest·milestone·입력 로그·실제 영상만 **evidence Commit B**에 추가한다. B는 A의 직접 자식이어야
하며 후보 런타임 변경을 함께 넣지 않는다. B checkout에서 동일한 `dist/`를 재현한 뒤 다음 읽기 전용 검사를
실행한다.

```bash
npx tsx scripts/t031-m3-candidate-audit-cli.ts check
```

모든 필수 입력을 통과해 생성되는 M3 status는 `VERIFIED`지만 공개 배포·제출은 별도이므로
`release_or_submission_performed:false`를 함께 고정한다. 이 절과 템플릿 자체는 마일스톤 달성 주장이
아니다. 실제 수동 영상과 immutable B가 생기기 전에는 M3 완료,
공개 배포 또는 제출 완료로 표현하지 않는다.
