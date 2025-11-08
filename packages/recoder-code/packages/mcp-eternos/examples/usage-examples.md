# Eternos MCP Server - Usage Examples

## Real-World Use Cases

### 1. Web Scraping & Monitoring

#### Extract Product Prices
```json
{
  "name": "scrape_webpage",
  "arguments": {
    "url": "https://example-shop.com/product",
    "selectors": {
      "price": ".product-price",
      "title": "h1.product-title",
      "availability": ".stock-status"
    },
    "extract": "text"
  }
}
```

#### Monitor API Status
```json
{
  "name": "fetch_url",
  "arguments": {
    "url": "https://api.github.com/status",
    "method": "GET",
    "headers": {
      "Accept": "application/json"
    }
  }
}
```

### 2. File Operations & Code Management

#### Find All Configuration Files
```json
{
  "name": "search_files",
  "arguments": {
    "pattern": "**/{*.config.js,*.config.ts,.env*,package.json}",
    "ignore": ["node_modules/**", "dist/**", "build/**"]
  }
}
```

#### Read and Parse Package.json
```json
{
  "name": "read_file_content",
  "arguments": {
    "filePath": "./package.json",
    "parse": true
  }
}
```

#### Batch Update Files
```json
{
  "name": "write_file_content",
  "arguments": {
    "filePath": "./config/settings.json",
    "content": "{\"version\": \"2.0.0\", \"env\": \"production\"}",
    "backup": true
  }
}
```

### 3. Data Processing & Transformation

#### Convert YAML Config to JSON
```json
{
  "name": "convert_format",
  "arguments": {
    "input": "database:\n  host: localhost\n  port: 5432\n  name: mydb",
    "from": "yaml",
    "to": "json"
  }
}
```

#### Process API Response
```json
{
  "name": "process_json",
  "arguments": {
    "data": "{\"users\": [{\"id\": 1, \"name\": \"John\"}, {\"id\": 2, \"name\": \"Jane\"}]}",
    "operation": "query"
  }
}
```

### 4. Security & Authentication

#### Generate API Keys
```json
{
  "name": "generate_code",
  "arguments": {
    "type": "api-key",
    "count": 5
  }
}
```

#### Hash Passwords
```json
{
  "name": "hash_data",
  "arguments": {
    "data": "user-password-123",
    "algorithm": "sha256",
    "encoding": "hex"
  }
}
```

#### Generate Secure Passwords
```json
{
  "name": "generate_code",
  "arguments": {
    "type": "password",
    "count": 10,
    "options": {
      "length": 32
    }
  }
}
```

#### Encrypt Sensitive Data
```json
{
  "name": "encrypt_decrypt",
  "arguments": {
    "data": "sensitive-information",
    "password": "strong-encryption-key",
    "operation": "encrypt"
  }
}
```

### 5. System Monitoring & DevOps

#### Check System Resources
```json
{
  "name": "get_system_info",
  "arguments": {
    "info": ["os", "cpu", "memory"]
  }
}
```

#### Search Log Files
```json
{
  "name": "search_files",
  "arguments": {
    "pattern": "**/*.log",
    "cwd": "/var/log",
    "maxDepth": 3
  }
}
```

### 6. API Testing & Integration

#### Test REST API Endpoint
```json
{
  "name": "fetch_url",
  "arguments": {
    "url": "https://api.example.com/v1/users",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer YOUR_TOKEN"
    },
    "body": "{\"name\": \"John Doe\", \"email\": \"john@example.com\"}",
    "timeout": 5000
  }
}
```

#### Scrape Documentation
```json
{
  "name": "scrape_webpage",
  "arguments": {
    "url": "https://docs.example.com/api",
    "selectors": {
      "endpoints": ".endpoint-list li",
      "descriptions": ".endpoint-description"
    },
    "extract": "text"
  }
}
```

### 7. Time & Date Operations

#### Get Current Time in Multiple Timezones
```json
{
  "name": "time_operations",
  "arguments": {
    "operation": "now",
    "timezone": "America/New_York"
  }
}
```

```json
{
  "name": "time_operations",
  "arguments": {
    "operation": "now",
    "timezone": "Europe/London"
  }
}
```

```json
{
  "name": "time_operations",
  "arguments": {
    "operation": "now",
    "timezone": "Asia/Tokyo"
  }
}
```

### 8. Database Operations

#### Query SQLite Database
```json
{
  "name": "query_sqlite",
  "arguments": {
    "database": "./data/app.db",
    "query": "SELECT * FROM users WHERE active = 1 LIMIT 10"
  }
}
```

#### Insert Data with Prepared Statement
```json
{
  "name": "query_sqlite",
  "arguments": {
    "database": "./data/app.db",
    "query": "INSERT INTO logs (timestamp, level, message) VALUES (?, ?, ?)",
    "params": ["2025-10-13T12:00:00Z", "INFO", "Application started"]
  }
}
```

## Workflow Examples

### Complete CI/CD Pipeline Check

1. **Check System Resources**
```json
{"name": "get_system_info", "arguments": {"info": ["cpu", "memory", "disk"]}}
```

2. **Find Test Files**
```json
{"name": "search_files", "arguments": {"pattern": "**/*.test.{js,ts}"}}
```

3. **Read Configuration**
```json
{"name": "read_file_content", "arguments": {"filePath": "./package.json", "parse": true}}
```

4. **Generate Build ID**
```json
{"name": "generate_code", "arguments": {"type": "uuid"}}
```

### Security Audit Workflow

1. **Search for Sensitive Files**
```json
{"name": "search_files", "arguments": {"pattern": "**/{.env*,*secret*,*key*}"}}
```

2. **Hash Configuration Files**
```json
{"name": "hash_data", "arguments": {"data": "config-content", "algorithm": "sha256"}}
```

3. **Generate New API Keys**
```json
{"name": "generate_code", "arguments": {"type": "api-key", "count": 3}}
```

### Data Migration Workflow

1. **Read Source Data (YAML)**
```json
{"name": "read_file_content", "arguments": {"filePath": "./data.yaml", "parse": true}}
```

2. **Convert to JSON**
```json
{"name": "convert_format", "arguments": {"input": "...", "from": "yaml", "to": "json"}}
```

3. **Write to Database**
```json
{"name": "query_sqlite", "arguments": {"database": "./db.sqlite", "query": "INSERT INTO ..."}}
```

## Tips & Best Practices

### Performance
- Use `ignore` patterns in file searches to skip large directories
- Set appropriate `timeout` values for network requests
- Use `maxDepth` to limit recursive searches

### Security
- Always use `backup: true` when modifying important files
- Use strong passwords for encryption operations
- Hash sensitive data before logging or storing

### Reliability
- Handle errors gracefully in your workflows
- Validate data before processing
- Use prepared statements for database queries

### Efficiency
- Combine multiple operations when possible
- Cache frequently accessed data
- Use glob patterns effectively for file operations

## Advanced Patterns

### Conditional File Processing
```javascript
// 1. Search for files
// 2. Read each file
// 3. Process based on content
// 4. Write results
```

### API Monitoring Loop
```javascript
// 1. Fetch API status
// 2. Parse response
// 3. Check thresholds
// 4. Log results
// 5. Repeat
```

### Automated Backup System
```javascript
// 1. Search for important files
// 2. Read content
// 3. Hash for verification
// 4. Write to backup location
// 5. Log backup metadata
```
