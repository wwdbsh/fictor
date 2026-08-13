# T015 CANONICAL shard 1 — immutable recovery and continuation v2 (2026-08-12)

## 상태

`RECOVERY_IMPLEMENTED / NEW_PAID_HOLD_FOR_FRESH_APPROVAL`.

원격 provider·network·MCP 호출이나 새 유료 제출 없이 준비했다. 기존 v1 코드, implementation binding,
plan, disclosure/presentation, approval, ignored `operations-v1.json`은 byte-for-byte 보존한다. v2는 기존
저널을 수정하지 않고 SHA-256으로 고정한 뒤 별도 `operations-v2.json`으로 정확한 12개 job binding만
이전한다.

v1 저널 SHA-256은
`81d7ab7abdadbf86ee420953690550b62621910907fd9bb11cd8ccb19cf0d6f5`다. 첫 batch는 12개 job이
정확히 한 번 기록됐고, 모두 `completed`, reported model `nano_banana_flash`, download available이었다.
v1의 `PROVIDER_RESPONSE_SIGNAL` 복구 실패 1건, 복구 0건, paid retry 0건과 나머지 27개 `PLANNED`
batch도 그대로 보존한다.

## 인과 진단

v1 `jobs_wait` 파서는 `type`을 허용 필드로 선언했지만 값과 무관하게 필드 존재 자체를
`PROVIDER_RESPONSE_SIGNAL`로 처리했다. 실제 응답은 모든 job에 안전한 metadata `type: "image"`를
포함한다. 기존 poll에서 `error`는 모두 없고 `retryable`은 모두 null이므로 이 false positive가 직접
원인이다.

v2 parser는 각 job에 정확한 `type: "image"`를 요구한다. 다른 값·타입·누락, `error`,
`thumbnail_url`, `warning`, 알 수 없는 optional 필드, completed job의 `retryable`은 다운로드 전에
fail-stop한다. `retryable`은 오직 `lookup_failed`와 boolean 조합에서만 허용한다. URL과 raw provider
error는 transient-only이며 journal/evidence/stdout에 기록하지 않는다.

## 예산과 승인 분리

- legacy recovery: CANONICAL index `0..11`, 기존 12개 job ID만 조회, 새 유료 제출 0
- continuation: CANONICAL index `12..331`, 정확히 320장, `12×26 + 8`, 추가 상한 480.00
- cumulative cap: legacy 18.00 cap-commit + 추가 480.00 = 498.00
- 자동 유료 재시도: 0, paid retry count: 0

첫 12장의 18.00은 정확 단가 1.50에 따라 누적 cap에서 사용 처리한다. 다만 제출 후 provider balance
delta는 아직 관찰하지 않았으므로 `legacy_provider_balance_delta_verified: false`로 명시하며 실제 계정
차감액으로 단정하지 않는다.

과거 T015 v1 approval은 변경된 parser나 나머지 320장에 상속되지 않는다. 현재 v2 plan과 pending
disclosure packet은 `authorized: false`다. 나머지 320장을 위한 paid envelope 생성·제출 명령은 v2에
존재하지 않는다. 실제 대화에 v2 위험 고지를 제시하고 root controller가 새 disclosure attestation과
정확 승인 attestation을 만든 뒤에만 별도 continuation 실행을 열 수 있다.

필요한 새 정확 승인 문구:

> 위 변경된 위험을 확인했고 T015 기존 12개 job ID의 무과금 복구와 CANONICAL 12..331 정확히 320장의 추가 480.00 credits 상한(이미 사용 18.00, 누적 상한 498.00), 자동 유료 재시도 0을 승인합니다.

## recovery-only operator protocol

아래 명령은 코드와 v2 binding/plan/evidence가 commit되어 production clean gate를 통과한 뒤 사용한다.
모든 timestamp는 실제 현재 UTC 시각이어야 한다.

1. 기존 v1 저널과 job 집합을 검증하고 v2 journal을 만든다.

```bash
npx tsx scripts/assets/canonical-shard-1-v1-continuation-v2-controller.ts recovery migrate \
  --observed-at <UTC_TIMESTAMP>
```

2. 정확한 기존 12개 job request를 출력한다. 이 출력만 provider `jobs_wait` 입력으로 사용하며 새
   `generate_image`/`generate_image_batch`를 호출하지 않는다.

```bash
npx tsx scripts/assets/canonical-shard-1-v1-continuation-v2-controller.ts recovery jobs-request
```

3. fresh `jobs_wait` JSON을 파일로 저장하지 않고 stdin으로 직접 넘긴다. v2가 signed URL을 메모리에서만
   처리해 HTTPS DNS pin/TLS peer/redirect/content-type/PNG/3:4 검증 후 public과 backup에 원자 저장한다.

```bash
<fresh-jobs-wait-json-producer> | \
  npx tsx scripts/assets/canonical-shard-1-v1-continuation-v2-controller.ts recovery jobs-handoff \
    --observed-at <UTC_TIMESTAMP>
```

4. 상태를 확인한다.

```bash
npx tsx scripts/assets/canonical-shard-1-v1-continuation-v2-controller.ts recovery status
```

성공 상태는 `HOLD_FOR_FRESH_CONTINUATION_APPROVAL`, `recovered: 12`, `new_paid_locked: true`다.
실패해도 exact 12 job binding과 v1 failure는 유지되며 같은 job만 다시 조회할 수 있다.

## 로컬 검증

```bash
npx tsx scripts/assets/canonical-shard-1-v1-continuation-v2-controller.ts preparation check
npm test -- --run tests/assets/canonical-shard-1-v1.test.ts
npm run typecheck
```

