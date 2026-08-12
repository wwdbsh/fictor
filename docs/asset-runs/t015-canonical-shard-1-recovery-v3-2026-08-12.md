# T015 CANONICAL shard 1 — bounded recovery v3 (2026-08-12)

## 현재 판정

**HOLD — `authorized=false`. 원격 조회·다운로드·유료 제출을 실행하지 않는다.**

이 변경은 실패한 v1/v2를 덮어쓰지 않는 세 번째 복구 계약이다. v3 production recovery는 아래 새 위험 고지의 실제 제시, 그 이후의 정확 승인, 그리고 runtime binding의 committed-clean 검증이 모두 충족돼야 열린다. v1/v2 승인과 기존 일반 승인은 상속하지 않는다.

## 불변 포렌식

- `operations-v1.json`: `81d7ab7abdadbf86ee420953690550b62621910907fd9bb11cd8ccb19cf0d6f5`
- `operations-v2.json`: `ff85d69888cc023c0cbd7f54e043239fdd47b28a7393870f96e87f58b3663fee`
- v2 plan: `49809ecf7f10fb590014b023b2c9328415fedae36be83bb883a4e3c090d45e4b`
- v1 실패: `PROVIDER_RESPONSE_SIGNAL`
- v2 실패: 첫 asset의 `SECURE_DOWNLOAD_FAILED`; v2 recoveries `0`
- 기존 job ID: 정확히 12개, 새 submit 및 paid retry `0`

v2 실패 원인은 local code와 journal에 비춰 Node TLS socket이 실제 공개 IPv4 peer를 `::ffff:IPv4`로 표현했는데 v2가 이를 resolver의 IPv4와 다른 주소 길이로 판정했을 가능성이 높다는 추론이다. 원격 재검증 결과로 단정하지 않는다.

## v3 변경 계약

- resolver가 반환한 IPv4-mapped IPv6는 계속 거부한다.
- resolver가 고정한 공개 IPv4와 transport `remoteAddress`의 `::ffff:IPv4` tail이 정확히 같은 경우에만 peer 일치를 허용한다.
- `jobs_wait`의 `type=image`를 필수로 한다.
- `retryable`은 `lookup_failed`일 때만 존재해야 하고 boolean이어야 한다. 다른 status에서의 존재 또는 `lookup_failed`에서의 부재는 fail-stop이다.
- 진단 stage는 URL·host·provider raw error를 포함하지 않는 enum만 journal에 기록한다.
- local-only 또는 backup-only의 유효 PNG crash window는 같은 bytes/hash를 반대편에 원자적으로 보충한다. 양쪽 hash가 다르면 fail-stop이다.
- v3 executable에는 `generate_image`, `generate_image_batch` 또는 그 밖의 유료 submit 경로가 없다.
- 기존 12개 무과금 recovery만 구현한다. CANONICAL `12..331`의 320개/추가 `480.00` credits는 계획에 잠겨 있고 future paid implementation은 포함하지 않는다.
- `npm run assets:canonical:shard1:v1:ops`는 기존 승인 바이트의 runtime binding을 깨지 않도록 수정하지 않았다. production 운영 routing에서는 v3 controller만 허용하고, v3 controller의 `v1-paid-tombstone` 도메인은 항상 중단한다.

## 새 승인 범위

- recovery: CANONICAL index `0..11`, 정확히 12개 existing job ID, 유료 submit 없음
- future locked scope: CANONICAL index `12..331`, 정확히 320개, 추가 상한 `480.00`
- 이미 사용 처리: `18.00`; 누적 상한 `498.00`
- 자동 유료 재시도: `0`
- 제외: T016, index 332 이후, materials, hearts, world assets

## 새 위험 고지

고지 본문은 [`t015-canonical-shard-1-risk-disclosure-v3.json`](../../assets/evidence/t015-canonical-shard-1-risk-disclosure-v3.json)의 `disclosure_text_ko`가 canonical 원본이다. pending packet은 아직 실제 대화 제시 증거가 아니며 `authorized=false`다.

정확 승인 문구:

> 위 재복구 위험을 확인했고 T015 기존 12개 job ID의 무과금 v3 복구와 CANONICAL 12..331 정확히 320장의 추가 480.00 credits 상한(이미 사용 처리 18.00, 누적 상한 498.00), 자동 유료 재시도 0을 승인합니다.

## 승인 이후에도 필요한 gate

1. 위 새 위험 고지를 현재 대화에서 실제 제시한다.
2. 그 이후 정확 승인 문구를 controller attestation과 v3 approval evidence로 바인딩한다.
3. v3 implementation binding·plan·runtime files가 커밋돼 있고 HEAD와 clean인지 검증한다.
4. 그 전에는 `migrate`, `jobs-request`, `jobs-handoff` production 명령 모두 fail closed다.
5. 승인 이후에도 오직 기존 12 job의 무과금 recovery만 열린다. future 320 paid submit은 별도 구현 전까지 계속 잠긴다.

## 로컬 검증

- v3 focused: 9/9 통과
- v1/v2/v3 serial regression: 67/67 통과
- production/provider/network/paid call: 0
