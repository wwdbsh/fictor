# T015 CANONICAL shard 1 — local preparation (2026-08-12)

## 현재 상태

`HOLD_FOR_EXACT_SCOPED_USER_APPROVAL`. 이 준비 작업은 provider/network/GitHub/credit 호출을 하지 않았다.
controller가 고정한 실제 disclosure event의 attestation과 그로부터 결정론적으로 만든 presentation은 존재한다.
미래의 정확한 답변 뒤 root controller가 만드는 `t015-controller-approval-attestation-v1.json`, approval
evidence, operations journal, actual-run evidence, backup, contact index는 아직 없다.

고정 범위는 `core.assets.filter(category==='CANONICAL').slice(0,332)`뿐이다. 첫 ID는
`forge__burn_01__burn_02`, 마지막 ID는 `forge__join_02__wash_01`이고 333번째
`forge__join_02__wash_02`는 제외된다. newline ID SHA-256은
`e499a0209d26ed966bc8c39eb74d02c84b41eeb1262991a4c812232cdb18d257`이다.

## 승인 전 gate

`assets/evidence/t015-controller-disclosure-attestation-v1.json`은 전체 위험 고지가
`2026-08-12T03:01:17.021Z`에 현재 대화에서 제시되었음을 control-plane main session이 증명한다.
presentation CLI는 임의 시각을 받지 않고 이 고정 event만 사용한다. 그 뒤 상헌 님이 다음 문구를 정확히
보내야 한다.

> 위 위험을 확인했고 T015 CANONICAL 0..331 정확히 332장과 초기 498.00 credits 상한, 자동 유료 재시도 0을 승인합니다.

과거의 일반적 승인 문구, T011/T013/T014 승인, 부분 인용은 T015 승인이 아니다. 승인 evidence는 제시보다
엄격히 뒤여야 한다. CLI는 quote나 시각을 인자로 받지 않으며, root controller가 실제 답변 뒤 만든 canonical
approval attestation에서만 plan/presentation/risk/schema/implementation-binding SHA와 범위·상한·재시도 0을
읽는다. 이 attestation이 없거나 affirmative flag가 아니면 approval을 만들 수 없고 production `init`도
journal을 만들지 않는다.

implementation binding은 T015 controller entry, builder, ops, preparation CLI, filesystem과 그 local type
closure, `package.json`, `package-lock.json`의 정확한 bytes를 묶는다. production은 이 전체 repo runtime
입력과 T015 evidence/plan 입력의 dirty·untracked 상태도 거부한다.

## 승인 뒤 operator protocol

각 12장 이하 batch는 `preflight-request` → batch의 모든 12/8개 요청별 fresh nonpaid get_cost 및 fresh balance → `preflight-result` →
`prepare` 순서다. `prepare`가 `SUBMITTING`을 durable journal에 먼저 쓴 뒤 반환하는 envelope를 한 번만
제출한다. 모호·부분 응답은 유료 재제출하지 않는다. 첫 batch의 reported model은
`nano_banana_flash` canary이며 drift면 batch 2가 열리지 않는다.

각 cost 항목은 정확히 `index`, get-cost request의 `request_sha256`, `cost`, 고유하고 단조 증가하는
`provider_observed_at`을 가지며 10분 freshness와 실제 시각을 통과해야 한다. provider의 실제 응답인 표시값
`credits: 1`과 청구 정확값 `credits_exact: 1.5`를 각각 `1.00`/`1.50`으로 그대로 보존하고, billing·cap은
오직 정확값 1.50을 사용한다. balance 관찰도 마지막 cost보다 엄격히 뒤이고 같은 freshness window 안이어야 한다.

제출 response가 exact indexed job 1:1로 확정된 뒤 다음 문구로 recovery-only gate를 연다.

> T015 기존 job ID만 복구하고 새 유료 제출은 하지 않습니다.

`jobs-request`의 동일 job ID만 poll하며 actual jobs_wait JSON은 `jobs-handoff` stdin으로만 전달한다.
signed URL/raw error는 durable artifact에 남지 않는다. HTTPS public DNS pin, redirect 재검증, TLS peer,
PNG type/size/3:4 검증 뒤 provider-native bytes를 `public/assets`와
`assets/backups/t015-canonical-shard-1`에 no-clobber로 저장한다.
jobs_wait summary는 실제 provider schema `{active, completed, errors, failed, total}`만 허용하며 각 job status에서
정확히 재계산한다. `lookup_failed`는 `errors`, 생성 실패·취소·NSFW·IP 감지는 `failed`, 비종결 상태는
`active`에만 집계한다.
부분 제출의 원래 terminal과 모든 확정 job binding은 복구 중 timeout/model drift/download/PNG 실패가 나도
덮어쓰지 않는다. 완전 제출에서 같은 복구 실패가 나도 새 submission terminal이나 모순된 `FAIL_STOP`
transition을 만들지 않는다. 두 경우 모두 복구 실패는 별도 `recovery_failures`에 no-resubmit/retry 0으로
남고 batch는 recovery-only 상태를 유지하므로 reload 후에도 동일 job ID만 다시 조회할 수 있다.

완료는 332 request/job/recovery binding, local=backup SHA, 총 498.00 credit delta, paid retry 0,
333번째 이후 부재를 audit한 뒤 actual evidence와 28개 lazy contact segment/index를 만든 상태다.

준비 검증:

```bash
npm run assets:canonical:shard1:v1:check
```
