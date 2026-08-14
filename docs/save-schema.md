# FICTOR 로컬 저장 스키마 v1

## 범위와 수명

저장 키는 `fictor.save.v1` 하나다. 브라우저 `localStorage`와 같은 `StorageLike`를 주입하며 서버, 계정, 동기화, 사용자 식별 정보는 사용하지 않는다. 한 번의 `setItem`으로 v1 envelope 전체를 교체하는 것이 프로토타입의 원자성 경계다.

- `profile`: 런을 넘어 유지된다. 도감 레시피, 소유한 신의 심장, 기능 플래그만 저장한다.
- `run`: 현재 런의 연료, 카드 인스턴스, 덱, 전투 투영을 저장한다. 새 런에서는 저장값을 재사용하지 않고 호출자가 주입한 엄격한 starter의 `run` 전체로 교체한다.
- `run` 투영에는 ForgeRuntime의 `profile`을 저장하지 않는다. 로드 때 검증된 영구 프로필을 주입한 뒤 `decodeForgeRuntimeState`로 다시 검증한다.

## 정확한 v1 형식

```ts
interface SaveEnvelopeV1 {
  schemaVersion: 1;
  saveRevision: number; // 0 이상의 safe integer, 저장 성공마다 1 증가
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
    revision: number; // ForgeRuntime 도메인 revision. saveRevision과 별개다.
    run: ForgeRuntimeStateV1["run"];
  };
}
```

모든 객체는 명시된 키만 허용한다. 레시피와 심장 배열은 정렬된 고유 집합이어야 한다. 레시피는 `lowMaterialId|highMaterialId` 형식이며 최대 1,326개다. 저장 어댑터 생성 시 검토된 `allowedRecipeIds`와 `allowedCardIds`를 배열 또는 Set으로 주입한다. 어댑터는 이를 즉시 복제하고, 프로필 레시피와 런의 소유/전투/즉석 결과 카드 및 레시피 참조를 allowlist에 대조한다. 애플리케이션은 reducer가 돌려준 발견 레시피와 기존 도감을 집합 합집합 후 정렬한다. 허용되지 않은 ID는 저장 가능한 상태로 정규화하지 않고 적용을 거부한다.

심장은 획득 기록만 제공하며 소비나 심장 빚기 명령은 없다. `heartForge`는 누락되거나 `true`이면 프로필 전체가 유효하지 않다.

## 로드, 손상, 버전

- 키가 없으면 기본 프로필과 주입 starter로 시작하며 정상적으로 첫 저장할 수 있다.
- 알려진 v1 envelope에서 프로필만 손상되면 기본 프로필과 유효한 런을 사용한다. 런만 손상되면 유효한 프로필과 starter 런을 사용한다.
- 잘못된 JSON, `null`, 배열, 외곽 키/리비전 손상은 메모리에서 기본 프로필과 starter로 안전 초기화한다.
- 과거, 미래, 알 수 없는 schema version에는 자동 마이그레이션이 없다. 이 프로젝트 이전에는 legacy 저장 스키마가 존재하지 않는다.
- 해석할 수 없는 기존 바이트와 지원하지 않는 버전은 그대로 보존하고 쓰기를 차단한다. 명시적인 `reset(starter)`만 v1으로 덮어쓴다.
- 디코더 결과는 분리 복제본이다. 호출자 입력이나 파싱 객체의 별칭을 보관하지 않는다.

## 실패, 동시성, 롤백

`getItem`, `setItem`, `removeItem` 예외는 외부로 던지지 않고 `READ_FAILED`, `WRITE_FAILED`, `REMOVE_FAILED`처럼 내용 없는 코드로 반환한다. quota 실패를 포함해 저장 실패 시 애플리케이션의 진행된 메모리 상태는 유지하지만 `persisted: false`를 반환하며 저장되었다고 표시하지 않는다.

저장 직전에 현재 envelope의 `saveRevision`을 다시 읽고 호출자가 로드한 revision과 다르면 `STALE_WRITE`를 반환한다. 이는 단일 탭 중심의 best-effort 충돌 탐지이며 브라우저 `localStorage`에는 완전한 compare-and-swap이 없으므로 다중 탭 동시 쓰기를 완전히 직렬화하지 않는다. safe integer 최댓값에서는 `REVISION_EXHAUSTED`로 저장을 거부한다.

게임 진행 롤백 API는 제공하지 않는다. 명시적 reset은 도감, 심장, 런을 모두 초기화하며 복구 불가능한 교체이므로 UI에서 별도 확인을 붙여야 한다. 저장 payload에는 자유 텍스트, 이름, 이메일, 토큰, 기기 식별자 등 PII를 넣지 않는다.
