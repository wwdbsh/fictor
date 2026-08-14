# FICTOR 로컬 저장 스키마 v1

## 범위와 수명

저장 키는 `fictor.save.v1` 하나다. 브라우저 `localStorage`와 같은 `StorageLike`를 주입하며 서버, 계정, 동기화, 사용자 식별 정보는 사용하지 않는다. 한 번의 `setItem`으로 envelope 전체를 교체하는 것이 프로토타입의 원자성 경계다.

- `profile`은 런을 넘어 유지되는 도감 레시피, 소유한 신의 심장, 기능 플래그만 담는다.
- `run`은 현재 런의 연료, 카드 인스턴스, 덱, 전투 투영을 담는다.
- 새 런은 저장된 run을 재사용하지 않고 호출자가 주입한 엄격한 starter의 run 전체로 교체하며 profile은 유지한다.
- run 투영에는 ForgeRuntime의 `profile`을 저장하지 않는다. 로드 때 검증된 영구 profile을 주입하고 `decodeForgeRuntimeState`로 재검증한다.

애플리케이션 명령 API는 외부 reducer 결과를 받지 않는다. 현재 `GameSession.runtimeState`와 raw command/context를 `reduceForgeRuntime`에 직접 전달한다. 성공한 전이만 메모리 상태와 profile 발견에 적용해 저장하며 `FORGE_REJECTED` 또는 `COMMAND_REJECTED` 결과는 저장하지 않는다.

## 정확한 v1 형식

```ts
interface SaveEnvelopeV1 {
  schemaVersion: 1;
  saveRevision: number; // 저장 계보용 safe integer. ForgeRuntime revision과 별개다.
  profile: {
    schemaVersion: 1;
    discoveredRecipeIds: string[];
    ownedHeartIds: Array<
      | "heart__still" | "heart__burn" | "heart__scatter"
      | "heart__rot" | "heart__wash" | "heart__join"
    >;
    featureFlags: { heartForge: false };
  };
  run: {
    schemaVersion: "forge-runtime-state-v1";
    engineVersion: "forge-runtime-engine-v1";
    resolverVersion: "canonical-v1";
    sourceHash: "7e05e02b3db844ccba7806067e196d0e4477ea4f7ce2c661440ea3820d87d720";
    revision: number; // ForgeRuntime 도메인 revision
    run: ForgeRuntimeStateV1["run"];
  };
}
```

모든 profile 객체, 배열, `featureFlags`는 허용된 키의 plain own data property만 받는다. 접근자, symbol, sparse 배열, 사용자 정의 prototype, 순환 참조, 안전하게 반사할 수 없는 Proxy는 `INVALID`다. 디코더는 descriptor를 한 번 읽어 만든 동일 스냅샷으로 검증과 반환을 모두 수행하므로 입력 별칭을 보관하지 않는다.

레시피와 심장 배열은 정렬된 고유 집합이다. 레시피는 `lowMaterialId|highMaterialId` 형식이며 최대 1,326개다. 심장은 획득 기록만 제공하고 소비나 심장 빚기 명령은 없다. `heartForge`는 반드시 literal `false`이며 누락이나 `true`는 알려진 v1 profile의 손상이다.

## 주입 카탈로그와 문자열 경계

저장 어댑터 생성 시 다음 검토 카탈로그를 주입한다.

- 공식 ForgeRuntime `sourceHash`
- `recipeId → canonical result cardId` 쌍
- 허용된 card, enemy, intent ID 집합
- 허용된 전투 표시 문자열의 정확한 집합

카탈로그는 생성 즉시 descriptor 기반으로 복제하고 공식 source hash에 묶는다. 반사 오류의 원문은 외부로 노출하지 않고 일반 `TypeError`만 발생시킨다. production 런타임은 source/generated 데이터 파일을 import하지 않는다.

저장되는 모든 instance ID는 1~128자의 ASCII 영숫자로 시작하고 이후 영숫자, `_`, `-`만 허용한다. `@`는 허용되지 않는다. 소유 카드, 전투 카드/인스턴스, 덱과 zone, 격리 재료, 즉석 결과를 모두 검사한다. enemy/intent ID와 `labelKo`는 각각 주입 집합에 정확히 있어야 한다. 즉석 결과의 `recipeId`와 `cardId`는 독립 집합 확인이 아니라 주입된 정확한 recipe-card 쌍과 일치해야 한다. 따라서 이메일 형태 instance/label, 미검토 텍스트와 ID, 잘못 짝지은 recipe/card는 저장되지 않는다.

## VALID, INVALID, UNSUPPORTED

외곽 envelope, profile, run은 단계별로 분류한다.

- `VALID`: 현재 버전과 모든 구조/카탈로그 검증을 통과한다.
- `INVALID`: 현재라고 표시된 알려진 v1이지만 필드, 값, 키, 순서 또는 참조가 손상됐다. 알려진 outer v1에서 profile만 INVALID이면 기본 profile과 유효한 run을 사용하고, run만 INVALID이면 유효한 profile과 starter run을 사용한다. 이 부분 복구 상태는 같은 `saveRevision`에서 정상 저장할 수 있다.
- `UNSUPPORTED`: outer `schemaVersion`이 1이 아니거나, 중첩 profile `schemaVersion`이 1이 아니거나, run의 schema/engine/resolver/source version 값이 현재 상수와 다르다. profile 또는 run 하나라도 UNSUPPORTED이면 둘 다 메모리에서 기본 profile/starter로 안전 초기화하고 쓰기를 차단한다.

버전 필드가 누락되거나 현재 버전 내부 값이 malformed인 경우는 UNSUPPORTED가 아니라 INVALID다. 과거/미래 버전 자동 마이그레이션은 없으며 이 프로젝트 이전에는 legacy 저장 스키마가 없다.

잘못된 JSON, `null`, 배열, 외곽 키나 revision 손상도 기본 profile/starter로 안전 초기화한다. 해석할 수 없거나 UNSUPPORTED인 원본 바이트는 그대로 보존한다. 오직 명시적인 `reset(starter)`만 새 v1 envelope로 교체할 수 있다.

## 실패, 동시성, reset

`getItem`과 `setItem` 예외는 외부로 던지지 않고 내용 없는 `READ_FAILED`, `WRITE_FAILED` 코드로 반환한다. quota 실패를 포함해 저장 실패 시 성공한 게임 전이의 메모리 상태는 유지하지만 `persisted: false`이며 저장되었다고 표시하지 않는다.

저장 직전에 현재 envelope의 `saveRevision`을 다시 읽고 호출자가 로드한 revision과 다르면 `STALE_WRITE`다. 이는 단일 탭 중심 best-effort 충돌 탐지이며 `localStorage`에는 완전한 compare-and-swap이 없으므로 다중 탭 쓰기를 완전히 직렬화하지 않는다.

reset도 현재 바이트를 먼저 읽는다. 알려진 outer envelope이면 현재 `saveRevision + 1`을 사용하므로 reset 전 세션이 같은 숫자로 되살아나는 ABA를 막는다. safe integer 최댓값에서는 `REVISION_EXHAUSTED`, 읽기 실패에서는 `READ_FAILED`로 reset을 거부한다. 외곽이 손상됐거나 지원하지 않는 버전은 그 상태에서 로드한 세션 자체가 write-blocked이므로 명시적 reset이 새 revision 계보를 0에서 만들 수 있다.

게임 진행 롤백이나 public remove API는 제공하지 않는다. reset은 도감, 심장, 런을 모두 초기화하는 복구 불가능한 교체이므로 UI에서 별도 확인이 필요하다. payload에는 자유 텍스트, 이름, 이메일, 토큰, 기기 식별자 등 PII를 넣지 않는다.
