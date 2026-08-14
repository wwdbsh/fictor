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
