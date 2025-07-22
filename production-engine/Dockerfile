# Production Engine Dockerfile
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install system dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S recoder -u 1001

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=recoder:nodejs /app/dist ./dist
COPY --from=builder --chown=recoder:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=recoder:nodejs /app/package*.json ./

# Create necessary directories
RUN mkdir -p /app/generated /app/logs /app/temp && \
    chown -R recoder:nodejs /app

# Switch to non-root user
USER recoder

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3002/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start command
CMD ["node", "dist/server.js"]

# Metadata
LABEL maintainer="Recoder Team"
LABEL version="1.0.0"
LABEL description="Recoder Production Engine - Real Code Generation Service"