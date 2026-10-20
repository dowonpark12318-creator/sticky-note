# Corner Note 스토어 등록 자료

이 묶음은 `DowonPark.CornerNote`의 Microsoft Store 등록에 사용할 소개문·이미지·정책·심사 안내입니다. 앱 가격은 **무료**, 게시자는 **Dowon Park**, 공개 지원 연락처는 **dowonpark12318@gmail.com**입니다. AI 번역은 사용자의 OpenAI API 키가 필요하며 API 사용료는 별도입니다.

## 먼저 읽을 파일

1. `submission-guide.ko.md`: Partner Center에서 항목을 입력하는 순서
2. `readiness.md`: 제출 전에 게시자가 직접 마쳐야 하는 확인 사항
3. `PACKAGE-MANIFEST.json`: 실제 파일 해시, 촬영한 소스 커밋과 Store MSIX 다운로드 주소

이 자료를 만들었다고 Store에 제출되거나 승인된 것은 아닙니다. 실제 제출과 심사 결과는 Partner Center에서 확인합니다.

## 등록 항목과 파일 연결

| Partner Center 항목 | 사용할 자료 |
| --- | --- |
| 패키지 | `PACKAGE-MANIFEST.json`의 `storePackage.downloadUrl`에서 해당 `CornerNote-Store-x64.msix` 다운로드 |
| 가격 | Free / 무료 |
| 카테고리 | Productivity / 생산성 |
| 제품 이름 | Partner Center에서 이미 예약한 정확한 표시 이름을 선택. 번역된 이름을 새로 쓰려면 먼저 예약 |
| 언어별 설명·짧은 설명·기능·검색어 | `locales/<언어>.md` 또는 같은 이름의 `.json` |
| 첫 제출의 새로운 기능 | 빈칸 유지. `releaseNotesForFuture`는 향후 업데이트에만 사용 |
| 스크린샷 | `assets/screenshots/<언어>/`의 PNG 4개 |
| 스크린샷 캡션 | 언어별 JSON의 `screenshotCaptions` |
| 300×300 앱 타일 아이콘 | `assets/StoreLogo-300.png` |
| 개인정보처리방침 | 아래 공개 URL 또는 `privacy/`의 원문 |
| 지원 연락처 | dowonpark12318@gmail.com |
| 실시간 생성형 AI 선언 | 사용함. `declarations.json`과 심사 안내 참고 |
| 심사 참고사항 | `certification-notes.en.md` 또는 `certification-notes.ko.md` |

`listings.json`은 10개 언어의 자료를 한 파일로 묶은 JSON입니다. Partner Center의 공식 CSV 가져오기 파일은 아닙니다. 문서와 JSON의 각 값을 해당 입력란에 복사해 사용하세요.

## 포함한 언어와 이미지

언어 폴더는 `en-US`, `ko-KR`, `ja-JP`, `zh-Hans`, `zh-Hant`, `es`, `fr`, `de`, `pt`, `it`입니다. 폴더마다 다음 네 장을 순서대로 올립니다.

1. `01-writing.png`: 메모 작성과 색상·크기
2. `02-overlapping-notes.png`: 실제로 겹쳐 놓은 여러 메모
3. `03-folding-guide.png`: 앱 안의 접기·펼치기 안내
4. `04-ai-settings.png`: 개인 API 키를 사용하는 AI 연결 설정

이미지는 실제 Windows 데스크톱과 앱을 촬영합니다. 마케팅 문구를 덧씌우거나 AI 결과를 꾸며 넣지 않습니다. 최소 1366×768 PNG이며, `assets/screenshots/provenance.json`에 촬영 환경·언어·샘플 메모·파일 해시가 기록됩니다. 샘플 메모는 촬영을 위해 만든 가상 내용입니다. API 키와 사용자 메모는 포함하지 않습니다.

## 공개 URL

- 영문 개인정보처리방침: https://github.com/dowonpark12318-creator/sticky-note/blob/codex/windows-test-build/store/listing/privacy/privacy-policy.en.md
- 한국어 개인정보처리방침: https://github.com/dowonpark12318-creator/sticky-note/blob/codex/windows-test-build/store/listing/privacy/privacy-policy.ko.md
- 영문 지원 안내: https://github.com/dowonpark12318-creator/sticky-note/blob/codex/windows-test-build/store/listing/support.en.md

위 주소는 공개 GitHub 문서입니다. 제출 전에 로그인 없이 열리는지, 게시자와 지원 연락처 및 실제 데이터 처리에 맞는지 확인하세요. 개인정보처리방침 원문은 영어·한국어로 제공하며 앱의 나머지 UI 언어로 번역된 정책을 포함한다고 주장하지 않습니다.

## 제출 전에 직접 마칠 일

- IARC 설문을 실제 기능에 맞게 작성하고 결과를 생성합니다. 이 자료가 연령 등급이나 인증서를 대신하지 않습니다.
- Windows App Certification Kit 결과를 실행·검토하고 지적 사항을 해결합니다.
- 실제 OpenAI API 요청과 요금·오류 동작을 확인합니다. 자동 테스트와 촬영은 실제 API를 호출하지 않습니다.
- 심사팀에 AI 기능 검증용 접근 수단이 필요하면 제한된 테스트용 자격정보를 적절한 비공개 제출 경로로 준비합니다. 실제 키를 이 ZIP, 공개 문서, 스크린샷이나 채팅에 넣지 마세요.
- 지역별 법적·사업자 관련 입력과 배포 국가를 확인하고, 정책·지원 안내에 적힌 운영 약속을 검토합니다.

MSIX는 **서명 전 Store 제출용**입니다. 일반 PC에서 더블클릭 설치하려면 별도의 신뢰된 서명이 필요합니다. Partner Center는 제출 파일을 심사한 후 Store 배포본에 서명합니다. 직접 앱을 사용해 보려면 별도로 배포한 포터블 ZIP을 모두 압축 해제해 실행하세요.
