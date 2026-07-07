# Pipedream 저장소 사용 가이드 (한국어)

이 저장소는 [PipedreamHQ/pipedream](https://github.com/PipedreamHQ/pipedream) 공식 모노레포의 포크입니다. Pipedream은 앱과 앱을 연결해 자동화 워크플로우를 만드는 통합 플랫폼이고, 이 저장소에는 약 3,400개 앱 통합(컴포넌트)의 소스 코드가 들어 있습니다.

## 이 저장소로 할 수 있는 것

- **기존 컴포넌트 수정** — 버그 수정, 기능 개선 후 공식 저장소에 PR 제출
- **새 컴포넌트 개발** — 원하는 앱의 액션(Action)·소스(Source)를 직접 만들기
- **코드 참고** — 1,000개 이상 API 연동 방식의 실제 구현 예시 열람

> 참고: 워크플로우를 그냥 *사용*만 하려면 이 저장소가 필요 없습니다. [pipedream.com](https://pipedream.com)에서 바로 사용하면 됩니다. 이 저장소는 컴포넌트 코드를 직접 수정·개발할 때 필요합니다.

## 디렉터리 구조 한눈에 보기

| 경로 | 내용 |
|---|---|
| `components/{앱이름}/` | 앱별 통합 코드 (핵심 디렉터리) |
| `components/{앱이름}/{앱이름}.app.mjs` | 앱 연결 정의, 공용 API 메서드 |
| `components/{앱이름}/actions/` | 액션 — 작업을 수행하는 컴포넌트 (레코드 생성, 메시지 전송 등) |
| `components/{앱이름}/sources/` | 소스 — 이벤트를 감지해 워크플로우를 트리거하는 컴포넌트 |
| `platform/` | 컴포넌트가 사용하는 런타임 라이브러리 (`@pipedream/platform`) |
| `packages/sdk/` | Pipedream SDK |
| `docs-v2/` | 공식 문서 (https://pipedream.com/docs) |

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
3. **버전을 반드시 올립니다** — 컴포넌트의 `version`과 해당 앱의 `package.json` 버전 모두. 올리지 않으면 CI가 실패합니다.
4. 커밋 후 공식 저장소(`PipedreamHQ/pipedream`)의 `master` 브랜치로 PR을 보냅니다.

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
