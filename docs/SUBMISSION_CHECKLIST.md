# 제출 체크리스트

제출 직전에는 공식 [참여 페이지](https://openaigame2026.com/)의 최신 안내와 실제 폼을 함께 확인합니다. Track 1 공개 접수 기간은 2026-08-04–2026-08-26입니다. 정확한 cutoff와 마감 후 제출 정보 수정·URL 교체 가능 여부는 UNKNOWN이지만 FICTOR는 이에 의존하지 않습니다. 현재 산출물은 `DRAFT_NON_SUBMITTABLE`이며 실제 폼 입력·제출을 의미하지 않습니다.

## 제출 전

### 팀·일정

- [ ] 팀원이 3명 이하인지 확인합니다.
- [ ] 대표자 1명과 본선 서울 행사 참석 가능 여부를 확정합니다.
- [ ] 2026-08-26 접수 기간 안에 여유를 둔 제출 계획을 세웠습니다. UNKNOWN인 정확한 cutoff를 일정 보증으로 사용하지 않습니다.
- [ ] 기존 프로젝트라면 기존 범위와 챌린지 기간에 새로 개발·개선한 범위를 구분해 적습니다.

### T061 B-06 비의존 운영 gate

- [x] [T061 공식 근거 기록](decisions/t061-submission-edit-policy-evidence-2026-08-24.md)에 2026-08-24 기준 FAQ·참가 약관의 공개 근거와 사실/운영 가정을 분리했습니다.
- [x] 마감 전에는 완전한 수정본을 다시 제출할 수 있고, 운영진은 원칙적으로 가장 최신에 제출된 버전을 기준으로 확인할 예정임을 확인했습니다. 최신본 사용·대체 보장은 아니며 개별 폼 필드 편집 가능 여부도 열거되지 않았습니다.
- [x] 제출 후에는 동일한 제출 URL에서 게임 콘텐츠를 업데이트할 수 있음을 확인했습니다. 늦은 변경이 심사에 반영된다는 보장은 없고 링크는 계속 플레이 가능해야 합니다.
- [x] 정확한 cutoff는 `UNKNOWN / NOT_DEPENDED_ON`, 마감 후 폼 수정과 URL 교체는 `UNKNOWN / NOT_REQUIRED / OUT_OF_SCOPE`로 보존했습니다.
- [x] `B06_OPERATIONALLY_CLOSED_WITH_UNKNOWN_CUTOFF_AND_NO_LATE_MUTATION_DEPENDENCY`가 정책 PASS·법률 보증·운영 보증이 아님을 기록했습니다.
- [x] [repository-safe 폼 필드 초안](submission/track1-form-field-draft.md)을 `REPO_SAFE_STATIC`·`FINAL_CANDIDATE_BOUND`·`OWNER_LIVE_ENTRY`로 분류했습니다.
- [x] [완성 프로젝트 데모 프리프로덕션](submission/track1-demo-preproduction.md)에 storyboard·script·shot checklist와 final-only binding을 작성했습니다.
- [x] 상헌 님이 T061 local-only 산출물의 complete와 PR #119 merge를 별도로 승인했고, PR #119가 merge됐습니다.
- [x] exact candidate `f434656cdf3fce0fa35e8598169da6b678cdf627`의 직접 플레이는 수행하지 않았습니다. 상헌 님은 이를 `OWNER_DIRECT_PLAY_NOT_PERFORMED_TIMEBOX_WAIVED_FOR_INITIAL_SUBMISSION`으로 수용했으며 playtest PASS나 `NO_CHANGE_REQUIRED`로 표현하지 않습니다.
- [x] waiver 뒤 gameplay·content·data·build config·lockfile·art byte 변경 없이 candidate를 동결했습니다.
- [x] 상헌 님이 `2026-08-25T11:59:10Z`에 exact candidate와 submission-first amendment를 승인해 T062를 시작했습니다.

### T046 공개 차단 gate

- [x] [T046 공개 직전 감사](legal/t046-release-audit-2026-08-22.md)에서 실제 PNG 625장, 폰트·미디어, 배포 OSS와 폴백 inventory를 대조했습니다.
- [ ] 생성 당시 Higgsfield 계정 적용 Terms·Privacy revision과 조기 동의 여부를 확인했습니다.
- [ ] 요청 `nano_banana_2` 대 provider 보고 `nano_banana_flash`의 관계와 supplemental policy를 확인했습니다. 해소 전 공개 AI 표기에 모델명을 넣지 않습니다.
- [x] [T055 blocked audit](legal/t055-account-model-rights-blocked-audit-2026-08-24.md)에 production 622개 path·SHA 구조 gap 0, secret-free account 관찰, substantive gap 6과 `completionEligible=false`를 기록했습니다. 이 항목은 위 두 권리 확인 checkbox를 완료시키지 않습니다.
- [x] [T055 소유자 release-risk disposition](legal/t055-owner-release-risk-disposition-2026-08-24.md)을 immutable blocked audit와 exact release digest에 결속했습니다. T055의 개정 계약상 disposition만 수용하며 권리 검증·법률 보증·T047 공개 release·배포·출품·provider/유료 호출 승인이 아닙니다. 위 두 권리 확인 checkbox는 계속 미완료입니다.
- [x] [T056 공개 명칭 source register](legal/t056-b03-naming-screening-2026-08-23.md)와 [T057 비결정 자료](decisions/t056-b03-naming-decision-brief-2026-08-23.md)에 20개 대상의 공식 원장·스토어 관찰, 후보와 조사 한계를 기록했습니다.
- [ ] T047에서 T057의 exact 공개 명칭 결정과 기록된 잔여 상표 위험 수용을 release 판단에 결속했습니다.
- [x] [T057 공개 명칭 결정](decisions/t057-public-naming-decision-2026-08-24.md)에서 타이틀·종족·옛 신 20개의 exact 공개 명칭과 기록된 잔여 위험 수용을 명시적으로 결정했습니다.
- [x] [T060 packaging 기록](asset-runs/t060-release-packaging-2026-08-22.md)에 따라 `style/master-candidate-01`만 production에 포함하고 `NOT_SELECTED` 후보 02–04는 원본·backup·provenance를 보존한 채 build 입력과 `dist`에서 제외했습니다.
- [x] [T059 법적 고지 기록](legal/t059-oss-mit-notices-2026-08-24.md)에 따라 lockfile 버전·원문 SHA·canonical MIT block을 입력과 staging에서 검증했고, 게임의 접근 가능한 고지 링크를 확인했습니다. exact production `dist` 포함 여부는 T062에서 재검증합니다.
- [x] [T058 AI 제작 고지 승인](decisions/t058-ai-disclosure-approval-2026-08-24.md)의 exact 문구를 게임 크레딧, README, [canonical Track 1 제출 설명](submission/track1-description.ko.json), `ASSET_LICENSES.md` 네 위치에 적용하고 byte 기준으로 대조했습니다. 이는 B-02/T058 준비만 완료하며 권리 확인과 T047 release를 완료하지 않습니다.

### 실행 링크

- [x] race selection과 gameplay 상태에서 `제3자 라이선스 고지` native link가 각각 정확히 하나이고, `/fictor-test/` BASE_URL 하위 href와 keyboard focus-visible을 focused test로 확인했습니다.
- [x] [T062 production 재감사](legal/t062-production-reaudit-2026-08-25.md)에서 exact production `dist`의 법적 고지, PNG 622개, 미선택 후보 absence와 전체 artifact SHA를 확인했습니다. T062 완료는 독립 review blocker 0건과 PR CI 성공을 모두 요구합니다.

- [x] exact candidate의 정적 production build와 시작→보상→공방→보스→완주·reload save smoke가 PASS했습니다.
- [ ] 심사 기간 내 링크가 공개 상태이고 별도 승인·설치 없이 접근됩니다.
- [ ] 제출 뒤에도 같은 URL이 유지되며, URL 교체 가능성을 전제로 하지 않습니다.
- [ ] 로그인 없이 플레이할 수 있습니다. 로그인이 필요하면 만료되지 않는 테스트 계정과 접속 안내를 제공합니다.
- [ ] 심사위원이 다른 계정·기기에서도 링크를 열어 핵심 플레이를 완료할 수 있습니다.
- [ ] 조작법, 실행 방법, 필요한 키보드·마우스 입력을 링크 주변 설명에 적었습니다.
- [ ] 모바일/데스크톱 등 대상 환경에서 새 시크릿 창으로 링크를 테스트했습니다.
- [ ] 링크에 API 키, 비밀번호, 토큰, 내부 주소나 개인정보가 노출되지 않습니다.

### 폼 항목과 파일

- [ ] required 게임 제목 source가 `src/content/public-names.ts`의 `FICTOR · 픽토르`이며 DOM `maxlength=80` 이내입니다. 최종 폼 반영은 T051 승인 뒤에만 완료합니다.
- [x] [폼 필드 초안](submission/track1-form-field-draft.md)에 위 canonical title source와 12/80 Unicode code-point 검사를 기록했습니다.
- [x] required 게임 소개는 [canonical Track 1 제출 설명](submission/track1-description.ko.json)의 `description_ko`를 사용하며 200자 이내임을 초안에서 확인했습니다. 실제 제출 폼 반영은 아직 하지 않았습니다.
- [ ] required 플레이 가능한 URL이 심사 기간에 접근됩니다.
- [ ] required 썸네일이 file input의 JPEG/PNG accept에 맞습니다. UI recommendation인 16:9·최대 10MB도 따랐습니다.
- [x] 공식 optional 데모 URL을 owner-required 품질 산출물로 결정했습니다. URL은 완성 프로젝트 capture·upload 뒤 T048에서만 채웁니다.
- [x] optional Codex 서술의 exact draft가 DOM `maxlength=5000` 이내이며 사용 위치·기능·해결한 문제·사람의 결정을 설명합니다. T048에서 final candidate와 다시 대조합니다.
- [ ] Google login/account, 국가, 생년월일, 신청자·팀·연락처, 참석·동의 항목을 라이브 폼에 직접 입력했습니다.
- [ ] 폼 개인정보·화면·network payload를 캡처하거나 저장소에 커밋하지 않았습니다. 제출 완료 증거도 PII 없는 receipt/reference만 보관합니다.

### 권리·안전·기록

- [x] [에셋 라이선스 기록](ASSET_LICENSES.md)에 T046 기준 이미지·오디오·폰트·데이터·AI 생성물·오픈소스 inventory와 현재 blocker를 기록했습니다.
- [ ] 상업적/공개 제출에 필요한 라이선스, 출처, 허가 증빙을 보관했습니다.
- [ ] 타인의 저작권·상표권·초상권·개인정보·영업비밀을 침해하지 않습니다.
- [ ] 저장소·빌드·영상·브라우저 개발자 도구에 비밀값이 남아 있지 않습니다.
- [ ] [Codex 사용 기록](CODEX_USAGE_LOG.md)에 날짜, 목표, Codex 사용, 결과, 해결 문제, 사람의 결정, 증거/커밋, 새 작업 여부를 기록했습니다.
- [ ] Codex 개발 사용 사실을 제출 자료에서 설명할 수 있습니다. 런타임 OpenAI API 연동은 필수가 아닙니다.

## 본선 진출 시

- [ ] 2026-08-28–2026-08-30 발표 기간에 등록 이메일과 스팸함을 확인합니다.
- [ ] 대표자 1명의 서울 현장 참석, 신분·연락처, 이동 계획을 확정합니다.
- [ ] 동일한 링크와 테스트 계정으로 현장 시연을 리허설합니다.
- [ ] Track 1 핵심 플레이, 제작 과정, Codex 협업, 사람이 내린 결정을 최대 3분 안에 설명할 발표를 준비합니다.
- [ ] 행사장·출입·장비·네트워크 안내를 공식 공지로 확인합니다. 정확한 장소는 공개 전까지 추정하지 않습니다.
- [ ] 원본 프로젝트, 백업 빌드, 로컬 시연본, 라이선스 증빙을 오프라인/온라인으로 각각 준비합니다.
- [ ] Track 2 참여 자격이 본선 진출팀 대표자 1명에게만 있음을 확인합니다.
- [ ] Track 2 당일 주제, 5시간 빌드·제출 방식, 현장 투표 안내를 현장에서 확인합니다.
- [ ] 수상 시 공모전 종료 후 4개월 우선협상권과 30영업일/30일 협상 절차를 팀 전체가 이해합니다.

## 제출 기록

- 제출 일시(KST): `YYYY-MM-DD HH:MM`
- 제출 링크: `https://…`
- 제출 완료 증거: `PII 없는 receipt/reference만; 폼 화면·payload 캡처 금지`
- 문의가 필요한 사항: `없음 또는 질문`
