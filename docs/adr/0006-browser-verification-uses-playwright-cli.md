# 브라우저 재현과 검증은 chrome-devtools MCP 대신 playwright-cli와 기기별 설정 파일로 한다

브라우저 재현과 검증은 `chrome-devtools` MCP로 해 왔고, Safari가 필요할 때는 `safari-mcp`를 썼다. v0.8.0의 "모두 닫기" 버그는 iPad에서 터치할 때만 생겼다. YouTube는 터치 직후 마지막으로 터치한 요소를 거치지 않는 클릭을 막는데, 이 동작은 실제 터치 입력이 있어야 드러난다. 그런데 이 MCP는 마우스 클릭만 보낼 수 있고 외부에서 터치를 넣을 길도 없어, 버그를 재현하지 못했다. Playwright의 `locator.tap()`은 실제 터치를 보내 v0.8.0 버그, v0.8.1 퇴행, v0.8.2 정상을 모두 재현했다. 그래서 검증 도구를 사용자가 전역 설치한 `playwright-cli`로 바꾸고, 두 MCP 설정(`.mcp.json`, `.agents/plugins/`)은 지웠다.

기기 조건은 `.playwright/`의 설정 파일로 고정한다. 사용자는 맥북·iPad·iPhone에서 Safari를, Windows에서만 Chrome을 쓰고 개발은 맥에서만 한다. 그래서 Safari 자리는 Playwright WebKit으로, Chrome은 시스템 Chrome으로 열고, 데스크톱은 두 브라우저를 모두 확인한다. iPad는 YouTube가 데스크톱 화면을 내려주도록 데스크톱 Safari User-Agent에 터치를 켠다. 내장 iPad 기기 설정은 iPad User-Agent라 `m.youtube.com`으로 보내지므로 쓰지 않는다. 빌드는 설정의 `initPage`(`.playwright/tubekit.cjs`)가 탭을 열 때 읽어, 손으로 주입하지 않고도 헤더의 `@run-at document-start`처럼 페이지 시작 시점에 들어간다.

2026-11-25에 AGENTS.md의 검증 항목을 이 방식으로 한 번씩 돌렸다. 데스크톱 1440px(Chrome·WebKit), 오버레이 스크롤바 경계(999/1000px), 다크 모드, 광고 건너뛰기, 관련 영상 이동과 앞뒤 이동, iPad 가로·세로의 터치 조작, iPhone의 쇼츠 진입이 모두 기대대로 나왔다.

## Considered Options

- **chrome-devtools MCP를 유지하고 Playwright는 터치가 필요할 때만 보조로 쓰기**: 익숙한 요령을 그대로 쓰지만, 같은 검증에 도구가 둘이라 절차와 화면 조건이 갈라진다.
- **Playwright MCP 서버**: 할 수 있는 일은 CLI와 같지만, 도구 설명과 페이지 스냅숏이 대화에 그대로 들어와 무겁다. CLI는 스냅숏과 스크린샷을 파일로 남기고 경로만 돌려준다.
- **Playwright를 저장소 개발 의존성으로 두고 버전 고정**: 업데이트 때 동작이 바뀌는 위험은 줄지만, 사용자는 전역 설치 하나로 관리하기로 했다.

## Consequences

- Playwright의 주입은 문서 뼈대(`<html>`)가 생기기도 전에 실행되어 유저스크립트 관리자보다 이르다. 빌드를 그대로 넣으면 스타일을 붙일 곳이 없어 실패하므로, `tubekit.cjs`가 뼈대가 생긴 뒤 실행하도록 감싼다.
- 화면 없는 Chrome의 기본 User-Agent(`HeadlessChrome`)에서는 YouTube가 라이브 채팅을 막으므로 `desktop-chrome.json`에 일반 Chrome User-Agent를 고정했다. Chrome 버전이 크게 오르면 맞춰야 한다.
- 화면 없이 띄운 세션은 오버레이 스크롤바만 나온다. 사용자가 모든 기기에서 오버레이 스크롤바만 쓰기로 해서, 자리를 차지하는 스크롤바는 확인하지 않는다. CSS로 흉내 내면 YouTube의 2열 경계가 실제와 달라지므로(1014px에서도 2열) 필요해지면 macOS 설정에 맞춰 창을 띄워(`--headed`) 확인해야 한다.
- WebKit은 실제 iOS Safari가 아니고 `navigator.maxTouchPoints`가 0이다. 실기기에서만 드러나는 문제는 여전히 사용자 확인이 필요하다.
- 실제 Safari에 붙는 수단(`safari-mcp`)은 없어졌다.
- `playwright-cli`는 0.x 전역 설치라 업데이트로 명령이나 설정 형식이 바뀔 수 있다.
