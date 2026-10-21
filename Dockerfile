# ---- build: Vite bundle + seed data for the server ----
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && node scripts/export-seed.mjs > seed.json

# ---- runtime: one Node process, no npm dependencies ----
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data

COPY --from=build /app/server.js ./server.js
COPY --from=build /app/mailer.js ./mailer.js
COPY --from=build /app/seed.json ./seed.json
COPY --from=build /app/dist ./dist

RUN apk add --no-cache su-exec \
  && mkdir -p /data \
  && chown -R node:node /app /data

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# The entrypoint starts as root, fixes ownership of /data, then drops to PUID:PGID.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
