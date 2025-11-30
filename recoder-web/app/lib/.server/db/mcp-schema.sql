-- MCP (Model Context Protocol) Schema
-- Add MCP server management tables

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  args TEXT NOT NULL, -- JSON array as text
  env TEXT DEFAULT '{}', -- JSON object as text
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers(enabled);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_server_id ON mcp_servers(server_id);

CREATE TABLE IF NOT EXISTS mcp_tool_calls (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  params TEXT, -- JSON as text
  result TEXT, -- JSON as text
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_server ON mcp_tool_calls(server_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_created ON mcp_tool_calls(created_at);
