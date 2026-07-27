# Hanmadi — Next.js 16 (standalone) 컨테이너 for GCP Cloud Run
# 로컬 docker 없이 `gcloud run deploy --source .` 로 Cloud Build가 이 파일로 빌드한다.

# ── 1) 의존성 설치 ──────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── 2) 빌드 ─────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# 빌드 타임에 필요한 환경변수는 없다(전부 런타임 process.env). 폰트는 빌드 시 자체호스팅됨.
RUN npm run build

# ── 3) 실행 (경량 런타임) ───────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run은 PORT를 주입한다(기본 8080). standalone server.js가 이를 읽는다.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
