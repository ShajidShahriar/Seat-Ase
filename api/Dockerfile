# ---- Seat Ase? API image (build from the repo root: docker build -f api/Dockerfile .) ----

FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# ---- Dependencies first, so code edits don't reinstall them ----

COPY package.json package-lock.json ./
COPY api/package.json api/
COPY shared/package.json shared/
RUN npm ci --omit=dev && npm cache clean --force

# ---- App code ----

COPY shared/ shared/
COPY api/ api/

WORKDIR /app/api
USER node
EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 4000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["sh", "docker-entrypoint.sh"]
