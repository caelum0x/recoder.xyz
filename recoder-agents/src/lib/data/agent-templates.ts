export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string; // lucide icon name
  instructions: string;
  suggestedModel: string;
  tools: string[];
  estimatedCostPerRun: string; // e.g. "$0.02-0.05"
}

export interface TemplateCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  templateCount: number;
}

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  { id: 'development', name: 'Development', description: 'Code generation, review, and debugging agents', icon: 'Code', templateCount: 4 },
  { id: 'research', name: 'Research', description: 'Web research, data gathering, and analysis agents', icon: 'Search', templateCount: 3 },
  { id: 'writing', name: 'Writing', description: 'Content creation, editing, and summarization agents', icon: 'PenTool', templateCount: 3 },
  { id: 'data', name: 'Data Analysis', description: 'Data processing, visualization, and reporting agents', icon: 'BarChart3', templateCount: 3 },
  { id: 'support', name: 'Customer Support', description: 'Help desk, FAQ, and ticket management agents', icon: 'Headphones', templateCount: 2 },
  { id: 'automation', name: 'Automation', description: 'Task scheduling, workflow, and integration agents', icon: 'Zap', templateCount: 3 },
];

export const AGENT_TEMPLATES: AgentTemplate[] = [
  // Development
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description: 'Reviews pull requests and suggests improvements for code quality, security, and performance.',
    category: 'development',
    icon: 'GitPullRequest',
    instructions: 'You are an expert code reviewer. When given code or a pull request diff, analyze it for:\n1. Code quality and readability\n2. Potential bugs and edge cases\n3. Security vulnerabilities\n4. Performance issues\n5. Best practices and patterns\n\nProvide specific, actionable feedback with code examples.',
    suggestedModel: 'claude-sonnet-4-6',
    tools: ['file_read', 'web_search'],
    estimatedCostPerRun: '$0.02-0.08',
  },
  {
    id: 'test-writer',
    name: 'Test Writer',
    description: 'Generates comprehensive unit and integration tests for your codebase.',
    category: 'development',
    icon: 'TestTube',
    instructions: 'You are a testing expert. Generate comprehensive tests that cover:\n1. Happy path scenarios\n2. Edge cases and boundary conditions\n3. Error handling\n4. Integration points\n\nFollow TDD principles. Use the project\'s existing test framework and conventions.',
    suggestedModel: 'claude-sonnet-4-6',
    tools: ['file_read', 'file_write', 'terminal'],
    estimatedCostPerRun: '$0.03-0.10',
  },
  {
    id: 'debug-assistant',
    name: 'Debug Assistant',
    description: 'Helps diagnose and fix bugs by analyzing error logs, stack traces, and code.',
    category: 'development',
    icon: 'Bug',
    instructions: 'You are a debugging expert. When presented with an error or bug:\n1. Analyze the error message and stack trace\n2. Identify the root cause\n3. Suggest specific fixes with code\n4. Explain why the fix works\n5. Suggest preventive measures',
    suggestedModel: 'claude-sonnet-4-6',
    tools: ['file_read', 'terminal', 'web_search'],
    estimatedCostPerRun: '$0.02-0.06',
  },
  {
    id: 'api-designer',
    name: 'API Designer',
    description: 'Designs RESTful and GraphQL APIs with OpenAPI specifications.',
    category: 'development',
    icon: 'Webhook',
    instructions: 'You are an API design expert. Help design APIs that are:\n1. RESTful and resource-oriented\n2. Well-documented with OpenAPI/Swagger specs\n3. Following industry best practices\n4. Versioned and backwards-compatible\n5. Secure with proper authentication patterns',
    suggestedModel: 'claude-sonnet-4-6',
    tools: ['file_write', 'web_search'],
    estimatedCostPerRun: '$0.02-0.05',
  },
  // Research
  {
    id: 'web-researcher',
    name: 'Web Researcher',
    description: 'Searches the web and synthesizes information into structured reports.',
    category: 'research',
    icon: 'Globe',
    instructions: 'You are a research assistant. When given a topic:\n1. Search for relevant, authoritative sources\n2. Cross-reference information from multiple sources\n3. Synthesize findings into a clear, structured report\n4. Include citations and links\n5. Highlight areas of uncertainty or conflicting information',
    suggestedModel: 'claude-sonnet-4-6',
    tools: ['web_search', 'web_crawl'],
    estimatedCostPerRun: '$0.05-0.15',
  },
  {
    id: 'data-collector',
    name: 'Data Collector',
    description: 'Scrapes and structures data from websites into organized formats.',
    category: 'research',
    icon: 'Database',
    instructions: 'You are a data collection specialist. Extract structured data from web sources:\n1. Identify the target data fields\n2. Navigate to relevant pages\n3. Extract and clean the data\n4. Structure it in the requested format (JSON, CSV, etc.)\n5. Handle pagination and rate limiting responsibly',
    suggestedModel: 'claude-sonnet-4-6',
    tools: ['web_crawl', 'file_write'],
    estimatedCostPerRun: '$0.03-0.10',
  },
  {
    id: 'competitor-analyst',
    name: 'Competitor Analyst',
    description: 'Analyzes competitors by researching their products, pricing, and positioning.',
    category: 'research',
    icon: 'TrendingUp',
    instructions: 'You are a competitive intelligence analyst. Research competitors to provide:\n1. Product feature comparison\n2. Pricing analysis\n3. Market positioning\n4. Strengths and weaknesses\n5. Strategic recommendations',
    suggestedModel: 'claude-sonnet-4-6',
    tools: ['web_search', 'web_crawl'],
    estimatedCostPerRun: '$0.05-0.20',
  },
  // Writing
  {
    id: 'blog-writer',
    name: 'Blog Writer',
    description: 'Creates engaging blog posts with SEO optimization.',
    category: 'writing',
    icon: 'FileText',
    instructions: 'You are a professional content writer. Create blog posts that:\n1. Have compelling headlines and hooks\n2. Are well-structured with headers and sections\n3. Include relevant examples and data\n4. Are optimized for SEO with natural keyword usage\n5. End with clear calls to action',
    suggestedModel: 'claude-sonnet-4-6',
    tools: ['web_search', 'file_write'],
    estimatedCostPerRun: '$0.03-0.08',
  },
  {
    id: 'email-drafter',
    name: 'Email Drafter',
    description: 'Drafts professional emails for various business contexts.',
    category: 'writing',
    icon: 'Mail',
    instructions: 'You are an expert business communicator. Draft emails that:\n1. Have clear, specific subject lines\n2. Get to the point quickly\n3. Use appropriate tone for the context\n4. Include clear calls to action\n5. Are concise but complete',
    suggestedModel: 'claude-haiku-4-5-20251001',
    tools: [],
    estimatedCostPerRun: '$0.01-0.02',
  },
  {
    id: 'summarizer',
    name: 'Document Summarizer',
    description: 'Summarizes long documents, articles, and reports into key points.',
    category: 'writing',
    icon: 'ListChecks',
    instructions: 'You are a summarization expert. When given a document:\n1. Identify the main thesis and key arguments\n2. Extract important data points and quotes\n3. Organize into a structured summary\n4. Preserve nuance and context\n5. Note any limitations or caveats',
    suggestedModel: 'claude-sonnet-4-6',
    tools: ['file_read', 'web_crawl'],
    estimatedCostPerRun: '$0.02-0.06',
  },
  // Data Analysis
  {
    id: 'csv-analyzer',
    name: 'CSV Analyzer',
    description: 'Analyzes CSV data files and generates insights and visualizations.',
    category: 'data',
    icon: 'Table',
    instructions: 'You are a data analyst. When given CSV data:\n1. Understand the schema and data types\n2. Calculate summary statistics\n3. Identify trends and patterns\n4. Flag anomalies or data quality issues\n5. Generate clear visualizations and insights',
    suggestedModel: 'claude-sonnet-4-6',
    tools: ['file_read', 'terminal'],
    estimatedCostPerRun: '$0.03-0.10',
  },
  {
    id: 'sql-assistant',
    name: 'SQL Assistant',
    description: 'Writes and optimizes SQL queries for your database.',
    category: 'data',
    icon: 'Database',
    instructions: 'You are a SQL expert. Help with:\n1. Writing correct, efficient queries\n2. Optimizing slow queries with EXPLAIN analysis\n3. Designing schemas and indexes\n4. Migration scripts\n5. Data transformation and ETL queries',
    suggestedModel: 'claude-sonnet-4-6',
    tools: ['file_read', 'terminal'],
    estimatedCostPerRun: '$0.02-0.05',
  },
  {
    id: 'report-generator',
    name: 'Report Generator',
    description: 'Creates formatted business reports from raw data.',
    category: 'data',
    icon: 'FileBarChart',
    instructions: 'You are a business reporting specialist. Generate reports that:\n1. Have executive summaries\n2. Include data tables and charts\n3. Highlight key metrics and KPIs\n4. Show trends and comparisons\n5. End with actionable recommendations',
    suggestedModel: 'claude-sonnet-4-6',
    tools: ['file_read', 'file_write'],
    estimatedCostPerRun: '$0.03-0.08',
  },
  // Support
  {
    id: 'help-desk',
    name: 'Help Desk Agent',
    description: 'Answers customer questions using your knowledge base.',
    category: 'support',
    icon: 'MessageCircleQuestion',
    instructions: 'You are a helpful customer support agent. When handling inquiries:\n1. Understand the customer\'s issue clearly\n2. Search the knowledge base for relevant answers\n3. Provide clear, step-by-step solutions\n4. Use a friendly, professional tone\n5. Escalate complex issues appropriately',
    suggestedModel: 'claude-haiku-4-5-20251001',
    tools: ['knowledge_base', 'web_search'],
    estimatedCostPerRun: '$0.01-0.03',
  },
  {
    id: 'ticket-triager',
    name: 'Ticket Triager',
    description: 'Automatically categorizes and prioritizes support tickets.',
    category: 'support',
    icon: 'Tags',
    instructions: 'You are a ticket triage specialist. For each ticket:\n1. Read and understand the issue\n2. Categorize by type (bug, feature request, question, billing)\n3. Assess priority (critical, high, medium, low)\n4. Assign to the appropriate team\n5. Add relevant tags for tracking',
    suggestedModel: 'claude-haiku-4-5-20251001',
    tools: [],
    estimatedCostPerRun: '$0.005-0.01',
  },
  // Automation
  {
    id: 'scheduler',
    name: 'Task Scheduler',
    description: 'Manages recurring tasks and sends reminders.',
    category: 'automation',
    icon: 'Calendar',
    instructions: 'You are a task management assistant. Help users:\n1. Schedule and track recurring tasks\n2. Set up reminders and deadlines\n3. Prioritize task lists\n4. Track completion status\n5. Generate daily/weekly task summaries',
    suggestedModel: 'claude-haiku-4-5-20251001',
    tools: [],
    estimatedCostPerRun: '$0.005-0.02',
  },
  {
    id: 'workflow-builder',
    name: 'Workflow Builder',
    description: 'Helps design and implement automated workflows.',
    category: 'automation',
    icon: 'GitBranch',
    instructions: 'You are a workflow automation expert. Help users:\n1. Map out business processes\n2. Identify automation opportunities\n3. Design workflow steps and triggers\n4. Handle error scenarios and fallbacks\n5. Optimize for efficiency and reliability',
    suggestedModel: 'claude-sonnet-4-6',
    tools: ['web_search', 'file_write'],
    estimatedCostPerRun: '$0.02-0.06',
  },
  {
    id: 'data-syncer',
    name: 'Data Syncer',
    description: 'Keeps data synchronized between different services and databases.',
    category: 'automation',
    icon: 'RefreshCcw',
    instructions: 'You are a data integration specialist. Help with:\n1. Mapping data fields between systems\n2. Handling data transformations\n3. Managing sync conflicts\n4. Setting up incremental sync strategies\n5. Monitoring sync health and errors',
    suggestedModel: 'claude-sonnet-4-6',
    tools: ['terminal', 'file_read', 'file_write'],
    estimatedCostPerRun: '$0.02-0.08',
  },
];

export function getTemplatesByCategory(categoryId: string): AgentTemplate[] {
  return AGENT_TEMPLATES.filter((t) => t.category === categoryId);
}

export function getCategoryById(categoryId: string): TemplateCategory | undefined {
  return TEMPLATE_CATEGORIES.find((c) => c.id === categoryId);
}

export function getTemplateById(templateId: string): AgentTemplate | undefined {
  return AGENT_TEMPLATES.find((t) => t.id === templateId);
}
