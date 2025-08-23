 I did not added dns stuff from name cheap also got confused for render due to our whole porject is mono repo could not direct 
  copy my backend and production engine to render so I just clonedn my entire rpository to render recoder web and recoder chat 
  still gives error when I click on them 404: NOT_FOUND
  Code: DEPLOYMENT_NOT_FOUND
  ID: fra1::7nnxq-1755975342050-a121264d933b  make a plan 
  Last 30 days
  Updated 1m ago
  Edge Requests
  42K / 1M
  10M
  Edge Middleware Invocations
  9.5K / 1M
  1M
  Fast Data Transfer
  536,34 MB / 100 GB
  1 TB
  Fast Origin Transfer
  40,67 MB / 10 GB
  100 GB
  Image Optimization - Transformations
  17 / 5K
  10K
  ISR Reads
  3.4K / 1M
  10M
  Image Optimization - Cache Reads
  807 / 300K
  600K
  Function Invocations
  1.7K / 1M
  1M
  Function Duration
  0.14 GB-Hrs / 100 GB-Hrs
  1,000 GB-Hrs
  Image Optimization - Cache Writes
  89 / 100K
  200K
  Recent Previews
  Preview deployments that you have recently visited or created will appear here.
  Projects

  recoder-chat
  recoder-chat.vercel.app
  caelum0x/recoder.xyz
  No Production Deployment
  3m ago

  app
  recoder.xyz
  caelum0x/recoder.xyz
  No Production Deployment
  2h ago

  recoder-web
  recoder-web.vercel.app
  caelum0x/recoder.xyz
  No Production Deployment
  10m ago

  recoder.xyz
  recoderxyz.vercel.app
  caelum0x/recoder.xyz
  No Production Deployment
  11m ago

⏺ I understand the situation. Looking at your Vercel dashboard, all projects show "No Production Deployment" which means the
  deployments failed or are pending. Let me create a comprehensive plan to fix this properly.

⏺ Update Todos
  ⎿  ☐ Fix Vercel deployments - all projects showing 'No Production Deployment'
     ☐ Deploy main app successfully to Vercel
     ☐ Deploy recoder-web successfully to Vercel
     ☐ Fix recoder-chat component resolution and deploy
     ☐ Deploy backend and production-engine to Render (monorepo approach)
     ☐ Configure custom domains after successful deployments
     ☐ Set up DNS records in Namecheap
  ⎿  Claude usage limit reached. Your limit will reset at 1am (Europe/Istanbul).

      • /upgrade to increase your usage limit.

> render gaved error   ☐ Fix Vercel deployments - all projects showing 'No Production Deployment'
       ☐ Deploy main app successfully to Vercel
       ☐ Deploy recoder-web successfully to Vercel
       ☐ Fix recoder-chat component resolution and deploy
       ☐ Deploy backend and production-engine to Render (monorepo approach)
       ☐ Configure custom domains after successful deployments
       ☐ Set up DNS records in Namecheap  #14 0.254 npm warn config only Use `--omit=dev` to omit dev dependencies from the 
  install.
  #14 68.20 npm error code EUSAGE
  #14 68.20 npm error
  #14 68.20 npm error `npm ci` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in
   sync. Please update your lock file with `npm install` before continuing.
  #14 68.20 npm error
  #14 68.20 npm error Missing: @auth/prisma-adapter@2.10.0 from lock file
  #14 68.20 npm error Missing: @prisma/client@6.14.0 from lock file
  #14 68.20 npm error Missing: @types/react@19.1.11 from lock file
  #14 68.20 npm error Missing: next-auth@4.24.11 from lock file
  #14 68.20 npm error Missing: prisma@5.22.0 from lock file
  #14 68.20 npm error Missing: @playwright/test@1.55.0 from lock file
  #14 68.20 npm error Missing: @jest/types@29.6.3 from lock file
  #14 68.20 npm error Missing: @panva/hkdf@1.2.1 from lock file
  #14 68.20 npm error Missing: preact@10.24.3 from lock file
  #14 68.20 npm error Missing: @aws-crypto/sha256-js@5.2.0 from lock file
  #14 68.20 npm error Missing: @smithy/eventstream-serde-node@4.0.5 from lock file
  #14 68.20 npm error Missing: @smithy/protocol-http@5.1.3 from lock file
  #14 68.20 npm error Missing: @smithy/smithy-client@4.4.10 from lock file
  #14 68.20 npm error Missing: @smithy/types@4.3.2 from lock file
  #14 68.20 npm error Missing: @smithy/util-base64@4.0.0 from lock file
  #14 68.20 npm error Missing: @aws-crypto/util@5.2.0 from lock file
  #14 68.20 npm error Missing: @smithy/util-utf8@2.3.0 from lock file
  #14 68.20 npm error Missing: @smithy/signature-v4@5.1.3 from lock file
  #14 68.20 npm error Missing: @jest/transform@29.7.0 from lock file
  #14 68.20 npm error Missing: ci-info@3.9.0 from lock file
  #14 68.20 npm error Missing: jest-haste-map@29.7.0 from lock file
  #14 68.20 npm error Missing: jest-regex-util@29.6.3 from lock file
  #14 68.20 npm error Missing: jest-resolve@29.7.0 from lock file
  #14 68.20 npm error Missing: jest-util@29.7.0 from lock file
  #14 68.20 npm error Missing: jest-validate@29.7.0 from lock file
  #14 68.20 npm error Missing: pretty-format@29.7.0 from lock file
  #14 68.20 npm error Missing: jest-worker@29.7.0 from lock file
  #14 68.20 npm error Missing: babel-plugin-istanbul@6.1.1 from lock file
  #14 68.20 npm error Missing: write-file-atomic@4.0.2 from lock file
  #14 68.20 npm error Missing: @jest/schemas@29.6.3 from lock file
  #14 68.20 npm error Missing: @sinclair/typebox@0.27.8 from lock file
  #14 68.20 npm error Missing: playwright@1.55.0 from lock file
  #14 68.20 npm error Missing: yallist@4.0.0 from lock file
  #14 68.20 npm error Missing: csstype@3.1.3 from lock file
  #14 68.20 npm error Missing: istanbul-lib-instrument@5.2.1 from lock file
  #14 68.20 npm error Missing: jest-get-type@29.6.3 from lock file
  #14 68.20 npm error Missing: htmlparser2@8.0.2 from lock file
  #14 68.20 npm error Missing: @types/graceful-fs@4.1.9 from lock file
  #14 68.20 npm error Missing: camelcase@6.3.0 from lock file
  #14 68.20 npm error Missing: supports-color@8.1.1 from lock file
  #14 68.20 npm error Missing: @auth/core@0.34.2 from lock file
  #14 68.20 npm error Missing: jose@4.15.9 from lock file
  #14 68.20 npm error Missing: oauth@0.9.15 from lock file
  #14 68.20 npm error Missing: openid-client@5.7.1 from lock file
  #14 68.20 npm error Missing: preact-render-to-string@5.2.6 from lock file
  #14 68.20 npm error Missing: uuid@8.3.2 from lock file
  #14 68.20 npm error Missing: @types/cookie@0.6.0 from lock file
  #14 68.20 npm error Missing: cookie@0.6.0 from lock file
  #14 68.20 npm error Missing: jose@5.10.0 from lock file
  #14 68.20 npm error Missing: oauth4webapi@2.17.0 from lock file
  #14 68.20 npm error Missing: preact@10.11.3 from lock file
  #14 68.20 npm error Missing: preact-render-to-string@5.2.3 from lock file
  #14 68.20 npm error Missing: @auth/core@0.40.0 from lock file
  #14 68.20 npm error Missing: lru-cache@6.0.0 from lock file
  #14 68.20 npm error Missing: object-hash@2.2.0 from lock file
  #14 68.20 npm error Missing: oidc-token-hash@5.1.1 from lock file
  #14 68.20 npm error Missing: fsevents@2.3.2 from lock file
  #14 68.20 npm error Missing: playwright-core@1.55.0 from lock file
  #14 68.20 npm error Missing: pretty-format@3.8.0 from lock file
  #14 68.20 npm error Missing: ansi-styles@5.2.0 from lock file
  #14 68.20 npm error Missing: @prisma/engines@5.22.0 from lock file
  #14 68.20 npm error Missing: @prisma/debug@5.22.0 from lock file
  #14 68.20 npm error Missing: @prisma/engines-version@5.22.0-44.605197351a3c8bdd595af2d2a9bc3025bca48ea2 from lock file
  #14 68.20 npm error Missing: @prisma/fetch-engine@5.22.0 from lock file
  #14 68.20 npm error Missing: @prisma/get-platform@5.22.0 from lock file
  #14 68.20 npm error Missing: bufferutil@4.0.9 from lock file
  #14 68.20 npm error Missing: utf-8-validate@5.0.10 from lock file
  #14 68.20 npm error Missing: node-gyp-build@4.8.4 from lock file
  #14 68.20 npm error Missing: pretty-format@3.8.0 from lock file
  #14 68.20 npm error Missing: jose@6.0.13 from lock file
  #14 68.20 npm error Missing: oauth4webapi@3.7.0 from lock file
  #14 68.20 npm error Missing: preact-render-to-string@6.5.11 from lock file
  #14 68.20 npm error Missing: @smithy/util-buffer-from@2.2.0 from lock file
  #14 68.20 npm error Missing: @smithy/is-array-buffer@2.2.0 from lock file
  #14 68.20 npm error Missing: babel-jest@29.7.0 from lock file
  #14 68.20 npm error Missing: babel-preset-jest@29.6.3 from lock file
  #14 68.20 npm error Missing: babel-plugin-jest-hoist@29.6.3 from lock file
  #14 68.20 npm error Missing: semver@6.3.1 from lock file
  #14 68.20 npm error Invalid: lock file's @jridgewell/sourcemap-codec@1.5.4 does not satisfy @jridgewell/sourcemap-codec@1.5.5
  #14 68.20 npm error
  #14 68.20 npm error Clean install a project
  #14 68.20 npm error
  #14 68.20 npm error Usage:
  #14 68.20 npm error npm ci
  #14 68.20 npm error
  #14 68.20 npm error Options:
  #14 68.20 npm error [--install-strategy <hoisted|nested|shallow|linked>] [--legacy-bundling]
  #14 68.20 npm error [--global-style] [--omit <dev|optional|peer> [--omit <dev|optional|peer> ...]]
  #14 68.20 npm error [--include <prod|dev|optional|peer> [--include <prod|dev|optional|peer> ...]]
  #14 68.20 npm error [--strict-peer-deps] [--foreground-scripts] [--ignore-scripts] [--no-audit]
  #14 68.20 npm error [--no-bin-links] [--no-fund] [--dry-run]
  #14 68.20 npm error [-w|--workspace <workspace-name> [-w|--workspace <workspace-name> ...]]
  #14 68.20 npm error [-ws|--workspaces] [--include-workspace-root] [--install-links]
  #14 68.20 npm error
  #14 68.20 npm error aliases: clean-install, ic, install-clean, isntall-clean
  #14 68.20 npm error
  #14 68.20 npm error Run "npm help ci" for more info
  #14 68.20 npm notice
  #14 68.20 npm notice New major version of npm available! 10.8.2 -> 11.5.2
  #14 68.20 npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.5.2
  #14 68.20 npm notice To update run: npm install -g npm@11.5.2
  #14 68.20 npm notice
  #14 68.20 npm error A complete log of this run can be found in: /root/.npm/_logs/2025-08-23T18_56_19_416Z-debug-0.log
  #14 ERROR: process "/bin/sh -c npm ci --only=production" did not complete successfully: exit code: 1
  ------
   > [base 9/9] RUN npm ci --only=production:
  68.20 npm error
  68.20 npm error aliases: clean-install, ic, install-clean, isntall-clean
  68.20 npm error
  68.20 npm error Run "npm help ci" for more info
  68.20 npm notice
  68.20 npm notice New major version of npm available! 10.8.2 -> 11.5.2
  68.20 npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.5.2
  68.20 npm notice To update run: npm install -g npm@11.5.2
  68.20 npm notice
  68.20 npm error A complete log of this run can be found in: /root/.npm/_logs/2025-08-23T18_56_19_416Z-debug-0.log
  ------
  Dockerfile:27
  --------------------
    25 |     
    26 |     # Install dependencies
    27 | >>> RUN npm ci --only=production
    28 |     
    29 |     #====================================
  --------------------
  error: failed to solve: process "/bin/sh -c npm ci --only=production" did not complete successfully: exit code: 1
  error: exit status 1
    I did not added dns stuff from name cheap also got confused for render due to our whole porject is mono repo could not direct 
    copy my backend and production engine to render so I just clonedn my entire rpository to render recoder web and recoder chat 
    still gives error when I click on them 404: NOT_FOUND
    Code: DEPLOYMENT_NOT_FOUND
    ID: fra1::7nnxq-1755975342050-a121264d933b  make a plan 
    Last 30 days
    Updated 1m ago
    Edge Requests
    42K / 1M
    10M
    Edge Middleware Invocations
    9.5K / 1M
    1M
    Fast Data Transfer
    536,34 MB / 100 GB
    1 TB
    Fast Origin Transfer
    40,67 MB / 10 GB
    100 GB
    Image Optimization - Transformations
    17 / 5K
    10K
    ISR Reads
    3.4K / 1M
    10M
    Image Optimization - Cache Reads
    807 / 300K
    600K
    Function Invocations
    1.7K / 1M
    1M
    Function Duration
    0.14 GB-Hrs / 100 GB-Hrs
    1,000 GB-Hrs
    Image Optimization - Cache Writes
    89 / 100K
    200K
    Recent Previews
    Preview deployments that you have recently visited or created will appear here.
    Projects

    recoder-chat
    recoder-chat.vercel.app
    caelum0x/recoder.xyz
    No Production Deployment
    3m ago

    app
    recoder.xyz
    caelum0x/recoder.xyz
    No Production Deployment
    2h ago

    recoder-web
    recoder-web.vercel.app
    caelum0x/recoder.xyz
    No Production Deployment
    10m ago

    recoder.xyz
    recoderxyz.vercel.app
    caelum0x/recoder.xyz
    No Production Deployment
    11m ago
     npx vercel --prod
Vercel CLI 46.0.2
❗️  The `name` property in vercel.json is deprecated (https://vercel.link/name-prop)
Error: The `functions` property cannot be used in conjunction with the `builds` property. Please remove one of them.
Learn More: https://vercel.link/functions-and-builds
arhansubasi@Arhan-MacBook-Air recoder.xyz % 
arhansubasi@Arhan-MacBook-Air recoder.xyz % cd recoder-chat
arhansubasi@Arhan-MacBook-Air recoder-chat % npx vercel --prod
Vercel CLI 46.0.2
🔍  Inspect: https://vercel.com/arhansubas-projects/recoder-chat/HgaqjGoC5c5hmzzqNoR7DvqF3CTU [2s]
✅  Production: https://recoder-chat-e64ax197u-arhansubas-projects.vercel.app [2s]
Error: Command "tsx lib/db/migrate && next build" exited with 1

2025-08-23T19:01:08.559Z  Running build in Washington, D.C., USA (East) – iad1
2025-08-23T19:01:08.559Z  Build machine configuration: 2 cores, 8 GB
2025-08-23T19:01:08.589Z  Retrieving list of deployment files...
2025-08-23T19:01:08.684Z  Previous build caches not available
2025-08-23T19:01:09.089Z  Downloading 191 deployment files...
2025-08-23T19:01:10.398Z  Running "vercel build"
2025-08-23T19:01:10.786Z  Vercel CLI 46.0.2
2025-08-23T19:01:10.934Z  Detected OpenTelemetry dependency: @vercel/otel@1.12.0, which meets the minimum version requirement of 1.11.0
2025-08-23T19:01:11.243Z  Detected `pnpm-lock.yaml` version 9 generated by pnpm@10.x with package.json#packageManager pnpm@9.12.3
2025-08-23T19:01:11.251Z  Running "install" command: `npm ci --force`...
2025-08-23T19:01:11.547Z  npm warn using --force Recommended protections disabled.
2025-08-23T19:01:14.151Z  npm warn ERESOLVE overriding peer dependency
2025-08-23T19:01:14.152Z  npm warn While resolving: @floating-ui/react-dom@2.1.5
2025-08-23T19:01:14.153Z  npm warn Found: react@19.0.0-rc-45804af1-20241021
2025-08-23T19:01:14.153Z  npm warn node_modules/react
2025-08-23T19:01:14.153Z  npm warn   react@"19.0.0-rc-45804af1-20241021" from the root project
2025-08-23T19:01:14.154Z  npm warn   46 more (@ai-sdk/react, @radix-ui/react-alert-dialog, ...)
2025-08-23T19:01:14.154Z  npm warn
2025-08-23T19:01:14.154Z  npm warn Could not resolve dependency:
2025-08-23T19:01:14.155Z  npm warn peer react@">=16.8.0" from @floating-ui/react-dom@2.1.5
2025-08-23T19:01:14.155Z  npm warn node_modules/@floating-ui/react-dom
2025-08-23T19:01:14.155Z  npm warn   @floating-ui/react-dom@"^2.0.0" from @radix-ui/react-popper@1.2.7
2025-08-23T19:01:14.156Z  npm warn   node_modules/@radix-ui/react-popper
2025-08-23T19:01:14.156Z  npm warn
2025-08-23T19:01:14.156Z  npm warn Conflicting peer dependency: react@19.1.1
2025-08-23T19:01:14.156Z  npm warn node_modules/react
2025-08-23T19:01:14.157Z  npm warn   peer react@">=16.8.0" from @floating-ui/react-dom@2.1.5
2025-08-23T19:01:14.157Z  npm warn   node_modules/@floating-ui/react-dom
2025-08-23T19:01:14.157Z  npm warn     @floating-ui/react-dom@"^2.0.0" from @radix-ui/react-popper@1.2.7
2025-08-23T19:01:14.157Z  npm warn     node_modules/@radix-ui/react-popper
2025-08-23T19:01:14.168Z  npm warn ERESOLVE overriding peer dependency
2025-08-23T19:01:14.169Z  npm warn While resolving: @floating-ui/react-dom@2.1.5
2025-08-23T19:01:14.170Z  npm warn Found: react-dom@19.0.0-rc-45804af1-20241021
2025-08-23T19:01:14.170Z  npm warn node_modules/react-dom
2025-08-23T19:01:14.171Z  npm warn   react-dom@"19.0.0-rc-45804af1-20241021" from the root project
2025-08-23T19:01:14.171Z  npm warn   20 more (@radix-ui/react-alert-dialog, @radix-ui/react-arrow, ...)
2025-08-23T19:01:14.171Z  npm warn
2025-08-23T19:01:14.172Z  npm warn Could not resolve dependency:
2025-08-23T19:01:14.172Z  npm warn peer react-dom@">=16.8.0" from @floating-ui/react-dom@2.1.5
2025-08-23T19:01:14.173Z  npm warn node_modules/@floating-ui/react-dom
2025-08-23T19:01:14.173Z  npm warn   @floating-ui/react-dom@"^2.0.0" from @radix-ui/react-popper@1.2.7
2025-08-23T19:01:14.173Z  npm warn   node_modules/@radix-ui/react-popper
2025-08-23T19:01:14.173Z  npm warn
2025-08-23T19:01:14.174Z  npm warn Conflicting peer dependency: react-dom@19.1.1
2025-08-23T19:01:14.174Z  npm warn node_modules/react-dom
2025-08-23T19:01:14.174Z  npm warn   peer react-dom@">=16.8.0" from @floating-ui/react-dom@2.1.5
2025-08-23T19:01:14.175Z  npm warn   node_modules/@floating-ui/react-dom
2025-08-23T19:01:14.175Z  npm warn     @floating-ui/react-dom@"^2.0.0" from @radix-ui/react-popper@1.2.7
2025-08-23T19:01:14.175Z  npm warn     node_modules/@radix-ui/react-popper
2025-08-23T19:01:15.616Z  npm warn ERESOLVE overriding peer dependency
2025-08-23T19:01:15.617Z  npm warn While resolving: @vercel/analytics@1.5.0
2025-08-23T19:01:15.618Z  npm warn Found: next@15.3.0-canary.31
2025-08-23T19:01:15.618Z  npm warn node_modules/next
2025-08-23T19:01:15.618Z  npm warn   next@"15.3.0-canary.31" from the root project
2025-08-23T19:01:15.618Z  npm warn
2025-08-23T19:01:15.618Z  npm warn Could not resolve dependency:
2025-08-23T19:01:15.619Z  npm warn peerOptional next@">= 13" from @vercel/analytics@1.5.0
2025-08-23T19:01:15.619Z  npm warn node_modules/@vercel/analytics
2025-08-23T19:01:15.619Z  npm warn   @vercel/analytics@"^1.3.1" from the root project
2025-08-23T19:01:15.620Z  npm warn
2025-08-23T19:01:15.620Z  npm warn Conflicting peer dependency: next@15.5.0
2025-08-23T19:01:15.620Z  npm warn node_modules/next
2025-08-23T19:01:15.621Z  npm warn   peerOptional next@">= 13" from @vercel/analytics@1.5.0
2025-08-23T19:01:15.621Z  npm warn   node_modules/@vercel/analytics
2025-08-23T19:01:15.621Z  npm warn     @vercel/analytics@"^1.3.1" from the root project
2025-08-23T19:01:15.704Z  npm warn ERESOLVE overriding peer dependency
2025-08-23T19:01:15.705Z  npm warn While resolving: @vercel/otel@1.13.0
2025-08-23T19:01:15.705Z  npm warn Found: @opentelemetry/api-logs@0.200.0
2025-08-23T19:01:15.705Z  npm warn node_modules/@opentelemetry/api-logs
2025-08-23T19:01:15.705Z  npm warn   @opentelemetry/api-logs@"^0.200.0" from the root project
2025-08-23T19:01:15.705Z  npm warn
2025-08-23T19:01:15.705Z  npm warn Could not resolve dependency:
2025-08-23T19:01:15.705Z  npm warn peer @opentelemetry/api-logs@">=0.46.0 <0.200.0" from @vercel/otel@1.13.0
2025-08-23T19:01:15.706Z  npm warn node_modules/@vercel/otel
2025-08-23T19:01:15.706Z  npm warn   @vercel/otel@"^1.12.0" from the root project
2025-08-23T19:01:15.706Z  npm warn
2025-08-23T19:01:15.706Z  npm warn Conflicting peer dependency: @opentelemetry/api-logs@0.57.2
2025-08-23T19:01:15.706Z  npm warn node_modules/@opentelemetry/api-logs
2025-08-23T19:01:15.706Z  npm warn   peer @opentelemetry/api-logs@">=0.46.0 <0.200.0" from @vercel/otel@1.13.0
2025-08-23T19:01:15.706Z  npm warn   node_modules/@vercel/otel
2025-08-23T19:01:15.706Z  npm warn     @vercel/otel@"^1.12.0" from the root project
2025-08-23T19:01:15.763Z  npm warn ERESOLVE overriding peer dependency
2025-08-23T19:01:15.764Z  npm warn While resolving: drizzle-orm@0.34.1
2025-08-23T19:01:15.765Z  npm warn Found: react@19.0.0-rc-45804af1-20241021
2025-08-23T19:01:15.768Z  npm warn node_modules/react
2025-08-23T19:01:15.768Z  npm warn   react@"19.0.0-rc-45804af1-20241021" from the root project
2025-08-23T19:01:15.769Z  npm warn   46 more (@ai-sdk/react, @radix-ui/react-alert-dialog, ...)
2025-08-23T19:01:15.769Z  npm warn
2025-08-23T19:01:15.769Z  npm warn Could not resolve dependency:
2025-08-23T19:01:15.770Z  npm warn peerOptional react@">=18" from drizzle-orm@0.34.1
2025-08-23T19:01:15.770Z  npm warn node_modules/drizzle-orm
2025-08-23T19:01:15.770Z  npm warn   drizzle-orm@"^0.34.1" from the root project
2025-08-23T19:01:15.770Z  npm warn
2025-08-23T19:01:15.770Z  npm warn Conflicting peer dependency: react@19.1.1
2025-08-23T19:01:15.770Z  npm warn node_modules/react
2025-08-23T19:01:15.771Z  npm warn   peerOptional react@">=18" from drizzle-orm@0.34.1
2025-08-23T19:01:15.771Z  npm warn   node_modules/drizzle-orm
2025-08-23T19:01:15.771Z  npm warn     drizzle-orm@"^0.34.1" from the root project
2025-08-23T19:01:15.926Z  npm warn ERESOLVE overriding peer dependency
2025-08-23T19:01:15.926Z  npm warn While resolving: framer-motion@11.18.2
2025-08-23T19:01:15.926Z  npm warn Found: react@19.0.0-rc-45804af1-20241021
2025-08-23T19:01:15.926Z  npm warn node_modules/react
2025-08-23T19:01:15.926Z  npm warn   react@"19.0.0-rc-45804af1-20241021" from the root project
2025-08-23T19:01:15.926Z  npm warn   46 more (@ai-sdk/react, @radix-ui/react-alert-dialog, ...)
2025-08-23T19:01:15.926Z  npm warn
2025-08-23T19:01:15.926Z  npm warn Could not resolve dependency:
2025-08-23T19:01:15.926Z  npm warn peerOptional react@"^18.0.0 || ^19.0.0" from framer-motion@11.18.2
2025-08-23T19:01:15.926Z  npm warn node_modules/framer-motion
2025-08-23T19:01:15.926Z  npm warn   framer-motion@"^11.3.19" from the root project
2025-08-23T19:01:15.927Z  npm warn
2025-08-23T19:01:15.927Z  npm warn Conflicting peer dependency: react@19.1.1
2025-08-23T19:01:15.927Z  npm warn node_modules/react
2025-08-23T19:01:15.927Z  npm warn   peerOptional react@"^18.0.0 || ^19.0.0" from framer-motion@11.18.2
2025-08-23T19:01:15.927Z  npm warn   node_modules/framer-motion
2025-08-23T19:01:15.927Z  npm warn     framer-motion@"^11.3.19" from the root project
2025-08-23T19:01:15.943Z  npm warn ERESOLVE overriding peer dependency
2025-08-23T19:01:15.943Z  npm warn While resolving: framer-motion@11.18.2
2025-08-23T19:01:15.944Z  npm warn Found: react-dom@19.0.0-rc-45804af1-20241021
2025-08-23T19:01:15.944Z  npm warn node_modules/react-dom
2025-08-23T19:01:15.944Z  npm warn   react-dom@"19.0.0-rc-45804af1-20241021" from the root project
2025-08-23T19:01:15.944Z  npm warn   20 more (@radix-ui/react-alert-dialog, @radix-ui/react-arrow, ...)
2025-08-23T19:01:15.944Z  npm warn
2025-08-23T19:01:15.944Z  npm warn Could not resolve dependency:
2025-08-23T19:01:15.945Z  npm warn peerOptional react-dom@"^18.0.0 || ^19.0.0" from framer-motion@11.18.2
2025-08-23T19:01:15.945Z  npm warn node_modules/framer-motion
2025-08-23T19:01:15.945Z  npm warn   framer-motion@"^11.3.19" from the root project
2025-08-23T19:01:15.945Z  npm warn
2025-08-23T19:01:15.945Z  npm warn Conflicting peer dependency: react-dom@19.1.1
2025-08-23T19:01:15.945Z  npm warn node_modules/react-dom
2025-08-23T19:01:15.946Z  npm warn   peerOptional react-dom@"^18.0.0 || ^19.0.0" from framer-motion@11.18.2
2025-08-23T19:01:15.946Z  npm warn   node_modules/framer-motion
2025-08-23T19:01:15.946Z  npm warn     framer-motion@"^11.3.19" from the root project
2025-08-23T19:01:16.313Z  npm warn ERESOLVE overriding peer dependency
2025-08-23T19:01:16.314Z  npm warn While resolving: geist@1.4.2
2025-08-23T19:01:16.314Z  npm warn Found: next@15.3.0-canary.31
2025-08-23T19:01:16.314Z  npm warn node_modules/next
2025-08-23T19:01:16.314Z  npm warn   next@"15.3.0-canary.31" from the root project
2025-08-23T19:01:16.314Z  npm warn
2025-08-23T19:01:16.314Z  npm warn Could not resolve dependency:
2025-08-23T19:01:16.314Z  npm warn peer next@">=13.2.0" from geist@1.4.2
2025-08-23T19:01:16.314Z  npm warn node_modules/geist
2025-08-23T19:01:16.314Z  npm warn   geist@"^1.3.1" from the root project
2025-08-23T19:01:16.314Z  npm warn
2025-08-23T19:01:16.314Z  npm warn Conflicting peer dependency: next@15.5.0
2025-08-23T19:01:16.315Z  npm warn node_modules/next
2025-08-23T19:01:16.315Z  npm warn   peer next@">=13.2.0" from geist@1.4.2
2025-08-23T19:01:16.315Z  npm warn   node_modules/geist
2025-08-23T19:01:16.315Z  npm warn     geist@"^1.3.1" from the root project
2025-08-23T19:01:16.333Z  npm warn ERESOLVE overriding peer dependency
2025-08-23T19:01:16.334Z  npm warn While resolving: next@15.3.0-canary.31
2025-08-23T19:01:16.334Z  npm warn Found: react@19.0.0-rc-45804af1-20241021
2025-08-23T19:01:16.335Z  npm warn node_modules/react
2025-08-23T19:01:16.335Z  npm warn   react@"19.0.0-rc-45804af1-20241021" from the root project
2025-08-23T19:01:16.335Z  npm warn   46 more (@ai-sdk/react, @radix-ui/react-alert-dialog, ...)
2025-08-23T19:01:16.336Z  npm warn
2025-08-23T19:01:16.336Z  npm warn Could not resolve dependency:
2025-08-23T19:01:16.336Z  npm warn peer react@"^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0" from next@15.3.0-canary.31
2025-08-23T19:01:16.336Z  npm warn node_modules/next
2025-08-23T19:01:16.337Z  npm warn   next@"15.3.0-canary.31" from the root project
2025-08-23T19:01:16.337Z  npm warn
2025-08-23T19:01:16.337Z  npm warn Conflicting peer dependency: react@19.1.1
2025-08-23T19:01:16.337Z  npm warn node_modules/react
2025-08-23T19:01:16.338Z  npm warn   peer react@"^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0" from next@15.3.0-canary.31
2025-08-23T19:01:16.338Z  npm warn   node_modules/next
2025-08-23T19:01:16.338Z  npm warn     next@"15.3.0-canary.31" from the root project
2025-08-23T19:01:16.364Z  npm warn ERESOLVE overriding peer dependency
2025-08-23T19:01:16.365Z  npm warn While resolving: next@15.3.0-canary.31
2025-08-23T19:01:16.365Z  npm warn Found: react-dom@19.0.0-rc-45804af1-20241021
2025-08-23T19:01:16.366Z  npm warn node_modules/react-dom
2025-08-23T19:01:16.366Z  npm warn   react-dom@"19.0.0-rc-45804af1-20241021" from the root project
2025-08-23T19:01:16.366Z  npm warn   20 more (@radix-ui/react-alert-dialog, @radix-ui/react-arrow, ...)
2025-08-23T19:01:16.366Z  npm warn
2025-08-23T19:01:16.366Z  npm warn Could not resolve dependency:
2025-08-23T19:01:16.366Z  npm warn peer react-dom@"^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0" from next@15.3.0-canary.31
2025-08-23T19:01:16.366Z  npm warn node_modules/next
2025-08-23T19:01:16.366Z  npm warn   next@"15.3.0-canary.31" from the root project
2025-08-23T19:01:16.366Z  npm warn
2025-08-23T19:01:16.366Z  npm warn Conflicting peer dependency: react-dom@19.1.1
2025-08-23T19:01:16.366Z  npm warn node_modules/react-dom
2025-08-23T19:01:16.366Z  npm warn   peer react-dom@"^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0" from next@15.3.0-canary.31
2025-08-23T19:01:16.366Z  npm warn   node_modules/next
2025-08-23T19:01:16.366Z  npm warn     next@"15.3.0-canary.31" from the root project
2025-08-23T19:01:16.731Z  npm warn ERESOLVE overriding peer dependency
2025-08-23T19:01:16.736Z  npm warn While resolving: next-auth@5.0.0-beta.25
2025-08-23T19:01:16.737Z  npm warn Found: next@15.3.0-canary.31
2025-08-23T19:01:16.737Z  npm warn node_modules/next
2025-08-23T19:01:16.737Z  npm warn   next@"15.3.0-canary.31" from the root project
2025-08-23T19:01:16.738Z  npm warn
2025-08-23T19:01:16.738Z  npm warn Could not resolve dependency:
2025-08-23T19:01:16.738Z  npm warn peer next@"^14.0.0-0 || ^15.0.0-0" from next-auth@5.0.0-beta.25
2025-08-23T19:01:16.738Z  npm warn node_modules/next-auth
2025-08-23T19:01:16.738Z  npm warn   next-auth@"5.0.0-beta.25" from the root project
2025-08-23T19:01:16.738Z  npm warn
2025-08-23T19:01:16.738Z  npm warn Conflicting peer dependency: next@15.5.0
2025-08-23T19:01:16.739Z  npm warn node_modules/next
2025-08-23T19:01:16.739Z  npm warn   peer next@"^14.0.0-0 || ^15.0.0-0" from next-auth@5.0.0-beta.25
2025-08-23T19:01:16.739Z  npm warn   node_modules/next-auth
2025-08-23T19:01:16.739Z  npm warn     next-auth@"5.0.0-beta.25" from the root project
2025-08-23T19:01:16.919Z  npm warn ERESOLVE overriding peer dependency
2025-08-23T19:01:16.920Z  npm warn While resolving: next-themes@0.3.0
2025-08-23T19:01:16.920Z  npm warn Found: react@19.0.0-rc-45804af1-20241021
2025-08-23T19:01:16.920Z  npm warn node_modules/react
2025-08-23T19:01:16.920Z  npm warn   react@"19.0.0-rc-45804af1-20241021" from the root project
2025-08-23T19:01:16.920Z  npm warn   46 more (@ai-sdk/react, @radix-ui/react-alert-dialog, ...)
2025-08-23T19:01:16.921Z  npm warn
2025-08-23T19:01:16.921Z  npm warn Could not resolve dependency:
2025-08-23T19:01:16.921Z  npm warn peer react@"^16.8 || ^17 || ^18" from next-themes@0.3.0
2025-08-23T19:01:16.921Z  npm warn node_modules/next-themes
2025-08-23T19:01:16.921Z  npm warn   next-themes@"^0.3.0" from the root project
2025-08-23T19:01:16.921Z  npm warn
2025-08-23T19:01:16.921Z  npm warn Conflicting peer dependency: react@18.3.1
2025-08-23T19:01:16.922Z  npm warn node_modules/react
2025-08-23T19:01:16.922Z  npm warn   peer react@"^16.8 || ^17 || ^18" from next-themes@0.3.0
2025-08-23T19:01:16.922Z  npm warn   node_modules/next-themes
2025-08-23T19:01:16.922Z  npm warn     next-themes@"^0.3.0" from the root project
2025-08-23T19:01:16.933Z  npm warn ERESOLVE overriding peer dependency
2025-08-23T19:01:16.933Z  npm warn While resolving: next-themes@0.3.0
2025-08-23T19:01:16.933Z  npm warn Found: react-dom@19.0.0-rc-45804af1-20241021
2025-08-23T19:01:16.933Z  npm warn node_modules/react-dom
2025-08-23T19:01:16.933Z  npm warn   react-dom@"19.0.0-rc-45804af1-20241021" from the root project
2025-08-23T19:01:16.933Z  npm warn   20 more (@radix-ui/react-alert-dialog, @radix-ui/react-arrow, ...)
2025-08-23T19:01:16.933Z  npm warn
2025-08-23T19:01:16.933Z  npm warn Could not resolve dependency:
2025-08-23T19:01:16.934Z  npm warn peer react-dom@"^16.8 || ^17 || ^18" from next-themes@0.3.0
2025-08-23T19:01:16.934Z  npm warn node_modules/next-themes
2025-08-23T19:01:16.934Z  npm warn   next-themes@"^0.3.0" from the root project
2025-08-23T19:01:16.934Z  npm warn
2025-08-23T19:01:16.934Z  npm warn Conflicting peer dependency: react-dom@18.3.1
2025-08-23T19:01:16.935Z  npm warn node_modules/react-dom
2025-08-23T19:01:16.935Z  npm warn   peer react-dom@"^16.8 || ^17 || ^18" from next-themes@0.3.0
2025-08-23T19:01:16.935Z  npm warn   node_modules/next-themes
2025-08-23T19:01:16.935Z  npm warn     next-themes@"^0.3.0" from the root project
2025-08-23T19:01:17.077Z  npm warn ERESOLVE overriding peer dependency
2025-08-23T19:01:17.077Z  npm warn While resolving: react-data-grid@7.0.0-beta.47
2025-08-23T19:01:17.078Z  npm warn Found: react@19.0.0-rc-45804af1-20241021
2025-08-23T19:01:17.078Z  npm warn node_modules/react
2025-08-23T19:01:17.079Z  npm warn   react@"19.0.0-rc-45804af1-20241021" from the root project
2025-08-23T19:01:17.079Z  npm warn   46 more (@ai-sdk/react, @radix-ui/react-alert-dialog, ...)
2025-08-23T19:01:17.079Z  npm warn
2025-08-23T19:01:17.080Z  npm warn Could not resolve dependency:
2025-08-23T19:01:17.080Z  npm warn peer react@"^18.0 || ^19.0" from react-data-grid@7.0.0-beta.47
2025-08-23T19:01:17.080Z  npm warn node_modules/react-data-grid
2025-08-23T19:01:17.081Z  npm warn   react-data-grid@"7.0.0-beta.47" from the root project
2025-08-23T19:01:17.081Z  npm warn
2025-08-23T19:01:17.081Z  npm warn Conflicting peer dependency: react@19.1.1
2025-08-23T19:01:17.081Z  npm warn node_modules/react
2025-08-23T19:01:17.082Z  npm warn   peer react@"^18.0 || ^19.0" from react-data-grid@7.0.0-beta.47
2025-08-23T19:01:17.082Z  npm warn   node_modules/react-data-grid
2025-08-23T19:01:17.082Z  npm warn     react-data-grid@"7.0.0-beta.47" from the root project
2025-08-23T19:01:17.086Z  npm warn ERESOLVE overriding peer dependency
2025-08-23T19:01:17.089Z  npm warn While resolving: react-data-grid@7.0.0-beta.47
2025-08-23T19:01:17.089Z  npm warn Found: react-dom@19.0.0-rc-45804af1-20241021
2025-08-23T19:01:17.089Z  npm warn node_modules/react-dom
2025-08-23T19:01:17.089Z  npm warn   react-dom@"19.0.0-rc-45804af1-20241021" from the root project
2025-08-23T19:01:17.089Z  npm warn   20 more (@radix-ui/react-alert-dialog, @radix-ui/react-arrow, ...)
2025-08-23T19:01:17.089Z  npm warn
2025-08-23T19:01:17.090Z  npm warn Could not resolve dependency:
2025-08-23T19:01:17.090Z  npm warn peer react-dom@"^18.0 || ^19.0" from react-data-grid@7.0.0-beta.47
2025-08-23T19:01:17.090Z  npm warn node_modules/react-data-grid
2025-08-23T19:01:17.090Z  npm warn   react-data-grid@"7.0.0-beta.47" from the root project
2025-08-23T19:01:17.090Z  npm warn
2025-08-23T19:01:17.090Z  npm warn Conflicting peer dependency: react-dom@19.1.1
2025-08-23T19:01:17.090Z  npm warn node_modules/react-dom
2025-08-23T19:01:17.090Z  npm warn   peer react-dom@"^18.0 || ^19.0" from react-data-grid@7.0.0-beta.47
2025-08-23T19:01:17.090Z  npm warn   node_modules/react-data-grid
2025-08-23T19:01:17.090Z  npm warn     react-data-grid@"7.0.0-beta.47" from the root project
2025-08-23T19:01:17.103Z  npm warn ERESOLVE overriding peer dependency
2025-08-23T19:01:17.104Z  npm warn While resolving: react-markdown@9.1.0
2025-08-23T19:01:17.104Z  npm warn Found: react@19.0.0-rc-45804af1-20241021
2025-08-23T19:01:17.104Z  npm warn node_modules/react
2025-08-23T19:01:17.104Z  npm warn   react@"19.0.0-rc-45804af1-20241021" from the root project
2025-08-23T19:01:17.104Z  npm warn   46 more (@ai-sdk/react, @radix-ui/react-alert-dialog, ...)
2025-08-23T19:01:17.105Z  npm warn
2025-08-23T19:01:17.105Z  npm warn Could not resolve dependency:
2025-08-23T19:01:17.105Z  npm warn peer react@">=18" from react-markdown@9.1.0
2025-08-23T19:01:17.105Z  npm warn node_modules/react-markdown
2025-08-23T19:01:17.105Z  npm warn   react-markdown@"^9.0.1" from the root project
2025-08-23T19:01:17.106Z  npm warn
2025-08-23T19:01:17.106Z  npm warn Conflicting peer dependency: react@19.1.1
2025-08-23T19:01:17.106Z  npm warn node_modules/react
2025-08-23T19:01:17.106Z  npm warn   peer react@">=18" from react-markdown@9.1.0
2025-08-23T19:01:17.106Z  npm warn   node_modules/react-markdown
2025-08-23T19:01:17.106Z  npm warn     react-markdown@"^9.0.1" from the root project
2025-08-23T19:01:17.153Z  npm warn ERESOLVE overriding peer dependency
2025-08-23T19:01:17.153Z  npm warn While resolving: react-remove-scroll-bar@2.3.8
2025-08-23T19:01:17.154Z  npm warn Found: react@19.0.0-rc-45804af1-20241021
2025-08-23T19:01:17.154Z  npm warn node_modules/react
2025-08-23T19:01:17.154Z  npm warn   react@"19.0.0-rc-45804af1-20241021" from the root project
2025-08-23T19:01:17.155Z  npm warn   46 more (@ai-sdk/react, @radix-ui/react-alert-dialog, ...)
2025-08-23T19:01:17.155Z  npm warn
2025-08-23T19:01:17.155Z  npm warn Could not resolve dependency:
2025-08-23T19:01:17.155Z  npm warn peer react@"^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0" from react-remove-scroll-bar@2.3.8
2025-08-23T19:01:17.156Z  npm warn node_modules/react-remove-scroll-bar
2025-08-23T19:01:17.156Z  npm warn   react-remove-scroll-bar@"^2.3.7" from react-remove-scroll@2.7.1
2025-08-23T19:01:17.156Z  npm warn   node_modules/react-remove-scroll
2025-08-23T19:01:17.156Z  npm warn
2025-08-23T19:01:17.156Z  npm warn Conflicting peer dependency: react@19.1.1
2025-08-23T19:01:17.156Z  npm warn node_modules/react
2025-08-23T19:01:17.156Z  npm warn   peer react@"^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0" from react-remove-scroll-bar@2.3.8
2025-08-23T19:01:17.156Z  npm warn   node_modules/react-remove-scroll-bar
2025-08-23T19:01:17.156Z  npm warn     react-remove-scroll-bar@"^2.3.7" from react-remove-scroll@2.7.1
2025-08-23T19:01:17.156Z  npm warn     node_modules/react-remove-scroll
2025-08-23T19:01:17.206Z  npm warn ERESOLVE overriding peer dependency
2025-08-23T19:01:17.206Z  npm warn While resolving: swr@2.3.5
2025-08-23T19:01:17.206Z  npm warn Found: react@19.0.0-rc-45804af1-20241021
2025-08-23T19:01:17.206Z  npm warn node_modules/react
2025-08-23T19:01:17.206Z  npm warn   react@"19.0.0-rc-45804af1-20241021" from the root project
2025-08-23T19:01:17.206Z  npm warn   46 more (@ai-sdk/react, @radix-ui/react-alert-dialog, ...)
2025-08-23T19:01:17.206Z  npm warn
2025-08-23T19:01:17.207Z  npm warn Could not resolve dependency:
2025-08-23T19:01:17.207Z  npm warn peer react@"^16.11.0 || ^17.0.0 || ^18.0.0 || ^19.0.0" from swr@2.3.5
2025-08-23T19:01:17.207Z  npm warn node_modules/swr
2025-08-23T19:01:17.207Z  npm warn   swr@"^2.2.5" from the root project
2025-08-23T19:01:17.207Z  npm warn   1 more (@ai-sdk/react)
2025-08-23T19:01:17.207Z  npm warn
2025-08-23T19:01:17.207Z  npm warn Conflicting peer dependency: react@19.1.1
2025-08-23T19:01:17.207Z  npm warn node_modules/react
2025-08-23T19:01:17.207Z  npm warn   peer react@"^16.11.0 || ^17.0.0 || ^18.0.0 || ^19.0.0" from swr@2.3.5
2025-08-23T19:01:17.207Z  npm warn   node_modules/swr
2025-08-23T19:01:17.207Z  npm warn     swr@"^2.2.5" from the root project
2025-08-23T19:01:17.207Z  npm warn     1 more (@ai-sdk/react)
2025-08-23T19:01:17.219Z  npm warn ERESOLVE overriding peer dependency
2025-08-23T19:01:17.220Z  npm warn While resolving: use-sync-external-store@1.5.0
2025-08-23T19:01:17.221Z  npm warn Found: react@19.0.0-rc-45804af1-20241021
2025-08-23T19:01:17.221Z  npm warn node_modules/react
2025-08-23T19:01:17.221Z  npm warn   react@"19.0.0-rc-45804af1-20241021" from the root project
2025-08-23T19:01:17.222Z  npm warn   46 more (@ai-sdk/react, @radix-ui/react-alert-dialog, ...)
2025-08-23T19:01:17.222Z  npm warn
2025-08-23T19:01:17.222Z  npm warn Could not resolve dependency:
2025-08-23T19:01:17.223Z  npm warn peer react@"^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0" from use-sync-external-store@1.5.0
2025-08-23T19:01:17.223Z  npm warn node_modules/use-sync-external-store
2025-08-23T19:01:17.224Z  npm warn   use-sync-external-store@"^1.4.0" from swr@2.3.5
2025-08-23T19:01:17.224Z  npm warn   node_modules/swr
2025-08-23T19:01:17.224Z  npm warn
2025-08-23T19:01:17.224Z  npm warn Conflicting peer dependency: react@19.1.1
2025-08-23T19:01:17.225Z  npm warn node_modules/react
2025-08-23T19:01:17.225Z  npm warn   peer react@"^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0" from use-sync-external-store@1.5.0
2025-08-23T19:01:17.225Z  npm warn   node_modules/use-sync-external-store
2025-08-23T19:01:17.225Z  npm warn     use-sync-external-store@"^1.4.0" from swr@2.3.5
2025-08-23T19:01:17.226Z  npm warn     node_modules/swr
2025-08-23T19:01:20.351Z  npm warn deprecated @types/bcryptjs@3.0.0: This is a stub types definition. bcryptjs provides its own type definitions, so you do not need this installed.
2025-08-23T19:01:31.221Z  
2025-08-23T19:01:31.222Z  added 471 packages, and audited 472 packages in 20s
2025-08-23T19:01:31.222Z  
2025-08-23T19:01:31.223Z  136 packages are looking for funding
2025-08-23T19:01:31.223Z    run `npm fund` for details
2025-08-23T19:01:31.224Z  
2025-08-23T19:01:31.225Z  found 0 vulnerabilities
2025-08-23T19:01:31.293Z  Detected Next.js version: 15.3.0-canary.31
2025-08-23T19:01:31.294Z  Running "tsx lib/db/migrate && next build"
2025-08-23T19:01:32.835Z  ⏳ Running migrations...
2025-08-23T19:01:33.965Z  {
2025-08-23T19:01:33.965Z    severity_local: 'NOTICE',
2025-08-23T19:01:33.965Z    severity: 'NOTICE',
2025-08-23T19:01:33.965Z    code: '42P06',
2025-08-23T19:01:33.966Z    message: 'schema "drizzle" already exists, skipping',
2025-08-23T19:01:33.966Z    file: 'schemacmds.c',
2025-08-23T19:01:33.966Z    line: '132',
2025-08-23T19:01:33.966Z    routine: 'CreateSchemaCommand'
2025-08-23T19:01:33.966Z  }
2025-08-23T19:01:34.045Z  {
2025-08-23T19:01:34.046Z    severity_local: 'NOTICE',
2025-08-23T19:01:34.046Z    severity: 'NOTICE',
2025-08-23T19:01:34.046Z    code: '42P07',
2025-08-23T19:01:34.046Z    message: 'relation "__drizzle_migrations" already exists, skipping',
2025-08-23T19:01:34.046Z    file: 'parse_utilcmd.c',
2025-08-23T19:01:34.046Z    line: '207',
2025-08-23T19:01:34.046Z    routine: 'transformCreateStmt'
2025-08-23T19:01:34.046Z  }
2025-08-23T19:01:34.297Z  ✅ Migrations completed in 1461 ms
2025-08-23T19:01:35.438Z  Attention: Next.js now collects completely anonymous telemetry regarding usage.
2025-08-23T19:01:35.440Z  This information is used to shape Next.js' roadmap and prioritize features.
2025-08-23T19:01:35.440Z  You can learn more, including how to opt-out if you'd not like to participate in this anonymous program, by visiting the following URL:
2025-08-23T19:01:35.441Z  https://nextjs.org/telemetry
2025-08-23T19:01:35.441Z  
2025-08-23T19:01:35.722Z     ▲ Next.js 15.3.0-canary.31
2025-08-23T19:01:35.723Z     - Environments: .env.production, .env
2025-08-23T19:01:35.723Z     - Experiments (use with caution):
2025-08-23T19:01:35.723Z       ✓ ppr
2025-08-23T19:01:35.724Z  
2025-08-23T19:01:35.762Z     Creating an optimized production build ...
2025-08-23T19:01:48.508Z  Failed to compile.
2025-08-23T19:01:48.509Z  
2025-08-23T19:01:48.509Z  ./app/(auth)/login/page.tsx
2025-08-23T19:01:48.509Z  Module not found: Can't resolve '@/components/toast'
2025-08-23T19:01:48.509Z  
2025-08-23T19:01:48.509Z  https://nextjs.org/docs/messages/module-not-found
2025-08-23T19:01:48.509Z  
2025-08-23T19:01:48.509Z  ./app/(auth)/login/page.tsx
2025-08-23T19:01:48.509Z  Module not found: Can't resolve '@/components/auth-form'
2025-08-23T19:01:48.509Z  
2025-08-23T19:01:48.509Z  https://nextjs.org/docs/messages/module-not-found
2025-08-23T19:01:48.509Z  
2025-08-23T19:01:48.509Z  ./app/(auth)/login/page.tsx
2025-08-23T19:01:48.509Z  Module not found: Can't resolve '@/components/submit-button'
2025-08-23T19:01:48.509Z  
2025-08-23T19:01:48.509Z  https://nextjs.org/docs/messages/module-not-found
2025-08-23T19:01:48.509Z  
2025-08-23T19:01:48.509Z  ./app/(auth)/register/page.tsx
2025-08-23T19:01:48.509Z  Module not found: Can't resolve '@/components/auth-form'
2025-08-23T19:01:48.509Z  
2025-08-23T19:01:48.509Z  https://nextjs.org/docs/messages/module-not-found
2025-08-23T19:01:48.509Z  
2025-08-23T19:01:48.509Z  ./app/(auth)/register/page.tsx
2025-08-23T19:01:48.509Z  Module not found: Can't resolve '@/components/submit-button'
2025-08-23T19:01:48.509Z  
2025-08-23T19:01:48.509Z  https://nextjs.org/docs/messages/module-not-found
2025-08-23T19:01:48.510Z  
2025-08-23T19:01:48.513Z  
2025-08-23T19:01:48.513Z  > Build failed because of webpack errors
2025-08-23T19:01:48.537Z  Error: Command "tsx lib/db/migrate && next build" exited with 1
arhansubasi@Arhan-MacBook-Air recoder-chat % 
arhansubasi@Arhan-MacBook-Air recoder-web % npx vercel  --prod
Vercel CLI 46.0.2
🔍  Inspect: https://vercel.com/arhansubas-projects/recoder-web/GA32Uyt55Q9gCeRNnh3bWsEi8Qa2 [2s]
✅  Production: https://recoder-j3u2112oj-arhansubas-projects.vercel.app [2s]
Error: Command "prisma generate && prisma db push --accept-data-loss && next build" exited with 1

2025-08-23T19:01:49.630Z  Running build in Washington, D.C., USA (East) – iad1
2025-08-23T19:01:49.631Z  Build machine configuration: 2 cores, 8 GB
2025-08-23T19:01:49.652Z  Retrieving list of deployment files...
2025-08-23T19:01:49.814Z  Previous build caches not available
2025-08-23T19:01:50.232Z  Downloading 576 deployment files...
2025-08-23T19:01:52.666Z  Running "vercel build"
2025-08-23T19:01:53.068Z  Vercel CLI 46.0.2
2025-08-23T19:01:54.059Z  Detected `pnpm-lock.yaml` 9 which may be generated by pnpm@9.x or pnpm@10.x
2025-08-23T19:01:54.060Z  Using pnpm@10.x based on project creation date
2025-08-23T19:01:54.060Z  To use pnpm@9.x, manually opt in using corepack (https://vercel.com/docs/deployments/configure-a-build#corepack)
2025-08-23T19:01:54.064Z  Running "install" command: `npm install`...
2025-08-23T19:01:58.082Z  npm warn deprecated sntp@0.2.4: This module moved to @hapi/sntp. Please make sure to switch over as this distribution is no longer supported and may contain bugs and critical security issues.
2025-08-23T19:01:58.550Z  npm warn deprecated request@2.34.0: request has been deprecated, see https://github.com/request/request/issues/3142
2025-08-23T19:01:58.690Z  npm warn deprecated q@1.5.1: You or someone you depend on is using Q, the JavaScript Promise library that gave JavaScript developers strong feelings about promises. They can almost certainly migrate to the native JavaScript promise now. Thank you literally everyone for joining me in this bet against the odds. Be excellent to each other.
2025-08-23T19:01:58.690Z  npm warn deprecated
2025-08-23T19:01:58.690Z  npm warn deprecated (For a CapTP with native promises, see @endo/eventual-send and @endo/captp)
2025-08-23T19:01:59.622Z  npm warn deprecated node-uuid@1.4.8: Use uuid module instead
2025-08-23T19:02:00.018Z  npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead
2025-08-23T19:02:00.156Z  npm warn deprecated har-validator@5.1.5: this library is no longer supported
2025-08-23T19:02:00.319Z  npm warn deprecated hoek@0.9.1: This version has been deprecated in accordance with the hapi support policy (hapi.im/support). Please upgrade to the latest version to get the best features, bug fixes, and security patches. If you are unable to upgrade at this time, paid support is available for older versions (hapi.im/commercial).
2025-08-23T19:02:00.785Z  npm warn deprecated cryptiles@0.2.2: This version has been deprecated in accordance with the hapi support policy (hapi.im/support). Please upgrade to the latest version to get the best features, bug fixes, and security patches. If you are unable to upgrade at this time, paid support is available for older versions (hapi.im/commercial).
2025-08-23T19:02:00.943Z  npm warn deprecated hawk@1.0.0: This module moved to @hapi/hawk. Please make sure to switch over as this distribution is no longer supported and may contain bugs and critical security issues.
2025-08-23T19:02:01.070Z  npm warn deprecated boom@0.4.2: This version has been deprecated in accordance with the hapi support policy (hapi.im/support). Please upgrade to the latest version to get the best features, bug fixes, and security patches. If you are unable to upgrade at this time, paid support is available for older versions (hapi.im/commercial).
2025-08-23T19:02:04.895Z  npm warn deprecated uuid@3.4.0: Please upgrade  to version 7 or higher.  Older versions may use Math.random() in certain circumstances, which is known to be problematic.  See https://v8.dev/blog/math-random for details.
2025-08-23T19:02:05.226Z  npm warn deprecated request@2.88.2: request has been deprecated, see https://github.com/request/request/issues/3142
2025-08-23T19:02:34.648Z  
2025-08-23T19:02:34.649Z  > recoder-web-platform@1.0.0 postinstall
2025-08-23T19:02:34.649Z  > prisma generate
2025-08-23T19:02:34.649Z  
2025-08-23T19:02:36.099Z  Environment variables loaded from .env
2025-08-23T19:02:36.100Z  Prisma schema loaded from prisma/schema.prisma
2025-08-23T19:02:36.598Z  
2025-08-23T19:02:36.598Z  ✔ Generated Prisma Client (v6.14.0) to ./node_modules/@prisma/client in 302ms
2025-08-23T19:02:36.599Z  
2025-08-23T19:02:36.599Z  Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)
2025-08-23T19:02:36.599Z  
2025-08-23T19:02:36.599Z  Tip: Want to turn off tips and other hints? https://pris.ly/tip-4-nohints
2025-08-23T19:02:36.599Z  
2025-08-23T19:02:36.631Z  
2025-08-23T19:02:36.631Z  added 976 packages, and audited 979 packages in 42s
2025-08-23T19:02:36.631Z  
2025-08-23T19:02:36.632Z  171 packages are looking for funding
2025-08-23T19:02:36.632Z    run `npm fund` for details
2025-08-23T19:02:36.698Z  
2025-08-23T19:02:36.698Z  34 vulnerabilities (2 low, 10 moderate, 16 high, 6 critical)
2025-08-23T19:02:36.698Z  
2025-08-23T19:02:36.699Z  To address issues that do not require attention, run:
2025-08-23T19:02:36.699Z    npm audit fix
2025-08-23T19:02:36.699Z  
2025-08-23T19:02:36.699Z  To address all issues possible (including breaking changes), run:
2025-08-23T19:02:36.699Z    npm audit fix --force
2025-08-23T19:02:36.700Z  
2025-08-23T19:02:36.700Z  Some issues need review, and may require choosing
2025-08-23T19:02:36.700Z  a different dependency.
2025-08-23T19:02:36.700Z  
2025-08-23T19:02:36.700Z  Run `npm audit` for details.
2025-08-23T19:02:36.746Z  Detected Next.js version: 15.1.4
2025-08-23T19:02:36.747Z  Running "prisma generate && prisma db push --accept-data-loss && next build"
2025-08-23T19:02:38.207Z  Environment variables loaded from .env
2025-08-23T19:02:38.208Z  Prisma schema loaded from prisma/schema.prisma
2025-08-23T19:02:38.692Z  
2025-08-23T19:02:38.692Z  ✔ Generated Prisma Client (v6.14.0) to ./node_modules/@prisma/client in 291ms
2025-08-23T19:02:38.693Z  
2025-08-23T19:02:38.693Z  Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)
2025-08-23T19:02:38.693Z  
2025-08-23T19:02:38.693Z  Tip: Want to turn off tips and other hints? https://pris.ly/tip-4-nohints
2025-08-23T19:02:38.693Z  
2025-08-23T19:02:40.163Z  Environment variables loaded from .env
2025-08-23T19:02:40.164Z  Prisma schema loaded from prisma/schema.prisma
2025-08-23T19:02:40.170Z  Datasource "db": PostgreSQL database "neondb", schema "public" at "ep-rapid-queen-abgrjesz-pooler.eu-west-2.aws.neon.tech"
2025-08-23T19:02:43.862Z  
2025-08-23T19:02:43.862Z  The database is already in sync with the Prisma schema.
2025-08-23T19:02:43.862Z  
2025-08-23T19:02:43.864Z  Running generate... (Use --skip-generate to skip the generators)
Running generate... - Prisma Client
✔ Generated Prisma Client (v6.14.0) to ./node_modules/@prisma/client in 243ms
2025-08-23T19:02:44.305Z  
2025-08-23T19:02:44.919Z  Attention: Next.js now collects completely anonymous telemetry regarding usage.
2025-08-23T19:02:44.920Z  This information is used to shape Next.js' roadmap and prioritize features.
2025-08-23T19:02:44.920Z  You can learn more, including how to opt-out if you'd not like to participate in this anonymous program, by visiting the following URL:
2025-08-23T19:02:44.920Z  https://nextjs.org/telemetry
2025-08-23T19:02:44.920Z  
2025-08-23T19:02:45.019Z     ▲ Next.js 15.1.4
2025-08-23T19:02:45.019Z     - Environments: .env.production, .env
2025-08-23T19:02:45.019Z     - Experiments (use with caution):
2025-08-23T19:02:45.020Z       · staleTimes
2025-08-23T19:02:45.020Z  
2025-08-23T19:02:45.058Z     Creating an optimized production build ...
2025-08-23T19:03:54.545Z   ✓ Compiled successfully
2025-08-23T19:03:54.550Z     Linting and checking validity of types ...
2025-08-23T19:03:54.716Z   ⨯ ESLint must be installed in order to run during builds: pnpm install --save-dev eslint
2025-08-23T19:04:11.170Z  Failed to compile.
2025-08-23T19:04:11.170Z  
2025-08-23T19:04:11.171Z  ./lib/ai-assistant/index.ts:30:8
2025-08-23T19:04:11.171Z  Type error: Cannot find module '@recoder/web-ai-assistant' or its corresponding type declarations.
2025-08-23T19:04:11.171Z  
2025-08-23T19:04:11.171Z    28 |   PerformanceOptimizer,
2025-08-23T19:04:11.171Z    29 |   createWebAIAssistant
2025-08-23T19:04:11.171Z  > 30 | } from '@recoder/web-ai-assistant';
2025-08-23T19:04:11.171Z       |        ^
2025-08-23T19:04:11.171Z    31 |
2025-08-23T19:04:11.171Z    32 | // Platform-specific initialization
2025-08-23T19:04:11.171Z    33 | import { createWebAIAssistant as createSharedAssistant } from '@recoder/web-ai-assistant';
2025-08-23T19:04:11.220Z  Static worker exited with code: 1 and signal: null
2025-08-23T19:04:11.307Z  Error: Command "prisma generate && prisma db push --accept-data-loss && next build" exited with 1
arhansubasi@Arhan-MacBook-Air recoder-web % 
Some checks were not successful
20 failing, 15 cancelled, and 9 skipped checks

Test & Quality Checks / Test Object (push) Failing after 2s
Details

📊 Monitoring & Rollback Capabilities / 📊 Post-Deployment Monitoring (push) Failing after 5s
Details

Test & Quality Checks / Test Object (push) Failing after 5s
Details

🧪 Automated Testing Strategy / 🔬 Unit Tests (Chat, recoder-chat, test:unit) (push) Failing after 5s
Details

Deploy Production / test-and-build (recoder-chat) (push) Failing after 5s
Details

Test & Quality Checks / Test Object (push) Failing after 3s
Details

🧪 Automated Testing Strategy / 🔬 Unit Tests (Mobile, recoder-chat-mobile, test:unit) (push) Failing after 5s
Details

Test & Quality Checks / Test Object (push) Failing after 5s
Details

🧪 Automated Testing Strategy / 🔬 Unit Tests (Desktop, recoder-desktop, test:unit) (push) Failing after 5s
Details

Test & Quality Checks / Security Audit (push) Failing after 5s
Details

🧪 Automated Testing Strategy / 🤖 AI Providers Tests (OpenRouter, claude-sonnet-4, 1) (push) Failing after 3s
Details

Test & Quality Checks / Docker Build Test (push) Failing after 5s
Details

🧪 Automated Testing Strategy / 🔗 Integration Tests (push) Failing after 6s
Details

🧪 Automated Testing Strategy / 🌐 End-to-End Tests (firefox, web) (push) Failing after 3s
Details

📊 Monitoring & Rollback Capabilities / 📈 Update Monitoring Dashboard (push) Failing after 3s
Details

🧪 Automated Testing Strategy / ⚡ Performance Tests (push) Failing after 3s
Details

🧪 Automated Testing Strategy / 📱 Mobile App Testing (push) Failing after 4s
Details

🧪 Automated Testing Strategy / 🖥️ Desktop App Testing (macos-latest) (push) Failing after 3s
Details

🧪 Automated Testing Strategy / 🔌 Browser Extension Testing (firefox) (push) Failing after 3s
Details

🧪 Automated Testing Strategy / 📊 Test Results Summary (push) Failing after 3s
Details

Deploy Production / test-and-build (recoder-web) (push) Cancelled after 5s
Details

🧪 Automated Testing Strategy / 🔬 Unit Tests (Web, recoder-web, test:unit) (push) Cancelled after 5s
Details

Deploy Production / test-and-build (recoder-extension) (push)
Details

🧪 Automated Testing Strategy / 🤖 AI Providers Tests (Anthropic, claude-3-5-sonnet-20241022, 2) (push)
Details

🧪 Automated Testing Strategy / 🤖 AI Providers Tests (Groq, llama-3.1-70b-versatile, 3) (push)
Details

🧪 Automated Testing Strategy / 🤖 AI Providers Tests (Local-Ollama, qwen2.5-coder:7b, 0) (push)
Details

🧪 Automated Testing Strategy / 🤖 AI Providers Tests (Local-LMStudio, local-model, 0) (push)
Details

🧪 Automated Testing Strategy / 🌐 End-to-End Tests (chromium, web) (push)
Details

🧪 Automated Testing Strategy / 🌐 End-to-End Tests (chromium, chat) (push)
Details

🧪 Automated Testing Strategy / 🌐 End-to-End Tests (firefox, chat) (push)
Details

🧪 Automated Testing Strategy / 🌐 End-to-End Tests (webkit, web) (push)
Details

🧪 Automated Testing Strategy / 🌐 End-to-End Tests (webkit, chat) (push)
Details

🧪 Automated Testing Strategy / 🖥️ Desktop App Testing (ubuntu-latest) (push) Cancelled after 3s
Details

🧪 Automated Testing Strategy / 🖥️ Desktop App Testing (windows-latest) (push)
Details

🧪 Automated Testing Strategy / 🔌 Browser Extension Testing (chrome) (push)
Details

Deploy Production / deploy-web (push) Skipped
Details

📊 Monitoring & Rollback Capabilities / 🔄 Rollback Deployment (push) Skipped
Details

Deploy Production / publish-vscode-extension (push) Skipped
Details

📊 Monitoring & Rollback Capabilities / 🏥 Comprehensive Health Check (push) Skipped
Details

Deploy Production / publish-cli (push) Skipped
Details

Test & Quality Checks / Quality Gate (push) Skipped
Details

📊 Monitoring & Rollback Capabilities / 🚨 Incident Response Automation (push) Skipped
Details

Deploy Production / build-docker (push) Skipped
Details

Deploy Production / create-release (push) Skipped
Details