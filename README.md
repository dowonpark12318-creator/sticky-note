# 모서리 메모 · Corner Note

다른 앱을 쓰는 동안에도 보이는 Windows용 메모 앱입니다. 종이 모서리를 대각선으로 끌면 화면 구석에 접어 둘 수 있습니다.

## Windows에서 사용하기

테스트 실행 파일은 [GitHub Actions](https://github.com/dowonpark12318-creator/sticky-note/actions?query=branch%3Acodex%2Fwindows-test-build)의 **Windows test build** → **Artifacts** → **CornerNote-Windows-x64**에서 받을 수 있습니다. 빌드가 끝난 뒤 다운로드하며 GitHub 로그인이 필요합니다. 자세한 다운로드 절차와 직접 확인할 항목은 [Windows 테스트 가이드](WINDOWS-테스트.md)를 참고하세요.

`dist/CornerNote-Windows-x64.zip`을 **모두 압축 해제**하고 폴더 안의 `CornerNote.exe`를 실행하세요. Windows 10/11 x64용 포터블 앱입니다. 설치와 계정이 필요하지 않습니다. 실행 파일과 나머지 파일을 같은 폴더에 보관하세요.

- 메모를 입력하면 컴퓨터에 자동 저장됩니다.
- 윗부분을 잡고 창을 이동할 수 있습니다.
- 네 모서리 중 하나를 잡고 대각선 반대편까지 끈 뒤 놓으면, 도착 방향의 화면 모서리에 접혀 붙습니다.
- 접힌 메모를 화면 안쪽으로 끌면 펼쳐집니다. 두 번 클릭하거나 키보드로 선택 후 Enter를 눌러도 됩니다.
- 끝까지 끌지 않고 놓거나 Escape를 누르면 접기가 취소됩니다.
- 숨김 버튼은 트레이로 숨깁니다. 트레이 아이콘의 메뉴에서 다시 열거나 앱을 종료할 수 있습니다.

창은 항상 위에 표시되고 작업 표시줄과 Alt-Tab 전환 목록에서 제외하도록 설정했습니다. 다른 앱으로 전환할 때 입력 포커스를 빼앗지 않습니다. Windows 보안 화면(UAC·잠금 화면), 일부 독점 전체 화면 앱, 다른 최상위 창보다 위에 표시되는 것은 보장하지 않습니다.

이 배포 파일은 코드 서명되지 않았으므로 Windows에서 보안 확인이 표시될 수 있습니다. Windows 실기기 실행과 Alt-Tab 동작은 Windows에서 별도로 검증해야 합니다.

## 개발

Node.js 22.12 이상과 npm이 필요합니다. 기존 체크아웃에서 실행합니다.

```sh
npm ci
npm run setup
npm start
```

```sh
npm test             # 화면 좌표·다중 모니터·접기 복원 계산
npm run test:ui      # 메모 저장·입력·색상·접기/펼치기 브라우저 테스트
npm run test:desktop # 실제 Electron 창·IPC·저장·복원 테스트 (그래픽 화면 필요)
npm run pack:win     # Windows x64 실행 폴더 + ZIP + SHA-256
```

브라우저 테스트는 기본적으로 설치된 Chromium 또는 Playwright Chromium을 사용합니다. 필요하면 `npx playwright install chromium`을 실행하거나 `CHROMIUM_PATH`로 브라우저 경로를 지정하세요. Linux에서 데스크톱 테스트에는 X11 그래픽 화면이 필요합니다. 앱 코드는 Electron 샌드박스를 유지합니다.

이 클라우드 Linux는 Chromium의 OS 샌드박스를 지원하지 않으므로 데스크톱 테스트에만 `ELECTRON_TEST_NO_SANDBOX=1 npm run test:desktop`을 사용했습니다. 기본 앱과 Windows 패키지의 샌드박스 설정은 유지하며, 샌드박스가 활성화된 Windows 실행은 별도 검증이 필요합니다.

Windows 패키지는 Linux에서도 만들 수 있습니다. 생성된 파일은 `dist/` 아래에 있으며 Git에 포함하지 않습니다. Windows 실행 검증·서명·배포는 별도 단계입니다.

## 구조와 데이터

`electron/`은 창·트레이·파일 저장을, `renderer/`는 메모와 접기 제스처를 담당합니다. 렌더러에는 Node.js 권한이 없으며 제한된 IPC만 노출합니다. 외부 서버·로그인·API 키가 필요하지 않습니다.

메모와 창 상태는 `%APPDATA%\Corner Note\note-state.json`에 저장됩니다. 저장은 임시 파일을 쓴 뒤 원자적으로 교체하며 종료 시 대기 중인 저장을 마칩니다. 손상된 파일은 `.corrupt-...` 이름으로 보존합니다. 앱 폴더를 지워도 사용자 데이터 폴더의 메모는 남습니다. 브라우저에서 UI를 열면 개발·테스트용 localStorage를 사용하고, 데스크톱 메모 파일과는 별개입니다.
