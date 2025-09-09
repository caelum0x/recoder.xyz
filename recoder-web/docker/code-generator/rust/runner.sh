#!/bin/bash

# Rust Code Runner Script
set -e

CODE="$1"
LANGUAGE="$2"
FILENAME="${3:-main}"

WORKSPACE="/workspace"
cd "$WORKSPACE"

# Create a new Cargo project
PROJECT_NAME="user_code_$(date +%s)"
cargo init --name "$PROJECT_NAME" "$PROJECT_NAME" --quiet

cd "$PROJECT_NAME"

# Write the user code to main.rs
echo "$CODE" > src/main.rs

# Add common dependencies to Cargo.toml
cat >> Cargo.toml << 'EOF'

[dependencies]
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1.0", features = ["rt", "macros"] }
reqwest = { version = "0.11", features = ["json"] }
clap = { version = "4.0", features = ["derive"] }
anyhow = "1.0"
thiserror = "1.0"
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1.0", features = ["v4"] }
rand = "0.8"
EOF

# Start timing
START_TIME=$(date +%s%3N)

# Compile and run
echo "Compiling Rust code..."
if cargo build --quiet 2>&1; then
    echo "Compilation successful. Running..."
    OUTPUT=$(timeout 30s cargo run --quiet 2>&1)
    EXIT_CODE=$?
else
    OUTPUT=$(cargo build 2>&1)
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
rm -rf "$PROJECT_NAME"
