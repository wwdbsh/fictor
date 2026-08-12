# T013 재료 52장 — 로컬 준비 기록

## 현재 상태

| 항목 | 값 |
|---|---|
| Issue 15 contract SHA-256 | `dcb076f1af7ad35029ec7169cc8406e1fbdd868d5fae854da18cfd58c219b947` |
| plan | `assets/manifests/materials-v1.plan.json` |
| plan SHA-256 | `22cc0b976501b6d2f9fc0df5d584e891c214ec0c4da4797ddcbf8b98c86b7611` |
| risk evidence | `assets/evidence/t013-materials-risk-disclosure-v1.json` |
| risk evidence SHA-256 | `5e73e3e1104d0334f7fe79e4c9c612de057fd9de8e94141f5e4257b91e6129c5` |
| disclosure text SHA-256 | `933bc62c074bad6b59d7f27914420a067f9845cac11fb8eb6282aa9d334b36e1` |
| live schema evidence | `assets/evidence/t013-higgsfield-schema-v1.json`, SHA `7a35a1b70db613402a3661cb686a94dc2afd8464220348aadc883ef6a3334850` |
| disclosure presentation | `assets/evidence/t013-materials-disclosure-presentation-v1.json`, SHA `48182ac1c5a0b97f62bb88ee0646637f0ecc7652cca6a83ee1179f6169b15ec4` |
| 승인 | `assets/evidence/t013-materials-approval-v1.json`, SHA `311cd8d36837fff100dd35f2142d02d6830e55619f45af7c7889315b56767c9e` |
| remote generation / job / credit | `52 / 52 / 78.00`, `COMPLETE` |
| actual evidence / contact sheet | `722937487ecf6d4248c1ce6aa0fdec44cd730b3ddfbc4ca3a008762d6812d610` / `2334fac68feefddd2069625aa8e461f9525e3ba5733f34d72b2657f7bd8e0908` |

T011의 승인은 스타일 후보 4장에만 적용되므로 이 52장으로 승계하지 않았다. 로컬 준비 단계에서는 provider
호출, reference 업로드·등록, 이미지 생성, credit 소비를 하지 않았고, 이후 별도의 정확한 T013 승인 evidence를
plan/risk와 결속한 뒤에만 production ops를 열었다. 실행 결과는 52개 job, 52개 local+backup PNG와
`939.90→861.90` balance chain으로 COMPLETE다. 승인 evidence가 없거나 plan/risk와 정확히 결속되지 않으면
production ops는 계속 journal 생성 전에 실패한다.

## wire adapter 인과 교정

교정 전 targeted test 10개는 모두 통과했지만 실제 `jobs_wait`의
`{status:"lookup_failed",retryable:true}`는 shared status allow-list에서 거절됐다. 또한 12개 job topology가
정상인 `generate_image_batch` 응답도 job 하나에 실제 optional `warning`이 있으면 exact-key 검사 때문에
부분/mismatch로 잘못 분류됐다. 정적 검사에서는 actual jobs_wait JSON을 stdin에서 받아 URL을 transient로
처리하고 download→ingest하는 production command가 없었다. 즉 원인은 provider wire schema, redacted durable
journal schema, 수동 파일 운영 seam을 하나의 exact shape와 상태 집합으로 취급한 데 있었다.

1차 교정은 submit/jobs_wait status를 분리하고, job-level optional 신호를 원문 없이 분류하며, actual
jobs_wait JSON을 stdin에서만 받는 bounded handoff를 추가하는 범위로 제한했다. `lookup_failed`의 원인은
`error+retryable` 휴리스틱이 아니라 명시적 status로만 판정한다. `retryable=true`는 기존 job을 유지하고,
false/누락은 각각 non-retryable/ambiguous terminal이다. 그러나 2차 검토의 14/14 baseline은 production
`runT013Ops`가 같은 internal dispatcher의 `jobs --file`·`ingest --input-png` branch에 도달하고, full-52
fixture도 그 수동 seam만으로 COMPLETE가 되는 점을 잡지 못했다. 또한 literal `127.0.0.1`,
`169.254.169.254`, `[::1]`, `[::ffff:127.0.0.1]` URL이 모두 adapter를 통과했고 scheme-only 검사 뒤 global
fetch가 DNS 결과를 고정하지 않았다. 원인은 production/diagnostic control plane 및 recovery provenance가
분리되지 않았고, URL 검증과 실제 socket peer 사이에 DNS address invariant가 없었던 것이다. 비기본 HTTPS
port가 필요하다는 관찰·계약 근거도 없으므로 `443` 외 port는 fail closed한다.

2차 교정 뒤 production surface는 파일 기반 `jobs`·`ingest`를 tracked/auth/journal/input 접근 전에 거부한다.
durable poll에는 `JOBS_HANDOFF_STDIN|DIAGNOSTIC_REDACTED_FILE`, recovery에는 submitted index/job과
`JOBS_HANDOFF_STDIN|DIAGNOSTIC_MANUAL_INPUT`을 기록하며, COMPLETE/evidence는 전부 stdin handoff인 경우만
허용한다. 관찰된 CDN host allow-list가 없으므로 발명하지 않았다. 대신 hostname 문법·기본 port 443과 모든 DNS 응답의
public 여부를 검증하고 한 address를 고정한 `https.request`가 원래 hostname/SNI로 TLS를 검증한다. 실제
socket peer도 고정값과 같아야 하며 최대 3회 redirect의 매 hop을 다시 검증한다. 테스트는 주입 resolver와
pinned transport만 사용해 provider/MCP/network 호출 0을 유지한다. 최종 targeted 19개는 production command
gate, full-52 handoff provenance, literal/alternate numeric IP, private·mixed DNS, rebinding, private redirect,
public IPv4/IPv6 pin과 원래 TLS identity, URL 비유출을 함께 검증한다.

## 승인 전에 그대로 제시할 위험 고지

> 승인 요청 범위는 T013 재료 이미지 정확히 52장뿐이며 초기 유료 상한은 78.00 credits, 자동 유료 재시도 예산은 0입니다. 요청은 nano_banana_2, use_unlim=false, count=1, 3:4, 1k와 revision 1의 로컬 MEDIA_ONLY 참조로 제한되지만 provider가 보고하는 모델 식별자·batch/job 1:1 응답·현재 가격과 balance는 실행 때 달라질 수 있습니다. 각 batch 직전 첫 자산의 실제 generate_image 요청에 get_cost=true를 붙여 대표 가격을 확인하며, prompt는 provider 가격에 영향을 주지 않는다는 현재 계약에 따라 제외하고 나머지 모든 가격 영향 인자가 batch 전체에서 동일함을 검증합니다. get_cost 계약은 job 제출이 아니며 응답에는 job_created 필드가 없고, numeric cost와 balance는 내부에서 정확한 소수 단위로 정규화합니다. generate_image_batch job의 adjustments·error·warning·preset_recommendation은 실제 wire 선택 필드이며, definite job ID는 먼저 안전하게 보존하되 값 원문은 저장하지 않고 adjustments·error·preset_recommendation 또는 안전하다고 입증되지 않은 warning이 하나라도 있으면 실행을 중단합니다. jobs_wait의 lookup_failed는 제출 실패가 아니므로 retryable=true일 때 같은 유료 job ID만 다시 조회하고, false 또는 누락이면 모호하거나 복구 불가능한 조회 실패로 중단하며 새로 제출하지 않습니다. actual jobs_wait JSON은 파일이나 argv가 아니라 production jobs-handoff stdin으로만 받아 메모리에서 검증·삭제하며, jobs --file과 ingest --input-png는 격리된 diagnostic test seam에서만 허용되어 COMPLETE 근거가 될 수 없습니다. 관찰로 확정된 결과 host allow-list가 없으므로 완료 URL은 generic HTTPS hostname의 기본 443 port만 허용하고 모든 DNS 응답이 public address인지 확인한 뒤 하나를 고정해 원래 hostname/SNI의 TLS 검증으로 직접 연결합니다. redirect마다 URL·DNS·고정을 다시 검증하고 실제 remote address가 고정값과 다르면 중단하며, URL은 제한된 임시 PNG 다운로드에만 사용한 뒤 journal·stdout·파일에 남기지 않습니다. 계정 적용 Terms/Privacy, Google supplemental terms와 provider 조건, 학습 사용 및 opt-out, reference 입력 권리, 공개 기본값과 attribution, 정확한 credit 만료 시각·시간대는 이 52장 범위에서 아직 재검증되지 않았습니다. 제출 모호성·부분 batch 응답·job 실패도 credit을 소비할 수 있으며 자동 재제출하지 않습니다. terminal generation failure 재시도는 최대 3회 범위라도 매회 별도의 새 사용자 승인이 필요합니다. 결과 PNG는 provider-native bytes를 crop/resize 없이 최대 5000ppm의 3:4 오차만 허용해 즉시 local 및 별도 backup에 저장하며, 재료 52장 외 core/bulk 생성은 승인 범위가 아닙니다. 승인 의사는 반드시 “위 위험을 확인했고 T013 재료 52장과 초기 78.00 credits 상한, 자동 유료 재시도 0을 승인합니다.”라는 정확한 긍정 문구로만 기록합니다.

위 문구를 실제로 제시한 직후 15분 안에 실제 `disclosed_at`을 먼저 기록한다. 그 뒤 24시간 이내이며
기록 시점 기준 15분 안의 실제 사용자 reply timestamp만 승인 evidence로 받을 수 있다. 미래 시각,
disclosure 이전·동시 시각, backdate, 부정·조건부·모호한 답은 거부한다. 현재 두 명령은 실행하지 않았다.

```bash
npm run assets:materials:v1 -- disclosure-record \
  --disclosed-at '<actual ISO-8601 presentation timestamp>'

npm run assets:materials:v1 -- approval-build \
  --quote '위 위험을 확인했고 T013 재료 52장과 초기 78.00 credits 상한, 자동 유료 재시도 0을 승인합니다.' \
  --approved-at '<actual post-disclosure ISO-8601 reply timestamp>'
```

presentation evidence는 plan/risk SHA와 실제 `disclosed_at`을 결속하고 approval evidence는 그 presentation
SHA까지 결속한다. 또한 정확히 52장, 초기 상한 `78.00`, 자동 retry reserve `0.00`, core/bulk 불허,
T011 승인 비승계를 고정한다. 기존 파일과 bytes가 다르면 덮어쓰지 않는다.

## 고정 plan

- `materials.json`과 immutable core-v1의 첫 MATERIAL 52개 순서·ID·path를 1:1로 사용한다.
- logical batch는 `12, 12, 12, 12, 4`다.
- paid envelope는 live schema와 동일한 `requests[{index,params:{model,prompt,aspect_ratio,resolution,count,
  use_unlim,medias}}]`다. params는 `nano_banana_2`, `3:4`, `1k`, `count=1`, `use_unlim=false`다.
- reference role은 `image`, source job은 `e0f36c95-2e1b-4e38-9931-7e10e562f209`, local reference는
  `fictor-copperplate-media-master` revision 1, source SHA는 `3cadedb...`다. provider media/reference ID는
  발명하지 않는다.
- effective prompt는 core material prompt를 byte 단위로 앞에 보존하고 T012의 정확한
  `reference_instruction` 및 `MEDIA_ONLY` no-copy 경계를 붙인다. 각 asset은 prompt/request SHA를 갖는다.
- unit cost는 정확히 `1.50`, initial cap은 `78.00`, 자동 유료 retry reserve는 `0.00`이다.
- terminal generation failure도 자동 재시도하지 않는다. 최대 3회는 새 retry plan과 해당 실패 범위·추가
  cost를 명시한 별도의 새 사용자 승인마다 한 번만 허용되는 상한이다. 모호하거나 부분적인 제출은 재시도
  대상이 아니다.

## 승인 후 수동 운영 protocol

ops는 MCP를 호출하지 않는다. 각 batch는 먼저 첫 자산의 실제 `generate_image` params에 `get_cost:true`를
추가한 직접 호출 가능 envelope와 fresh balance를 별도 상태로 검증한다. 이 대표 요청은 prompt를 제외한
가격 영향 인자(`model`, `aspect_ratio`, `resolution`, `count`, `use_unlim`, `medias`)가 batch 전체에서
동일할 때만 허용된다. 현재 provider 가격 계약에서 prompt는 가격 독립이므로 대표 요청에서만 확인한다.

```bash
npm run assets:materials:v1:ops -- init

npm run assets:materials:v1:ops -- preflight-request \
  --batch materials-001 --observed-at '<ISO timestamp>'

# stdout request: {"params":{"model":"nano_banana_2",...,"get_cost":true}}
# actual cost file: {"cost":{"credits":1,"credits_exact":1.5}}
# actual balance file: {"credits":945.9}
npm run assets:materials:v1:ops -- preflight-result \
  --batch materials-001 --cost-file '<cost JSON>' --balance-file '<balance JSON>' \
  --provider-observed-at '<ISO timestamp>' --balance-observed-at '<ISO timestamp>'

npm run assets:materials:v1:ops -- prepare \
  --batch materials-001 --observed-at '<ISO timestamp>'
```

`prepare`는 paid envelope만 stdout에 직접 출력하며 호출 전에 durable `SUBMITTING`을 저장한다. preflight가
10분보다 오래됐거나 청구 기준인 `credits_exact`를 정규화한 값이 정확히 `1.50`이 아니면 paid envelope를 열지
않는다. `credits`는 공급자의 표시용 숫자로 원형을 감사 기록하되 청구 단가 판정에는 사용하지 않는다. `get_cost`는 tool contract상 job을 제출하지 않으며 `job_created`라는 값을 provider 응답 필드로
기록하지 않고 `DERIVED_FROM_TOOL_CONTRACT_NO_JOB_SUBMITTED`로만 journal에 남긴다. balance numeric 값도
내부에서 2자리 decimal 단위로 정규화한다.

호출 결과가 모호하면 즉시 다음만 실행하고 같은 batch를 다시 제출하지 않는다.

```bash
npm run assets:materials:v1:ops -- ambiguous \
  --batch materials-001 --reason '<TIMEOUT|TRANSPORT_ERROR|MISSING_DEFINITE_RESULT>' \
  --observed-at '<ISO timestamp>'
```

live generate response의 top-level은 정확히 `submitted_count`, `failed_count`, `jobs`다. 각 job은
`index`, `job_id`, `status`와 실제 선택 필드 `adjustments`, `error`, `warning`,
`preset_recommendation`을 허용한다. 제출 status는
`pending|waiting|queued|in_progress|ip_detect|completed|failed|canceled|nsfw|ip_detected|submission_failed`다.
선택 필드는 메모리에서 JSON 형태와 크기만 검증하고 원문을 journal에 넣지 않는다. definite index/job
topology는 먼저 `submission`에 보존한다. adjustments·error·preset recommendation 또는 안전성이 별도로
입증되지 않은 warning은 safe presence bit만 terminal facts에 남기고 `FAIL_STOP`한다. 현재 benign warning
allow-list는 비어 있다. asset ID, request SHA, reference는 operator 입력이 아니라 plan index에서 파생한다.

```bash
npm run assets:materials:v1:ops -- response \
  --batch materials-001 --file assets/runs/t013-materials/inbox/batch-001-response.json \
  --provider-observed-at '<ISO timestamp>'
```

live `jobs_wait` 응답은 required `all_terminal`, `jobs`, `summary`와 optional `poll_after_seconds`, `timed_out`,
`aborted`를 받는다. 각 job은 required `index`, `job_id`, `status`와 optional `model`, `result_url`,
`thumbnail_url`, `error`, `retryable`, `type`만 허용한다. 대기 status는 제출 status와 별도이며
`pending|waiting|queued|in_progress|ip_detect|completed|failed|canceled|nsfw|ip_detected|lookup_failed`다.
`submission_failed`는 jobs_wait status가 아니다. `lookup_failed`에서 `retryable=true`면 journal은
`SUBMITTED`를 유지하고 기존 `jobs-request`의 같은 index/job ID만 다시 조회한다. `false`는 non-retryable,
누락은 ambiguous로 safe facts를 남겨 `FAIL_STOP`하며 둘 다 재제출하지 않는다. mixed poll에서 이미 완료된
job은 sparse recovery로 즉시 저장하되 batch state는 `SUBMITTED` 그대로라서 미완료 job을 다시 조회할 수
있다. recovery는 배열 위치가 아니라 고유 asset ID와 submitted index/job, 완료를 관찰한 redacted poll에
결속한다. 이후 all-complete poll에서만 `JOBS_VERIFIED→RECOVERING→RECOVERED`로 정리한다.

actual-shaped JSON은 `jobs-handoff`의 stdin으로만 한 번 전달한다. 파일·argv는 거부한다. adapter는 이를
메모리에서 검증해 URL·thumbnail URL·raw error를 제거한 observation만 먼저 durable journal에 기록한다.
관찰된 결과 hostname allow-list는 없으므로 이를 발명하지 않는다. numeric IP, localhost, single-label,
비기본 HTTPS port 또는 잘못된 hostname을 거부하고, 각 hostname을 매번 전부 resolve해 빈 결과·오류·public이 아닌 응답 하나라도
있으면 fail closed한다. 검증된 첫 address만 custom lookup에 고정하고 원래 hostname/Host/SNI 및 TLS 인증서
검증을 유지한 direct `https.request`만 사용한다(proxy 환경 변수는 사용하지 않는다). 응답 socket peer가
고정 address와 다르면 DNS rebinding으로 중단한다. redirect는 최대 3회이며 각 hop에서 URL 문법, 전체 DNS
응답, address pinning을 다시 적용한다. 그 뒤 각 `result_url`을 제출 index/job→plan asset 순서로 내려받으며
timeout, HTTP status, declared/streamed size를 제한하고 `0700` mktemp directory의 `0600` PNG만 사용한다.
기존 atomic ingest가 canonical local+backup에 저장한 즉시 temp를 삭제한다. URL이나 raw provider 문구는
journal, stdout, inbox, temp 잔여 파일 어디에도 남지 않는다. `provider_result_id`나 `completed_at`을 발명하지 않는다.
이번 expected reported identifier는 `nano_banana_flash`지만 공식 alias라고 주장하지 않는다.
failed/canceled/nsfw/ip_detected, non-retryable/ambiguous lookup failure, model drift, identity/status 회귀는
terminal fail-stop이다.

```bash
npm run assets:materials:v1:ops -- jobs-request --batch materials-001

# provider jobs_wait가 반환한 actual JSON byte stream을 파일로 저장하지 않고 그대로 stdin에 연결한다.
<jobs_wait-output-stream> | npm run assets:materials:v1:ops -- jobs-handoff \
  --batch materials-001 --provider-observed-at '<ISO timestamp>'
```

`jobs-handoff`가 성공 asset을 response의 index/job→plan asset 순서대로 즉시 provider-native PNG로
ingest한다. local은 `public/assets/<core path>`, backup은 `assets/backups/t013-materials/<core path>`다.
둘의 SHA/size/dimensions가 같아야 하며 crop/resize는 금지한다. journal은 poll source와 각 recovery의
submitted index/job/source를 결속한다. production CLI는 `jobs --file`과 `ingest --input-png`를 어떤 파일도
읽기 전에 기계적으로 거부한다. 이 두 branch는 격리 root와 주입된 승인 객체를 요구하는 internal test seam에만
남아 있고, 그 provenance로는 `balance-after`·COMPLETE·actual evidence에 진입할 수 없다.

```bash
npm run assets:materials:v1:ops -- balance-after \
  --batch materials-001 --file '<fresh {"credits":number} balance JSON>' \
  --provider-observed-at '<ISO timestamp>'
```

balance 차이는 batch size × `1.50`과 decimal 단위로 정확히 같아야 한다. 앞 batch가 COMPLETE이고 실제
local/backup 파일이 재검증되기 전에는 다음 batch를 열지 않는다.

52개가 모두 COMPLETE인 뒤에만 다음 tracked allow-list 출력이 열린다. 기존 bytes가 다르거나 symlink면
덮어쓰지 않는다.

```bash
npm run assets:materials:v1:ops -- evidence
npm run assets:materials:v1:ops -- contact-sheet
```

출력 경로는 각각 `assets/evidence/t013-materials-actual-run-v1.json`과
`docs/asset-runs/contact-sheets/t013-materials-v1.html`로 고정된다.

## 2026-08-12 실제 실행 결과

상헌 님의 정확한 범위 승인 뒤 `12+12+12+12+4`의 다섯 batch를 실행했다. 모든 요청은
`nano_banana_2`, `use_unlim=false`, `count=1`, `3:4`, `1k`와 승인된 MEDIA_ONLY reference revision 1을
사용했다. 공급자는 각 preflight에서 표시용 `credits:1`과 청구 기준 `credits_exact:1.5`를 반환했다.
runner는 `credits_exact=1.50`을 단가 gate로 사용하고 표시값도 원형대로 journal에 보존했다.

| batch | 수량 | balance 전 | balance 후 | 사용량 | 결과 |
| --- | ---: | ---: | ---: | ---: | --- |
| `materials-001` | 12 | 939.90 | 921.90 | 18.00 | COMPLETE |
| `materials-002` | 12 | 921.90 | 903.90 | 18.00 | COMPLETE |
| `materials-003` | 12 | 903.90 | 885.90 | 18.00 | COMPLETE |
| `materials-004` | 12 | 885.90 | 867.90 | 18.00 | COMPLETE |
| `materials-005` | 4 | 867.90 | 861.90 | 6.00 | COMPLETE |

총 52개 job이 모두 `nano_banana_flash`를 provider-reported model로 보고하고 완료됐다. 이는 관찰된 내부
식별자 기록일 뿐 요청 모델과의 공식 alias 관계를 주장하지 않는다. 생성 실패·부분 응답·유료 재제출은
없었고 자동 유료 재시도 횟수는 0이다. 52개 provider-native PNG는 crop/resize 없이
`public/assets/cards/`와 `assets/backups/t013-materials/cards/`에 즉시 저장됐으며 양쪽 SHA-256, 크기,
dimensions, 3:4 tolerance가 일치한다. canonical journal SHA-256은
`82e4995068c840cafea656f4db2624cc635d7ac645bab03ce8a00bfdf41b5800`, actual evidence SHA-256은
`722937487ecf6d4248c1ce6aa0fdec44cd730b3ddfbc4ca3a008762d6812d610`, 연락표 SHA-256은
`2334fac68feefddd2069625aa8e461f9525e3ba5733f34d72b2657f7bd8e0908`이다.

연락표로 52장을 전수 육안 검수했다. 워터마크·UI·잘린 주 피사체는 보이지 않았고 각 재료·도구의 단일
주제와 실루엣은 식별 가능했다. 다만 `tool_08` 표본 상자 전면에는 판독 가능한 문자형 라벨이 생성되어
`No text` 제약을 위반한다. 또한 선각 위주의 동판화에서 매끈한 채색·입체 표현으로
기운 일부 재료와 배경 명도·종이 질감 편차가 관찰된다. 의도된 `걸어다니는 주전자`, `자기를 재는 자` 외의
사람 중심 장면은 보이지 않았다.

`tool_08` 텍스트 flag와 함께 `odd_01`은 core 자체가 마스터 표본과 같은 “걸어다니는 주전자” 주제를 요구하므로 subject class의 일치는
불가피하지만, 개별 확대 비교 결과 중앙 단독 구도와 몸체 아래 관절 다리의 형태·배치도 마스터를 강하게
이어받았다. 따라서 이 항목에서는 `MEDIA_ONLY`의 구도·형상 비복제 경계가 충분히 지켜졌다고 판정하지
않는다. T013에서는 재생성하지 않고 QA flag로 보존한다. T014는 이 누출과 전체 style drift를 명시적으로
검토해야 하며, 수용하지 않으면 새 prompt/reference revision·새 비용 범위·새 사용자 승인 아래 해당 표본을
재생성해야 한다. 이 기록은 T013 표본 감사이며 스타일 최종 승인이나 bulk 생성 승인이 아니다.
