# syntax=docker/dockerfile:1.7
# One image, two Cloud Run services (web + jobs) and one Cloud Run Job (migrate).

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time placeholders only: real values come from Cloud Run at runtime.
# NEXT_PUBLIC_* values are inlined into the client bundle, so pass them as build args.
ARG NEXT_PUBLIC_APP_URL=https://goods.et
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN DATABASE_URL=postgres://build:build@localhost:5432/build \
    SESSION_SECRET=build-only-secret-build-only-secret-000 \
    npx next build
# Self-contained migration runner (no tsx/devDependencies at runtime).
RUN npx esbuild scripts/migrate.ts --bundle --platform=node --target=node22 \
    --format=esm --outfile=dist/migrate.mjs \
    --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid app app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --from=build --chown=app:app /app/dist/migrate.mjs ./migrate.mjs
USER app
EXPOSE 8080
CMD ["node", "server.js"]
