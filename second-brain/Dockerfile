# Second Brain — production image. Long-running Node HTTP server.
FROM node:20-slim

WORKDIR /app

# Install deps without native build scripts (we don't need sharp's binary),
# then patch the sharp stub so transformers.js can import cleanly.
COPY package.json package-lock.json* ./
COPY scripts/patch-sharp.mjs ./scripts/patch-sharp.mjs
RUN npm install --omit=dev --ignore-scripts \
 && node scripts/patch-sharp.mjs \
 && npm cache clean --force

COPY . .

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    EMBED_PROVIDER=local \
    STORE=ndjson

EXPOSE 8787

# Container-native health check (also used by Fly/Render).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
