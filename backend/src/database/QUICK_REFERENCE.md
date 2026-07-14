# Database Explorer - Quick Reference Guide

## TL;DR - Security Status

✅ **SECURE** - No vulnerabilities, production-ready

## Basic Usage

### Connect to PostgreSQL

```typescript
import { connectionManager } from './database';

const result = await connectionManager.connect('project-id', {
  type: 'postgresql',
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'myuser',
  password: 'mypassword',
});

const connectionId = result.connectionId;
```

### Connect to SQLite

```typescript
const result = await connectionManager.connect('project-id', {
  type: 'sqlite',
  filename: 'database.db',
}, '/workspace/project-id');

const connectionId = result.connectionId;
```

### Execute Query (Parameterized - SAFE)

```typescript
import { queryExecutor } from './database';

const result = await queryExecutor.execute({
  connectionId: 'conn-123',
  projectId: 'project-id',
  query: 'SELECT * FROM users WHERE id = $1',  // PostgreSQL
  // query: 'SELECT * FROM users WHERE id = ?',  // SQLite
  params: [123],  // Parameters bound separately - NO injection
});

console.log(result.rows);
```

### Get Schema

```typescript
import { schemaInspector } from './database';

const schema = await schemaInspector.getSchemaOverview(
  connectionId,
  'project-id'
);

console.log(schema.data?.tables);
```

### Disconnect

```typescript
await connectionManager.disconnect(connectionId, 'project-id');
```

## Security Rules

### ✅ DO This

```typescript
// 1. Always use parameterized queries
await queryExecutor.execute({
  query: 'SELECT * FROM users WHERE id = $1',
  params: [userId]
});

// 2. Validate identifiers
const validation = validateIdentifier(tableName);
if (!validation.valid) throw new Error(validation.error);

// 3. Set encryption key
process.env.DATABASE_ENCRYPTION_KEY = '0123456789abcdef...';

// 4. Use connection limits
max: 5  // Reasonable limit

// 5. Enable SSL in production
ssl: { rejectUnauthorized: true }
```

### ❌ DON'T Do This

```typescript
// 1. NEVER concatenate user input
const query = `SELECT * FROM ${tableName}`;  // ❌ SQL injection!

// 2. NEVER use shell commands
exec(`psql -U ${user} -p ${password}`);  // ❌ Credentials in ps aux!

// 3. NEVER store unencrypted passwords
saveToFile({ password: plainPassword });  // ❌ Security breach!

// 4. NEVER skip validation
const query = `SELECT * FROM "${userInput}"`;  // ❌ No validation!

// 5. NEVER hard-code credentials
const password = 'my-password';  // ❌ Use environment variables!
```

## Common Patterns

### Safe Table Query

```typescript
// Validate table name
const validation = validateIdentifier(tableName);
if (!validation.valid) {
  return { error: validation.error };
}

// Use parameterized query
const result = await driver.query(
  `SELECT * FROM "${validation.sanitized}" LIMIT $1`,
  [limit]
);
```

### Safe User Input in WHERE Clause

```typescript
// PostgreSQL
await queryExecutor.execute({
  query: 'SELECT * FROM users WHERE email = $1 AND status = $2',
  params: [userEmail, userStatus]
});

// SQLite
await queryExecutor.execute({
  query: 'SELECT * FROM users WHERE email = ? AND status = ?',
  params: [userEmail, userStatus]
});
```

### Encrypt/Decrypt Credentials

```typescript
import { encryptCredential, decryptCredential } from './database';

// Encrypt before storing
const encrypted = encryptCredential(password);
saveToDatabase({ credentials: encrypted });

// Decrypt when needed
const loaded = loadFromDatabase();
const password = decryptCredential(loaded.credentials);
```

## Error Handling

```typescript
try {
  const result = await queryExecutor.execute({
    connectionId,
    projectId,
    query: 'SELECT * FROM users WHERE id = $1',
    params: [userId]
  });

  if (!result.success) {
    console.error('Query failed:', result.error);
    return;
  }

  console.log('Rows:', result.rows);
} catch (error) {
  console.error('Unexpected error:', error.message);
}
```

## Monitoring

### Get Query Stats

```typescript
const stats = queryExecutor.getStats();
console.log({
  total: stats.totalQueries,
  successful: stats.successfulQueries,
  failed: stats.failedQueries,
  avgTime: stats.averageExecutionTime
});
```

### Get Audit Log

```typescript
const log = queryExecutor.getAuditLog('project-id', 50);
log.forEach(entry => {
  console.log({
    time: new Date(entry.timestamp),
    query: entry.query,
    success: entry.success,
    duration: entry.executionTime
  });
});
```

### Get Connection Stats

```typescript
const stats = connectionManager.getStats();
console.log({
  total: stats.totalConnections,
  postgres: stats.connectionsByType.postgresql,
  sqlite: stats.connectionsByType.sqlite
});
```

## Environment Setup

### Required Environment Variables

```bash
# Encryption key (REQUIRED for production)
export DATABASE_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

### Dependencies

```json
{
  "dependencies": {
    "pg": "^8.13.1",
    "better-sqlite3": "^11.7.0"
  }
}
```

## Troubleshooting

### Problem: "Connection failed"

**PostgreSQL:**
```typescript
// Check credentials
// Check pg_hba.conf
// Verify network access
// Try with SSL disabled for testing: ssl: false
```

**SQLite:**
```typescript
// Check file path is within basePath
// Verify file exists (or set fileMustExist: false)
// Check file permissions
```

### Problem: "Invalid identifier format"

```typescript
// Table/column names must match: /^[a-zA-Z_][a-zA-Z0-9_$]*$/
// Use: user_id ✅
// Not: user-id ❌, user.id ❌, user id ❌
```

### Problem: "Path traversal detected"

```typescript
// SQLite paths must be within basePath
// Use relative paths: './database.db' ✅
// Not: '/absolute/path/db.db' ❌
// Not: '../../../etc/passwd' ❌
```

## Performance Tips

1. **Use connection pooling** (PostgreSQL)
   ```typescript
   max: 5  // Adjust based on load
   ```

2. **Set appropriate timeouts**
   ```typescript
   timeout: 30000  // 30 seconds
   ```

3. **Limit result sets**
   ```typescript
   limit: 1000  // Don't fetch millions of rows
   ```

4. **Use indexes** on database side
   ```sql
   CREATE INDEX idx_users_email ON users(email);
   ```

5. **Monitor query performance**
   ```typescript
   const stats = queryExecutor.getStats();
   if (stats.averageExecutionTime > 5000) {
     console.warn('Slow queries detected');
   }
   ```

## Security Checklist

Before deploying:

- [ ] Set `DATABASE_ENCRYPTION_KEY` environment variable
- [ ] Enable SSL for PostgreSQL (`ssl: true`)
- [ ] Use strong database passwords
- [ ] Configure firewall to restrict database access
- [ ] Enable database access logging
- [ ] Set up monitoring and alerting
- [ ] Review audit logs regularly
- [ ] Use read-only connections where appropriate
- [ ] Implement backup and recovery
- [ ] Test disaster recovery

## API Quick Reference

### ConnectionManager

```typescript
// Connect
await connectionManager.connect(projectId, params, basePath?)

// Disconnect
await connectionManager.disconnect(connectionId, projectId)

// Get connection
connectionManager.getConnection(connectionId, projectId)

// Get project connections
connectionManager.getProjectConnections(projectId)

// Stats
connectionManager.getStats()
```

### QueryExecutor

```typescript
// Execute query
await queryExecutor.execute({
  connectionId,
  projectId,
  query,
  params?,
  timeout?,
  limit?
})

// Audit log
queryExecutor.getAuditLog(projectId, limit?)

// Stats
queryExecutor.getStats()
```

### SchemaInspector

```typescript
// Schema overview
await schemaInspector.getSchemaOverview(connectionId, projectId, schema?)

// Table details
await schemaInspector.getTableDetails(connectionId, projectId, tableName, schema?)

// List schemas (PostgreSQL)
await schemaInspector.listSchemas(connectionId, projectId)

// Preview table
await schemaInspector.previewTable(connectionId, projectId, tableName, schema?, limit?)
```

## Limits & Defaults

| Setting | Default | Maximum |
|---------|---------|---------|
| Connections per project | - | 5 |
| Pool size (PostgreSQL) | 5 | 20 |
| Query timeout | 30s | 2min |
| Connection timeout | 10s | - |
| Idle timeout | 60s | - |
| Result rows | - | 10,000 |
| Query length | - | 100KB |
| Parameters | - | 1,000 |
| Identifier length | - | 128 |

## Need More Help?

- **Full Documentation:** `README.md`
- **Security Audit:** `SECURITY_AUDIT.md`
- **Security Summary:** `SECURITY_SUMMARY.md`
- **Test Examples:** `__tests__/security.test.ts`

---

**Remember:** Always use parameterized queries, validate inputs, and encrypt credentials!
