#!/bin/bash

# Java Code Execution Entrypoint
set -e

# Set resource limits
ulimit -f 51200  # 50MB file size limit
ulimit -t 45     # 45 second CPU time limit
ulimit -v 1048576 # 1GB virtual memory limit
ulimit -n 256    # 256 open files limit

# Change to non-root user
exec sudo -u coderunner "$@"
