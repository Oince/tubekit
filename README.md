# Tubekit

YouTube를 쓰면서 불편했던 점을 고치는 개인용 유저스크립트입니다. Windows용 AdGuard 앱의 확장 프로그램으로 설치해 씁니다.

설치·업데이트 주소:

```text
https://raw.githubusercontent.com/Oince/tubekit/main/tubekit.user.js
```

## 기능

### 오른쪽 댓글 패널

플레이어와 영상 정보의 배치는 그대로 두고, 오른쪽 영역을 `댓글 | 관련 동영상` 탭으로 바꿉니다.

- 넓은 2열 영상 화면에서는 오른쪽에 `댓글 | 관련 동영상` 탭이 나타납니다.
- 영상에 들어가면 댓글 탭이 먼저 열립니다.
- 두 탭은 같은 영상에서 전환하는 동안 각각의 스크롤 위치를 유지합니다.
- 탭에 키보드 포커스를 둔 상태에서 좌우 방향키로 전환하고, Home/End로 첫 번째/마지막 탭을 선택할 수 있습니다.
- 별도의 전환 버튼은 없고 지원되는 화면에서는 항상 자동으로 적용됩니다.
- 극장 모드, 전체화면, 미니플레이어, 좁은 단일 열 화면에서는 YouTube의 원래 레이아웃을 사용합니다.
- 적용 주소는 `https://www.youtube.com/watch?v=...`입니다. 브라우저 화면 너비가 **1000 CSS px 이상**이고 영상과 오른쪽 영역이 나란히 배치된 2열 화면에서 동작합니다. 모니터 해상도와 다르며 브라우저 확대/축소의 영향을 받습니다.
- `m.youtube.com`, YouTube 앱, Shorts에는 적용되지 않습니다.

## 개발

소스는 `src/features/<기능>/`에 기능별로 있고, 빌드하면 `tubekit.user.js` 한 파일로 합쳐집니다.

```bash
npm ci
npm run build
npm test
```

작업 규칙은 [AGENTS.md](AGENTS.md), 버전별 변경 내용은 [CHANGELOG.md](CHANGELOG.md)에 있습니다.
