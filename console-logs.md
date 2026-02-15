chunk-AIH37SPS.js?v=67d16266:29776 Download the React DevTools for a better development experience: https://reactjs.org/link/react-devtools
previews.ts:51 ✅ [PreviewsStore] Docker backend health check passed, using Docker mode
workbench.ts:416 🔄 [WorkbenchStore] Ensuring container exists before initialization...
workbench.ts:68 🐳 [ensureContainerExists] Creating container for project-1770157753669  
:3100/api/container:1  Failed to load resource: the server responded with a status of 429 (Too Many Requests)
logger.ts:213 ERROR DockerAPI [req-4-ml76809a] POST /api/container failed (222ms)
workbench.ts:94 ⚠️ [ensureContainerExists] Container limit hit, attempting auto-eviction...
workbench.ts:105 🗑️ [ensureContainerExists] Evicting stale container: project-1770156037008
:3100/api/container:1  Failed to load resource: the server responded with a status of 429 (Too Many Requests)
logger.ts:213 ERROR DockerAPI [req-8-ml76888a] POST /api/container failed (239ms)
workbench.ts:118 ❌ [ensureContainerExists] Auto-eviction failed: Container limit reached. You have 5 active containers. Maximum allowed: 5. Please close unused projects.
(anonymous) @ workbench.ts:118
workbench.ts:122 ❌ [ensureContainerExists] Error: Container limit reached. You have 6 active containers. Maximum allowed: 5. Please close unused projects.
(anonymous) @ workbench.ts:122
workbench.ts:427 ⚠️ [WorkbenchStore] Container creation failed, proceeding anyway
setProjectId @ workbench.ts:427
previews.ts:30 📺 [PreviewsStore] setProjectId called: project-1770157753669
previews.ts:36 📺 [PreviewsStore] Init complete, useDocker: true, DOCKER_URL: http://localhost:3100
previews.ts:79 📺 [PreviewsStore] Initializing Docker preview for project-1770157753669
previews.ts:90 🔄 [PreviewsStore] Docker preview URL set (waiting for containerReady): http://localhost:3100/preview/project-1770157753669
previews.ts:102 ⏳ [PreviewsStore] Waiting for container ready: project-1770157753669
workspace.ts:268 [Workspace] No saved workspace for project: project-1770157753669
workspace.ts:288 [Workspace] Auto-save started (interval: 30000ms)
workspace.ts:152 [Workspace] Saved workspace state for project: project-1770157753669
previews.ts:110 📺 [PreviewsStore] Container ready state: false
previews.ts:119 📺 [PreviewsStore] Subscribing to containerReady changes...
previews.ts:121 📺 [PreviewsStore] containerReady subscription fired: false
logger.ts:213 DEBUG AttachmentsStore Cleared all attachments
:3100/api/files/project-1770157753669:1  Failed to load resource: the server responded with a status of 404 (Not Found)
logger.ts:213 INFO SimpleChat Starting chat request
logger.ts:213 DEBUG SimpleChat Condense check: {"shouldCondense":false,"currentTokens":0,"maxTokens":131072,"thresholdTokens":104857,"percentUsed":0,"reason":"Not enough messages (0/6 required)"}
lsp-client.ts:78 [LSPClient] Skipping LSP start - container not ready
logger.ts:213 INFO Terminal Attach terminal
Preview.tsx:671 📺 [Preview] Active preview changed: Object
Preview.tsx:692 ✅ [Preview] Preview URL is valid: http://localhost:3100/preview/project-1770157753669
:3100/api/files/project-1770157753669:1  Failed to load resource: the server responded with a status of 404 (Not Found)
Preview.tsx:671 📺 [Preview] Active preview changed: Object
Preview.tsx:692 ✅ [Preview] Preview URL is valid: http://localhost:3100/preview/project-1770157753669
project-1770157753669:1  Failed to load resource: the server responded with a status of 404 (Not Found)
project-1770157753669:25  GET http://localhost:3100/preview/project-1770157753669 404 (Not Found)
(anonymous) @ project-1770157753669:25
project-1770157753669:25  GET http://localhost:3100/preview/project-1770157753669 404 (Not Found)
(anonymous) @ project-1770157753669:25
setTimeout
(anonymous) @ project-1770157753669:25
workspace.ts:152 [Workspace] Saved workspace state for project: project-1770157753669
logger.ts:213 INFO SimpleChat First token received in 9347ms
useMessageParser.ts:18 🎨 [MessageParser] Artifact opened: basic-landing-page Basic Landing Page with Vite + React
workbench.ts:934 🎨 [WorkbenchStore] addArtifact called: basic-landing-page Basic Landing Page with Vite + React messageId: assistant-1770157785486
workbench.ts:951 [WorkbenchStore] ActionRunner created with projectId: project-1770157753669
useMessageParser.ts:45 🔧 [MessageParser] Action opened: file package.json
workbench.ts:985 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1770157785486
workbench.ts:994 🏪 [WorkbenchStore] Calling artifact.runner.addAction
snapshots.ts:209 [Snapshot] Skipping create — container not ready or in failure cooldown
useMessageParser.ts:51 🔧 [MessageParser] Action closed: file package.json
useMessageParser.ts:55 🔧 [MessageParser] Calling workbenchStore.runAction for: file
workbench.ts:1000 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1770157785486
workbench.ts:1009 🏪 [WorkbenchStore] Calling artifact.runner.runAction
logger.ts:213 DEBUG ActionQueue Enqueued action action-1770157795559-cfytggfta: file
action-runner.ts:1145 ❌ [ActionRunner] #waitForContainerReady error: Error: Container creation failed — cannot execute file/shell actions
    at #ensureDockerReady (action-runner.ts:575:15)
    at async #waitForContainerReady (action-runner.ts:1138:7)
    at async #executeAction (action-runner.ts:913:9)
#waitForContainerReady @ action-runner.ts:1145
await in #waitForContainerReady
#executeAction @ action-runner.ts:913
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
logger.ts:213 ERROR ActionRunner Action 0 (file) failed [container] (3ms)
action-runner.ts:1116 Action 0 (file) failed: Container creation failed — cannot execute file/shell actions
#executeAction @ action-runner.ts:1116
await in #executeAction
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
useMessageParser.ts:45 🔧 [MessageParser] Action opened: file vite.config.ts
workbench.ts:985 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1770157785486
workbench.ts:994 🏪 [WorkbenchStore] Calling artifact.runner.addAction
useMessageParser.ts:51 🔧 [MessageParser] Action closed: file vite.config.ts
useMessageParser.ts:55 🔧 [MessageParser] Calling workbenchStore.runAction for: file
workbench.ts:1000 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1770157785486
workbench.ts:1009 🏪 [WorkbenchStore] Calling artifact.runner.runAction
logger.ts:213 DEBUG ActionQueue Enqueued action action-1770157795706-vc3lew7oz: file
action-runner.ts:1145 ❌ [ActionRunner] #waitForContainerReady error: Error: Container creation failed — cannot execute file/shell actions
    at #ensureDockerReady (action-runner.ts:575:15)
    at async #waitForContainerReady (action-runner.ts:1138:7)
    at async #executeAction (action-runner.ts:913:9)
#waitForContainerReady @ action-runner.ts:1145
await in #waitForContainerReady
#executeAction @ action-runner.ts:913
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
logger.ts:213 ERROR ActionRunner Action 1 (file) failed [container] (2ms)
action-runner.ts:1116 Action 1 (file) failed: Container creation failed — cannot execute file/shell actions
#executeAction @ action-runner.ts:1116
await in #executeAction
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
useMessageParser.ts:45 🔧 [MessageParser] Action opened: file tsconfig.json
workbench.ts:985 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1770157785486
workbench.ts:994 🏪 [WorkbenchStore] Calling artifact.runner.addAction
useMessageParser.ts:51 🔧 [MessageParser] Action closed: file tsconfig.json
useMessageParser.ts:55 🔧 [MessageParser] Calling workbenchStore.runAction for: file
workbench.ts:1000 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1770157785486
workbench.ts:1009 🏪 [WorkbenchStore] Calling artifact.runner.runAction
logger.ts:213 DEBUG ActionQueue Enqueued action action-1770157796212-uindo1xdf: file
action-runner.ts:1145 ❌ [ActionRunner] #waitForContainerReady error: Error: Container creation failed — cannot execute file/shell actions
    at #ensureDockerReady (action-runner.ts:575:15)
    at async #waitForContainerReady (action-runner.ts:1138:7)
    at async #executeAction (action-runner.ts:913:9)
#waitForContainerReady @ action-runner.ts:1145
await in #waitForContainerReady
#executeAction @ action-runner.ts:913
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
logger.ts:213 ERROR ActionRunner Action 2 (file) failed [container] (4ms)
action-runner.ts:1116 Action 2 (file) failed: Container creation failed — cannot execute file/shell actions
#executeAction @ action-runner.ts:1116
await in #executeAction
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
useMessageParser.ts:45 🔧 [MessageParser] Action opened: file tailwind.config.js
workbench.ts:985 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1770157785486
workbench.ts:994 🏪 [WorkbenchStore] Calling artifact.runner.addAction
useMessageParser.ts:51 🔧 [MessageParser] Action closed: file tailwind.config.js
useMessageParser.ts:55 🔧 [MessageParser] Calling workbenchStore.runAction for: file
workbench.ts:1000 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1770157785486
workbench.ts:1009 🏪 [WorkbenchStore] Calling artifact.runner.runAction
logger.ts:213 DEBUG ActionQueue Enqueued action action-1770157796972-btustra40: file
useMessageParser.ts:45 🔧 [MessageParser] Action opened: file postcss.config.js
workbench.ts:985 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1770157785486
workbench.ts:994 🏪 [WorkbenchStore] Calling artifact.runner.addAction
action-runner.ts:1145 ❌ [ActionRunner] #waitForContainerReady error: Error: Container creation failed — cannot execute file/shell actions
    at #ensureDockerReady (action-runner.ts:575:15)
    at async #waitForContainerReady (action-runner.ts:1138:7)
    at async #executeAction (action-runner.ts:913:9)
#waitForContainerReady @ action-runner.ts:1145
await in #waitForContainerReady
#executeAction @ action-runner.ts:913
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
logger.ts:213 ERROR ActionRunner Action 3 (file) failed [container] (10ms)
action-runner.ts:1116 Action 3 (file) failed: Container creation failed — cannot execute file/shell actions
#executeAction @ action-runner.ts:1116
await in #executeAction
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
useMessageParser.ts:51 🔧 [MessageParser] Action closed: file postcss.config.js
useMessageParser.ts:55 🔧 [MessageParser] Calling workbenchStore.runAction for: file
workbench.ts:1000 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1770157785486
workbench.ts:1009 🏪 [WorkbenchStore] Calling artifact.runner.runAction
logger.ts:213 DEBUG ActionQueue Enqueued action action-1770157796988-zlk31p0r2: file
action-runner.ts:1145 ❌ [ActionRunner] #waitForContainerReady error: Error: Container creation failed — cannot execute file/shell actions
    at #ensureDockerReady (action-runner.ts:575:15)
    at async #waitForContainerReady (action-runner.ts:1138:7)
    at async #executeAction (action-runner.ts:913:9)
#waitForContainerReady @ action-runner.ts:1145
await in #waitForContainerReady
#executeAction @ action-runner.ts:913
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
logger.ts:213 ERROR ActionRunner Action 4 (file) failed [container] (2ms)
action-runner.ts:1116 Action 4 (file) failed: Container creation failed — cannot execute file/shell actions
#executeAction @ action-runner.ts:1116
await in #executeAction
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
useMessageParser.ts:45 🔧 [MessageParser] Action opened: file index.html
workbench.ts:985 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1770157785486
workbench.ts:994 🏪 [WorkbenchStore] Calling artifact.runner.addAction
useMessageParser.ts:51 🔧 [MessageParser] Action closed: file index.html
useMessageParser.ts:55 🔧 [MessageParser] Calling workbenchStore.runAction for: file
workbench.ts:1000 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1770157785486
workbench.ts:1009 🏪 [WorkbenchStore] Calling artifact.runner.runAction
logger.ts:213 DEBUG ActionQueue Enqueued action action-1770157797374-dhi7trm3a: file
action-runner.ts:1145 ❌ [ActionRunner] #waitForContainerReady error: Error: Container creation failed — cannot execute file/shell actions
    at #ensureDockerReady (action-runner.ts:575:15)
    at async #waitForContainerReady (action-runner.ts:1138:7)
    at async #executeAction (action-runner.ts:913:9)
#waitForContainerReady @ action-runner.ts:1145
await in #waitForContainerReady
#executeAction @ action-runner.ts:913
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
logger.ts:213 ERROR ActionRunner Action 5 (file) failed [container] (2ms)
action-runner.ts:1116 Action 5 (file) failed: Container creation failed — cannot execute file/shell actions
#executeAction @ action-runner.ts:1116
await in #executeAction
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
useMessageParser.ts:45 🔧 [MessageParser] Action opened: file src/main.tsx
workbench.ts:985 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1770157785486
workbench.ts:994 🏪 [WorkbenchStore] Calling artifact.runner.addAction
project-1770157753669:25  GET http://localhost:3100/preview/project-1770157753669 404 (Not Found)
(anonymous) @ project-1770157753669:25
setTimeout
(anonymous) @ project-1770157753669:25
useMessageParser.ts:51 🔧 [MessageParser] Action closed: file src/main.tsx
useMessageParser.ts:55 🔧 [MessageParser] Calling workbenchStore.runAction for: file
workbench.ts:1000 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1770157785486
workbench.ts:1009 🏪 [WorkbenchStore] Calling artifact.runner.runAction
logger.ts:213 DEBUG ActionQueue Enqueued action action-1770157797615-gc3iu6bmj: file
action-runner.ts:1145 ❌ [ActionRunner] #waitForContainerReady error: Error: Container creation failed — cannot execute file/shell actions
    at #ensureDockerReady (action-runner.ts:575:15)
    at async #waitForContainerReady (action-runner.ts:1138:7)
    at async #executeAction (action-runner.ts:913:9)
#waitForContainerReady @ action-runner.ts:1145
await in #waitForContainerReady
#executeAction @ action-runner.ts:913
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
logger.ts:213 ERROR ActionRunner Action 6 (file) failed [container] (1ms)
action-runner.ts:1116 Action 6 (file) failed: Container creation failed — cannot execute file/shell actions
#executeAction @ action-runner.ts:1116
await in #executeAction
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
useMessageParser.ts:45 🔧 [MessageParser] Action opened: file src/index.css
workbench.ts:985 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1770157785486
workbench.ts:994 🏪 [WorkbenchStore] Calling artifact.runner.addAction
useMessageParser.ts:51 🔧 [MessageParser] Action closed: file src/index.css
useMessageParser.ts:55 🔧 [MessageParser] Calling workbenchStore.runAction for: file
workbench.ts:1000 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1770157785486
workbench.ts:1009 🏪 [WorkbenchStore] Calling artifact.runner.runAction
logger.ts:213 DEBUG ActionQueue Enqueued action action-1770157797861-jhdloubsb: file
action-runner.ts:1145 ❌ [ActionRunner] #waitForContainerReady error: Error: Container creation failed — cannot execute file/shell actions
    at #ensureDockerReady (action-runner.ts:575:15)
    at async #waitForContainerReady (action-runner.ts:1138:7)
    at async #executeAction (action-runner.ts:913:9)
#waitForContainerReady @ action-runner.ts:1145
await in #waitForContainerReady
#executeAction @ action-runner.ts:913
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
logger.ts:213 ERROR ActionRunner Action 7 (file) failed [container] (3ms)
action-runner.ts:1116 Action 7 (file) failed: Container creation failed — cannot execute file/shell actions
#executeAction @ action-runner.ts:1116
await in #executeAction
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
useMessageParser.ts:45 🔧 [MessageParser] Action opened: file src/App.tsx
workbench.ts:985 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1770157785486
workbench.ts:994 🏪 [WorkbenchStore] Calling artifact.runner.addAction
useMessageParser.ts:51 🔧 [MessageParser] Action closed: file src/App.tsx
useMessageParser.ts:55 🔧 [MessageParser] Calling workbenchStore.runAction for: file
workbench.ts:1000 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1770157785486
workbench.ts:1009 🏪 [WorkbenchStore] Calling artifact.runner.runAction
logger.ts:213 DEBUG ActionQueue Enqueued action action-1770157798439-a3tqylbqz: file
action-runner.ts:1145 ❌ [ActionRunner] #waitForContainerReady error: Error: Container creation failed — cannot execute file/shell actions
    at #ensureDockerReady (action-runner.ts:575:15)
    at async #waitForContainerReady (action-runner.ts:1138:7)
    at async #executeAction (action-runner.ts:913:9)
#waitForContainerReady @ action-runner.ts:1145
await in #waitForContainerReady
#executeAction @ action-runner.ts:913
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
logger.ts:213 ERROR ActionRunner Action 8 (file) failed [container] (2ms)
action-runner.ts:1116 Action 8 (file) failed: Container creation failed — cannot execute file/shell actions
#executeAction @ action-runner.ts:1116
await in #executeAction
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
useMessageParser.ts:45 🔧 [MessageParser] Action opened: file src/components/Header.tsx
workbench.ts:985 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1770157785486
workbench.ts:994 🏪 [WorkbenchStore] Calling artifact.runner.addAction
useMessageParser.ts:51 🔧 [MessageParser] Action closed: file src/components/Header.tsx
useMessageParser.ts:55 🔧 [MessageParser] Calling workbenchStore.runAction for: file
workbench.ts:1000 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1770157785486
workbench.ts:1009 🏪 [WorkbenchStore] Calling artifact.runner.runAction
logger.ts:213 DEBUG ActionQueue Enqueued action action-1770157801066-1crrlwa1w: file
action-runner.ts:1145 ❌ [ActionRunner] #waitForContainerReady error: Error: Container creation failed — cannot execute file/shell actions
    at #ensureDockerReady (action-runner.ts:575:15)
    at async #waitForContainerReady (action-runner.ts:1138:7)
    at async #executeAction (action-runner.ts:913:9)
#waitForContainerReady @ action-runner.ts:1145
await in #waitForContainerReady
#executeAction @ action-runner.ts:913
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
logger.ts:213 ERROR ActionRunner Action 9 (file) failed [container] (1ms)
action-runner.ts:1116 Action 9 (file) failed: Container creation failed — cannot execute file/shell actions
#executeAction @ action-runner.ts:1116
await in #executeAction
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
useMessageParser.ts:45 🔧 [MessageParser] Action opened: file src/components/Hero.tsx
workbench.ts:985 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1770157785486
workbench.ts:994 🏪 [WorkbenchStore] Calling artifact.runner.addAction
project-1770157753669:25  GET http://localhost:3100/preview/project-1770157753669 404 (Not Found)
(anonymous) @ project-1770157753669:25
setTimeout
(anonymous) @ project-1770157753669:25
useMessageParser.ts:51 🔧 [MessageParser] Action closed: file src/components/Hero.tsx
useMessageParser.ts:55 🔧 [MessageParser] Calling workbenchStore.runAction for: file
workbench.ts:1000 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1770157785486
workbench.ts:1009 🏪 [WorkbenchStore] Calling artifact.runner.runAction
logger.ts:213 DEBUG ActionQueue Enqueued action action-1770157803557-sk0vvh5yl: file
action-runner.ts:1145 ❌ [ActionRunner] #waitForContainerReady error: Error: Container creation failed — cannot execute file/shell actions
    at #ensureDockerReady (action-runner.ts:575:15)
    at async #waitForContainerReady (action-runner.ts:1138:7)
    at async #executeAction (action-runner.ts:913:9)
#waitForContainerReady @ action-runner.ts:1145
await in #waitForContainerReady
#executeAction @ action-runner.ts:913
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
logger.ts:213 ERROR ActionRunner Action 10 (file) failed [container] (1ms)
action-runner.ts:1116 Action 10 (file) failed: Container creation failed — cannot execute file/shell actions
#executeAction @ action-runner.ts:1116
await in #executeAction
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
useMessageParser.ts:45 🔧 [MessageParser] Action opened: file src/components/Features.tsx
workbench.ts:985 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1770157785486
workbench.ts:994 🏪 [WorkbenchStore] Calling artifact.runner.addAction
project-1770157753669:25  GET http://localhost:3100/preview/project-1770157753669 404 (Not Found)
(anonymous) @ project-1770157753669:25
setTimeout
(anonymous) @ project-1770157753669:25
useMessageParser.ts:51 🔧 [MessageParser] Action closed: file src/components/Features.tsx
useMessageParser.ts:55 🔧 [MessageParser] Calling workbenchStore.runAction for: file
workbench.ts:1000 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1770157785486
workbench.ts:1009 🏪 [WorkbenchStore] Calling artifact.runner.runAction
logger.ts:213 DEBUG ActionQueue Enqueued action action-1770157805593-43fbpyehw: file
action-runner.ts:1145 ❌ [ActionRunner] #waitForContainerReady error: Error: Container creation failed — cannot execute file/shell actions
    at #ensureDockerReady (action-runner.ts:575:15)
    at async #waitForContainerReady (action-runner.ts:1138:7)
    at async #executeAction (action-runner.ts:913:9)
#waitForContainerReady @ action-runner.ts:1145
await in #waitForContainerReady
#executeAction @ action-runner.ts:913
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
logger.ts:213 ERROR ActionRunner Action 11 (file) failed [container] (1ms)
action-runner.ts:1116 Action 11 (file) failed: Container creation failed — cannot execute file/shell actions
#executeAction @ action-runner.ts:1116
await in #executeAction
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
useMessageParser.ts:45 🔧 [MessageParser] Action opened: file src/components/Footer.tsx
workbench.ts:985 🏪 [WorkbenchStore] addAction called: file messageId: assistant-1770157785486
workbench.ts:994 🏪 [WorkbenchStore] Calling artifact.runner.addAction
useMessageParser.ts:51 🔧 [MessageParser] Action closed: file src/components/Footer.tsx
useMessageParser.ts:55 🔧 [MessageParser] Calling workbenchStore.runAction for: file
workbench.ts:1000 🏪 [WorkbenchStore] runAction called: file messageId: assistant-1770157785486
workbench.ts:1009 🏪 [WorkbenchStore] Calling artifact.runner.runAction
logger.ts:213 DEBUG ActionQueue Enqueued action action-1770157808071-vs6rwnrzi: file
action-runner.ts:1145 ❌ [ActionRunner] #waitForContainerReady error: Error: Container creation failed — cannot execute file/shell actions
    at #ensureDockerReady (action-runner.ts:575:15)
    at async #waitForContainerReady (action-runner.ts:1138:7)
    at async #executeAction (action-runner.ts:913:9)
#waitForContainerReady @ action-runner.ts:1145
await in #waitForContainerReady
#executeAction @ action-runner.ts:913
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
logger.ts:213 ERROR ActionRunner Action 12 (file) failed [container] (2ms)
action-runner.ts:1116 Action 12 (file) failed: Container creation failed — cannot execute file/shell actions
#executeAction @ action-runner.ts:1116
await in #executeAction
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
useMessageParser.ts:45 🔧 [MessageParser] Action opened: shell 
useMessageParser.ts:51 🔧 [MessageParser] Action closed: shell 
workbench.ts:985 🏪 [WorkbenchStore] addAction called: shell messageId: assistant-1770157785486
workbench.ts:994 🏪 [WorkbenchStore] Calling artifact.runner.addAction
useMessageParser.ts:55 🔧 [MessageParser] Calling workbenchStore.runAction for: shell
workbench.ts:1000 🏪 [WorkbenchStore] runAction called: shell messageId: assistant-1770157785486
workbench.ts:1009 🏪 [WorkbenchStore] Calling artifact.runner.runAction
useMessageParser.ts:34 🎨 [MessageParser] Artifact closed: basic-landing-page Basic Landing Page with Vite + React
logger.ts:213 DEBUG ActionQueue Enqueued action action-1770157808146-1dx9jwoje: shell
action-runner.ts:1145 ❌ [ActionRunner] #waitForContainerReady error: Error: Container creation failed — cannot execute file/shell actions
    at #ensureDockerReady (action-runner.ts:575:15)
    at async #waitForContainerReady (action-runner.ts:1138:7)
    at async #executeAction (action-runner.ts:913:9)
#waitForContainerReady @ action-runner.ts:1145
await in #waitForContainerReady
#executeAction @ action-runner.ts:913
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
logger.ts:213 ERROR ActionRunner Action 13 (shell) failed [container] (18ms)
action-runner.ts:1116 Action 13 (shell) failed: Container creation failed — cannot execute file/shell actions
#executeAction @ action-runner.ts:1116
await in #executeAction
(anonymous) @ action-runner.ts:835
Promise.then
runAction @ action-runner.ts:833
runAction @ workbench.ts:1010
onActionClose @ useMessageParser.ts:56
parse @ message-parser.ts:207
(anonymous) @ useMessageParser.ts:78
(anonymous) @ Chat.client.tsx:482
commitHookEffectListMount @ chunk-AIH37SPS.js?v=67d16266:24951
commitPassiveMountOnFiber @ chunk-AIH37SPS.js?v=67d16266:26226
commitPassiveMountEffects_complete @ chunk-AIH37SPS.js?v=67d16266:26198
commitPassiveMountEffects_begin @ chunk-AIH37SPS.js?v=67d16266:26187
commitPassiveMountEffects @ chunk-AIH37SPS.js?v=67d16266:26176
flushPassiveEffectsImpl @ chunk-AIH37SPS.js?v=67d16266:27619
flushPassiveEffects @ chunk-AIH37SPS.js?v=67d16266:27574
(anonymous) @ chunk-AIH37SPS.js?v=67d16266:27454
workLoop @ chunk-AIH37SPS.js?v=67d16266:484
flushWork @ chunk-AIH37SPS.js?v=67d16266:462
performWorkUntilDeadline @ chunk-AIH37SPS.js?v=67d16266:684
logger.ts:213 INFO SimpleChat Stream completed (23516ms)
useSimpleChat.ts:857 [useSimpleChat] 🔍 === TRUNCATION DETECTION START ===
(anonymous) @ useSimpleChat.ts:857
useSimpleChat.ts:858 [useSimpleChat] Content length: 15965 chars
(anonymous) @ useSimpleChat.ts:858
useSimpleChat.ts:859 [useSimpleChat] Content ends with: "nfigurations. Run `npm run dev` to start the development server and see your landing page in action!"
(anonymous) @ useSimpleChat.ts:859
useSimpleChat.ts:237 [useSimpleChat] 📊 ACTION TAG COUNT: 14 open, 14 closed
detectTruncatedResponse @ useSimpleChat.ts:237
(anonymous) @ useSimpleChat.ts:863
useSimpleChat.ts:268 [useSimpleChat] 📊 ARTIFACT TAG COUNT: 1 open, 1 closed
detectTruncatedResponse @ useSimpleChat.ts:268
(anonymous) @ useSimpleChat.ts:863
useSimpleChat.ts:360 [useSimpleChat] ✅ Truncation check passed - response appears complete
detectTruncatedResponse @ useSimpleChat.ts:360
(anonymous) @ useSimpleChat.ts:863
useSimpleChat.ts:875 [useSimpleChat] 📋 TRUNCATION CHECK RESULT: {
  "isTruncated": false,
  "reason": "none",
  "enableAutoContinue": true,
  "continuationCount": 0,
  "maxContinuations": 3,
  "details": {}
}
(anonymous) @ useSimpleChat.ts:875
useSimpleChat.ts:883 [useSimpleChat] 🔍 === TRUNCATION DETECTION END ===
(anonymous) @ useSimpleChat.ts:883
useSimpleChat.ts:941 [useSimpleChat] ✅ Response complete - no continuation needed
useSimpleChat.ts:237 [useSimpleChat] 📊 ACTION TAG COUNT: 14 open, 14 closed
detectTruncatedResponse @ useSimpleChat.ts:237
(anonymous) @ useSimpleChat.ts:945
useSimpleChat.ts:268 [useSimpleChat] 📊 ARTIFACT TAG COUNT: 1 open, 1 closed
detectTruncatedResponse @ useSimpleChat.ts:268
(anonymous) @ useSimpleChat.ts:945
useSimpleChat.ts:360 [useSimpleChat] ✅ Truncation check passed - response appears complete
detectTruncatedResponse @ useSimpleChat.ts:360
(anonymous) @ useSimpleChat.ts:945
logger.ts:213 INFO SimpleChat Chat request completed (23517ms)
logger.ts:213 DEBUG Chat Finished streaming
logger.ts:213 DEBUG Chat Skipping useEffect save - onFinish already handled it
useSimpleChat.ts:237 [useSimpleChat] 📊 ACTION TAG COUNT: 14 open, 14 closed
detectTruncatedResponse @ useSimpleChat.ts:237
(anonymous) @ useSimpleChat.ts:1084
useSimpleChat.ts:268 [useSimpleChat] 📊 ARTIFACT TAG COUNT: 1 open, 1 closed
detectTruncatedResponse @ useSimpleChat.ts:268
(anonymous) @ useSimpleChat.ts:1084
useSimpleChat.ts:360 [useSimpleChat] ✅ Truncation check passed - response appears complete
detectTruncatedResponse @ useSimpleChat.ts:360
(anonymous) @ useSimpleChat.ts:1084
logger.ts:213 DEBUG ActionRunner Stream ended, truncated: false
logger.ts:213 DEBUG ActionRunner No orphaned actions after stream end
useSimpleChat.ts:1113 [useSimpleChat] Stream ended, notified workbench (truncated: false)
snapshots.ts:209 [Snapshot] Skipping create — container not ready or in failure cooldown
project-1770157753669:25  GET http://localhost:3100/preview/project-1770157753669 404 (Not Found)
(anonymous) @ project-1770157753669:25
setTimeout
(anonymous) @ project-1770157753669:25
logger.ts:213 INFO Chat 💾 Saving chat after AI response completed (onFinish)
logger.ts:213 INFO Chat ✅ Chat saved successfully after AI response (onFinish)
logger.ts:213 INFO Chat 💾 Saving chat from useEffect
project-1770157753669:25  GET http://localhost:3100/preview/project-1770157753669 404 (Not Found)
(anonymous) @ project-1770157753669:25
setTimeout
(anonymous) @ project-1770157753669:25
logger.ts:213 INFO Chat ✅ Chat saved successfully from useEffect
project-1770157753669:25  GET http://localhost:3100/preview/project-1770157753669 404 (Not Found)
(anonymous) @ project-1770157753669:25
setTimeout
(anonymous) @ project-1770157753669:25
project-1770157753669:25  GET http://localhost:3100/preview/project-1770157753669 404 (Not Found)
(anonymous) @ project-1770157753669:25
setTimeout
(anonymous) @ project-1770157753669:25
project-1770157753669:25  GET http://localhost:3100/preview/project-1770157753669 404 (Not Found)
(anonymous) @ project-1770157753669:25
setTimeout
(anonymous) @ project-1770157753669:25
project-1770157753669:25  GET http://localhost:3100/preview/project-1770157753669 404 (Not Found)
(anonymous) @ project-1770157753669:25
setTimeout
(anonymous) @ project-1770157753669:25
project-1770157753669:25  GET http://localhost:3100/preview/project-1770157753669 404 (Not Found)
(anonymous) @ project-1770157753669:25
setTimeout
(anonymous) @ project-1770157753669:25
project-1770157753669:25  GET http://localhost:3100/preview/project-1770157753669 404 (Not Found)
(anonymous) @ project-1770157753669:25
setTimeout
(anonymous) @ project-1770157753669:25
  GET http://localhost:3100/preview/project-1770157753669 404 (Not Found)
(anonymous) @ project-1770157753669:25
setTimeout
(anonymous) @ project-1770157753669:25
  GET http://localhost:3100/preview/project-1770157753669 404 (Not Found)
(anonymous) @ project-1770157753669:25
setTimeout
(anonymous) @ project-1770157753669:25
