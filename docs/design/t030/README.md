# T030 발견 결과 UI 시각 QA

- 기준 디자인: [`../t029/forge-codex-concept.png`](../t029/forge-codex-concept.png)
- 검증 surface: Chrome Browser plugin, `http://127.0.0.1:5174/`
- CSS viewport override: 1536×900. extension screenshot backend 산출물은 1354×900 JPEG다.
- 캡처: [`burning-desktop.jpg`](burning-desktop.jpg),
  [`revealing-desktop.jpg`](revealing-desktop.jpg), [`printing-desktop.jpg`](printing-desktop.jpg),
  [`final-desktop.jpg`](final-desktop.jpg),
  [`reduced-motion-final-desktop.jpg`](reduced-motion-final-desktop.jpg)

`reduced-motion-final-desktop.jpg`는 reduced motion이 처음부터 사용하는 공통 static FINAL DOM의 시각
증거다. no-wait와 실행 중 media-query ON→FINAL, OFF 후 non-replay 동작은
`tests/presentation/discovery.test.tsx`의 matchMedia 회귀 테스트로 별도 검증한다.

## 단계와 상호작용

| 단계 | 관찰 |
|---|---|
| BURNING | 재료 두 도판만 남고 결과 자리는 비어 있다. 건너뛰기 control이 보인다. |
| REVEALING | 재료가 옅어지고 FICTOR card back이 Y축으로 뒤집힌다. |
| PRINTING | 결과 도판이 앞면으로 보이고 이름·효과 문구가 찍힌다. |
| FINAL | 재료 둘, 결과 이름, 효과, 도감 기록, 수명, native `계속`이 한 화면에 모두 보인다. |
| reduced motion | 공통 FINAL을 첫 paint부터 사용하며 3초 timer를 만들지 않는다. |

FINAL Browser 측정은 overlay `clientWidth=scrollWidth=1536`,
`clientHeight=scrollHeight=900`으로 수평·수직 overflow가 없었다. `계속`이 active element였다. 닫은 뒤
game main은 `inert=false`, `aria-hidden` 없음이고 문서 `clientWidth=scrollWidth=1536`, active element는
현재 화면의 H1이었다. console warning/error는 0이었다.

## T029 token fidelity ledger

| 비교 지점 | 기준 | T030 판정 |
|---|---|---|
| palette | 냉청 underlay, 상아 기록지, 청록 ink, rust CTA | 동일 CSS token을 재사용했다. |
| recipe anatomy | 재료 2장 → canonical 결과 | 재료 둘과 결과를 한 stage에서 유지했다. |
| asset treatment | 실제 판화 도판, 작은 크기에서도 실루엣 유지 | T022/T029 canonical art와 재료 fallback만 사용했다. |
| typography | 기록체 serif, control은 명시 크기 | 기존 Georgia/Noto Serif KR stack과 button token을 유지했다. |
| container model | 이중 선 기록지와 얇은 divider | overlay도 double border paper record 한 겹만 쓴다. |
| irreversible feedback | 비용·수명이 사용자에게 명확함 | FINAL에 즉석/공방 수명을 표시한다. |
| focus/underlay | modal 중 game 조작 불가, 종료 후 focus 복구 | FIRST만 inert/aria-hidden이며 Continue 뒤 H1로 복구됐다. |
| reduced motion | motion을 정보 접근의 전제조건으로 만들지 않음 | static FINAL에 모든 정보와 native Continue가 있다. |

Above-the-fold 허용 문구는 단계 상태, `빚기 기록`, `새 제법 발견`, 두 재료명, canonical 결과명·효과,
도감 기록 문장, mode 수명, `연출 건너뛰기`, `계속`으로 제한했다. T029에 없는 통화, 수치, 새 행동,
Heart 빚기 affordance는 추가하지 않았다. 승인된 T029의 레시피 구조와 token에서 남은 의도적 차이는
공방/도감 전체 surface가 아니라 성공 직후 한 결과에만 집중하는 modal이라는 점이다.
