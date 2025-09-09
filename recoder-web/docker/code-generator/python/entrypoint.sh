#!/bin/sh

# Python Code Execution Entrypoint
set -e

# Set resource limits
ulimit -f 10240  # 10MB file size limit
ulimit -t 30     # 30 second CPU time limit
ulimit -v 512000 # 512MB virtual memory limit
ulimit -n 256    # 256 open files limit

# Change to non-root user
exec su-exec coderunner:coderunner "$@"
