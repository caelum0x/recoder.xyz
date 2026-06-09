export type EcosystemAppId =
  | "home"
  | "agency"
  | "pm"
  | "ui"
  | "agents";

export interface EcosystemApp {
  id: EcosystemAppId;
  label: string;
  description: string;
  href: string;
}

export interface EcosystemSettingsRoute {
  id: string;
  label: string;
  href: string;
}

export type AiStudioUseCaseId =
  | "agent-ops-platform"
  | "support-copilot"
  | "sales-outreach"
  | "content-ops"
  | "product-analyst"
  | "knowledge-assistant"
  | "qa-automation";

export type AiStudioBlueprintSourceKind =
  | "documentVectorStore"
  | "githubVectorStore"
  | "dataStore";

export interface AiStudioWorkflowBlueprint {
  objective: string;
  successCriteria: readonly string[];
  simulationChecks: readonly string[];
  deployChecklist: readonly string[];
  requiredSources?: readonly AiStudioBlueprintSourceKind[];
  /**
   * @deprecated Use `requiredSources`.
   * Kept for backward compatibility with existing metadata and callers.
   */
  sourceNodes: readonly AiStudioBlueprintSourceKind[];
}

export interface AiStudioUseCase {
  id: AiStudioUseCaseId;
  title: string;
  summary: string;
  targetTeam: string;
  automationFlow: string;
  starterPrompt: string;
  studioPath: string;
  tags: readonly string[];
  workflowBlueprint: AiStudioWorkflowBlueprint;
}

export function resolveWorkflowRequiredSources(
  blueprint: AiStudioWorkflowBlueprint,
): readonly AiStudioBlueprintSourceKind[] {
  if (Array.isArray(blueprint.requiredSources) && blueprint.requiredSources.length > 0) {
    return blueprint.requiredSources;
  }
  return blueprint.sourceNodes;
}

export const RECODER_STUDIO_FLAGSHIP_LOOP = [
  "Design",
  "Simulate",
  "Deploy",
  "Observe",
  "Iterate",
] as const;

export const RECODER_STUDIO_POSITIONING =
  "AI Workflow Builder + Runtime Ops Platform";

export const RECODER_ECOSYSTEM_URLS = {
  home: "https://recoder.xyz",
  agency: "https://agency.recoder.xyz",
  pm: "https://pm.recoder.xyz",
  ui: "https://ui.recoder.xyz",
  agents: "https://agents.recoder.xyz",
  stagingHome: "https://staging.recoder.xyz",
} as const;

export const RECODER_SETTINGS_URLS = {
  home: {
    main: `${RECODER_ECOSYSTEM_URLS.home}/settings`,
    profile: `${RECODER_ECOSYSTEM_URLS.home}/settings/profile`,
    security: `${RECODER_ECOSYSTEM_URLS.home}/settings/security`,
    apiKeys: `${RECODER_ECOSYSTEM_URLS.home}/settings/api-keys`,
    notifications: `${RECODER_ECOSYSTEM_URLS.home}/settings/notifications`,
    integrations: `${RECODER_ECOSYSTEM_URLS.home}/settings/integrations`,
    aiProviders: `${RECODER_ECOSYSTEM_URLS.home}/settings/ai-providers`,
  },
  agents: {
    main: `${RECODER_ECOSYSTEM_URLS.agents}/settings`,
    subscription: `${RECODER_ECOSYSTEM_URLS.agents}/subscription`,
  },
  pm: {
    main: `${RECODER_ECOSYSTEM_URLS.pm}/settings`,
    members: `${RECODER_ECOSYSTEM_URLS.pm}/settings/members`,
    integrations: `${RECODER_ECOSYSTEM_URLS.pm}/settings/integrations`,
  },
  agency: {
    main: `${RECODER_ECOSYSTEM_URLS.agency}/settings`,
    account: `${RECODER_ECOSYSTEM_URLS.agency}/settings/account`,
    team: `${RECODER_ECOSYSTEM_URLS.agency}/settings/team`,
  },
} as const;

export const RECODER_ECOSYSTEM_APPS: readonly EcosystemApp[] = [
  {
    id: "agency",
    label: "Agency",
    description: "AI Agency Platform",
    href: RECODER_ECOSYSTEM_URLS.agency,
  },
  {
    id: "pm",
    label: "PM",
    description: "Product Management",
    href: RECODER_ECOSYSTEM_URLS.pm,
  },
  {
    id: "home",
    label: "Home",
    description: "Main Site",
    href: RECODER_ECOSYSTEM_URLS.home,
  },
  {
    id: "agents",
    label: "Agents",
    description: "AI Agent IDE",
    href: RECODER_ECOSYSTEM_URLS.agents,
  },
  {
    id: "ui",
    label: "UI",
    description: "Component Library & Blueprint Gallery",
    href: RECODER_ECOSYSTEM_URLS.ui,
  },
] as const;

/** Returns user-facing apps suitable for an app-switcher UI (excludes home & ui). */
export function getSwitcherApps(): readonly EcosystemApp[] {
  return RECODER_ECOSYSTEM_APPS.filter(
    (app) => app.id !== "home" && app.id !== "ui",
  );
}

export function getHomeSettingsRoutes(): readonly EcosystemSettingsRoute[] {
  return [
    { id: "main", label: "Settings", href: RECODER_SETTINGS_URLS.home.main },
    { id: "profile", label: "Profile", href: RECODER_SETTINGS_URLS.home.profile },
    { id: "security", label: "Security", href: RECODER_SETTINGS_URLS.home.security },
    { id: "api-keys", label: "API Keys", href: RECODER_SETTINGS_URLS.home.apiKeys },
    { id: "notifications", label: "Notifications", href: RECODER_SETTINGS_URLS.home.notifications },
    { id: "integrations", label: "Integrations", href: RECODER_SETTINGS_URLS.home.integrations },
    { id: "ai-providers", label: "AI Providers", href: RECODER_SETTINGS_URLS.home.aiProviders },
  ] as const;
}

export const RECODER_AI_STUDIO_USE_CASES: readonly AiStudioUseCase[] = [
  {
    id: "agent-ops-platform",
    title: "Agent Ops Platform",
    summary:
      "Design, test, deploy, and monitor production AI workflows with one control plane.",
    targetTeam: "AI Engineering",
    automationFlow:
      "Design workflow graph, simulate scenarios, ship runtime agents, and monitor reliability/cost/latency loops.",
    starterPrompt:
      "Act as an AI workflow operator. Define the workflow objective, simulation checks, deployment gate, and post-deploy monitoring plan.",
    studioPath: "/workspaces",
    tags: ["Design", "Simulate", "Deploy", "Observe", "Iterate"],
    workflowBlueprint: {
      objective:
        "Create a production workflow that can be simulated pre-release and monitored post-release.",
      successCriteria: [
        "Workflow produces expected output for golden scenarios",
        "Latency and reliability targets are defined",
        "Rollback path exists before promoting to live",
      ],
      simulationChecks: [
        "Run success-path and edge-case prompts",
        "Verify retrieval/citation behavior on known sources",
        "Validate fallback response when a dependency fails",
      ],
      deployChecklist: [
        "Version workflow graph and prompt",
        "Confirm required data sources are connected",
        "Define runtime alerts for failures and latency regressions",
      ],
      requiredSources: ["documentVectorStore", "githubVectorStore", "dataStore"],
      sourceNodes: ["documentVectorStore", "githubVectorStore", "dataStore"],
    },
  },
  {
    id: "support-copilot",
    title: "Support Copilot",
    summary:
      "Answer customer tickets from docs, previous tickets, and release notes.",
    targetTeam: "Support",
    automationFlow:
      "Ingest docs and ticket history, draft responses, and route low-confidence cases for human review.",
    starterPrompt:
      "Draft a customer-ready answer for this ticket with exact source references and a clear next action.",
    studioPath: "/playground",
    tags: ["RAG", "Ticket Triage", "Escalation"],
    workflowBlueprint: {
      objective:
        "Resolve customer tickets quickly while preserving accuracy and citation quality.",
      successCriteria: [
        "Every answer includes source-backed guidance",
        "Low-confidence replies are flagged for human review",
      ],
      simulationChecks: [
        "Test policy and release-note questions",
        "Validate escalation path for ambiguous requests",
      ],
      deployChecklist: [
        "Connect support knowledge stores",
        "Set confidence threshold for escalation",
      ],
      requiredSources: ["documentVectorStore"],
      sourceNodes: ["documentVectorStore"],
    },
  },
  {
    id: "sales-outreach",
    title: "Sales Outreach Composer",
    summary:
      "Generate personalized outbound sequences from ICP, firmographic, and product context.",
    targetTeam: "Sales",
    automationFlow:
      "Score leads, craft email + LinkedIn sequence variants, and log best-performing prompts.",
    starterPrompt:
      "Create a 4-step outbound sequence for a VP Engineering at a Series B SaaS company evaluating AI copilots.",
    studioPath: "/playground",
    tags: ["Prospecting", "Personalization", "A/B Prompts"],
    workflowBlueprint: {
      objective:
        "Generate high-personalization outbound messages from ICP and account data.",
      successCriteria: [
        "Message variants remain on-brand",
        "Sequence includes clear CTA and personalization anchors",
      ],
      simulationChecks: [
        "Test outputs across multiple personas",
        "Validate tone and compliance constraints",
      ],
      deployChecklist: [
        "Connect CRM and enrichment data source",
        "Define approval workflow before send",
      ],
      requiredSources: ["dataStore"],
      sourceNodes: ["dataStore"],
    },
  },
  {
    id: "content-ops",
    title: "Content Ops Studio",
    summary:
      "Turn one brief into SEO article drafts, social threads, and launch snippets.",
    targetTeam: "Marketing",
    automationFlow:
      "Generate multi-channel assets from a single brief and enforce voice/tone quality checks.",
    starterPrompt:
      "Convert this product launch brief into a blog outline, LinkedIn post, and newsletter section.",
    studioPath: "/workspaces",
    tags: ["SEO", "Repurposing", "Brand Voice"],
    workflowBlueprint: {
      objective:
        "Repurpose one launch brief into multi-channel content with consistent brand voice.",
      successCriteria: [
        "All channel outputs align to the same narrative",
        "Content meets tone and formatting requirements",
      ],
      simulationChecks: [
        "Run quality checks on tone and factual consistency",
        "Validate output format for each target channel",
      ],
      deployChecklist: [
        "Define brand style constraints",
        "Enable editorial review checkpoint",
      ],
      requiredSources: ["documentVectorStore"],
      sourceNodes: ["documentVectorStore"],
    },
  },
  {
    id: "product-analyst",
    title: "Product Analyst Agent",
    summary:
      "Summarize user feedback and convert themes into PRD-ready opportunities.",
    targetTeam: "Product",
    automationFlow:
      "Cluster feedback, detect recurring pain points, and output ranked opportunities with impact hypotheses.",
    starterPrompt:
      "Analyze these feedback notes and produce top 5 opportunities with evidence and effort estimates.",
    studioPath: "/workspaces",
    tags: ["Feedback Mining", "PRD", "Prioritization"],
    workflowBlueprint: {
      objective:
        "Transform qualitative feedback into prioritized product opportunities.",
      successCriteria: [
        "Each opportunity includes evidence and rationale",
        "Prioritization includes impact and effort framing",
      ],
      simulationChecks: [
        "Test clustering on mixed-quality feedback",
        "Validate deduplication across overlapping themes",
      ],
      deployChecklist: [
        "Connect product analytics and feedback repositories",
        "Set cadence for opportunity review",
      ],
      requiredSources: ["documentVectorStore", "dataStore"],
      sourceNodes: ["documentVectorStore", "dataStore"],
    },
  },
  {
    id: "knowledge-assistant",
    title: "Internal Knowledge Assistant",
    summary:
      "Give employees instant answers from policies, SOPs, and architecture docs.",
    targetTeam: "Operations",
    automationFlow:
      "Sync internal documents, enforce citation requirements, and flag stale source content.",
    starterPrompt:
      "Answer this onboarding question using only policy documents and cite section names in the response.",
    studioPath: "/settings/team/vector-stores",
    tags: ["Knowledge Base", "Citations", "Governance"],
    workflowBlueprint: {
      objective:
        "Provide fast internal answers grounded in trusted policy and SOP sources.",
      successCriteria: [
        "Responses include citation anchors",
        "Outdated source material is detectable",
      ],
      simulationChecks: [
        "Test conflicting policy scenarios",
        "Validate citation output for every answer",
      ],
      deployChecklist: [
        "Connect policy and SOP repositories",
        "Define stale-content review process",
      ],
      requiredSources: ["documentVectorStore"],
      sourceNodes: ["documentVectorStore"],
    },
  },
  {
    id: "qa-automation",
    title: "QA and Regression Agent",
    summary:
      "Generate edge-case test plans and bug reports from release context.",
    targetTeam: "Engineering",
    automationFlow:
      "Read release notes, generate test cases by risk area, and produce reproducible bug reports.",
    starterPrompt:
      "From this release diff, propose critical regression tests and include expected failure signatures.",
    studioPath: "/tasks",
    tags: ["Release QA", "Risk Detection", "Test Generation"],
    workflowBlueprint: {
      objective:
        "Continuously identify regression risk and generate executable QA coverage.",
      successCriteria: [
        "Critical risks are surfaced before release",
        "Test artifacts include reproducible failure signatures",
      ],
      simulationChecks: [
        "Test diff parsing on large and noisy changesets",
        "Validate prioritization of high-impact risk areas",
      ],
      deployChecklist: [
        "Connect code repository source",
        "Define release gate criteria from generated tests",
      ],
      requiredSources: ["githubVectorStore"],
      sourceNodes: ["githubVectorStore"],
    },
  },
] as const;
