# CornerNote Instagram 홍보 영상 — 항상 위 기능 추가

- 파일: `CornerNote-Instagram-AlwaysOnTop.mp4`
- 세로 1080×1920, 30fps, 26초, H.264/yuv420p, MP4 faststart
- 소리 없음
- 기존 작성·메모 추가·크기 조절·접기·이동·펼치기 장면 유지
- 16–22초: 실제 메모의 ‘항상 위’ 버튼을 끄고 켜서 다른 문서 창과의 표시 순서 비교
- 마지막 4초: `available in microsoft store`

Nanum Pen Script 손글씨체 46px, 채도가 낮은 갈색의 작은 자막을 사용했습니다. 배경 상자나 윤곽선은 사용하지 않았습니다. 새 기능 자막은 ‘고정을 끄면, 다른 창 뒤로’, ‘다른 창을 써도, 메모는 항상 위에’입니다.

실제 CornerNote v1.6.0 Electron 앱을 별도의 Linux X11 화면에서 조작하여 녹화했습니다. Windows 바탕화면 녹화가 아닙니다. 메모 UI나 창의 표시 순서를 영상 합성으로 만들지 않았습니다. 720×1280 원본 화면을 1080×1920으로 확대하고 자막만 추가했습니다.

비교에 사용하는 창은 녹화용으로 만든 일반 데모 문서 창입니다. 고정을 끈 상태에서는 이 문서가 메모를 가리고, 고정을 켠 상태에서는 문서 창에 포커스가 있어도 메모가 그 위에 유지되는 것을 실제 네이티브 창으로 확인했습니다. `pin-evidence.json`에 Electron의 고정 여부·포커스와 X11의 실제 창 순서를 기록했습니다.

AI 키, 실제 개인정보, 외부 AI 요청은 사용하지 않았습니다. 자막 글꼴은 Google Fonts Nanum Pen Script이며 SIL Open Font License 1.1로 제공됩니다.
