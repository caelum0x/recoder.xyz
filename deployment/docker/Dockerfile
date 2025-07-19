# CodeCraft CLI - Multi-stage Docker build
# Optimized for production deployment with minimal footprint

# Build stage
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/*/package*.json ./packages/*/

# Install dependencies
RUN npm ci --only=production --silent

# Copy source code
COPY . .

# Build the application
RUN npm run build:core && \
    npm run build:pkg -- --targets node18-linux-x64 && \
    chmod +x build/codecraft-linux-x64

# Production stage
FROM alpine:3.18 AS production

# Install runtime dependencies
RUN apk add --no-cache \
    nodejs \
    npm \
    git \
    bash \
    curl \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 codecraft && \
    adduser -D -u 1001 -G codecraft codecraft

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder /app/build/codecraft-linux-x64 /usr/local/bin/codecraft
COPY --from=builder /app/package.json ./
COPY --from=builder /app/README.md ./
COPY --from=builder /app/LICENSE ./

# Set permissions
RUN chmod +x /usr/local/bin/codecraft && \
    chown -R codecraft:codecraft /app

# Create directories for user data
RUN mkdir -p /home/codecraft/.codecraft && \
    chown -R codecraft:codecraft /home/codecraft

# Switch to non-root user
USER codecraft

# Set environment variables
ENV NODE_ENV=production
ENV CODECRAFT_HOME=/home/codecraft/.codecraft
ENV PATH="/usr/local/bin:${PATH}"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD codecraft --version || exit 1

# Expose volume for user data
VOLUME ["/home/codecraft/.codecraft"]

# Set entrypoint
ENTRYPOINT ["codecraft"]
CMD ["--help"]

# Development stage
FROM node:18-alpine AS development

# Install development dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl \
    bash \
    vim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci --silent

# Set environment
ENV NODE_ENV=development
ENV CODECRAFT_DEV_MODE=true

# Expose port for development server
EXPOSE 3000

# Set entrypoint for development
ENTRYPOINT ["npm", "run"]
CMD ["dev"]

# Multi-architecture support
FROM production AS final
ARG TARGETPLATFORM
ARG BUILDPLATFORM

# Copy architecture-specific binary if available
RUN if [ "$TARGETPLATFORM" = "linux/arm64" ]; then \
        if [ -f /app/build/codecraft-linux-arm64 ]; then \
            cp /app/build/codecraft-linux-arm64 /usr/local/bin/codecraft; \
        fi; \
    fi

# Labels for metadata
LABEL org.opencontainers.image.title="CodeCraft CLI" \
      org.opencontainers.image.description="Intelligent code generation and project management CLI tool" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.vendor="CodeCraft Team" \
      org.opencontainers.image.url="https://codecraft.dev" \
      org.opencontainers.image.source="https://github.com/recoder-team/recoder" \
      org.opencontainers.image.documentation="https://codecraft.dev/docs" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.created="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
      maintainer="CodeCraft Team <team@codecraft.dev>"