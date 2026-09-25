# ---- Seat Ase? web image (build from the repo root: docker build -f web/Dockerfile .) ----

FROM node:22-slim AS build

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json api/
COPY shared/package.json shared/
COPY web/package.json web/
RUN npm ci

COPY shared/ shared/
COPY web/ web/

# ---- The /api rewrite target is baked in at build time (red-team #43) ----

ARG API_URL=http://api:4000
ENV API_URL=$API_URL
RUN npm run build -w web

# ---- Run only the standalone server Next traced for us ----

FROM node:22-slim

ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app

COPY --from=build --chown=node:node /app/web/.next/standalone ./
COPY --from=build --chown=node:node /app/web/.next/static ./web/.next/static

USER node
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://localhost:3000/login').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "web/server.js"]
