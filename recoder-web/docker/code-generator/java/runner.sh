#!/bin/bash

# Java Code Runner Script
set -e

CODE="$1"
LANGUAGE="$2"
FILENAME="${3:-Main}"

WORKSPACE="/workspace"
cd "$WORKSPACE"

# Create a temporary directory
PROJECT_DIR="user_code_$(date +%s)"
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# Extract class name from code (simple regex)
CLASS_NAME=$(echo "$CODE" | grep -oP 'public\s+class\s+\K\w+' | head -1)
if [ -z "$CLASS_NAME" ]; then
    CLASS_NAME="$FILENAME"
fi

# Write the user code
echo "$CODE" > "${CLASS_NAME}.java"

# Start timing
START_TIME=$(date +%s%3N)

echo "Compiling Java code..."
if javac -cp ".:*" "${CLASS_NAME}.java" 2>&1; then
    echo "Compilation successful. Running..."
    OUTPUT=$(timeout 30s java -cp ".:*" -Xmx256m "$CLASS_NAME" 2>&1)
    EXIT_CODE=$?
else
    OUTPUT=$(javac -cp ".:*" "${CLASS_NAME}.java" 2>&1)
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
  "filename": "$CLASS_NAME"
}
EOF

# Cleanup
cd ..
rm -rf "$PROJECT_DIR"
