# syntax=docker/dockerfile:1

# ---- Base ----
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- Builder ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
# Precompile the seed so the runtime image doesn't need tsx. Only the native
# Prisma client is kept external (resolved from node_modules at runtime); all
# other deps are bundled. CommonJS output keeps nodemailer's dynamic requires
# working.
RUN npx esbuild prisma/seed.ts --bundle --platform=node --format=cjs \
    --external:@prisma/client --external:.prisma --outfile=seed.cjs

# ---- Runner ----
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Standalone Next.js server + assets.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma schema/migrations + CLI + engines for `migrate deploy`, and the seed.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/seed.cjs ./seed.cjs
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh \
    && mkdir -p /data/uploads \
    && chown -R nextjs:nodejs /app /data

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["./docker-entrypoint.sh"]
