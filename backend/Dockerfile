# Multi-stage build for production optimization
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Copy source code
COPY . .

# Production stage
FROM node:18-alpine AS production

# Install security updates
RUN apk upgrade --no-cache && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S craftcode -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=craftcode:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=craftcode:nodejs /app/src ./src
COPY --from=builder --chown=craftcode:nodejs /app/package*.json ./

# Create directories for logs and temp files
RUN mkdir -p logs tmp && \
    chown -R craftcode:nodejs logs tmp

# Switch to non-root user
USER craftcode

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "src/server.js"]

# Metadata
LABEL maintainer="Craft Code Team"
LABEL version="1.0.0"
LABEL description="Craft Code Backend API Server"