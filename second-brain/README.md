# 🧠 Second Brain

키 없이 동작하는 **개인 지식·기억 레이어**. 웹 링크나 메모를 던져두면 의미로
저장되고, 나중에 자연어로 물어보면 **출처와 함께** 답합니다. 저장이 쌓일수록
"그때 봤던 그거"를 사람보다 잘 찾아주므로, 쓸수록 못 떠나는 앱이 됩니다.

## 무료 스택 매핑

| 단계 | 사용 |
|------|------|
| 입력 채널 | 메모 · URL · **파일 업로드** · **원클릭 클립(북마클릿)** · **음성 메모(Web Speech)** |
| 웹 추출 | **Jina Reader** (`r.jina.ai`, 키 없음) |
| 임베딩 | **transformers.js** all-MiniLM-L6-v2 (로컬·키 없음·오프라인) |
| 저장/검색 | NDJSON(기본) 또는 **libSQL/Turso**(영구무료, 멀티기기) + 코사인 |
| 답변 합성 | **Puter.js** (브라우저 LLM, 키 없음) |
| 호스팅 | Cloudflare Pages/Workers 등 어디든 (정적 + 작은 Node 서버) |

## 실행

```bash
cd second-brain
npm run setup          # install + sharp 스텁 패치 (로컬 임베딩용)
npm start              # http://localhost:8787 접속
```

### 🖥️ 바탕화면에서 더블클릭으로 실행

한 번만 설치 스크립트를 돌리면 바탕화면 아이콘이 생깁니다. 이후 더블클릭
한 번으로 서버가 켜지고 브라우저가 자동으로 열립니다(이미 켜져 있으면
브라우저만 엽니다). 첫 실행 시 의존성도 자동 설치됩니다.

| OS | 설치 (한 번) | 만들어지는 것 |
|----|-------------|---------------|
| Windows | `launchers\install-desktop.bat` 더블클릭 | 바탕화면 "Second Brain" 바로가기 |
| macOS | `sh launchers/install-desktop.sh` | `~/Desktop/Second Brain.command` |
| Linux | `sh launchers/install-desktop.sh` | `~/Desktop/second-brain.desktop` |

바로가기 없이 바로 실행하려면 `launchers/start.sh`(macOS/Linux) 또는
`launchers\start.bat`(Windows)을 더블클릭해도 됩니다. `.env`가 있으면
자동으로 읽습니다.

> `npm run setup`은 네이티브 빌드 없이 설치하고 transformers.js가 쓰지 않는
> `sharp`를 무해한 스텁으로 패치합니다. `EMBED_PROVIDER=hashing`만 쓸 거면
> 일반 `npm install`로도 충분합니다.

브라우저에서 URL이나 메모를 추가하고, 질문하면 검색된 출처를 근거로 Puter가
한국어로 답합니다.

### 저장소 (`STORE`)

| 값 | 설정 | 용도 |
|----|------|------|
| `ndjson` (기본) | — | 단일 기기, 의존성 0 |
| `libsql` (로컬) | `LIBSQL_URL=file:data/store.db` | 단일 기기, SQLite |
| `libsql` (원격) | `LIBSQL_URL=libsql://…turso.io` + `LIBSQL_AUTH_TOKEN` | **멀티기기·배포** ([Turso](https://turso.tech) 영구무료) |

로컬 `file:`과 원격 Turso는 **완전히 같은 코드 경로**입니다. 로컬에서 검증한 뒤
URL만 바꾸면 여러 기기에서 같은 지식을 공유합니다.

**대용량 가속**: libSQL 백엔드는 `F32_BLOB(384)` 컬럼 + `libsql_vector_idx`
네이티브 벡터 인덱스를 만들고 `vector_top_k`(ANN)로 검색합니다 — 전체 행을 읽어
JS에서 코사인을 도는 대신 인덱스로 상위 후보만 가져옵니다. 필터(주제/태그/기간)는
`vector_top_k` 결과에 SQL `WHERE`로 결합됩니다. 네이티브 함수가 없는 빌드에서는
자동으로 JS 코사인 폴백으로 내려갑니다(ndjson은 항상 JS 코사인).

**관측(telemetry)**: 필터가 ANN 후보를 k 미만으로 깎으면 전수검색으로 백필하는데,
이게 조용히 일어나지 않도록 카운터로 추적합니다(`native`/`backfill`/`jsFallback`/
`nativeErrors`). `GET /telemetry`로 조회하고, 백필·네이티브 오류 시 서버 로그에도
경고를 남깁니다. 백필이 잦으면 over-fetch 배수를 올릴 신호입니다.

```bash
# 로컬 SQLite 로 전환
STORE=libsql LIBSQL_URL=file:data/store.db npm start
# 원격 Turso 로 전환 (멀티기기)
STORE=libsql LIBSQL_URL=libsql://your-db.turso.io LIBSQL_AUTH_TOKEN=xxx npm start
```

### 임베딩 공급자 (`EMBED_PROVIDER`)

| 값 | 설명 |
|----|------|
| `local` (기본) | MiniLM 로컬 임베딩. 의미 검색 품질이 좋음. 모델 ~23MB를 처음 한 번 받음 (huggingface.co 접근 필요). |
| `hashing` | 순수 JS 어휘 해싱 임베딩. **네트워크 0**. 모델 호스트가 막힌 환경에서의 폴백. |

```bash
EMBED_PROVIDER=hashing npm run smoke   # 네트워크 없이 전 과정 검증
```

> 참고: 이 저장소가 만들어진 샌드박스에선 egress 정책으로 `huggingface.co`와
> `r.jina.ai`가 차단되어, 검증은 `hashing` 공급자(오프라인)로 수행했습니다.
> 로컬/일반 환경에선 `local`(MiniLM)과 Jina 추출이 그대로 동작합니다.

## 입력 채널 (많이 넣을수록 강해짐)

| 채널 | 방법 | 키 |
|------|------|----|
| 메모 | UI 텍스트박스 / `POST /ingest {text}` | — |
| 웹 URL | UI URL칸 / `{url}` → Jina 추출 | — |
| 파일 | UI 📎 또는 `POST /ingest-file?name=` (`.md/.txt/.html/.json/.csv`) | — |
| PDF | UI 📎 — 브라우저 **pdf.js**로 텍스트 추출 후 저장 (스캔본은 OCR 필요) | — |
| YouTube | URL칸에 영상 주소 → **자막 전사** 후 저장 (키 없음) | — |
| 웹 검색 | 🌐 웹 리서치 버튼 / `POST /research` → 결과 자동 저장 | 🎁 (SEARCH_PROVIDER) |
| 원클릭 클립 | 🔖 북마클릿을 북마크바로 드래그 → 아무 페이지에서 선택분/URL 저장 | — |
| 음성 메모 | UI 🎙️ — 브라우저 Web Speech API 받아쓰기(ko-KR) | — |
| RSS/Atom | 관심 주제 등록 → 매일 자동 수집 | — |

> PDF/문서 등 바이너리는 서버 추출 대상이 아닙니다 — 클라이언트(예: Puter OCR)에서
> 텍스트로 바꿔 `/ingest`로 보내세요.

## 매일 여는 앱 — 자동 수집 + 다이제스트

관심 주제(RSS/Atom/웹페이지)를 등록해 두면, 매일 자동으로 **새 글만** 모아
저장하고(중복 제거), 지난 24시간치를 **요약 다이제스트**로 만들어 알림으로
보냅니다. 이게 "매일 여는" 고리입니다.

```bash
# 1) 주제 등록 (UI에서 해도 됨)
curl -X POST localhost:8787/watches -d '{"topic":"무료 AI 인프라","url":"https://example.com/feed.xml"}'

# 2) 수집 — 새 항목만 ingest (cron 대상)
node scripts/collect.mjs

# 3) 다이제스트 생성 + 전송 (cron 대상)
NOTIFY=ntfy NTFY_TOPIC=my-secret-topic node scripts/digest.mjs
```

### 알림 채널 (`NOTIFY`, 콤마로 복수 가능)

| 값 | 필요 설정 | 비고 |
|----|-----------|------|
| `console` (기본) | — | stdout 출력 |
| `file` | — | `data/digest-latest.md` 작성 |
| `ntfy` | `NTFY_TOPIC` | **키 없이** 휴대폰 푸시 (ntfy.sh) |
| `resend` | `RESEND_API_KEY`, `RESEND_TO` | 이메일 발송 |

### 스케줄링

- **GitHub Actions** (무료): `examples/github-actions-daily.yml`를 본인 레포의
  `.github/workflows/`로 복사. 매일 07:00 KST에 수집+다이제스트 실행.
- **crontab**: `0 7 * * * cd /path/second-brain && node scripts/collect.mjs && NOTIFY=ntfy NTFY_TOPIC=... node scripts/digest.mjs`
- **n8n**: Cron 노드 → HTTP Request 노드로 `POST /collect` 후 `GET /digest`.

### 요약 품질 (`SUMMARY`)

| 값 | 설정 | 비고 |
|----|------|------|
| `extractive` (기본) | — | 문장 추출, 키 없음·오프라인 |
| `llm` | `LLM_BASE_URL` (+`LLM_API_KEY`,`LLM_MODEL`) | OpenAI 호환 엔드포인트로 매끄러운 요약. **오류 시 추출식으로 자동 폴백** |

무료 OpenAI 호환 옵션 예: **Groq**(`https://api.groq.com/openai/v1`),
**OpenRouter**(`...:free` 모델). 자세한 값은 `.env.example` 참고.

```bash
SUMMARY=llm LLM_BASE_URL=https://api.groq.com/openai/v1 \
  LLM_API_KEY=gsk_... LLM_MODEL=llama-3.3-70b-versatile \
  node scripts/digest.mjs
```

## 정리 & 조직

- **자유 태그**: 주제(단일)와 별개로 문서마다 여러 태그를 달 수 있습니다. 추가
  화면의 태그 입력란(쉼표 구분, **기존 태그 자동완성** — 입력 중 현재 토큰으로 제안,
  ↑↓·Enter·클릭으로 선택) 또는 `POST /tag`. 검색에서 `#태그` 칩으로 필터링.
- **즐겨찾기**: 라이브러리(📚)에서 ☆/⭐ 토글, 또는 `POST /fav`. 검색에서 "⭐
  즐겨찾기만" 체크.
- **중복 정리**(🧹): `완전 동일`(contentHash)과 `유사`(센트로이드 코사인 ≥ 임계값)
  문서를 한 클러스터로 묶어 보여주고, 한 번에 병합합니다. 병합 시 태그는 합집합,
  즐겨찾기는 OR로 보존되고 나머지 문서는 삭제됩니다.

## 외부 API 연동 (전부 선택적·플러그러블·미설정 시 graceful)

키 없는 기본값으로도 완전히 돌지만, 환경변수만 올리면 품질·범위가 크게 확장됩니다.
모든 통합은 base URL 오버라이드가 있어 로컬 mock으로 검증됩니다(`scripts/mock-apis.mjs`).

| 연동 | 켜는 법 | 무엇이 좋아지나 |
|------|---------|----------------|
| **Jina 임베딩 v3** | `EMBED_PROVIDER=jina` + `JINA_API_KEY` | 다국어(한국어) 의미검색 품질↑ (384d로 요청해 스키마 호환) |
| **Jina 리랭커** | `RERANK=jina` + `JINA_API_KEY` | top-20 후보를 크로스인코더로 재정렬 → 정확도↑ |
| **웹 검색** | `SEARCH_PROVIDER=tavily\|brave\|jina` | `/research`로 라이브 검색·자동 저장 |
| **YouTube 자막** | (키 없음) | URL만 붙이면 전사 후 저장 |
| **서버측 LLM** | `LLM_BASE_URL`(+키/모델) | `/ask` RAG 답변 + 다이제스트 LLM 요약 (Groq/OpenRouter 무료) |

검증: `npm run mock:apis` (백그라운드) 후 `npm run smoke:apis`.

## 검색 UX

물어보기 화면에서 **주제 칩**(`/topics` facet)과 **기간**(전체/24시간/7일/30일)으로
범위를 좁히고, 결과 조각은 질의어가 **하이라이트된 스니펫**으로 보여줍니다. 필터는
서버 `/search`의 `topic`/`since`/`until`/`kind` 파라미터로 전달되어, libSQL 백엔드에선
SQL `WHERE`로 내려갑니다.

## 배포

상시 실행 Node 서버라 **장수 컨테이너 호스트**(Fly.io / Render / Docker / VPS)에
배포합니다. 자세한 단계는 [`docs/DEPLOY.md`](docs/DEPLOY.md).

- **인증**: `AUTH_TOKEN`을 설정하면 `/health`와 정적 셸을 제외한 모든 라우트가
  토큰을 요구합니다(헤더·`?token=`·`sb_token` 쿠키). UI는 처음 접속 시 토큰을
  물어 쿠키에 저장해, 이후 요청·북마클릿이 자동 인증됩니다. **공개 URL이면 필수.**
- **헬스체크**: `GET /health` → `{ok,backend}` (인증 없이 열림).
- **컨테이너**: `docker build -t second-brain . && docker run -p 8787:8787 -e AUTH_TOKEN=... second-brain`
- **영속성**: 컨테이너 디스크는 휘발성 → `STORE=libsql` + Turso 권장.
- **종료**: SIGTERM/SIGINT에 graceful shutdown.

```bash
# 로컬에서 프로덕션 모드로 띄워보기
AUTH_TOKEN=$(openssl rand -hex 24) STORE=libsql LIBSQL_URL=file:data/store.db npm start
```

## API

| 메서드 | 경로 | 바디 | 설명 |
|--------|------|------|------|
| POST | `/ingest` | `{url}` 또는 `{text, title?, topic?}` | 메모/URL 저장 |
| POST | `/ingest-file?name=` | 원시 파일 바이트 | `.md/.txt/.html/.json/.csv` 추출→저장 |
| GET | `/clip?text=&title=` 또는 `?url=` | — | 북마클릿 원클릭 클립 |
| POST | `/search` | `{query, k?, topic?, tag?, fav?, since?, until?, kind?}` | 의미 검색 + 필터 (+ 리랭크 켜져 있으면 자동 적용) |
| POST | `/ask` | `{query, k?, ...filters}` | RAG 답변(서버측 LLM) + 인용 출처. LLM 미설정 시 출처만 |
| POST | `/research` | `{query, max?, ingest?}` | 라이브 웹 검색, `ingest:true`면 결과를 저장 |
| GET | `/topics` | — | 주제 facet (이름 + 문서 수) |
| GET | `/tags` | — | 태그 facet (이름 + 문서 수) |
| GET | `/docs` | `?tag=&topic=&fav=1` | 문서 목록 (즐겨찾기/태그/주제 필터) |
| POST | `/tag` | `{docId, tags[]}` | 문서 태그 설정 |
| POST | `/fav` | `{docId, fav}` | 즐겨찾기 토글 |
| GET | `/duplicates` | `?threshold=0.92` | 중복/유사 문서 클러스터 탐지 |
| POST | `/merge` | `{keepDocId, dropDocIds[]}` | 클러스터 병합 (태그 합집합) |
| GET | `/telemetry` | — | 검색 경로 카운터 (native/backfill/jsFallback) |
| GET | `/health` | — | 헬스체크 `{ok,backend}` (인증 없이 열림) |
| GET | `/stats` | — | 저장된 docs/chunks 수 |
| GET/POST/DELETE | `/watches` | `{topic,url}` / `?id=` | 관심 주제 관리 |
| POST | `/collect` | — | 모든 주제 폴링 후 새 글 ingest |
| GET | `/digest` | `?hours=24` | 최근 N시간 다이제스트(markdown) |

## 구조

```
second-brain/
  server.mjs               # HTTP 서버 (ingest/search/stats/watches/collect/digest + 정적)
  lib/embed.mjs            # 플러그러블 임베딩 (local | hashing)
  lib/store.mjs            # 스토어 façade (ndjson | libsql 선택)
  lib/store-ndjson.mjs     # NDJSON 어댑터 (의존성 0)
  lib/store-libsql.mjs     # libSQL/Turso 어댑터 (네이티브 벡터 인덱스 + 폴백)
  lib/dedup.mjs            # 중복/유사 문서 클러스터링 + 병합
  lib/rerank.mjs           # 선택적 리랭킹 (Jina)
  lib/websearch.mjs        # 웹 검색 (tavily/brave/s.jina)
  lib/youtube.mjs          # 키리스 YouTube 자막 전사
  lib/llm.mjs              # OpenAI 호환 서버측 LLM
  lib/ingest.mjs           # Jina 추출 + 청킹
  lib/pipeline.mjs         # 공용 ingest 파이프라인 (모든 입력 채널 공유)
  lib/extract.mjs          # 파일 텍스트 추출 (md/html/json/csv)
  lib/feeds.mjs            # 관심 주제(구독) 관리 + seen 중복 제거
  lib/feedparse.mjs        # 의존성 0 RSS/Atom 파서
  lib/collect.mjs          # 폴링 → 새 글만 ingest
  lib/digest.mjs           # 추출식 다이제스트 생성
  lib/notify.mjs           # 전송 (console/file/ntfy/resend)
  public/index.html        # UI + Puter.js 답변 합성
  scripts/smoke.mjs        # 오프라인 E2E (검색)
  scripts/smoke-daily.mjs  # 오프라인 E2E (수집→다이제스트)
  scripts/smoke-inputs.mjs # 오프라인 E2E (파일/클립 추출→저장)
  scripts/smoke-search.mjs # 오프라인 E2E (주제/기간 필터 + facet)
  scripts/smoke-tags.mjs   # 오프라인 E2E (태그·즐겨찾기)
  scripts/smoke-dedup.mjs  # 오프라인 E2E (중복 탐지·병합)
  scripts/smoke-vector.mjs # libSQL 네이티브 벡터 패리티 (STORE=libsql)
  scripts/smoke-telemetry.mjs # libSQL 백필 telemetry (STORE=libsql)
  scripts/mock-apis.mjs    # 외부 API 로컬 mock
  scripts/smoke-apis.mjs   # 외부 API 연동 검증 (mock 대상)
  scripts/collect.mjs      # cron: 수집
  scripts/digest.mjs       # cron: 다이제스트 + 전송
  examples/github-actions-daily.yml
  launchers/                        # 데스크탑 런처 (start.sh/.bat, install-desktop.*)
  Dockerfile / .dockerignore        # 컨테이너 이미지
  fly.toml / render.yaml            # 배포 타깃
  scripts/patch-sharp.mjs           # transformers.js용 sharp 스텁 패치
  docs/DEPLOY.md                    # 배포 가이드
```

검증:
```bash
EMBED_PROVIDER=hashing npm run smoke         # 검색 파이프라인
EMBED_PROVIDER=hashing npm run smoke:daily   # 매일 루프
```

## 다음 단계 (의존도를 높이는 방향)

- **자동 수집**: n8n cron → 관심 주제 RSS/페이지를 매일 Jina로 긁어 자동 ingest
- **매일 다이제스트**: 저장된 새 조각을 요약해 Resend 이메일 / ntfy 푸시
- **영속 저장소**: NDJSON → Turso/D1 또는 Pinecone(2GB 영구무료)로 교체
- **음성 입력**: Whisper로 음성 메모 전사 후 ingest
