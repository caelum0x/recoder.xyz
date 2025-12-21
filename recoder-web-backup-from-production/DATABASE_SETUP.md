# Database Setup

## Quick Start

1. **Set your database URL** in `.env`:
```bash
DATABASE_URL="postgresql://user:password@localhost:5432/recoder"
```

2. **Run the initialization script**:
```bash
cd recoder-web
./scripts/init-db.sh
```

## Manual Setup

If you prefer to run schemas manually:

```bash
# Navigate to schema directory
cd app/lib/.server/db

# Run each schema file
psql $DATABASE_URL -f schema.sql
psql $DATABASE_URL -f chat-history-schema.sql
psql $DATABASE_URL -f templates-schema.sql
psql $DATABASE_URL -f projects-schema.sql
psql $DATABASE_URL -f mcp-schema.sql
```

## Tables Created

- `users` - User accounts
- `chat_sessions` - Chat conversation sessions
- `chat_messages` - Individual messages
- `projects` - Saved workbench projects
- `templates` - Project templates
- `mcp_servers` - MCP server configurations
- `mcp_tool_calls` - MCP tool usage logs
- `anonymous_sessions` - Anonymous user tracking

## Troubleshooting

**Error: "relation does not exist"**
- Run the initialization script to create missing tables

**Error: "permission denied"**
- Ensure your database user has CREATE privileges

**Error: "database does not exist"**
- Create the database first: `createdb recoder`
