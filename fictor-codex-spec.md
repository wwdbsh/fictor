# FICTOR — 개발 작업 지시서 (Codex용)

> 이 문서는 **구현 지시서**다. 설계 근거 · 세계관 서술 · 결정 이유는 `game-design-doc.md`(이하 **설계서**)에 있다.
> 두 문서는 짝이다. 설계서를 폐기하지 말 것.
> 마지막 §12에 **커버리지 맵**이 있다 — 설계서의 모든 섹션이 이 문서 어디에 반영되었는지 대조표다.

---

## 0. 목표와 제약

| 항목 | 값 |
|---|---|
| 산출물 | **브라우저에서 바로 실행되는 웹 빌드** (해커톤 필수 요건) |
| 제출 마감 | **2026-08-26** |
| 개발 기간 | 2026-08-17 ~ 08-25 (9일) |
| 스택 | TypeScript / React |
| 장르 | 조합 기반 로그라이크 덱빌더, PvE |
| 개발 도구 | **Codex** (제출 요건: Codex로 개발한 프로토타입) |

**절대 요건**
- 빌드 산출물이 정적 호스팅으로 즉시 실행될 것. 서버 의존성 금지
- 로그인 · 결제 · 백엔드 없음. 진행 저장은 로컬 스토리지
- PvP 없음 (추후 phase)

---

## 1. 빌드 순서

**스코프를 줄이지 않는다. 순서로 방어한다.** 각 단계 종료 시점에 제출 가능한 빌드가 존재해야 한다.

> ★ **에셋 생성이 크리티컬 패스다.** Higgsfield 크레딧이 **2026-08-17에 소멸**하며 이후 재생성이 불가능하다.
> 게임 로직보다 에셋 파이프라인이 먼저다. Phase 0 · 0.5를 최우선으로 실행할 것.

### Phase 0 — 데이터 생성 (~08/12)

| 산출물 | 완료 기준 |
|---|---|
| `materials.json` (52) | 전 필드 채워짐. §3.1 스키마 준수 |
| `laws.json` (21) | 21쌍 전부. §3.2 스키마 준수 |
| `resultClasses.json` (34) | 교차15 + 동일6 + 촉매6 + 장비1 + 심장6 |
| `cards.generated.json` (1,326) | 생성 스크립트 결과. 이름 · 효과 · 아트키 포함 |
| `equipment.generated.json` (45) | 도구 상삼각 45 |

> **Phase 0은 순수 데이터 단계다. UI 없음.** 생성기가 결정론적인지만 검증한다.
> 같은 입력 → 같은 출력이어야 한다. **이름 1,326개를 사람이 훑어 어색한 것을 골라낼 것.**

### Phase 0.5 — 에셋 생성 (~08/17, 절대 마감) ★★

| 산출물 | 완료 기준 |
|---|---|
| 프롬프트 조립기 | §8.2 · §8.3 템플릿, 결정론적 |
| 마스터 스타일 확정 | 반복 생성 후 채택 → 레퍼런스 엘리먼트 등록 |
| 전량 생성 | 1,494장 (§8.1) |
| **전량 로컬 회수** | `public/assets/` 이하에 저장 완료 |

> **8/17 이후에는 어떤 이미지도 만들 수 없다.** 미확정 사항이 남아 있어도 아트는 먼저 뽑는다.
> 마지막 날은 생성이 아니라 **회수**에 쓴다.

### Phase 1 — 수직 슬라이스 (~08/21) ★ 이 시점부터 제출 가능

| 산출물 | 완료 기준 |
|---|---|
| 전투 루프 | 턴 진행 · 드로우 · 코스트 · 적 의도 표시 |
| 즉석 빚기 | 전투 중 2장 → 1장, 전투 종료 시 재료 복구 |
| 공방 빚기 | 전투 사이, 연료 소모, 덱 영구 편입 |
| 도감 | 발견한 레시피 영구 기록 (로컬 스토리지) |
| 1종족 | **Stillkin** |
| 1터 | **어름의 터**, 깊이 3단계 |
| 보스 1 | The Stilling 잔영 |

> **8/21에 반드시 플레이해볼 것.** 조합 발견이 실제로 재미있는지 여기서 판정한다.
> 재미가 없으면 남은 기간을 확장이 아니라 코어 수정에 쓴다.

### Phase 2 — 종족 확장 (~08/23)

Burnkin · Joinkin 추가. **Joinkin의 3장 빚기는 §4.4 구현 규칙을 반드시 따를 것.**

### Phase 3 — 터 확장 (~08/25)

나머지 5개 터 + 엘리트 6 + 보스 6 + 이벤트 6유형.

### Phase 4 — 폴리시 (08/26)

밸런싱 계수 조정, 빚기 연출, 발견 연출.

> **발견 연출은 폴리시가 아니라 핵심이다.** 재료가 타들어가고 새 카드가 뒤집히며 이름이 찍히는 3초가
> 이 게임의 감정 피크다. 시간이 없으면 다른 걸 버리고 이걸 남긴다.

---

## 2. 시스템 규칙 (구현 대상)

### 2.1 조합 — 두 모드

| | 공방 빚기 | 즉석 빚기 |
|---|---|---|
| 시점 | 전투 사이 | 전투 중, 손에서 |
| 재료 | **영구 소모** | 이번 전투만 소모 → **전투 종료 시 덱으로 복구** |
| 결과 | 동일한 **canonical 조합 결과**를 덱에 영구 편입 | 동일한 **canonical 조합 결과**를 전투 종료 시 소멸 |
| 비용 | 제한 자원(연료) | 액션 1회 |
| 되돌리기 | 불가 | 자동 복구 |

**구현 주의:** 즉석 빚기에서 재료가 영구 소모되면 플레이어에게 항상 손해가 되어 기능이 죽는다. 반드시 전투 한정 소모로 구현할 것.

두 모드는 정렬된 재료 id 쌍(`[a, b].sort().join("|")`)을 기반으로 동일한 canonical 결과와 동일한 `recipeId`를 사용한다. 이 `recipeId`가 단일 Codex 영구 키다. 차이는 비용과 수명뿐이다. 공방 빚기는 재료를 영구 소모하고 결과를 덱에 영구 편입하며 연료를 소모한다. 즉석 빚기는 재료를 전투 한정으로 소모해 전투 종료 시 복구하고, 결과는 전투 종료 시 소멸하며 액션 1회를 소모한다.

양쪽에서 발견한 레시피는 모두 도감에 영구 기록된다 — 이것이 탐색과 확정을 잇는 다리다.

> **확장 보류:** "불안정 화합물" 개념은 폐기가 아니라 보류다. 되살릴 경우 새 카드나 새 `result_class`가 아니라 기존 즉석 빚기 결과에 상태 플래그를 붙이고, 균열 프레임·발광 테두리 같은 코드 오버레이로 처리한다. 따라서 추가 카드 아트나 사전 아트 생성은 불필요하다.

### 2.2 소유

- 기본 소유 단위는 **레시피(지식)**. 한 번 발견하면 영구 기록, 다음 런부터 재료만 있으면 즉시 제작
- 재료 획득은 여전히 런 내 랜덤 → 파워 인플레 통제
- **즉석 빚기로 발견한 레시피도 영구 기록된다** (탐색 → 확정 순환의 핵심)

### 2.3 획득 · 희귀도

**일반 Tier 2 조합 결과(1,281)와 장비(45)는 절대 보상으로 지급하지 않는다.** 빚어야만 얻는다.

| 등급 | 대상 |
|---|---|
| `COMMON` | 속성 원석 6, 얕은 터 산물 |
| `UNCOMMON` | 깊은 터 산물, 도구 10 |
| `RARE` | 기괴 산물 6 |
| `EQUIPMENT` | 도구 조합 45 |
| `LEGENDARY` | 신의 심장 6 |

| 보상원 | 지급 |
|---|---|
| 일반 전투 승리 | 재료 3장 중 1장 선택 |
| 엘리트 격파 | 도구 또는 기괴 산물 |
| 보스 격파 | 신의 심장 |
| `CACHE` | 그 터의 재료 다수 |
| `ODDITY` | 기괴 산물 |
| `RECORD` | **레시피** (재료 없이 지식만) |
| `FICTOR` | 상점 — 재료 · 도구 · 레시피 구매 |

**신의 심장:** 재료로 사용 가능. **사용 시 영구 소멸.** 결과는 Tier 3 고유 카드.

심장 빚기 규칙:

| 항목 | 값 |
|---|---|
| 조합 상대 | 재료의 **속성만** 본다. 재료 개체는 구분하지 않는다 |
| 결과 수 | `6심장 × 6속성 = 36` |
| `result_class` | `HEART_STILL` · `HEART_BURN` · `HEART_SCATTER` · `HEART_ROT` · `HEART_WASH` · `HEART_JOIN` |
| 구도 | `CELESTIAL` |
| 색 | **금박 + 상대 속성색** |
| 밀도 | `MAX` |
| 명명 | `<신 이름>이 빚은 <재료 noun_form>` — 예: `어름이 빚은 잉걸` |
| 효과 | 상대 속성 `combat_effect`의 최상위 강화형. 수치는 8/21 이후 확정 |
| 소모 | 심장은 사용 시 **영구 소멸** |

Track 1에서는 신의 심장 **획득·도감 소유까지만** 활성화한다. 빚기 UI는
`featureFlag: heartForge = false`로 잠근다. 단, 2026-08-17 이후에는 이미지를 추가 생성할 수
없으므로 Phase 0.5에서 심장 빚기 아트 36장은 반드시 생성한다. 구현을 제외하더라도 아트 생성 여부는
별도로 판단한다.

### 2.4 전투 루프

| 단계 | 처리 |
|---|---|
| 턴 시작 | 에너지 회복, N장 드로우 |
| 행동 | 카드 플레이(코스트) 또는 즉석 빚기(액션 1회) |
| 턴 종료 | 손패 버림, 적 행동 |
| 전투 종료 | 즉석 빚기 재료 전원 복구, 결과 카드 소멸 |

적은 다음 행동 의도를 표시한다.

### 2.5 공명 (Resonance)

```
resonance(attr) = 이번 전투에서 연속 플레이한 attr 카드 수
effect_final    = power * (1 + resonance * RESONANCE_RATE)
```

다른 속성을 내면 공명이 끊긴다. **종족별 변주는 §5 참조.**

---

## 3. 데이터 계약

### 3.1 Material (52)

```ts
type Attribute = "STILL" | "BURN" | "SCATTER" | "ROT" | "WASH" | "JOIN" | "NONE";
type Representation = "SOLID" | "PHENOMENON";
type Category = "ORE" | "GROUND_PRODUCT" | "TOOL" | "ODDITY";
type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EQUIPMENT" | "LEGENDARY";
type BalanceStatus = "PENDING_2026_08_21" | "APPROVED";
type ToolDomain = "FORGE" | "HAND" | "DECK" | "INFO" | "SCALE"
                | "ENERGY" | "BALANCE" | "KEEP" | "ROUTE" | "CARRY";
type Ground = "GROUND_STILL" | "GROUND_BURN" | "GROUND_SCATTER"
            | "GROUND_ROT" | "GROUND_WASH" | "GROUND_JOIN" | "NONE";

interface Material {
  id: string;
  name_ko: string;
  attribute: Attribute | Attribute[];   // ODDITY만 배열
  modifier_form: string;                // 행위자일 때 쓰는 수식어
  noun_form: string;                    // 대상일 때 쓰는 명사
  representation: Representation;
  category: Category;
  origin: Ground;
  rarity: Rarity | null;
  rarity_status: "APPROVED" | "PENDING_DEPTH_CLASSIFICATION";
  balance_status: BalanceStatus;
  potency: number | null;               // APPROVED일 때만 1~3
  cost_base: number | null;             // APPROVED일 때만 0~2
  art: string;                          // "cards/<id>.png"
  tool_domain?: ToolDomain;             // TOOL에만 필수, 다른 category에는 금지
}
```

`balance_status: "PENDING_2026_08_21"`인 동안 `potency`와 `cost_base`는 둘 다 `null`이다.
`APPROVED`로 바꿀 때만 각각 1~3과 0~2의 수를 함께 넣는다. 일부 필드만 먼저 채우거나 0/1을
자리표시자로 쓰지 않는다. 터 산물의 깊이별 희귀도 경계는 미확정이므로 현재
`rarity: null`, `rarity_status: "PENDING_DEPTH_CLASSIFICATION"`이며, 원석·도구·기괴 산물은
각각 `COMMON`·`UNCOMMON`·`RARE`로 승인 상태다.

**전체 52종의 `modifier_form` · `noun_form` · 속성 · 표현은 설계서 §5-1 ⑤ 명명 필드 표에 확정되어 있다. 그대로 옮길 것.**

T003 semantic validator는 이 한국어 문자열을 별도 상수로 복제하지 않는다. 세 source가 단일
canonical 원본이며, T005/T006의 사용자 이름 검수와 source revision hash가 문자열 확정본을 보호한다.

- 속성 원석 6 (`ore_*`)
- 터 산물 30 (`still_01~05`, `burn_01~05`, `scat_01~05`, `rot_01~05`, `wash_01~05`, `join_01~05`)
- 도구 10 (`tool_01~10`) — `attribute: "NONE"`
- 기괴 산물 6 (`odd_01~06`) — `attribute` 배열

### 3.2 Law (21)

```ts
interface Law {
  pair: [Attribute, Attribute];   // 정렬된 쌍
  result_class: string;
  result_name_ko: string;
  actor: Attribute;               // 명명 방향 결정
  law_text_ko: string;
  combat_effect: string;
  balance_status: BalanceStatus;
  power_coefficient: number | null; // APPROVED일 때만 유한한 양수
  drawback?: string;              // 동일 조합 6쌍만
}
```

`pair`는 `STILL → BURN → SCATTER → ROT → WASH → JOIN` 순서로 canonical 정렬하며
`actor`는 항상 `pair[0]`이다. 자바스크립트 문자열 정렬을 쓰지 않는다. 현재 모든 Law는
`PENDING_2026_08_21`과 `power_coefficient: null`을 함께 갖고, 8/21 이후 승인 시에만 유한한
양수를 넣는다.

**21쌍 전체(교차 15 + 동일 6)는 설계서 §4 변환 법칙 표에 확정되어 있다.**
Law의 한국어 결과군 이름은 참조하는 ResultClass `name_ko`와 같아야 한다. 정확한 문구를 validator에
복제하지 않고 T005/T006 검수 및 source revision hash로 고정한다.

### 3.3 ResultClass (34)

```ts
type Composition = "SPECIMEN" | "CUTAWAY" | "PROCESS" | "SEQUENCE" | "CELESTIAL" | "MAP";
type Density = "MIN" | "SPARSE" | "MID" | "DENSE" | "MAX";

interface ResultClass {
  id: string;
  name_ko: string;        // 사용자 카드명이 아닌 내부 결과군 라벨
  family: "CROSS" | "SAME" | "CATALYST" | "EQUIPMENT" | "HEART";
  composition: Composition;
  colors: string[];      // 1~2개. 전설은 ["GOLD","VERMILION"], 심장 빚기는 GOLD + 상대 속성색
  density: Density | null;
  density_status: "APPROVED" | "DERIVED_FROM_MATERIAL";
  density_rule: string | null;
  combat_effect: string | null;
  combat_effect_status: "APPROVED" | "DERIVED_PER_RECIPE" | "ATTRIBUTE_MAXIMUM_RULE";
  combat_effect_rule: string | null;
  equipment_interactions?: Array<{      // EQUIPMENT에만 10C2 = 45개
    domains: [ToolDomain, ToolDomain];
    passive_effect_id: string;
    passive_effect_ko: string;
  }>;
}
```

**34군 전체(교차 15 · 동일 6 · 촉매 6 · 장비 1 · 심장 6)와 구도·색은 설계서 §4-5를 따른다.**
교차·동일·심장 밀도와 장비의 `DENSE` 밀도는 확정이다. 촉매 밀도는 값 하나로 고정하지 않고
재료의 정체성과 `representation`에서 파생하므로 `density: null`,
`density_status: "DERIVED_FROM_MATERIAL"`을 쓴다. T008 프롬프트 생성기는 이 두 재료 필드를 입력에
반영해야 한다. 장비 효과는 레시피별 파생(`DERIVED_PER_RECIPE`)이다. 심장은 상대 속성 효과의 최상위
강화형이라는 의미가 이미 확정되어 `ATTRIBUTE_MAXIMUM_RULE`을 쓰며, 8/21 이후 확정하는 것은 수치뿐이다.
도구별 `tool_domain`은 `materials.json`, 장비 45칸의 `equipment_interactions`와 한국어 패시브 문구는
`resultClasses.json`의 `EQUIPMENT` 한 항목이 유일한 원본이다. 생성기와 테스트에 매트릭스를 복제하지 않는다.

속성 색 매핑:

| Attribute | 색 |
|---|---|
| `STILL` | 청록 teal |
| `BURN` | 주홍 vermilion |
| `SCATTER` | 유황 노랑 sulphur |
| `ROT` | 독성 녹색 acid green |
| `WASH` | 군청 ultramarine |
| `JOIN` | 자주 magenta |

**색의 개수가 티어를 나타낸다:** Tier1 단색 / Tier2 교차 2색 / Tier2 동일 단색+밀도극단 / 전설 금박+주홍 / 심장 빚기 금박+상대 속성색.

세 원본은 JSON Schema와 의미 검사를 통과하면 T004의 구조적 catalog 생성 입력으로 사용할 수 있다.
터 산물 희귀도 미확정은 보상 테이블을, 밸런스 미확정은 전투 수치 적용을 각각 차단한다. 촉매의
승인된 재료 파생 규칙과 장비 `DENSE` 결정으로 최종 아트 manifest는 준비 상태다. 준비 상태를 하나의
boolean으로 뭉개지 않는다.

### 3.4 조합 인덱스

```
key = [idA, idB].sort().join("|")     // "still_01|burn_01"
```

순서 무관. 총 `52C2 = 1,326` 엔트리.

재료 id는 `^[a-z][a-z0-9_]*$`만 허용하며 같은 id 조합은 거부한다. 생성 ID는
`recipe_id = <low>|<high>`, `card_id = forge__<low>__<high>`,
`art = cards/<card_id>.png`, `art_key = <result_class>/<actor_id>_<receptor_id>`다.

생성기는 두 도구면 `EQUIPMENT`(낮은 id가 actor), 도구 하나면 `CATALYZED_<상대 주속성>`(도구가
actor), 그 외에는 Law의 actor 속성을 따른다. 동일 주속성일 때는 낮은 material id가 actor다.
기괴 산물은 `attribute[0]`만 사용한다. 미승인 수치는 숫자 자리표시자를 만들지 않고
`balance_status: "PENDING_2026_08_21"`, `stats: { potency: null, cost: null, power: null }`로 남긴다.
장비는 `NOT_APPLICABLE`, `stats: null`이다.

생성물은 `src/data/generated/cards.generated.json`(1,326)과
`equipment.generated.json`(장비 상세 view 45)에 기록한다. 두 envelope는 schema version 1,
`canonical-v1`, source/content SHA-256을 가지며 타임스탬프·난수가 없다. `equipment` view는 메인
카드의 id·recipe·passive를 참조할 뿐 art나 별도 결과를 복제하지 않는다. 두 파일은 직접 편집하지 않는다.

---

## 4. 핵심 알고리즘

### 4.1 카드 이름 생성

```ts
function makeTier2(A: Material, B: Material) {
  const law    = Laws[sortedPair(A.attribute, B.attribute)];
  const actor  = (A.attribute === law.actor) ? A : B;
  const object = (actor === A) ? B : A;
  return {
    name_ko: `${actor.modifier_form} ${object.noun_form}`,
    effect:  law.combat_effect,
    art_key: `${law.result_class}/${actor.id}_${object.id}`
  };
}
```

예시 (설계서 §4 검증용):

| A | B | 법칙 | 결과 |
|---|---|---|---|
| 서리꽃 (응결) | 잉걸 (점화) | 응결이 점화를 눌렀다 | 서리 낀 잉걸 |
| 첫 불티 (점화) | 무른 뿌리 (부패) | 점화가 부패를 태웠다 | 불붙은 뿌리 |
| 등불 (도구) | 곰팡이 꽃 (부패) | 촉매 → 부패 강화 | 밝혀진 곰팡이 |

### 4.2 스탯 파생

아래 공식은 재료와 Law가 모두 `balance_status: "APPROVED"`일 때만 계산한다.

```ts
potency = A.potency + B.potency + (sameAttribute ? SAME_BONUS : 0);
cost    = Math.ceil(potency / COST_DIVISOR);
power   = potency * law.power_coefficient;
```

**조정 계수는 넷뿐이다:** `SAME_BONUS`, `COST_DIVISOR`, 법칙별 `power_coefficient`, `RESONANCE_RATE`.
전체 밸런싱이 이 넷으로 수렴한다. **8/21 이후 확정.**

### 4.3 도구 처리

- `도구 + 재료` → `CATALYZED_<재료속성>`. 구도 `SPECIMEN` 고정, 색은 재료 속성 단색
- `도구 + 도구` → `EQUIPMENT`. 상시 패시브, 전투 중 소모 안 됨
- **같은 도구 2장 조합은 존재하지 않는다** — 도구는 덱에 1장뿐인 유니크 카드
- 장비 45종의 효과는 두 도구의 `domain` 교차로 결정. **매트릭스는 설계서 §8-1에 확정**

촉매는 새로운 전투 효과군을 만들지 않고 기존 Law 21의 같은 속성 효과를 재사용한다. 결속 촉매는
존재하지 않는 `AMPLIFY_JOIN`을 만들지 않으며 결속의 확정 역할인 `DOUBLE_FORGE`를 사용한다. 수치나
부작용 차이는 이후 승인된 밸런스 계수로만 표현한다.

`domain` 목록: `FORGE` · `HAND` · `DECK` · `INFO` · `SCALE` · `ENERGY` · `BALANCE` · `KEEP` · `ROUTE` · `CARRY`

### 4.4 Joinkin 3장 빚기 — 조합 폭발 방지 ★

**절대 주의.** 3장 조합을 새 카드 종류로 만들면 `52C3 = 22,100`이 되어 프로젝트가 붕괴한다.

```
반드시 2단계로 처리:
  step1 = makeTier2(A, B)      // 기존 1,326개 중 하나
  step2 = applyThird(step1, C) // 결과에 세 번째를 적용
```

새 카드 종류를 추가하지 않는다. 기존 1,326개를 재사용한다. 이 처리 과정에서 canonical catalog 밖의 카드 ID, `recipeId`, 아트를 생성해서는 안 된다. 플레이어 체감은 "3장을 한 번에 합쳤다"로 동일하다.

### 4.5 기괴 산물 조합

`attribute`가 배열이므로 **첫 번째(주) 속성**으로 법칙을 적용한다.

---

## 5. 종족 (3종)

| 종족 | 한글 | 태생 신 | 속성 |
|---|---|---|---|
| `Stillkin` | 어름붙이 | The Stilling | 응결 |
| `Burnkin` | 사름붙이 | The Burning | 점화 |
| `Joinkin` | 이음붙이 | The Joining | 결속 |

| | Stillkin | Burnkin | Joinkin |
|---|---|---|---|
| 패시브 | 방어가 턴 종료 시 **절반 잔존** | 체력 지불 → 에너지 획득 | **3장 빚기 가능** |
| 기술 | `굳히기` — 카드 1장을 이번 전투 동안 덱 맨 위 고정 | `지피기` — 손패 1장 소멸, 코스트만큼 에너지 | `이어붙이기` — 이번 턴 빚기 액션 +1 |
| 공명 | **끊기지 않음**, 증폭률 낮음 | 증폭률 **2배**, 끊기면 자해 피해 | 결속 카드가 **속성 무관 공명 유지** |
| 조합 해석 | 결과가 지속 · 방어형 | 재료 더 소모, 즉발 고위력 | 조합 트리 자체가 다름 |
| 시작 덱 | 응결 편중 | 점화 편중 | 결속 + 도구 편중 |

2차 종족(미구현): Scatterkin 흩음붙이 · Rotkin 삭음붙이 · Washkin 씻음붙이

---

## 6. 콘텐츠

### 6.1 여섯 터

| 터 | 속성 | 색 | 광원 | 지형 | 종이 |
|---|---|---|---|---|---|
| 어름의 터 | 응결 | 청록 | 낮은 각도 창백한 빛, 그림자 길고 부동 | 굳어버린 평원 | 회청 |
| 사름의 터 | 점화 | 주홍 | **아래에서** — 지면이 광원 | 아직 타는 지대 | 그을린 갈색 |
| 흩음의 터 | 휘발 | 유황 | 산란광, 그림자 흐림 | 부유 지형 | 크림 |
| 삭음의 터 | 부패 | 독성녹 | 위에서 새어드는 가는 빛 | 무너지는 함몰지 | 황토 |
| 씻음의 터 | 정화 | 군청 | 균질 확산광, 그림자 거의 없음 | 씻겨나가 텅 빈 곳 | 크림 |
| 이음의 터 | 결속 | 자주 | 틈새로 갈라진 빛 | 엉겨붙어 자란 덩어리 | 황토 |

각 터는 깊이 3단계. **깊이별 지형 변주는 설계서 §11-1에 확정.**
**깊이가 곧 재료 등급이다** — 깊을수록 높은 `potency`.

### 6.2 적 (42)

| 분류 | 수 | 구성 |
|---|---|---|
| 일반 | 30 | 6터 × 5형태 |
| 엘리트 | 6 | 터당 1, **두 속성 혼합** |
| 보스 | 6 | 옛 신의 잔영 |

**형태 5종:** `SWARM` 무리 · `BULK` 덩치 · `SHELL` 껍데기 · `REACH` 손길 · `MIMIC` 흉내(플레이어 카드 복사)

**엘리트는 21개 법칙을 그대로 행동으로 쓴다.** 예: 어름의 터 엘리트(응결+점화) = `PRESSED_FIRE` → 축적 후 대폭발.
플레이어가 조합으로 배운 지식이 전투 예측이 되는 **핵심 학습 전이 지점**이다. 반드시 구현할 것.

**보스는 동일 조합 6군을 기믹으로 쓴다.** `TOTAL_STOP` · `BURNOUT` · `DISPERSAL` · `SELF_EATING` · `EMPTIED` · `KNOT`.
**엘리트 · 보스 상세 표는 설계서 §8-2.**

### 6.3 이벤트 (6유형 × 6터 변주)

`CACHE` 조각 무더기 · `WORKSHOP` 버려진 공방 · `COLLAPSE` 무너진 갱도 · `FICTOR` 다른 빚는 자 · `RECORD` 옛 기록 · `ODDITY` 이상한 것

**상세는 설계서 §8-3.**

---

## 7. 텍스트 · 표기 규칙

### 7.1 용어

| 개념 | 정식(영문) | 한국어판 |
|---|---|---|
| 태초의 존재들 | Elder Gods | 옛 신 |
| 그들에게서 나온 물질 | Shard | 조각 |
| 조합 행위 | Forge | 빚기 |
| 플레이어의 기록 | Codex | 도감 |
| 플레이어 | Forger | 빚는 자 |
| 전설 카드 | Heart | 신의 심장 |
| 세계의 시작 | The Breaking | 부서짐 |

**타이틀 `FICTOR` / 한글 `픽토르`.** 영문이 정식, 한국어는 음차.

### 7.2 여섯 옛 신

| 속성 | 정식 | 한국어 | 칭호 |
|---|---|---|---|
| 응결 | The Stilling | 어름 | First to Stop / 처음 멈춘 신 |
| 점화 | The Burning | 사름 | Who Could Not Go Out / 꺼지지 못한 신 |
| 휘발 | The Scattering | 흩음 | Who Was Never Held / 붙잡히지 않은 신 |
| 부패 | The Rotting | 삭음 | Who Ate Itself / 스스로를 먹은 신 |
| 정화 | The Washing | 씻음 | Who Erased Every Trace / 흔적을 지운 신 |
| 결속 | The Joining | 이음 | Who Was Nothing / 아무것도 아니었던 신 |

보스 표기: `[이름], [칭호]`

### 7.3 카드 텍스트

| 규칙 | 내용 |
|---|---|
| 길이 | **2문장 이내** |
| 문체 | 관찰 기록체 |
| 금지 | 감탄사, 느낌표, 2인칭("당신"), 과장 형용사 |

```
좋음:  삭음에게서 떨어져 나온 것. 아직도 조금씩 줄어들고 있다.
좋음:  주전자다. 다리가 넷 생겼고, 어디론가 가고 있다.
나쁨:  놀랍게도 이 강력한 조각은 당신에게 엄청난 힘을 선사할 것이다!
```

**화자는 농담하지 않는다.** 대상이 웃기지 화자가 웃기지 않는다. 유머 라인 비율 20~30%.

---

## 8. 에셋 파이프라인

### 8.1 물량

| 항목 | 장수 |
|---|---|
| 기본 재료 | 52 |
| canonical 조합 (장비 45 포함) | 1,326 |
| 신의 심장 | 6 |
| 심장 빚기 결과 (6심장 × 6속성) | 36 |
| 배경 (6터 × 3깊이) | 18 |
| 적 (일반 30 + 엘리트 6) | 36 |
| 이벤트 | 20 |
| **카드 소계** | **1,420** |
| **총계** | **1,494** |

### 8.2 카드 프롬프트 조립

```
[고정 스타일 블록]
+ composition (SPECIMEN / CUTAWAY / PROCESS / SEQUENCE / CELESTIAL / MAP)
+ 대상: actor.noun_form + object.noun_form 결합물
+ colors
+ density
+ paper = hash(card_id) % 4        // 재생성 시 동일 결과 보장
+ representation (SOLID / PHENOMENON)
```

고정 스타일 블록:
> Antique copperplate engraving plate, 17th century manuscript style, fine cross-hatching and line work, aged paper, single centered subject, strong readable silhouette at small size.

### 8.3 배경 프롬프트 조립

```
[풍경 판화 고정 블록] + depth_variant + light + accent_color + density + paper
```

> Antique copperplate landscape engraving, 17th century topographical plate style, cross-hatching, atmospheric perspective, aged paper, wide vista.

**카드는 표본 도판(3:4), 배경은 풍경 판화(16:9). 하위 장르가 다르다.**

### 8.4 일관성

마스터 스타일 이미지 1장 → **레퍼런스 엘리먼트 등록** → 전량이 참조.
프롬프트 키워드 반복만으로는 1,500장을 버티지 못한다.

### 8.5 변주 축 5개

`강조색`(속성별) · `구도`(6종) · `선 밀도`(티어) · `종이 톤`(4종) · `표현 방식`(실체/현상)

**일관성은 매체감에만 잠그고 나머지는 전부 푼다.** 구도 · 색 · 밀도까지 잠그면 단조로워진다.

### 8.6 생성 실행 — Higgsfield MCP

**에셋 생성은 Codex가 직접 수행한다.** Higgsfield MCP 서버를 연결해 도구를 호출한다.

> **`STALE_FOR_REMOTE_EXECUTION` (T011, 2026-08-11):** 이 절의 0.12 단가, 965 잔액,
> batch 최대 12장과 125회 계산은 과거 계획값이다. 현재 관찰값과 gate는
> [`assets/evidence/t011-preflight-observed-v1.json`](assets/evidence/t011-preflight-observed-v1.json) 및
> [`docs/asset-runs/t011-preflight-2026-08-11.md`](docs/asset-runs/t011-preflight-2026-08-11.md)가 우선한다.
> 관찰 단가는 1.50, 잔액은 945.9이며 실제 batch 최대치는 미확인이다. current batch limit 확인과
> 사용자 재승인 전에는 이 절을 실행 지시로 사용하지 않는다. 2026-08-11 승인은 별도
> [`style-candidates-v2` 제한 READY](docs/asset-runs/t011-limited-ready-v2-2026-08-11.md)의 동일한 후보
> 4개·단건 `generate_image`에만 적용되며 이 절의 재료/core/batch 실행을 열지 않는다.

| 항목 | 값 |
|---|---|
| MCP 서버 | `https://mcp.higgsfield.ai/mcp` |
| 카드 · 배경 · 적 모델 | `nano_banana_2` — 과거 계획 **0.12 크레딧/장** (`STALE_FOR_REMOTE_EXECUTION`) |
| 텍스트가 들어가는 UI · 프레임 | `nano_banana_pro` (고비용, 최소한만) |
| `use_unlim` | **반드시 `false`** |
| 카드 종횡비 | `3:4` |
| 배경 종횡비 | `16:9` |

> **먼저 도구 스키마를 확인할 것.** 아래 도구명·파라미터는 참고용이다.
> 실행 전 `models_explore`로 모델 사양을, MCP 도구 목록으로 정확한 인자명을 확인한 뒤 호출한다.

**주요 도구**

| 도구 | 용도 |
|---|---|
| `balance` | 잔여 크레딧 확인. **작업 시작 전과 각 배치 후** |
| `generate_image` (`get_cost: true`) | 프리플라이트. 크레딧 소모 없이 단가 확인 |
| `generate_image_batch` | 과거 계획 **1회 최대 12장** (`STALE_FOR_REMOTE_EXECUTION`, 현재 제한 미확인) |
| `jobs_wait` | 제출한 job 완료 대기 |
| `show_generation_by_ids` | 결과 확인 |

### 8.7 생성 실행 규칙

**크레딧 예산 — `STALE_FOR_REMOTE_EXECUTION`**

> 아래 전체/core 예산은 여전히 실행 불가다. 현재 1.50 단가의 4개 스타일 후보 상한 6.00만
> [T011 limited READY v2](docs/asset-runs/t011-limited-ready-v2-2026-08-11.md)에서 별도로 승인됐다.

- 총량 **965**. 계정에 무제한 할당량 없음 (`unlim.available: false`)
- 예상 소요 약 **179** (1,494장 × 0.12)
- 여유가 크므로 **품질 기준을 높게 잡고 재생성을 아끼지 말 것**
- 단, **매 배치 후 `balance`로 잔량을 확인**하고 로그에 남긴다

**배치 실행 — `STALE_FOR_REMOTE_EXECUTION`**

> v2 제한 실행은 batch를 사용하지 않고 `generate_image`, `count=1`만 네 번 허용한다. 아래 125회
> 계산과 retry 지시는 재료/core 실행에 사용할 수 없다.

```
ceil(1,494장 ÷ 12) = 125회
```

- 배치 단위로 진행하고, **각 배치 완료 즉시 로컬 저장**한다. 전량 생성 후 일괄 다운로드 금지 — 중간 실패 시 전부 잃는다
- 저장 경로 `public/assets/cards/<card_id>.png` 등, `art` 필드와 일치시킬 것
- 실패한 job은 재시도. 3회 실패 시 로그에 남기고 다음으로 진행 — **한 장 때문에 파이프라인을 멈추지 않는다**

**결정론**

- 프롬프트 조립은 `card_id`에서 결정론적으로 나와야 한다. 종이 톤은 `hash(card_id) % 4`
- 같은 카드를 다시 뽑아도 같은 프롬프트가 나와야 한다. **난수 금지**

**순서**

1. 마스터 스타일 이미지 확정 (반복 생성 → 채택) → 레퍼런스 엘리먼트 등록
2. 기본 재료 52 → 육안 검수 → 스타일 승인
3. canonical 조합 1,326 (장비 45 포함) + 심장 빚기 결과 36 배치 생성
4. 신의 심장 6 + 배경 18 + 적 36 + 이벤트 20
5. 전량 로컬 회수 확인

> **2단계에서 반드시 멈추고 사람이 확인할 것.** 스타일이 틀린 채로 1,326장을 뽑으면
> 크레딧이 아니라 **시간**을 잃는다. 8/17까지 다시 뽑을 여유가 없다.

**제약**

- Higgsfield는 **음악 · 효과음 단독 생성을 지원하지 않는다.** 사운드는 별도 소스 필요
- **2026-08-17 이후 재생성 불가.** 이 날짜가 하드 마감이다

### 8.8 마감

**2026-08-17까지 전량 생성 및 로컬 회수 완료.**

---

## 9. 구현 시 함정 (반드시 확인)

| # | 함정 | 대응 |
|---|---|---|
| 1 | Joinkin 3장 조합을 새 카드로 생성 → 22,100개 폭발 | §4.4 2단계 처리 |
| 2 | 즉석 빚기 재료를 영구 소모 → 기능이 죽음 | 전투 한정 소모 |
| 3 | Tier2를 전투 보상으로 지급 → 조합 시스템 무의미화 | 재료 · 기괴 · 심장만 지급 |
| 4 | 프롬프트 종이 톤을 난수로 → 재생성 시 결과 흔들림 | `hash(card_id)` 사용 |
| 5 | 카드마다 고유 능력 부여 → 학습 불가 | 21개 `combat_effect` 공유 |
| 6 | 공방 빚기 무제한 → 전투가 소화 과정이 됨 | 연료 자원 제한 |
| 7 | 밸런싱 수치를 플레이 전 확정 | 계수 4개만 두고 8/21 이후 조정 |
| 8 | 스타일 검수 없이 1,326장 일괄 생성 | 재료 52장 뽑고 **멈춰서 사람 확인** |
| 9 | 전량 생성 후 일괄 다운로드 | **배치마다 즉시 로컬 저장** |
| 10 | `use_unlim: true` 사용 | 계정에 무제한 없음. 반드시 `false` |
| 11 | 8/17 이후 에셋 작업을 남겨둠 | 크레딧 소멸. **재생성 불가** |
| 12 | 미구현 기능이라고 아트까지 생략 | 구현은 미뤄도 아트는 미루지 않는다. 심장 빚기 36장이 대표 사례 |

---

## 10. 미확정 (8/21 이후)

- 밸런싱 계수 4개: `SAME_BONUS` · `COST_DIVISOR` · `power_coefficient` · `RESONANCE_RATE`
- 재료 52종의 `potency` · `cost_base` (터 산물은 깊이에 대응)

**그 외 모든 설계는 확정 상태다.**

---

## 11. 법적 · 정책 확인 (개발과 병행)

- [ ] 타이틀 `FICTOR` — 게임명 검색 · 도메인 · 상표(KIPRIS / USPTO)
- [ ] 고유명사 전반 원본성 확인 (옛 신 이름 · 종족명)
- [ ] Higgsfield 이용약관 — 출력물에 광범위 라이선스 조항. 해커톤 제출 · 수상 · 출시 경로에서 문제없는지 원문 확인
- [ ] AI 생성 아트 표기 정책 결정

---

## 12. 커버리지 맵

설계서의 모든 섹션이 이 문서 어디에 반영되었는지 대조표. **누락 검증용.**

| 설계서 | 내용 | 이 문서 |
|---|---|---|
| 타이틀 | FICTOR / 픽토르 | §7.1 |
| 0 | 프로젝트 개요 | §0 |
| 1 | 핵심 훅 (합쳐서 줄인다 / 발견이 곧 성장) | §1 Phase1 주석, §2.2 |
| 2 | 조합 시스템 두 모드 | §2.1 |
| 3 | 소유 시스템 · 전설 · PvP | §2.2, §2.3, §0 |
| 3-1 | 획득 · 희귀도 · 심장 사용 | §2.3 |
| 4 | 속성 6 · 변환 법칙 21 · 명명 방식 | §3.1, §3.2, §4.1 |
| 4-1 | 전투 루프 · 특수능력=21법칙 | §2.4, §9-5 |
| 4-2 | 스탯 파생 | §4.2 |
| 4-3 | 공명 · 종족 변주 | §2.5, §5 |
| 4-4 | 밸런싱 일정 | §10 |
| 4-5 | result_class 34 · 색 체계 | §3.3 |
| 5 | 세계관 · 배경 · 시대 | §6.1, §7.1 (서술 근거는 설계서) |
| 5-1 | 기본 카드 52 (①~⑤) | §3.1 |
| 5-2 | 해커톤 요건 · 일정 · 스코프 방침 | §0, §1 |
| 5-3 | 데이터 스키마 | §3 |
| 6 | 용어집 | §7.1 |
| 6-1 | 톤 · 카드 텍스트 규칙 | §7.3 |
| 7 | 여섯 옛 신 · 칭호 | §7.2 |
| 8 | 종족 3종 | §5 |
| 8-1 | 장비 45 · domain | §4.3 |
| 8-2 | 적 42 | §6.2 |
| 8-3 | 이벤트 6유형 | §6.3 |
| 9 | 시스템 슬롯 매핑 | §5, §4.3 (장비=패시브), §6.3 (조력=FICTOR) |
| 10 | 조합 트리 구조 | §3.4 |
| 11 | 아트 디렉션 · 프롬프트 템플릿 | §8.2, §8.5 |
| 11-1 | 여섯 터 시각 사양 | §6.1, §8.3 |
| 12 | 크레딧 예산 | §8.1 |
| 13 | 실행 계획 | §1, §8.6 |
| 14 | 미결 사항 | §10 |
| 15 | 확인 사항 | §11 |

**설계서에만 있고 이 문서에 없는 것:** 세계관 서술 · 결정 근거 · 대안 검토 · 리서치 인용.
구현에 불필요하나 **버리지 말 것.** 확장 · 마케팅 · 피치 자료의 원본이다.
