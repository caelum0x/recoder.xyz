# JavaScript/Node.js Code Execution Environment
FROM node:18-alpine

# Install security tools and runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    tini \
    curl \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Create non-root user for code execution
RUN addgroup -g 1001 -S codeuser && \
    adduser -S codeuser -u 1001 -G codeuser

# Set up workspace
WORKDIR /workspace
RUN chown -R codeuser:codeuser /workspace

# Install common packages for code execution
RUN npm install -g typescript ts-node nodemon

# Install popular npm packages that users might need
COPY package.json /workspace/
RUN npm install && npm cache clean --force

# Security: Limit file system access
RUN mkdir -p /tmp/code-output && \
    chown codeuser:codeuser /tmp/code-output && \
    chmod 755 /tmp/code-output

# Copy execution scripts
COPY execute.js /usr/local/bin/execute
COPY package-manager.js /usr/local/bin/package-manager
RUN chmod +x /usr/local/bin/execute /usr/local/bin/package-manager

# Switch to non-root user
USER codeuser

# Set resource limits
ENV NODE_OPTIONS="--max-old-space-size=512"
ENV EXECUTION_TIMEOUT=30000
ENV MAX_OUTPUT_SIZE=1048576

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

# Default command
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "/usr/local/bin/execute"]