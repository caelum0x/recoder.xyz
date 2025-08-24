The Netlify deploy errored, with the following guidance provided:

  ### Diagnosis
  [line 18](#L18) indicates a build failure during the stage of installing dependencies with a
   non-zero exit code. The error is specifically related to version mismatches in the 
  dependencies.

  ### Solution
  The build is failing due to dependency version mismatches, specifically with the 
  `@types/node` package. To resolve this issue:
  1. Update the `@types/node` package version in the `package.json` to match the version in 
  the `pnpm-lock.yaml` file.
  2. Run the build again to ensure all dependencies match between the lockfile and the 
  `package.json`.

  If the issue persists, ensure that the required package versions are correctly set and 
  synchronized between the lockfile and the package.json file.

  The relevant error logs are:

  Line 0: build-image version: 9b5eda74bd0982ea06a6fdf058a78c4ba15c7b10 (noble)
  Line 1: buildbot version: 9b5eda74bd0982ea06a6fdf058a78c4ba15c7b10
  Line 2: Fetching cached dependencies
  Line 3: Failed to fetch cache, continuing with build
  Line 4: Starting to prepare the repo for build
  Line 5: No cached dependencies found. Cloning fresh repo
  Line 6: git clone --filter=blob:none https://github.com/caelum0x/recoder.xyz
  Line 7: Preparing Git Reference refs/heads/main
  Line 8: Starting to install dependencies
  Line 9: v22.18.0 is already installed.
  Line 10: Now using node v22.18.0 (npm v10.9.3)
  Line 11: Enabling Node.js Corepack
  Line 12: Started restoring cached build plugins
  Line 13: Finished restoring cached build plugins
  Line 14: Started restoring cached corepack dependencies
  Line 15: Finished restoring cached corepack dependencies
  Line 16: pnpm workspaces detected
  Line 17: Installing npm packages using pnpm version 10.14.0
  Line 18: Failed during stage 'Install dependencies': dependency_installation script returned
   non-zero exit code: 1
  Line 19: recoder-extension                        |  WARN  Unsupported engine: wanted: 
  {"node":"20.19.2"} (current: {"node":"v22.18.0","p
  Line 20: recoder-extension                        |  WARN  The field "pnpm.overrides" was 
  found in /opt/build/repo/recoder-extension/pack
  Line 21: Scope: all 22 workspace projects
  Line 22:  ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because 
  pnpm-lock.yaml is not up to date with <ROOT>/package.
  Line 23: Note that in CI environments this setting is true by default. If you still need to 
  run install in such cases, use "pnpm install 
  Line 24:   Failure reason:
  Line 25:   specifiers in the lockfile don't match specifiers in package.json:
  * 1 dependencies were added: recoder-web-ai-assistant@^1.0.
  Line 26: * 1 dependencies are mismatched:
  Line 27:   - @types/node (lockfile: ^20.10.0, manifest: ^20.19.11)
  Line 28: Error during pnpm install
  Line 29: Failing build: Failed to install dependencies
  Line 30: Finished processing build request in 14.52s 6:19:49 PM: build-image version: 
  9b5eda74bd0982ea06a6fdf058a78c4ba15c7b10 (noble)
  6:19:49 PM: buildbot version: 9b5eda74bd0982ea06a6fdf058a78c4ba15c7b10
  6:19:50 PM: Fetching cached dependencies
  6:19:50 PM: Failed to fetch cache, continuing with build
  6:19:50 PM: Starting to prepare the repo for build
  6:19:50 PM: No cached dependencies found. Cloning fresh repo
  6:19:50 PM: git clone --filter=blob:none https://github.com/caelum0x/recoder.xyz
  6:19:50 PM: Preparing Git Reference refs/heads/main
  6:20:02 PM: Starting to install dependencies
  6:20:02 PM: v22.18.0 is already installed.
  6:20:03 PM: Now using node v22.18.0 (npm v10.9.3)
  6:20:03 PM: Enabling Node.js Corepack
  6:20:03 PM: Started restoring cached build plugins
  6:20:03 PM: Finished restoring cached build plugins
  6:20:03 PM: Started restoring cached corepack dependencies
  6:20:03 PM: Finished restoring cached corepack dependencies
  6:20:03 PM: pnpm workspaces detected
  6:20:03 PM: Installing npm packages using pnpm version 10.14.0
  6:20:04 PM: Failed during stage 'Install dependencies': dependency_installation script 
  returned non-zero exit code: 1
  6:20:04 PM: recoder-extension                        |  WARN  Unsupported engine: wanted: 
  {"node":"20.19.2"} (current: {"node":"v22.18.0","pnpm":"10.14.0"})
  6:20:04 PM: recoder-extension                        |  WARN  The field "pnpm.overrides" was
   found in /opt/build/repo/recoder-extension/package.json. This will not take effect. You 
  should configure "pnpm.overrides" at the root of the workspace instead.
  6:20:04 PM: Scope: all 22 workspace projects
  6:20:04 PM:  ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because 
  pnpm-lock.yaml is not up to date with <ROOT>/package.json
  6:20:04 PM: Note that in CI environments this setting is true by default. If you still need 
  to run install in such cases, use "pnpm install --no-frozen-lockfile"
  6:20:04 PM:   Failure reason:
  6:20:04 PM:   specifiers in the lockfile don't match specifiers in package.json:
  * 1 dependencies were added: recoder-web-ai-assistant@^1.0.0
  6:20:04 PM: * 1 dependencies are mismatched:
  6:20:04 PM:   - @types/node (lockfile: ^20.10.0, manifest: ^20.19.11)
  6:20:04 PM: Error during pnpm install
  6:20:04 PM: Failing build: Failed to install dependencies
  6:20:04 PM: Finished processing build request in 14.52s

⏺ Perfect! I can see the exact issue. The problem is with the pnpm lockfile being outdated and
   dependency mismatches. Let me fix this immediately:

  Update Todos
  ⎿  ☐ Fix pnpm lockfile and dependency version mismatches      
     ☐ Update @types/node version to match lockfile
     ☐ Remove recoder-web-ai-assistant dependency causing issues
     ☐ Regenerate pnpm-lock.yaml with correct versions
     ☐ Test deployment after fixes
     ☐ Deploy successfully to Netlify