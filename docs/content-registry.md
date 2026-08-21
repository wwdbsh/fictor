# M3–M5 콘텐츠 registry — 세 종족 × 활성 터

T026은 어름의 터, T036은 사름의 터, T037은 흩음의 터, T038은 삭음의 터, T039는 씻음의 터 콘텐츠 팩을 고정한다. registry는 활성 콘텐츠를
명시적으로 노출하고, 아직 구현되지 않은 후반 콘텐츠는 `DISABLED`로 남긴다. 모르는
식별자는 `MISSING`으로 구분한다.

## 활성 범위

- 활성 종족: `Stillkin`, `Burnkin`, `Joinkin` 세 종
- 활성 터: `GROUND_STILL`(어름의 터), `GROUND_BURN`(사름의 터), `GROUND_SCATTER`(흩음의 터),
  `GROUND_ROT`(삭음의 터), `GROUND_WASH`(씻음의 터)
- 어름의 터 깊이: 1~3, 각각 `서리 낀 들판`, `얼어붙은 폭포와 계단`, `완전히 정지한 거대 구조`
- 일반 적: `SWARM`, `BULK`, `SHELL`, `REACH`, `MIMIC` 다섯 형태
- 엘리트: `elite__still__burn`, 기믹 메타데이터 `PRESSED_FIRE`
- 보스: `The Stilling`, 기믹 메타데이터 `TOTAL_STOP`
- 이벤트: `CACHE`, `WORKSHOP`, `COLLAPSE`, `FICTOR`, `RECORD`, `ODDITY` 여섯 유형

## T036 사름의 터 콘텐츠 팩

- 깊이 1~3: `식은 재밭`, `균열 사이로 보이는 불빛`, `꺼지지 않는 화심`
- 일반 적: `burn_01~05`의 명명 필드와 `SWARM`, `BULK`, `SHELL`, `REACH`, `MIMIC`을
  1:1로 연결한 다섯 형태
- 엘리트: `elite__burn__scatter`, 기믹 `BLAST`
- 보스: `The Burning`, 기믹 `BURNOUT`, 전설 카드 아트 `cards/heart__burn.png` 재사용
- 보상: 일반은 사름 기원의 `ORE`·`GROUND_PRODUCT`, 엘리트는 `TOOL`·`ODDITY`, 보스는
  `heart__burn`만 허용한다. 수량·확률·전투 수치는 registry에 넣지 않는다.
- 이벤트: 여섯 유형 모두 노출. `CACHE`, `COLLAPSE`, `ODDITY`는 사름 변주 아트를 쓰고
  나머지는 공용 plate를 쓴다.

세 활성 종족 descriptor는 모두 `GROUND_BURN`을 허용한다. T036 reachability smoke는 각 종족에서
세 깊이와 일반 적·엘리트·보스의 literal asset reference가 이어지고 마지막 노드가
`the_burning`/`BURNOUT`인지 검증한다. 기존 브라우저 수직 슬라이스의 고정 어름 여정은 이 콘텐츠
registry 변경과 별도이며 T036에서 route·종족 규칙·최종 밸런스를 바꾸지 않는다.

## T037 흩음의 터 콘텐츠 팩

- 깊이 1~3: `먼지 자욱한 분지`, `떠 있는 바위 군`, `지면이 아예 없는 공중`
- 일반 적: `scat_01~05`의 명명 필드를 다섯 적 형태와 1:1로 연결한다.
- 엘리트: `elite__scatter__rot`, 기믹 `SPREADING`. 호출자가 `maxTargets`를 주입하면 입력 순서대로
  대상에 같은 디버프 ID를 전달하며 registry에는 수치를 저장하지 않는다.
- 보스: `The Scattering`, 기믹 `DISPERSAL`, 전설 카드 아트 `cards/heart__scatter.png` 재사용.
  호출자가 `phaseTurns`를 주입한 동안은 명중할 수 없고 남은 턴이 0이 되면 다시 명중할 수 있다.
- 보상 authority는 기존 터와 같되 일반 보상의 origin은 `GROUND_SCATTER`, 보스 보상은
  `heart__scatter`다. 이벤트는 `CACHE`·`ODDITY`의 흩음 변주와 네 공용 plate를 사용한다.

세 활성 종족 descriptor는 모두 `GROUND_SCATTER`를 허용한다. T037은 content-level 보스
reachability만 추가하며 기존 브라우저 수직 슬라이스의 고정 어름 여정, 종족 규칙, 최종 밸런스는
변경하지 않는다.

## T038 삭음의 터 콘텐츠 팩

- 깊이 1~3: `주저앉은 지표`, `겹겹이 무너진 층`, `바닥이 계속 내려앉는 곳`
- 일반 적: `rot_01~05`의 명명 필드를 다섯 적 형태와 1:1로 연결한다.
- 엘리트: `elite__rot__wash`, 기믹 `NEUTRALIZED`. 양측 상태 ID 목록을 검증한 뒤 새 빈 목록으로
  함께 초기화하며 입력 상태를 변경하지 않는다.
- 보스: `The Rotting`, 기믹 `SELF_EATING`, 전설 카드 아트 `cards/heart__rot.png` 재사용.
  호출자가 안전한 양의 정수 `hpCost`와 `powerGain`을 주입하며 마지막 체력은 소모하지 않는다.
- 보상 authority는 기존 터와 같되 일반 보상의 origin은 `GROUND_ROT`, 보스 보상은 `heart__rot`다.
  이벤트는 `CACHE`·`ODDITY`의 삭음 변주와 네 공용 plate를 사용한다.

세 활성 종족 descriptor는 모두 `GROUND_ROT`을 허용한다. T038 역시 content-level 보스
reachability만 추가하며 기존 브라우저 수직 슬라이스의 고정 어름 여정, 종족 규칙, 최종 밸런스는
변경하지 않는다.

## T039 씻음의 터 콘텐츠 팩

- 깊이 1~3: `닳은 돌밭`, `매끈하게 파인 수로`, `완전한 공백`
- 일반 적: `wash_01~05`의 명명 필드를 다섯 적 형태와 1:1로 연결한다.
- 엘리트: `elite__wash__join`, 기믹 `CLARIFIED`. 호출자가 안전한 양의 정수 `healing`을 주입하면
  엘리트 자신의 상태를 정화하고 최대 체력을 넘지 않는 범위에서 매 step 회복한다.
- 보스: `The Washing`, 기믹 `EMPTIED`, 전설 카드 아트 `cards/heart__wash.png` 재사용. 호출자가
  안전한 양의 정수 `intervalTurns`를 주입하며, 주기가 되면 양측 상태를 함께 초기화하고 다음 주기를
  다시 시작한다.
- 보상 authority는 기존 터와 같되 일반 보상의 origin은 `GROUND_WASH`, 보스 보상은 `heart__wash`다.
  이벤트는 `CACHE`·`COLLAPSE`·`ODDITY`의 씻음 변주와 세 공용 plate를 사용한다.

세 활성 종족 descriptor는 모두 `GROUND_WASH`를 허용한다. T039도 content-level 보스 reachability만
추가하며 기존 브라우저 수직 슬라이스의 고정 어름 여정, Washkin 플레이 종족, 최종 밸런스는 변경하지
않는다.

보스는 별도 이미지를 만들지 않는다. 각 터의 전설 카드 아트를 같은 asset
reference로 재사용한다. 이벤트 중 `CACHE`와 `ODDITY`만 어름 변주 asset을 사용하고, 나머지
네 유형은 generic plate를 사용한다. 모든 경로는 registry의 literal allowlist에서만 나온다.

`src/content`의 descriptor는 깊게 freeze되어 있으며 lookup은 매번 독립된 깊은 복사본을
freeze해서 돌려준다. 따라서 UI나 다음 application 계층이 descriptor를 읽거나 실수로
변경해도 canonical registry와 다른 lookup 결과에 alias가 생기지 않는다.

## T027 composition seam

T027은 이 registry를 조합하는 application 경계다. application은 `lookupRace`/`lookupGround`로
`ENABLED` 콘텐츠만 선택하고, 깊이 descriptor의 encounter와 event reference를 런 진행 상태에
연결한다. `DISABLED`와 `MISSING`은 런 상태에 들어갈 수 없도록 application에서 거부한다.

전투 도메인에는 아직 enemy HP, 의도 damage, 보상, 깊이 확률을 주입하지 않는다. T027이
승인된 수치를 가진 별도 encounter/run 입력을 만들 때까지 registry는 id, 형태, 기믹 id,
asset reference와 라벨만 제공한다. 이 경계 덕분에 후속 종족·터가 추가되어도 기존 활성
콘텐츠의 식별자와 참조가 바뀌지 않는다.

Stillkin의 `굳히기`는 카드 정의(`cardId`)가 아니라 전투 인스턴스의 `instanceId`를
overlay에 기록한다. 선택 단계는 zone을 바꾸지 않으며, enforcement 단계에서 그 인스턴스가
실제로 draw deck에 있을 때만 현재 순서를 보존한 채 index 0으로 옮긴다. 손패·버림·추방에
있는 인스턴스를 덱으로 이동시키지 않고, 같은 enforcement를 반복해도 결과는 변하지 않는다.
전투 종료 시 overlay는 비운다.

## 아직 pending인 수치

`PRESSED_FIRE`, `TOTAL_STOP`, `BLAST`, `BURNOUT`, `SPREADING`, `DISPERSAL`, `NEUTRALIZED`, `SELF_EATING`, `CLARIFIED`, `EMPTIED`는 registry에서 실행기가 아니라 기믹
메타데이터로만 보인다.
실행기를 만들 때는 `resolvePressedFire({ chargeTurns, explosionPower })`와
`resolveTotalStop({ shield })`에 안전한 양의 정수 설정을 명시적으로 전달해야 한다. 설정이
없거나 안전한 양의 정수가 아니면 실행기를 만들지 않는다.

- `PRESSED_FIRE`: charge 0에서 시작하고 매 step마다 증가한다. 다음 charge가 경계 이상이면
  설정된 `explosionPower`와 함께 `RELEASE`를 내고 0으로 재설정하며, 그 전에는 `CHARGE`다.
- `TOTAL_STOP`: 설정된 shield를 가진 `SEALED`에서 시작한다. 안전한 음이 아닌 정수 damage만
  적용하며, damage가 남은 shield 이상이면 정확히 한 번 `BROKEN`으로 전환한다. 이미 깨진
  상태에는 추가 damage가 상태를 바꾸지 않는다.
- `BLAST`: 호출자가 안전한 양의 정수 damage를 주입한다. 중복 없는 대상 전체에 같은 피해를
  한 번에 만들며 총 피해가 안전한 정수 범위를 넘으면 실패한다.
- `BURNOUT`: 호출자가 안전한 양의 정수 `hpCost`와 `powerGain`을 주입한다. 보스가 마지막 체력을
  소모하지 않는 범위에서 체력을 공격력으로 바꾸며, 더 지불할 수 없으면 상태를 바꾸지 않고
  `EXHAUSTED`를 반환한다.
- `SPREADING`: 호출자가 안전한 양의 정수 `maxTargets`를 주입한다. 원본 대상과 중복되지 않는
  고유 대상에 같은 디버프 ID를 입력 순서대로 전달한다.
- `DISPERSAL`: 호출자가 안전한 양의 정수 `phaseTurns`를 주입한다. 해당 턴 동안 `DISPERSED`로
  명중할 수 없고, 남은 턴이 0이 되면 `MATERIALIZED`로 전환한다.
- `NEUTRALIZED`: 추가 수치 설정 없이 양측의 고유 상태 ID 목록을 함께 초기화한다. 중복·빈 ID·추가
  필드가 있는 상태는 원자적으로 거부한다.
- `SELF_EATING`: 호출자가 안전한 양의 정수 `hpCost`와 `powerGain`을 주입한다. 마지막 체력을
  보존하면서 자기 체력을 공격력으로 바꾸고, 더 소모할 수 없으면 `EXHAUSTED`를 반환한다.
- `CLARIFIED`: 호출자가 안전한 양의 정수 `healing`을 주입한다. 엘리트 자신의 고유 상태 ID 목록을
  정화하고 최대 체력을 넘지 않는 범위에서 회복하며 입력 상태는 변경하지 않는다.
- `EMPTIED`: 호출자가 안전한 양의 정수 `intervalTurns`를 주입한다. 주기 전에는 양측 상태를 보존한
  복사본으로 countdown하고, 주기가 되면 양측의 모든 상태를 함께 비운 뒤 같은 주기를 재설정한다.

최종 공명률, 적 HP·damage, 보상, 연료, 깊이별 확률은 이 문서와 registry에 넣지 않는다.
2026-08-21 밸런스 승인 전에는 pending 상태를 유지한다.

T033/T034는 Burnkin과 Joinkin을 같은 `GROUND_STILL` route에서 활성화했다. 이는 사름/이음 터 콘텐츠를
활성화한 것이 아니다. 두 종족의 execution packet, starter, save authority는 application layer에 있고
registry는 종족 선택과 어름의 터 허용 관계만 노출한다.
