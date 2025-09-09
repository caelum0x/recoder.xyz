#!/bin/bash

# Go Code Runner Script
set -e

CODE="$1"
LANGUAGE="$2"
FILENAME="${3:-main}"

WORKSPACE="/workspace"
cd "$WORKSPACE"

# Create a temporary directory for the Go module
PROJECT_DIR="user_code_$(date +%s)"
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# Initialize Go module
go mod init usercode

# Write the user code to main.go
echo "$CODE" > main.go

# Create a basic go.mod with common dependencies
cat >> go.mod << 'EOF'

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/gorilla/mux v1.8.0
    github.com/labstack/echo/v4 v4.11.1
    gorm.io/gorm v1.25.4
    github.com/go-redis/redis/v8 v8.11.5
    github.com/stretchr/testify v1.8.4
    github.com/spf13/cobra v1.7.0
    github.com/spf13/viper v1.16.0
)
EOF

# Start timing
START_TIME=$(date +%s%3N)

# Download dependencies (if any are used)
echo "Downloading dependencies..."
go mod tidy -e 2>/dev/null || true

# Compile and run
echo "Compiling Go code..."
if go build -o user_program main.go 2>&1; then
    echo "Compilation successful. Running..."
    OUTPUT=$(timeout 30s ./user_program 2>&1)
    EXIT_CODE=$?
else
    OUTPUT=$(go build -o user_program main.go 2>&1)
    EXIT_CODE=1
fi

# End timing
END_TIME=$(date +%s%3N)
EXECUTION_TIME=$((END_TIME - START_TIME))

# Create JSON response
cat << EOF
{
  "success": $([ $EXIT_CODE -eq 0 ] && echo "true" || echo "false"),
  "output": $(echo "$OUTPUT" | jq -Rs .),
  "error": $([ $EXIT_CODE -ne 0 ] && echo "\"Compilation or runtime error\"" || echo "\"\""),
  "exitCode": $EXIT_CODE,
  "executionTime": $EXECUTION_TIME,
  "language": "$LANGUAGE",
  "filename": "$FILENAME"
}
EOF

# Cleanup
cd ..
rm -rf "$PROJECT_DIR"
