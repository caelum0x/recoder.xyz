#!/bin/bash

# C++ Code Runner Script
set -e

CODE="$1"
LANGUAGE="$2"
FILENAME="${3:-main}"

WORKSPACE="/workspace"
cd "$WORKSPACE"

# Create a temporary directory
PROJECT_DIR="user_code_$(date +%s)"
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# Determine file extension
if [[ "$LANGUAGE" == "c" ]]; then
    EXT="c"
    COMPILER="gcc"
    STD_FLAG="-std=c11"
else
    EXT="cpp"
    COMPILER="g++"
    STD_FLAG="-std=c++20"
fi

# Write the user code
echo "$CODE" > "$FILENAME.$EXT"

# Start timing
START_TIME=$(date +%s%3N)

# Compile flags
COMPILE_FLAGS="$STD_FLAG -Wall -Wextra -O2 -pthread"

# Add common include paths
INCLUDE_FLAGS="-I/opt/vcpkg/installed/x64-linux/include"
LINK_FLAGS="-L/opt/vcpkg/installed/x64-linux/lib"

echo "Compiling $LANGUAGE code..."
if $COMPILER $COMPILE_FLAGS $INCLUDE_FLAGS $LINK_FLAGS "$FILENAME.$EXT" -o user_program 2>&1; then
    echo "Compilation successful. Running..."
    OUTPUT=$(timeout 30s ./user_program 2>&1)
    EXIT_CODE=$?
else
    OUTPUT=$($COMPILER $COMPILE_FLAGS $INCLUDE_FLAGS $LINK_FLAGS "$FILENAME.$EXT" -o user_program 2>&1)
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
