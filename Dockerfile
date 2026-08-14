# ffmpeg is here for ffprobe, which reads video duration and creation time.
# Without it, video freshness falls back to the device file date and every
# video upload gets flagged in /admin.
FROM node:22-slim AS build

WORKDIR /app

# better-sqlite3 compiles a native addon, so the build stage needs a toolchain.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build && npm prune --omit=dev


FROM node:22-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY public ./public

# Mount a volume here. Everything worth keeping (SQLite + uploaded media) lives
# under it; the rest of the container is disposable.
VOLUME ["/data"]

EXPOSE 3000
CMD ["node", "dist/server.js"]
