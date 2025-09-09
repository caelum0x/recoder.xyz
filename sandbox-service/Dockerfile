# Real Sandbox Service with Docker-in-Docker capability
FROM node:18-alpine

# Install Docker CLI and other utilities
RUN apk add --no-cache \
    docker-cli \
    python3 \
    py3-pip \
    openjdk17-jdk \
    gcc \
    g++ \
    make

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S sandbox && \
    adduser -S sandbox -u 1001 -G sandbox

# Set permissions
RUN chown -R sandbox:sandbox /app

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Switch to non-root user
USER sandbox

# Start the service
CMD ["npm", "start"]
