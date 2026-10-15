# ==========================================
# Build Stage
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json tsconfig.json ./
COPY core/package.json ./core/
COPY sdk/package.json ./sdk/

# Copy source tree
COPY bin ./bin
COPY src ./src
COPY core ./core
COPY sdk ./sdk
COPY policies ./policies

# ==========================================
# Production Runtime Stage
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

# Create unprivileged application user
RUN addgroup -S aegis && adduser -S aegis -G aegis && \
    mkdir -p /app/data && chown -R aegis:aegis /app

# Copy runtime files from builder
COPY --from=builder --chown=aegis:aegis /app /app

# Switch to non-root user
USER aegis

# Persistent storage volume for WORM audit ledgers
VOLUME ["/app/data"]

EXPOSE 8080

ENTRYPOINT ["node", "--experimental-strip-types", "bin/aegis.ts"]
CMD ["mcp"]
