# 🚀 Publishing Guide for MCP Eternos

## 📦 Package Information

- **Name**: `@recoder-code/mcp-eternos`
- **Version**: 1.0.0
- **Registry**: npm
- **Scope**: @recoder-code

---

## ✅ Pre-Publishing Checklist

- [x] Package rebranded to Recoder
- [x] Repository links updated
- [x] Author information updated
- [x] Homepage set to recoder.xyz
- [x] Keywords optimized for discoverability
- [ ] Build and test the package
- [ ] Review README.md
- [ ] Add LICENSE file if missing
- [ ] Test installation locally

---

## 🔧 Preparation Steps

### 1. Build the Package

```bash
cd packages/mcp-eternos
npm install
npm run build
```

### 2. Test Locally

```bash
# Test the built package
node dist/index.js

# Test via npm link
npm link
# Then in another project
npm link @recoder-code/mcp-eternos
```

### 3. Verify Package Contents

```bash
npm pack --dry-run
```

This shows what files will be included in the published package.

---

## 📤 Publishing to npm

### 1. Login to npm

```bash
npm login
# Use recoder organization credentials
# Username: (your npm username)
# Password: (your npm password)
# Email: support@recoder.xyz
```

### 2. Verify Organization Access

Make sure you have publish rights for `@recoder-code` scope:

```bash
npm org ls recoder-code
```

If not set up, create the organization:
```bash
npm org create recoder-code
```

### 3. Publish the Package

```bash
# Publish with public access
npm publish --access public

# Or for beta/preview
npm publish --tag beta --access public
```

### 4. Verify Publication

```bash
# Check on npm registry
npm view @recoder-code/mcp-eternos

# Test installation
npm install -g @recoder-code/mcp-eternos
```

---

## 📋 Post-Publishing

### 1. Update Documentation

- Update main README.md to reference the published package
- Add installation instructions using npm

### 2. Tag the Release on GitHub

```bash
git tag -a mcp-eternos-v1.0.0 -m "MCP Eternos v1.0.0"
git push origin mcp-eternos-v1.0.0
```

### 3. Create GitHub Release

Go to https://github.com/caelum0x/recoder-code/releases and create a release:

**Release Title**: MCP Eternos v1.0.0  
**Tag**: mcp-eternos-v1.0.0  
**Description**:
```markdown
## 🚀 MCP Eternos v1.0.0

First official release of Eternos, a powerful MCP server with 15 developer tools.

### Features
- 🌐 Web scraping & HTTP client
- 📁 File system operations
- 🔄 Data format conversion (JSON/YAML/CSV/XML)
- 🔐 Security & cryptography tools
- 💻 Code generation & analysis
- 🗄️ SQLite database queries
- ⏰ Time & date operations
- 🖥️ System information

### Installation
\`\`\`bash
npm install -g @recoder-code/mcp-eternos
\`\`\`

### Documentation
See README.md for full documentation and usage examples.
```

---

## 🔄 Updating the Package

### Version Bumping

```bash
# Patch version (1.0.0 -> 1.0.1)
npm version patch

# Minor version (1.0.0 -> 1.1.0)
npm version minor

# Major version (1.0.0 -> 2.0.0)
npm version major
```

Then publish:
```bash
npm publish --access public
```

---

## 🌐 MCP Registry Submission

Consider submitting to the official MCP registry:

1. Visit https://github.com/modelcontextprotocol/servers
2. Fork the repository
3. Add your server to the list
4. Submit a pull request

**Entry template:**
```markdown
### Eternos by Recoder

Advanced developer toolkit with 15 tools for web scraping, file operations, data processing, security, and more.

- **Install**: `npm install -g @recoder-code/mcp-eternos`
- **Repository**: https://github.com/caelum0x/recoder-code
- **Documentation**: https://github.com/caelum0x/recoder-code/tree/main/packages/mcp-eternos
```

---

## 📊 Usage Instructions for End Users

Add this to your README.md:

```markdown
## Installation

### From npm (Recommended)

\`\`\`bash
npm install -g @recoder-code/mcp-eternos
\`\`\`

### Configuration

Add to your MCP client config (e.g., Claude Desktop):

\`\`\`json
{
  "mcpServers": {
    "eternos": {
      "command": "npx",
      "args": ["@recoder-code/mcp-eternos"]
    }
  }
}
\`\`\`

Or if installed globally:

\`\`\`json
{
  "mcpServers": {
    "eternos": {
      "command": "mcp-eternos"
    }
  }
}
\`\`\`
```

---

## 🎯 Success Metrics

After publishing, monitor:

- npm download statistics
- GitHub stars and forks
- Issues and pull requests
- Community feedback

---

## 🆘 Troubleshooting

### "You do not have permission to publish"

Make sure:
1. You're logged in: `npm whoami`
2. You have access to @recoder-code scope
3. Package name is available

### "Package name already exists"

Choose a different name or scope:
- `@recoder/mcp-eternos`
- `@recoder-code/eternos`
- `recoder-mcp-eternos`

### "ENOENT: no such file or directory"

Make sure you've built the package:
```bash
npm run build
```

---

**Ready to publish? Let's go! 🚀**
