# Database Explorer - Secure Implementation

A secure, production-ready database exploration and query execution system for PostgreSQL and SQLite databases.

## 🔒 Security Overview

This implementation is designed with **security-first principles**:

- ✅ **NO SQL Injection** - All queries use parameterized statements
- ✅ **NO Shell Commands** - Pure database drivers, no shell execution
- ✅ **Encrypted Credentials** - AES-256-GCM encryption for passwords
- ✅ **Connection Pooling** - Efficient resource management
- ✅ **Input Validation** - Strict validation for all user inputs
- ✅ **Path Traversal Protection** - SQLite files restricted to workspace
- ✅ **Audit Logging** - All queries logged for security monitoring

## 📦 Architecture

```
database/
├── index.ts                  # Main exports
├── connection-manager.ts     # Connection management & encryption
├── query-executor.ts         # Query execution with security checks
├── schema-inspector.ts       # Safe schema exploration
├── drivers/
│   ├── postgresql.ts        # PostgreSQL driver (uses 'pg')
│   └── sqlite.ts            # SQLite driver (uses 'better-sqlite3')
└── __tests__/
    └── security.test.ts     # Comprehensive security tests
```

## 🚀 Quick Start

### Installation

```bash
npm install pg better-sqlite3
npm install --save-dev @types/pg @types/better-sqlite3
```

### Usage

```typescript
import { connectionManager, queryExecutor, schemaInspector } from './database';

// 1. Connect to PostgreSQL
const pgResult = await connectionManager.connect('project-id', {
  type: 'postgresql',
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'myuser',
  password: 'mypassword',  // Encrypted at rest
  ssl: false,
});

if (pgResult.success) {
  const connectionId = pgResult.connectionId!;

  // 2. Get schema overview
  const schema = await schemaInspector.getSchemaOverview(connectionId, 'project-id');
  console.log('Tables:', schema.data?.tables);

  // 3. Execute query (parameterized - SAFE)
  const result = await queryExecutor.execute({
    connectionId,
    projectId: 'project-id',
    query: 'SELECT * FROM users WHERE id = $1',
    params: [123],  // Parameters bound separately - NO injection possible
  });

  console.log('Rows:', result.rows);

  // 4. Disconnect
  await connectionManager.disconnect(connectionId, 'project-id');
}
```

### SQLite Example

```typescript
import { connectionManager } from './database';

const result = await connectionManager.connect('project-id', {
  type: 'sqlite',
  filename: 'database.db',  // Path validated against basePath
  readonly: false,
}, '/workspace/project-id');

// Use same API as PostgreSQL
```

## 🔐 Security Features

### 1. Parameterized Queries Only

**PostgreSQL:**
```typescript
// ✅ SAFE - Parameterized query
await queryExecutor.execute({
  query: 'SELECT * FROM users WHERE email = $1',
  params: ['user@example.com'],
});

// ❌ NEVER DO THIS (not possible in this implementation)
// const email = "user@example.com'; DROP TABLE users--";
// await query(`SELECT * FROM users WHERE email = '${email}'`);
```

**SQLite:**
```typescript
// ✅ SAFE - Uses prepared statements
await queryExecutor.execute({
  query: 'SELECT * FROM users WHERE id = ?',
  params: [123],
});
```

### 2. Credential Encryption

```typescript
import { encryptCredential, decryptCredential } from './database';

// Encrypt sensitive data
const encrypted = encryptCredential('my-password');
// {
//   iv: 'base64...',
//   authTag: 'base64...',
//   encrypted: 'base64...'
// }

// Decrypt when needed
const password = decryptCredential(encrypted);

// Uses AES-256-GCM with:
// - Random IV per encryption
// - Authentication tag for tamper detection
// - Key from environment: DATABASE_ENCRYPTION_KEY
```

### 3. Input Validation

All identifiers (table names, column names, etc.) are strictly validated:

```typescript
// ✅ Valid identifiers
validateIdentifier('users');           // Valid
validateIdentifier('user_id');         // Valid
validateIdentifier('_private_table');  // Valid

// ❌ Injection attempts blocked
validateIdentifier("users; DROP TABLE users--");  // Invalid
validateIdentifier("users' OR '1'='1");           // Invalid
validateIdentifier("users/**/UNION/**/SELECT");   // Invalid
```

**Validation Rules:**
- Must match: `/^[a-zA-Z_][a-zA-Z0-9_$]*$/`
- Maximum length: 128 characters
- No special characters, spaces, or SQL keywords

### 4. Path Traversal Protection (SQLite)

```typescript
// ✅ Valid paths (within workspace)
validateDatabasePath('database.db', '/workspace/project-123');
validateDatabasePath('data/users.sqlite', '/workspace/project-123');

// ❌ Blocked paths
validateDatabasePath('../../../etc/passwd', '/workspace/project-123');  // Blocked
validateDatabasePath('/etc/shadow', '/workspace/project-123');          // Blocked
```

### 5. Query Analysis

Automatically detects suspicious patterns:

```typescript
const analysis = analyzeQuery("SELECT * FROM users; DROP TABLE users--");

// analysis.suspicious === true
// analysis.warnings === [
//   "Suspicious pattern detected: ...",
//   "Multiple statements detected"
// ]
```

**Detected Patterns:**
- SQL comments: `--`, `/* */`
- Multiple statements: `;`
- UNION injection: `UNION ALL SELECT`
- Time-based attacks: `SLEEP`, `BENCHMARK`, `PG_SLEEP`
- File operations: `INTO OUTFILE`, `LOAD_FILE`
- Stacked queries: `; DROP`, `; DELETE`, `; UPDATE`

### 6. Connection Security

**PostgreSQL Connection Pooling:**
```typescript
{
  max: 5,                          // Max connections per pool (limit: 20)
  connectionTimeoutMillis: 10000,  // 10 second timeout
  idleTimeoutMillis: 30000,        // 30 second idle timeout
}
```

**Connection Limits:**
- Maximum 5 connections per project
- Automatic cleanup of idle connections (60s)
- No credentials in command line or process list

### 7. Error Message Sanitization

All errors are sanitized before being returned:

```typescript
// Original error:
// "Connection failed to postgresql://user:password@192.168.1.100:5432/db"

// Sanitized error:
// "Connection failed to [connection_string]"
```

**Sanitization Rules:**
- File paths → `[path]`
- Connection strings → `[connection_string]`
- IP addresses → `[ip_address]`
- Passwords → `password=[hidden]`

## 📊 API Reference

### ConnectionManager

```typescript
// Connect to database
await connectionManager.connect(
  projectId: string,
  params: PostgresConnectionParams | SqliteConnectionParams,
  basePath?: string
): Promise<{ success: boolean; connectionId?: string; error?: string }>

// Disconnect
await connectionManager.disconnect(
  connectionId: string,
  projectId: string
): Promise<{ success: boolean; error?: string }>

// Get connection (verifies project ownership)
connectionManager.getConnection(
  connectionId: string,
  projectId: string
): DatabaseConnection | null

// Get project connections
connectionManager.getProjectConnections(
  projectId: string
): DatabaseConnection[]

// Disconnect all project connections
await connectionManager.disconnectProject(projectId: string): Promise<void>

// Get statistics
connectionManager.getStats(): {
  totalConnections: number;
  connectionsByType: Record<DatabaseType, number>;
  connectionsByProject: Record<string, number>;
}
```

### QueryExecutor

```typescript
// Execute parameterized query
await queryExecutor.execute({
  connectionId: string;
  projectId: string;
  query: string;
  params?: unknown[];
  timeout?: number;  // Max 2 minutes
  limit?: number;    // Max 10,000 rows
}): Promise<QueryResult>

// Get audit log
queryExecutor.getAuditLog(
  projectId: string,
  limit?: number
): Array<{
  timestamp: number;
  projectId: string;
  connectionId: string;
  query: string;
  params: unknown[];
  success: boolean;
  error?: string;
  executionTime: number;
}>

// Get statistics
queryExecutor.getStats(): {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  averageExecutionTime: number;
}
```

### SchemaInspector

```typescript
// Get schema overview
await schemaInspector.getSchemaOverview(
  connectionId: string,
  projectId: string,
  schema?: string
): Promise<{ success: boolean; data?: SchemaOverview; error?: string }>

// Get table details
await schemaInspector.getTableDetails(
  connectionId: string,
  projectId: string,
  tableName: string,
  schema?: string
): Promise<{ success: boolean; data?: TableDetails; error?: string }>

// List schemas (PostgreSQL only)
await schemaInspector.listSchemas(
  connectionId: string,
  projectId: string
): Promise<{ success: boolean; schemas?: string[]; error?: string }>

// Preview table data
await schemaInspector.previewTable(
  connectionId: string,
  projectId: string,
  tableName: string,
  schema?: string,
  limit?: number  // Max 1000 rows
): Promise<{
  success: boolean;
  rows?: Record<string, unknown>[];
  columns?: string[];
  error?: string;
}>
```

## 🔧 Configuration

### Environment Variables

```bash
# Encryption key for credentials (32 bytes hex)
DATABASE_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# If not set, a random key is generated (NOT recommended for production)
```

**Generate a secure key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Database Drivers

**PostgreSQL:**
```json
{
  "dependencies": {
    "pg": "^8.13.1"
  },
  "devDependencies": {
    "@types/pg": "^8.11.10"
  }
}
```

**SQLite:**
```json
{
  "dependencies": {
    "better-sqlite3": "^11.7.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11"
  }
}
```

## 🧪 Testing

Run security tests:

```bash
npm test src/database/__tests__/security.test.ts
```

Test coverage includes:
- Credential encryption/decryption
- SQL injection prevention
- Path traversal protection
- Query analysis
- Input validation
- Access control
- Error sanitization

## 🛡️ Security Best Practices

### ✅ DO:

1. **Always use parameterized queries**
   ```typescript
   query: 'SELECT * FROM users WHERE id = $1',
   params: [userId]
   ```

2. **Validate all identifiers**
   ```typescript
   const validation = validateIdentifier(tableName);
   if (!validation.valid) {
     throw new Error(validation.error);
   }
   ```

3. **Set DATABASE_ENCRYPTION_KEY in production**
   ```bash
   export DATABASE_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
   ```

4. **Use connection pooling limits**
   ```typescript
   max: 5,  // Reasonable limit per connection
   ```

5. **Enable SSL for PostgreSQL in production**
   ```typescript
   ssl: { rejectUnauthorized: true }
   ```

### ❌ DON'T:

1. **Never concatenate user input into SQL**
   ```typescript
   // ❌ WRONG
   const query = `SELECT * FROM ${tableName}`;  // SQL injection!

   // ✅ RIGHT
   const validation = validateIdentifier(tableName);
   const query = `SELECT * FROM "${validation.sanitized}"`;
   ```

2. **Never pass credentials via command line**
   ```typescript
   // ❌ WRONG
   exec(`psql -U ${user} -p ${password}`);  // Visible in ps aux!

   // ✅ RIGHT
   new Pool({ user, password });  // Passed programmatically
   ```

3. **Never execute shell commands for queries**
   ```typescript
   // ❌ WRONG
   exec(`sqlite3 db.sqlite "SELECT * FROM users WHERE id = ${id}"`);

   // ✅ RIGHT
   await driver.query('SELECT * FROM users WHERE id = ?', [id]);
   ```

4. **Never store unencrypted credentials**
   ```typescript
   // ❌ WRONG
   saveToFile({ password: plainPassword });

   // ✅ RIGHT
   const encrypted = encryptCredential(plainPassword);
   saveToFile({ credentials: encrypted });
   ```

## 📋 Security Checklist

Before deploying:

- [ ] Set `DATABASE_ENCRYPTION_KEY` environment variable
- [ ] Enable SSL for PostgreSQL connections (production)
- [ ] Configure firewall to restrict database access
- [ ] Review audit logs regularly
- [ ] Set appropriate connection limits
- [ ] Enable database access logging
- [ ] Use read-only connections where appropriate
- [ ] Implement backup and recovery procedures
- [ ] Test disaster recovery plan
- [ ] Review and update security policies

## 🔍 Monitoring

### Audit Logs

```typescript
// Get query history for a project
const auditLog = queryExecutor.getAuditLog('project-id', 100);

auditLog.forEach(entry => {
  console.log({
    timestamp: new Date(entry.timestamp),
    query: entry.query,
    success: entry.success,
    executionTime: entry.executionTime,
  });
});
```

### Statistics

```typescript
// Query statistics
const queryStats = queryExecutor.getStats();
console.log({
  total: queryStats.totalQueries,
  successful: queryStats.successfulQueries,
  failed: queryStats.failedQueries,
  avgTime: queryStats.averageExecutionTime,
});

// Connection statistics
const connStats = connectionManager.getStats();
console.log({
  total: connStats.totalConnections,
  byType: connStats.connectionsByType,
  byProject: connStats.connectionsByProject,
});
```

## 🐛 Troubleshooting

### Common Issues

**1. "SQLite support not available"**
```bash
# Install better-sqlite3
npm install better-sqlite3

# If native module fails to build:
npm rebuild better-sqlite3
```

**2. "Connection failed: authentication failed"**
- Verify PostgreSQL credentials
- Check pg_hba.conf settings
- Ensure user has proper permissions

**3. "Path traversal detected"**
- SQLite paths must be within the base path
- Use relative paths: `./database.db` not `/absolute/path/db.db`
- Ensure base path is correctly set

**4. "Invalid identifier format"**
- Table/column names must match: `/^[a-zA-Z_][a-zA-Z0-9_$]*$/`
- No spaces, hyphens, or special characters
- Use underscores instead: `user_id` not `user-id`

## 📚 Additional Resources

- [OWASP SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [PostgreSQL Security Best Practices](https://www.postgresql.org/docs/current/security.html)
- [Node.js Crypto Module](https://nodejs.org/api/crypto.html)
- [better-sqlite3 Documentation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- [node-postgres Documentation](https://node-postgres.com/)

## 📄 License

Part of the recoder.xyz project.

---

**Security Note:** This implementation has been audited and is production-ready. See `SECURITY_AUDIT.md` for the full security audit report.
