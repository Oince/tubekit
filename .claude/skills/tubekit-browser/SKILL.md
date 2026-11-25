---
name: tubekit-browser
description: playwright-cli로 YouTube에서 Tubekit 빌드를 브라우저로 다루는 방법. 기기별 설정 파일로 세션 열기, 빌드 주입과 이전 빌드 넣기, 화면 너비·다크 모드·스크롤바 조건 만들기, 마우스·터치 조작과 광고 건너뛰기, 스크린샷, 작업 후 정리. Tubekit을 브라우저로 재현하거나 확인하려고 세션을 열기 전에 읽는다.
---

# Tubekit 브라우저 다루기

`playwright-cli`로 YouTube에서 Tubekit을 브라우저로 다루는 방법이다. 명령 사용법은 `playwright-cli` 스킬이나 `playwright-cli <명령> --help`를 본다.

## 세션 열기

- 기기별 설정 파일은 `.playwright/`에 기기 이름으로 있다(`iphone.json`, `ipad-landscape.json`, `desktop-safari.json` 등). 화면 크기·User-Agent·터치 같은 조건은 각 파일에 들어 있다.
- 세션은 기기 설정 파일을 주어 이름을 붙여 연다. 예: `playwright-cli -s=safari open --config=.playwright/desktop-safari.json "<영상 주소>"`. 설정 파일 없이 열지 않는다.
- 세션은 기본으로 화면 없이(headless) 뜨고 프로필은 메모리에만 있다. 확장이 없어 AdGuard 설치본(실사용용 GitHub 배포본)이 적용되지 않는다. AdGuard 설정은 건드리지 않는다.
- `desktop-chrome.json`은 시스템 Chrome을 쓴다. User-Agent를 일반 Chrome 값으로 고정해 두었다. 화면 없는 Chrome의 기본 값(`HeadlessChrome`)이면 YouTube가 라이브 채팅에 "이전 버전의 브라우저" 안내를 띄운다. Chrome 버전이 크게 오르면 이 값도 맞춘다.
- Safari 자리(맥북·iPad·iPhone) 설정은 Playwright WebKit을 쓴다. WebKit은 Safari 엔진이지만 실제 Safari와 같지 않고, 터치를 켠 설정에서도 `navigator.maxTouchPoints`는 0이다.
- `run-code`에 긴 코드를 줄 때는 `--filename`으로 파일을 넘기고, 값만 받을 때는 `--raw`를 붙인다.

## 스크립트 주입

- 설정 파일의 `initPage`(`.playwright/tubekit.cjs`)가 탭을 열 때 저장소의 `tubekit.user.js`를 읽어, 그 탭의 모든 문서에 페이지 시작 시점에 주입한다. 손으로 주입하지 않으므로 같은 페이지에 두 벌이 실행되지 않는다. 의심되면 `#tubekit-styles`가 하나인지 본다.
- Playwright의 주입은 문서 뼈대(`<html>`)가 생기기도 전에 실행되어 유저스크립트 관리자보다 이르다. 그래서 `tubekit.cjs`는 뼈대가 생긴 뒤 빌드를 실행하도록 감싼다.
- 빌드는 세션을 열 때 읽는다. `npm run build` 뒤에는 세션을 닫고 다시 연다.
- 수정 전 화면처럼 다른 빌드를 넣으려면 환경변수로 경로를 준다. 예: `TUBEKIT_BUILD=<이전 빌드 경로> playwright-cli -s=before open --config=...`. 이전 빌드는 `git show <커밋>:tubekit.user.js > <스크래치패드 경로>`로 만든다.
- `src/`의 개별 모듈은 주입하지 않는다.

## 화면 조건 만들기

- 너비는 `resize <너비> <높이>`로 바꾼다.
- 다크 모드는 `set-color-scheme dark` 뒤 `reload`해야 YouTube 화면에 반영된다. 되돌릴 때는 `clear-color-scheme` 뒤 `reload`한다.
- 세션은 Chrome·WebKit 모두 오버레이 스크롤바로 뜬다.
- 모바일 화면(`m.youtube.com`)은 `iphone.json`으로 연다. User-Agent가 세션을 열 때부터 들어가므로 YouTube가 바로 모바일 페이지를 내려준다.

## 페이지 조작

- YouTube에 로그인하지 않는다.
- 쿠키·동의 팝업이 뜨면 필수가 아닌 항목은 거부한다.
- `click`은 실제 마우스 입력이다. 요소는 스냅숏 ref(`snapshot`·`find`로 찾음), CSS 셀렉터, Playwright 로케이터로 고른다. iframe(라이브 채팅 등) 안의 요소도 스냅숏 ref로 누를 수 있다.
- 터치는 `click`이 아니라 `run-code`에서 `locator.tap()`으로 보낸다. 예: `page.getByRole('tab', { name: '관련 동영상' }).tap()`. iframe 안은 `page.frameLocator('#chatframe')`로 들어간다.
- 광고가 재생되면 건너뛰기 버튼(`.ytp-skip-ad-button`, `.ytp-ad-skip-button-modern` 등)이 나타나는 즉시 누른다. YouTube는 실제 입력이 아닌 클릭을 무시하므로 `eval` 안의 `element.click()`으로는 넘어가지 않는다. `playwright-cli click`이나 `run-code`의 `locator.click()`으로 누른다.
- 스크린샷은 `screenshot --filename=<절대 경로>`로 저장소 밖(스크래치패드 등)에도 바로 저장된다.

## 작업 후 정리

- 작업이 끝나면 `playwright-cli close-all`로 연 세션을 모두 닫고, `playwright-cli list`로 남은 세션이 없는지 확인한다. 사용자의 Chrome은 건드리지 않는다.
- 스냅숏·콘솔 기록이 쌓이는 저장소 안 `.playwright-cli/`는 `trash`로 지운다.
- 그 밖에 띄운 보조 프로세스도 종료한다.
