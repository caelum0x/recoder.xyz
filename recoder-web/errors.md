 in type 'Without<SecuritySettingsCreateInput, SecuritySettingsUncheckedCreateInput> & SecuritySettingsUncheckedCreateInput'.

132       backupCodes: hashedBackupCodes,
          ~~~~~~~~~~~

  node_modules/.prisma/client/index.d.ts:38673:5
    38673     create: XOR<SecuritySettingsCreateInput, SecuritySettingsUncheckedCreateInput>
              ~~~~~~
    The expected type comes from property 'create' which is declared here on type '{ select?: SecuritySettingsSelect<DefaultArgs> | null | undefined; omit?: SecuritySettingsOmit<DefaultArgs> | null | undefined; include?: SecuritySettingsInclude<...> | ... 1 more ... | undefined; where: SecuritySettingsWhereUniqueInput; create: (Without<...> & SecuritySettingsUncheckedCreateInput) | (Without<...> &...'

app/api/profile/2fa/backup-codes/route.ts:187:7 - error TS2353: Object literal may only specify known properties, and 'backupCodes' does not exist in type 'SecuritySettingsSelect<DefaultArgs>'.

187       backupCodes: true,
          ~~~~~~~~~~~

  node_modules/.prisma/client/index.d.ts:38332:5
    38332     select?: SecuritySettingsSelect<ExtArgs> | null
              ~~~~~~
    The expected type comes from property 'select' which is declared here on type '{ select?: SecuritySettingsSelect<DefaultArgs> | null | undefined; omit?: SecuritySettingsOmit<DefaultArgs> | null | undefined; include?: SecuritySettingsInclude<...> | ... 1 more ... | undefined; where: SecuritySettingsWhereUniqueInput; }'

app/api/profile/export/route.ts:406:9 - error TS2561: Object literal may only specify known properties, but 'mimeType' does not exist in type 'MediaFileSelect<DefaultArgs>'. Did you mean to write 'mimetype'?

406         mimeType: true,
            ~~~~~~~~

app/api/profile/export/route.ts:428:9 - error TS2353: Object literal may only specify known properties, and 'archived' does not exist in type 'NotificationSelect<DefaultArgs>'.

428         archived: true,
            ~~~~~~~~

app/api/projects/quick-start/route.ts:275:24 - error TS2339: Property 'commit' does not exist on type '{ url: string; branch: string; private: boolean; }'.

275     project.repository.commit = codeGeneration.commitHash;
                           ~~~~~~

app/api/projects/quick-start/route.ts:275:48 - error TS2339: Property 'commitHash' does not exist on type '{ success: boolean; projectId: any; commitHash: string; filesGenerated: number; features: any; dependencies: any; buildTime: number; steps: string[]; repository: { url: any; branch: string; initialized: boolean; }; environment: { ...; }; } | { ...; }'.
  Property 'commitHash' does not exist on type '{ success: boolean; error: string; projectId: any; filesGenerated: number; buildTime: number; steps: string[]; }'.

275     project.repository.commit = codeGeneration.commitHash;
                                                   ~~~~~~~~~~

app/api/pwa-generator/generate/route.ts:118:29 - error TS2345: Argument of type 'Buffer<ArrayBufferLike>' is not assignable to parameter of type 'BodyInit | null | undefined'.
  Type 'Buffer<ArrayBufferLike>' is missing the following properties from type 'URLSearchParams': size, append, delete, get, and 2 more.

118     return new NextResponse(zipBuffer, {
                                ~~~~~~~~~

app/api/router/[routerId]/cost-analytics/route.ts:77:33 - error TS2339: Property 'router' does not exist on type 'PrismaClient<{ adapter: any; log: ("warn" | "error")[]; errorFormat: "pretty"; }, "warn" | "error", DefaultArgs>'.

77     const router = await prisma.router.findFirst({
                                   ~~~~~~

app/api/router/[routerId]/cost-analytics/route.ts:140:33 - error TS2339: Property 'router' does not exist on type 'PrismaClient<{ adapter: any; log: ("warn" | "error")[]; errorFormat: "pretty"; }, "warn" | "error", DefaultArgs>'.

140     const router = await prisma.router.findFirst({
                                    ~~~~~~

app/api/router/[routerId]/cost-analytics/route.ts:183:37 - error TS2339: Property 'routerUsage' does not exist on type 'PrismaClient<{ adapter: any; log: ("warn" | "error")[]; errorFormat: "pretty"; }, "warn" | "error", DefaultArgs>'.

183   const usageRecords = await prisma.routerUsage.findMany({
                                        ~~~~~~~~~~~

app/api/router/[routerId]/cost-analytics/route.ts:426:18 - error TS2339: Property 'routerAnalytics' does not exist on type 'PrismaClient<{ adapter: any; log: ("warn" | "error")[]; errorFormat: "pretty"; }, "warn" | "error", DefaultArgs>'.

426     await prisma.routerAnalytics.create({
                     ~~~~~~~~~~~~~~~

app/api/router/[routerId]/export-analytics/route.ts:118:9 - error TS2353: Object literal may only specify known properties, and 'createdAt' does not exist in type 'UsageAnalyticsWhereInput'.

118         createdAt: {
            ~~~~~~~~~

app/api/router/[routerId]/export-analytics/route.ts:124:9 - error TS2353: Object literal may only specify known properties, and 'createdAt' does not exist in type 'UsageAnalyticsOrderByWithRelationInput | UsageAnalyticsOrderByWithRelationInput[]'.

124         createdAt: 'asc'
            ~~~~~~~~~

app/api/router/[routerId]/export-analytics/route.ts:154:27 - error TS2339: Property 'createdAt' does not exist on type '{ id: string; userId: string; success: boolean; provider: string | null; tokens: number | null; metadata: JsonValue; errorMessage: string | null; cost: number | null; platform: string | null; timestamp: Date; duration: number | null; eventType: string; errorCode: string | null; }'.

154         timestamp: record.createdAt,
                              ~~~~~~~~~

app/api/router/[routerId]/export-analytics/route.ts:155:27 - error TS2339: Property 'type' does not exist on type '{ id: string; userId: string; success: boolean; provider: string | null; tokens: number | null; metadata: JsonValue; errorMessage: string | null; cost: number | null; platform: string | null; timestamp: Date; duration: number | null; eventType: string; errorCode: string | null; }'.

155         eventType: record.type,
                              ~~~~

app/api/system/health/route.ts:28:63 - error TS2552: Cannot find name 'isActiveAlerts'. Did you mean 'activeAlerts'?

28     const overallHealth = determineOverallHealth(healthScore, isActiveAlerts, services)
                                                                 ~~~~~~~~~~~~~~

  app/api/system/health/route.ts:18:11
    18     const activeAlerts = performanceMonitor.getActiveAlerts()
                 ~~~~~~~~~~~~
    'activeAlerts' is declared here.

app/api/tooltips/context/route.ts:26:24 - error TS2353: Object literal may only specify known properties, and 'has' does not exist in type 'StringFilter<"Tooltip">'.

26           { context: { has: context } },
                          ~~~

  node_modules/.prisma/client/index.d.ts:98331:5
    98331     context?: StringFilter<"Tooltip"> | string
              ~~~~~~~
    The expected type comes from property 'context' which is declared here on type 'TooltipWhereInput'

app/api/tooltips/context/route.ts:27:24 - error TS2353: Object literal may only specify known properties, and 'has' does not exist in type 'StringFilter<"Tooltip">'.

27           { context: { has: 'global' } }
                          ~~~

  node_modules/.prisma/client/index.d.ts:98331:5
    98331     context?: StringFilter<"Tooltip"> | string
              ~~~~~~~
    The expected type comes from property 'context' which is declared here on type 'TooltipWhereInput'

app/api/tooltips/context/route.ts:32:11 - error TS2353: Object literal may only specify known properties, and 'in' does not exist in type 'JsonFilter<"Tooltip">'.

32           in: [userLevel, null]
             ~~

app/api/tooltips/context/route.ts:121:9 - error TS2353: Object literal may only specify known properties, and 'customizable' does not exist in type '(Without<TooltipCreateInput, TooltipUncheckedCreateInput> & TooltipUncheckedCreateInput) | (Without<...> & TooltipCreateInput)'.

121         customizable: true,
            ~~~~~~~~~~~~

  node_modules/.prisma/client/index.d.ts:84158:5
    84158     data: XOR<TooltipCreateInput, TooltipUncheckedCreateInput>
              ~~~~
    The expected type comes from property 'data' which is declared here on type '{ select?: TooltipSelect<DefaultArgs> | null | undefined; omit?: TooltipOmit<DefaultArgs> | null | undefined; include?: TooltipInclude<...> | ... 1 more ... | undefined; data: (Without<...> & TooltipUncheckedCreateInput) | (Without<...> & TooltipCreateInput); }'

app/api/tooltips/dismiss/[tooltipId]/route.ts:82:15 - error TS2353: Object literal may only specify known properties, and 'disabledReason' does not exist in type '(Without<TooltipUpdateInput, TooltipUncheckedUpdateInput> & TooltipUncheckedUpdateInput) | (Without<...> & TooltipUpdateInput)'.

82               disabledReason: 'High dismissal rate',
                 ~~~~~~~~~~~~~~

  node_modules/.prisma/client/index.d.ts:84210:5
    84210     data: XOR<TooltipUpdateInput, TooltipUncheckedUpdateInput>
              ~~~~
    The expected type comes from property 'data' which is declared here on type '{ select?: TooltipSelect<DefaultArgs> | null | undefined; omit?: TooltipOmit<DefaultArgs> | null | undefined; include?: TooltipInclude<...> | ... 1 more ... | undefined; data: (Without<...> & TooltipUncheckedUpdateInput) | (Without<...> & TooltipUpdateInput); where: TooltipWhereUniqueInput; }'

app/api/tooltips/dismiss/[tooltipId]/route.ts:92:20 - error TS2339: Property 'tooltipFeedback' does not exist on type 'PrismaClient<{ adapter: any; log: ("warn" | "error")[]; errorFormat: "pretty"; }, "warn" | "error", DefaultArgs>'.

92       await prisma.tooltipFeedback.create({
                      ~~~~~~~~~~~~~~~

app/api/tooltips/preferences/[userId]/route.ts:34:36 - error TS2339: Property 'tooltipPreferences' does not exist on type 'PrismaClient<{ adapter: any; log: ("warn" | "error")[]; errorFormat: "pretty"; }, "warn" | "error", DefaultArgs>'.

34     let preferences = await prisma.tooltipPreferences.findUnique({
                                      ~~~~~~~~~~~~~~~~~~

app/api/tooltips/preferences/[userId]/route.ts:40:34 - error TS2339: Property 'tooltipPreferences' does not exist on type 'PrismaClient<{ adapter: any; log: ("warn" | "error")[]; errorFormat: "pretty"; }, "warn" | "error", DefaultArgs>'.

40       preferences = await prisma.tooltipPreferences.create({
                                    ~~~~~~~~~~~~~~~~~~

app/api/tooltips/preferences/[userId]/route.ts:82:38 - error TS2339: Property 'tooltipPreferences' does not exist on type 'PrismaClient<{ adapter: any; log: ("warn" | "error")[]; errorFormat: "pretty"; }, "warn" | "error", DefaultArgs>'.

82     const preferences = await prisma.tooltipPreferences.upsert({
                                        ~~~~~~~~~~~~~~~~~~

app/api/tooltips/preferences/[userId]/route.ts:137:18 - error TS2339: Property 'tooltipPreferences' does not exist on type 'PrismaClient<{ adapter: any; log: ("warn" | "error")[]; errorFormat: "pretty"; }, "warn" | "error", DefaultArgs>'.

137     await prisma.tooltipPreferences.delete({
                     ~~~~~~~~~~~~~~~~~~

app/api/tooltips/reset/[userId]/route.ts:25:18 - error TS2339: Property 'tooltipPreferences' does not exist on type 'PrismaClient<{ adapter: any; log: ("warn" | "error")[]; errorFormat: "pretty"; }, "warn" | "error", DefaultArgs>'.

25     await prisma.tooltipPreferences.upsert({
                    ~~~~~~~~~~~~~~~~~~

app/api/tooltips/reset/[userId]/route.ts:108:38 - error TS2339: Property 'tooltipPreferences' does not exist on type 'PrismaClient<{ adapter: any; log: ("warn" | "error")[]; errorFormat: "pretty"; }, "warn" | "error", DefaultArgs>'.

108     const preferences = await prisma.tooltipPreferences.findUnique({
                                         ~~~~~~~~~~~~~~~~~~

app/api/user/[userId]/routers/route.ts:104:33 - error TS2339: Property 'router' does not exist on type 'PrismaClient<{ adapter: any; log: ("warn" | "error")[]; errorFormat: "pretty"; }, "warn" | "error", DefaultArgs>'.

104     const router = await prisma.router.upsert({
                                    ~~~~~~

app/api/user/[userId]/routers/route.ts:154:34 - error TS2339: Property 'router' does not exist on type 'PrismaClient<{ adapter: any; log: ("warn" | "error")[]; errorFormat: "pretty"; }, "warn" | "error", DefaultArgs>'.

154     const routers = await prisma.router.findMany({
                                     ~~~~~~

app/api/user/account/delete/route.ts:36:60 - error TS2769: No overload matches this call.
  Overload 1 of 2, '(password: string, hash: string): Promise<boolean>', gave the following error.
    Argument of type 'string | null' is not assignable to parameter of type 'string'.
      Type 'null' is not assignable to type 'string'.
  Overload 2 of 2, '(password: string, hash: string, callback?: Callback<boolean> | undefined, progressCallback?: ProgressCallback | undefined): void', gave the following error.
    Argument of type 'string | null' is not assignable to parameter of type 'string'.
      Type 'null' is not assignable to type 'string'.

36     const isPasswordValid = await bcrypt.compare(password, user.password)
                                                              ~~~~~~~~~~~~~


app/api/user/delete/route.ts:162:11 - error TS7034: Variable 'mockOwnedTeams' implicitly has type 'any[]' in some locations where its type cannot be determined.

162     const mockOwnedTeams = [
              ~~~~~~~~~~~~~~

app/api/user/delete/route.ts:167:12 - error TS7005: Variable 'mockOwnedTeams' implicitly has an 'any[]' type.

167     return mockOwnedTeams;
               ~~~~~~~~~~~~~~

app/api/user/integrations/api-keys/route.ts:84:9 - error TS2353: Object literal may only specify known properties, and 'hashedKey' does not exist in type 'Without<ApiKeyCreateInput, ApiKeyUncheckedCreateInput> & ApiKeyUncheckedCreateInput'.

84         hashedKey: hashedKey,
           ~~~~~~~~~

  node_modules/.prisma/client/index.d.ts:39706:5
    39706     data: XOR<ApiKeyCreateInput, ApiKeyUncheckedCreateInput>
              ~~~~
    The expected type comes from property 'data' which is declared here on type '{ select?: ApiKeySelect<DefaultArgs> | null | undefined; omit?: ApiKeyOmit<DefaultArgs> | null | undefined; include?: ApiKeyInclude<DefaultArgs> | null | undefined; data: (Without<...> & ApiKeyUncheckedCreateInput) | (Without<...> & ApiKeyCreateInput); }'

app/api/user/integrations/api-keys/route.ts:85:36 - error TS2339: Property 'scopes' does not exist on type '{ name: string; permissions: ("admin" | "write" | "read")[]; rateLimit: Record<string, any>; }'.

85         permissions: validatedData.scopes,
                                      ~~~~~~

app/api/user/integrations/api-keys/route.ts:86:34 - error TS2339: Property 'restrictions' does not exist on type '{ name: string; permissions: ("admin" | "write" | "read")[]; rateLimit: Record<string, any>; }'.

86         rateLimit: validatedData.restrictions,
                                    ~~~~~~~~~~~~

app/api/user/integrations/api-keys/route.ts:106:34 - error TS2339: Property 'scopes' does not exist on type '{ id: string; name: string; createdAt: Date; updatedAt: Date; userId: string; permissions: string[]; key: string | null; expiresAt: Date | null; lastUsedAt: Date | null; ... 4 more ...; isActive: boolean; }'.

106           permissions: newApiKey.scopes,
                                     ~~~~~~

app/api/user/integrations/connect/route.ts:110:53 - error TS2339: Property 'scopes' does not exist on type '{ clientId: string | undefined; clientSecret: string | undefined; authUrl: string; tokenUrl: string; permissions: string[]; redirectUri: string; } | { clientId: string | undefined; clientSecret: string | undefined; authUrl: string; tokenUrl: string; permissions: string[]; redirectUri: string; }'.
  Property 'scopes' does not exist on type '{ clientId: string | undefined; clientSecret: string | undefined; authUrl: string; tokenUrl: string; permissions: string[]; redirectUri: string; }'.

110       authUrl.searchParams.set('scope', oauthConfig.scopes.join(' '));
                                                        ~~~~~~

app/api/user/integrations/route.ts:95:7 - error TS2322: Type '{ userId: string; name: string; type: "github" | "aws" | "docker" | "gcp" | "azure" | "vercel" | "netlify" | "kubernetes" | "gitlab" | "bitbucket"; config: Record<string, any>; isEnabled: boolean; isConnected: false; }' is not assignable to type '(Without<UserIntegrationCreateInput, UserIntegrationUncheckedCreateInput> & UserIntegrationUncheckedCreateInput) | (Without<...> & UserIntegrationCreateInput)'.
  Type '{ userId: string; name: string; type: "github" | "aws" | "docker" | "gcp" | "azure" | "vercel" | "netlify" | "kubernetes" | "gitlab" | "bitbucket"; config: Record<string, any>; isEnabled: boolean; isConnected: false; }' is not assignable to type 'Without<UserIntegrationCreateInput, UserIntegrationUncheckedCreateInput> & UserIntegrationUncheckedCreateInput'.
    Property 'provider' is missing in type '{ userId: string; name: string; type: "github" | "aws" | "docker" | "gcp" | "azure" | "vercel" | "netlify" | "kubernetes" | "gitlab" | "bitbucket"; config: Record<string, any>; isEnabled: boolean; isConnected: false; }' but required in type 'UserIntegrationUncheckedCreateInput'.

95       data: {
         ~~~~

  node_modules/.prisma/client/index.d.ts:99749:5
    99749     provider: string
              ~~~~~~~~
    'provider' is declared here.
  node_modules/.prisma/client/index.d.ts:17694:5
    17694     data: XOR<UserIntegrationCreateInput, UserIntegrationUncheckedCreateInput>
              ~~~~
    The expected type comes from property 'data' which is declared here on type '{ select?: UserIntegrationSelect<DefaultArgs> | null | undefined; omit?: UserIntegrationOmit<DefaultArgs> | null | undefined; include?: UserIntegrationInclude<...> | ... 1 more ... | undefined; data: (Without<...> & UserIntegrationUncheckedCreateInput) | (Without<...> & UserIntegrationCreateInput); }'

app/api/user/integrations/route.ts:118:9 - error TS2353: Object literal may only specify known properties, and 'details' does not exist in type 'Without<AuditLogCreateInput, AuditLogUncheckedCreateInput> & AuditLogUncheckedCreateInput'.

118         details: {
            ~~~~~~~

  node_modules/.prisma/client/index.d.ts:20288:5
    20288     data: XOR<AuditLogCreateInput, AuditLogUncheckedCreateInput>
              ~~~~
    The expected type comes from property 'data' which is declared here on type '{ select?: AuditLogSelect<DefaultArgs> | null | undefined; omit?: AuditLogOmit<DefaultArgs> | null | undefined; include?: AuditLogInclude<...> | ... 1 more ... | undefined; data: (Without<...> & AuditLogUncheckedCreateInput) | (Without<...> & AuditLogCreateInput); }'

app/api/user/integrations/route.ts:207:9 - error TS2353: Object literal may only specify known properties, and 'details' does not exist in type 'Without<AuditLogCreateInput, AuditLogUncheckedCreateInput> & AuditLogUncheckedCreateInput'.

207         details: {
            ~~~~~~~

  node_modules/.prisma/client/index.d.ts:20288:5
    20288     data: XOR<AuditLogCreateInput, AuditLogUncheckedCreateInput>
              ~~~~
    The expected type comes from property 'data' which is declared here on type '{ select?: AuditLogSelect<DefaultArgs> | null | undefined; omit?: AuditLogOmit<DefaultArgs> | null | undefined; include?: AuditLogInclude<...> | ... 1 more ... | undefined; data: (Without<...> & AuditLogUncheckedCreateInput) | (Without<...> & AuditLogCreateInput); }'

app/api/user/integrations/route.ts:275:9 - error TS2353: Object literal may only specify known properties, and 'details' does not exist in type 'Without<AuditLogCreateInput, AuditLogUncheckedCreateInput> & AuditLogUncheckedCreateInput'.

275         details: {
            ~~~~~~~

  node_modules/.prisma/client/index.d.ts:20288:5
    20288     data: XOR<AuditLogCreateInput, AuditLogUncheckedCreateInput>
              ~~~~
    The expected type comes from property 'data' which is declared here on type '{ select?: AuditLogSelect<DefaultArgs> | null | undefined; omit?: AuditLogOmit<DefaultArgs> | null | undefined; include?: AuditLogInclude<...> | ... 1 more ... | undefined; data: (Without<...> & AuditLogUncheckedCreateInput) | (Without<...> & AuditLogCreateInput); }'

app/api/user/integrations/webhooks/route.ts:236:7 - error TS2322: Type '{ userId: string; url: string; events: ("project.created" | "project.updated" | "project.deleted" | "deployment.started" | "deployment.completed" | "deployment.failed" | "ai.generation.completed" | ... 6 more ... | "security.alert.created")[]; secret: string; isActive: true; }' is not assignable to type '(Without<WebhookCreateInput, WebhookUncheckedCreateInput> & WebhookUncheckedCreateInput) | (Without<...> & WebhookCreateInput)'.
  Type '{ userId: string; url: string; events: ("project.created" | "project.updated" | "project.deleted" | "deployment.started" | "deployment.completed" | "deployment.failed" | "ai.generation.completed" | ... 6 more ... | "security.alert.created")[]; secret: string; isActive: true; }' is not assignable to type 'Without<WebhookCreateInput, WebhookUncheckedCreateInput> & WebhookUncheckedCreateInput'.
    Property 'name' is missing in type '{ userId: string; url: string; events: ("project.created" | "project.updated" | "project.deleted" | "deployment.started" | "deployment.completed" | "deployment.failed" | "ai.generation.completed" | ... 6 more ... | "security.alert.created")[]; secret: string; isActive: true; }' but required in type 'WebhookUncheckedCreateInput'.

236       data: {
          ~~~~

  node_modules/.prisma/client/index.d.ts:100606:5
    100606     name: string
               ~~~~
    'name' is declared here.
  node_modules/.prisma/client/index.d.ts:26143:5
    26143     data: XOR<WebhookCreateInput, WebhookUncheckedCreateInput>
              ~~~~
    The expected type comes from property 'data' which is declared here on type '{ select?: WebhookSelect<DefaultArgs> | null | undefined; omit?: WebhookOmit<DefaultArgs> | null | undefined; include?: WebhookInclude<...> | ... 1 more ... | undefined; data: (Without<...> & WebhookUncheckedCreateInput) | (Without<...> & WebhookCreateInput); }'

app/api/user/notifications/[notificationId]/star/route.ts:25:9 - error TS2353: Object literal may only specify known properties, and 'starred' does not exist in type '(Without<NotificationUpdateInput, NotificationUncheckedUpdateInput> & NotificationUncheckedUpdateInput) | (Without<...> & NotificationUpdateInput)'.

25         starred: true
           ~~~~~~~

  node_modules/.prisma/client/index.d.ts:21524:5
    21524     data: XOR<NotificationUpdateInput, NotificationUncheckedUpdateInput>
              ~~~~
    The expected type comes from property 'data' which is declared here on type '{ select?: NotificationSelect<DefaultArgs> | null | undefined; omit?: NotificationOmit<DefaultArgs> | null | undefined; include?: NotificationInclude<...> | ... 1 more ... | undefined; data: (Without<...> & NotificationUncheckedUpdateInput) | (Without<...> & NotificationUpdateInput); where: NotificationWhereUniqueIn...'

app/api/user/notifications/[notificationId]/star/route.ts:62:9 - error TS2353: Object literal may only specify known properties, and 'starred' does not exist in type '(Without<NotificationUpdateInput, NotificationUncheckedUpdateInput> & NotificationUncheckedUpdateInput) | (Without<...> & NotificationUpdateInput)'.

62         starred: false
           ~~~~~~~

  node_modules/.prisma/client/index.d.ts:21524:5
    21524     data: XOR<NotificationUpdateInput, NotificationUncheckedUpdateInput>
              ~~~~
    The expected type comes from property 'data' which is declared here on type '{ select?: NotificationSelect<DefaultArgs> | null | undefined; omit?: NotificationOmit<DefaultArgs> | null | undefined; include?: NotificationInclude<...> | ... 1 more ... | undefined; data: (Without<...> & NotificationUncheckedUpdateInput) | (Without<...> & NotificationUpdateInput); where: NotificationWhereUniqueIn...'

app/api/user/notifications/archive/route.ts:26:9 - error TS2353: Object literal may only specify known properties, and 'archived' does not exist in type '(Without<NotificationUpdateManyMutationInput, NotificationUncheckedUpdateManyInput> & NotificationUncheckedUpdateManyInput) | (Without<...> & NotificationUpdateManyMutationInput)'.

26         archived: true
           ~~~~~~~~

  node_modules/.prisma/client/index.d.ts:21538:5
    21538     data: XOR<NotificationUpdateManyMutationInput, NotificationUncheckedUpdateManyInput>
              ~~~~
    The expected type comes from property 'data' which is declared here on type '{ data: (Without<NotificationUpdateManyMutationInput, NotificationUncheckedUpdateManyInput> & NotificationUncheckedUpdateManyInput) | (Without<...> & NotificationUpdateManyMutationInput); where?: NotificationWhereInput | undefined; limit?: number | undefined; }'

app/api/user/notifications/mark-read/route.ts:26:9 - error TS2353: Object literal may only specify known properties, and 'read' does not exist in type '(Without<NotificationUpdateManyMutationInput, NotificationUncheckedUpdateManyInput> & NotificationUncheckedUpdateManyInput) | (Without<...> & NotificationUpdateManyMutationInput)'.

26         read: true
           ~~~~

  node_modules/.prisma/client/index.d.ts:21538:5
    21538     data: XOR<NotificationUpdateManyMutationInput, NotificationUncheckedUpdateManyInput>
              ~~~~
    The expected type comes from property 'data' which is declared here on type '{ data: (Without<NotificationUpdateManyMutationInput, NotificationUncheckedUpdateManyInput> & NotificationUncheckedUpdateManyInput) | (Without<...> & NotificationUpdateManyMutationInput); where?: NotificationWhereInput | undefined; limit?: number | undefined; }'

app/api/user/notifications/mark-unread/route.ts:26:9 - error TS2353: Object literal may only specify known properties, and 'read' does not exist in type '(Without<NotificationUpdateManyMutationInput, NotificationUncheckedUpdateManyInput> & NotificationUncheckedUpdateManyInput) | (Without<...> & NotificationUpdateManyMutationInput)'.

26         read: false
           ~~~~

  node_modules/.prisma/client/index.d.ts:21538:5
    21538     data: XOR<NotificationUpdateManyMutationInput, NotificationUncheckedUpdateManyInput>
              ~~~~
    The expected type comes from property 'data' which is declared here on type '{ data: (Without<NotificationUpdateManyMutationInput, NotificationUncheckedUpdateManyInput> & NotificationUncheckedUpdateManyInput) | (Without<...> & NotificationUpdateManyMutationInput); where?: NotificationWhereInput | undefined; limit?: number | undefined; }'

app/api/user/notifications/preferences/route.ts:73:49 - error TS2339: Property 'userNotificationSettings' does not exist on type 'PrismaClient<{ adapter: any; log: ("warn" | "error")[]; errorFormat: "pretty"; }, "warn" | "error", DefaultArgs>'.

73     let userNotificationSettings = await prisma.userNotificationSettings.findUnique({
                                                   ~~~~~~~~~~~~~~~~~~~~~~~~

app/api/user/notifications/preferences/route.ts:131:47 - error TS2339: Property 'userNotificationSettings' does not exist on type 'PrismaClient<{ adapter: any; log: ("warn" | "error")[]; errorFormat: "pretty"; }, "warn" | "error", DefaultArgs>'.

131       userNotificationSettings = await prisma.userNotificationSettings.create({
                                                  ~~~~~~~~~~~~~~~~~~~~~~~~

app/api/user/notifications/preferences/route.ts:168:51 - error TS2339: Property 'userNotificationSettings' does not exist on type 'PrismaClient<{ adapter: any; log: ("warn" | "error")[]; errorFormat: "pretty"; }, "warn" | "error", DefaultArgs>'.

168     const userNotificationSettings = await prisma.userNotificationSettings.upsert({
                                                      ~~~~~~~~~~~~~~~~~~~~~~~~

app/api/user/notifications/route.ts:65:9 - error TS2353: Object literal may only specify known properties, and 'starred' does not exist in type 'NotificationSelect<DefaultArgs>'.

65         starred: true,
           ~~~~~~~

app/api/user/notifications/route.ts:253:7 - error TS2353: Object literal may only specify known properties, and 'starred' does not exist in type '(Without<NotificationUpdateManyMutationInput, NotificationUncheckedUpdateManyInput> & NotificationUncheckedUpdateManyInput) | (Without<...> & NotificationUpdateManyMutationInput)'.

253       starred: true
          ~~~~~~~

  node_modules/.prisma/client/index.d.ts:21538:5
    21538     data: XOR<NotificationUpdateManyMutationInput, NotificationUncheckedUpdateManyInput>
              ~~~~
    The expected type comes from property 'data' which is declared here on type '{ data: (Without<NotificationUpdateManyMutationInput, NotificationUncheckedUpdateManyInput> & NotificationUncheckedUpdateManyInput) | (Without<...> & NotificationUpdateManyMutationInput); where?: NotificationWhereInput | undefined; limit?: number | undefined; }'

app/api/user/notifications/route.ts:271:7 - error TS2353: Object literal may only specify known properties, and 'starred' does not exist in type '(Without<NotificationUpdateManyMutationInput, NotificationUncheckedUpdateManyInput> & NotificationUncheckedUpdateManyInput) | (Without<...> & NotificationUpdateManyMutationInput)'.

271       starred: false
          ~~~~~~~

  node_modules/.prisma/client/index.d.ts:21538:5
    21538     data: XOR<NotificationUpdateManyMutationInput, NotificationUncheckedUpdateManyInput>
              ~~~~
    The expected type comes from property 'data' which is declared here on type '{ data: (Without<NotificationUpdateManyMutationInput, NotificationUncheckedUpdateManyInput> & NotificationUncheckedUpdateManyInput) | (Without<...> & NotificationUpdateManyMutationInput); where?: NotificationWhereInput | undefined; limit?: number | undefined; }'

app/api/user/privacy/settings/route.ts:53:38 - error TS2551: Property 'userPrivacySettings' does not exist on type 'PrismaClient<{ adapter: any; log: ("warn" | "error")[]; errorFormat: "pretty"; }, "warn" | "error", DefaultArgs>'. Did you mean 'privacySettings'?

53     const userPrivacy = await prisma.userPrivacySettings.findUnique({
                                        ~~~~~~~~~~~~~~~~~~~

  node_modules/.prisma/client/index.d.ts:723:7
    723   get privacySettings(): Prisma.PrivacySettingsDelegate<ExtArgs, ClientOptions>;
              ~~~~~~~~~~~~~~~
    'privacySettings' is declared here.

app/api/user/privacy/settings/route.ts:94:44 - error TS2551: Property 'userPrivacySettings' does not exist on type 'PrismaClient<{ adapter: any; log: ("warn" | "error")[]; errorFormat: "pretty"; }, "warn" | "error", DefaultArgs>'. Did you mean 'privacySettings'?

94       const createdSettings = await prisma.userPrivacySettings.create({
                                              ~~~~~~~~~~~~~~~~~~~

  node_modules/.prisma/client/index.d.ts:723:7
    723   get privacySettings(): Prisma.PrivacySettingsDelegate<ExtArgs, ClientOptions>;
              ~~~~~~~~~~~~~~~
    'privacySettings' is declared here.

app/api/user/privacy/settings/route.ts:174:42 - error TS2551: Property 'userPrivacySettings' does not exist on type 'PrismaClient<{ adapter: any; log: ("warn" | "error")[]; errorFormat: "pretty"; }, "warn" | "error", DefaultArgs>'. Did you mean 'privacySettings'?

174     const updatedSettings = await prisma.userPrivacySettings.upsert({
                                             ~~~~~~~~~~~~~~~~~~~

  node_modules/.prisma/client/index.d.ts:723:7
    723   get privacySettings(): Prisma.PrivacySettingsDelegate<ExtArgs, ClientOptions>;
              ~~~~~~~~~~~~~~~
    'privacySettings' is declared here.

app/api/user/security/2fa/setup/route.ts:35:18 - error TS2339: Property 'two_factor_enabled' does not exist on type 'UserProfile'.

35     if (profile?.two_factor_enabled) {
                    ~~~~~~~~~~~~~~~~~~

app/api/user/security/2fa/verify/route.ts:74:7 - error TS2353: Object literal may only specify known properties, and 'two_factor_enabled' does not exist in type '{ name?: string | undefined; username?: string | undefined; bio?: string | undefined; location?: string | undefined; company?: string | undefined; avatar_url?: string | undefined; }'.

74       two_factor_enabled: true,
         ~~~~~~~~~~~~~~~~~~

app/api/user/security/change-password/route.ts:40:74 - error TS2769: No overload matches this call.
  Overload 1 of 2, '(password: string, hash: string): Promise<boolean>', gave the following error.
    Argument of type 'string | null' is not assignable to parameter of type 'string'.
      Type 'null' is not assignable to type 'string'.
  Overload 2 of 2, '(password: string, hash: string, callback?: Callback<boolean> | undefined, progressCallback?: ProgressCallback | undefined): void', gave the following error.
    Argument of type 'string | null' is not assignable to parameter of type 'string'.
      Type 'null' is not assignable to type 'string'.

40     const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password)
                                                                            ~~~~~~~~~~~~~


app/api/user/security/change-password/route.ts:46:62 - error TS2769: No overload matches this call.
  Overload 1 of 2, '(password: string, hash: string): Promise<boolean>', gave the following error.
    Argument of type 'string | null' is not assignable to parameter of type 'string'.
      Type 'null' is not assignable to type 'string'.
  Overload 2 of 2, '(password: string, hash: string, callback?: Callback<boolean> | undefined, progressCallback?: ProgressCallback | undefined): void', gave the following error.
    Argument of type 'string | null' is not assignable to parameter of type 'string'.
      Type 'null' is not assignable to type 'string'.

46     const isSamePassword = await bcrypt.compare(newPassword, user.password)
                                                                ~~~~~~~~~~~~~


app/api/user/security/change-password/route.ts:60:9 - error TS2353: Object literal may only specify known properties, and 'passwordUpdatedAt' does not exist in type '(Without<UserUpdateInput, UserUncheckedUpdateInput> & UserUncheckedUpdateInput) | (Without<...> & UserUpdateInput)'.

60         passwordUpdatedAt: new Date()
           ~~~~~~~~~~~~~~~~~

  node_modules/.prisma/client/index.d.ts:9478:5
    9478     data: XOR<UserUpdateInput, UserUncheckedUpdateInput>
             ~~~~
    The expected type comes from property 'data' which is declared here on type '{ select?: UserSelect<DefaultArgs> | null | undefined; omit?: UserOmit<DefaultArgs> | null | undefined; include?: UserInclude<DefaultArgs> | null | undefined; data: (Without<...> & UserUncheckedUpdateInput) | (Without<...> & UserUpdateInput); where: UserWhereUniqueInput; }'

app/api/user/security/change-password/route.ts:90:40 - error TS2339: Property 'passwordUpdatedAt' does not exist on type '{ id: string; email: string; name: string | null; emailVerified: Date | null; image: string | null; role: string; password: string | null; twoFactorEnabled: boolean; totpSecret: string | null; ... 7 more ...; country: string | null; }'.

90       passwordLastChanged: updatedUser.passwordUpdatedAt?.toISOString()
                                          ~~~~~~~~~~~~~~~~~

app/api/user/security/sessions/[sessionId]/route.ts:31:21 - error TS2339: Property 'isCurrent' does not exist on type '{ id: string; createdAt: Date; userId: string; permissions: string[]; refreshToken: string | null; platform: string | null; deviceId: string | null; accessToken: string; expiresAt: Date; lastUsedAt: Date | null; }'.

31     if (userSession.isCurrent) {
                       ~~~~~~~~~

app/api/user/security/sessions/[sessionId]/route.ts:39:9 - error TS2353: Object literal may only specify known properties, and 'isActive' does not exist in type '(Without<UserSessionUpdateInput, UserSessionUncheckedUpdateInput> & UserSessionUncheckedUpdateInput) | (Without<...> & UserSessionUpdateInput)'.

39         isActive: false,
           ~~~~~~~~

  node_modules/.prisma/client/index.d.ts:88699:5
    88699     data: XOR<UserSessionUpdateInput, UserSessionUncheckedUpdateInput>
              ~~~~
    The expected type comes from property 'data' which is declared here on type '{ select?: UserSessionSelect<DefaultArgs> | null | undefined; omit?: UserSessionOmit<DefaultArgs> | null | undefined; include?: UserSessionInclude<...> | ... 1 more ... | undefined; data: (Without<...> & UserSessionUncheckedUpdateInput) | (Without<...> & UserSessionUpdateInput); where: UserSessionWhereUniqueInput; }'

app/api/user/security/sessions/[sessionId]/route.ts:56:35 - error TS2339: Property 'deviceName' does not exist on type '{ id: string; createdAt: Date; userId: string; permissions: string[]; refreshToken: string | null; platform: string | null; deviceId: string | null; accessToken: string; expiresAt: Date; lastUsedAt: Date | null; }'.

56           deviceName: userSession.deviceName,
                                     ~~~~~~~~~~

app/api/user/security/sessions/[sessionId]/route.ts:57:34 - error TS2339: Property 'ipAddress' does not exist on type '{ id: string; createdAt: Date; userId: string; permissions: string[]; refreshToken: string | null; platform: string | null; deviceId: string | null; accessToken: string; expiresAt: Date; lastUsedAt: Date | null; }'.

57           ipAddress: userSession.ipAddress
                                    ~~~~~~~~~

app/dashboard/router-analytics/page.tsx:131:13 - error TS7030: Not all code paths return a value.

131   useEffect(() => {
                ~~~~~~~

app/deploy/page.tsx:147:27 - error TS7006: Parameter 'deploymentId' implicitly has an 'any' type.

147   const handleRollback = (deploymentId) => {
                              ~~~~~~~~~~~~

app/game-development/components/GameAnalyticsDashboard.tsx:395:72 - error TS18048: 'value' is possibly 'undefined'.

395                       label={({ category, value }) => `${category}: $${value.toLocaleString()}`}
                                                                           ~~~~~

app/game-development/components/GameAssetManager.tsx:336:37 - error TS18046: 'error' is of type 'unknown'.

336       alert(`Optimization failed: ${error.message}`)
                                        ~~~~~

app/game-development/components/GameBuildManager.tsx:170:39 - error TS18046: 'error' is of type 'unknown'.

170       alert(`Build creation failed: ${error.message}`)
                                          ~~~~~

app/game-development/components/GameBuildManager.tsx:194:40 - error TS18046: 'error' is of type 'unknown'.

194       alert(`Failed to cancel build: ${error.message}`)
                                           ~~~~~

app/game-development/components/GameBuildManager.tsx:216:39 - error TS18046: 'error' is of type 'unknown'.

216       alert(`Failed to retry build: ${error.message}`)
                                          ~~~~~

app/game-development/components/GameRoomBrowser.tsx:118:37 - error TS18046: 'error' is of type 'unknown'.

118       alert(`Failed to join room: ${error.message}`)
                                        ~~~~~

app/game-development/components/UnityProjectManager.tsx:88:13 - error TS18046: 'error' is of type 'unknown'.

88       alert(error.message || 'Failed to create project')
               ~~~~~

app/game-development/components/UnityScriptGenerator.tsx:308:23 - error TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ MonoBehaviour: string[]; ScriptableObject: string[]; Editor: string[]; }'.
  No index signature with a parameter of type 'string' was found on type '{ MonoBehaviour: string[]; ScriptableObject: string[]; Editor: string[]; }'.

308                     {(scriptExamples[formData.scriptType] || []).map((example, index) => (
                          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app/game-development/components/UnityScriptGenerator.tsx:308:71 - error TS7006: Parameter 'example' implicitly has an 'any' type.

308                     {(scriptExamples[formData.scriptType] || []).map((example, index) => (
                                                                          ~~~~~~~

app/game-development/components/UnityScriptGenerator.tsx:308:80 - error TS7006: Parameter 'index' implicitly has an 'any' type.

308                     {(scriptExamples[formData.scriptType] || []).map((example, index) => (
                                                                                   ~~~~~

app/preview/page.tsx:57:25 - error TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ desktop: { width: number; height: number; userAgent: string; }; tablet: { width: number; height: number; userAgent: string; }; mobile: { width: number; height: number; userAgent: string; }; 'mobile-large': { ...; }; ... 5 more ...; 'ipad-pro': { ...; }; }'.
  No index signature with a parameter of type 'string' was found on type '{ desktop: { width: number; height: number; userAgent: string; }; tablet: { width: number; height: number; userAgent: string; }; mobile: { width: number; height: number; userAgent: string; }; 'mobile-large': { ...; }; ... 5 more ...; 'ipad-pro': { ...; }; }'.

57   const currentDevice = devicePresets[deviceType];
                           ~~~~~~~~~~~~~~~~~~~~~~~~~

app/preview/page.tsx:77:27 - error TS7006: Parameter 'newUrl' implicitly has an 'any' type.

77   const handleNavigate = (newUrl) => {
                             ~~~~~~

app/preview/page.tsx:101:29 - error TS7006: Parameter 'delta' implicitly has an 'any' type.

101   const handleZoomChange = (delta) => {
                                ~~~~~

app/preview/page.tsx:446:22 - error TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ offline: { download: number; upload: number; latency: number; }; 'slow-3g': { download: number; upload: number; latency: number; }; 'fast-3g': { download: number; upload: number; latency: number; }; '4g': { download: number; upload: number; latency: number; }; wifi: { ...; }; }'.
  No index signature with a parameter of type 'string' was found on type '{ offline: { download: number; upload: number; latency: number; }; 'slow-3g': { download: number; upload: number; latency: number; }; 'fast-3g': { download: number; upload: number; latency: number; }; '4g': { download: number; upload: number; latency: number; }; wifi: { ...; }; }'.

446               <span>{networkConditions[networkCondition].download}kb/s</span>
                         ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app/pwa/page.tsx:22:25 - error TS2322: Type '{ variant: string; autoShow: boolean; }' is not assignable to type 'IntrinsicAttributes & PWAInstallPromptProps'.
  Property 'variant' does not exist on type 'IntrinsicAttributes & PWAInstallPromptProps'.

22       <PWAInstallPrompt variant="card" autoShow={false} />
                           ~~~~~~~

app/share/[id]/page.tsx:21:30 - error TS2339: Property 'prompt' does not exist on type '{ id: string; name: string; createdAt: Date; updatedAt: Date; userId: string; status: string; type: string; metadata: JsonValue; description: string | null; framework: string | null; sourceCode: JsonValue; deploymentUrl: string | null; repositoryUrl: string | null; }'.

21   let prompt = generatedApp?.prompt;
                                ~~~~~~

app/share/[id]/page.tsx:31:43 - error TS2339: Property 'prompt' does not exist on type '{ id: string; name: string; createdAt: Date; updatedAt: Date; userId: string; status: string; type: string; metadata: JsonValue; description: string | null; framework: string | null; sourceCode: JsonValue; deploymentUrl: string | null; repositoryUrl: string | null; }'.

31     description: `Prompt: ${generatedApp?.prompt}`,
                                             ~~~~~~

app/share/[id]/page.tsx:62:53 - error TS2339: Property 'code' does not exist on type '{ id: string; name: string; createdAt: Date; updatedAt: Date; userId: string; status: string; type: string; metadata: JsonValue; description: string | null; framework: string | null; sourceCode: JsonValue; deploymentUrl: string | null; repositoryUrl: string | null; }'.

62       <CodeRunner language="tsx" code={generatedApp.code} />
                                                       ~~~~

components/accessibility/high-contrast-toggle.tsx:340:58 - error TS2345: Argument of type '"fontSize"' is not assignable to parameter of type 'number | unique symbol | "charAt" | "charCodeAt" | "concat" | "indexOf" | "lastIndexOf" | "localeCompare" | "match" | "replace" | "search" | "slice" | "split" | "substring" | ... 38 more ... | "valueOf"'.

340                 onClick={() => updateSetting('fontSize', 'fontSize', size)}
                                                             ~~~~~~~~~~

components/accessibility/high-contrast-toggle.tsx:357:69 - error TS2345: Argument of type 'undefined' is not assignable to parameter of type '"valueOf"'.

357               onClick={() => updateSetting('screenReaderOptimized', undefined, !settings.screenReaderOptimized)}
                                                                        ~~~~~~~~~

components/blockchain/ContractDeployment.tsx:183:50 - error TS2339: Property 'scanContract' does not exist on type 'BlockchainService'.

183       const scanResult = await blockchainService.scanContract(undefined, sourceCode)
                                                     ~~~~~~~~~~~~

components/blockchain/ContractDeployment.tsx:213:46 - error TS2339: Property 'deployContract' does not exist on type 'BlockchainService'.

213       const result = await blockchainService.deployContract(
                                                 ~~~~~~~~~~~~~~

components/blockchain/NFTMinting.tsx:118:45 - error TS2551: Property 'getIPFSService' does not exist on type 'BlockchainService'. Did you mean 'getService'?

118       const ipfsService = blockchainService.getIPFSService()
                                                ~~~~~~~~~~~~~~

  providers/Web3Provider.tsx:20:3
    20   getService: (type: string) => {
         ~~~~~~~~~~
    'getService' is declared here.

components/blockchain/NFTMinting.tsx:152:46 - error TS2339: Property 'mintNFT' does not exist on type 'BlockchainService'.

152       const result = await blockchainService.mintNFT(
                                                 ~~~~~~~

components/blockchain/TokenSwap.tsx:110:46 - error TS2339: Property 'swapTokens' does not exist on type 'BlockchainService'.

110       const result = await blockchainService.swapTokens(
                                                 ~~~~~~~~~~

components/business-intelligence-dashboard.tsx:109:13 - error TS7030: Not all code paths return a value.

109   useEffect(() => {
                ~~~~~~~

components/marketing/keyword-research-dashboard.tsx:308:13 - error TS7030: Not all code paths return a value.

308   useEffect(() => {
                ~~~~~~~

components/media-processing/performance-dashboard.tsx:138:13 - error TS7030: Not all code paths return a value.

138   useEffect(() => {
                ~~~~~~~

components/media-processing/system-health-monitor.tsx:61:13 - error TS7030: Not all code paths return a value.

61   useEffect(() => {
               ~~~~~~~

components/performance-dashboard.tsx:208:13 - error TS7030: Not all code paths return a value.

208   useEffect(() => {
                ~~~~~~~

components/providers/accessibility-provider.tsx:104:48 - error TS2339: Property 'matchMedia' does not exist on type 'never'.

104       (typeof window !== 'undefined' && window.matchMedia('(prefers-contrast: high)').matches) ||
                                                   ~~~~~~~~~~

components/providers/accessibility-provider.tsx:106:48 - error TS2339: Property 'matchMedia' does not exist on type 'never'.

106       (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
                                                   ~~~~~~~~~~

components/pwa/pwa-manager.tsx:172:31 - error TS7006: Parameter 'prev' implicitly has an 'any' type.

172         setPerformanceMetrics(prev => ({ ...prev, ...data }));
                                  ~~~~

hooks/use-pwa.ts:155:11 - error TS2353: Object literal may only specify known properties, and 'vibrate' does not exist in type 'NotificationOptions'.

155           vibrate: [100, 50, 100],
              ~~~~~~~

hooks/use-pwa.ts:198:28 - error TS2339: Property 'sync' does not exist on type 'ServiceWorkerRegistration'.

198         await registration.sync.register('background-sync');
                               ~~~~

lib/blockchain/config.ts:1:23 - error TS2307: Cannot find module 'wagmi' or its corresponding type declarations.

1 import { Chain } from 'wagmi'
                        ~~~~~~~

lib/blockchain/config.ts:2:49 - error TS2307: Cannot find module 'wagmi/chains' or its corresponding type declarations.

2 import { mainnet, polygon, bsc, arbitrum } from 'wagmi/chains'
                                                  ~~~~~~~~~~~~~~

lib/blockchain/evm-service.ts:1:24 - error TS2307: Cannot find module 'ethers' or its corresponding type declarations.

1 import { ethers } from 'ethers'
                         ~~~~~~~~

lib/blockchain/evm-service.ts:2:51 - error TS2307: Cannot find module 'viem' or its corresponding type declarations.

2 import { Chain, PublicClient, WalletClient } from 'viem'
                                                    ~~~~~~

lib/blockchain/ipfs-service.ts:1:39 - error TS2307: Cannot find module 'helia' or its corresponding type declarations.

1 import { create as createHelia } from 'helia'
                                        ~~~~~~~

lib/blockchain/ipfs-service.ts:2:24 - error TS2307: Cannot find module '@helia/unixfs' or its corresponding type declarations.

2 import { unixfs } from '@helia/unixfs'
                         ~~~~~~~~~~~~~~~

lib/blockchain/ipfs-service.ts:236:57 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'Uint8Array<ArrayBufferLike> | Buffer<ArrayBufferLike> | File'.

236     const collectionImageResult = await this.uploadFile(collectionMetadata.image)
                                                            ~~~~~~~~~~~~~~~~~~~~~~~~

lib/blockchain/near-service.ts:12:8 - error TS2307: Cannot find module '@near-js/client' or its corresponding type declarations.

12 } from '@near-js/client'
          ~~~~~~~~~~~~~~~~~

lib/blockchain/security-scanner.ts:1:24 - error TS2307: Cannot find module 'ethers' or its corresponding type declarations.

1 import { ethers } from 'ethers'
                         ~~~~~~~~

lib/blockchain/solana-service.ts:12:8 - error TS2307: Cannot find module '@solana/web3.js' or its corresponding type declarations.

12 } from '@solana/web3.js'
          ~~~~~~~~~~~~~~~~~

lib/code-generator/compiler-queue.ts:183:9 - error TS2322: Type 'string' is not assignable to type '"basic" | "none" | "aggressive" | undefined'.

183         optimization: job.options.optimization,
            ~~~~~~~~~~~~

  lib/code-generator/docker-compiler.ts:16:3
    16   optimization?: 'none' | 'basic' | 'aggressive';
         ~~~~~~~~~~~~
    The expected type comes from property 'optimization' which is declared here on type 'CompilationOptions'

lib/media-processing/ffmpeg-processor.ts:642:17 - error TS7006: Parameter '_' implicitly has an 'any' type.

642           .map((_, index) => `[${index}:v][${index}:a]`)
                    ~

lib/media-processing/ffmpeg-processor.ts:642:20 - error TS7006: Parameter 'index' implicitly has an 'any' type.

642           .map((_, index) => `[${index}:v][${index}:a]`)
                       ~~~~~

lib/monitoring/agents.ts:478:11 - error TS2769: No overload matches this call.
  Overload 1 of 2, '(input: string | URL | Request, init?: RequestInit | undefined): Promise<Response>', gave the following error.
    Object literal may only specify known properties, and 'timeout' does not exist in type 'RequestInit'.
  Overload 2 of 2, '(input: URL | RequestInfo, init?: RequestInit | undefined): Promise<Response>', gave the following error.
    Object literal may only specify known properties, and 'timeout' does not exist in type 'RequestInit'.

478           timeout: 5000
              ~~~~~~~


lib/monitoring/agents.ts:679:11 - error TS2353: Object literal may only specify known properties, and 'lastTriggeredAt' does not exist in type '(Without<MonitoringAlertUpdateInput, MonitoringAlertUncheckedUpdateInput> & MonitoringAlertUncheckedUpdateInput) | (Without<...> & MonitoringAlertUpdateInput)'.

679           lastTriggeredAt: new Date(),
              ~~~~~~~~~~~~~~~

  node_modules/.prisma/client/index.d.ts:31993:5
    31993     data: XOR<MonitoringAlertUpdateInput, MonitoringAlertUncheckedUpdateInput>
              ~~~~
    The expected type comes from property 'data' which is declared here on type '{ select?: MonitoringAlertSelect<DefaultArgs> | null | undefined; omit?: MonitoringAlertOmit<DefaultArgs> | null | undefined; include?: MonitoringAlertInclude<...> | ... 1 more ... | undefined; data: (Without<...> & MonitoringAlertUncheckedUpdateInput) | (Without<...> & MonitoringAlertUpdateInput); where: Monitoring...'

lib/prisma.ts:25:7 - error TS2322: Type 'any' is not assignable to type 'never'.

25       adapter,
         ~~~~~~~

lib/pwa/pwa-init.ts:168:48 - error TS2339: Property 'value' does not exist on type 'PerformanceEntry'.

168         this.sendMetricToAPI(entry.name, entry.value, entry);
                                                   ~~~~~

providers/SolanaProvider.tsx:12:31 - error TS2307: Cannot find module '@solana/web3.js' or its corresponding type declarations.

12 import { clusterApiUrl } from '@solana/web3.js'
                                 ~~~~~~~~~~~~~~~~~

providers/Web3Provider.tsx:172:28 - error TS2552: Cannot find name 'blockchainService'. Did you mean 'realBlockchainService'?

172         const evmService = blockchainService.getService('evm') as any
                               ~~~~~~~~~~~~~~~~~

  providers/Web3Provider.tsx:26:7
    26 const realBlockchainService: BlockchainService = {
             ~~~~~~~~~~~~~~~~~~~~~
    'realBlockchainService' is declared here.


Found 130 errors in 69 files.

Errors  Files
     1  app/api/media-processing/process/route.ts:66
     2  app/api/multi-ai-generate/route.ts:55
     1  app/api/notifications/email/route.ts:378
     2  app/api/notifications/preferences/route.ts:312
     3  app/api/profile/2fa/backup-codes/route.ts:127
     2  app/api/profile/export/route.ts:406
     2  app/api/projects/quick-start/route.ts:275
     1  app/api/pwa-generator/generate/route.ts:118
     4  app/api/router/[routerId]/cost-analytics/route.ts:77
     4  app/api/router/[routerId]/export-analytics/route.ts:118
     1  app/api/system/health/route.ts:28
     4  app/api/tooltips/context/route.ts:26
     2  app/api/tooltips/dismiss/[tooltipId]/route.ts:82
     4  app/api/tooltips/preferences/[userId]/route.ts:34
     2  app/api/tooltips/reset/[userId]/route.ts:25
     2  app/api/user/[userId]/routers/route.ts:104
     1  app/api/user/account/delete/route.ts:36
     2  app/api/user/delete/route.ts:162
     4  app/api/user/integrations/api-keys/route.ts:84
     1  app/api/user/integrations/connect/route.ts:110
     4  app/api/user/integrations/route.ts:95
     1  app/api/user/integrations/webhooks/route.ts:236
     2  app/api/user/notifications/[notificationId]/star/route.ts:25
     1  app/api/user/notifications/archive/route.ts:26
     1  app/api/user/notifications/mark-read/route.ts:26
     1  app/api/user/notifications/mark-unread/route.ts:26
     3  app/api/user/notifications/preferences/route.ts:73
     3  app/api/user/notifications/route.ts:65
     3  app/api/user/privacy/settings/route.ts:53
     1  app/api/user/security/2fa/setup/route.ts:35
     1  app/api/user/security/2fa/verify/route.ts:74
     4  app/api/user/security/change-password/route.ts:40
     4  app/api/user/security/sessions/[sessionId]/route.ts:31
     1  app/dashboard/router-analytics/page.tsx:131
     1  app/deploy/page.tsx:147
     1  app/game-development/components/GameAnalyticsDashboard.tsx:395
     1  app/game-development/components/GameAssetManager.tsx:336
     3  app/game-development/components/GameBuildManager.tsx:170
     1  app/game-development/components/GameRoomBrowser.tsx:118
     1  app/game-development/components/UnityProjectManager.tsx:88
     3  app/game-development/components/UnityScriptGenerator.tsx:308
     4  app/preview/page.tsx:57
     1  app/pwa/page.tsx:22
     3  app/share/[id]/page.tsx:21
     2  components/accessibility/high-contrast-toggle.tsx:340
     2  components/blockchain/ContractDeployment.tsx:183
     2  components/blockchain/NFTMinting.tsx:118
     1  components/blockchain/TokenSwap.tsx:110
     1  components/business-intelligence-dashboard.tsx:109
     1  components/marketing/keyword-research-dashboard.tsx:308
     1  components/media-processing/performance-dashboard.tsx:138
     1  components/media-processing/system-health-monitor.tsx:61
     1  components/performance-dashboard.tsx:208
     2  components/providers/accessibility-provider.tsx:104
     1  components/pwa/pwa-manager.tsx:172
     2  hooks/use-pwa.ts:155
     2  lib/blockchain/config.ts:1
     2  lib/blockchain/evm-service.ts:1
     3  lib/blockchain/ipfs-service.ts:1
     1  lib/blockchain/near-service.ts:12
     1  lib/blockchain/security-scanner.ts:1
     1  lib/blockchain/solana-service.ts:12
     1  lib/code-generator/compiler-queue.ts:183
     2  lib/media-processing/ffmpeg-processor.ts:642
     2  lib/monitoring/agents.ts:478
     1  lib/prisma.ts:25
     1  lib/pwa/pwa-init.ts:168
     1  providers/SolanaProvider.tsx:12
     1  providers/Web3Provider.tsx:172
arhansubasi@Arhan-MacBook-Air recoder-web % 