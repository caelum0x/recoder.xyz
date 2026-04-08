#!/bin/bash
# A2A Inbox Check Hook
# Runs at the start of each Claude Code session to check for pending tasks
# This is a PostToolUse hook that fires periodically

# Only check if the recoder MCP server is configured
if ! command -v claude &>/dev/null; then
  exit 0
fi

# Write a reminder file that Claude Code will see
INBOX_FILE="/tmp/recoder-a2a-inbox-reminder"
echo "Check your A2A inbox: call recoder_inbox to see pending tasks from other agents." > "$INBOX_FILE"
echo "Last checked: $(date)" >> "$INBOX_FILE"
