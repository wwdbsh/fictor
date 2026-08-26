# T050 공개 URL 고위험 QA 차단 기록

- Issue: #52
- 기록일: 2026-08-26
- 결과: `BLOCKED_BROWSER_MATRIX_AND_ISOLATION_UNAVAILABLE`
- 범위: T050 공개 URL의 실제 브라우저 수동 QA 사전 점검

## 권위 있는 운영 대상

운영 대상 식별자는 T049가 확정한 다음 튜플만 사용한다.

| 항목 | 값 |
|---|---|
| URL | `https://project-702iz-sandy.vercel.app/` |
| source | `f434656cdf3fce0fa35e8598169da6b678cdf627` |
| deploy | `dpl_EASQhMvfgBVw3U2sXSCuPLV5QtrC` |

브라우저 지원 계약은 README와 T045에 선언된 최신 Chrome, Edge, Firefox, Safari다.
T045의 Edge·Firefox·Safari 면제는 T045 병합에만 한정된 사용자 승인이다. 별도 Task인
T050의 공개 URL QA를 완료하거나 지원 브라우저 검증을 대체하지 않는다.

## 읽기 전용 사전 점검

2026-08-26에 실행 환경과 사용 가능한 제어 표면만 확인했다.

| 확인 | 관찰 결과 |
|---|---|
| browser-client inventory | Chrome 확장 프로필 1개만 노출됨 |
| 설치 앱 확인 | Google Chrome 설치 확인 |
| Safari 확인 | Safari 26.5.2와 `safaridriver` 설치 확인 |
| Edge·Firefox 확인 | 설치된 앱을 찾지 못함 |
| 실제 제어 표면 | Edge·Firefox·Safari에 연결된 제어 표면 없음 |
| Chrome 컨텍스트 | 기존 이름 있는 프로필이며 fresh/incognito/격리 상태를 증명하지 못함 |

위 확인은 인벤토리와 로컬 설치 상태를 읽는 데 그쳤다. 운영 URL을 열거나 게임플레이·내비게이션을
시작하지 않았고, 스크린샷·HAR·영상 및 secret을 포함할 수 있는 증거를 만들지 않았다.

## 중단 판정

다음 계약 조건이 모두 충족되지 않아 운영 QA 진입 전에 중단했다.

1. 지원 계약 전체인 실제 Chrome, Edge, Firefox, Safari 브라우저를 각각 조작하고 관찰할 수 있어야 한다.
2. fresh-profile E2E를 실행할 수 있어야 한다.
3. fresh profile과 별개인 incognito E2E를 실행할 수 있어야 한다.
4. 별도 계정·환경에서 로그인 없이 첫 실행부터 최종 보스까지 완주를 검증할 수 있어야 한다.

따라서 공개 URL 로드, 첫 사용자 경로, 저장·복구, 전투·빚기·도감, 키보드·초점,
reduced motion, console/network 검사를 실행하지 않았다. T050의 어떤 acceptance criterion도
PASS로 판정하지 않으며 공개 QA 완료를 주장하지 않는다.

## 변경 금지와 문서 영향

- 배포 변경, 신청서 입력·전송, T051 이후 작업, 외부 provider·유료 호출, 새 이미지 생성을 수행하지 않았다.
- T048 제출 패키지의 동결된 leaf인 `SUBMISSION_CHECKLIST`는 갱신하지 않았다.
- 이번 체크포인트의 필수 문서 영향은 이 파일 하나뿐이다.
- 테스트·빌드는 실행하지 않았다. 이 기록은 실행 검증 결과가 아니라 preflight 차단 근거다.

## 잔여 위험과 재개 조건

현재 증거로는 네 지원 브라우저의 운영 동작, 브라우저별 렌더링·입력 차이, 깨끗한 저장 상태에서의
첫 사용자 경로를 판단할 수 없다. 기존 Chrome 프로필로 진행하면 캐시, 확장 기능, `localStorage`,
기존 인증·세션 상태가 결과를 오염시킬 위험이 있다.

실제 Chrome·Edge·Firefox·Safari 제어 표면, fresh-profile E2E 환경, 별개의 incognito E2E 환경,
별도 계정·환경의 로그인 없는 완주 환경이 모두 준비된 경우에만 재개한다. 상헌 님이 T050 계약 변경이나
면제를 승인해 재개하는 경우에는 생략되는 각 계약 항목을 개별적으로 명시해야 한다. 재개 시 이
체크포인트에서 T050만 다시 실행하며 T051 이후 범위로 넘어가지 않는다.

## 2026-08-26 소유자 계약 변경 — 기존 재개 조건 supersede

상헌 님은 위 exact production tuple에 한해서 다음 항목을 실제로 실행하지 않는 결정을
`OWNER_WAIVED_NOT_TESTED`로 승인했다.

1. Chrome, Edge, Firefox, Safari 각각의 실제 브라우저 QA
2. fresh-profile E2E
3. fresh profile과 별개인 incognito E2E
4. 별도 계정·환경에서 로그인 없이 첫 실행부터 최종 보스까지 완주
5. production gameplay 전반
6. network, console, asset 404와 secret 검사
7. `localStorage` 새로고침, 새 런과 schema migration 검사

승인 근거는 2026-08-26 Asia/Seoul의 상헌 님 지시인 “edge, firefox는 테스트하지 않을 거야.”,
“다른 항목들도 pass 처리하도록 해”, “OWNER_WAIVED_NOT_TESTED 로 진행하자”이다. 두 번째 지시는
실행하지 않은 검사를 PASS로 바꾸라는 뜻으로 기록하지 않고, 이어진 명시적 disposition에 따라 위 전
항목을 테스트하지 않은 채 잔여 위험을 수용하는 소유자 면제로 기록한다.

이 변경은 이 문서의 기존 preflight 관찰과 미실행 사실을 수정하지 않는다. T050의 원래 acceptance는
계속 **PASS 0**이며, `OWNER_WAIVED_NOT_TESTED`는 PASS, Chrome·Edge·Firefox·Safari 호환성 증명,
보안 또는 기능 증명, 공개 URL QA 완료 주장이 아니다. README에 선언된 지원 브라우저 범위도 줄이지
않는다.

이 절은 위 exact tuple에 한해 앞 절의 환경 준비 재개 조건을 supersede한다. URL, source, deploy 또는
결속된 artifact가 바뀌거나 상헌 님이 결정을 철회하면 면제는 즉시 무효화되며, 실제 공개 URL QA 또는
새 소유자 판단 없이는 T050을 완료할 수 없다. T051 이후 작업, 신청서 입력·전송, 배포 변경, 새 이미지
생성, 외부 provider·유료 호출은 이 승인에 포함되지 않는다.
