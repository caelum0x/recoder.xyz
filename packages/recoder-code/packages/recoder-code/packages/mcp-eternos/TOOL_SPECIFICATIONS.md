# MCP Eternos - Complete Tool Specifications

## Version 2.1.0
## Total Tools: 41

---

## 🌐 Web & Network Tools (3)

### 1. fetch_url
**Description**: Advanced HTTP client with full control over headers, methods, and authentication

**Input Schema**:
```typescript
{
  url: string (URL format required),
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" (default: "GET"),
  headers?: Record<string, string>,
  body?: any,
  timeout?: number (default: 10000)
}
```

**Output**:
```typescript
{
  status: number,
  statusText: string,
  headers: Record<string, any>,
  data: any,
  contentType: string
}
```

**Use Cases**:
- API testing and integration
- Web scraping with authentication
- RESTful API consumption
- Webhook testing

---

### 2. scrape_webpage
**Description**: Extract structured data from any webpage using CSS selectors

**Input Schema**:
```typescript
{
  url: string (URL format required),
  selectors: Record<string, string>,
  extract?: "text" | "html" | "attr" (default: "text"),
  attribute?: string
}
```

**Output**:
```typescript
Record<string, string | string[]>
```

**Use Cases**:
- Web scraping
- Data extraction
- Price monitoring
- Content aggregation

---

### 3. download_file
**Description**: Downloads a file from a URL to local filesystem

**Input Schema**:
```typescript
{
  url: string (URL format required),
  destination: string,
  timeout?: number (default: 60000)
}
```

**Output**:
```typescript
{
  success: boolean,
  path: string,
  size: number,
  contentType: string
}
```

**Use Cases**:
- Asset downloading
- Backup automation
- Resource caching

---

## 📁 File Operations (6)

### 4. search_files
**Description**: Powerful glob-based file search with ignore patterns and depth control

**Input Schema**:
```typescript
{
  pattern: string,
  cwd?: string (default: "."),
  ignore?: string[],
  maxDepth?: number
}
```

**Output**: `string[]` (array of file paths)

**Use Cases**:
- Finding source files
- Build system automation
- Code analysis preparation

---

### 5. read_file_content
**Description**: Smart file reading with auto-parsing for JSON, YAML, and Markdown

**Input Schema**:
```typescript
{
  filePath: string,
  encoding?: string (default: "utf-8"),
  parse?: boolean (default: true)
}
```

**Output**:
```typescript
{
  type: "json" | "yaml" | "markdown" | "text",
  data?: any,
  raw?: string,
  html?: string,
  content?: string
}
```

---

### 6. write_file_content
**Description**: Safe file writing with automatic directory creation and backup support

**Input Schema**:
```typescript
{
  filePath: string,
  content: string,
  createDirs?: boolean (default: true),
  backup?: boolean (default: false)
}
```

**Output**:
```typescript
{
  success: boolean,
  path: string
}
```

---

### 7. watch_directory
**Description**: Monitor directories for file changes in real-time

**Input Schema**:
```typescript
{
  directory: string,
  events?: ("add" | "change" | "unlink")[],
  ignore?: string[],
  persistent?: boolean
}
```

**Use Cases**:
- Hot reload development
- File synchronization
- Build triggers

---

### 8. batch_read_files
**Description**: Reads multiple files matching patterns with file info

**Input Schema**:
```typescript
{
  patterns: string[],
  cwd?: string (default: "."),
  maxFiles?: number (default: 100)
}
```

**Output**:
```typescript
{
  totalFound: number,
  returned: number,
  files: Array<{
    path: string,
    size: number,
    lines: number,
    content: string (first 1000 chars)
  }>
}
```

---

### 9. batch_process
**Description**: Batch file operations (rename, move, delete, copy)

**Input Schema**:
```typescript
{
  operation: "rename" | "move" | "delete" | "copy",
  files: string[],
  destination?: string,
  pattern?: string,
  replacement?: string
}
```

**Output**:
```typescript
{
  processed: number,
  results: Array<{
    file: string,
    success: boolean,
    newName?: string,
    newPath?: string,
    error?: string
  }>
}
```

---

## 🔄 Data Processing (5)

### 10. process_json
**Description**: Query, validate, transform, and merge JSON data

**Input Schema**:
```typescript
{
  operation: "query" | "validate" | "transform" | "merge",
  data: any,
  query?: string,
  schema?: any,
  merge?: any
}
```

---

### 11. convert_format
**Description**: Convert between JSON, YAML, CSV, XML, and Markdown formats

**Input Schema**:
```typescript
{
  input: string,
  from: "json" | "yaml" | "csv" | "xml" | "markdown",
  to: "json" | "yaml" | "csv" | "xml" | "markdown"
}
```

---

### 12. analyze_csv
**Description**: Analyze CSV files (stats, preview, column types, summary)

**Input Schema**:
```typescript
{
  filePath: string,
  operations: ("stats" | "preview" | "columns" | "types" | "summary")[],
  limit?: number (default: 10)
}
```

**Output**:
```typescript
{
  preview?: any[],
  columns?: string[],
  columnCount?: number,
  stats?: {
    totalRows: number,
    totalColumns: number
  },
  types?: Record<string, "number" | "string" | "boolean">,
  summary?: Record<string, {
    count: number,
    unique: number,
    sample: any[]
  }>
}
```

---

### 13. merge_datasets
**Description**: Merge two datasets with join operations (inner/left/right/outer)

**Input Schema**:
```typescript
{
  file1: string,
  file2: string,
  outputPath: string,
  joinType?: "inner" | "left" | "right" | "outer" (default: "inner"),
  joinKey: string
}
```

**Output**:
```typescript
{
  success: boolean,
  outputPath: string,
  rows: number,
  columns: number
}
```

---

### 14. data_validation
**Description**: Validate data against schema rules

**Input Schema**:
```typescript
{
  filePath: string,
  schema: Record<string, {
    required?: boolean,
    type?: string,
    min?: number,
    max?: number
  }>,
  format?: "csv" | "json" (default: "json")
}
```

**Output**:
```typescript
{
  success: boolean,
  totalRows: number,
  validRows: number,
  errorRows: number,
  errors: Array<{
    row: number,
    errors: Array<{
      field: string,
      error: string
    }>
  }>,
  validationRate: string
}
```

---

## 🔐 Security (2)

### 15. hash_data
**Description**: Generate cryptographic hashes (MD5, SHA1, SHA256, SHA512, SHA3)

**Input Schema**:
```typescript
{
  data: string,
  algorithm: "md5" | "sha1" | "sha256" | "sha512" | "sha3-256" | "sha3-512"
}
```

**Output**: `string` (hex hash)

---

### 16. encrypt_decrypt
**Description**: AES-256-GCM encryption with secure key derivation

**Input Schema**:
```typescript
{
  operation: "encrypt" | "decrypt",
  data: string,
  password: string
}
```

**Output**: `string` (encrypted/decrypted data)

---

## 💻 Code Tools (4)

### 17. generate_code
**Description**: Generate UUIDs, API keys, passwords, mock data, and more

**Input Schema**:
```typescript
{
  type: "uuid" | "api-key" | "password" | "lorem",
  length?: number,
  count?: number
}
```

---

### 18. analyze_code
**Description**: Analyze code for imports, exports, functions, and complexity

**Input Schema**:
```typescript
{
  filePath: string,
  language?: string
}
```

**Output**:
```typescript
{
  imports: number,
  exports: number,
  functions: number,
  classes: number,
  complexity: number
}
```

---

### 19. find_functions
**Description**: Extract all functions from code files

**Input Schema**:
```typescript
{
  filePath: string,
  language?: "javascript" | "typescript" | "python" | "go" | "rust"
}
```

**Output**:
```typescript
{
  totalFunctions: number,
  functions: Array<{
    name: string,
    line: number,
    type: "async" | "sync"
  }>,
  asyncCount: number,
  syncCount: number
}
```

---

### 20. count_loc
**Description**: Count lines of code by language/extension

**Input Schema**:
```typescript
{
  directory: string,
  extensions?: string[]
}
```

**Output**:
```typescript
{
  totalFiles: number,
  totalLines: number,
  totalCode: number,
  totalComments: number,
  totalBlank: number,
  byExtension: Record<string, {
    files: number,
    lines: number,
    code: number
  }>
}
```

---

## 📝 Text Processing (2)

### 21. text_search
**Description**: Multi-file search with regex & context

**Input Schema**:
```typescript
{
  pattern: string,
  files: string[],
  regex?: boolean (default: false),
  caseSensitive?: boolean (default: false),
  contextLines?: number (default: 2)
}
```

---

### 22. text_replace
**Description**: Replace text with dry-run support

**Input Schema**:
```typescript
{
  filePath: string,
  search: string,
  replace: string,
  regex?: boolean (default: false),
  caseSensitive?: boolean (default: false),
  dryRun?: boolean (default: false)
}
```

---

## 🖥️ System (3)

### 23. get_system_info
**Description**: OS, CPU, memory, disk, and network information

**Output**:
```typescript
{
  os: { platform, version, arch },
  cpu: { cores, model, speed },
  memory: { total, free, used },
  disk: { total, free, used }
}
```

---

### 24. execute_command
**Description**: Safely execute shell commands

**Input Schema**:
```typescript
{
  command: string,
  cwd?: string,
  timeout?: number (default: 30000)
}
```

---

### 25. time_operations
**Description**: Time/date operations with timezone support

**Input Schema**:
```typescript
{
  operation: "now" | "parse" | "format",
  input?: string,
  timezone?: string,
  format?: string
}
```

---

## 🗄️ Database (1)

### 26. query_sqlite
**Description**: Execute SQLite queries with prepared statements

**Input Schema**:
```typescript
{
  database: string,
  query: string,
  params?: any[]
}
```

---

## 📦 Git Operations (10)

### 27-36. Git Tools
- **git_clone**: Clone repositories
- **git_status**: Repository status
- **git_add**: Stage files
- **git_commit**: Commit changes
- **git_diff**: Show differences
- **git_log**: Commit history (with format options)
- **git_branch**: Branch management (list/create/delete/switch)
- **git_push**: Push to remote (with force option)
- **git_pull**: Pull from remote

---

## 🔍 Advanced (1)

### 37. find_duplicates
**Description**: Find duplicate files by content hash

**Input Schema**:
```typescript
{
  directory: string,
  minSize?: number (default: 100),
  extensions?: string[]
}
```

**Output**:
```typescript
{
  total: number,
  duplicates: Array<{
    hash: string,
    count: number,
    files: string[],
    size: number
  }>,
  potentialSavings: number
}
```

---

## 🎨 Image Processing (3)

### 38. resize_image
**Description**: Resize & compress images

**Input Schema**:
```typescript
{
  inputPath: string,
  outputPath: string,
  width?: number,
  height?: number,
  fit?: "cover" | "contain" | "fill" | "inside" | "outside" (default: "cover"),
  quality?: number (1-100, default: 80)
}
```

---

### 39. optimize_image
**Description**: Optimize images for web

**Input Schema**:
```typescript
{
  inputPath: string,
  outputPath?: string,
  quality?: number (1-100, default: 80),
  format?: "jpeg" | "png" | "webp"
}
```

---

### 40. get_image_metadata
**Description**: Extract image metadata

**Output**:
```typescript
{
  width: number,
  height: number,
  format: string,
  size: number,
  sizeFormatted: string,
  channels: number,
  hasAlpha: boolean,
  orientation: number
}
```

---

### 41. complexity_analysis
**Description**: Analyze code complexity (cyclomatic complexity)

**Input Schema**:
```typescript
{
  filePath: string
}
```

**Output**:
```typescript
{
  cyclomaticComplexity: number,
  complexityPerFunction: number,
  totalLines: number,
  totalFunctions: number,
  rating: "Simple" | "Moderate" | "Complex" | "Very Complex"
}
```

---

## Error Handling

All tools return errors in this format:
```typescript
{
  error: string,
  message: string,
  details?: any
}
```

## Installation Requirements

### Core Dependencies (Required)
- Node.js >= 18.0.0
- All dependencies in package.json

### Optional Dependencies
- **sharp**: Required for image processing tools (38-40)
  ```bash
  npm install sharp
  ```

If sharp is not installed, image tools will return:
```
Error: Sharp not available. Install with: npm install sharp
```

---

## Performance Characteristics

| Tool | Avg Time | Memory | Scalability |
|------|----------|--------|-------------|
| File Operations | <100ms | Low | High |
| Image Processing | 100-500ms | Medium | Medium |
| Data Analysis | <200ms | Medium | High |
| Git Operations | 100ms-5s | Low | Medium |
| Code Analysis | <300ms | Low | High |

---

## Best Practices

1. **File Operations**: Always use absolute paths
2. **Batch Operations**: Limit to 1000 files at a time
3. **Image Processing**: Use quality 70-85 for web optimization
4. **Git Operations**: Use specific branches for safety
5. **Data Validation**: Define comprehensive schemas

---

## Version History

- **v2.1.0**: Added image processing, data analysis, code intelligence (10 tools)
- **v2.0.0**: Added git extensions, batch ops, advanced features (16 tools)
- **v1.0.0**: Initial release (15 tools)

---

**Total: 41 Production-Ready Tools**
