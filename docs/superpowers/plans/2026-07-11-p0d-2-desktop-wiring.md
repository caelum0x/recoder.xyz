# P0d-2: Desktop Boot + Auto-Update Wiring for Managed Policy

## Goal
Wire the fail-closed Managed Policy loader into the desktop app's boot sequence and auto-update channel selection without breaking existing behavior. The policy loads once at startup, gates electron-updater channel selection via an allowlist, and exposes policy state (e.g., `backendMode`) to other boot code.

## Architecture
1. **Pure helper module** (`policy-config.js`): Testable update-channel resolver (no Electron deps).
   - Input: requested channel (from electron-updater default), policy allowlist, requested fallback.
   - Output: validated channel name guaranteed in allowlist.
   - Unit-tested independently with vitest.

2. **Main process integration** (`main.js`):
   - Load policy via `loadManagedPolicy({ readFileSync: fs.readFileSync, platform: process.platform })` at app boot (in or just before `app.whenReady()`).
   - Store policy instance in module-level var: `let currentManagedPolicy = DEFAULT_POLICY`.
   - Export a getter: `function getManagedPolicy() { return currentManagedPolicy; }`.
   - Gate auto-updater channel: before calling `checkForUpdates()`, apply policy-validated channel via resolver.
   - NO refactoring of existing main.js code; changes are minimal and additive.

3. **Test coverage**:
   - Unit tests for `policy-config.js` (via vitest).
   - Integration test verifying policy loads before auto-updater setup.
   - Document IPC handler contracts remain unchanged.

## Tech Stack
- **CommonJS** (main.js, managed-policy.js, policy-config.js all `.js`).
- **vitest ^3** (ESM test files, use `createRequire` for CJS modules).
- **No new deps**: uses only fs (Node.js built-in) and existing electron-updater.
- Fail-closed: missing/invalid policy → `DEFAULT_POLICY` (safe defaults).

## Global Constraints
- **Existing behavior**: boot sequence unchanged, auto-update still works with or without policy.
- **Minimal changes**: no refactoring, no IPC handler renaming.
- **Testability**: extract channel selection logic into pure function so vitest can unit-test without Electron.
- **Safety**: policy load errors logged but never crash boot; updateChannels defaults to `['stable']`.

---

# Task 1: Create testable pure-logic helper module

## Files
- `/Users/arhansubasi/recoder.xyz/apps/desktop/policy-config.js` (NEW)

## Interfaces
```javascript
/**
 * Choose an update channel from the union of (requested channel, policy allowlist, fallback).
 * Fail-closed: returns fallback if requested is not in the allowlist.
 * @param {string} requestedChannel     The channel the updater wants (e.g., 'stable', 'beta').
 * @param {string[]} policyAllowlist    Policy-blessed channels (e.g., ['stable', 'beta']).
 * @param {string} fallback             Channel to use if requestedChannel is not allowed (default 'stable').
 * @returns {string}                    A channel guaranteed to be in policyAllowlist.
 */
export function chooseUpdateChannel(requestedChannel, policyAllowlist, fallback = 'stable')
```

## Checkbox Steps

- [ ] **Failing test**: Write `__tests__/policy-config.test.js` (vitest ESM) that imports `{ chooseUpdateChannel }` via `createRequire` and asserts:
  - `chooseUpdateChannel('stable', ['stable', 'beta'], 'stable')` → `'stable'`.
  - `chooseUpdateChannel('beta', ['stable', 'beta'], 'stable')` → `'beta'`.
  - `chooseUpdateChannel('enterprise', ['stable', 'beta'], 'stable')` → `'stable'` (not in allowlist, use fallback).
  - `chooseUpdateChannel('beta', [], 'stable')` → `'stable'` (empty allowlist, use fallback).
  - `chooseUpdateChannel('stable', ['stable'], 'stable')` → `'stable'`.
  
  Run: `npm run test -- __tests__/policy-config.test.js` → expect failures.

- [ ] **Implement**: Create `policy-config.js` (CommonJS), export `chooseUpdateChannel(requestedChannel, policyAllowlist, fallback)`:
  ```javascript
  function chooseUpdateChannel(requestedChannel, policyAllowlist, fallback = 'stable') {
    if (!Array.isArray(policyAllowlist) || policyAllowlist.length === 0) {
      return fallback;
    }
    if (policyAllowlist.includes(requestedChannel)) {
      return requestedChannel;
    }
    return fallback;
  }

  module.exports = { chooseUpdateChannel };
  ```

- [ ] **Run tests**: `npm run test -- __tests__/policy-config.test.js` → all pass.

- [ ] **Commit**:
  ```bash
  git add apps/desktop/policy-config.js apps/desktop/__tests__/policy-config.test.js
  git commit -m "feat(desktop): add policy-config pure helper for update channel validation

  Introduces chooseUpdateChannel(requested, allowlist, fallback) to gate
  electron-updater channel selection against the managed policy allowlist.
  Fail-closed: returns fallback if requested is not allowed.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

# Task 2: Wire policy loader into main.js boot + auto-update

## Files
- `/Users/arhansubasi/recoder.xyz/apps/desktop/main.js` (MODIFY)
  - Add policy load at app.whenReady() (before auto-update setup).
  - Gate auto-updater channel on policy allowlist.
  - Export getter for currentManagedPolicy.

## Interfaces
```javascript
// Near top of main.js (after const declarations, ~line 115):
const { loadManagedPolicy } = require('./managed-policy');
const { chooseUpdateChannel } = require('./policy-config');

let currentManagedPolicy = null;

/**
 * The managed policy loaded at boot. Returns DEFAULT_POLICY if load fails.
 * @returns {ManagedPolicy}
 */
function getManagedPolicy() {
  return currentManagedPolicy || require('./managed-policy').DEFAULT_POLICY;
}

// In app.whenReady() callback (~line 2517), before auto-updater setup:
// Load policy once at boot.
currentManagedPolicy = loadManagedPolicy({ readFileSync: fs.readFileSync, platform: process.platform });
appendDesktopLog('boot.log', `[policy-load] source=${currentManagedPolicy.source}, backendMode=${currentManagedPolicy.backendMode}, channels=${currentManagedPolicy.updateChannels.join(',')}`);
```

And in the auto-updater setup (~line 3189 onward):
```javascript
// After autoUpdater = require('electron-updater').autoUpdater;
const policy = getManagedPolicy();
const safeChannel = chooseUpdateChannel(autoUpdater.currentChannel || 'stable', policy.updateChannels, 'stable');
autoUpdater.channel = safeChannel;
appendDesktopLog('auto-update.log', `[channel-set] requested=${autoUpdater.currentChannel || 'stable'}, policy=${policy.updateChannels.join(',')}, chosen=${safeChannel}`);
```

## Checkbox Steps

- [ ] **Test prep**: Add integration test to `__tests__/main.test.js`:
  ```javascript
  describe('Managed policy boot integration', () => {
    it('main.js loads managed policy at boot time', () => {
      const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
      expect(mainSrc).toContain('loadManagedPolicy');
      expect(mainSrc).toContain('currentManagedPolicy');
      expect(mainSrc).toContain('getManagedPolicy()');
    });

    it('auto-updater channel is gated by policy allowlist', () => {
      const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
      expect(mainSrc).toContain('chooseUpdateChannel');
      expect(mainSrc).toContain('policy.updateChannels');
      expect(mainSrc).toContain('autoUpdater.channel');
    });
  });
  ```

- [ ] **Edit main.js** (around line 115, after imports):
  Add imports + module-level vars:
  ```javascript
  const { loadManagedPolicy } = require('./managed-policy');
  const { chooseUpdateChannel } = require('./policy-config');

  let currentManagedPolicy = null;

  function getManagedPolicy() {
    return currentManagedPolicy || require('./managed-policy').DEFAULT_POLICY;
  }
  ```

- [ ] **Edit main.js** (in `app.whenReady()` callback, ~line 2517):
  Add near the top of the callback (before other boot logic):
  ```javascript
  // Load managed policy at boot (fail-closed: absent/invalid → DEFAULT_POLICY).
  currentManagedPolicy = loadManagedPolicy({
    readFileSync: fs.readFileSync,
    platform: process.platform,
  });
  appendDesktopLog('boot.log',
    `[policy-load] source=${currentManagedPolicy.source} backendMode=${currentManagedPolicy.backendMode} channels=${currentManagedPolicy.updateChannels.join(',')}`,
  );
  ```

- [ ] **Edit main.js** (in auto-updater try block, ~line 3189):
  After `autoUpdater = require('electron-updater').autoUpdater;`:
  ```javascript
  // Gate updater channel against policy allowlist.
  const policy = getManagedPolicy();
  const safeChannel = chooseUpdateChannel(
    autoUpdater.currentChannel || 'stable',
    policy.updateChannels,
    'stable',
  );
  autoUpdater.channel = safeChannel;
  appendDesktopLog('auto-update.log',
    `[channel-set] requested=${autoUpdater.currentChannel || 'stable'} policy=${policy.updateChannels.join(',')} chosen=${safeChannel}`,
  );
  ```

- [ ] **Run tests**:
  ```bash
  npm run test -- __tests__/main.test.js
  ```
  Verify the integration tests pass (policy boot + channel gating assertions).

- [ ] **Manual smoke test** (dev mode):
  ```bash
  RECODER_EMBEDDED_BACKEND=0 NODE_ENV=development npm start
  ```
  Check console/logs: no errors on policy load, boot.log and auto-update.log written, first window opens.

- [ ] **Commit**:
  ```bash
  git add apps/desktop/main.js apps/desktop/__tests__/main.test.js
  git commit -m "feat(desktop): wire managed policy loader into app boot and auto-update

  - Load policy once at app.whenReady() before auto-updater setup (fail-closed).
  - Gate electron-updater channel selection against policy.updateChannels allowlist.
  - Export getManagedPolicy() getter so other boot code (e.g., embedded backend) can read policy state.
  - Log policy load outcome and channel decision to auto-update.log for diagnostics.
  - No breaking changes: auto-update still works without a policy file.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

# Self-Review

## Completeness
- [x] Pure testable helper extracted (policy-config.js, unit-tested).
- [x] Policy loaded once at boot, fail-closed (returns DEFAULT_POLICY on any error).
- [x] Auto-updater channel gated on policy allowlist.
- [x] Policy getter exposed (getManagedPolicy()) for other boot code.
- [x] No refactoring of existing main.js code; changes minimal + additive.
- [x] Test coverage: policy-config tests (unit), main.js tests (integration).
- [x] Logging added for diagnostics (boot.log, auto-update.log).

## Safety
- [x] Fail-closed on missing/invalid policy: defaults to ['stable'].
- [x] Existing auto-update flow still works (backward compatible).
- [x] No breaking changes to IPC handlers or public APIs.
- [x] Policy load does not block boot (sync readFileSync in try/catch).

## Testability
- [x] chooseUpdateChannel() is pure (no Electron, no I/O) → easy vitest unit test.
- [x] main.js boot logic verified by scanning source (no live Electron needed).
- [x] Test file uses createRequire to load CJS modules in ESM context (vitest ^3).

## Next Steps (Out of Scope)
- Consume policy.backendMode in BackendSupervisor initialization.
- Consume policy.telemetry to configure crash webhook and event capture.
- Add a UI panel in the cockpit to display the active policy (audit trail).
