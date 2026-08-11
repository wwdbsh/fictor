# 데이터 마일스톤

`m1-phase-0-data.json`은 M1 Phase 0 데이터의 불변 기준선이다. 세 수기 원본, canonical 카드 1,326장, 장비 상세 45장, 닫힌 이름 검수 1,326행과 사람 승인 증거를 byte·content hash로 함께 고정한다. 현재 값은 JSON 한 곳만 기계 권위로 두며 이 문서에는 변경 가능한 hash를 복제하지 않는다.

```bash
npm run milestone:phase0:check
```

검사 명령은 파일을 쓰지 않는다. 코드에 고정된 경로만 읽고 source schema·semantic, 생성기 재현성, catalog 수량과 분기, 이름 검수의 닫힌 상태, CSV의 카드 ID·이름 대응, 모든 기록 hash를 다시 계산한다. 마일스톤 JSON의 경로를 파일 입력으로 사용하지 않으므로 경로 변조나 traversal도 허용하지 않는다.

## Rebaseline

이 기준선은 일반 개발 중 자동 갱신하지 않는다. 승인된 source·생성 규칙·이름 처분이 바뀌면 기존 이름 검수의 archive·rebaseline 절차를 먼저 수행하고, 전체 사람 검수를 다시 닫은 뒤 새 Task와 승인 근거 아래에서 마일스톤의 실제 재계산 값만 갱신한다. 한 hash만 맞추거나 이전 승인 증거를 새 target에 재사용하는 것은 rebaseline이 아니다.
