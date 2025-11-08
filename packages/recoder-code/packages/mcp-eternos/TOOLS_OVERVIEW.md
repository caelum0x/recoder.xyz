# 🛠️ Eternos v2.2 - Complete Tools Overview

## 📊 Tool Statistics

- **Total Tools:** 72
- **New in v2.2:** 21
- **Categories:** 14
- **No API Keys Required:** ✅ All tools

## 🗂️ Tools by Category

### 🌐 Web & Network (4 tools)
1. `fetch_url` - HTTP client with authentication
2. `scrape_webpage` - CSS selector-based scraping
3. `crawl_webpage` - 🆕 Multi-level web crawler
4. `extract_links` - 🆕 Link extraction & filtering

### 📁 File System (4 tools)
5. `search_files` - Glob-based file search
6. `read_file_content` - Smart file reading (JSON/YAML/MD)
7. `write_file_content` - Safe file writing with backup
8. `watch_directory` - Real-time file monitoring

### 🔄 Data Processing (6 tools)
9. `process_json` - Query, validate, transform JSON
10. `convert_format` - JSON/YAML/CSV/XML/Markdown conversion
11. `analyze_csv` - CSV statistics and analysis
12. `merge_datasets` - Join datasets with SQL-like operations
13. `data_validation` - Schema-based validation

### 🔐 Security & Crypto (2 tools)
14. `hash_data` - Cryptographic hashing (MD5/SHA256/SHA512)
15. `encrypt_decrypt` - AES-256-GCM encryption

### 💻 Developer Utilities (5 tools)
16. `generate_code` - UUID, API keys, passwords, mock data
17. `analyze_code` - Extract imports, exports, functions
18. `find_functions` - Function extraction from code
19. `count_loc` - Lines of code counter
20. `complexity_analysis` - Cyclomatic complexity

### 🖥️ System (2 tools)
21. `get_system_info` - OS, CPU, memory, disk info
22. `execute_command` - Shell command execution

### 🗄️ Database (1 tool)
23. `query_sqlite` - SQLite queries with params

### ⏰ Time Operations (1 tool)
24. `time_operations` - Timezone, formatting, calculations

### 🔀 Git Operations (9 tools)
25. `git_clone` - Clone repositories
26. `git_status` - Repository status
27. `git_add` - Stage files
28. `git_commit` - Commit changes
29. `git_diff` - Show differences
30. `git_log` - Commit history
31. `git_branch` - Branch management
32. `git_push` - Push to remote
33. `git_pull` - Pull from remote

### 📦 Batch Operations (4 tools)
34. `batch_read_files` - Read multiple files
35. `batch_process` - Rename, move, delete, copy
36. `find_duplicates` - Find duplicate files by hash
37. `download_file` - Download from URL

### 📝 Text Processing (2 tools)
38. `text_search` - Search with context and regex
39. `text_replace` - Replace with dry-run support

### 🖼️ Image Processing (3 tools)
40. `resize_image` - Resize and compress
41. `optimize_image` - Optimize for web
42. `get_image_metadata` - Extract EXIF and metadata

### 📦 Package Managers (11 tools)
43. `search_npm` - JavaScript/TypeScript packages
44. `get_npm_package` - npm package details
45. `search_pypi` - 🆕 Python packages
46. `get_pypi_package` - 🆕 PyPI package details
47. `search_crates_io` - 🆕 Rust crates
48. `get_crate` - 🆕 Crate details
49. `search_packagist` - �� PHP packages
50. `search_maven` - 🆕 Java Maven artifacts
51. `search_go_packages` - 🆕 Go packages
52. `search_docker_hub` - 🆕 Docker images
53. `get_docker_image` - 🆕 Docker image details

### 🤖 AI/ML Models (3 tools)
54. `search_openrouter` - 🆕 OpenRouter AI models
55. `get_model_info` - 🆕 Model details (multi-source)
56. `search_huggingface` - 🆕 Hugging Face search

### 🌍 Developer Info & Content (15 tools)
57. `search_web` - DuckDuckGo, Google, Bing
58. `search_github` - Repositories, code, issues, users
59. `get_github_repo` - Repository details
60. `get_github_issues` - Repository issues
61. `get_github_trending` - �� Trending repositories
62. `search_stackoverflow` - Q&A search
63. `search_reddit` - Reddit discussions
64. `search_devto` - 🆕 Dev.to articles
65. `search_medium` - 🆕 Medium articles
66. `search_awesome_lists` - 🆕 GitHub awesome lists
67. `search_docs` - MDN, DevDocs, Node.js, Python, React
68. `get_api_info` - 🆕 Public API discovery
69. `search_code` - (via GitHub search)
70. `search_issues` - (via GitHub/SO search)

## 🎯 Use Case Matrix

| Use Case | Tools |
|----------|-------|
| **Package Research** | search_npm, search_pypi, search_crates_io, search_maven, search_packagist, search_go_packages |
| **AI Model Discovery** | search_openrouter, get_model_info, search_huggingface |
| **Learning Resources** | search_devto, search_medium, search_awesome_lists, search_stackoverflow |
| **Code Analysis** | analyze_code, find_functions, count_loc, complexity_analysis |
| **Web Research** | crawl_webpage, extract_links, scrape_webpage, search_web |
| **Container Management** | search_docker_hub, get_docker_image |
| **File Operations** | search_files, batch_read_files, find_duplicates, batch_process |
| **Data Transformation** | convert_format, process_json, merge_datasets |
| **Security** | hash_data, encrypt_decrypt, generate_code |
| **Git Workflows** | All 9 git_* tools |

## 🚀 Quick Start Examples

### Research Packages Across Languages
```bash
1. search_npm: "web framework"
2. search_pypi: "web framework"
3. search_crates_io: "web framework"
4. search_packagist: "web framework"
5. search_maven: "web framework"
```

### Find AI Models
```bash
1. search_openrouter: category="chat"
2. search_huggingface: query="llama", type="models"
3. get_model_info: modelId="anthropic/claude-3-opus"
```

### Learn New Technologies
```bash
1. search_devto: tag="rust"
2. search_awesome_lists: topic="rust"
3. get_github_trending: language="rust"
4. search_stackoverflow: tags=["rust"]
```

### Web Scraping & Crawling
```bash
1. crawl_webpage: maxDepth=2, extractContent=true
2. extract_links: filter="internal"
3. scrape_webpage: selectors={...}
```

## 💡 Pro Tips

### Combining Tools
Chain tools for powerful workflows:
```
1. search_awesome_lists("machine-learning")
2. For each list: crawl_webpage(url)
3. extract_links(filter="external")
4. For repos: get_github_repo(owner, name)
```

### Filtering Results
Most search tools support:
- `limit`: Control result count (default 10)
- `query`: Search term
- Additional filters specific to each tool

### Error Handling
All tools return structured errors:
- Timeout errors after 10-60 seconds
- Validation errors for invalid input
- Network errors with helpful messages

## 🆕 What's New in v2.2

### Web Crawling
- Multi-level crawling with depth control
- Content extraction
- Link filtering

### Package Ecosystems
- Python (PyPI)
- Rust (Crates.io)
- PHP (Packagist)
- Java (Maven)
- Go (pkg.go.dev)

### AI/ML
- OpenRouter models
- Hugging Face integration

### Developer Content
- Dev.to articles
- Medium posts
- GitHub trending
- Awesome lists

### Containers
- Docker Hub search
- Image details

## 📚 Documentation

- `README.md` - Main documentation
- `NEW_FEATURES.md` - v2.2 feature details
- `QUICK_REFERENCE.md` - Quick syntax reference
- `ENHANCEMENT_SUMMARY.md` - Technical summary
- `TOOLS_OVERVIEW.md` - This file

## 🎉 Summary

**68 tools** covering web scraping, file operations, data processing, security, Git, AI models, package discovery, and developer content - all without requiring API keys!

Perfect for AI assistants that need comprehensive developer capabilities.
