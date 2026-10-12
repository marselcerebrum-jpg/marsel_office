# syntax=docker/dockerfile:1
# Node 22.13+ diperlukan untuk modul bawaan node:sqlite.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/app/storage/office.db \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning
RUN groupadd --system app && useradd --system --gid app --home /app app \
    && mkdir -p /app/storage && chown app:app /app/storage
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Data agen dibaca saat runtime; salin eksplisit (jangan andalkan file tracing).
COPY --from=build --chown=app:app /app/data/agents.json /app/data/agent-bodies.json /app/data/divisions.json /app/data/runbooks.json /app/data/leads.json ./data/
RUN rm -f ./data/office.db*
USER app
EXPOSE 3000
VOLUME ["/app/storage"]
CMD ["node", "server.js"]
