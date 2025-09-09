#!/bin/sh

# Rust Code Execution Entrypoint
set -e

# Set resource limits
ulimit -f 51200  # 50MB file size limit (Rust binaries can be large)
ulimit -t 60     # 60 second CPU time limit (compilation takes time)
ulimit -v 1048576 # 1GB virtual memory limit
ulimit -n 256    # 256 open files limit

# Change to non-root user
exec su-exec coderunner:coderunner "$@"
