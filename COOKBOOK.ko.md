# Pipedream 실전 쿡북 (한국어)

`GUIDE.ko.md`가 "이 저장소로 무엇을 할 수 있는가"를 다룬다면, 이 문서는 "정확히 어떻게 하는가"를 다룹니다. 모든 코드는 이 저장소의 실제 컴포넌트(`components/agentset`, `components/polydoc` 등)에서 가져온 검증된 패턴입니다.

---

## 레시피 1 — 새 앱 통합 만들기 (A부터 Z까지)

### 0단계: 앱 슬러그 확인

컴포넌트의 앱 슬러그는 Pipedream 인증 시스템에 이미 등록되어 있어야 합니다. 새 앱이라면 먼저 [앱 통합 요청 이슈](https://github.com/PipedreamHQ/pipedream/issues/new?assignees=&labels=app%2C+enhancement&template=app---service-integration.md&title=%5BAPP%5D)를 올리거나, Gitpod 환경에서 `pd init app`으로 시작하세요 (`CONTRIBUTING.md` 참고).

### 1단계: 최소 스캐폴딩

새 앱은 파일 2개로 시작합니다. 실제 예시가 `components/polydoc/`에 있습니다.

`components/{슬러그}/package.json`:

```json
{
  "name": "@pipedream/{슬러그}",
  "version": "0.0.1",
  "description": "Pipedream {앱이름} Components",
  "main": "{슬러그}.app.mjs",
  "keywords": ["pipedream", "{슬러그}"],
  "homepage": "https://pipedream.com/apps/{슬러그}",
  "author": "Pipedream <support@pipedream.com> (https://pipedream.com/)",
  "publishConfig": { "access": "public" },
  "dependencies": { "@pipedream/platform": "^3.1.1" }
}
```

### 2단계: 앱 파일 — `_makeRequest` 패턴

`components/agentset/agentset.app.mjs`가 표준 패턴입니다 (발췌):

```javascript
import { axios } from "@pipedream/platform";

export default {
  type: "app",
  app: "agentset",
  propDefinitions: {
    namespaceId: {
      type: "string",
      label: "Namespace ID",
      description: "The ID of the namespace",
      async options() {
        const { data } = await this.listNamespaces();
        return data.map(({ id: value, name: label }) => ({ label, value }));
      },
    },
  },
  methods: {
    _baseUrl() { return "https://api.agentset.ai/v1"; },
    _headers() { return { Authorization: `Bearer ${this.$auth.api_key}` }; },
    _makeRequest({ $ = this, path, ...opts }) {
      return axios($, { url: this._baseUrl() + path, headers: this._headers(), ...opts });
    },
    listNamespaces(opts = {}) { return this._makeRequest({ path: "/namespace", ...opts }); },
    createNamespace(opts = {}) { return this._makeRequest({ method: "POST", path: "/namespace", ...opts }); },
    // 페이지네이션은 async generator가 하우스 패턴
    async *paginate({ fn, params = {}, maxResults = null, ...opts }) {
      let count = 0;
      let cursor;
      do {
        params.cursor = cursor;
        const { data, pagination: { nextCursor } } = await fn({ params, ...opts });
        for (const d of data) {
          yield d;
          if (maxResults && ++count === maxResults) return count;
        }
        cursor = nextCursor;
      } while (cursor);
    },
  },
};
```

핵심 규칙:
- HTTP는 반드시 `@pipedream/platform`의 `axios` (npm `axios` 금지)
- 인증 정보는 `this.$auth`로만 접근
- 비공개 헬퍼는 `_` 접두사, 공개 메서드는 동사+명사 (`createNamespace`)

### 3단계: 액션 추가

경로 규칙: `components/{슬러그}/actions/{액션이름}/{액션이름}.mjs` — **폴더명 = 파일명 = key에서 앱 슬러그를 뺀 부분**. 이 규칙은 `scripts/findBadKeys.js`가 CI에서 강제합니다.

실제 예시 `components/agentset/actions/create-namespace/create-namespace.mjs`:

```javascript
import agentset from "../../agentset.app.mjs";

export default {
  key: "agentset-create-namespace",
  name: "Create Namespace",
  description: "Creates a namespace for the authenticated organization. [See the documentation](https://docs.agentset.ai/api-reference/endpoint/namespaces/create)",
  version: "0.0.1",
  annotations: {
    destructiveHint: false,
    openWorldHint: true,
    readOnlyHint: false,
  },
  type: "action",
  props: {
    agentset,   // 앱 연결 prop은 항상 첫 번째
    name: {
      type: "string",
      label: "Name",
      description: "The name of the namespace to create",
    },
  },
  async run({ $ }) {
    const response = await this.agentset.createNamespace({ $, data: { name: this.name } });
    $.export("$summary", `Successfully created namespace with ID: ${response.data.id}`);
    return response;
  },
};
```

체크리스트:
- `annotations` 필수 (조회 전용 → `readOnlyHint: true`, 되돌릴 수 없는 삭제 → `destructiveHint: true`, 외부 API 호출 → `openWorldHint: true`)
- 모든 성공 경로에서 `$.export("$summary", ...)` 호출
- `description`은 반드시 `[See the documentation](...)` 링크로 끝남
- 앱 메서드 호출 시 `$` 컨텍스트 전달
- `run()`을 try/catch로 감싸지 말 것 (플랫폼이 API 에러를 원문 그대로 던져줌)

### 4단계: 폴링 소스 추가

공용 베이스 + 구체 소스로 나누는 것이 하우스 패턴입니다.

`components/{슬러그}/sources/common/base.mjs` (실제 agentset 코드):

```javascript
import { DEFAULT_POLLING_SOURCE_TIMER_INTERVAL } from "@pipedream/platform";
import agentset from "../../agentset.app.mjs";

export default {
  props: {
    agentset,
    db: "$.service.db",
    timer: {
      type: "$.interface.timer",
      default: { intervalSeconds: DEFAULT_POLLING_SOURCE_TIMER_INTERVAL },
    },
    namespaceId: { propDefinition: [agentset, "namespaceId"] },
  },
  methods: {
    _getLastData() { return this.db.get("lastData") || 0; },
    _setLastData(lastData) { this.db.set("lastData", lastData); },
    async emitEvent(maxResults = false) {
      const lastData = this._getLastData();
      const response = this.agentset.paginate({
        fn: this.getFunction(),
        namespaceId: this.namespaceId,
        params: { orderBy: "createdAt", order: "desc", pageSize: 100, maxResults },
      });
      let responseArray = [];
      for await (const item of response) {
        if (Date.parse(item.createdAt) <= lastData) break;   // 이미 본 항목이면 중단
        responseArray.push(item);
      }
      if (responseArray.length) this._setLastData(Date.parse(responseArray[0].createdAt));
      for (const item of responseArray.reverse()) {
        this.$emit(item, {
          id: `${item.id}`,
          summary: this.getSummary(item),
          ts: Date.parse(item.createdAt),
        });
      }
    },
  },
  hooks: {
    async deploy() { await this.emitEvent(25); },   // 첫 배포 시 최근 25개만
  },
  async run() { await this.emitEvent(); },
};
```

구체 소스 `sources/new-document-created/new-document-created.mjs`:

```javascript
import common from "../common/base.mjs";
import sampleEmit from "./test-event.mjs";

export default {
  ...common,
  key: "agentset-new-document-created",
  name: "New Document Created",
  description: "Emit new event when a new document is created. [See the documentation](https://docs.agentset.ai/api-reference/endpoint/documents/list)",
  version: "0.0.1",
  type: "source",
  dedupe: "unique",
  methods: {
    ...common.methods,
    getFunction() { return this.agentset.listDocuments; },
    getSummary(item) { return `New document created: ${item.name || item.id}`; },
  },
  sampleEmit,
};
```

같은 폴더에 `test-event.mjs`(실제와 유사한 샘플 페이로드를 default export)를 추가하세요 — UI 미리보기에 쓰이며, 이름 규칙 검사에서 면제됩니다.

소스 체크리스트:
- 소스에는 `annotations`를 넣지 말 것 (액션 전용)
- `$emit`의 `id`는 실제 이벤트당 안정적·고유해야 함 (`Date.now()` / `Math.random()` 금지; 수정 이벤트는 `${id}-${updatedAt}` 조합)
- `dedupe: "unique"` 사용
- 상태는 `db` prop을 통해 비공개 메서드(`_getLastData`)로만 접근
- 웹훅 소스라면 `activate()` / `deactivate()`는 최상위 `hooks`에 (예시: `components/notion/sources/common/base-webhook.mjs`)

### 5단계: 로컬 검증 (CI와 동일한 검사)

```bash
pnpm install
pnpm exec eslint --fix components/{슬러그}/
pnpm run build                                  # TypeScript 컴포넌트가 있을 때만 의미 있음
node scripts/findBadKeys.js components/{슬러그}/actions/{액션이름}/{액션이름}.mjs
node scripts/findDuplicateKeys.js
node --experimental-loader ./scripts/version-strip-loader.mjs scripts/checkComponentAppProp.js components/{슬러그}/actions/{액션이름}/{액션이름}.mjs
```

---

## 레시피 2 — 기존 컴포넌트 수정하기 (버전 규칙이 절반이다)

1. 컴포넌트 파일을 수정합니다.
2. **해당 컴포넌트의 `version`을 올립니다.** 버그 수정·문구 변경은 patch, 하위 호환 기능 추가는 minor, 호환성 깨짐은 major.
3. **앱의 `package.json` 버전도 같은 단계 이상으로 올립니다.**
4. **전이적 범프 주의**: `{앱}.app.mjs`나 `common/` 파일을 수정하면, 그 파일을 import하는 **모든** 컴포넌트의 버전도 올려야 CI(`components-pr.yaml`의 버전 검사)가 통과합니다. 빠뜨리면 CI가 실패하면서 **그대로 복사해 실행할 수 있는 `sed` 명령어를 출력**해주니 당황하지 마세요.

---

## 레시피 3 — PR 보내기 전 최종 체크리스트

- [ ] 레시피 1의 5단계 로컬 검증 통과
- [ ] 버전 규칙(레시피 2) 준수 — 새 컴포넌트는 `0.0.1`
- [ ] Markdown을 수정했다면 새 기술 용어를 `.wordlist.txt`에 추가 (CI 스펠체크)
- [ ] 브랜치를 포크에 푸시 → `PipedreamHQ/pipedream`의 `master`로 PR
- [ ] PR이 머지되면 `publish-components.yaml`이 자동으로 레지스트리에 배포 — 별도 릴리스 절차 없음

CI에서 도는 검사 (`.github/workflows/`):

| 워크플로우 | 검사 내용 |
|---|---|
| `components-pr.yaml` | 변경된 컴포넌트·앱 버전 범프 여부 (전이적 의존성 포함), TypeScript 빌드 산출물 |
| `pull-request-checks.yaml` | 변경 파일 eslint, `findBadKeys`, `checkComponentAppProp`, `findDuplicateKeys`, Markdown 스펠체크 |

---

## 레시피 4 — AI 어시스턴트(Claude 등)에서 Pipedream의 2,800+ 앱 쓰기 (MCP)

**일상 사용이라면 이 저장소가 아니라 Pipedream의 호스팅 원격 MCP 서버를 쓰세요.**

- 개발자용 안내: <https://pipedream.com/docs/connect/mcp/developers>
- 소비자용 앱별 서버: <https://mcp.pipedream.com>
- 데모 챗: <https://chat.pipedream.com>

이 저장소의 `modelcontextprotocol/`은 **참고 구현**(더 이상 유지보수되지 않음)으로, MCP 서버를 직접 만들어보고 싶을 때 학습용으로 가치가 있습니다. 셀프호스팅 절차:

```bash
cd modelcontextprotocol
cp .env.example .env    # PIPEDREAM_CLIENT_ID / CLIENT_SECRET / PROJECT_ID / PROJECT_ENVIRONMENT=development
pnpm install
pnpm dev:http           # 포트 3010 고정 (하드코딩)
```

- MCP 클라이언트 연결: `http://localhost:3010/v1/{내_서비스의_사용자ID}/{앱슬러그}` (예: `/123/slack`)
- 테스트: `npx @modelcontextprotocol/inspector`
- 계정이 연결돼 있지 않으면 첫 도구 호출 시 Connect Link URL이 반환되고, 사용자가 그 링크에서 OAuth 연결
- `/v1/{사용자ID}`만 쓰는 dynamic 모드는 실험적이며 OpenAI·Supabase 키가 추가로 필요

---

## 레시피 5 — 내 서비스에 통합 기능 임베드하기 (Pipedream Connect)

Connect는 "내 제품 안에서 내 사용자가 Slack·GitHub 등에 OAuth로 계정을 연결하고, 그 자격증명으로 액션 실행·트리거 배포·API 프록시 호출"을 가능하게 하는 제품입니다.

**중요**: 이 저장소의 `packages/sdk`(v1.x)는 **deprecated**입니다. 실제 개발은 v2.x인 [PipedreamHQ/pipedream-sdk-typescript](https://github.com/PipedreamHQ/pipedream-sdk-typescript)를 쓰세요. 이 저장소는 개념 학습(`packages/sdk/examples/`)용으로 보세요.

기본 흐름:

```javascript
// 서버: Connect 토큰 발급
import { createBackendClient } from "@pipedream/sdk/server";
const pd = createBackendClient({
  environment: "development",
  projectId: process.env.PIPEDREAM_PROJECT_ID,
  credentials: { clientId: "...", clientSecret: "..." },
});
const { token } = await pd.createConnectToken({ external_user_id: "user-123" });
```

```javascript
// 브라우저: 계정 연결 UI 열기
import { createFrontendClient } from "@pipedream/sdk/browser";
const client = createFrontendClient({ tokenCallback, externalUserId: "user-123" });
client.connectAccount({ app: "github", onSuccess: () => {} });
```

- React라면 `@pipedream/connect-react`의 `ComponentFormContainer`가 레지스트리 액션의 설정 폼을 자동 렌더링합니다 (`packages/connect-react/README.md`).
- OpenAI 함수 호출로 레지스트리 액션을 실행하고 싶다면 `packages/ai` (알파 단계) 참고.

---

## 부록 — 자주 걸리는 함정 모음

| 함정 | 설명 |
|---|---|
| npm `axios` import | 무조건 `import { axios } from "@pipedream/platform"`. 플랫폼 axios는 `undefined` 파라미터 자동 제거, 응답 본문 직접 반환, 4xx/5xx 자동 throw |
| `run()`에 try/catch | API 에러 원문이 사라짐 — 감싸지 말 것. 입력 검증에만 `ConfigurationError` 사용 |
| 이름 불일치 | 폴더명 = 파일명 = key(앱 슬러그 제외). `common*` 파일과 `test-event.mjs`는 면제 |
| 앱 prop 누락 | `checkComponentAppProp.js`가 실제로 컴포넌트를 import해서 디렉터리 슬러그와 같은 `type: "app"` prop이 있는지 검사 |
| 버전 범프 누락 | 전이적 의존성 포함 — CI 실패 메시지가 수정용 `sed` 명령을 알려줌 |
| 소스의 `annotations` | 소스에 넣으면 안 됨 (액션 전용) |
| `$emit` id에 `Date.now()` | 중복 이벤트 발생 — 안정적·고유한 실제 이벤트 ID 사용 |
| pnpm 버전 | `10.28.2` 고정 (`engines` 강제). Node는 20 |
| 단위 테스트 기대 | 컴포넌트에는 사실상 단위 테스트가 없음 — 품질 게이트는 eslint + 검증 스크립트 + 버전 검사 |
| `docs-v2/` 참조 | deprecated (문서는 비공개 저장소로 이전). 신뢰할 소스는 `.github/pipedream-*-guidelines.md`와 `CLAUDE.md` |
