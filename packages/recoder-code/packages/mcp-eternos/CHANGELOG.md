# Changelog

## [2.2.0] - 2024-10-19

### 🎉 Major Update: 21 New Tools Added!

#### Added - Web Crawling & Search
- **crawl_webpage**: Multi-level web crawler with content extraction and link discovery
- **extract_links**: Extract and filter links from webpages (internal/external, regex patterns)
- **Enhanced search_web**: Better parsing for Google, Bing, and DuckDuckGo results

#### Added - Package Ecosystems (9 new tools)
- **search_pypi** / **get_pypi_package**: Python package search and details
- **search_crates_io** / **get_crate**: Rust crate search and details
- **search_packagist**: PHP package search on Packagist
- **search_maven**: Java artifact search on Maven Central
- **search_go_packages**: Go package search on pkg.go.dev
- **search_docker_hub** / **get_docker_image**: Docker Hub image search and details

#### Added - AI/ML Model Discovery (3 new tools)
- **search_openrouter**: Search AI models on OpenRouter by category
- **get_model_info**: Get detailed model info from OpenRouter or Hugging Face
- **search_huggingface**: Search models, datasets, and spaces on Hugging Face

#### Added - Developer Content (4 new tools)
- **search_devto**: Search articles and tutorials on Dev.to
- **search_medium**: Search Medium articles by tag or query
- **search_awesome_lists**: Find curated GitHub awesome lists
- **get_github_trending**: Get trending repositories by language and time period

#### Added - API Discovery
- **get_api_info**: Discover public APIs from various sources

### Documentation
- Added `NEW_FEATURES.md` with detailed feature documentation
- Added `QUICK_REFERENCE.md` with quick syntax reference
- Added `ENHANCEMENT_SUMMARY.md` with technical implementation details
- Added `TOOLS_OVERVIEW.md` with complete tool catalog
- Updated `README.md` with new features and tool counts

### Technical
- All new tools work without API keys or paid services
- Robust error handling and input validation with Zod schemas
- Configurable timeouts and rate limiting
- TypeScript type safety throughout
- Zero breaking changes to existing tools

### Statistics
- Total tools: 51 → 72 (+21)
- Version: 2.0.0 → 2.2.0
- Code lines: ~2,350 → ~3,474 (+1,100)
- Documentation: +4 new comprehensive guides

## [2.0.0] - Previous Version

### Features
- 51 powerful tools across multiple categories
- Web scraping and HTTP client
- File system operations
- Data processing and conversion
- Security and encryption
- Git operations
- System utilities
- Image processing
- Code analysis
- And more...

---

**Note**: All tools are free to use and require no API keys!
