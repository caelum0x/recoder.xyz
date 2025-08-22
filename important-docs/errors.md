    ☐ Fix all TypeScript errors in recoder-web
     ☐ Deploy main website (app/) on recoder.xyz
     ☐ Deploy recoder-web on web.recoder.xyz
     ☐ Deploy recoder-chat on chat.recoder.xyz
     ☐ Test deployment script with all 5 platforms
     arhansubasi@192 recoder.xyz % npm run typecheck 

> recoder@1.0.0 typecheck
> pnpm run typecheck:all


> recoder@1.0.0 typecheck:all /Users/arhansubasi/recoder.xyz
> npm-run-all --parallel typecheck:packages typecheck:core typecheck:platforms


> recoder@1.0.0 typecheck:platforms /Users/arhansubasi/recoder.xyz
> npm-run-all --parallel typecheck:web typecheck:chat typecheck:extension typecheck:mobile typecheck:desktop typecheck:browser-extension


> recoder@1.0.0 typecheck:core /Users/arhansubasi/recoder.xyz
> npm-run-all --parallel typecheck:backend typecheck:engine


> recoder@1.0.0 typecheck:packages /Users/arhansubasi/recoder.xyz
> npm-run-all --parallel typecheck:cli typecheck:router typecheck:shared


> recoder@1.0.0 typecheck:web /Users/arhansubasi/recoder.xyz
> cd recoder-web && pnpm typecheck || echo 'Web platform typecheck not configured'


> recoder@1.0.0 typecheck:chat /Users/arhansubasi/recoder.xyz
> cd recoder-chat && pnpm typecheck || echo 'Chat platform typecheck not configured'


> recoder@1.0.0 typecheck:backend /Users/arhansubasi/recoder.xyz
> cd backend && pnpm typecheck || echo 'Backend typecheck not configured'


> recoder@1.0.0 typecheck:browser-extension /Users/arhansubasi/recoder.xyz
> cd browser-extension && echo 'Browser extension typecheck not configured'

Browser extension typecheck not configured

> recoder@1.0.0 typecheck:shared /Users/arhansubasi/recoder.xyz
> cd packages/shared && pnpm typecheck || echo 'Shared typecheck not configured'


> recoder@1.0.0 typecheck:engine /Users/arhansubasi/recoder.xyz
> cd production-engine && pnpm typecheck || echo 'Engine typecheck not configured'


> recoder@1.0.0 typecheck:desktop /Users/arhansubasi/recoder.xyz
> cd recoder-desktop && pnpm typecheck || echo 'Desktop typecheck not configured'


> recoder@1.0.0 typecheck:mobile /Users/arhansubasi/recoder.xyz
> cd recoder-chat-mobile && pnpm typecheck || echo 'Mobile typecheck not configured'


> recoder@1.0.0 typecheck:extension /Users/arhansubasi/recoder.xyz
> cd recoder-extension/src && pnpm check-types || echo 'Extension typecheck not configured'


> recoder@1.0.0 typecheck:router /Users/arhansubasi/recoder.xyz
> cd packages/recoder-cli-router && pnpm typecheck || echo 'Router typecheck not configured'


> recoder@1.0.0 typecheck:cli /Users/arhansubasi/recoder.xyz
> cd packages/cli && pnpm typecheck || echo 'CLI typecheck not configured'


> recoder-shared@1.0.0 typecheck /Users/arhansubasi/recoder.xyz/packages/shared
> tsc --noEmit

 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "typecheck" not found

Did you mean "pnpm type-check"?
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "typecheck" not found

Did you mean "pnpm type-check"?

> backend@1.0.0 typecheck /Users/arhansubasi/recoder.xyz/backend
> tsc --noEmit

Chat platform typecheck not configured
Web platform typecheck not configured
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "typecheck" not found
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "typecheck" not found
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "typecheck" not found
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "typecheck" not found

Did you mean "pnpm type-check"?
Desktop typecheck not configured
Engine typecheck not configured
Router typecheck not configured
Mobile typecheck not configured

> recoder-cli@1.0.1 typecheck /Users/arhansubasi/recoder.xyz/packages/cli
> tsc --noEmit

 WARN  Unsupported engine: wanted: {"node":"20.19.2"} (current: {"node":"v24.3.0","pnpm":"10.8.1"})

> recoder-vscode@1.0.0 check-types /Users/arhansubasi/recoder.xyz/recoder-extension/src
> tsc --noEmit

src/commands/assistant.ts:252:34 - error TS18048: 'value' is possibly 'undefined'.

252             validate: (value) => value > 0 || 'Must be greater than 0'
                                     ~~~~~

src/commands/validate.ts:379:28 - error TS18048: 'input' is possibly 'undefined'.

379       validate: (input) => input > 0 || 'Timeout must be positive',
                               ~~~~~

src/commands/vibe.ts:282:32 - error TS18048: 'input' is possibly 'undefined'.

282           validate: (input) => input >= 500 || 'Minimum delay is 500ms'
                                   ~~~~~

src/commands/vibe.ts:289:32 - error TS18048: 'input' is possibly 'undefined'.

289           validate: (input) => input >= 10 || 'Minimum context is 10 lines'
                                   ~~~~~

src/generators/advanced-templates.ts:599:48 - error TS18046: 'error' is of type 'unknown'.

599       result.errors.push(`Generation failed: ${error.message}`);
                                                   ~~~~~

src/services/master-orchestrator.ts:347:60 - error TS7006: Parameter 'opt' implicitly has an 'any' type.

347       fallbackOptions: costDecision.alternativeOptions.map(opt => opt.providerId),
                                                               ~~~

src/services/session-sync-service.ts:334:7 - error TS7053: Element implicitly has an 'any' type because expression of type 'any' can't be used to index type '{ web: { active: boolean; lastSeen: Date; sessionData?: any; }; cli: { active: boolean; lastSeen: Date; version?: string | undefined; sessionData?: any; }; router: { active: boolean; lastSeen: Date; version?: string | undefined; sessionData?: any; }; extension: { ...; }; }'.

334       session.platforms[platformData.platform].active = platformData.active;
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/services/session-sync-service.ts:335:7 - error TS7053: Element implicitly has an 'any' type because expression of type 'any' can't be used to index type '{ web: { active: boolean; lastSeen: Date; sessionData?: any; }; cli: { active: boolean; lastSeen: Date; version?: string | undefined; sessionData?: any; }; router: { active: boolean; lastSeen: Date; version?: string | undefined; sessionData?: any; }; extension: { ...; }; }'.

335       session.platforms[platformData.platform].lastSeen = new Date();
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/services/web-cli-auth-bridge.ts:131:21 - error TS2345: Argument of type 'CLIToken | undefined' is not assignable to parameter of type 'CLIToken | PromiseLike<CLIToken>'.
  Type 'undefined' is not assignable to type 'CLIToken | PromiseLike<CLIToken>'.

131             resolve(result.token);
                        ~~~~~~~~~~~~

src/templates/template-engine.ts:81:42 - error TS2683: 'this' implicitly has type 'any' because it does not have a type annotation.

81       return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
                                            ~~~~

  src/templates/template-engine.ts:80:48
    80     this.handlebars.registerHelper('ifEquals', function(arg1: any, arg2: any, options: any) {
                                                      ~~~~~~~~
    An outer value of 'this' is shadowed by this container.

src/templates/template-engine.ts:81:66 - error TS2683: 'this' implicitly has type 'any' because it does not have a type annotation.

81       return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
                                                                    ~~~~

  src/templates/template-engine.ts:80:48
    80     this.handlebars.registerHelper('ifEquals', function(arg1: any, arg2: any, options: any) {
                                                      ~~~~~~~~
    An outer value of 'this' is shadowed by this container.

src/templates/template-engine.ts:85:42 - error TS2683: 'this' implicitly has type 'any' because it does not have a type annotation.

85       return (arg1 != arg2) ? options.fn(this) : options.inverse(this);
                                            ~~~~

  src/templates/template-engine.ts:84:51
    84     this.handlebars.registerHelper('ifNotEquals', function(arg1: any, arg2: any, options: any) {
                                                         ~~~~~~~~
    An outer value of 'this' is shadowed by this container.

src/templates/template-engine.ts:85:66 - error TS2683: 'this' implicitly has type 'any' because it does not have a type annotation.

85       return (arg1 != arg2) ? options.fn(this) : options.inverse(this);
                                                                    ~~~~

  src/templates/template-engine.ts:84:51
    84     this.handlebars.registerHelper('ifNotEquals', function(arg1: any, arg2: any, options: any) {
                                                         ~~~~~~~~
    An outer value of 'this' is shadowed by this container.

src/templates/template-engine.ts:89:48 - error TS2683: 'this' implicitly has type 'any' because it does not have a type annotation.

89       return array.includes(item) ? options.fn(this) : options.inverse(this);
                                                  ~~~~

  src/templates/template-engine.ts:88:50
    88     this.handlebars.registerHelper('ifContains', function(array: any[], item: any, options: any) {
                                                        ~~~~~~~~
    An outer value of 'this' is shadowed by this container.

src/templates/template-engine.ts:89:72 - error TS2683: 'this' implicitly has type 'any' because it does not have a type annotation.

89       return array.includes(item) ? options.fn(this) : options.inverse(this);
                                                                          ~~~~

  src/templates/template-engine.ts:88:50
    88     this.handlebars.registerHelper('ifContains', function(array: any[], item: any, options: any) {
                                                        ~~~~~~~~
    An outer value of 'this' is shadowed by this container.

src/templates/template-engine.ts:157:14 - error TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ javascript: string; typescript: string; python: string; rust: string; go: string; java: string; html: string; css: string; json: string; yaml: string; markdown: string; }'.
  No index signature with a parameter of type 'string' was found on type '{ javascript: string; typescript: string; python: string; rust: string; go: string; java: string; html: string; css: string; json: string; yaml: string; markdown: string; }'.

157       return extensions[language] || 'txt';
                 ~~~~~~~~~~~~~~~~~~~~

src/templates/template-engine.ts:477:68 - error TS18046: 'error' is of type 'unknown'.

477         errors.push(`Template compilation error in ${file.path}: ${error.message}`);
                                                                       ~~~~~

src/test-setup.ts:85:65 - error TS2345: Argument of type '(code?: number) => never' is not assignable to parameter of type '(code?: string | number | null | undefined) => never'.
  Types of parameters 'code' and 'code' are incompatible.
    Type 'string | number | null | undefined' is not assignable to type 'number | undefined'.
      Type 'null' is not assignable to type 'number | undefined'.

85 const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
                                                                   ~~~~~~~~~~~~~~~~~~~~


Found 18 errors in 9 files.

Errors  Files
     1  src/commands/assistant.ts:252
     1  src/commands/validate.ts:379
     2  src/commands/vibe.ts:282
     1  src/generators/advanced-templates.ts:599
     1  src/services/master-orchestrator.ts:347
     2  src/services/session-sync-service.ts:334
     1  src/services/web-cli-auth-bridge.ts:131
     8  src/templates/template-engine.ts:81
     1  src/test-setup.ts:85
 ELIFECYCLE  Command failed with exit code 2.
CLI typecheck not configured
src/middleware/auth.ts:70:29 - error TS2448: Block-scoped variable 'authenticateUser' used before its declaration.

70 export const authenticate = authenticateUser;
                               ~~~~~~~~~~~~~~~~

  src/middleware/auth.ts:226:14
    226 export const authenticateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
                     ~~~~~~~~~~~~~~~~
    'authenticateUser' is declared here.

src/middleware/auth.ts:80:27 - error TS2769: No overload matches this call.
  Overload 1 of 5, '(payload: string | object | Buffer<ArrayBufferLike>, secretOrPrivateKey: null, options?: SignOptions & { algorithm: "none"; }): string', gave the following error.
    Argument of type 'string' is not assignable to parameter of type 'null'.
  Overload 2 of 5, '(payload: string | object | Buffer<ArrayBufferLike>, secretOrPrivateKey: Buffer<ArrayBufferLike> | Secret | JsonWebKeyInput | PrivateKeyInput, options?: SignOptions): string', gave the following error.
    Type 'string' is not assignable to type 'number | StringValue'.
  Overload 3 of 5, '(payload: string | object | Buffer<ArrayBufferLike>, secretOrPrivateKey: Buffer<ArrayBufferLike> | Secret | JsonWebKeyInput | PrivateKeyInput, callback: SignCallback): void', gave the following error.
    Object literal may only specify known properties, and 'expiresIn' does not exist in type 'SignCallback'.

80   const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
                             ~~~~

  node_modules/@types/jsonwebtoken/index.d.ts:43:5
    43     expiresIn?: StringValue | number;
           ~~~~~~~~~
    The expected type comes from property 'expiresIn' which is declared here on type 'SignOptions'

src/middleware/auth.ts:81:28 - error TS2769: No overload matches this call.
  Overload 1 of 5, '(payload: string | object | Buffer<ArrayBufferLike>, secretOrPrivateKey: null, options?: SignOptions & { algorithm: "none"; }): string', gave the following error.
    Argument of type 'string' is not assignable to parameter of type 'null'.
  Overload 2 of 5, '(payload: string | object | Buffer<ArrayBufferLike>, secretOrPrivateKey: Buffer<ArrayBufferLike> | Secret | JsonWebKeyInput | PrivateKeyInput, options?: SignOptions): string', gave the following error.
    Type 'string' is not assignable to type 'number | StringValue'.
  Overload 3 of 5, '(payload: string | object | Buffer<ArrayBufferLike>, secretOrPrivateKey: Buffer<ArrayBufferLike> | Secret | JsonWebKeyInput | PrivateKeyInput, callback: SignCallback): void', gave the following error.
    Object literal may only specify known properties, and 'expiresIn' does not exist in type 'SignCallback'.

81   const refreshToken = jwt.sign(
                              ~~~~

  node_modules/@types/jsonwebtoken/index.d.ts:43:5
    43     expiresIn?: StringValue | number;
           ~~~~~~~~~
    The expected type comes from property 'expiresIn' which is declared here on type 'SignOptions'

src/middleware/auth.ts:182:22 - error TS2339: Property 'param' does not exist on type 'ValidationError'.
  Property 'param' does not exist on type 'AlternativeValidationError'.

182         field: error.param,
                         ~~~~~

src/middleware/auth.ts:184:22 - error TS2339: Property 'value' does not exist on type 'ValidationError'.
  Property 'value' does not exist on type 'AlternativeValidationError'.

184         value: error.value
                         ~~~~~

src/routes/auth.ts:375:5 - error TS2304: Cannot find name 'body'.

375     body('name')
        ~~~~

src/routes/auth.ts:382:5 - error TS2304: Cannot find name 'body'.

382     body('email')
        ~~~~

src/routes/auth.ts:590:20 - error TS2304: Cannot find name 'JWT_EXPIRES_IN'.

590         expiresIn: JWT_EXPIRES_IN,
                       ~~~~~~~~~~~~~~

../production-engine/src/services/openrouter-service.ts:375:14 - error TS2339: Property 'error' does not exist on type 'unknown'.

375     if (data.error) {
                 ~~~~~

../production-engine/src/services/openrouter-service.ts:376:28 - error TS2339: Property 'error' does not exist on type 'unknown'.

376       throw new Error(data.error.message || 'OpenRouter API error');
                               ~~~~~

../production-engine/src/services/openrouter-service.ts:379:26 - error TS2339: Property 'choices' does not exist on type 'unknown'.

379     const content = data.choices?.[0]?.message?.content || '';
                             ~~~~~~~

../production-engine/src/services/openrouter-service.ts:380:24 - error TS2339: Property 'usage' does not exist on type 'unknown'.

380     const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
                           ~~~~~

../production-engine/src/services/openrouter-service.ts:393:19 - error TS2339: Property 'model' does not exist on type 'unknown'.

393       model: data.model || model,
                      ~~~~~


Found 13 errors in 3 files.

Errors  Files
     5  src/middleware/auth.ts:70
     3  src/routes/auth.ts:375
     5  ../production-engine/src/services/openrouter-service.ts:375
 ELIFECYCLE  Command failed with exit code 2.
Backend typecheck not configured
activate/handleUri.ts:34:27 - error TS2551: Property 'handleRecoderCallback' does not exist on type 'RecoderProvider'. Did you mean 'handleKiloCodeCallback'?

34     await visibleProvider.handleRecoderCallback(token)
                             ~~~~~~~~~~~~~~~~~~~~~

  core/webview/RecoderProvider.ts:1135:8
    1135  async handleKiloCodeCallback(token: string) {
                ~~~~~~~~~~~~~~~~~~~~~~
    'handleKiloCodeCallback' is declared here.

activate/registerCommands.ts:153:24 - error TS7030: Not all code paths return a value.

153  sidebarProviderFocus: () => {
                           ~~~~~~~

activate/registerCommands.ts:158:20 - error TS2341: Property 'view' is private and only accessible within class 'RecoderProvider'.

158    visibleProvider.view?.show(true)
                       ~~~~

activate/registerCommands.ts:158:26 - error TS2339: Property 'show' does not exist on type 'WebviewPanel | WebviewView'.
  Property 'show' does not exist on type 'WebviewPanel'.

158    visibleProvider.view?.show(true)
                             ~~~~

activate/registerCommands.ts:159:11 - error TS2554: Expected 2 arguments, but got 0.

159    return focusPanel()
              ~~~~~~~~~~

  utils/focusPanel.ts:12:2
    12  tabPanel: vscode.WebviewPanel | undefined,
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    An argument for 'tabPanel' was not provided.

api/index.ts:73:15 - error TS2552: Cannot find name 'KilocodeOpenrouterHandler'. Did you mean 'RecoderOpenrouterHandler'?

73    return new KilocodeOpenrouterHandler(options)
                 ~~~~~~~~~~~~~~~~~~~~~~~~~

api/providers/huggingface.ts:6:2 - error TS2739: Type '{ readonly maxTokens: 32768; readonly supportsImages: false; readonly description: "Mistral Large 2407"; }' is missing the following properties from type '{ contextWindow: number; supportsPromptCache: boolean; maxTokens?: number | null | undefined; maxThinkingTokens?: number | null | undefined; supportsImages?: boolean | undefined; supportsComputerUse?: boolean | undefined; ... 14 more ...; tiers?: { ...; }[] | undefined; }': contextWindow, supportsPromptCache

6  "mistralai/mistral-large-2407": {
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

api/providers/huggingface.ts:11:2 - error TS2739: Type '{ readonly maxTokens: 128000; readonly supportsImages: false; readonly description: "Microsoft Phi-3.5 Mini 128K Instruct"; }' is missing the following properties from type '{ contextWindow: number; supportsPromptCache: boolean; maxTokens?: number | null | undefined; maxThinkingTokens?: number | null | undefined; supportsImages?: boolean | undefined; supportsComputerUse?: boolean | undefined; ... 14 more ...; tiers?: { ...; }[] | undefined; }': contextWindow, supportsPromptCache

11  "microsoft/phi-3.5-mini-128k-instruct": {
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

api/providers/huggingface.ts:16:2 - error TS2739: Type '{ readonly maxTokens: 8192; readonly supportsImages: false; readonly description: "Meta Llama 3.1 70B Instruct"; }' is missing the following properties from type '{ contextWindow: number; supportsPromptCache: boolean; maxTokens?: number | null | undefined; maxThinkingTokens?: number | null | undefined; supportsImages?: boolean | undefined; supportsComputerUse?: boolean | undefined; ... 14 more ...; tiers?: { ...; }[] | undefined; }': contextWindow, supportsPromptCache

16  "meta-llama/llama-3.1-70b-instruct": {
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

api/providers/huggingface.ts:21:2 - error TS2739: Type '{ readonly maxTokens: 8192; readonly supportsImages: false; readonly description: "Meta Llama 3.1 8B Instruct"; }' is missing the following properties from type '{ contextWindow: number; supportsPromptCache: boolean; maxTokens?: number | null | undefined; maxThinkingTokens?: number | null | undefined; supportsImages?: boolean | undefined; supportsComputerUse?: boolean | undefined; ... 14 more ...; tiers?: { ...; }[] | undefined; }': contextWindow, supportsPromptCache

21  "meta-llama/llama-3.1-8b-instruct": {
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

api/providers/huggingface.ts:26:2 - error TS2739: Type '{ readonly maxTokens: 4096; readonly supportsImages: false; readonly description: "Code Llama 13B Instruct"; }' is missing the following properties from type '{ contextWindow: number; supportsPromptCache: boolean; maxTokens?: number | null | undefined; maxThinkingTokens?: number | null | undefined; supportsImages?: boolean | undefined; supportsComputerUse?: boolean | undefined; ... 14 more ...; tiers?: { ...; }[] | undefined; }': contextWindow, supportsPromptCache

26  "codellama/codellama-13b-instruct-hf": {
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

api/providers/huggingface.ts:37:26 - error TS2339: Property 'huggingFaceApiKey' does not exist on type 'ApiHandlerOptions'.

37   const apiKey = options.huggingFaceApiKey ?? options.apiKey
                            ~~~~~~~~~~~~~~~~~

api/providers/huggingface.ts:47:4 - error TS2322: Type '{ readonly "mistralai/mistral-large-2407": { readonly maxTokens: 32768; readonly supportsImages: false; readonly description: "Mistral Large 2407"; }; readonly "microsoft/phi-3.5-mini-128k-instruct": { ...; }; readonly "meta-llama/llama-3.1-70b-instruct": { ...; }; readonly "meta-llama/llama-3.1-8b-instruct": { ...;...' is not assignable to type 'Record<"mistralai/mistral-large-2407" | "microsoft/phi-3.5-mini-128k-instruct" | "meta-llama/llama-3.1-70b-instruct" | "meta-llama/llama-3.1-8b-instruct" | "codellama/codellama-13b-instruct-hf", { ...; }>'.
  Types of property '"mistralai/mistral-large-2407"' are incompatible.
    Type '{ readonly maxTokens: 32768; readonly supportsImages: false; readonly description: "Mistral Large 2407"; }' is missing the following properties from type '{ contextWindow: number; supportsPromptCache: boolean; maxTokens?: number | null | undefined; maxThinkingTokens?: number | null | undefined; supportsImages?: boolean | undefined; supportsComputerUse?: boolean | undefined; ... 14 more ...; tiers?: { ...; }[] | undefined; }': contextWindow, supportsPromptCache

47    providerModels: HUGGINGFACE_MODELS,
      ~~~~~~~~~~~~~~

  api/providers/base-openai-compatible-provider.ts:18:2
    18  providerModels: Record<ModelName, ModelInfo>
        ~~~~~~~~~~~~~~
    The expected type comes from property 'providerModels' which is declared here on type 'BaseOpenAiCompatibleProviderOptions<"mistralai/mistral-large-2407" | "microsoft/phi-3.5-mini-128k-instruct" | "meta-llama/llama-3.1-70b-instruct" | "meta-llama/llama-3.1-8b-instruct" | "codellama/codellama-13b-instruct-hf">'

api/providers/huggingface.ts:54:11 - error TS2416: Property 'getModel' in type 'HuggingFaceHandler' is not assignable to the same property in base type 'BaseOpenAiCompatibleProvider<"mistralai/mistral-large-2407" | "microsoft/phi-3.5-mini-128k-instruct" | "meta-llama/llama-3.1-70b-instruct" | "meta-llama/llama-3.1-8b-instruct" | "codellama/codellama-13b-instruct-hf">'.
  Type '() => { id: string; info: { contextWindow: number; supportsPromptCache: boolean; maxTokens?: number | null | undefined; maxThinkingTokens?: number | null | undefined; supportsImages?: boolean | undefined; ... 15 more ...; tiers?: { ...; }[] | undefined; }; }' is not assignable to type '() => { id: "mistralai/mistral-large-2407" | "microsoft/phi-3.5-mini-128k-instruct" | "meta-llama/llama-3.1-70b-instruct" | "meta-llama/llama-3.1-8b-instruct" | "codellama/codellama-13b-instruct-hf"; info: { ...; }; }'.
    Call signature return types '{ id: string; info: { contextWindow: number; supportsPromptCache: boolean; maxTokens?: number | null | undefined; maxThinkingTokens?: number | null | undefined; supportsImages?: boolean | undefined; ... 15 more ...; tiers?: { ...; }[] | undefined; }; }' and '{ id: "mistralai/mistral-large-2407" | "microsoft/phi-3.5-mini-128k-instruct" | "meta-llama/llama-3.1-70b-instruct" | "meta-llama/llama-3.1-8b-instruct" | "codellama/codellama-13b-instruct-hf"; info: { ...; }; }' are incompatible.
      The types of 'id' are incompatible between these types.
        Type 'string' is not assignable to type '"mistralai/mistral-large-2407" | "microsoft/phi-3.5-mini-128k-instruct" | "meta-llama/llama-3.1-70b-instruct" | "meta-llama/llama-3.1-8b-instruct" | "codellama/codellama-13b-instruct-hf"'.

54  override getModel() {
             ~~~~~~~~

api/providers/recoder-openrouter.ts:5:41 - error TS2724: '"@roo-code/types"' has no exported member named 'recoderDefaultModelId'. Did you mean 'groqDefaultModelId'?

5 import { DEEP_SEEK_DEFAULT_TEMPERATURE, recoderDefaultModelId } from "@roo-code/types"
                                          ~~~~~~~~~~~~~~~~~~~~~

  ../packages/types/src/providers/groq.ts:15:14
    15 export const groqDefaultModelId: GroqModelId = "llama-3.3-70b-versatile" // Defaulting to Llama3 70B Versatile
                    ~~~~~~~~~~~~~~~~~~
    'groqDefaultModelId' is declared here.

api/providers/recoder-openrouter.ts:6:44 - error TS2307: Cannot find module '../../utils/recoder-token' or its corresponding type declarations.

6 import { getRecoderBaseUriFromToken } from "../../utils/recoder-token"
                                             ~~~~~~~~~~~~~~~~~~~~~~~~~~~

api/providers/recoder-openrouter.ts:90:5 - error TS2353: Object literal may only specify known properties, and 'recoderToken' does not exist in type '{ provider: "recoder-openrouter"; kilocodeToken?: string | undefined; }'.

90     recoderToken: this.options.openRouterApiKey,
       ~~~~~~~~~~~~

api/providers/together.ts:11:3 - error TS2353: Object literal may only specify known properties, and 'cost' does not exist in type '{ contextWindow: number; supportsPromptCache: boolean; maxTokens?: number | null | undefined; maxThinkingTokens?: number | null | undefined; supportsImages?: boolean | undefined; supportsComputerUse?: boolean | undefined; ... 14 more ...; tiers?: { ...; }[] | undefined; }'.

11   cost: "free"
     ~~~~

api/providers/together.ts:17:3 - error TS2353: Object literal may only specify known properties, and 'cost' does not exist in type '{ contextWindow: number; supportsPromptCache: boolean; maxTokens?: number | null | undefined; maxThinkingTokens?: number | null | undefined; supportsImages?: boolean | undefined; supportsComputerUse?: boolean | undefined; ... 14 more ...; tiers?: { ...; }[] | undefined; }'.

17   cost: "free"
     ~~~~

api/providers/together.ts:23:3 - error TS2353: Object literal may only specify known properties, and 'cost' does not exist in type '{ contextWindow: number; supportsPromptCache: boolean; maxTokens?: number | null | undefined; maxThinkingTokens?: number | null | undefined; supportsImages?: boolean | undefined; supportsComputerUse?: boolean | undefined; ... 14 more ...; tiers?: { ...; }[] | undefined; }'.

23   cost: "free"
     ~~~~

api/providers/together.ts:29:3 - error TS2353: Object literal may only specify known properties, and 'cost' does not exist in type '{ contextWindow: number; supportsPromptCache: boolean; maxTokens?: number | null | undefined; maxThinkingTokens?: number | null | undefined; supportsImages?: boolean | undefined; supportsComputerUse?: boolean | undefined; ... 14 more ...; tiers?: { ...; }[] | undefined; }'.

29   cost: "free"
     ~~~~

api/providers/together.ts:35:3 - error TS2353: Object literal may only specify known properties, and 'cost' does not exist in type '{ contextWindow: number; supportsPromptCache: boolean; maxTokens?: number | null | undefined; maxThinkingTokens?: number | null | undefined; supportsImages?: boolean | undefined; supportsComputerUse?: boolean | undefined; ... 14 more ...; tiers?: { ...; }[] | undefined; }'.

35   cost: "free"
     ~~~~

api/providers/together.ts:42:3 - error TS2353: Object literal may only specify known properties, and 'cost' does not exist in type '{ contextWindow: number; supportsPromptCache: boolean; maxTokens?: number | null | undefined; maxThinkingTokens?: number | null | undefined; supportsImages?: boolean | undefined; supportsComputerUse?: boolean | undefined; ... 14 more ...; tiers?: { ...; }[] | undefined; }'.

42   cost: "paid"
     ~~~~

api/providers/together.ts:48:3 - error TS2353: Object literal may only specify known properties, and 'cost' does not exist in type '{ contextWindow: number; supportsPromptCache: boolean; maxTokens?: number | null | undefined; maxThinkingTokens?: number | null | undefined; supportsImages?: boolean | undefined; supportsComputerUse?: boolean | undefined; ... 14 more ...; tiers?: { ...; }[] | undefined; }'.

48   cost: "paid"
     ~~~~

api/providers/together.ts:54:3 - error TS2353: Object literal may only specify known properties, and 'cost' does not exist in type '{ contextWindow: number; supportsPromptCache: boolean; maxTokens?: number | null | undefined; maxThinkingTokens?: number | null | undefined; supportsImages?: boolean | undefined; supportsComputerUse?: boolean | undefined; ... 14 more ...; tiers?: { ...; }[] | undefined; }'.

54   cost: "paid"
     ~~~~

api/providers/together.ts:60:3 - error TS2353: Object literal may only specify known properties, and 'cost' does not exist in type '{ contextWindow: number; supportsPromptCache: boolean; maxTokens?: number | null | undefined; maxThinkingTokens?: number | null | undefined; supportsImages?: boolean | undefined; supportsComputerUse?: boolean | undefined; ... 14 more ...; tiers?: { ...; }[] | undefined; }'.

60   cost: "paid"
     ~~~~

api/providers/together.ts:66:3 - error TS2353: Object literal may only specify known properties, and 'cost' does not exist in type '{ contextWindow: number; supportsPromptCache: boolean; maxTokens?: number | null | undefined; maxThinkingTokens?: number | null | undefined; supportsImages?: boolean | undefined; supportsComputerUse?: boolean | undefined; ... 14 more ...; tiers?: { ...; }[] | undefined; }'.

66   cost: "paid"
     ~~~~

api/providers/together.ts:74:26 - error TS2339: Property 'togetherApiKey' does not exist on type 'ApiHandlerOptions'.

74   const apiKey = options.togetherApiKey ?? options.apiKey
                            ~~~~~~~~~~~~~~

api/providers/together.ts:84:4 - error TS2322: Type '{ readonly "meta-llama/llama-vision-free": { readonly maxTokens: 8192; readonly supportsImages: true; readonly description: "Meta Llama Vision - FREE"; readonly cost: "free"; }; readonly "deepseek-ai/deepseek-r1-distill-llama-70b": { ...; }; ... 7 more ...; readonly "deepseek-ai/deepseek-llm-67b-chat": { ...; }; }' is not assignable to type 'Record<"mistralai/mistral-large-2407" | "meta-llama/llama-vision-free" | "deepseek-ai/deepseek-r1-distill-llama-70b" | "NousResearch/nous-hermes-llama-3.3-70b-instruct-turbo" | ... 5 more ... | "deepseek-ai/deepseek-llm-67b-chat", { ...; }>'.
  Types of property '"mistralai/mistral-large-2407"' are incompatible.
    Type '{ readonly maxTokens: 32768; readonly supportsImages: false; readonly description: "Mistral Large 2407"; readonly cost: "paid"; }' is missing the following properties from type '{ contextWindow: number; supportsPromptCache: boolean; maxTokens?: number | null | undefined; maxThinkingTokens?: number | null | undefined; supportsImages?: boolean | undefined; supportsComputerUse?: boolean | undefined; ... 14 more ...; tiers?: { ...; }[] | undefined; }': contextWindow, supportsPromptCache

84    providerModels: TOGETHER_MODELS,
      ~~~~~~~~~~~~~~

  api/providers/base-openai-compatible-provider.ts:18:2
    18  providerModels: Record<ModelName, ModelInfo>
        ~~~~~~~~~~~~~~
    The expected type comes from property 'providerModels' which is declared here on type 'BaseOpenAiCompatibleProviderOptions<"mistralai/mistral-large-2407" | "meta-llama/llama-vision-free" | "deepseek-ai/deepseek-r1-distill-llama-70b" | "NousResearch/nous-hermes-llama-3.3-70b-instruct-turbo" | ... 5 more ... | "deepseek-ai/deepseek-llm-67b-chat">'

core/kilocode/webview/webviewMessageHandlerUtils.ts:54:34 - error TS2551: Property 'initClineWithHistoryItem' does not exist on type 'RecoderProvider'. Did you mean 'initRecoderWithHistoryItem'?

54  const newCline = await provider.initClineWithHistoryItem(historyItem)
                                    ~~~~~~~~~~~~~~~~~~~~~~~~

  core/webview/RecoderProvider.ts:584:15
    584  public async initRecoderWithHistoryItem(historyItem: HistoryItem & { rootTask?: Task; parentTask?: Task }) {
                      ~~~~~~~~~~~~~~~~~~~~~~~~~~
    'initRecoderWithHistoryItem' is declared here.

core/task/Task.ts:1493:23 - error TS2551: Property 'initClineWithHistoryItem' does not exist on type 'RecoderProvider'. Did you mean 'initRecoderWithHistoryItem'?

1493       await provider?.initClineWithHistoryItem(history.historyItem)
                           ~~~~~~~~~~~~~~~~~~~~~~~~

  core/webview/RecoderProvider.ts:584:15
    584  public async initRecoderWithHistoryItem(historyItem: HistoryItem & { rootTask?: Task; parentTask?: Task }) {
                      ~~~~~~~~~~~~~~~~~~~~~~~~~~
    'initRecoderWithHistoryItem' is declared here.

core/tools/newTaskTool.ts:89:36 - error TS2551: Property 'initClineWithTask' does not exist on type 'RecoderProvider'. Did you mean 'initClineWithSubTask'?

89    const newCline = await provider.initClineWithTask(unescapedMessage, undefined, cline)
                                      ~~~~~~~~~~~~~~~~~

  core/webview/RecoderProvider.ts:523:15
    523  public async initClineWithSubTask(parent: Task, task?: string, images?: string[]) {
                      ~~~~~~~~~~~~~~~~~~~~
    'initClineWithSubTask' is declared here.

core/webview/__tests__/ClineProvider.spec.ts:511:9 - error TS2322: Type '{ version: string; clineMessages: never[]; taskHistory: never[]; shouldShowAnnouncement: false; apiConfiguration: { apiProvider: "kilocode"; kilocodeModel: string; kilocodeToken: string; }; customInstructions: undefined; ... 37 more ...; hasOpenedModeSelector: false; }' is not assignable to type 'ExtensionState'.
  Type '{ version: string; clineMessages: never[]; taskHistory: never[]; shouldShowAnnouncement: false; apiConfiguration: { apiProvider: "kilocode"; kilocodeModel: string; kilocodeToken: string; }; customInstructions: undefined; ... 37 more ...; hasOpenedModeSelector: false; }' is missing the following properties from type '{ version: string; clineMessages: { type: "ask" | "say"; ts: number; reasoning?: string | undefined; partial?: boolean | undefined; text?: string | undefined; ask?: "followup" | "command" | ... 13 more ... | undefined; ... 7 more ...; apiProtocol?: "openai" | ... 1 more ... | undefined; }[]; ... 47 more ...; globalW...': commitMessageApiConfigId, autocompleteApiConfigId, ghostServiceSettings, allowVeryLargeReads, and 5 more.

511   const mockState: ExtensionState = {
            ~~~~~~~~~

core/webview/__tests__/ClineProvider.spec.ts:3432:21 - error TS2551: Property 'initClineWithHistoryItem' does not exist on type 'RecoderProvider'. Did you mean 'initRecoderWithHistoryItem'?

3432     expect(provider.initClineWithHistoryItem).toHaveBeenCalled()
                         ~~~~~~~~~~~~~~~~~~~~~~~~

  core/webview/RecoderProvider.ts:584:15
    584  public async initRecoderWithHistoryItem(historyItem: HistoryItem & { rootTask?: Task; parentTask?: Task }) {
                      ~~~~~~~~~~~~~~~~~~~~~~~~~~
    'initRecoderWithHistoryItem' is declared here.

core/webview/RecoderProvider.ts:174:8 - error TS2339: Property 'clineStack' does not exist on type 'RecoderProvider'.

174   this.clineStack.push(cline)
           ~~~~~~~~~~

core/webview/RecoderProvider.ts:187:12 - error TS2339: Property 'clineStack' does not exist on type 'RecoderProvider'.

187   if (this.clineStack.length === 0) {
               ~~~~~~~~~~

core/webview/RecoderProvider.ts:192:20 - error TS2339: Property 'clineStack' does not exist on type 'RecoderProvider'.

192   let cline = this.clineStack.pop()
                       ~~~~~~~~~~

core/webview/RecoderProvider.ts:216:12 - error TS2339: Property 'clineStack' does not exist on type 'RecoderProvider'.

216   if (this.clineStack.length === 0) {
               ~~~~~~~~~~

core/webview/RecoderProvider.ts:219:15 - error TS2339: Property 'clineStack' does not exist on type 'RecoderProvider'.

219   return this.clineStack[this.clineStack.length - 1]
                  ~~~~~~~~~~

core/webview/RecoderProvider.ts:219:31 - error TS2339: Property 'clineStack' does not exist on type 'RecoderProvider'.

219   return this.clineStack[this.clineStack.length - 1]
                                  ~~~~~~~~~~

core/webview/RecoderProvider.ts:224:15 - error TS2339: Property 'clineStack' does not exist on type 'RecoderProvider'.

224   return this.clineStack.length
                  ~~~~~~~~~~

core/webview/RecoderProvider.ts:228:15 - error TS2339: Property 'clineStack' does not exist on type 'RecoderProvider'.

228   return this.clineStack.map((cline) => cline.taskId)
                  ~~~~~~~~~~

core/webview/RecoderProvider.ts:228:31 - error TS7006: Parameter 'cline' implicitly has an 'any' type.

228   return this.clineStack.map((cline) => cline.taskId)
                                  ~~~~~

core/webview/RecoderProvider.ts:568:19 - error TS2339: Property 'clineStack' does not exist on type 'RecoderProvider'.

568    rootTask: this.clineStack.length > 0 ? this.clineStack[0] : undefined,
                      ~~~~~~~~~~

core/webview/RecoderProvider.ts:568:48 - error TS2339: Property 'clineStack' does not exist on type 'RecoderProvider'.

568    rootTask: this.clineStack.length > 0 ? this.clineStack[0] : undefined,
                                                   ~~~~~~~~~~

core/webview/RecoderProvider.ts:570:21 - error TS2339: Property 'clineStack' does not exist on type 'RecoderProvider'.

570    taskNumber: this.clineStack.length + 1,
                        ~~~~~~~~~~

core/webview/RecoderProvider.ts:1219:21 - error TS2339: Property 'clineStack' does not exist on type 'RecoderProvider'.

1219   for (let i = this.clineStack.length - 1; i >= 0; i--) {
                         ~~~~~~~~~~

core/webview/RecoderProvider.ts:1220:13 - error TS2339: Property 'clineStack' does not exist on type 'RecoderProvider'.

1220    if (this.clineStack[i].taskId === taskId) {
                 ~~~~~~~~~~

core/webview/RecoderProvider.ts:1221:17 - error TS2339: Property 'clineStack' does not exist on type 'RecoderProvider'.

1221     task = this.clineStack[i]
                     ~~~~~~~~~~

core/webview/RecoderProvider.ts:1298:46 - error TS2322: Type '{ version: any; apiConfiguration: { reasoningEffort?: "low" | "medium" | "high" | undefined; codebaseIndexOpenAiCompatibleBaseUrl?: string | undefined; codebaseIndexOpenAiCompatibleModelDimension?: number | undefined; ... 88 more ...; cerebrasModelId?: string | undefined; }; ... 96 more ...; followupAutoApproveTimeo...' is not assignable to type 'ExtensionState'.
  Type '{ version: any; apiConfiguration: { reasoningEffort?: "low" | "medium" | "high" | undefined; codebaseIndexOpenAiCompatibleBaseUrl?: string | undefined; codebaseIndexOpenAiCompatibleModelDimension?: number | undefined; ... 88 more ...; cerebrasModelId?: string | undefined; }; ... 96 more ...; followupAutoApproveTimeo...' is missing the following properties from type '{ version: string; clineMessages: { type: "ask" | "say"; ts: number; reasoning?: string | undefined; partial?: boolean | undefined; text?: string | undefined; ask?: "followup" | "command" | ... 13 more ... | undefined; ... 7 more ...; apiProtocol?: "openai" | ... 1 more ... | undefined; }[]; ... 47 more ...; globalW...': localWorkflowToggles, globalRulesToggles, localRulesToggles, globalWorkflowToggles

1298   this.postMessageToWebview({ type: "state", state })
                                                  ~~~~~

  shared/ExtensionMessage.ts:139:2
    139  state?: ExtensionState
         ~~~~~
    The expected type comes from property 'state' which is declared here on type 'ExtensionMessage'

core/webview/webviewMessageHandler.ts:132:21 - error TS2551: Property 'initClineWithHistoryItem' does not exist on type 'RecoderProvider'. Did you mean 'initRecoderWithHistoryItem'?

132      await provider.initClineWithHistoryItem(historyItem)
                        ~~~~~~~~~~~~~~~~~~~~~~~~

  core/webview/RecoderProvider.ts:584:15
    584  public async initRecoderWithHistoryItem(historyItem: HistoryItem & { rootTask?: Task; parentTask?: Task }) {
                      ~~~~~~~~~~~~~~~~~~~~~~~~~~
    'initRecoderWithHistoryItem' is declared here.

core/webview/webviewMessageHandler.ts:302:19 - error TS2551: Property 'initClineWithTask' does not exist on type 'RecoderProvider'. Did you mean 'initClineWithSubTask'?

302    await provider.initClineWithTask(message.text, message.images)
                      ~~~~~~~~~~~~~~~~~

  core/webview/RecoderProvider.ts:523:15
    523  public async initClineWithSubTask(parent: Task, task?: string, images?: string[]) {
                      ~~~~~~~~~~~~~~~~~~~~
    'initClineWithSubTask' is declared here.

core/webview/webviewMessageHandler.ts:1198:52 - error TS2322: Type '{ customModePrompts: { [x: string]: { description?: string | undefined; roleDefinition?: string | undefined; whenToUse?: string | undefined; customInstructions?: string | undefined; } | undefined; }; ... 97 more ...; followupAutoApproveTimeoutMs: number; }' is not assignable to type 'ExtensionState'.
  Type '{ customModePrompts: { [x: string]: { description?: string | undefined; roleDefinition?: string | undefined; whenToUse?: string | undefined; customInstructions?: string | undefined; } | undefined; }; ... 97 more ...; followupAutoApproveTimeoutMs: number; }' is missing the following properties from type '{ version: string; clineMessages: { type: "ask" | "say"; ts: number; reasoning?: string | undefined; partial?: boolean | undefined; text?: string | undefined; ask?: "followup" | "command" | ... 13 more ... | undefined; ... 7 more ...; apiProtocol?: "openai" | ... 1 more ... | undefined; }[]; ... 47 more ...; globalW...': localWorkflowToggles, globalRulesToggles, localRulesToggles, globalWorkflowToggles

1198     provider.postMessageToWebview({ type: "state", state: stateWithPrompts })
                                                        ~~~~~

  shared/ExtensionMessage.ts:139:2
    139  state?: ExtensionState
         ~~~~~
    The expected type comes from property 'state' which is declared here on type 'ExtensionMessage'

services/backend-client.ts:122:41 - error TS2531: Object is possibly 'null'.

122       console.log(`✅ Authenticated as ${this.currentSession.email}`);
                                            ~~~~~~~~~~~~~~~~~~~

services/backend-client.ts:123:7 - error TS2322: Type 'UserSession | null' is not assignable to type 'UserSession'.
  Type 'null' is not assignable to type 'UserSession'.

123       return this.currentSession;
          ~~~~~~

services/backend-client.ts:153:56 - error TS2531: Object is possibly 'null'.

153       console.log(`✅ Registered and authenticated as ${this.currentSession.email}`);
                                                           ~~~~~~~~~~~~~~~~~~~

services/backend-client.ts:154:7 - error TS2322: Type 'UserSession | null' is not assignable to type 'UserSession'.
  Type 'null' is not assignable to type 'UserSession'.

154       return this.currentSession;
          ~~~~~~

services/unified-auth-provider.ts:7:10 - error TS2305: Module '"@recoder/unified-auth"' has no exported member 'createPlatformAuth'.

7 import { createPlatformAuth } from '@recoder/unified-auth';
           ~~~~~~~~~~~~~~~~~~

services/unified-auth-provider.ts:229:7 - error TS2561: Object literal may only specify known properties, but 'placeholder' does not exist in type 'InputBoxOptions'. Did you mean to write 'placeHolder'?

229       placeholder: 'rcd_xxxxxxxx_xxxxxxxx...',
          ~~~~~~~~~~~

services/unified-auth-provider.ts:405:7 - error TS2561: Object literal may only specify known properties, but 'placeholder' does not exist in type 'InputBoxOptions'. Did you mean to write 'placeHolder'?

405       placeholder: 'rcd_xxxxxxxx_xxxxxxxx...',
          ~~~~~~~~~~~


Found 60 errors in 14 files.

Errors  Files
     1  activate/handleUri.ts:34
     4  activate/registerCommands.ts:153
     1  api/index.ts:73
     8  api/providers/huggingface.ts:6
     3  api/providers/recoder-openrouter.ts:5
    12  api/providers/together.ts:11
     1  core/kilocode/webview/webviewMessageHandlerUtils.ts:54
     1  core/task/Task.ts:1493
     1  core/tools/newTaskTool.ts:89
     2  core/webview/__tests__/ClineProvider.spec.ts:511
    16  core/webview/RecoderProvider.ts:174
     3  core/webview/webviewMessageHandler.ts:132
     4  services/backend-client.ts:122
     3  services/unified-auth-provider.ts:7
 ELIFECYCLE  Command failed with exit code 2.
Extension typecheck not configured
arhansubasi@192 recoder.xyz % 
arhansubasi@192 recoder.xyz % npm run build

> recoder@1.0.0 build
> pnpm run build:all


> recoder@1.0.0 build:all /Users/arhansubasi/recoder.xyz
> npm-run-all --parallel build:shared build:packages build:core && npm-run-all --parallel build:web build:chat build:mobile build:desktop build:extension build:browser-extension


> recoder@1.0.0 build:packages /Users/arhansubasi/recoder.xyz
> npm-run-all --parallel build:cli build:router build:analytics build:intelligence build:plugins build:security build:web-ai


> recoder@1.0.0 build:shared /Users/arhansubasi/recoder.xyz
> cd packages/shared && pnpm build


> recoder@1.0.0 build:core /Users/arhansubasi/recoder.xyz
> npm-run-all --parallel build:backend build:engine


> recoder-shared@1.0.0 build /Users/arhansubasi/recoder.xyz/packages/shared
> tsc


> recoder@1.0.0 build:plugins /Users/arhansubasi/recoder.xyz
> cd packages/plugins && pnpm build


> recoder@1.0.0 build:analytics /Users/arhansubasi/recoder.xyz
> cd packages/analytics && pnpm build


> recoder@1.0.0 build:router /Users/arhansubasi/recoder.xyz
> cd packages/recoder-cli-router && pnpm build


> recoder@1.0.0 build:cli /Users/arhansubasi/recoder.xyz
> cd packages/cli && pnpm build


> recoder@1.0.0 build:web-ai /Users/arhansubasi/recoder.xyz
> cd packages/web-ai-assistant && pnpm build


> recoder@1.0.0 build:security /Users/arhansubasi/recoder.xyz
> cd packages/security && pnpm build


> recoder@1.0.0 build:engine /Users/arhansubasi/recoder.xyz
> cd production-engine && pnpm build


> recoder@1.0.0 build:intelligence /Users/arhansubasi/recoder.xyz
> cd packages/intelligence && pnpm build


> recoder@1.0.0 build:backend /Users/arhansubasi/recoder.xyz
> cd backend && pnpm build || echo 'Backend build not configured'


> recoder-plugins@1.0.0 build /Users/arhansubasi/recoder.xyz/packages/plugins
> tsc


> recoder-analytics@1.0.0 build /Users/arhansubasi/recoder.xyz/packages/analytics
> tsc --noEmitOnError false --skipLibCheck


> recoder-cli-router@2.2.0 build /Users/arhansubasi/recoder.xyz/packages/recoder-cli-router
> npm-run-all build:esbuild build:copy


> recoder-web-ai-assistant@1.0.0 build /Users/arhansubasi/recoder.xyz/packages/web-ai-assistant
> tsc


> recoder-cli@1.0.1 build /Users/arhansubasi/recoder.xyz/packages/cli
> tsc -p tsconfig.build.json


> recoder-security@1.0.0 build /Users/arhansubasi/recoder.xyz/packages/security
> tsc


> recoder-intelligence@1.0.0 build /Users/arhansubasi/recoder.xyz/packages/intelligence
> tsc


> @recoder/production-engine@2.0.0 build /Users/arhansubasi/recoder.xyz/production-engine
> tsc


> backend@1.0.0 build /Users/arhansubasi/recoder.xyz/backend
> tsc


> recoder-cli-router@2.2.0 build:esbuild /Users/arhansubasi/recoder.xyz/packages/recoder-cli-router
> esbuild src/cli.ts --bundle --platform=node --outfile=dist/cli.js --external:vscode --external:@roo-code/types --external:@musistudio/llms --external:tiktoken --external:node-cache --external:sanitize-filename --external:axios --external:openai --external:@anthropic-ai/sdk --external:@anthropic-ai/vertex-sdk --external:google-auth-library --external:@cerebras/cerebras_cloud_sdk --external:@aws-sdk/client-bedrock-runtime --external:@aws-sdk/credential-providers --external:@mistralai/mistralai --external:@google/genai --external:@lmstudio/sdk --external:@dotenvx/dotenvx --external:dotenv --external:uuid --external:fastify --external:zod

▲ [WARNING] The condition "types" here will never be used as it comes after both "import" and "require" [package.json]

    ../shared/package.json:14:6:
      14 │       "types": "./dist/index.d.ts"
         ╵       ~~~~~~~

  The "import" condition comes earlier and will be used for all "import" statements:

    ../shared/package.json:12:6:
      12 │       "import": "./dist/index.js",
         ╵       ~~~~~~~~

  The "require" condition comes earlier and will be used for all "require" calls:

    ../shared/package.json:13:6:
      13 │       "require": "./dist/index.js",
         ╵       ~~~~~~~~~

▲ [WARNING] The condition "types" here will never be used as it comes after both "import" and "require" [package.json]

    ../shared/package.json:20:6:
      20 │       "types": "./dist/types/ai-models.d.ts"
         ╵       ~~~~~~~

  The "import" condition comes earlier and will be used for all "import" statements:

    ../shared/package.json:18:6:
      18 │       "import": "./dist/types/ai-models.js",
         ╵       ~~~~~~~~

  The "require" condition comes earlier and will be used for all "require" calls:

    ../shared/package.json:19:6:
      19 │       "require": "./dist/types/ai-models.js",
         ╵       ~~~~~~~~~

▲ [WARNING] The condition "types" here will never be used as it comes after both "import" and "require" [package.json]

    ../shared/package.json:26:6:
      26 │       "types": "./dist/types/*.d.ts"
         ╵       ~~~~~~~

  The "import" condition comes earlier and will be used for all "import" statements:

    ../shared/package.json:24:6:
      24 │       "import": "./dist/types/*.js",
         ╵       ~~~~~~~~

  The "require" condition comes earlier and will be used for all "require" calls:

    ../shared/package.json:25:6:
      25 │       "require": "./dist/types/*.js",
         ╵       ~~~~~~~~~

▲ [WARNING] The condition "types" here will never be used as it comes after both "import" and "require" [package.json]

    ../shared/package.json:32:6:
      32 │       "types": "./dist/collaboration/index.d.ts"
         ╵       ~~~~~~~

  The "import" condition comes earlier and will be used for all "import" statements:

    ../shared/package.json:30:6:
      30 │       "import": "./dist/collaboration/index.js",
         ╵       ~~~~~~~~

  The "require" condition comes earlier and will be used for all "require" calls:

    ../shared/package.json:31:6:
      31 │       "require": "./dist/collaboration/index.js",
         ╵       ~~~~~~~~~

▲ [WARNING] The condition "types" here will never be used as it comes after both "import" and "require" [package.json]

    ../shared/package.json:38:6:
      38 │       "types": "./dist/collaboration/*.d.ts"
         ╵       ~~~~~~~

  The "import" condition comes earlier and will be used for all "import" statements:

    ../shared/package.json:36:6:
      36 │       "import": "./dist/collaboration/*.js",
         ╵       ~~~~~~~~

  The "require" condition comes earlier and will be used for all "require" calls:

    ../shared/package.json:37:6:
      37 │       "require": "./dist/collaboration/*.js",
         ╵       ~~~~~~~~~

5 warnings

  dist/cli.js  833.6kb

⚡ Done in 104ms

> recoder-cli-router@2.2.0 build:copy /Users/arhansubasi/recoder.xyz/packages/recoder-cli-router
> shx cp ../../node_modules/tiktoken/tiktoken_bg.wasm dist/tiktoken_bg.wasm || shx cp node_modules/tiktoken/tiktoken_bg.wasm dist/tiktoken_bg.wasm || echo 'Warning: tiktoken WASM file not found, skipping copy'

src/routes/cli-api.ts:63:39 - error TS2339: Property 'getUserSubscription' does not exist on type 'UserService'.

63     const userSub = await userService.getUserSubscription(userId);
                                         ~~~~~~~~~~~~~~~~~~~

src/routes/cli-api.ts:73:52 - error TS2551: Property 'checkUserRateLimit' does not exist on type 'RateLimitService'. Did you mean 'checkRateLimit'?

73     const rateLimitResult = await rateLimitService.checkUserRateLimit(userId);
                                                      ~~~~~~~~~~~~~~~~~~

  src/services/rate-limit-service.ts:168:9
    168   async checkRateLimit(
                ~~~~~~~~~~~~~~
    'checkRateLimit' is declared here.

src/routes/cli-api.ts:120:54 - error TS2551: Property 'generateContent' does not exist on type 'OpenRouterService'. Did you mean 'generateCode'?

120     const generationResult = await openRouterService.generateContent(
                                                         ~~~~~~~~~~~~~~~

  src/services/openrouter-service.ts:252:9
    252   async generateCode(
                ~~~~~~~~~~~~
    'generateCode' is declared here.

src/routes/cli-api.ts:136:26 - error TS2339: Property 'recordUsage' does not exist on type 'BillingService'.

136     await billingService.recordUsage({
                             ~~~~~~~~~~~

src/routes/cli-api.ts:155:23 - error TS2339: Property 'incrementUsage' does not exist on type 'UserService'.

155     await userService.incrementUsage(userId, {
                          ~~~~~~~~~~~~~~

src/routes/cli-api.ts:228:39 - error TS2339: Property 'getUserSubscription' does not exist on type 'UserService'.

228     const userSub = await userService.getUserSubscription(userId);
                                          ~~~~~~~~~~~~~~~~~~~


Found 6 errors in the same file, starting at: src/routes/cli-api.ts:63

 ELIFECYCLE  Command failed with exit code 2.
 ELIFECYCLE  Command failed with exit code 2.
 ELIFECYCLE  Command failed.
ERROR: "build:engine" exited with 2.
 ELIFECYCLE  Command failed.
 ELIFECYCLE  Command failed with exit code 1.
 ELIFECYCLE  Command failed.
 ELIFECYCLE  Command failed.
ERROR: "build:core" exited with 1.
 ELIFECYCLE  Command failed with exit code 1.
 ELIFECYCLE  Command failed.
arhansubasi@192 recoder.xyz % 