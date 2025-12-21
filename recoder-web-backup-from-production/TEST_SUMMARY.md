# 🧪 Complete Testing Infrastructure

## Overview

Comprehensive testing suite covering unit tests, integration tests, and end-to-end tests.

## Test Types

### 1. Unit Tests (Vitest)
```bash
npm run test          # Run once
npm run test:watch    # Watch mode
```

**Location:** `tests/`  
**Framework:** Vitest  
**Purpose:** Test individual functions and components

### 2. E2E Tests (Playwright)
```bash
npm run test:e2e         # Run all E2E tests
npm run test:e2e:ui      # Interactive UI mode
npm run test:e2e:headed  # See browser
npm run test:e2e:debug   # Debug mode
```

**Location:** `e2e/`  
**Framework:** Playwright  
**Purpose:** Test complete user workflows

### 3. Integration Tests
```bash
npm run test:clone      # Test GitHub cloning
npm run test:templates  # Test template matching
```

**Location:** `scripts/`  
**Purpose:** Test specific features end-to-end

## Test Suites

### E2E Test Suites (31 tests)
1. **Basic Application Flow** (5 tests)
   - Application loads
   - Chat interface
   - Header buttons
   - Chat toggle
   - Input typing

2. **Starter Templates** (4 tests)
   - Open browser
   - Display categories
   - Search function
   - Close browser

3. **GitHub Integration** (5 tests)
   - Open modal
   - URL input
   - Validation
   - Valid URLs
   - Close modal

4. **Workbench Features** (4 tests)
   - Toggle visibility
   - Code editor
   - Code/Preview switch
   - File tree

5. **MCP Tools** (3 tests)
   - Open panel
   - Display servers
   - Close panel

6. **API Endpoints** (4 tests)
   - Health check
   - Starters API
   - GitHub API
   - System health

7. **Integration Workflows** (6 tests)
   - Complete workflows
   - Modal stress test
   - Performance test
   - Accessibility check

## Quick Start

### Install Dependencies
```bash
# Playwright is already installed
# Install browsers
npx playwright install chromium
```

### Run All Tests
```bash
npm run test:all
```

### Run Specific Suite
```bash
# Unit tests only
npm run test

# E2E tests only
npm run test:e2e

# Specific E2E test file
npx playwright test e2e/01-basic-flow.spec.ts
```

## Test Scripts Available

| Command | Description |
|---------|-------------|
| `npm run test` | Run unit tests |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:e2e` | Run all E2E tests |
| `npm run test:e2e:ui` | Interactive test UI |
| `npm run test:e2e:headed` | See browser while testing |
| `npm run test:e2e:debug` | Debug tests step-by-step |
| `npm run test:e2e:report` | View HTML report |
| `npm run test:all` | Run unit + E2E tests |
| `npm run test:clone` | Test GitHub cloning |
| `npm run test:templates` | Test template matching |

## Configuration Files

### Playwright Config
**File:** `playwright.config.ts`
- Base URL: http://localhost:5173
- Timeout: 120s per test
- Parallel execution
- Screenshots on failure
- Videos on failure
- Traces on retry

### Vitest Config
**File:** `vitest.config.ts`
- Unit test configuration
- Test environment setup

## Test Reports

### After Running E2E Tests
```bash
# View HTML report
npm run test:e2e:report

# Opens browser with:
# - Test results
# - Screenshots
# - Videos
# - Performance metrics
# - Trace viewer
```

### Report Locations
```
playwright-report/    # HTML report
test-results/         # Screenshots, videos
test-results.json     # JSON report
```

## CI/CD Integration

Tests are ready for CI/CD:

```yaml
# Example GitHub Actions
- name: Run Tests
  run: |
    npm install
    npm run build
    npx playwright install --with-deps
    npm run test:all
```

## Performance Benchmarks

From E2E tests:

| Metric | Target | Current |
|--------|--------|---------|
| Page load | <5s | ~2-3s ✅ |
| Modal open | <1s | ~500ms ✅ |
| Search | <500ms | ~200ms ✅ |
| API response | <2s | ~500ms ✅ |

## Coverage

### What's Tested ✅
- UI components load
- User interactions
- Modal dialogs
- Form inputs
- Navigation
- API endpoints
- Complete workflows
- Performance
- Basic accessibility

### Future Enhancements ⏳
- Visual regression testing
- Cross-browser testing (Firefox, Safari)
- Mobile viewport testing
- Accessibility deep-dive
- Load testing
- Security testing

## Debugging

### Failed Test?
```bash
# 1. Run in debug mode
npm run test:e2e:debug

# 2. Or run in headed mode
npm run test:e2e:headed

# 3. Check screenshots
ls test-results/

# 4. View trace
npx playwright show-trace test-results/<test-name>/trace.zip
```

### Test Flaky?
```bash
# Run multiple times
npx playwright test --grep "test name" --repeat-each=10
```

### Browser Issues?
```bash
# Reinstall browsers
npx playwright install --force
```

## Best Practices

1. **Run tests before commit**
   ```bash
   npm run test:all
   ```

2. **Write tests for new features**
   - Add to appropriate suite
   - Follow existing patterns

3. **Keep tests fast**
   - Mock external services
   - Use fixtures
   - Avoid unnecessary waits

4. **Make tests reliable**
   - Use proper selectors
   - Wait for elements
   - Handle loading states

## Examples

### Run Specific Test
```bash
# Run one test file
npx playwright test e2e/01-basic-flow.spec.ts

# Run tests matching pattern
npx playwright test --grep "GitHub"

# Run tests in specific browser
npx playwright test --project=chromium
```

### Watch Mode
```bash
# Unit tests
npm run test:watch

# E2E tests with UI
npm run test:e2e:ui
```

## Summary

**Total Tests:** 31+ E2E tests  
**Frameworks:** Vitest + Playwright  
**Coverage:** UI, API, Integration, Performance  
**Status:** ✅ Ready to use  

**Run tests now:**
```bash
npm run test:e2e
```

**Complete testing infrastructure is ready for production!** 🎉
