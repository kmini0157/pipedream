# 🧠 Second Brain

키 없이 동작하는 **개인 지식·기억 레이어**. 웹 링크나 메모를 던져두면 의미로
저장되고, 나중에 자연어로 물어보면 **출처와 함께** 답합니다. 저장이 쌓일수록
"그때 봤던 그거"를 사람보다 잘 찾아주므로, 쓸수록 못 떠나는 앱이 됩니다.

## 무료 스택 매핑

| 단계 | 사용 |
|------|------|
| 웹 추출 | **Jina Reader** (`r.jina.ai`, 키 없음) |
| 임베딩 | **transformers.js** all-MiniLM-L6-v2 (로컬·키 없음·오프라인) |
| 저장/검색 | NDJSON + 코사인 유사도 (네이티브 의존성 0) |
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

## API

| 메서드 | 경로 | 바디 | 설명 |
|--------|------|------|------|
| POST | `/ingest` | `{url}` 또는 `{text, title?}` | 추출→청킹→임베딩→저장 |
| POST | `/search` | `{query, k?}` | 의미 검색 (top-k 조각 + 출처) |
| GET | `/stats` | — | 저장된 docs/chunks 수 |

## 구조

```
second-brain/
  server.mjs          # 의존성 0 HTTP 서버 (ingest/search/stats + 정적)
  lib/embed.mjs       # 플러그러블 임베딩 (local | hashing)
  lib/store.mjs       # NDJSON 벡터 스토어 + 코사인 검색
  lib/ingest.mjs      # Jina 추출 + 청킹
  public/index.html   # UI + Puter.js 답변 합성
  scripts/smoke.mjs   # 오프라인 E2E 테스트
```

## 다음 단계 (의존도를 높이는 방향)

- **자동 수집**: n8n cron → 관심 주제 RSS/페이지를 매일 Jina로 긁어 자동 ingest
- **매일 다이제스트**: 저장된 새 조각을 요약해 Resend 이메일 / ntfy 푸시
- **영속 저장소**: NDJSON → Turso/D1 또는 Pinecone(2GB 영구무료)로 교체
- **음성 입력**: Whisper로 음성 메모 전사 후 ingest
