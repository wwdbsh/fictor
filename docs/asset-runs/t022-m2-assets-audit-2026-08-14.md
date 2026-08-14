# T022 M2 에셋 감사 — 2026-08-14

계약 SHA-256 `1d1d68b20896583bbd88c66c5df3d62971be820d8419ffbd6905e4f38be0185c`. 기록 시각은
`2026-08-14T06:31:20.000Z`이며 이미지 생성·provider/MCP/network 호출과 T022 지출은 모두 0이다.

## 결론과 범위

M2 범위 **621장**을 검증했다. 카드 547장(재료 52 + canonical 489 + 신의 심장 6), 세계 아트
74장(배경 18 + 일반 적 30 + 엘리트 6 + 이벤트 20)이다. `public/assets/`의 PNG 총수는 625이며
나머지 style 후보 4장은 T022 범위 밖이다. 누락·PNG 손상·public↔owner backup 불일치·중복 ID·중복
public 경로·중복 이미지 hash·예상 밖 backup 파일/심볼릭 링크는 각각 0이었다.

소유 라우팅은 T013 52, T015 332, T016 157, T019 6, T020 54, T021 20으로 고정한다. 여섯 owner
backup root의 각 PNG를 public 사본과 SHA-256으로 대조하고, backup bytes를 격리된 임시 디렉터리에
복원해 다시 PNG/비율/hash 검증한 뒤 임시 사본만 제거했다. public 파일에는 쓰지 않았다.

기계 권위는 [`t022-m2-assets-audit-v1.json`](../../assets/manifests/t022-m2-assets-audit-v1.json)이다.
재기록된 전체 파일 SHA-256은 `1456506d259c95f3e68d8383b9fafe2ed026ffa260b9f82fc65960d5395a429b`다.
621개 ordered record는 ID·category·source task·public/backup 경로·SHA-256·bytes·dimensions·aspect를
담고 list hash로 고정한다. 소스 plan/selection과 22개 배치의 tracked operator evidence도 파일 hash로
고정한다.

## 폴백과 재생성 금지

결정론적 런타임 폴백은 **873개**다: 아직 생성되지 않은 canonical 837 + `HEART_FORGE` 36.
T016의 미과금 실패 3개는 목록 안에 `NO_REGENERATION_T022`로 남는다.

- `forge__odd_01__ore_scatter`
- `forge__ore_rot__tool_03`
- `forge__ore_rot__wash_01`

T022는 이 셋을 포함해 어떤 이미지도 재생성하지 않았다. 새 유료 실행은 이 감사의 연장이나 retry가
아니며, 별도 위험 고지·범위·예산·명시 승인이 있어야 한다.

## M2 생성 상한 원장

상한 창은 T015 종료 잔액 **363.90**부터 시작한다. T020 81.00 + T021 30.00 + T019 9.00 +
T016 235.50 = **355.50**, 승인 상한 360.00 이내이며 최종 잔액은 **8.40**이다. 총 22개 배치에
240건을 제출했고, 237건 과금·237건 회수·3건 미과금 실패다. 모든 단가는 `credits_exact=1.50`만
사용했고 `use_unlim=false`, 유료 retry 0이다. 잔액 체인은
`363.90 → 282.90 → 252.90 → 243.90 → 8.40`이다.

원장은 T019·T020 v1/v2·T021의 tracked final redacted journal에서 submission, 최종 poll의 status/model,
recovery SHA, charge/balance를 직접 정규화한다. T016은 ignored raw journal을 커밋하지 않고,
[`t016-canonical-cards-final-forensic-v1.json`](../../assets/evidence/t016-canonical-cards-final-forensic-v1.json)
(SHA-256 `8aaaec756fbe9179f2ee179ad3eac351cf37e115aa0fb1481285dd2e13391532`)에 allowlist 필드만 고정했다.
이 파일은 160개 request index·asset/job binding·최종 status/model·157개 recovery SHA·실패 3개·14개
balance/charge, 각 final poll의 `all_terminal=true`, `completed|failed` 상태 union, `use_unlim=false`, paid retry
0을 재구성하며 URL·host·token·raw provider 값의 민감 패턴
검사를 통과한다. tracked per-batch cost/preflight/response/balance는 `credits_exact`·제출 수·잔액을 독립
교차검증한다. 초기 response의 `pending` 상태나 `failed_count=0`은 최종 상태 증거로 사용하지 않는다.

## 정적 빌드 검증

`npm run build && npm run smoke:static`은 `/fictor-test/assets/...` 아래 621개 URL을 동시성 6으로
실제 GET한다. 각 응답에 HTTP 200과 `image/png`를 요구하고 body를 전량 버퍼링하지 않고 streaming
SHA-256으로 manifest와 대조한다. 수용값은 621/621 일치, 404=0이다.

## 신뢰 경계와 시각 검수

backup의 `VERIFIED_LOCALLY_AT`는 위 고정 시각의 이 워크스테이션 관찰이다. CI의 `check`는 tracked
소스·public bytes·manifest·milestone을 읽기 전용으로 재생성 검증하지만, gitignored backup이 CI에도
존재한다고 주장하지 않으며 `backup_presence_reverified_in_ci=false`를 유지한다. 현재 backup은 같은
장치의 로컬 이중화이므로 디스크 분실에 대비한 off-device copy가 없다는 잔여 위험이 있다.

T022는 byte/inventory 감사이며 새 사람 시각 승인은 아니다. 컨트롤러는 2026-08-14에 다음 고정 표본
8장을 육안 감사했다: `ore_still`, `forge__burn_01__burn_02`, `forge__join_03__rot_01`,
`heart__join`, `background__still__depth_01`, `enemy__still__swarm`, `elite__join__still`,
`event__fictor`. 모두 기대한 판화 매체, 대상 중심 구도와 비율을 유지했고, 읽을 수 있는 글자·워터마크·
명백한 손상은 관찰되지 않았다. 이 확인은 스타일이나 게임 디자인에 대한 새 사람 승인으로 확장되지 않는다.

## 재기준선과 롤백

`record`는 출력이 없으면 만들고 동일 bytes면 성공하지만, 한 byte라도 다른 기존 manifest/milestone은
`REBASELINE_REQUIRED`로 거부한다. 변경이 정당하면 별도 승인된 Task에서 새 verified_at과 전체 재감사로
새 기준선을 만든다. 부분 hash 수정은 재기준선이 아니다. T022 변경 자체의 롤백은 관련 tracked 변경을
`git revert`하고 빌드·smoke를 다시 수행한다. ignored backup은 git으로 복구되지 않으므로 별도 보존 정책이
필요하다.

## 명령

```bash
npx tsx scripts/assets/t022-m2-assets-audit-v1-cli.ts forensic
npx tsx scripts/assets/t022-m2-assets-audit-v1-cli.ts audit
npx tsx scripts/assets/t022-m2-assets-audit-v1-cli.ts record --verified-at 2026-08-14T06:31:20.000Z
npx tsx scripts/assets/t022-m2-assets-audit-v1-cli.ts check
npm run build
npm run smoke:static
```

T015 v1/v3/v4 승인 바인딩은 `package.json` 전체 bytes를 고정한다. 따라서 T022 npm alias를 추가해
그 바이트를 바꾸지 않으며, 위 직접 명령과 `npm test`에 포함된 real-repository T022 check로 CI 경로를
유지한다. T015/T016 binding이나 과거 승인 증거는 재기준선하지 않는다.
