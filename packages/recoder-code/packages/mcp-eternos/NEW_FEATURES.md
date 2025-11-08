# 🎉 New Features in Eternos v2.2

## Enhanced Web Search & Crawling

### 🌐 Advanced Web Search
**Improved `search_web`** - Enhanced web search with better parsing for Google, Bing, and DuckDuckGo
- Better user agent handling
- Improved result extraction
- More robust error handling

### 🕷️ Web Crawling
**NEW `crawl_webpage`** - Comprehensive web crawler
- Crawl websites up to 3 levels deep
- Extract content, headings, and metadata
- Follow internal/external links
- Limit pages visited for safety
- Same-domain or cross-domain crawling options

```json
{
  "name": "crawl_webpage",
  "arguments": {
    "url": "https://example.com",
    "maxDepth": 2,
    "maxPages": 20,
    "sameDomain": true,
    "extractContent": true
  }
}
```

### 🔗 Link Extraction
**NEW `extract_links`** - Extract all links from a webpage
- Filter by internal/external links
- Pattern-based filtering with regex
- Get link text and metadata

```json
{
  "name": "extract_links",
  "arguments": {
    "url": "https://example.com",
    "filter": "internal",
    "pattern": ".*blog.*"
  }
}
```

## Developer Info Gathering - Massive Expansion! 🚀

### Python Ecosystem
**NEW `search_pypi`** - Search Python packages
**NEW `get_pypi_package`** - Get detailed PyPI package information

```json
{
  "name": "search_pypi",
  "arguments": {
    "query": "fastapi",
    "limit": 10
  }
}
```

### Rust Ecosystem
**NEW `search_crates_io`** - Search Rust crates
**NEW `get_crate`** - Get detailed crate information

```json
{
  "name": "search_crates_io",
  "arguments": {
    "query": "tokio",
    "limit": 10
  }
}
```

### Container Ecosystem
**NEW `search_docker_hub`** - Search Docker images
**NEW `get_docker_image`** - Get detailed Docker image information

```json
{
  "name": "search_docker_hub",
  "arguments": {
    "query": "nginx",
    "limit": 10
  }
}
```

### AI/ML Models
**NEW `search_openrouter`** - Search AI models on OpenRouter
**NEW `get_model_info`** - Get model details from OpenRouter/Hugging Face
**NEW `search_huggingface`** - Search models, datasets, and spaces on Hugging Face

```json
{
  "name": "search_openrouter",
  "arguments": {
    "category": "chat",
    "query": "gpt"
  }
}
```

```json
{
  "name": "search_huggingface",
  "arguments": {
    "query": "bert",
    "type": "models",
    "limit": 10
  }
}
```

### Developer Content
**NEW `search_devto`** - Search dev.to articles
**NEW `search_medium`** - Search Medium articles
**NEW `search_awesome_lists`** - Find awesome lists on GitHub

```json
{
  "name": "search_devto",
  "arguments": {
    "query": "typescript",
    "tag": "javascript",
    "limit": 10
  }
}
```

### GitHub Features
**NEW `get_github_trending`** - Get trending repositories

```json
{
  "name": "get_github_trending",
  "arguments": {
    "language": "python",
    "since": "daily"
  }
}
```

### PHP Ecosystem
**NEW `search_packagist`** - Search PHP packages on Packagist

```json
{
  "name": "search_packagist",
  "arguments": {
    "query": "symfony",
    "limit": 10
  }
}
```

### Java Ecosystem
**NEW `search_maven`** - Search Java artifacts on Maven Central

```json
{
  "name": "search_maven",
  "arguments": {
    "query": "spring-boot",
    "limit": 10
  }
}
```

### Go Ecosystem
**NEW `search_go_packages`** - Search Go packages

```json
{
  "name": "search_go_packages",
  "arguments": {
    "query": "gin",
    "limit": 10
  }
}
```

### API Discovery
**NEW `get_api_info`** - Search for public APIs

```json
{
  "name": "get_api_info",
  "arguments": {
    "apiName": "weather",
    "source": "publicapis"
  }
}
```

## Complete List of New Tools (21 Added!)

1. ✅ `crawl_webpage` - Web crawler with depth control
2. ✅ `extract_links` - Link extraction with filtering
3. ✅ `search_pypi` - Python package search
4. ✅ `get_pypi_package` - PyPI package details
5. ✅ `search_crates_io` - Rust crate search
6. ✅ `get_crate` - Rust crate details
7. ✅ `search_docker_hub` - Docker image search
8. ✅ `get_docker_image` - Docker image details
9. ✅ `search_openrouter` - AI model search (OpenRouter)
10. ✅ `get_model_info` - AI model details (multi-source)
11. ✅ `search_huggingface` - Hugging Face search
12. ✅ `search_devto` - Dev.to article search
13. ✅ `search_medium` - Medium article search
14. ✅ `search_awesome_lists` - GitHub awesome lists
15. ✅ `get_github_trending` - GitHub trending repos
16. ✅ `search_packagist` - PHP package search
17. ✅ `search_maven` - Java artifact search
18. ✅ `search_go_packages` - Go package search
19. ✅ `get_api_info` - Public API discovery

## Total Tools: 72 (was 51)

## Key Features

### ✅ No API Keys Required
All new tools work without requiring API keys or paid services!

### ✅ Wide Language Coverage
- **JavaScript/TypeScript**: npm
- **Python**: PyPI
- **Rust**: Crates.io
- **PHP**: Packagist
- **Java**: Maven Central
- **Go**: pkg.go.dev
- **Containers**: Docker Hub

### ✅ AI/ML Ecosystem
- OpenRouter models
- Hugging Face models/datasets
- Model pricing and capabilities

### ✅ Developer Content
- Dev.to articles
- Medium posts
- GitHub trending
- Awesome lists

### ✅ Web Crawling
- Multi-level crawling
- Link extraction
- Content extraction
- Smart filtering

## Use Cases

### 1. Research AI Models
```json
// Find the best chat models
{
  "name": "search_openrouter",
  "arguments": {
    "category": "chat",
    "query": "claude"
  }
}

// Get detailed model info
{
  "name": "get_model_info",
  "arguments": {
    "modelId": "anthropic/claude-3-opus",
    "source": "openrouter"
  }
}
```

### 2. Package Research
```json
// Compare packages across ecosystems
search_npm -> "web framework"
search_pypi -> "web framework"
search_crates_io -> "web framework"
search_packagist -> "web framework"
```

### 3. Content Discovery
```json
// Find tutorials and articles
{
  "name": "search_devto",
  "arguments": {
    "tag": "webdev",
    "limit": 20
  }
}

// Find curated resources
{
  "name": "search_awesome_lists",
  "arguments": {
    "topic": "machine-learning"
  }
}
```

### 4. Web Research
```json
// Crawl documentation site
{
  "name": "crawl_webpage",
  "arguments": {
    "url": "https://docs.example.com",
    "maxDepth": 2,
    "maxPages": 30,
    "extractContent": true
  }
}

// Extract all API endpoints
{
  "name": "extract_links",
  "arguments": {
    "url": "https://api-docs.example.com",
    "filter": "internal",
    "pattern": ".*api.*"
  }
}
```

## Performance & Safety

- **Rate Limiting**: Built-in delays to respect server resources
- **Timeout Protection**: All requests have configurable timeouts
- **Error Handling**: Graceful degradation on failures
- **No API Keys**: Completely free to use
- **Privacy**: No data collection or tracking

## What's Next?

Future enhancements could include:
- More package registries (NuGet, RubyGems, etc.)
- Enhanced crawling with JavaScript rendering
- API endpoint discovery and testing
- Code snippet extraction from tutorials
- Sentiment analysis on developer discussions

## Upgrade Now!

```bash
cd packages/mcp-eternos
npm install
npm run build
```

Then restart your MCP client to enjoy all 72 powerful tools! 🎉
