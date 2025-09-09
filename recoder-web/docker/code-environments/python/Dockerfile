# Python Code Execution Environment
FROM python:3.11-alpine

# Install security tools and runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    tini \
    curl \
    ca-certificates \
    gcc \
    musl-dev \
    linux-headers \
    && rm -rf /var/cache/apk/*

# Create non-root user for code execution
RUN addgroup -g 1001 -S codeuser && \
    adduser -S codeuser -u 1001 -G codeuser

# Set up workspace
WORKDIR /workspace
RUN chown -R codeuser:codeuser /workspace

# Install common Python packages
COPY requirements.txt /workspace/
RUN pip install --no-cache-dir -r requirements.txt

# Security: Limit file system access
RUN mkdir -p /tmp/code-output && \
    chown codeuser:codeuser /tmp/code-output && \
    chmod 755 /tmp/code-output

# Copy execution scripts
COPY execute.py /usr/local/bin/execute
COPY package_manager.py /usr/local/bin/package-manager
RUN chmod +x /usr/local/bin/execute /usr/local/bin/package-manager

# Switch to non-root user
USER codeuser

# Set resource limits and security
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV EXECUTION_TIMEOUT=30
ENV MAX_OUTPUT_SIZE=1048576
ENV PYTHONPATH=/workspace

# Disable some dangerous modules
ENV PYTHONSTARTUP=/dev/null

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "print('healthy')" || exit 1

# Default command
ENTRYPOINT ["dumb-init", "--"]
CMD ["python", "/usr/local/bin/execute"]