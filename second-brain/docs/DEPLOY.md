# 배포 가이드

Second Brain은 **상시 실행 Node 서버**(로컬 임베딩 모델 + 선택적 Turso)라
서버리스보다 **장수 컨테이너 호스트**(Fly.io / Render / Railway / VPS)가 자연스럽습니다.

## 0. 배포 전 필수: 인증

개인 지식베이스를 공개 URL에 그냥 올리면 안 됩니다. `AUTH_TOKEN`을 설정하면
`/health`와 정적 셸을 제외한 모든 라우트가 토큰을 요구합니다.

```bash
# 강한 토큰 생성
openssl rand -hex 24
```

토큰은 다음 중 하나로 전달됩니다(브라우저는 자동):
- `Authorization: Bearer <token>` 헤더
- `?token=<token>` 쿼리
- `sb_token` 쿠키 — UI가 처음 접속 시 토큰을 물어보고 쿠키에 저장하므로,
  이후 모든 요청과 북마클릿 이동이 자동으로 인증됩니다.

## 1. 영속성: Turso (멀티 인스턴스 / 재시작 안전)

컨테이너 디스크는 휘발성이라 `STORE=libsql` + 원격 Turso를 권장합니다.

```bash
# https://turso.tech (영구 무료 티어)
turso db create second-brain
turso db show second-brain --url           # libsql://...turso.io
turso db tokens create second-brain        # 토큰
```

## 2. Docker (어디서나)

```bash
docker build -t second-brain ./second-brain
docker run -p 8787:8787 \
  -e AUTH_TOKEN=$(openssl rand -hex 24) \
  -e STORE=libsql -e LIBSQL_URL=libsql://xxx.turso.io -e LIBSQL_AUTH_TOKEN=... \
  -e EMBED_PROVIDER=local \
  second-brain
# http://localhost:8787  (health: /health)
```

> 첫 검색 시 MiniLM 모델(~23MB)을 받습니다. 모델 캐시를 유지하려면
> `-v sb_models:/app/data` 볼륨을 붙이거나, 받기 싫으면 `EMBED_PROVIDER=hashing`.

## 3. Fly.io

```bash
cd second-brain
fly launch --no-deploy            # fly.toml 이미 포함됨, 앱 이름만 조정
fly secrets set AUTH_TOKEN=$(openssl rand -hex 24) \
  LIBSQL_URL=libsql://xxx.turso.io LIBSQL_AUTH_TOKEN=... NTFY_TOPIC=my-topic
fly deploy
```

`STORE=ndjson`(단일 머신)으로 쓰려면 `fly.toml`의 `[mounts]` 주석을 풀어
`/app/data` 볼륨을 붙이고 `fly volumes create sb_data`를 먼저 실행하세요.

## 4. Render.com

`render.yaml` 블루프린트 포함. **New → Blueprint**로 이 레포를 가리키고
(root: `second-brain`), 대시보드에서 `AUTH_TOKEN`·`LIBSQL_*`·`NTFY_TOPIC`을
시크릿으로 설정합니다. 헬스체크는 `/health`.

## 5. 매일 다이제스트 스케줄 (배포 후)

호스트의 cron이나 별도 GitHub Actions(`examples/github-actions-daily.yml`)에서
배포된 URL로 수집·다이제스트를 트리거하세요:

```bash
curl -H "Authorization: Bearer $AUTH_TOKEN" -X POST https://your-app/collect
curl -H "Authorization: Bearer $AUTH_TOKEN"          https://your-app/digest
```

## 메모리

로컬 MiniLM 모델은 여유 메모리가 필요합니다(512MB는 빠듯, **1GB 권장**).
메모리가 빠듯하면 `EMBED_PROVIDER=hashing`으로 모델 없이 운영할 수 있습니다.

## 서버리스(참고)

Cloudflare Workers/Vercel은 `node:fs`·로컬 모델·상시 프로세스 가정과 맞지 않아
권장하지 않습니다. 굳이 가려면 `STORE=libsql`(원격) + 임베딩을 외부 API로
교체하는 개조가 필요합니다.
