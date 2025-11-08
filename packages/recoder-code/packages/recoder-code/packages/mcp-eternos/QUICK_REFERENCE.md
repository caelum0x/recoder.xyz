# Quick Reference - New Developer Info Tools

## Web Crawling & Search

### crawl_webpage
Crawl websites with depth control and content extraction.
```json
{
  "url": "https://example.com",
  "maxDepth": 2,
  "maxPages": 20,
  "sameDomain": true,
  "followExternalLinks": false,
  "extractContent": true
}
```

### extract_links
Extract and filter links from any webpage.
```json
{
  "url": "https://example.com",
  "filter": "all|internal|external",
  "pattern": ".*pattern.*" // optional regex
}
```

## Package Ecosystems

### Python (PyPI)
```json
// Search packages
{ "query": "fastapi", "limit": 10 }

// Get package details
{ "packageName": "requests" }
```

### Rust (Crates.io)
```json
// Search crates
{ "query": "tokio", "limit": 10 }

// Get crate details
{ "crateName": "serde" }
```

### PHP (Packagist)
```json
{ "query": "symfony", "limit": 10 }
```

### Java (Maven)
```json
{ "query": "spring-boot", "limit": 10 }
```

### Go
```json
{ "query": "gin", "limit": 10 }
```

## Containers

### Docker Hub
```json
// Search images
{ "query": "nginx", "limit": 10 }

// Get image details
{ "imageName": "nginx" } // or "namespace/image"
```

## AI/ML Models

### OpenRouter
```json
// Search models
{
  "query": "claude", // optional
  "category": "all|chat|completion|image|embedding"
}

// Get model info
{
  "modelId": "anthropic/claude-3-opus",
  "source": "openrouter"
}
```

### Hugging Face
```json
{
  "query": "bert",
  "type": "models|datasets|spaces",
  "limit": 10
}
```

## Developer Content

### Dev.to
```json
{
  "query": "typescript", // optional if tag provided
  "tag": "javascript", // optional
  "limit": 10
}
```

### Medium
```json
{
  "query": "machine learning", // optional if tag provided
  "tag": "ai", // optional
  "limit": 10
}
```

### Awesome Lists
```json
{
  "topic": "machine-learning",
  "limit": 10
}
```

### GitHub Trending
```json
{
  "language": "python", // optional
  "since": "daily|weekly|monthly"
}
```

## Public APIs

### API Discovery
```json
{
  "apiName": "weather",
  "source": "publicapis|rapidapi|apilayer"
}
```

## Complete Tool List

### Web Crawling (2)
1. `crawl_webpage` - Multi-level web crawler
2. `extract_links` - Link extraction with filtering

### Package Managers (9)
3. `search_npm` - JavaScript/TypeScript packages
4. `get_npm_package` - npm package details
5. `search_pypi` - Python packages
6. `get_pypi_package` - PyPI package details
7. `search_crates_io` - Rust crates
8. `get_crate` - Crate details
9. `search_packagist` - PHP packages
10. `search_maven` - Java artifacts
11. `search_go_packages` - Go packages

### Containers (2)
12. `search_docker_hub` - Docker images
13. `get_docker_image` - Image details

### AI/ML (3)
14. `search_openrouter` - AI models on OpenRouter
15. `get_model_info` - Model details (multi-source)
16. `search_huggingface` - Hugging Face models/datasets

### Content (4)
17. `search_devto` - Dev.to articles
18. `search_medium` - Medium articles
19. `search_awesome_lists` - GitHub awesome lists
20. `get_github_trending` - Trending repos

### APIs (1)
21. `get_api_info` - Public API discovery

## Usage Examples

### Research Best Practices
```json
// Find awesome list for your topic
{
  "name": "search_awesome_lists",
  "arguments": { "topic": "python" }
}

// Read trending repos
{
  "name": "get_github_trending",
  "arguments": { "language": "python", "since": "weekly" }
}

// Search tutorials
{
  "name": "search_devto",
  "arguments": { "tag": "python", "limit": 20 }
}
```

### Package Comparison
```json
// Search across ecosystems
npm -> "web framework"
pypi -> "web framework"
crates_io -> "web framework"
maven -> "web framework"
packagist -> "web framework"
go_packages -> "web framework"
```

### AI Model Research
```json
// Find models
{
  "name": "search_openrouter",
  "arguments": { "category": "chat" }
}

// Compare on Hugging Face
{
  "name": "search_huggingface",
  "arguments": { "query": "llama", "type": "models" }
}

// Get pricing
{
  "name": "get_model_info",
  "arguments": {
    "modelId": "meta-llama/llama-3-70b",
    "source": "openrouter"
  }
}
```

### Web Research
```json
// Crawl documentation
{
  "name": "crawl_webpage",
  "arguments": {
    "url": "https://docs.example.com",
    "maxDepth": 2,
    "extractContent": true
  }
}

// Extract API endpoints
{
  "name": "extract_links",
  "arguments": {
    "url": "https://api-docs.example.com",
    "pattern": ".*api.*"
  }
}
```

## No API Keys Required! 🎉

All these tools work without requiring API keys or paid services. They use public endpoints and web scraping to gather information.

## Rate Limiting Best Practices

- Use reasonable `limit` values (10-20)
- Add delays between requests when making multiple calls
- Respect robots.txt and terms of service
- Cache results when possible
- Use the most specific tool for your needs

## Error Handling

All tools include:
- Timeout protection (10-30 seconds)
- Graceful error messages
- Fallback behaviors
- Input validation with Zod schemas

## Need Help?

Check out:
- `NEW_FEATURES.md` - Detailed feature documentation
- `README.md` - Main documentation
- `TOOL_SPECIFICATIONS.md` - Tool schemas and parameters
