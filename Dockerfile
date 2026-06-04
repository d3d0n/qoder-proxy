FROM oven/bun:1-alpine

RUN apk add --no-cache su-exec

WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile

COPY qoder.ts qoder-baseprompt.json ./

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV QODER_RATE_LIMIT_PATH=/data/rate-limits.json
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["bun", "run", "qoder.ts"]
