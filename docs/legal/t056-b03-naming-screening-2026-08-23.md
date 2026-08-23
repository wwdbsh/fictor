# T056 B-03 공개 명칭 확대 스크리닝

> 조사 기준일: 2026-08-23 KST, 일부 공식 detail 재확인은 2026-08-24 00:08 KST까지 이어졌습니다.  
> Task: T056 / Issue #106 / contract `20fe6da858187585380296c0de4d32d1d4173913f930c67753829da0535c0458`

## 1. 범위와 해석 한계

이 문서는 `FICTOR`·`픽토르`, 세 종족의 영문·한국어 명칭, 여섯 옛 신의 영문·한국어 명칭 총 20개를 공식 상표 원장과 공식 게임·앱 스토어에서 스크리닝한 dated source register다. 법률 의견, 상표 clearance, 등록 가능성 또는 혼동 가능성 판단이 아니다. 검색 결과가 없거나 목록에서 보이지 않았다는 사실은 사용 부재나 사용 가능성을 뜻하지 않는다.

상태는 다음처럼 분리한다.

- `ACTIVE_REGISTRATION`: 공식 원장에서 등록 상태가 현재 표시된 기록
- `PENDING_APPLICATION`: 공식 원장에서 출원·심사대기 상태가 표시된 기록
- `DEAD_RECORD`: 포기·거절·소멸·취소 등 비활성 상태가 표시된 기록
- `STORE_LISTING_OBSERVED`: 공식 스토어에서 현재 보인 listing. 상표 상태가 아니다.
- `LIMITED` / `UNAVAILABLE`: 이유·영향·T057 후속 선택을 함께 기록한 조사 한계

WIPO 국제등록은 미국·한국의 국가별 효력을 뜻하지 않는다. 미국 관련 후보는 USPTO, 한국 관련 후보는 KIPRIS 상태를 별도로 확인해야 한다. 개인 주소·대리인·연락처는 수집하지 않았다.

## 2. 분류와 동결 검색 규칙

[WIPO Nice Classification 13th Edition, Version 2026](https://nclpub.wipo.int/esen/pdf-download.pdf?dateInForce=20260101&lang=en&tab=class_headings) 기준으로 전 류·live/dead broad pass를 먼저 보고, 게임·앱에 가까운 IC009(소프트웨어·다운로드 매체), IC028(게임·완구), IC041(오락·게임 서비스), IC042(소프트웨어 설계·서비스)에 초점을 뒀다. 다른 류의 exact 후보도 버리지 않고 `LOWER_RELEVANCE`로 남겼다.

결과를 보기 전에 다음 literal variant를 고정했다. `E`는 exact/full phrase, `S`는 spacing·hyphen·article removal/core·one-edit, `P`는 문서화한 음성 근사 literal이다. 원장이 별도 phonetic mode를 제공하지 않으면 `P` literal을 일반 wordmark 검색에 넣도록 했으나, 실제 실행이 완료되지 않은 원장은 해당 행을 `LIMITED`로 표시한다.

| ID | exact string | E / S / P literal set |
|---|---|---|
| N01 | `FICTOR` | E `FICTOR`; S `FICTER`, `FICTORUM`; P `FIKTOR` |
| N02 | `픽토르` | E `픽토르`; S `픽 토르`; P `PIKTOR`, `PICTOR` |
| N03 | `Stillkin` | E `Stillkin`; S `Still Kin`, `Still-Kin`, `Stilkin`; P `Steelkin` |
| N04 | `어름붙이` | E `어름붙이`; S `어름 붙이`; P `eoreumbuti`, `eoreum buti` |
| N05 | `Burnkin` | E `Burnkin`; S `Burn Kin`, `Burn-Kin`; P `Burnken` |
| N06 | `사름붙이` | E `사름붙이`; S `사름 붙이`; P `sareumbuti` |
| N07 | `Joinkin` | E `Joinkin`; S `Join Kin`, `Join-Kin`; P `Joynkin` |
| N08 | `이음붙이` | E `이음붙이`; S `이음 붙이`; P `ieumbuti` |
| N09 | `The Stilling` | E `The Stilling`; S `Stilling`, `The Stillin`; P `Stilin` |
| N10 | `어름` | E `어름`; S `어 름`; P `얼음`, `eoreum` |
| N11 | `The Burning` | E `The Burning`; S `Burning`, `Burnning`; P `Berning` |
| N12 | `사름` | E `사름`; S `사 름`; P `살음`, `sareum` |
| N13 | `The Scattering` | E `The Scattering`; S `Scattering`, `Scaterin`; P `Skattering` |
| N14 | `흩음` | E `흩음`; S `흩 음`; P `heuteum` |
| N15 | `The Rotting` | E `The Rotting`; S `Rotting`, `Roting`; P `Rotin` |
| N16 | `삭음` | E `삭음`; S `삭 음`; P `사금`, `sageum` |
| N17 | `The Washing` | E `The Washing`; S `Washing`; P `Woshing` |
| N18 | `씻음` | E `씻음`; S `씻 음`; P `씨슴`, `ssiseum` |
| N19 | `The Joining` | E `The Joining`; S `Joining`; P `Joyning` |
| N20 | `이음` | E `이음`; S `이 음`; P `ieum` |

이 표의 `S`·`P`는 검색 재현용 literal일 뿐 법적 유사성 분석이 아니다.

## 3. 20개 대상 coverage matrix

각 셀은 아래 source register의 evidence ID를 가리킨다. `LIMITED`도 이유와 영향이 등록된 coverage다.

| ID | exact string | exact marks | similar literal marks | phonetic literal marks | game/app use |
|---|---|---|---|---|---|
| N01 | `FICTOR` | `US-01`, `KR-01`, `WO-01` | `US-02`, `ST-01`, `AP-01`, `GP-01` | `US-02`, `ST-01`, `AP-01`, `GP-01` | `SD-01`, `GD-01`, `GD-02` |
| N02 | `픽토르` | `KR-02`, `US-02`, `WO-01` | `KR-12`, `ST-02`, `AP-02`, `GP-02` | `KR-12`, `ST-02`, `AP-02`, `GP-02` | `AD-01` |
| N03 | `Stillkin` | `KR-13`, `US-02`, `WO-01` | `KR-12`, `ST-03`, `AP-03`, `GP-03` | `KR-12`, `ST-03`, `AP-03`, `GP-03` | `ST-03`, `AP-03`, `GP-03` |
| N04 | `어름붙이` | `KR-03`, `US-02`, `WO-01` | `KR-12`, `ST-04`, `AP-04`, `GP-04` | `KR-12`, `ST-04`, `AP-04`, `GP-04` | `ST-04`, `AP-04`, `GP-04` |
| N05 | `Burnkin` | `KR-13`, `US-02`, `WO-01` | `KR-12`, `ST-05`, `AP-05`, `GP-05` | `KR-12`, `ST-05`, `AP-05`, `GP-05` | `ST-05`, `AP-05`, `GP-05` |
| N06 | `사름붙이` | `KR-04`, `US-02`, `WO-01` | `KR-12`, `ST-06`, `AP-06`, `GP-06` | `KR-12`, `ST-06`, `AP-06`, `GP-06` | `ST-06`, `AP-06`, `GP-06` |
| N07 | `Joinkin` | `KR-13`, `US-02`, `WO-01` | `KR-12`, `ST-07`, `AP-07`, `GP-07` | `KR-12`, `ST-07`, `AP-07`, `GP-07` | `ST-07`, `AP-07`, `GP-07` |
| N08 | `이음붙이` | `KR-05`, `US-02`, `WO-01` | `KR-12`, `ST-08`, `AP-08`, `GP-08` | `KR-12`, `ST-08`, `AP-08`, `GP-08` | `ST-08`, `AP-08`, `GP-08` |
| N09 | `The Stilling` | `KR-13`, `US-02`, `WO-01` | `KR-12`, `ST-09`, `AP-09`, `GP-09` | `KR-12`, `ST-09`, `AP-09`, `GP-09` | `ST-09`, `AP-09`, `GP-09` |
| N10 | `어름` | `KR-06`, `US-02`, `WO-01` | `KR-12`, `ST-10`, `AP-10`, `GP-10` | `KR-12`, `ST-10`, `AP-10`, `GP-10` | `ST-10`, `AP-10`, `GP-10` |
| N11 | `The Burning` | `KR-13`, `US-02`, `WO-01` | `KR-12`, `ST-11`, `AP-11`, `GP-11` | `KR-12`, `ST-11`, `AP-11`, `GP-11` | `SD-02`, `SD-03`, `AD-02` |
| N12 | `사름` | `KR-07`, `US-02`, `WO-01` | `KR-12`, `ST-12`, `AP-12`, `GP-12` | `KR-12`, `ST-12`, `AP-12`, `GP-12` | `ST-12`, `AP-12`, `GP-12` |
| N13 | `The Scattering` | `KR-13`, `US-02`, `WO-01` | `KR-12`, `ST-13`, `AP-13`, `GP-13` | `KR-12`, `ST-13`, `AP-13`, `GP-13` | `ST-13`, `AP-13`, `GP-13` |
| N14 | `흩음` | `KR-08`, `US-02`, `WO-01` | `KR-12`, `ST-14`, `AP-14`, `GP-14` | `KR-12`, `ST-14`, `AP-14`, `GP-14` | `ST-14`, `AP-14`, `GP-14` |
| N15 | `The Rotting` | `KR-13`, `US-02`, `WO-01` | `KR-12`, `ST-15`, `AP-15`, `GP-15` | `KR-12`, `ST-15`, `AP-15`, `GP-15` | `SD-04`, `SD-05` |
| N16 | `삭음` | `KR-09`, `US-02`, `WO-01` | `KR-12`, `ST-16`, `AP-16`, `GP-16` | `KR-12`, `ST-16`, `AP-16`, `GP-16` | `ST-16`, `AP-16`, `GP-16` |
| N17 | `The Washing` | `KR-13`, `US-02`, `WO-01` | `KR-12`, `ST-17`, `AP-17`, `GP-17` | `KR-12`, `ST-17`, `AP-17`, `GP-17` | `SD-06`, `AP-17`, `GP-17` |
| N18 | `씻음` | `KR-10`, `US-02`, `WO-01` | `KR-12`, `ST-18`, `AP-18`, `GP-18` | `KR-12`, `ST-18`, `AP-18`, `GP-18` | `ST-18`, `AP-18`, `GP-18` |
| N19 | `The Joining` | `KR-13`, `US-02`, `WO-01` | `KR-12`, `ST-19`, `AP-19`, `GP-19` | `KR-12`, `ST-19`, `AP-19`, `GP-19` | `ST-19`, `AP-19`, `GP-19` |
| N20 | `이음` | `KR-11`, `US-02`, `WO-01` | `KR-12`, `ST-20`, `AP-20`, `GP-20` | `KR-12`, `ST-20`, `AP-20`, `GP-20` | `AD-03`, `ST-20`, `GP-20` |

## 4. 공식 상표 원장 query ledger

### 4.1 USPTO

공식 [Trademark Search](https://tmsearch.uspto.gov/search/search-results), refinement `Wordmark`, Live와 Dead 모두, class 전체를 사용했다. 결과 URL은 session-bound라 query·filter·count를 이 문서에 전사하고, 후보에는 stable serial의 [TSDR](https://tsdr.uspto.gov/) URL을 붙였다.

| evidence | target/source/mode | literal query·jurisdiction·class·status | accessed | result / stable ID | limitation·impact·follow-up |
|---|---|---|---|---|---|
| `US-01` | N01 / USPTO / exact broad | `FICTOR`; US; all classes; Live+Dead | 2026-08-23 23:30–23:59 KST / 14:30–14:59Z | 3, 모두 `ACTIVE_REGISTRATION`: `79167034` IC009, `98723270` IC028, `97196195` IC020 | T046와 재현됨. IC020도 lower-relevance로 보존 |
| `US-02` | N01–N20 / USPTO / exact·similar·phonetic literals | §2의 E/S/P; US; all classes first, intended focus 009/028/041/042; Live+Dead | 같은 창 | 첫 20-target broad run과 quoted exact run이 각각 60s/30s local automation timeout으로 종료돼 per-query 결과가 원자적으로 반환되지 않음. 마지막 화면은 unquoted `The Washing`이 1,642,917 broad token results를 보였으나 exact count로 쓰지 않음 | `LIMITED`: CAPTCHA가 아니라 client timeout. 두 번 같은 실패 뒤 blind retry 중단. N02–N20의 USPTO exact/similar/phonetic 결과는 미확정이며 T057이 `RETAIN…`을 고를 때 수동 USPTO E/S/P 재실행 또는 전문가 검토를 선택해야 함 |

USPTO는 이 UI에서 독립 phonetic 결과 집합을 제공하지 않았다. 따라서 phonetic literal을 별도 Wordmark query로 실행하려 했으나 `US-02`처럼 완료되지 않았다. 이를 “유사 없음”으로 해석하지 않는다.

### 4.2 KIPRIS

공식 [KIPRIS 상표 검색](https://www.kipris.or.kr/khome/search/searchResult.do)의 국내상표, all classes/all statuses를 사용했다. generic 결과 URL은 session-bound다. `TNM=[…]` expression과 표시 건수를 전사하고 application number(`AN`)·registration number가 있는 후보는 stable identifier로 남겼다. 관찰 창은 2026-08-23 23:56–2026-08-24 00:08 KST / 2026-08-23 14:56–15:08Z다.

| evidence | target/source/mode | literal query·class·status | displayed result / observation | limitation·impact·follow-up |
|---|---|---|---|---|
| `KR-01` | N01 / KIPRIS / exact broad | quick `FICTOR`, then `TNM=[FICTOR]`; all classes/status | quick 4; exact 1: registration `1251481`, `ACTIVE_REGISTRATION`, IC09, DWS SRL | T046 quick count와 exact active candidate 모두 재현 |
| `KR-02` | N02 / KIPRIS / exact broad | `TNM=[픽토르]`; all classes/status | 2: AN `4020090063472` IC25 포기, `4020090063471` IC16 소멸, 둘 다 `픽토르 (PIKTOR)` / `DEAD_RECORD` | dead는 사용 가능성 보증이 아님 |
| `KR-03` | N04 / KIPRIS / exact broad | `TNM=[어름붙이]`; all/all | 0 | absence inference 금지 |
| `KR-04` | N06 / KIPRIS / exact broad | `TNM=[사름붙이]`; all/all | 0 | absence inference 금지 |
| `KR-05` | N08 / KIPRIS / exact broad | `TNM=[이음붙이]`; all/all | 0 | absence inference 금지 |
| `KR-06` | N10 / KIPRIS / exact broad | `TNM=[어름]`; all/all | 1: AN `4020250155982`, `ACTIVE_REGISTRATION`, IC43 | lower-relevance candidate detail `KC-06` |
| `KR-07` | N12 / KIPRIS / exact broad | `TNM=[사름]`; all/all | 3: AN `4020110051356` IC31 포기, `4020110051353` IC29 포기, `4020110051355` IC30 포기 / `DEAD_RECORD` | lower-relevance dead records 보존 |
| `KR-08` | N14 / KIPRIS / exact broad | `TNM=[흩음]`; all/all | 0 | absence inference 금지 |
| `KR-09` | N16 / KIPRIS / exact broad | `TNM=[삭음]`; all/all | 0 | absence inference 금지 |
| `KR-10` | N18 / KIPRIS / exact broad | `TNM=[씻음]`; all/all | 2: AN `4020260029221` IC03, `4020260029222` IC35, 둘 다 `PENDING_APPLICATION` | lower-relevance candidate details `KC-10A/B` |
| `KR-11` | N20 / KIPRIS / exact broad+focus | `TNM=[이음]` all/all; focus `TNM=[이음]*TC=[09+28+41+42]` | `이음` broad 58, focus display 13. 관련 active detail 3건은 `KC-11A/B/C` | focus 결과에 IC35/37도 섞여 strict filter로 신뢰하지 않음 |
| `KR-12` | N01–N20 / KIPRIS / similar·phonetic literal | §2 S/P variants; all/all then focus intended | per-variant 실행을 완료하지 않음 | `LIMITED`: exact Korean batch와 detail 검증을 우선했고 session-bound UI에서 variant grid를 완료하지 못함. T057 유지 선택 전 수동 literal 재실행 선택 필요 |
| `KR-13` | N03/N05/N07/N09/N11/N13/N15/N17/N19 / KIPRIS / English exact current reproduction | T046 exact race names and noisy god-phrase broad searches; all/all | 이번 관찰 창에서 재실행하지 않음 | `LIMITED_NOT_REPRODUCED`: 세 영문 종족의 T046 exact 0과 여섯 phrase의 noisy count를 현재 exact 결과로 재사용하지 않음. T057 유지 선택 전 current exact E와 focus query 필요 |

`The Stilling` 등 여섯 영문 phrase의 T046 noisy broad counts는 exact/similar 결과가 아니므로 이번 register가 숫자를 승계하지 않는다. 한국어 종족·옛 신 9개는 T046에서 미검색이었고 `KR-03`–`KR-11`이 그 공백을 일부 해소했다.

### 4.3 WIPO Global Brand Database

| evidence | target/source/mode | query·jurisdiction·class·status | accessed / observation | limitation·impact·follow-up |
|---|---|---|---|---|
| `WO-01` | N01–N20 / WIPO GBD / E/S/P | §2 literal set; international; all classes/status then 009/028/041/042 intended | 2026-08-23 약 23:35 KST / 14:35Z. [Global Brand Database](https://branddb.wipo.int/en/quicksearch)는 ALTCHA challenge만 반환 | `UNAVAILABLE`: CAPTCHA를 풀거나 우회하지 않음. 국제등록 후보 coverage가 비어 있어 잔여 위험이 커진다. T057 유지 선택 전 사람이 정상 UI에서 재실행하거나 전문 검색을 선택할 수 있으며, 발견 후보도 USPTO/KIPRIS로 국가 상태를 다시 확인해야 함 |

## 5. 공식 게임·앱 스토어 query ledger

세 스토어의 결과 수는 서로 같은 뜻이 아니다. Steam은 official search endpoint의 `total_count`, Apple은 official iTunes Search API의 `resultCount`, Google Play는 검색 HTML에 표시된 unique app ID 수다. 모두 relevance-ranked current observation이며 exact-title count나 전체 사용 수가 아니다.

공통 URL 형식:

- Steam US/en: `https://store.steampowered.com/search/?term=<literal>` 및 official results endpoint, accessed 2026-08-23 23:45–23:59 KST (14:45–14:59Z)
- Apple US/en, KR/ko: `https://itunes.apple.com/search?term=<literal>&entity=software&country=<us|kr>&limit=25`, accessed 2026-08-24 00:00–00:03 KST (2026-08-23 15:00–15:03Z); candidate는 direct `apps.apple.com` ID 재확인
- Google Play US/en: `https://play.google.com/store/search?q=<literal>&c=apps&hl=en_US&gl=US`, accessed 2026-08-24 00:08–00:10 KST (2026-08-23 15:08–15:10Z); candidate는 direct package ID 재확인

| IDs | target | Steam exact result | Apple US (`KR` if different) | Google Play displayed IDs | variant pass / visibility limitation |
|---|---|---|---|---|---|
| `ST-01` `AP-01` `GP-01` | N01 `FICTOR` | 0; variants `FICTER` 0, `FIKTOR` 0, `FICTORUM` 4 | 22, top results not standalone exact | 30 | Steam `FICTORUM` yielded `Fictorum` `503620`; Google direct `GD-01/02` observed |
| `ST-02` `AP-02` `GP-02` | N02 `픽토르` | 0; `픽 토르` 0, `PIKTOR` 0, `PICTOR` 8 noisy | 1/1: `픽토르뒤 성` `404718923` | 9 | contains-string app `AD-01`; standalone exact not observed in returned set |
| `ST-03` `AP-03` `GP-03` | N03 `Stillkin` | 0; `Still Kin` 28 noisy, `Still-Kin`/`Stilkin`/`Steelkin` 0 | 2, no standalone exact | 50 | relevance noise; absence inference 금지 |
| `ST-04` `AP-04` `GP-04` | N04 `어름붙이` | 0; all frozen variants 0 | 0 | 11 | Google recommendations not exact-title count |
| `ST-05` `AP-05` `GP-05` | N05 `Burnkin` | 0; `Burn Kin` 14 noisy, other variants 0 | 13, no standalone exact | 14 | relevance noise |
| `ST-06` `AP-06` `GP-06` | N06 `사름붙이` | 0; all frozen variants 0 | 0 | 11 | same |
| `ST-07` `AP-07` `GP-07` | N07 `Joinkin` | 0; `Join Kin` 44 noisy, `Join-Kin` 2 unrelated, `Joynkin` 0 | 1 unrelated | 3 | same |
| `ST-08` `AP-08` `GP-08` | N08 `이음붙이` | 0 | 0 | 9 | Steam variant request then response ceased being JSON; retry하지 않아 S/P `LIMITED` |
| `ST-09` `AP-09` `GP-09` | N09 `The Stilling` | 2,069 relevance results; no standalone exact in sampled top | 22 | 30 | common phrase broad noise; S/P pass `LIMITED` |
| `ST-10` `AP-10` `GP-10` | N10 `어름` | 0 | 0 | 30 | Korean exact not observed; S/P `LIMITED` |
| `ST-11` `AP-11` `GP-11` | N11 `The Burning` | 779; `The Burning Owl` `4417100`, `The Burning Descent` `1198440` | 21; `1944 Burning Bridges` `1038913047` | 30 | shared core listing details `SD-02/03`, `AD-02`; not legal similarity finding |
| `ST-12` `AP-12` `GP-12` | N12 `사름` | 0 | 0 | 50 | S/P `LIMITED` |
| `ST-13` `AP-13` `GP-13` | N13 `The Scattering` | 838; sampled top contains shared `Scatter` forms | 24 | 30 | no standalone exact in sampled top; S/P `LIMITED` |
| `ST-14` `AP-14` `GP-14` | N14 `흩음` | 0 | 0 | 12 | S/P `LIMITED` |
| `ST-15` `AP-15` `GP-15` | N15 `The Rotting` | 140; `The Rotting Chronicles` `3351220`, `The Rotting Man` `3807320` | 10 | 30 | details `SD-04/05` |
| `ST-16` `AP-16` `GP-16` | N16 `삭음` | 0 | 1 unrelated | 50 | S/P `LIMITED` |
| `ST-17` `AP-17` `GP-17` | N17 `The Washing` | 134; `The Joy of Hand Washing` `3933400` | 25 | 30 | shared core only; details `SD-06` |
| `ST-18` `AP-18` `GP-18` | N18 `씻음` | 0 | 1 unrelated | 12 | S/P `LIMITED` |
| `ST-19` `AP-19` `GP-19` | N19 `The Joining` | 2,558 noisy | 16 | 30 | no standalone exact in sampled top; S/P `LIMITED` |
| `ST-20` `AP-20` `GP-20` | N20 `이음` | 0 | 24 US / 22 KR; common Korean service names | 30 | `인천e음` detail `AD-03`; S/P `LIMITED` |

## 6. 후보 detail register

### 6.1 공식 상표 후보

| ID | mark / owner | state / class / goods summary | official stable record | relevance tag |
|---|---|---|---|---|
| `UC-01` | `FICTOR` / DWS SRL | `ACTIVE_REGISTRATION`; US serial `79167034`; IC009, 3D object design computer software | [USPTO TSDR 79167034](https://tsdr.uspto.gov/#caseNumber=79167034&caseSearchType=US_APPLICATION&caseType=DEFAULT&searchType=statusSearch) | `GAME_APP_ADJACENT_SOFTWARE`; T046 confirmed |
| `UC-02` | `FICTOR` / He, Aijuan | `ACTIVE_REGISTRATION`; serial `98723270`; IC028, boxing bags/gloves/rings/focus mitts | [USPTO TSDR 98723270](https://tsdr.uspto.gov/#caseNumber=98723270&caseSearchType=US_APPLICATION&caseType=DEFAULT&searchType=statusSearch) | `BROAD_CLASS_028_LOWER_RELEVANCE`; T046 confirmed |
| `UC-03` | `FICTOR` / He, Aijuan | `ACTIVE_REGISTRATION`; serial `97196195`; IC020, furniture/cots/cushions/coat racks etc. | [USPTO TSDR 97196195](https://tsdr.uspto.gov/#caseNumber=97196195&caseSearchType=US_APPLICATION&caseType=DEFAULT&searchType=statusSearch) | `OTHER_CLASS_LOWER_RELEVANCE`; T046 confirmed |
| `KC-01` | `FICTOR` / DWS SRL | `ACTIVE_REGISTRATION`; KR registration `1251481`; IC09, 3D object design computer software and electronic controllers for machines creating 3D objects; not identified as game software | [KIPRIS result entry](https://www.kipris.or.kr/khome/search/searchResult.do) | `GAME_APP_ADJACENT_SOFTWARE`; likely related international mark, but counted as KR record not extra global conflict |
| `KC-06` | `어름` / 임나현 | `ACTIVE_REGISTRATION`; AN `4020250155982`, reg `4024709250000` (2025-12-10); IC43 restaurant/café/bakery/tea-house/takeout | [KIPRIS result entry](https://www.kipris.or.kr/khome/search/searchResult.do) | `OTHER_CLASS_LOWER_RELEVANCE` |
| `KC-10A` | `씻음` / applicant 이기쁨 | `PENDING_APPLICATION`; AN `4020260029221` (2026-02-10); IC03 cosmetics/personal care | [KIPRIS result entry](https://www.kipris.or.kr/khome/search/searchResult.do) | `OTHER_CLASS_LOWER_RELEVANCE` |
| `KC-10B` | `씻음` / applicant 이기쁨 | `PENDING_APPLICATION`; AN `4020260029222` (2026-02-10); IC35 cosmetics retail/online intermediation/advertising | [KIPRIS result entry](https://www.kipris.or.kr/khome/search/searchResult.do) | `OTHER_CLASS_LOWER_RELEVANCE` |
| `KC-11A` | `이음` / (주)코아테크코리아 | `ACTIVE_REGISTRATION`; AN `4020220226362`, reg `4022756320000` (2024-11-13); IC09 laboratory/scientific equipment, not game/software goods | [KIPRIS result entry](https://www.kipris.or.kr/khome/search/searchResult.do) | `SAME_CLASS_DIFFERENT_GOODS_OBSERVED` |
| `KC-11B` | `이음 (IEUM)` / 김윤선 | `ACTIVE_REGISTRATION`; AN `4020200033728`, reg `4017228530000` (2021-05-03); IC42 logo/building/space design and environmental research | [KIPRIS result entry](https://www.kipris.or.kr/khome/search/searchResult.do) | `SAME_CLASS_DIFFERENT_SERVICES_OBSERVED` |
| `KC-11C` | `이음 (ium)` / 김영식 | `ACTIVE_REGISTRATION`; AN `4020170121653`, reg `4013804860000` (2018-07-23); IC28 rubber/metal/wood/plastic toys, dolls, blocks, toy vehicles/instruments | [KIPRIS result entry](https://www.kipris.or.kr/khome/search/searchResult.do) | `ADJACENT_CLASS_028_TOYS` |

KIPRIS `픽토르` IC25 포기·IC16 소멸, `사름` IC29/30/31 포기, `이음` focus의 거절·포기·소멸 records도 `DEAD_RECORD`로 보존하지만 위 active/pending 후보보다 상세 전사 우선순위를 낮췄다. dead status를 사용 가능성 근거로 쓰지 않는다.

### 6.2 공식 스토어 listing 후보

| ID | title / developer·publisher | stable app ID / direct URL | country·language·access / visibility |
|---|---|---|---|
| `SD-01` | `Fictorum` / Scraping Bottom Games | Steam `503620`, [listing](https://store.steampowered.com/app/503620/Fictorum/) | US/en, 2026-08-23; `STORE_LISTING_OBSERVED`, released game |
| `SD-02` | `The Burning Owl` / Bhartiya Core | Steam `4417100`, [listing](https://store.steampowered.com/app/4417100/) | US/en, 2026-08-23; coming soon |
| `SD-03` | `The Burning Descent` / RyseUp Studios; Mumocap | Steam `1198440`, [listing](https://store.steampowered.com/app/1198440/) | US/en, 2026-08-23; released game |
| `SD-04` | `The Rotting Chronicles` / Bad Rhino Studios | Steam `3351220`, [listing](https://store.steampowered.com/app/3351220/) | US/en, 2026-08-23; coming soon |
| `SD-05` | `The Rotting Man` / RAYBIS GAMES | Steam `3807320`, [listing](https://store.steampowered.com/app/3807320/) | US/en, 2026-08-23; released game |
| `SD-06` | `The Joy of Hand Washing` / Lord Soul Studios | Steam `3933400`, [listing](https://store.steampowered.com/app/3933400/) | US/en, 2026-08-23; released game |
| `AD-01` | `픽토르뒤 성` / Communication Books, Inc. | Apple `404718923`, [listing](https://apps.apple.com/us/app/id404718923) | US/en와 KR/ko에서 2026-08-24 관찰; Book category |
| `AD-02` | `1944 Burning Bridges` / HandyGames | Apple `1038913047`, [listing](https://apps.apple.com/us/app/id1038913047) | US/en, 2026-08-24; Games |
| `AD-03` | `인천e음` / KONA I CO., LTD | Apple `1383589803`, [listing](https://apps.apple.com/kr/app/id1383589803) | KR/ko, 2026-08-24; Finance |
| `GD-01` | `FictorPay App` / FictorPay | Google package `com.fictorpay.production`, [listing](https://play.google.com/store/apps/details?id=com.fictorpay.production&hl=en) | US/en direct page visible 2026-08-24; finance app |
| `GD-02` | `Cartão Fictor Bank` / RC Card Soluções em Pagamentos | Google package `com.algorix.fictorbank`, [listing](https://play.google.com/store/apps/details?id=com.algorix.fictorbank&hl=en) | US/en direct page visible 2026-08-24; finance app |

이 표는 current storefront observation이며 common-law use, 출시 지역 전체, 삭제된 listing, 웹 게임, 콘솔·모바일의 다른 스토어를 포괄하지 않는다.

## 7. T046 delta

`docs/legal/t046-release-audit-2026-08-22.md`는 수정하지 않았다.

| T046 fact | T056 disposition |
|---|---|
| USPTO exact `FICTOR` 3 live registrations, IC009/020/028 | `CONFIRMED` by `US-01`, `UC-01/02/03` |
| KIPRIS quick `FICTOR` 4, exact registration `1251481` IC09 DWS SRL | `CONFIRMED` by `KR-01`, `KC-01` |
| KIPRIS `픽토르` IC25 abandoned, IC16 expired | `CONFIRMED` by `KR-02`; still `DEAD_RECORD` |
| KIPRIS exact `Stillkin`/`Burnkin`/`Joinkin` 0 | `NOT_REPRODUCED_CURRENT`: historic fact preserved in `KR-13`, no new 0 asserted |
| six English god phrases noisy partial broad counts | `SUPERSEDED_AS_DECISION_EVIDENCE`: counts were not exact or class-focused; current official store observations retained, trademark E/S/P remains `US-02`/`KR-12` limited |
| Korean race/god names not searched | `CLOSED_IN_PART`: ten Korean targets exact broad pass in `KR-02`–`KR-11`; S/P remains `KR-12` limited |

## 8. 잔여 위험과 T057 경계

- `FICTOR`는 미국·한국 IC009 active exact 기록이 fresh reproduction되었고, IC028 active exact 기록과 여러 `Fictor…` 앱·게임 listing도 관찰됐다. 이것은 법적 결론이 아니라 T057에서 잔여 위험을 명시적으로 다뤄야 할 사실이다.
- `이음`은 한국 all-class 58건, focus 화면 13건과 IC009/028/042 active exact records가 있다. 지정상품은 확인한 세 건 모두 FICTOR 게임과 동일하다고 전사하지 않았지만, class label만으로 후보를 제거하지 않는다.
- `어름` active IC43, `씻음` pending IC03/35 같은 lower-relevance exact 기록도 보존했다.
- 여섯 영문 옛 신 명칭은 일반 영어 phrase라 상표·스토어 broad 검색이 noisy하다. `The Burning…`, `The Rotting…` 등 실제 게임 listing이 보였으나 법적 유사성 판단은 하지 않았다.
- USPTO N02–N20, KIPRIS S/P, WIPO 전체가 `LIMITED/UNAVAILABLE`다. 따라서 이 register는 clearance assurance가 아니며, T057에서 유지 결정을 하려면 이 잔여 위험을 그대로 수용하거나 수동/전문 후속 검색을 선택해야 한다.
- T057이 어떤 명칭을 `CHANGE_REQUIRED`로 정하더라도 screened replacement가 이 문서에 없다. T057은 미스크리닝 대체 명칭을 구현할 수 없다.
- T047 공개 승인, 외부 배포·제출, 명칭 변경 구현, 권리자 접촉, 새 AI 이미지 생성은 모두 계속 금지·미승인이다.
