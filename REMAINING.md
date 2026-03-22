'/Users/arhansubasi/recoder.xyz/plan.md' okey you are gonna update plan.md 1-pm copilot gives errors it does not solved we can not wrote   
anything on pm copilot chat bar our texts not visible 2- agents still gives error about upgrade 3-recoder-web is sitll not making live       
preview 4-recoder web not makes full porject folder file creations 5-agency sort of works 6-openclaw sort of works but did not testes wp and 
 telegram connection 7-a2a sdk is not works with cluade code and codex connection 8-no a2a docs user can not see or understadn how they cna  
sue it    


Recoder web ddi not run rpm run build install or dev and noe live preview 
 SES Removing unpermitted intrinsics
 DEBUG DockerAPI [docker-api] Session token not found in cookies. Auth will fall back to anonymous mode.
 INFO WorkbenchStore 🔄 [WorkbenchStore] Ensuring container exists before initialization...
 INFO WorkbenchStore 🐳 [ensureContainerExists] Creating container for project-1774176359275  
 INFO PreviewsStore ✅ [PreviewsStore] Docker backend health check passed, using Docker mode
 INFO WorkbenchStore ✅ [ensureContainerExists] Container ready for project-1774176359275
 INFO WorkbenchStore ✅ [WorkbenchStore] Container marked as ready
 INFO WorkbenchStore ✅ [WorkbenchStore] Container exists, marked ready, proceeding with initialization
 INFO PreviewsStore 📺 [PreviewsStore] setProjectId called: project-1774176359275
 INFO PreviewsStore 📺 [PreviewsStore] Init complete, useDocker: true, DOCKER_URL: https://docker.recoder.xyz
 INFO PreviewsStore 📺 [PreviewsStore] Initializing Docker preview for project-1774176359275
 INFO PreviewsStore 🔄 [PreviewsStore] Docker preview URL set (waiting for containerReady): https://web.recoder.xyz/preview/project-1774176359275
 INFO PreviewsStore ⏳ [PreviewsStore] Waiting for container ready: project-1774176359275
 INFO WorkspaceStore [Workspace] No saved workspace for project: project-1774176359275
 INFO WorkspaceStore [Workspace] Auto-save started (interval: 30000ms)
 INFO WorkspaceStore [Workspace] Saved workspace state for project: project-1774176359275
 INFO PreviewsStore 📺 [PreviewsStore] Container ready state: true
 INFO PreviewsStore ✅ [PreviewsStore] Container already ready, checking dev server health
 INFO PreviewsStore 🔄 [PreviewsStore] Starting dev server health polling for project-1774176359275
 INFO FileWatcher [FileWatcher] Connected to file watch stream
 INFO WorkbenchStore ✅ [WorkbenchStore] Container marked as ready
 INFO AutoErrorFix [AutoFix] WebSocket connected for project-1774176359275
 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 1: [object Object]
 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 2: [object Object]
 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 3: [object Object]
 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 4: [object Object]
 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 5: [object Object]
 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 6: [object Object]
 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 7: [object Object]
 INFO SimpleChat Starting chat request
 DEBUG SimpleChat Condense check: {"shouldCondense":false,"currentTokens":0,"maxTokens":100000,"thresholdTokens":80000,"percentUsed":0,"reason":"Not enough messages (0/6 required)"}
 INFO Terminal Attach terminal
 INFO Preview 📺 [Preview] Active preview changed: [object Object]
 INFO Preview 🔄 [Preview] Preview not ready yet, showing loading page: https://web.recoder.xyz/preview/project-1774176359275
 INFO WorkbenchStore 🐳 [ensureContainerExists] Creating container for project-1774176359275  
 INFO WorkbenchStore ✅ [ensureContainerExists] Container ready for project-1774176359275
 INFO LSPClient [LSPClient] LSP servers started: Started 0 LSP server(s)
 INFO TerminalStore ✅ Terminal attached: term-1774176377028-1 (Terminal 1) (total: 1)
 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 8: [object Object]
 INFO SimpleChat First token received in 2536ms
 INFO MessageParser 🎨 [MessageParser] Artifact opened: modern-landing-page Modern Landing Page with Tailwind
 INFO WorkbenchStore 🎨 [WorkbenchStore] addArtifact called: modern-landing-page Modern Landing Page with Tailwind messageId: assistant-1774176376664
 INFO WorkbenchStore [WorkbenchStore] ActionRunner created with projectId: project-1774176359275
 INFO MessageParser 🔧 [MessageParser] Action opened: file package.json
 INFO WorkbenchStore 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.addAction
 DEBUG ActionRunner ➕ [ActionRunner] addAction called: file 0
 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 9: [object Object]
 INFO MessageParser 🔧 [MessageParser] Action closed: file package.json
 INFO MessageParser 🔧 [MessageParser] Calling workbenchStore.runAction for: file
 INFO WorkbenchStore 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.runAction
 DEBUG ActionRunner ▶️  [ActionRunner] runAction called: file 0
 DEBUG ActionRunner 🔗 [ActionRunner] Queueing action execution: 0 file
 DEBUG ActionRunner ⏩ [ActionRunner] Previous action done, executing: 0 file
 DEBUG ActionRunner 🚀 [ActionRunner] #executeAction called: 0 file
 DEBUG ActionQueue Enqueued action action-1774176380841-zae146i3u: file
 DEBUG ActionRunner ⏳ [ActionRunner] #waitForContainerReady starting...
 DEBUG ActionRunner ⏳ [ActionRunner] Calling #ensureDockerReady...
 DEBUG FileBatcher File batcher configured for project: project-1774176359275
 INFO ActionRunner Docker container already ready (via workbench) for: project-1774176359275
 DEBUG ActionRunner ✅ [ActionRunner] Container created, ready for file operations
 DEBUG ActionRunner 🔀 [ActionRunner] Executing action type: file
 DEBUG ActionRunner 📄 [ActionRunner] Calling #runFileAction
 DEBUG ActionRunner 📁 [ActionRunner] #runFileAction called for: package.json
 DEBUG ActionRunner 📝 [FileAction] Writing file: package.json content length: 627
 DEBUG ActionRunner ✅ Validation passed for package.json
 INFO MessageParser 🔧 [MessageParser] Action opened: file vite.config.ts
 INFO WorkbenchStore 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.addAction
 DEBUG ActionRunner ➕ [ActionRunner] addAction called: file 1
docker.recoder.xyz/api/file/project-1774176359275?path=package.json:1  Failed to load resource: the server responded with a status of 500 ()
 INFO MessageParser 🔧 [MessageParser] Action closed: file vite.config.ts
 INFO MessageParser 🔧 [MessageParser] Calling workbenchStore.runAction for: file
 INFO WorkbenchStore 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.runAction
 DEBUG ActionRunner ▶️  [ActionRunner] runAction called: file 1
 DEBUG ActionRunner 🔗 [ActionRunner] Queueing action execution: 1 file
 INFO MessageParser 🔧 [MessageParser] Action opened: file tsconfig.json
 INFO WorkbenchStore 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.addAction
 DEBUG ActionRunner ➕ [ActionRunner] addAction called: file 2
 DEBUG ActionRunner ⚡ [FileAction] File written immediately: package.json
 INFO ActionRunner 📦 package.json detected! Will auto-install dependencies after all files are created.
 INFO ActionRunner Scheduling auto-install (debounced, 1500ms delay, streaming=true)...
 INFO ActionRunner Action 0 (file) completed (448ms)
 DEBUG ActionRunner ✅ [ActionRunner] Action execution complete: 0 file
 DEBUG ActionRunner ⏩ [ActionRunner] Previous action done, executing: 1 file
 DEBUG ActionRunner 🚀 [ActionRunner] #executeAction called: 1 file
 DEBUG ActionQueue Enqueued action action-1774176381293-3vcbttzy6: file
 DEBUG ActionRunner ⏳ [ActionRunner] #waitForContainerReady starting...
 DEBUG ActionRunner ⏳ [ActionRunner] Calling #ensureDockerReady...
 DEBUG ActionRunner ✅ [ActionRunner] Container created, ready for file operations
 DEBUG ActionRunner 🔀 [ActionRunner] Executing action type: file
 DEBUG ActionRunner 📄 [ActionRunner] Calling #runFileAction
 DEBUG ActionRunner 📁 [ActionRunner] #runFileAction called for: vite.config.ts
 DEBUG ActionRunner 📝 [FileAction] Writing file: vite.config.ts content length: 136
 DEBUG ActionRunner ✅ Validation passed for vite.config.ts
 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 10: [object Object]
docker.recoder.xyz/api/file/project-1774176359275?path=vite.config.ts:1  Failed to load resource: the server responded with a status of 500 ()
 DEBUG ActionRunner ⚡ [FileAction] File written immediately: vite.config.ts
 INFO ActionRunner Scheduling auto-install (debounced, 1500ms delay, streaming=true)...
 INFO ActionRunner Action 1 (file) completed (472ms)
 DEBUG ActionRunner ✅ [ActionRunner] Action execution complete: 1 file
 INFO MessageParser 🔧 [MessageParser] Action closed: file tsconfig.json
 INFO MessageParser 🔧 [MessageParser] Calling workbenchStore.runAction for: file
 INFO WorkbenchStore 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.runAction
 DEBUG ActionRunner ▶️  [ActionRunner] runAction called: file 2
 DEBUG ActionRunner 🔗 [ActionRunner] Queueing action execution: 2 file
 DEBUG ActionRunner ⏩ [ActionRunner] Previous action done, executing: 2 file
 DEBUG ActionRunner 🚀 [ActionRunner] #executeAction called: 2 file
 DEBUG ActionQueue Enqueued action action-1774176381844-en6c93o8s: file
 DEBUG ActionRunner ⏳ [ActionRunner] #waitForContainerReady starting...
 DEBUG ActionRunner ⏳ [ActionRunner] Calling #ensureDockerReady...
 DEBUG ActionRunner ✅ [ActionRunner] Container created, ready for file operations
 DEBUG ActionRunner 🔀 [ActionRunner] Executing action type: file
 DEBUG ActionRunner 📄 [ActionRunner] Calling #runFileAction
 DEBUG ActionRunner 📁 [ActionRunner] #runFileAction called for: tsconfig.json
 DEBUG ActionRunner 📝 [FileAction] Writing file: tsconfig.json content length: 292
 DEBUG ActionRunner ✅ Validation passed for tsconfig.json
 INFO MessageParser 🔧 [MessageParser] Action opened: file tailwind.config.js
 INFO WorkbenchStore 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.addAction
 DEBUG ActionRunner ➕ [ActionRunner] addAction called: file 3
docker.recoder.xyz/api/file/project-1774176359275?path=tsconfig.json:1  Failed to load resource: the server responded with a status of 500 ()
 DEBUG ActionRunner ⚡ [FileAction] File written immediately: tsconfig.json
 INFO MessageParser 🔧 [MessageParser] Action closed: file tailwind.config.js
 INFO MessageParser 🔧 [MessageParser] Calling workbenchStore.runAction for: file
 INFO WorkbenchStore 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.runAction
 DEBUG ActionRunner ▶️  [ActionRunner] runAction called: file 3
 DEBUG ActionRunner 🔗 [ActionRunner] Queueing action execution: 3 file
 INFO ActionRunner 🔧 Auto-fixed tsconfig.json: Added path aliases for @/* imports
 INFO ActionRunner Scheduling auto-install (debounced, 1500ms delay, streaming=true)...
 INFO ActionRunner Action 2 (file) completed (469ms)
 DEBUG ActionRunner ✅ [ActionRunner] Action execution complete: 2 file
 DEBUG ActionRunner ⏩ [ActionRunner] Previous action done, executing: 3 file
 DEBUG ActionRunner 🚀 [ActionRunner] #executeAction called: 3 file
 DEBUG ActionQueue Enqueued action action-1774176382313-3ctz1h13v: file
 DEBUG ActionRunner ⏳ [ActionRunner] #waitForContainerReady starting...
 DEBUG ActionRunner ⏳ [ActionRunner] Calling #ensureDockerReady...
 DEBUG ActionRunner ✅ [ActionRunner] Container created, ready for file operations
 DEBUG ActionRunner 🔀 [ActionRunner] Executing action type: file
 DEBUG ActionRunner 📄 [ActionRunner] Calling #runFileAction
 DEBUG ActionRunner 📁 [ActionRunner] #runFileAction called for: tailwind.config.js
 DEBUG ActionRunner 📝 [FileAction] Writing file: tailwind.config.js content length: 140
 INFO MessageParser 🔧 [MessageParser] Action opened: file postcss.config.js
 INFO WorkbenchStore 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.addAction
 DEBUG ActionRunner ➕ [ActionRunner] addAction called: file 4
 DEBUG ActionRunner ✅ Validation passed for tailwind.config.js
 INFO MessageParser 🔧 [MessageParser] Action closed: file postcss.config.js
 INFO MessageParser 🔧 [MessageParser] Calling workbenchStore.runAction for: file
 INFO WorkbenchStore 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.runAction
 DEBUG ActionRunner ▶️  [ActionRunner] runAction called: file 4
 DEBUG ActionRunner 🔗 [ActionRunner] Queueing action execution: 4 file
 INFO MessageParser 🔧 [MessageParser] Action opened: file index.html
 INFO WorkbenchStore 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.addAction
 DEBUG ActionRunner ➕ [ActionRunner] addAction called: file 5
docker.recoder.xyz/api/file/project-1774176359275?path=tailwind.config.js:1  Failed to load resource: the server responded with a status of 500 ()
 DEBUG ActionRunner ⚡ [FileAction] File written immediately: tailwind.config.js
 INFO ActionRunner Scheduling auto-install (debounced, 1500ms delay, streaming=true)...
 INFO ActionRunner Action 3 (file) completed (593ms)
 DEBUG ActionRunner ✅ [ActionRunner] Action execution complete: 3 file
 DEBUG ActionRunner ⏩ [ActionRunner] Previous action done, executing: 4 file
 DEBUG ActionRunner 🚀 [ActionRunner] #executeAction called: 4 file
 DEBUG ActionQueue Enqueued action action-1774176382908-f4t41u83d: file
 DEBUG ActionRunner ⏳ [ActionRunner] #waitForContainerReady starting...
 DEBUG ActionRunner ⏳ [ActionRunner] Calling #ensureDockerReady...
 DEBUG ActionRunner ✅ [ActionRunner] Container created, ready for file operations
 DEBUG ActionRunner 🔀 [ActionRunner] Executing action type: file
 DEBUG ActionRunner 📄 [ActionRunner] Calling #runFileAction
 DEBUG ActionRunner 📁 [ActionRunner] #runFileAction called for: postcss.config.js
 DEBUG ActionRunner 📝 [FileAction] Writing file: postcss.config.js content length: 81
 DEBUG ActionRunner ✅ Validation passed for postcss.config.js
 INFO MessageParser 🔧 [MessageParser] Action closed: file index.html
 INFO MessageParser 🔧 [MessageParser] Calling workbenchStore.runAction for: file
 INFO WorkbenchStore 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.runAction
 DEBUG ActionRunner ▶️  [ActionRunner] runAction called: file 5
 DEBUG ActionRunner 🔗 [ActionRunner] Queueing action execution: 5 file
 INFO MessageParser 🔧 [MessageParser] Action opened: file src/main.tsx
 INFO WorkbenchStore 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.addAction
 DEBUG ActionRunner ➕ [ActionRunner] addAction called: file 6
docker.recoder.xyz/api/file/project-1774176359275?path=postcss.config.js:1  Failed to load resource: the server responded with a status of 500 ()
 DEBUG ActionRunner ⚡ [FileAction] File written immediately: postcss.config.js
 INFO ActionRunner Scheduling auto-install (debounced, 1500ms delay, streaming=true)...
 INFO ActionRunner Action 4 (file) completed (585ms)
 DEBUG ActionRunner ✅ [ActionRunner] Action execution complete: 4 file
 DEBUG ActionRunner ⏩ [ActionRunner] Previous action done, executing: 5 file
 DEBUG ActionRunner 🚀 [ActionRunner] #executeAction called: 5 file
 DEBUG ActionQueue Enqueued action action-1774176383495-a4u48rbo2: file
 DEBUG ActionRunner ⏳ [ActionRunner] #waitForContainerReady starting...
 DEBUG ActionRunner ⏳ [ActionRunner] Calling #ensureDockerReady...
 DEBUG ActionRunner ✅ [ActionRunner] Container created, ready for file operations
 DEBUG ActionRunner 🔀 [ActionRunner] Executing action type: file
 DEBUG ActionRunner 📄 [ActionRunner] Calling #runFileAction
 DEBUG ActionRunner 📁 [ActionRunner] #runFileAction called for: index.html
 DEBUG ActionRunner 📝 [FileAction] Writing file: index.html content length: 340
 DEBUG ActionRunner ✅ Validation passed for index.html
 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 11: [object Object]
docker.recoder.xyz/api/file/project-1774176359275?path=index.html:1  Failed to load resource: the server responded with a status of 500 ()
 DEBUG ActionRunner ⚡ [FileAction] File written immediately: index.html
 INFO ActionRunner Scheduling auto-install (debounced, 1500ms delay, streaming=true)...
 INFO ActionRunner Action 5 (file) completed (351ms)
 DEBUG ActionRunner ✅ [ActionRunner] Action execution complete: 5 file
 INFO MessageParser 🔧 [MessageParser] Action closed: file src/main.tsx
 INFO MessageParser 🔧 [MessageParser] Calling workbenchStore.runAction for: file
 INFO WorkbenchStore 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.runAction
 DEBUG ActionRunner ▶️  [ActionRunner] runAction called: file 6
 DEBUG ActionRunner 🔗 [ActionRunner] Queueing action execution: 6 file
 DEBUG ActionRunner ⏩ [ActionRunner] Previous action done, executing: 6 file
 DEBUG ActionRunner 🚀 [ActionRunner] #executeAction called: 6 file
 DEBUG ActionQueue Enqueued action action-1774176383885-edoe7u3pu: file
 DEBUG ActionRunner ⏳ [ActionRunner] #waitForContainerReady starting...
 DEBUG ActionRunner ⏳ [ActionRunner] Calling #ensureDockerReady...
 DEBUG ActionRunner ✅ [ActionRunner] Container created, ready for file operations
 DEBUG ActionRunner 🔀 [ActionRunner] Executing action type: file
 DEBUG ActionRunner 📄 [ActionRunner] Calling #runFileAction
 DEBUG ActionRunner 📁 [ActionRunner] #runFileAction called for: src/main.tsx
 INFO MessageParser 🔧 [MessageParser] Action opened: file src/index.css
 INFO WorkbenchStore 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.addAction
 DEBUG ActionRunner ➕ [ActionRunner] addAction called: file 7
 INFO MessageParser 🔧 [MessageParser] Action closed: file src/index.css
 INFO MessageParser 🔧 [MessageParser] Calling workbenchStore.runAction for: file
 INFO WorkbenchStore 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.runAction
 DEBUG ActionRunner ▶️  [ActionRunner] runAction called: file 7
 DEBUG ActionRunner 🔗 [ActionRunner] Queueing action execution: 7 file
 INFO MessageParser 🔧 [MessageParser] Action opened: file src/App.tsx
 INFO WorkbenchStore 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.addAction
 DEBUG ActionRunner ➕ [ActionRunner] addAction called: file 8
 DEBUG ActionRunner Created folder src
 DEBUG ActionRunner 📝 [FileAction] Writing file: src/main.tsx content length: 236
 DEBUG ActionRunner ✅ Validation passed for src/main.tsx
docker.recoder.xyz/api/file/project-1774176359275?path=src%2Fmain.tsx:1  Failed to load resource: the server responded with a status of 500 ()
 DEBUG ActionRunner ⚡ [FileAction] File written immediately: src/main.tsx
 INFO ActionRunner Scheduling auto-install (debounced, 1500ms delay, streaming=true)...
 INFO ActionRunner Action 6 (file) completed (647ms)
 DEBUG ActionRunner ✅ [ActionRunner] Action execution complete: 6 file
 DEBUG ActionRunner ⏩ [ActionRunner] Previous action done, executing: 7 file
 DEBUG ActionRunner 🚀 [ActionRunner] #executeAction called: 7 file
 DEBUG ActionQueue Enqueued action action-1774176384534-j4ebj8lqc: file
 DEBUG ActionRunner ⏳ [ActionRunner] #waitForContainerReady starting...
 DEBUG ActionRunner ⏳ [ActionRunner] Calling #ensureDockerReady...
 DEBUG ActionRunner ✅ [ActionRunner] Container created, ready for file operations
 DEBUG ActionRunner 🔀 [ActionRunner] Executing action type: file
 DEBUG ActionRunner 📄 [ActionRunner] Calling #runFileAction
 DEBUG ActionRunner 📁 [ActionRunner] #runFileAction called for: src/index.css
 DEBUG ActionRunner Created folder src
 DEBUG ActionRunner 📝 [FileAction] Writing file: src/index.css content length: 107
 DEBUG ActionRunner ✅ Validation passed for src/index.css
 INFO MessageParser 🔧 [MessageParser] Action closed: file src/App.tsx
 INFO MessageParser 🔧 [MessageParser] Calling workbenchStore.runAction for: file
 INFO WorkbenchStore 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.runAction
 DEBUG ActionRunner ▶️  [ActionRunner] runAction called: file 8
 DEBUG ActionRunner 🔗 [ActionRunner] Queueing action execution: 8 file
 INFO MessageParser 🔧 [MessageParser] Action opened: file src/components/Hero.tsx
 INFO WorkbenchStore 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.addAction
 DEBUG ActionRunner ➕ [ActionRunner] addAction called: file 9
docker.recoder.xyz/api/file/project-1774176359275?path=src%2Findex.css:1  Failed to load resource: the server responded with a status of 500 ()
 DEBUG ActionRunner ⚡ [FileAction] File written immediately: src/index.css
 INFO ActionRunner Scheduling auto-install (debounced, 1500ms delay, streaming=true)...
 INFO ActionRunner Action 7 (file) completed (608ms)
 DEBUG ActionRunner ✅ [ActionRunner] Action execution complete: 7 file
 DEBUG ActionRunner ⏩ [ActionRunner] Previous action done, executing: 8 file
 DEBUG ActionRunner 🚀 [ActionRunner] #executeAction called: 8 file
 DEBUG ActionQueue Enqueued action action-1774176385144-4wpjybt7q: file
 DEBUG ActionRunner ⏳ [ActionRunner] #waitForContainerReady starting...
 DEBUG ActionRunner ⏳ [ActionRunner] Calling #ensureDockerReady...
 DEBUG ActionRunner ✅ [ActionRunner] Container created, ready for file operations
 DEBUG ActionRunner 🔀 [ActionRunner] Executing action type: file
 DEBUG ActionRunner 📄 [ActionRunner] Calling #runFileAction
 DEBUG ActionRunner 📁 [ActionRunner] #runFileAction called for: src/App.tsx
 DEBUG ActionRunner Created folder src
 DEBUG ActionRunner 📝 [FileAction] Writing file: src/App.tsx content length: 558
 DEBUG ActionRunner ✅ Validation passed for src/App.tsx
docker.recoder.xyz/api/file/project-1774176359275?path=src%2FApp.tsx:1  Failed to load resource: the server responded with a status of 500 ()
 DEBUG ActionRunner ⚡ [FileAction] File written immediately: src/App.tsx
 INFO ActionRunner Scheduling auto-install (debounced, 1500ms delay, streaming=true)...
 INFO ActionRunner Action 8 (file) completed (566ms)
 DEBUG ActionRunner ✅ [ActionRunner] Action execution complete: 8 file
 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 12: [object Object]
 INFO MessageParser 🔧 [MessageParser] Action closed: file src/components/Hero.tsx
 INFO MessageParser 🔧 [MessageParser] Calling workbenchStore.runAction for: file
 INFO WorkbenchStore 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.runAction
 DEBUG ActionRunner ▶️  [ActionRunner] runAction called: file 9
 DEBUG ActionRunner 🔗 [ActionRunner] Queueing action execution: 9 file
 DEBUG ActionRunner ⏩ [ActionRunner] Previous action done, executing: 9 file
 DEBUG ActionRunner 🚀 [ActionRunner] #executeAction called: 9 file
 DEBUG ActionQueue Enqueued action action-1774176386337-5q8gsedh7: file
 DEBUG ActionRunner ⏳ [ActionRunner] #waitForContainerReady starting...
 DEBUG ActionRunner ⏳ [ActionRunner] Calling #ensureDockerReady...
 DEBUG ActionRunner ✅ [ActionRunner] Container created, ready for file operations
 DEBUG ActionRunner 🔀 [ActionRunner] Executing action type: file
 DEBUG ActionRunner 📄 [ActionRunner] Calling #runFileAction
 DEBUG ActionRunner 📁 [ActionRunner] #runFileAction called for: src/components/Hero.tsx
 INFO MessageParser 🔧 [MessageParser] Action opened: file src/components/Features.tsx
 INFO WorkbenchStore 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.addAction
 DEBUG ActionRunner ➕ [ActionRunner] addAction called: file 10
 DEBUG ActionRunner Created folder src/components
 DEBUG ActionRunner 📝 [FileAction] Writing file: src/components/Hero.tsx content length: 579
 DEBUG ActionRunner ✅ Validation passed for src/components/Hero.tsx
docker.recoder.xyz/api/file/project-1774176359275?path=src%2Fcomponents%2FHero.tsx:1  Failed to load resource: the server responded with a status of 500 ()
 DEBUG ActionRunner ⚡ [FileAction] File written immediately: src/components/Hero.tsx
 INFO ActionRunner Scheduling auto-install (debounced, 1500ms delay, streaming=true)...
 INFO ActionRunner Action 9 (file) completed (656ms)
 DEBUG ActionRunner ✅ [ActionRunner] Action execution complete: 9 file
 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 13: [object Object]
 INFO ActionRunner ⏳ Streaming still active, deferring auto-install until stream ends...
 INFO ActionRunner Scheduling auto-install (debounced, 1500ms delay, streaming=true)...
 INFO MessageParser 🔧 [MessageParser] Action closed: file src/components/Features.tsx
 INFO MessageParser 🔧 [MessageParser] Calling workbenchStore.runAction for: file
 INFO WorkbenchStore 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.runAction
 DEBUG ActionRunner ▶️  [ActionRunner] runAction called: file 10
 DEBUG ActionRunner 🔗 [ActionRunner] Queueing action execution: 10 file
 DEBUG ActionRunner ⏩ [ActionRunner] Previous action done, executing: 10 file
 DEBUG ActionRunner 🚀 [ActionRunner] #executeAction called: 10 file
 DEBUG ActionQueue Enqueued action action-1774176388743-rwfhzl5sf: file
 DEBUG ActionRunner ⏳ [ActionRunner] #waitForContainerReady starting...
 DEBUG ActionRunner ⏳ [ActionRunner] Calling #ensureDockerReady...
 DEBUG ActionRunner ✅ [ActionRunner] Container created, ready for file operations
 DEBUG ActionRunner 🔀 [ActionRunner] Executing action type: file
 DEBUG ActionRunner 📄 [ActionRunner] Calling #runFileAction
 DEBUG ActionRunner 📁 [ActionRunner] #runFileAction called for: src/components/Features.tsx
 INFO MessageParser 🔧 [MessageParser] Action opened: file src/components/Testimonials.tsx
 INFO WorkbenchStore 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.addAction
 DEBUG ActionRunner ➕ [ActionRunner] addAction called: file 11
 DEBUG ActionRunner Created folder src/components
 DEBUG ActionRunner 📝 [FileAction] Writing file: src/components/Features.tsx content length: 975
 DEBUG ActionRunner ✅ Validation passed for src/components/Features.tsx
docker.recoder.xyz/api/file/project-1774176359275?path=src%2Fcomponents%2FFeatures.tsx:1  Failed to load resource: the server responded with a status of 500 ()
 DEBUG ActionRunner ⚡ [FileAction] File written immediately: src/components/Features.tsx
 INFO ActionRunner Scheduling auto-install (debounced, 1500ms delay, streaming=true)...
 INFO ActionRunner Action 10 (file) completed (562ms)
 DEBUG ActionRunner ✅ [ActionRunner] Action execution complete: 10 file
 INFO MessageParser 🔧 [MessageParser] Action closed: file src/components/Testimonials.tsx
 INFO MessageParser 🔧 [MessageParser] Calling workbenchStore.runAction for: file
 INFO WorkbenchStore 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.runAction
 DEBUG ActionRunner ▶️  [ActionRunner] runAction called: file 11
 DEBUG ActionRunner 🔗 [ActionRunner] Queueing action execution: 11 file
 DEBUG ActionRunner ⏩ [ActionRunner] Previous action done, executing: 11 file
 DEBUG ActionRunner 🚀 [ActionRunner] #executeAction called: 11 file
 DEBUG ActionQueue Enqueued action action-1774176389980-akq3n0v9y: file
 DEBUG ActionRunner ⏳ [ActionRunner] #waitForContainerReady starting...
 DEBUG ActionRunner ⏳ [ActionRunner] Calling #ensureDockerReady...
 DEBUG ActionRunner ✅ [ActionRunner] Container created, ready for file operations
 DEBUG ActionRunner 🔀 [ActionRunner] Executing action type: file
 DEBUG ActionRunner 📄 [ActionRunner] Calling #runFileAction
 DEBUG ActionRunner 📁 [ActionRunner] #runFileAction called for: src/components/Testimonials.tsx
 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 14: [object Object]
 INFO MessageParser 🔧 [MessageParser] Action opened: file src/components/Pricing.tsx
 INFO WorkbenchStore 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.addAction
 DEBUG ActionRunner ➕ [ActionRunner] addAction called: file 12
 DEBUG ActionRunner Created folder src/components
 DEBUG ActionRunner 📝 [FileAction] Writing file: src/components/Testimonials.tsx content length: 569
 DEBUG ActionRunner ✅ Validation passed for src/components/Testimonials.tsx
 INFO WorkspaceStore [Workspace] Saved workspace state for project: project-1774176359275
docker.recoder.xyz/api/file/project-1774176359275?path=src%2Fcomponents%2FTestimonials.tsx:1  Failed to load resource: the server responded with a status of 500 ()
 DEBUG ActionRunner ⚡ [FileAction] File written immediately: src/components/Testimonials.tsx
 INFO ActionRunner Scheduling auto-install (debounced, 1500ms delay, streaming=true)...
 INFO ActionRunner Action 11 (file) completed (566ms)
 DEBUG ActionRunner ✅ [ActionRunner] Action execution complete: 11 file
 INFO ActionRunner ⏳ Streaming still active, deferring auto-install until stream ends...
 INFO ActionRunner Scheduling auto-install (debounced, 1500ms delay, streaming=true)...
 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 15: [object Object]
 INFO MessageParser 🔧 [MessageParser] Action closed: file src/components/Pricing.tsx
 INFO MessageParser 🔧 [MessageParser] Calling workbenchStore.runAction for: file
 INFO WorkbenchStore 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.runAction
 DEBUG ActionRunner ▶️  [ActionRunner] runAction called: file 12
 DEBUG ActionRunner 🔗 [ActionRunner] Queueing action execution: 12 file
 INFO MessageParser 🔧 [MessageParser] Action opened: file src/components/Contact.tsx
 INFO WorkbenchStore 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.addAction
 DEBUG ActionRunner ➕ [ActionRunner] addAction called: file 13
 DEBUG ActionRunner ⏩ [ActionRunner] Previous action done, executing: 12 file
 DEBUG ActionRunner 🚀 [ActionRunner] #executeAction called: 12 file
 DEBUG ActionQueue Enqueued action action-1774176393428-ybumw698l: file
 DEBUG ActionRunner ⏳ [ActionRunner] #waitForContainerReady starting...
 DEBUG ActionRunner ⏳ [ActionRunner] Calling #ensureDockerReady...
 DEBUG ActionRunner ✅ [ActionRunner] Container created, ready for file operations
 DEBUG ActionRunner 🔀 [ActionRunner] Executing action type: file
 DEBUG ActionRunner 📄 [ActionRunner] Calling #runFileAction
 DEBUG ActionRunner 📁 [ActionRunner] #runFileAction called for: src/components/Pricing.tsx
 INFO ActionRunner Scheduling auto-install (debounced, 1500ms delay, streaming=true)...
 DEBUG ActionRunner Created folder src/components
 DEBUG ActionRunner 📝 [FileAction] Writing file: src/components/Pricing.tsx content length: 707
 DEBUG ActionRunner ✅ Validation passed for src/components/Pricing.tsx
docker.recoder.xyz/api/file/project-1774176359275?path=src%2Fcomponents%2FPricing.tsx:1  Failed to load resource: the server responded with a status of 500 ()
 DEBUG ActionRunner ⚡ [FileAction] File written immediately: src/components/Pricing.tsx
 INFO ActionRunner Scheduling auto-install (debounced, 1500ms delay, streaming=true)...
 INFO ActionRunner Action 12 (file) completed (568ms)
 DEBUG ActionRunner ✅ [ActionRunner] Action execution complete: 12 file
 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 16: [object Object]
 INFO MessageParser 🔧 [MessageParser] Action closed: file src/components/Contact.tsx
 INFO MessageParser 🔧 [MessageParser] Calling workbenchStore.runAction for: file
 INFO WorkbenchStore 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.runAction
 DEBUG ActionRunner ▶️  [ActionRunner] runAction called: file 13
 DEBUG ActionRunner 🔗 [ActionRunner] Queueing action execution: 13 file
 DEBUG ActionRunner ⏩ [ActionRunner] Previous action done, executing: 13 file
 DEBUG ActionRunner 🚀 [ActionRunner] #executeAction called: 13 file
 DEBUG ActionQueue Enqueued action action-1774176394355-a6240z426: file
 DEBUG ActionRunner ⏳ [ActionRunner] #waitForContainerReady starting...
 DEBUG ActionRunner ⏳ [ActionRunner] Calling #ensureDockerReady...
 DEBUG ActionRunner ✅ [ActionRunner] Container created, ready for file operations
 DEBUG ActionRunner 🔀 [ActionRunner] Executing action type: file
 DEBUG ActionRunner 📄 [ActionRunner] Calling #runFileAction
 DEBUG ActionRunner 📁 [ActionRunner] #runFileAction called for: src/components/Contact.tsx
 INFO MessageParser 🔧 [MessageParser] Action opened: shell 
 INFO MessageParser 🔧 [MessageParser] Action closed: shell 
 INFO WorkbenchStore 🏪 [WorkbenchStore] addAction called: shell messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.addAction
 DEBUG ActionRunner ➕ [ActionRunner] addAction called: shell 14
 INFO MessageParser 🔧 [MessageParser] Calling workbenchStore.runAction for: shell
 INFO WorkbenchStore 🏪 [WorkbenchStore] runAction called: shell messageId: assistant-1774176376664
 INFO WorkbenchStore 🏪 [WorkbenchStore] Calling artifact.runner.runAction
 DEBUG ActionRunner ▶️  [ActionRunner] runAction called: shell 14
 DEBUG ActionRunner 🔗 [ActionRunner] Queueing action execution: 14 shell
 INFO MessageParser 🎨 [MessageParser] Artifact closed: modern-landing-page Modern Landing Page with Tailwind
 DEBUG ActionRunner Created folder src/components
logger-Dc57ZODX.js:2 DEBUG ActionRunner 📝 [FileAction] Writing file: src/components/Contact.tsx content length: 1065
logger-Dc57ZODX.js:2 INFO SimpleChat Stream completed (17839ms)
logger-Dc57ZODX.js:2 WARN SimpleChat [useSimpleChat] 🔍 === TRUNCATION DETECTION START ===
logger-Dc57ZODX.js:2 WARN SimpleChat [useSimpleChat] Content length: 7653 chars
logger-Dc57ZODX.js:2 WARN SimpleChat [useSimpleChat] Content ends with: "Action>

<recoderAction type="shell">
npm install && npm run dev
</recoderAction>
</recoderArtifact>"
logger-Dc57ZODX.js:2 WARN SimpleChat [useSimpleChat] 📊 ACTION TAG COUNT: 15 open, 15 closed
logger-Dc57ZODX.js:2 WARN SimpleChat [useSimpleChat] 📊 ARTIFACT TAG COUNT: 1 open, 1 closed
logger-Dc57ZODX.js:2 WARN SimpleChat [useSimpleChat] ✅ Truncation check passed - response appears complete
logger-Dc57ZODX.js:2 WARN SimpleChat [useSimpleChat] 📋 TRUNCATION CHECK RESULT: {
  "isTruncated": false,
  "reason": "none",
  "enableAutoContinue": true,
  "continuationCount": 0,
  "maxContinuations": 3,
  "details": {}
}
logger-Dc57ZODX.js:2 WARN SimpleChat [useSimpleChat] 🔍 === TRUNCATION DETECTION END ===
logger-Dc57ZODX.js:2 INFO SimpleChat [useSimpleChat] ✅ Response complete - no continuation needed
logger-Dc57ZODX.js:2 WARN SimpleChat [useSimpleChat] 📊 ACTION TAG COUNT: 15 open, 15 closed
logger-Dc57ZODX.js:2 WARN SimpleChat [useSimpleChat] 📊 ARTIFACT TAG COUNT: 1 open, 1 closed
logger-Dc57ZODX.js:2 WARN SimpleChat [useSimpleChat] ✅ Truncation check passed - response appears complete
logger-Dc57ZODX.js:2 INFO SimpleChat Chat request completed (17839ms)
logger-Dc57ZODX.js:2 DEBUG ChatClient Finished streaming
logger-Dc57ZODX.js:2 DEBUG ChatClient Skipping useEffect save - onFinish already handled it
logger-Dc57ZODX.js:2 WARN SimpleChat [useSimpleChat] 📊 ACTION TAG COUNT: 15 open, 15 closed
logger-Dc57ZODX.js:2 WARN SimpleChat [useSimpleChat] 📊 ARTIFACT TAG COUNT: 1 open, 1 closed
logger-Dc57ZODX.js:2 WARN SimpleChat [useSimpleChat] ✅ Truncation check passed - response appears complete
logger-Dc57ZODX.js:2 DEBUG ActionRunner Stream ended, truncated: false
logger-Dc57ZODX.js:2 INFO ActionRunner 📦 Stream ended — triggering deferred auto-install
logger-Dc57ZODX.js:2 INFO ActionRunner Scheduling auto-install (debounced, 3000ms delay, streaming=false)...
logger-Dc57ZODX.js:2 DEBUG ActionRunner No orphaned actions after stream end
logger-Dc57ZODX.js:2 INFO SimpleChat [useSimpleChat] Stream ended, notified workbench (truncated: false)
logger-Dc57ZODX.js:2 DEBUG ActionRunner ✅ Validation passed for src/components/Contact.tsx
docker.recoder.xyz/api/file/project-1774176359275?path=src%2Fcomponents%2FContact.tsx:1  Failed to load resource: the server responded with a status of 500 ()
logger-Dc57ZODX.js:2 DEBUG FileBatcher Added file to batch: src/components/Contact.tsx (id: op-1-1774176394800)
logger-Dc57ZODX.js:2 DEBUG ActionRunner 📦 [FileAction] File queued for batch: src/components/Contact.tsx opId: op-1-1774176394800
logger-Dc57ZODX.js:2 DEBUG ActionRunner File queued for batch: src/components/Contact.tsx (1065 bytes)
logger-Dc57ZODX.js:2 INFO ActionRunner Scheduling auto-install (debounced, 3000ms delay, streaming=false)...
logger-Dc57ZODX.js:2 INFO ActionRunner Action 13 (file) completed (447ms)
logger-Dc57ZODX.js:2 DEBUG ActionRunner ✅ [ActionRunner] Action execution complete: 13 file
logger-Dc57ZODX.js:2 DEBUG ActionRunner ⏩ [ActionRunner] Previous action done, executing: 14 shell
logger-Dc57ZODX.js:2 DEBUG ActionRunner 🚀 [ActionRunner] #executeAction called: 14 shell
logger-Dc57ZODX.js:2 DEBUG ActionQueue Enqueued action action-1774176394804-09z8g0v7b: shell
logger-Dc57ZODX.js:2 DEBUG ActionRunner ⏳ [ActionRunner] #waitForContainerReady starting...
logger-Dc57ZODX.js:2 DEBUG ActionRunner ⏳ [ActionRunner] Calling #ensureDockerReady...
logger-Dc57ZODX.js:2 DEBUG ActionRunner ✅ [ActionRunner] Container created, ready for file operations
logger-Dc57ZODX.js:2 DEBUG ActionRunner 🔀 [ActionRunner] Executing action type: shell
logger-Dc57ZODX.js:2 INFO ActionRunner 🔨 Executing shell command: npm install && npm run dev
logger-Dc57ZODX.js:2 INFO ActionRunner Executing command via Docker backend
logger-Dc57ZODX.js:2 INFO ActionRunner 🔀 Detected install+dev combo, splitting into separate commands
logger-Dc57ZODX.js:2 INFO ActionRunner ⏹️ Cancelled auto-install (shell action is handling it)
logger-Dc57ZODX.js:2 INFO FileBatcher Sending batch of 1 files to project project-1774176359275
logger-Dc57ZODX.js:2 INFO ActionRunner 📦 Installing with bun...
logger-Dc57ZODX.js:2 INFO ChatClient 💾 Saving chat after AI response completed (onFinish)
logger-Dc57ZODX.js:2 ERROR ActionRunner ❌ Install+dev command failed: sh: 1: bun: not found

logger-Dc57ZODX.js:2 ERROR ActionRunner Action 14 (shell) failed [unknown] (241ms)
logger-Dc57ZODX.js:2 ERROR ActionRunner Action 14 (shell) failed: sh: 1: bun: not found

logger-Dc57ZODX.js:2 DEBUG ActionRunner ✅ [ActionRunner] Action execution complete: 14 shell
logger-Dc57ZODX.js:2 DEBUG FileBatcher Batch send in progress, will retry after current batch completes
logger-Dc57ZODX.js:2 DEBUG ActionRunner Flushed pending file batch before snapshot
logger-Dc57ZODX.js:2 INFO FileBatcher Batch complete: 1/1 files in 230ms
logger-Dc57ZODX.js:2 INFO ActionRunner File batch complete: 1/1 files in 230ms
logger-Dc57ZODX.js:2 INFO ChatClient ✅ Chat saved successfully after AI response (onFinish)
logger-Dc57ZODX.js:2 INFO ActionRunner ✅ Created AI snapshot: AI response completed
logger-Dc57ZODX.js:2 INFO ActionRunner 📝 Recorded 1 files for undo: AI response completed
logger-Dc57ZODX.js:2 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 17: [object Object]
logger-Dc57ZODX.js:2 DEBUG ChatClient Skipping save - onFinish already handled it
logger-Dc57ZODX.js:2 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 18: [object Object]
logger-Dc57ZODX.js:2 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 19: [object Object]
logger-Dc57ZODX.js:2 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 20: [object Object]
logger-Dc57ZODX.js:2 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 21: [object Object]
logger-Dc57ZODX.js:2 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 22: [object Object]
logger-Dc57ZODX.js:2 INFO WorkspaceStore [Workspace] Saved workspace state for project: project-1774176359275
logger-Dc57ZODX.js:2 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 23: [object Object]
logger-Dc57ZODX.js:2 INFO WorkspaceStore [Workspace] Saved workspace state for project: project-1774176359275
logger-Dc57ZODX.js:2 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 24: [object Object]
logger-Dc57ZODX.js:2 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 25: [object Object]
logger-Dc57ZODX.js:2 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 26: [object Object]
logger-Dc57ZODX.js:2 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 27: [object Object]
logger-Dc57ZODX.js:2 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 28: [object Object]
logger-Dc57ZODX.js:2 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 29: [object Object]
logger-Dc57ZODX.js:2 INFO PreviewsStore 🔍 [PreviewsStore] Health check attempt 30: [object Object]
logger-Dc57ZODX.js:2 WARN PreviewsStore ⚠️ [PreviewsStore] Dev server health check timed out after 30 attempts
logger-Dc57ZODX.js:2 INFO PreviewsStore ✅ [PreviewsStore] Preview enabled: https://web.recoder.xyz/preview/project-1774176359275
logger-Dc57ZODX.js:2 INFO Preview 📺 [Preview] Active preview changed: [object Object]
logger-Dc57ZODX.js:2 INFO Preview ✅ [Preview] Preview ready, loading iframe: https://web.recoder.xyz/preview/project-1774176359275
(index):1 Unsafe attempt to load URL https://3000-a559d61b-a583-409b-8afd-92d2164a3d1d.sandbox.recoder.xyz/ from frame with URL chrome-error://chromewebdata/. Domains, protocols and ports must match.









 SES Removing unpermitted intrinsics
lockdown-install.js:1 SES Removing unpermitted intrinsics
lockdown-install.js:1 SES Removing unpermitted intrinsics
The resource <URL> was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.
The resource <URL> was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.
The resource <URL> was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.
The resource <URL> was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.
The resource <URL> was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.
The resource <URL> was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.
The resource <URL> was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.
The resource <URL> was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.
The resource <URL> was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.
The resource <URL> was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.
The resource <URL> was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.
The resource <URL> was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.
The resource <URL> was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.
The resource <URL> was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.
The resource <URL> was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.
about:srcdoc:6 Loading the stylesheet 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap' violates the following Content Security Policy directive: "style-src 'self' 'unsafe-inline'". Note that 'style-src-elem' was not explicitly set, so 'style-src' is used as a fallback. The action has been blocked.
reporter.js?app=recoder-agents:123 Failed to parse tool output as JSON: SyntaxError: Unexpected token 'F', "Failed to "... is not valid JSON
    at JSON.parse (<anonymous>)
    at z (50964-88a81c5348557491.js:1:30260)
    at l9 (63bcdddc-4cdc269bfe4e9381.js:1:51131)
    at o_ (63bcdddc-4cdc269bfe4e9381.js:1:70991)
    at oq (63bcdddc-4cdc269bfe4e9381.js:1:82021)
    at ik (63bcdddc-4cdc269bfe4e9381.js:1:114683)
    at 63bcdddc-4cdc269bfe4e9381.js:1:114528
    at ib (63bcdddc-4cdc269bfe4e9381.js:1:114536)
    at iu (63bcdddc-4cdc269bfe4e9381.js:1:110838)
    at iG (63bcdddc-4cdc269bfe4e9381.js:1:133056)
console.error @ reporter.js?app=recoder-agents:123
reporter.js?app=recoder-agents:123 Raw tool output: Failed to create slide: Failed to upload files: Client error '400 Bad Request' for url 'https://sandbox.recoder.xyz/toolbox/c1d4c2e8-aa5e-420f-a281-b7cc2e75e565/files/bulk-upload'
For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/400
console.error @ reporter.js?app=recoder-agents:123
reporter.js?app=recoder-agents:123 Failed to parse tool output as JSON: SyntaxError: Unexpected token 'F', "Failed to "... is not valid JSON
    at JSON.parse (<anonymous>)
    at z (50964-88a81c5348557491.js:1:30260)
    at l9 (63bcdddc-4cdc269bfe4e9381.js:1:51131)
    at o_ (63bcdddc-4cdc269bfe4e9381.js:1:70991)
    at oq (63bcdddc-4cdc269bfe4e9381.js:1:82021)
    at ik (63bcdddc-4cdc269bfe4e9381.js:1:114683)
    at 63bcdddc-4cdc269bfe4e9381.js:1:114528
    at ib (63bcdddc-4cdc269bfe4e9381.js:1:114536)
    at iu (63bcdddc-4cdc269bfe4e9381.js:1:110838)
    at iX (63bcdddc-4cdc269bfe4e9381.js:1:132935)
console.error @ reporter.js?app=recoder-agents:123
reporter.js?app=recoder-agents:123 Raw tool output: Failed to create slide: Failed to upload files: Client error '400 Bad Request' for url 'https://sandbox.recoder.xyz/toolbox/c1d4c2e8-aa5e-420f-a281-b7cc2e75e565/files/bulk-upload'
For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/400
console.error @ reporter.js?app=recoder-agents:123
reporter.js?app=recoder-agents:123 Failed to parse tool output as JSON: SyntaxError: Unexpected token 'F', "Failed to "... is not valid JSON
    at JSON.parse (<anonymous>)
    at z (50964-88a81c5348557491.js:1:30260)
    at l9 (63bcdddc-4cdc269bfe4e9381.js:1:51131)
    at o_ (63bcdddc-4cdc269bfe4e9381.js:1:70991)
    at oq (63bcdddc-4cdc269bfe4e9381.js:1:82021)
    at ik (63bcdddc-4cdc269bfe4e9381.js:1:114683)
    at 63bcdddc-4cdc269bfe4e9381.js:1:114528
    at ib (63bcdddc-4cdc269bfe4e9381.js:1:114536)
    at iu (63bcdddc-4cdc269bfe4e9381.js:1:110838)
    at iG (63bcdddc-4cdc269bfe4e9381.js:1:133056)
console.error @ reporter.js?app=recoder-agents:123
reporter.js?app=recoder-agents:123 Raw tool output: Failed to create slide: Failed to upload files: Client error '400 Bad Request' for url 'https://sandbox.recoder.xyz/toolbox/c1d4c2e8-aa5e-420f-a281-b7cc2e75e565/files/bulk-upload'
For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/400
console.error @ reporter.js?app=recoder-agents:123
reporter.js?app=recoder-agents:123 Failed to parse tool output as JSON: SyntaxError: Unexpected token 'F', "Failed to "... is not valid JSON
    at JSON.parse (<anonymous>)
    at z (50964-88a81c5348557491.js:1:30260)
    at l9 (63bcdddc-4cdc269bfe4e9381.js:1:51131)
    at o_ (63bcdddc-4cdc269bfe4e9381.js:1:70991)
    at oq (63bcdddc-4cdc269bfe4e9381.js:1:82021)
    at ik (63bcdddc-4cdc269bfe4e9381.js:1:114683)
    at 63bcdddc-4cdc269bfe4e9381.js:1:114528
    at ib (63bcdddc-4cdc269bfe4e9381.js:1:114536)
    at iu (63bcdddc-4cdc269bfe4e9381.js:1:110838)
    at iG (63bcdddc-4cdc269bfe4e9381.js:1:133056)
console.error @ reporter.js?app=recoder-agents:123
reporter.js?app=recoder-agents:123 Raw tool output: Failed to create slide: Failed to upload files: Client error '400 Bad Request' for url 'https://sandbox.recoder.xyz/toolbox/c1d4c2e8-aa5e-420f-a281-b7cc2e75e565/files/bulk-upload'
For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/400
console.error @ reporter.js?app=recoder-agents:123
reporter.js?app=recoder-agents:123 Failed to parse tool output as JSON: SyntaxError: Unexpected token 'F', "Failed to "... is not valid JSON
    at JSON.parse (<anonymous>)
    at z (50964-88a81c5348557491.js:1:30260)
    at l9 (63bcdddc-4cdc269bfe4e9381.js:1:51131)
    at o_ (63bcdddc-4cdc269bfe4e9381.js:1:70991)
    at oq (63bcdddc-4cdc269bfe4e9381.js:1:82021)
    at ik (63bcdddc-4cdc269bfe4e9381.js:1:114683)
    at 63bcdddc-4cdc269bfe4e9381.js:1:114528
    at ib (63bcdddc-4cdc269bfe4e9381.js:1:114536)
    at iu (63bcdddc-4cdc269bfe4e9381.js:1:110838)
    at iG (63bcdddc-4cdc269bfe4e9381.js:1:133056)
console.error @ reporter.js?app=recoder-agents:123
reporter.js?app=recoder-agents:123 Raw tool output: Failed to create slide: Failed to upload files: Client error '400 Bad Request' for url 'https://sandbox.recoder.xyz/toolbox/c1d4c2e8-aa5e-420f-a281-b7cc2e75e565/files/bulk-upload'
For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/400
console.error @ reporter.js?app=recoder-agents:123
about:srcdoc:6 Loading the stylesheet 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap' violates the following Content Security Policy directive: "style-src 'self' 'unsafe-inline'". Note that 'style-src-elem' was not explicitly set, so 'style-src' is used as a fallback. The action has been blocked.
reporter.js?app=recoder-agents:123 Failed to parse tool output as JSON: SyntaxError: Unexpected token 'F', "Failed to "... is not valid JSON
    at JSON.parse (<anonymous>)
    at z (50964-88a81c5348557491.js:1:30260)
    at l9 (63bcdddc-4cdc269bfe4e9381.js:1:51131)
    at o_ (63bcdddc-4cdc269bfe4e9381.js:1:70991)
    at oq (63bcdddc-4cdc269bfe4e9381.js:1:82021)
    at ik (63bcdddc-4cdc269bfe4e9381.js:1:114683)
    at 63bcdddc-4cdc269bfe4e9381.js:1:114528
    at ib (63bcdddc-4cdc269bfe4e9381.js:1:114536)
    at iu (63bcdddc-4cdc269bfe4e9381.js:1:110838)
    at iG (63bcdddc-4cdc269bfe4e9381.js:1:133056)
console.error @ reporter.js?app=recoder-agents:123
reporter.js?app=recoder-agents:123 Raw tool output: Failed to create slide: Failed to upload files: Client error '400 Bad Request' for url 'https://sandbox.recoder.xyz/toolbox/c1d4c2e8-aa5e-420f-a281-b7cc2e75e565/files/bulk-upload'
For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/400
console.error @ reporter.js?app=recoder-agents:123
reporter.js?app=recoder-agents:123 Failed to parse tool output as JSON: SyntaxError: Unexpected token 'F', "Failed to "... is not valid JSON
    at JSON.parse (<anonymous>)
    at z (50964-88a81c5348557491.js:1:30260)
    at l9 (63bcdddc-4cdc269bfe4e9381.js:1:51131)
    at o_ (63bcdddc-4cdc269bfe4e9381.js:1:70991)
    at oq (63bcdddc-4cdc269bfe4e9381.js:1:82021)
    at ik (63bcdddc-4cdc269bfe4e9381.js:1:114683)
    at 63bcdddc-4cdc269bfe4e9381.js:1:114528
    at ib (63bcdddc-4cdc269bfe4e9381.js:1:114536)
    at iu (63bcdddc-4cdc269bfe4e9381.js:1:110838)
    at iX (63bcdddc-4cdc269bfe4e9381.js:1:132935)
console.error @ reporter.js?app=recoder-agents:123
reporter.js?app=recoder-agents:123 Raw tool output: Failed to create slide: Failed to upload files: Client error '400 Bad Request' for url 'https://sandbox.recoder.xyz/toolbox/c1d4c2e8-aa5e-420f-a281-b7cc2e75e565/files/bulk-upload'
For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/400
console.error @ reporter.js?app=recoder-agents:123
reporter.js?app=recoder-agents:123 Failed to parse tool output as JSON: SyntaxError: Unexpected token 'F', "Failed to "... is not valid JSON
    at JSON.parse (<anonymous>)
    at z (50964-88a81c5348557491.js:1:30260)
    at l9 (63bcdddc-4cdc269bfe4e9381.js:1:51131)
    at o_ (63bcdddc-4cdc269bfe4e9381.js:1:70991)
    at oq (63bcdddc-4cdc269bfe4e9381.js:1:82021)
    at ik (63bcdddc-4cdc269bfe4e9381.js:1:114683)
    at 63bcdddc-4cdc269bfe4e9381.js:1:114528
    at ib (63bcdddc-4cdc269bfe4e9381.js:1:114536)
    at iu (63bcdddc-4cdc269bfe4e9381.js:1:110838)
    at iG (63bcdddc-4cdc269bfe4e9381.js:1:133056)
console.error @ reporter.js?app=recoder-agents:123
reporter.js?app=recoder-agents:123 Raw tool output: Failed to create slide: Failed to upload files: Client error '400 Bad Request' for url 'https://sandbox.recoder.xyz/toolbox/c1d4c2e8-aa5e-420f-a281-b7cc2e75e565/files/bulk-upload'
For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/400
console.error @ reporter.js?app=recoder-agents:123
reporter.js?app=recoder-agents:123 Failed to parse tool output as JSON: SyntaxError: Unexpected token 'F', "Failed to "... is not valid JSON
    at JSON.parse (<anonymous>)
    at z (50964-88a81c5348557491.js:1:30260)
    at l9 (63bcdddc-4cdc269bfe4e9381.js:1:51131)
    at o_ (63bcdddc-4cdc269bfe4e9381.js:1:70991)
    at oq (63bcdddc-4cdc269bfe4e9381.js:1:82021)
    at ik (63bcdddc-4cdc269bfe4e9381.js:1:114683)
    at 63bcdddc-4cdc269bfe4e9381.js:1:114528
    at ib (63bcdddc-4cdc269bfe4e9381.js:1:114536)
    at iu (63bcdddc-4cdc269bfe4e9381.js:1:110838)
    at iG (63bcdddc-4cdc269bfe4e9381.js:1:133056)
console.error @ reporter.js?app=recoder-agents:123
reporter.js?app=recoder-agents:123 Raw tool output: Failed to create slide: Failed to upload files: Client error '400 Bad Request' for url 'https://sandbox.recoder.xyz/toolbox/c1d4c2e8-aa5e-420f-a281-b7cc2e75e565/files/bulk-upload'
For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/400
console.error @ reporter.js?app=recoder-agents:123
reporter.js?app=recoder-agents:123 Failed to parse tool output as JSON: SyntaxError: Unexpected token 'F', "Failed to "... is not valid JSON
    at JSON.parse (<anonymous>)
    at z (50964-88a81c5348557491.js:1:30260)
    at l9 (63bcdddc-4cdc269bfe4e9381.js:1:51131)
    at o_ (63bcdddc-4cdc269bfe4e9381.js:1:70991)
    at oq (63bcdddc-4cdc269bfe4e9381.js:1:82021)
    at ik (63bcdddc-4cdc269bfe4e9381.js:1:114683)
    at 63bcdddc-4cdc269bfe4e9381.js:1:114528
    at ib (63bcdddc-4cdc269bfe4e9381.js:1:114536)
    at iu (63bcdddc-4cdc269bfe4e9381.js:1:110838)
    at iG (63bcdddc-4cdc269bfe4e9381.js:1:133056)
console.error @ reporter.js?app=recoder-agents:123
reporter.js?app=recoder-agents:123 Raw tool output: Failed to create slide: Failed to upload files: Client error '400 Bad Request' for url 'https://sandbox.recoder.xyz/toolbox/c1d4c2e8-aa5e-420f-a281-b7cc2e75e565/files/bulk-upload'
For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/400
console.error @ reporter.js?app=recoder-agents:123
9edca36b-90a2-4db0-a719-7aea5de239d5:1 Access to fetch at 'https://api.recoder.xyz/v1/agents?limit=50&sort_by=name&sort_order=asc' from origin 'https://agents.recoder.xyz' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
api.recoder.xyz/v1/agents?limit=50&sort_by=name&sort_order=asc:1  Failed to load resource: net::ERR_FAILED
9edca36b-90a2-4db0-a719-7aea5de239d5:1 Access to fetch at 'https://api.recoder.xyz/v1/threads/9edca36b-90a2-4db0-a719-7aea5de239d5/messages?order=asc&optimized=true' from origin 'https://agents.recoder.xyz' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
api.recoder.xyz/v1/threads/9edca36b-90a2-4db0-a719-7aea5de239d5/messages?order=asc&optimized=true:1  Failed to load resource: net::ERR_FAILED
9edca36b-90a2-4db0-a719-7aea5de239d5:1 Access to fetch at 'https://api.recoder.xyz/v1/agents?limit=50&sort_by=name&sort_order=asc' from origin 'https://agents.recoder.xyz' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
api.recoder.xyz/v1/agents?limit=50&sort_by=name&sort_order=asc:1  Failed to load resource: net::ERR_FAILED
9edca36b-90a2-4db0-a719-7aea5de239d5:1 Access to fetch at 'https://api.recoder.xyz/v1/system/status' from origin 'https://agents.recoder.xyz' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
api.recoder.xyz/v1/system/status:1  Failed to load resource: net::ERR_FAILED
layout-ccbcb1bfa0f57309.js:1 Failed to fetch system status: TypeError: Failed to fetch
    at s (layout-ccbcb1bfa0f57309.js:1:9196)
    at Object.a [as fn] (17091-73b1d309d08ee3a9.js:1:20497)
    at b (17091-73b1d309d08ee3a9.js:1:1283)
    at Object.start (17091-73b1d309d08ee3a9.js:1:1839)
    at o.fetch (17091-73b1d309d08ee3a9.js:1:21264)
    at #g (17091-73b1d309d08ee3a9.js:1:6526)
    at c.fetch (17091-73b1d309d08ee3a9.js:1:6413)
    at c.refetch (17091-73b1d309d08ee3a9.js:1:6227)
    at o.onFocus (17091-73b1d309d08ee3a9.js:1:19134)
    at 97651-1daee45278195dd5.js:1:17301
s @ layout-ccbcb1bfa0f57309.js:1
9edca36b-90a2-4db0-a719-7aea5de239d5:1 Access to resource at 'https://api.recoder.xyz/v1/presence/clear?token=IxCPqorWAwyD9GCtiIiykmowbhPiyo4K&session_id=ead42f9c-8b20-4227-ba56-df21a1e2d532' from origin 'https://agents.recoder.xyz' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
api.recoder.xyz/v1/presence/clear?token=IxCPqorWAwyD9GCtiIiykmowbhPiyo4K&session_id=ead42f9c-8b20-4227-ba56-df21a1e2d532:1  Failed to load resource: net::ERR_FAILED
9edca36b-90a2-4db0-a719-7aea5de239d5:1 Access to resource at 'https://api.recoder.xyz/v1/presence/clear?token=IxCPqorWAwyD9GCtiIiykmowbhPiyo4K&session_id=ead42f9c-8b20-4227-ba56-df21a1e2d532' from origin 'https://agents.recoder.xyz' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
api.recoder.xyz/v1/presence/clear?token=IxCPqorWAwyD9GCtiIiykmowbhPiyo4K&session_id=ead42f9c-8b20-4227-ba56-df21a1e2d532:1  Failed to load resource: net::ERR_FAILED
api.recoder.xyz/v1/notifications/stream?token=IxCPqorWAwyD9GCtiIiykmowbhPiyo4K:1  Failed to load resource: net::ERR_QUIC_PROTOCOL_ERROR
9edca36b-90a2-4db0-a719-7aea5de239d5:1 Access to fetch at 'https://api.recoder.xyz/v1/agents?limit=50&sort_by=name&sort_order=asc' from origin 'https://agents.recoder.xyz' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
api.recoder.xyz/v1/agents?limit=50&sort_by=name&sort_order=asc:1  Failed to load resource: net::ERR_FAILED
9edca36b-90a2-4db0-a719-7aea5de239d5:1 Access to fetch at 'https://api.recoder.xyz/v1/threads/9edca36b-90a2-4db0-a719-7aea5de239d5/messages?order=asc&optimized=true' from origin 'https://agents.recoder.xyz' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
api.recoder.xyz/v1/threads/9edca36b-90a2-4db0-a719-7aea5de239d5/messages?order=asc&optimized=true:1  Failed to load resource: net::ERR_FAILED
91734-689bfb7ee596a182.js:1 Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.
(anonymous) @ 91734-689bfb7ee596a182.js:1
91734-689bfb7ee596a182.js:1 Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.
(anonymous) @ 91734-689bfb7ee596a182.js:1
9edca36b-90a2-4db0-a719-7aea5de239d5:1  Failed to load resource: the server responded with a status of 503 (Service Unavailable)
Node cannot be found in the current page.




RECODER PM 



lockdown-install.js:1 SES Removing unpermitted intrinsics
3319f61d4636e4c6.js:16 Uncaught Error: Minified React error #418; visit https://react.dev/errors/418?args[]=text&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
    at rY (3319f61d4636e4c6.js:16:113016)
    at rK (3319f61d4636e4c6.js:16:114049)
    at 3319f61d4636e4c6.js:16:207769
    at up (3319f61d4636e4c6.js:16:212930)
    at uc (3319f61d4636e4c6.js:16:204270)
    at 3319f61d4636e4c6.js:16:199099
    at s7 (3319f61d4636e4c6.js:16:199200)
    at uj (3319f61d4636e4c6.js:16:225714)
    at MessagePort.R (3319f61d4636e4c6.js:16:74554)
api/insights/chat:1  Failed to load resource: the server responded with a status of 400 ()
e71ded56c9c07af0.js:1 error - Parsing error: 






AGENCY CAN NOT CREATE WORKPSACES 
lockdown-install.js:1 SES Removing unpermitted intrinsics
dashboard:1 Loading the script 'https://api.recoder.xyz/v1/errors/reporter.js?app=recoder-agency' violates the following Content Security Policy directive: "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com". Note that 'script-src-elem' was not explicitly set, so 'script-src' is used as a fallback. The action has been blocked.
VM65 c5f850076b2983bb.js:2 Connecting to 'https://recoder.xyz/api/user/subscription' violates the following Content Security Policy directive: "connect-src 'self' https://*.ingest.us.sentry.io https://*.posthog.com https://*.supabase.co wss://*.supabase.co https://*.recoder.xyz wss://*.recoder.xyz https://www.google-analytics.com https://region1.google-analytics.com". The action has been blocked.
(anonymous) @ VM65 c5f850076b2983bb.js:2
VM65 c5f850076b2983bb.js:2 Fetch API cannot load https://recoder.xyz/api/user/subscription. Refused to connect because it violates the document's Content Security Policy.
(anonymous) @ VM65 c5f850076b2983bb.js:2
VM65 c5f850076b2983bb.js:2 Connecting to 'https://recoder.xyz/api/platform/notifications?limit=20' violates the following Content Security Policy directive: "connect-src 'self' https://*.ingest.us.sentry.io https://*.posthog.com https://*.supabase.co wss://*.supabase.co https://*.recoder.xyz wss://*.recoder.xyz https://www.google-analytics.com https://region1.google-analytics.com". The action has been blocked.
(anonymous) @ VM65 c5f850076b2983bb.js:2
VM65 c5f850076b2983bb.js:2 Fetch API cannot load https://recoder.xyz/api/platform/notifications?limit=20. Refused to connect because it violates the document's Content Security Policy.
(anonymous) @ VM65 c5f850076b2983bb.js:2
api/workspaces:1  Failed to load resource: the server responded with a status of 500 ()
741ea092741b034f.js:1 Error: Failed to create workspace: 500
    at 741ea092741b034f.js:1:451
(anonymous) @ 741ea092741b034f.js:1
api/workspaces:1  Failed to load resource: the server responded with a status of 500 ()
741ea092741b034f.js:1 Error: Failed to create workspace: 500
    at 741ea092741b034f.js:1:451
(anonymous) @ 741ea092741b034f.js:1
lockdown-install.js:1 SES Removing unpermitted intrinsics
dashboard:1 Loading the script 'https://api.recoder.xyz/v1/errors/reporter.js?app=recoder-agency' violates the following Content Security Policy directive: "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com". Note that 'script-src-elem' was not explicitly set, so 'script-src' is used as a fallback. The action has been blocked.
VM65 c5f850076b2983bb.js:2 Connecting to 'https://recoder.xyz/api/user/subscription' violates the following Content Security Policy directive: "connect-src 'self' https://*.ingest.us.sentry.io https://*.posthog.com https://*.supabase.co wss://*.supabase.co https://*.recoder.xyz wss://*.recoder.xyz https://www.google-analytics.com https://region1.google-analytics.com". The action has been blocked.
(anonymous) @ VM65 c5f850076b2983bb.js:2
VM65 c5f850076b2983bb.js:2 Fetch API cannot load https://recoder.xyz/api/user/subscription. Refused to connect because it violates the document's Content Security Policy.
(anonymous) @ VM65 c5f850076b2983bb.js:2
VM65 c5f850076b2983bb.js:2 Connecting to 'https://recoder.xyz/api/platform/notifications?limit=20' violates the following Content Security Policy directive: "connect-src 'self' https://*.ingest.us.sentry.io https://*.posthog.com https://*.supabase.co wss://*.supabase.co https://*.recoder.xyz wss://*.recoder.xyz https://www.google-analytics.com https://region1.google-analytics.com". The action has been blocked.
(anonymous) @ VM65 c5f850076b2983bb.js:2
VM65 c5f850076b2983bb.js:2 Fetch API cannot load https://recoder.xyz/api/platform/notifications?limit=20. Refused to connect because it violates the document's Content Security Policy.
(anonymous) @ VM65 c5f850076b2983bb.js:2
api/workspaces:1  Failed to load resource: the server responded with a status of 500 ()
741ea092741b034f.js:1 Error: Failed to create workspace: 500
    at 741ea092741b034f.js:1:451
(anonymous) @ 741ea092741b034f.js:1
api/workspaces:1  Failed to load resource: the server responded with a status of 500 ()
741ea092741b034f.js:1 Error: Failed to create workspace: 500
    at 741ea092741b034f.js:1:451
(anonymous) @ 741ea092741b034f.js:1
48a011ddbc0650b5.js:20 Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.
f @ 48a011ddbc0650b5.js:20
oU @ 48a011ddbc0650b5.js:20
e.callback @ 48a011ddbc0650b5.js:20
aK @ 48a011ddbc0650b5.js:20
aQ @ 48a011ddbc0650b5.js:20
ly @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
sl @ 48a011ddbc0650b5.js:20
l2 @ 48a011ddbc0650b5.js:20
ub @ 48a011ddbc0650b5.js:20
um @ 48a011ddbc0650b5.js:20
s7 @ 48a011ddbc0650b5.js:20
setTimeout
s9 @ 48a011ddbc0650b5.js:20
u$ @ 48a011ddbc0650b5.js:20
N @ 48a011ddbc0650b5.js:20
4e01e750ac428a7c.js:1 Application error: Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.
(anonymous) @ 4e01e750ac428a7c.js:1
lm @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
sc @ 48a011ddbc0650b5.js:20
sd @ 48a011ddbc0650b5.js:20
uw @ 48a011ddbc0650b5.js:20
uE @ 48a011ddbc0650b5.js:20
uH @ 48a011ddbc0650b5.js:20
uz @ 48a011ddbc0650b5.js:20
u_ @ 48a011ddbc0650b5.js:20
um @ 48a011ddbc0650b5.js:20
s7 @ 48a011ddbc0650b5.js:20
setTimeout
s9 @ 48a011ddbc0650b5.js:20
u$ @ 48a011ddbc0650b5.js:20
N @ 48a011ddbc0650b5.js:20


