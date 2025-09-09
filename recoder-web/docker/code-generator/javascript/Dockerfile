# JavaScript/TypeScript Code Execution Container
FROM node:20-alpine

# Install security and build tools
RUN apk add --no-cache \
    dumb-init \
    su-exec \
    gcc \
    g++ \
    make \
    python3 \
    git

# Create non-root user for security
RUN addgroup -g 1001 -S coderunner && \
    adduser -S coderunner -u 1001 -G coderunner

# Set up workspace
WORKDIR /workspace
RUN chown -R coderunner:coderunner /workspace

# Install popular packages globally
RUN npm install -g \
    typescript \
    ts-node \
    nodemon \
    @types/node \
    jest \
    eslint \
    prettier \
    webpack \
    webpack-cli \
    vite \
    create-react-app \
    next \
    express \
    lodash \
    axios \
    moment \
    uuid \
    chalk \
    commander \
    inquirer

# Install Deno and Bun
RUN curl -fsSL https://deno.land/x/install/install.sh | sh && \
    curl -fsSL https://bun.sh/install | bash

# Add Deno and Bun to PATH
ENV PATH="/root/.deno/bin:/root/.bun/bin:$PATH"

# Copy execution scripts
COPY entrypoint.sh /entrypoint.sh
COPY execute.js /execute.js
RUN chmod +x /entrypoint.sh

# Security: Remove package managers for runtime
RUN rm -f /usr/local/bin/npm /usr/local/bin/yarn

# Set limits
ENV NODE_OPTIONS="--max-old-space-size=512"

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/entrypoint.sh"]
