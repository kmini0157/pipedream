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
npm install            # 의존성은 transformers.js 하나뿐
npm start              # http://localhost:8787 접속
```

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

## API

| 메서드 | 경로 | 바디 | 설명 |
|--------|------|------|------|
| POST | `/ingest` | `{url}` 또는 `{text, title?, topic?}` | 메모/URL 저장 |
| POST | `/ingest-file?name=` | 원시 파일 바이트 | `.md/.txt/.html/.json/.csv` 추출→저장 |
| GET | `/clip?text=&title=` 또는 `?url=` | — | 북마클릿 원클릭 클립 |
| POST | `/search` | `{query, k?}` | 의미 검색 (top-k 조각 + 출처) |
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
  lib/store-libsql.mjs     # libSQL/Turso 어댑터 (로컬 file: / 원격)
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
  scripts/collect.mjs      # cron: 수집
  scripts/digest.mjs       # cron: 다이제스트 + 전송
  examples/github-actions-daily.yml
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
