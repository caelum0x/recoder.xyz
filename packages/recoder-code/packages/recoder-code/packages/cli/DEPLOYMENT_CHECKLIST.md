# 🚀 Recoder CLI - Deployment Checklist

> Pre-deployment verification for the Recoder Code CLI package

---

## 📋 Pre-Deployment Checklist

### ✅ Code Quality

- [ ] All TypeScript files compile without errors
  ```bash
  npm run typecheck
  ```

- [ ] Build completes successfully
  ```bash
  npm run build
  ```

- [ ] Unit tests pass
  ```bash
  npm test
  ```

- [ ] Integration tests pass
  ```bash
  npm run test:integration
  ```

- [ ] Code is linted and formatted
  ```bash
  npm run lint
  npm run format
  ```

---

### ✅ Backend Integration

- [ ] Backend API is accessible
  ```bash
  curl https://recoder.xyz/api/health
  ```

- [ ] Authentication endpoints work
  - [ ] OAuth flow: `/api/auth/cli`
  - [ ] Device flow: `/api/auth/cli`
  - [ ] API key flow: `/api/auth/cli`

- [ ] AI endpoints work
  - [ ] Code generation: `/api/cli/ai/complete`
  - [ ] Usage stats: `/api/user/usage`
  - [ ] Model recommendations: `/api/ai/recommend-models`
  - [ ] Quota info: `/api/user/quota`

- [ ] OpenRouter API key set in backend
  ```bash
  # Backend .env should have:
  OPENROUTER_API_KEY=sk-or-v1-xxx
  ```

---

### ✅ CLI Commands

Test all commands manually:

#### Authentication Commands
- [ ] `recoder-code auth login` - Web OAuth works
- [ ] `recoder-code auth login --device` - Device flow works
- [ ] `recoder-code auth login --api-key` - API key auth works
- [ ] `recoder-code auth logout` - Logout works
- [ ] `recoder-code auth status` - Shows correct status
- [ ] `recoder-code auth whoami` - Shows user info
- [ ] `recoder-code auth quota` - Shows quota details
- [ ] `recoder-code auth set-api-key` - Sets OpenRouter key

#### AI Commands
- [ ] `recoder-code ai generate` - Generates code
- [ ] `recoder-code ai generate --model` - Uses specified model
- [ ] `recoder-code ai generate --output` - Saves to file
- [ ] `recoder-code ai chat` - Interactive chat works
- [ ] `recoder-code ai usage` - Shows usage stats
- [ ] `recoder-code ai models` - Lists models
- [ ] `recoder-code ai models --task` - Shows recommendations

---

### ✅ Error Handling

- [ ] Not authenticated error
  ```bash
  recoder-code auth logout
  recoder-code ai generate "test"
  # Should show: "Please login first"
  ```

- [ ] Budget exceeded error
  ```bash
  # If user is at limit, should show options:
  # - Wait for reset
  # - Upgrade plan
  # - Use own API key
  ```

- [ ] Invalid API key error
  ```bash
  recoder-code auth set-api-key invalid-key
  # Should show: "API key must start with sk-or-v1-"
  ```

- [ ] Network error handling
  ```bash
  export RECODER_API_URL=https://invalid-url.com
  recoder-code auth status
  # Should show: "Failed to connect to backend"
  ```

---

### ✅ Documentation

- [ ] README.md is up to date
- [ ] CLI_BACKEND_INTEGRATION.md is complete
- [ ] AI_SERVICE_QUICK_START.md is accurate
- [ ] AUTH_COMMANDS.md is current
- [ ] AI_COMMANDS_GUIDE.md is current
- [ ] All example commands work as documented

---

### ✅ Package Configuration

- [ ] package.json version is incremented
  ```json
  {
    "version": "2.5.0"
  }
  ```

- [ ] Dependencies are up to date
  ```bash
  npm outdated
  npm audit
  ```

- [ ] Binary paths are correct
  ```json
  {
    "bin": {
      "recoder-code": "dist/index.js",
      "recoder": "dist/index.js"
    }
  }
  ```

- [ ] Files to publish are specified
  ```json
  {
    "files": [
      "dist",
      "src/postinstall.cjs"
    ]
  }
  ```

---

### ✅ Environment Variables

Backend should have:
```bash
OPENROUTER_API_KEY=sk-or-v1-xxx
OPENROUTER_SITE_NAME=Recoder-Code
OPENROUTER_SITE_URL=https://github.com/recoder-code

# Optional
RECODER_API_URL=https://recoder.xyz
```

CLI supports:
```bash
RECODER_API_URL=https://recoder.xyz  # Custom backend URL
```

---

### ✅ Testing Scenarios

#### Scenario 1: New User (Free Plan)
```bash
# 1. Install
npm install -g recoder-code

# 2. Try to generate code (should fail)
recoder-code ai generate "test"
# Expected: "Please login first"

# 3. Login
recoder-code auth login

# 4. Try to generate code (should prompt for API key)
recoder-code ai generate "test"
# Expected: "Configure your OpenRouter API key"

# 5. Set API key
recoder-code auth set-api-key sk-or-v1-xxx

# 6. Generate code (should work)
recoder-code ai generate "write hello world"
# Expected: Code generated
```

#### Scenario 2: Pro User
```bash
# 1. Login
recoder-code auth login

# 2. Check quota
recoder-code auth quota
# Expected: Shows $17.50 budget

# 3. Generate code
recoder-code ai generate "build REST API"
# Expected: Uses Claude Sonnet 4 by default

# 4. Check usage
recoder-code ai usage
# Expected: Shows cost and remaining budget
```

#### Scenario 3: Premium User
```bash
# 1. Login
recoder-code auth login

# 2. Generate complex code
recoder-code ai generate "implement OAuth2 flow"
# Expected: Uses Claude Sonnet 4.5 by default

# 3. Interactive chat
recoder-code ai chat
# Expected: High-quality responses
```

---

### ✅ Performance

- [ ] Cold start time < 2 seconds
  ```bash
  time recoder-code --version
  ```

- [ ] Authentication check < 500ms
  ```bash
  time recoder-code auth status
  ```

- [ ] Simple code generation < 5 seconds
  ```bash
  time recoder-code ai generate "hello world"
  ```

---

### ✅ Security

- [ ] Credentials stored with 0600 permissions
  ```bash
  ls -la ~/.recoder/auth.json
  # Should show: -rw------- (only owner can read/write)
  ```

- [ ] No secrets in code or logs
  ```bash
  grep -r "sk-or-v1" src/
  grep -r "rcli_" src/
  # Should find none
  ```

- [ ] HTTPS used for all API calls
  ```bash
  # Check all fetch() calls use https://
  grep -r "http://" src/services/
  # Should find none (except localhost for OAuth callback)
  ```

---

### ✅ Compatibility

- [ ] Works on macOS (tested)
- [ ] Works on Linux (tested)
- [ ] Works on Windows (tested)
- [ ] Node.js >= 18.0.0 (tested)
- [ ] npm >= 8.0.0 (tested)

---

### ✅ Monitoring

After deployment, monitor:

- [ ] npm download stats
- [ ] Error rates in backend logs
- [ ] API usage patterns
- [ ] User feedback/issues
- [ ] Budget utilization by plan

---

## 🚀 Deployment Steps

### 1. Prepare Release

```bash
# Update version
npm version patch  # or minor/major

# Build
npm run build

# Test
npm test
npm run test:integration

# Verify package
npm pack
tar -xzf recoder-code-cli-*.tgz
ls package/
```

### 2. Test Installation Locally

```bash
# Install from tarball
npm install -g ./recoder-code-cli-*.tgz

# Test commands
recoder-code --version
recoder-code --help
recoder-code auth --help
recoder-code ai --help

# Uninstall
npm uninstall -g recoder-code-cli
```

### 3. Publish to npm

```bash
# Login to npm
npm login

# Dry run
npm publish --dry-run

# Publish
npm publish

# Verify
npm info recoder-code-cli
```

### 4. Post-Deployment

```bash
# Install from npm
npm install -g recoder-code-cli

# Smoke test
recoder-code --version
recoder-code auth login
recoder-code ai generate "test"

# Tag release
git tag v2.5.0
git push origin v2.5.0
```

---

## 📊 Success Metrics

After deployment, track:

- ✅ Zero critical errors in first 24 hours
- ✅ All core features working as expected
- ✅ User authentication success rate > 95%
- ✅ AI generation success rate > 98%
- ✅ Average response time < 3 seconds
- ✅ No budget calculation errors

---

## 🆘 Rollback Plan

If critical issues occur:

```bash
# Unpublish latest version (within 72 hours)
npm unpublish recoder-code-cli@2.5.0

# Or deprecate
npm deprecate recoder-code-cli@2.5.0 "Critical bug, use 2.4.1"

# Fix issues and republish
npm version patch
npm publish
```

---

## 📞 Support

- **Issues**: https://github.com/recoder-code/recoder-code/issues
- **Docs**: https://github.com/recoder-code/recoder-code
- **Backend**: https://recoder.xyz

---

**Last Updated**: 2024-10-19  
**Status**: Ready for v2.5.0 Release
