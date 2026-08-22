# T060 미선택 스타일 후보 release packaging — 2026-08-22

## 판정

`B-05 PASS`다. 저장소의 T011 evidence 원본 4장과 별도 local backup은 그대로 보존하되,
production build는 T022의 게임 에셋 621장과 T012에서 선택한 후보 01 한 장만 입력으로 받는다.
따라서 production PNG inventory는 625장에서 622장으로 줄었고 후보 02–04는 `dist`에 없다.

이 판정은 packaging 경계만 다룬다. 남은 622장 AI PNG의 생성 당시 계정·모델 권리 판정은 T055,
공개 release 승인은 T047 범위이며 둘 다 이 Task로 승인되지 않는다.

## 분류와 구현

| 분류 | 수량 | source | production 처리 |
| --- | ---: | --- | --- |
| 게임 AI PNG | 621 | `assets/manifests/t022-m2-assets-audit-v1.json`의 고정 path·SHA-256 | build allowlist 입력 |
| 선택 스타일 후보 01 | 1 | T012 `master-style-v1`의 고정 path·SHA-256 | build allowlist 입력 |
| 미선택 스타일 후보 02–04 | 3 | `public/assets/style/` 원본 + ignored `assets/backups/t011-style/` backup + T011 provenance | evidence-only, build 입력·`dist` 제외 |

`vite.config.ts`는 개발 서버에서 기존 `public/` 제공을 유지한다. production build에서만
`scripts/assets/release-public-assets.ts`가 고유 임시 staging을 만들고 정확한 622개 allowlist를
검증·복사해 Vite의 `publicDir`로 넘긴다. 후보 02–04는 production 경로에서 존재와 regular-file
타입만 확인하며 bytes를 열거나 hash하거나 staging에 복사하지 않는다.

검사는 새 public 파일, 누락·중복·절대·상위 이동·NUL 경로, symlink·비정규 파일, source/staging/dist
hash drift, destination collision과 예상 밖 PNG를 fail-closed로 거부한다. build 종료 시 `dist`의 PNG
경로와 SHA-256을 allowlist 전체와 다시 대조하고 staging은 성공·실패 모두 정리한다.

## 보존 결속

구현 전후 다음 SHA-256이 동일했다.

| 항목 | SHA-256 |
| --- | --- |
| 후보 01 public / backup | `3cadedb377db1e299bf2ac355404df3c8c092a3d229665c5e519243bbb5efde3` |
| 후보 02 public / backup | `d8cb1bb1e5864eefdf543b8b371b0d8242b1aa8294b53a888ca0d064b668abd1` |
| 후보 03 public / backup | `d04e65e15ab75c94a55b6929e74fe40b17b429ff166584ff2f572d4606b09a8f` |
| 후보 04 public / backup | `071859618b0b8a6630950e920de00bb9e65d8a412eca24378379446388fae0be` |
| T011 operations journal | `52c9543f32b8a831afc81a75725eb4506cfa2e752dc77ef3ba4f5eec2667951b` |
| T011 completion | `147b26caa92f49983ec5475246d363ce4cd611064ff6af55be93cead95630a75` |
| T011 style manifest | `67b84dcab57f5197112fb81c3134afc329f55f0b4580030e6a05c044cfce27bf` |
| T011 actual-run evidence | `1b633074376cdb8d93dfa738a7a0c5c85d05c74b9b184c29fc94331018859058` |
| T011 contact sheet | `5bfb09cbd4684d7833299d19f276fc04bf01322433f798fa78385322d920ee29` |
| T012 master-style manifest | `b03c82a3b4ad352de62b8364b158ede047c62c0fd3defea7ad96b83366d15e0d` |
| T022 M2 audit manifest | `1456506d259c95f3e68d8383b9fafe2ed026ffa260b9f82fc65960d5395a429b` |

후보 02–04의 원본과 backup은 각각 같은 hash다. 과거 journal, completion, manifest, actual evidence,
contact sheet, T012 결정과 T022 point-in-time audit는 수정하지 않았다.

## 검증

| 검사 | 결과 |
| --- | --- |
| `npx vitest run tests/assets/release-public-assets.test.ts --reporter=dot` | PASS, 6/6 |
| `npx tsc --noEmit --pretty false` | PASS |
| `npm run assets:style:v2:evidence-check` | PASS, 후보 4장 provenance 결속 |
| `npm run assets:master-style:check` | PASS, 후보 01 선택 결속 |
| `npx tsx scripts/assets/t022-m2-assets-audit-v1-cli.ts check` | PASS, audited 621 / fallback 873 |
| `npm run build` | PASS, T060 최종 후보에서 정확히 1회 실행 |
| production `dist` exact inventory | PASS, PNG 622 / T022 621 / 후보 01 1 / 후보 02–04 0 / unexpected 0 |
| 금지된 provenance 경로 diff | 0 |

전체 `npm test`와 static smoke는 remediation 최종 후보 T062의 단일 전체 검증에 남겼다. 이번 변경은
정적 asset packaging만 바꾸며 게임 규칙·런타임 경로·에셋 bytes를 바꾸지 않는다.

## 롤백

T060 코드와 이 문서 변경을 revert하면 public evidence bytes에는 영향이 없지만 다음 production build가
다시 후보 02–04를 포함할 수 있으므로 `B-05`는 재개방된다. 롤백 뒤 공개 후보로 취급하려면 T062
재감사와 T047의 별도 승인을 다시 거쳐야 한다.
