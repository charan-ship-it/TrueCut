# One image for both services (web and worker); the start command picks the role.
# Based on Playwright's image so headless Chromium and its system libraries match the npm package.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    TRUECUT_DATA=/data
WORKDIR /app

# dependencies first, so code changes don't reinstall them
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/config/package.json packages/config/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/engine/package.json packages/engine/
COPY packages/queue/package.json packages/queue/
COPY packages/shared/package.json packages/shared/
COPY packages/storage/package.json packages/storage/
RUN npm ci --include=dev --no-audit --no-fund

COPY . .
RUN npm run build && mkdir -p /data

COPY docker/entrypoint.sh /usr/local/bin/truecut
RUN chmod +x /usr/local/bin/truecut
EXPOSE 3100
ENTRYPOINT ["truecut"]
CMD ["web"]
