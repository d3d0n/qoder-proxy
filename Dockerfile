FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile

COPY qoder.ts qoder-baseprompt.json ./

RUN mkdir -p /data && chown bun:bun /data
VOLUME /data

ENV QODER_RATE_LIMIT_PATH=/data/rate-limits.json
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

USER bun

CMD ["bun", "run", "qoder.ts"]
