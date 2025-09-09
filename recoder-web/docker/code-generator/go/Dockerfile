# Go Code Execution Container
FROM golang:1.21-alpine

# Install security and build tools
RUN apk add --no-cache \
    dumb-init \
    su-exec \
    gcc \
    g++ \
    make \
    musl-dev \
    git \
    jq

# Create non-root user for security
RUN addgroup -g 1001 -S coderunner && \
    adduser -S coderunner -u 1001 -G coderunner

# Set up workspace
WORKDIR /workspace
RUN chown -R coderunner:coderunner /workspace

# Install common Go tools
RUN go install golang.org/x/tools/cmd/goimports@latest && \
    go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest && \
    go install golang.org/x/tools/cmd/godoc@latest

# Pre-download common modules
RUN cd /tmp && \
    go mod init temp && \
    go get github.com/gin-gonic/gin@latest && \
    go get github.com/gorilla/mux@latest && \
    go get github.com/labstack/echo/v4@latest && \
    go get gorm.io/gorm@latest && \
    go get github.com/go-redis/redis/v8@latest && \
    go get github.com/stretchr/testify@latest && \
    go get github.com/spf13/cobra@latest && \
    go get github.com/spf13/viper@latest && \
    rm -rf /tmp/*

# Copy execution scripts
COPY entrypoint.sh /entrypoint.sh
COPY runner.sh /runner.sh
RUN chmod +x /entrypoint.sh /runner.sh

# Set Go environment
ENV GO111MODULE=on
ENV GOPROXY=https://proxy.golang.org,direct
ENV GOSUMDB=sum.golang.org

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/entrypoint.sh"]
