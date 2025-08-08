# Multi-stage build for production optimization
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ && \
    rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci --ignore-scripts && \
    npm cache clean --force

# Copy source code
COPY src ./src
COPY prisma ./prisma

# Build TypeScript and generate Prisma client
RUN npm run build && \
    npx prisma generate

# Production stage
FROM node:20-alpine AS production

# Install security updates and required packages
RUN apk upgrade --no-cache && \
    apk add --no-cache \
        dumb-init \
        curl \
        ca-certificates && \
    rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S recoder && \
    adduser -S recoder -u 1001 -G recoder

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=recoder:recoder /app/node_modules ./node_modules
COPY --from=builder --chown=recoder:recoder /app/dist ./dist
COPY --from=builder --chown=recoder:recoder /app/src ./src
COPY --from=builder --chown=recoder:recoder /app/prisma ./prisma
COPY --from=builder --chown=recoder:recoder /app/package*.json ./

# Create directories for logs, tmp, and uploads
RUN mkdir -p logs tmp uploads cache && \
    chown -R recoder:recoder logs tmp uploads cache

# Install production dependencies only
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Switch to non-root user
USER recoder

# Expose port (configurable via environment)
EXPOSE 3001

# Health check with better error handling
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

# Set production environment
ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=warn

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application with proper signal handling
CMD ["node", "dist/server.js"]

# Enhanced metadata for production
LABEL maintainer="Recoder.xyz Team <hello@recoder.xyz>"
LABEL version="2.0.0"
LABEL description="Recoder.xyz Production Backend API Server"
LABEL org.opencontainers.image.title="Recoder Backend"
LABEL org.opencontainers.image.description="Enterprise AI-powered development backend"
LABEL org.opencontainers.image.vendor="Recoder.xyz"
LABEL org.opencontainers.image.licenses="MIT"