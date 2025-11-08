# 🚀 Publishing Guide for VSCode Extension

## 📦 Extension Information

- **Name**: `recoder-code-vscode-companion`
- **Display Name**: Recoder Code Companion
- **Version**: 1.0.0
- **Publisher**: recoder
- **Marketplace**: VS Code Marketplace

---

## ✅ Pre-Publishing Checklist

- [x] Extension rebranded from Qwen to Recoder
- [x] All commands updated (recoder.* instead of qwen.*)
- [x] README updated with Recoder branding
- [x] Package.json updated
- [x] Repository links updated
- [x] Homepage set to recoder.xyz
- [ ] Build and test the extension
- [ ] Test installation in VS Code
- [ ] Review icon.png (may need rebranding)
- [ ] Get publisher account on VS Code Marketplace

---

## 🔧 Preparation Steps

### 1. Install VSCE (VS Code Extension Manager)

```bash
npm install -g @vscode/vsce
```

### 2. Build the Extension

```bash
cd packages/vscode-ide-companion
npm install
npm run build
```

### 3. Test the Extension Locally

```bash
# Package the extension (creates .vsix file)
npm run package

# Install in VS Code
code --install-extension recoder-code-vscode-companion-1.0.0.vsix
```

### 4. Test in VS Code

1. Reload VS Code (Cmd+Shift+P → "Developer: Reload Window")
2. Run command: "Recoder Code: Run"
3. Test diff acceptance workflow
4. Verify open file tracking
5. Check all features work as expected

---

## 📤 Publishing to VS Code Marketplace

### 1. Create Publisher Account

Visit https://marketplace.visualstudio.com/manage

1. Sign in with Microsoft/GitHub account
2. Create a publisher with ID: `recoder`
3. Fill in profile information:
   - Display Name: Recoder
   - Website: https://recoder.xyz
   - Email: support@recoder.xyz

### 2. Get Personal Access Token (PAT)

1. Go to https://dev.azure.com/
2. Click on User Settings → Personal Access Tokens
3. Create new token with:
   - Name: "VS Code Marketplace - Recoder"
   - Organization: All accessible organizations
   - Expiration: 90 days (or longer)
   - Scopes: **Marketplace → Manage**

4. Copy the token (you won't see it again!)

### 3. Login with VSCE

```bash
vsce login recoder
# Paste your Personal Access Token when prompted
```

### 4. Publish the Extension

```bash
# From the extension directory
cd packages/vscode-ide-companion

# Publish
vsce publish

# Or publish with specific version
vsce publish 1.0.0

# Or publish as pre-release
vsce publish --pre-release
```

### 5. Verify Publication

Visit: https://marketplace.visualstudio.com/items?itemName=recoder.recoder-code-vscode-companion

---

## 🎨 Update Extension Icon (Optional)

The current icon is from Qwen. You may want to create a Recoder-branded icon:

1. Create a 256x256 PNG image with your Recoder logo
2. Replace `assets/icon.png`
3. Rebuild and republish

Recommended tools:
- Figma (https://figma.com)
- Canva (https://canva.com)
- GIMP (free, https://gimp.org)

---

## 📋 Post-Publishing

### 1. Update Documentation

Update main repository README to reference the extension:

```markdown
### VS Code Extension

Install the Recoder Code Companion extension for seamless VS Code integration:

[Install from VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=recoder.recoder-code-vscode-companion)

Or search for "Recoder Code Companion" in VS Code Extensions.
```

### 2. Tag the Release on GitHub

```bash
git tag -a vscode-ext-v1.0.0 -m "VSCode Extension v1.0.0"
git push origin vscode-ext-v1.0.0
```

### 3. Create GitHub Release

Go to https://github.com/caelum0x/recoder-code/releases and create a release:

**Release Title**: VSCode Extension v1.0.0  
**Tag**: vscode-ext-v1.0.0  
**Description**:
```markdown
## 🚀 Recoder Code VSCode Extension v1.0.0

First official release of the Recoder Code Companion for VS Code!

### Features
- 📂 Open file context tracking
- ✏️ Selection and cursor position awareness
- 🔄 Native diff viewing and editing
- ✅ Accept/reject AI suggestions inline
- 🚀 Quick launch Recoder Code from command palette

### Installation

**From VS Code Marketplace:**
1. Open VS Code
2. Go to Extensions (Cmd+Shift+X)
3. Search for "Recoder Code Companion"
4. Click Install

**Or via command line:**
\`\`\`bash
code --install-extension recoder.recoder-code-vscode-companion
\`\`\`

### Requirements
- VS Code 1.99.0 or newer
- Recoder Code CLI installed

### Documentation
See README.md for full documentation.
```

---

## 🔄 Updating the Extension

### Version Bumping

```bash
# Update version in package.json, then:
vsce publish patch   # 1.0.0 -> 1.0.1
vsce publish minor   # 1.0.0 -> 1.1.0
vsce publish major   # 1.0.0 -> 2.0.0
```

Or manually:
```bash
npm version patch
vsce publish
```

---

## 📊 Extension Manifest Best Practices

Ensure your `package.json` has:

✅ Clear `displayName` and `description`  
✅ Relevant `keywords` for discoverability  
✅ `icon` (256x256 PNG)  
✅ `repository` URL  
✅ `homepage` URL  
✅ `bugs` URL for issue tracking  
✅ `license` field  
✅ `engines.vscode` version  
✅ `categories` (e.g., "AI", "Programming Languages")

---

## 🌟 Marketplace Optimization

### 1. Create Screenshots

Take screenshots showing:
- Extension in action with Recoder Code
- Diff view with accept/reject buttons
- Command palette integration
- File context tracking

Add to your repository and link in README.

### 2. Write Comprehensive README

Include:
- Clear feature descriptions
- Installation instructions
- Usage examples with GIFs/screenshots
- Keyboard shortcuts
- Configuration options
- Troubleshooting guide

### 3. Add Badges

```markdown
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/recoder.recoder-code-vscode-companion)](https://marketplace.visualstudio.com/items?itemName=recoder.recoder-code-vscode-companion)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/recoder.recoder-code-vscode-companion)](https://marketplace.visualstudio.com/items?itemName=recoder.recoder-code-vscode-companion)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/recoder.recoder-code-vscode-companion)](https://marketplace.visualstudio.com/items?itemName=recoder.recoder-code-vscode-companion)
```

---

## 🎯 Success Metrics

After publishing, monitor:

- Extension installs and active users
- Ratings and reviews
- GitHub issues and feature requests
- User feedback in marketplace

---

## 🆘 Troubleshooting

### "Publisher 'recoder' not found"

Create the publisher first at https://marketplace.visualstudio.com/manage

### "Extension validation failed"

Common issues:
- Missing required fields in package.json
- Invalid icon size (must be 256x256)
- Broken repository URL
- Missing LICENSE file

### "Personal access token expired"

Create a new PAT and login again:
```bash
vsce login recoder
```

### "Extension ID already exists"

Choose a different name:
- `recoder.vscode-companion`
- `recoder.ide-companion`
- `recoder.code-assistant`

---

## 📱 Open VSX Registry (Optional)

Publish to Open VSX for open-source VS Code alternatives:

```bash
# Install ovsx
npm install -g ovsx

# Create account at https://open-vsx.org/
# Get access token from user settings

# Login
ovsx login
# Paste your Open VSX token

# Publish
ovsx publish
```

---

## 📚 Useful Resources

- [VS Code Extension Docs](https://code.visualstudio.com/api)
- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest)
- [VSCE CLI](https://github.com/microsoft/vscode-vsce)

---

**Ready to publish? Let's make Recoder Code awesome in VS Code! 🎉**
