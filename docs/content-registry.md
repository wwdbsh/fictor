# M3 콘텐츠 registry — Stillkin × 어름의 터

T026은 콘텐츠 정의와 Stillkin의 순수 정책만 고정한다. registry는 첫 수직 슬라이스에서
사용할 콘텐츠를 명시적으로 노출하고, 아직 승인되지 않은 후반 콘텐츠는 `DISABLED`로
남긴다. 모르는 식별자는 `MISSING`으로 구분한다.

## 활성 범위

- 활성 종족: `Stillkin` 하나
- 활성 터: `GROUND_STILL`(어름의 터) 하나
- 어름의 터 깊이: 1~3, 각각 `서리 낀 들판`, `얼어붙은 폭포와 계단`, `완전히 정지한 거대 구조`
- 일반 적: `SWARM`, `BULK`, `SHELL`, `REACH`, `MIMIC` 다섯 형태
- 엘리트: `elite__still__burn`, 기믹 메타데이터 `PRESSED_FIRE`
- 보스: `The Stilling`, 기믹 메타데이터 `TOTAL_STOP`
- 이벤트: `CACHE`, `WORKSHOP`, `COLLAPSE`, `FICTOR`, `RECORD`, `ODDITY` 여섯 유형

보스는 별도 이미지를 만들지 않는다. 전설 카드 아트 `cards/heart__still.png`를 같은 asset
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

`PRESSED_FIRE`와 `TOTAL_STOP`은 registry에서 실행기가 아니라 기믹 메타데이터로만 보인다.
실행기를 만들 때는 `resolvePressedFire({ chargeTurns, explosionPower })`와
`resolveTotalStop({ shield })`에 안전한 양의 정수 설정을 명시적으로 전달해야 한다. 설정이
없거나 안전한 양의 정수가 아니면 실행기를 만들지 않는다.

- `PRESSED_FIRE`: charge 0에서 시작하고 매 step마다 증가한다. 다음 charge가 경계 이상이면
  설정된 `explosionPower`와 함께 `RELEASE`를 내고 0으로 재설정하며, 그 전에는 `CHARGE`다.
- `TOTAL_STOP`: 설정된 shield를 가진 `SEALED`에서 시작한다. 안전한 음이 아닌 정수 damage만
  적용하며, damage가 남은 shield 이상이면 정확히 한 번 `BROKEN`으로 전환한다. 이미 깨진
  상태에는 추가 damage가 상태를 바꾸지 않는다.

최종 공명률, 적 HP·damage, 보상, 연료, 깊이별 확률은 이 문서와 registry에 넣지 않는다.
2026-08-21 밸런스 승인 전에는 pending 상태를 유지한다.
