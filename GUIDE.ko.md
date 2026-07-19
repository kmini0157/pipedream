# Pipedream 저장소 사용 가이드 (한국어)

이 저장소는 [PipedreamHQ/pipedream](https://github.com/PipedreamHQ/pipedream) 공식 모노레포의 포크입니다. Pipedream은 앱과 앱을 연결해 자동화 워크플로우를 만드는 통합 플랫폼이고, 이 저장소에는 약 3,400개 앱 통합(컴포넌트)의 소스 코드가 들어 있습니다.

## 나에게 맞는 사용법 찾기 (결정 가이드)

| 하고 싶은 것 | 정답 | 참고 |
|---|---|---|
| **A. 앱 자동화를 그냥 쓰고 싶다** (Slack 알림, 시트 자동 기록 등) | [pipedream.com](https://pipedream.com) 가입 후 웹 UI에서 워크플로우 생성. **이 저장소는 필요 없음** | — |
| **B. Claude 같은 AI에서 2,800+ 앱을 도구로 쓰고 싶다** | Pipedream **원격 MCP 서버** 사용 ([안내](https://pipedream.com/docs/connect/mcp/developers), [mcp.pipedream.com](https://mcp.pipedream.com)) | `COOKBOOK.ko.md` 레시피 4 |
| **C. 통합(컴포넌트)을 만들거나 고쳐서 기여하고 싶다** | **이 저장소의 핵심 용도.** `components/`에서 개발 → 공식 저장소로 PR | `COOKBOOK.ko.md` 레시피 1–3 |
| **D. 내 서비스에 통합 기능을 임베드하고 싶다** | Pipedream Connect + SDK v2 ([별도 저장소](https://github.com/PipedreamHQ/pipedream-sdk-typescript)) — 이 저장소의 `packages/`는 개념 학습용 | `COOKBOOK.ko.md` 레시피 5 |
| **E. 실전 API 연동 코드를 레퍼런스로 학습하고 싶다** | `components/` 훑어보기 — 3,400개 실제 서비스의 API 클라이언트 패턴 모음 | 아래 구조 표 |

## 이 저장소로 할 수 있는 것

- **기존 컴포넌트 수정** — 버그 수정, 기능 개선 후 공식 저장소에 PR 제출
- **새 컴포넌트 개발** — 원하는 앱의 액션(Action)·소스(Source)를 직접 만들기
- **코드 참고** — 3,400개 앱의 API 연동 방식 실제 구현 예시 열람

> 참고: 워크플로우를 그냥 *사용*만 하려면 이 저장소가 필요 없습니다. [pipedream.com](https://pipedream.com)에서 바로 사용하면 됩니다. 이 저장소는 컴포넌트 코드를 직접 수정·개발할 때 필요합니다.

## 디렉터리 구조 한눈에 보기

| 경로 | 내용 |
|---|---|
| `components/{앱이름}/` | 앱별 통합 코드 (핵심 디렉터리) |
| `components/{앱이름}/{앱이름}.app.mjs` | 앱 연결 정의, 공용 API 메서드 |
| `components/{앱이름}/actions/` | 액션 — 작업을 수행하는 컴포넌트 (레코드 생성, 메시지 전송 등) |
| `components/{앱이름}/sources/` | 소스 — 이벤트를 감지해 워크플로우를 트리거하는 컴포넌트 |
| `platform/` | 컴포넌트가 사용하는 런타임 라이브러리 (`@pipedream/platform`) — 컴포넌트용 `axios`, `ConfigurationError`, 파일 스트림 헬퍼 |
| `packages/sdk/` | Pipedream SDK v1 (**deprecated** — v2는 [별도 저장소](https://github.com/PipedreamHQ/pipedream-sdk-typescript)) |
| `packages/connect-react/` | Connect 설정 폼을 렌더링하는 React 라이브러리 |
| `modelcontextprotocol/` | MCP 서버 참고 구현 (유지보수 중단 — 실사용은 원격 MCP 서버) |
| `docs-v2/` | deprecated — 공식 문서는 https://pipedream.com/docs |

## 개발 환경 준비

필요 도구 버전은 `.tool-versions`에 정의되어 있습니다: **Node.js 20.13.1, pnpm 10.28.2**

```bash
# 의존성 설치 (모노레포 전체 — 시간이 다소 걸립니다)
pnpm install

# TypeScript 컴포넌트 빌드
pnpm run build

# 테스트 실행
pnpm test

# 특정 파일만 린트
pnpm exec eslint components/slack/
```

## 컴포넌트 개발 흐름

1. `components/{앱이름}/` 아래에서 수정할 컴포넌트를 찾거나, 새 디렉터리를 만듭니다.
2. 컴포넌트 규칙을 따릅니다 — 자세한 내용은 아래 문서 참고:
   - `.github/pipedream-component-guidelines.md` (공통 규칙)
   - `.github/pipedream-action-guidelines.md` (액션 규칙)
   - `.github/pipedream-source-guidelines.md` (소스 규칙)
3. **버전을 반드시 올립니다** — 컴포넌트의 `version`과 해당 앱의 `package.json` 버전 모두. 앱 파일이나 `common/`을 수정하면 그것을 import하는 모든 컴포넌트도 함께 올려야 합니다. 올리지 않으면 CI가 실패합니다.
4. 커밋 후 공식 저장소(`PipedreamHQ/pipedream`)의 `master` 브랜치로 PR을 보냅니다. 머지되면 자동으로 레지스트리에 배포됩니다.

> 실제 코드 예시와 단계별 절차는 **`COOKBOOK.ko.md`** 를 보세요 — 새 앱 만들기 A–Z, 버전 규칙, CI 체크리스트, MCP 연동, Connect 임베드까지 레시피로 정리되어 있습니다.

### 꼭 지켜야 할 핵심 규칙 요약

- HTTP 요청은 반드시 `@pipedream/platform`의 `axios` 사용 (npm `axios` 직접 사용 금지)
- 액션의 모든 성공 경로에서 `$.export("$summary", "...")` 호출
- 액션에는 `annotations` 객체 필수, 소스에는 금지
- 소스의 `$emit`에는 안정적이고 고유한 `id` + `summary` + `ts` 필수
- prop 이름은 camelCase, 여러 컴포넌트가 쓰는 prop은 앱 파일의 `propDefinitions`에 정의

## Claude Code와 함께 사용하기

이 저장소에는 `CLAUDE.md`가 있어서 Claude Code가 저장소 구조와 컴포넌트 규칙을 자동으로 이해합니다. 이렇게 요청하면 됩니다:

- "components/notion에 페이지 검색 액션을 새로 만들어줘"
- "components/slack의 send-message 액션에서 스레드 답장을 지원하게 해줘"
- "이 컴포넌트가 CI를 통과할 수 있게 버전이랑 린트를 확인해줘"

## 포크를 최신 상태로 유지하기

공식 저장소의 변경 사항을 주기적으로 가져오세요:

```bash
git remote add upstream https://github.com/PipedreamHQ/pipedream.git  # 최초 1회
git fetch upstream
git checkout master
git merge upstream/master
git push origin master
```

## 참고 링크

- [Pipedream 공식 문서](https://pipedream.com/docs)
- [컴포넌트 개발 퀵스타트](https://pipedream.com/docs/components/quickstart/nodejs/actions/)
- [컴포넌트 기여 가이드라인](https://pipedream.com/docs/components/guidelines/)
- [Pipedream CLI 레퍼런스](https://pipedream.com/docs/cli/reference/)
- [커뮤니티 포럼](https://pipedream.com/community)
