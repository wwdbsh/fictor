# T030 발견 연출·에셋 로딩 성능 증거

- Issue: #32
- 승인 contract SHA-256: `59497cfc44785a3bb0d66dcb9897ac9433d0207518222913af4118116d2209ca`
- 관찰일: 2026-08-15
- 정적 mount: `/fictor-test/`

## 로딩 경계

초기 화면은 현재 보이는 깊이 1 배경만 요청한다. preloader는 없으며 미래 깊이, 적, 사건, 도감의
미발견 도판을 요청하지 않는다. `AssetImage`는 현재 렌더된 primary 도판만 요청하고, 실패할 때만 정확히
한 번 fallback을 요청한다. 두 요청이 모두 실패하면 네트워크 재시도 없이 이름이 있는 CSS placeholder를
표시한다. 외부 protocol URL, protocol-relative URL, backslash, NUL, 상위 경로 순회는 `img src`에
들어가기 전에 fail-closed로 차단한다. primary가 차단되어도 안전한 local fallback은 한 번만 허용한다.

브라우저에는 T022 audit JSON을 싣지 않는다. 대신
`src/presentation/assets/track1-asset-manifest.ts`의 현재 Track 1 고정 surface 13개만
T022 contract SHA와 manifest SHA에 고정한다. Node test가 원본 T022 record의 id/path/SHA-256/bytes 및
실제 public file byte 크기와 exact binding을 확인한다. canonical 결과 availability는 T029의 기존 T022
bitset 결속을 그대로 사용한다. 동적 `HAND`, `REWARD`, `DISCOVERY_RESULT` 슬롯은 T029 browser runtime
packet을 authority로 선언하며, 요청 PNG는 T022 present 또는 명시적 fallback이어야 한다. 발견 결과만
첫 재료 도판 뒤 named CSS placeholder를, 나머지 두 슬롯은 named CSS placeholder를 사용한다.

## 예산과 관찰값

| 항목 | 예산 | 2026-08-15 관찰 | 판정 |
|---|---:|---:|---|
| 초기 image request | 정확히 1 | 1 | PASS |
| 초기 asset raw bytes | ≤ 2,296,255 | 2,296,255 | PASS |
| 초기 non-current asset | 0 | 0 | PASS |
| production JavaScript raw bytes | ≤ 409,600 | 375,044 | PASS |
| production CSS raw bytes | ≤ 32,768 | 28,028 | PASS |

관찰 명령은 `npm run build` 뒤 `npm run smoke:static`이다. smoke는 외부/API/WebSocket 요청 0,
브라우저 error 0, failed response 0도 함께 확인했다. T022 정적 PNG 621개는 별도 무결성 단계에서
621/621 HTTP 200, `image/png`, SHA-256 일치였다. 이 전량 검사는 audit 검증이며 앱의 preload 동작이 아니다.
JS/CSS 예산 테스트는 `dist`의 모든 hashed 파일을 합산하지 않고 현재 `dist/index.html`이 고유하게 참조하는
`./assets/*.js`와 `./assets/*.css`만 존재 확인 후 합산한다. 따라서 stale 또는 동시 build 산출물은 예산에
혼입되지 않으며, 중복·누락 참조는 실패한다.

## 발견 연출 수명

FIRST presentation은 저장 성공 뒤에만 React local state로 생긴다. `BURNING` 0–899ms,
`REVEALING` 900–2099ms, `PRINTING` 2100–2999ms, `FINAL` 3000ms 이후를 각각 한 timer로 진행하고
phase cleanup과 `presentationId` guard를 둔다. `FINAL`은 자동으로 사라지지 않는 의도적 terminal state다.
완전한 결과 정보와 native `계속` 버튼을 제공해 사용자가 확인한 뒤 underlay lock을 해제한다. skip과
Escape는 이 FINAL로 바로 이동한다. reduced motion은 처음부터 FINAL이며, 실행 중 설정이 켜져도 FINAL로만
단조 이동하고 다시 꺼져도 연출을 재생하지 않는다.

REPEAT presentation은 timer, modal, `inert`, `aria-hidden`을 사용하지 않는 닫기 가능한 status toast다.
animation phase와 presentation은 save/profile/localStorage에 기록하지 않는다. reload smoke는 발견한 recipe
지식만 유지되고 연출은 재생되지 않음을 확인했다.

## smoke sequence

`instant FIRST(BURNING → REVEALING → PRINTING → FINAL → 계속) → Codex → reload → full run →
free workshop FIRST(BURNING → REVEALING → PRINTING → FINAL → 계속) → restart → same canonical paid
workshop REPEAT toast`

동일 recipe의 즉석/공방 결과 이름은 `굳은 서리꽃`으로 같았고 도감 수는 paid repeat 전후 모두 2였다.
REPEAT toast가 열린 동안 game underlay는 `inert=false`, `aria-hidden` 없음이었다.
