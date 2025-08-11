export const MODELS = [
  // Together AI Models (Primary)
  {
    label: "DeepSeek V3 (Reasoning)",
    value: "deepseek-ai/DeepSeek-V3",
    provider: "together",
    category: "reasoning",
    description: "Advanced reasoning and complex logic"
  },
  {
    label: "Llama 3.3 70B (Balanced)",
    value: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    provider: "together",
    category: "balanced",
    description: "Best overall performance"
  },
  {
    label: "Qwen 2.5 Coder 32B (Code)",
    value: "Qwen/Qwen2.5-Coder-32B-Instruct",
    provider: "together",
    category: "code",
    description: "Specialized for code generation"
  },
  {
    label: "Kimi K2 (Fast)",
    value: "moonshotai/Kimi-K2-Instruct",
    provider: "together",
    category: "fast",
    description: "Quick generation for prototyping"
  },
  
  // Claude Models (Premium)
  {
    label: "Claude 3.5 Sonnet (Premium)",
    value: "claude-3-5-sonnet-20241022",
    provider: "claude",
    category: "premium",
    description: "Highest quality for complex tasks"
  },
  {
    label: "Claude 3.5 Haiku (Fast Premium)",
    value: "claude-3-5-haiku-20241022",
    provider: "claude",
    category: "fast-premium",
    description: "Fast, high-quality generation"
  },
  
  // Groq Models (Ultra Fast)
  {
    label: "Llama 3.1 70B (Ultra Fast)",
    value: "llama-3.1-70b-versatile",
    provider: "groq",
    category: "ultra-fast",
    description: "Lightning-fast API generation"
  },
  {
    label: "Llama 3.1 8B (Instant)",
    value: "llama-3.1-8b-instant",
    provider: "groq",
    category: "instant",
    description: "Instant responses for simple tasks"
  },
  
  // Google Gemini Models (Multimodal)
  {
    label: "Gemini 2.0 Flash (Latest)",
    value: "gemini-2.0-flash-exp",
    provider: "gemini",
    category: "multimodal",
    description: "Latest multimodal AI with vision"
  },
  {
    label: "Gemini 1.5 Pro (Balanced)",
    value: "gemini-1.5-pro-002",
    provider: "gemini",
    category: "balanced",
    description: "High-quality multimodal reasoning"
  },
  {
    label: "Gemini 1.5 Flash (Fast)",
    value: "gemini-1.5-flash-002",
    provider: "gemini",
    category: "fast",
    description: "Fast multimodal processing"
  },
  
  // OpenRouter Models (Access to Everything)
  {
    label: "GPT-4 (OpenRouter)",
    value: "openai/gpt-4",
    provider: "openrouter",
    category: "versatile",
    description: "OpenAI's flagship model"
  },
  {
    label: "Claude 3.5 Sonnet (OpenRouter)",
    value: "anthropic/claude-3.5-sonnet",
    provider: "openrouter",
    category: "premium",
    description: "Claude via OpenRouter"
  }
];

// AI Provider capabilities for smart routing
export const AI_PROVIDERS = {
  together: {
    name: "Together AI",
    description: "Multi-model platform with latest models",
    strengths: ["Latest models", "Reasoning", "Code generation", "Cost-effective"],
    available: !!process.env.TOGETHER_API_KEY
  },
  claude: {
    name: "Anthropic Claude",
    description: "Premium AI for complex reasoning",
    strengths: ["Complex logic", "Security", "Architecture design", "Code review"],
    available: !!process.env.ANTHROPIC_API_KEY
  },
  groq: {
    name: "Groq",
    description: "Ultra-fast inference",
    strengths: ["Speed", "API generation", "Prototyping", "Real-time"],
    available: !!process.env.GROQ_API_KEY
  },
  gemini: {
    name: "Google Gemini",
    description: "Multimodal AI with vision capabilities",
    strengths: ["Multimodal", "Vision", "Large context", "Code understanding"],
    available: !!process.env.GOOGLE_API_KEY
  },
  openrouter: {
    name: "OpenRouter", 
    description: "Access to all major models",
    strengths: ["Model variety", "Cost optimization", "Backup access", "Latest releases"],
    available: !!process.env.OPENROUTER_API_KEY
  }
};

// Enhanced prompts with AI model recommendations
export const SUGGESTED_PROMPTS = [
  {
    title: "Quiz app",
    description:
      "Make me a quiz app about American history. Make sure to give the user an explanation on each question whether they got it right or wrong and keep a score going",
    recommendedModel: "Qwen/Qwen2.5-Coder-32B-Instruct",
    complexity: "medium"
  },
  {
    title: "SaaS Landing page",
    description:
      "A landing page for a SaaS business that includes a clear value proposition in a prominent hero section, concise feature overviews, testimonials, pricing, and a clear call-to-action button leading to a free trial or demo.",
    recommendedModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    complexity: "medium"
  },
  {
    title: "Pomodoro Timer",
    description:
      "Make a beautiful pomodoro timer where I can adjust the lengths of the focus time and the break and it will beep when done.",
    recommendedModel: "llama-3.1-8b-instant",
    complexity: "simple"
  },
  {
    title: "Blog app",
    description:
      "Make me a blog app that has a few blogs there for people to read. Users can click into the blogs and read them, then go back to the homepage to see more.",
    recommendedModel: "Qwen/Qwen2.5-Coder-32B-Instruct",
    complexity: "medium"
  },
  // {
  //   title: "Recipe site",
  //   description:
  //     "Make me a site that has easy to make recipes in a grid that you can click into and see the full recipe. Also make it possible for me to add my own",
  // },
  {
    title: "Flashcard app",
    description:
      "Build me a flashcard app about llamas. Have some flash cards and also have the ability for users to add their own. Show one side of a card at first and reveal the answer on button click, keeping track of correct guesses to measure progress.",
    recommendedModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    complexity: "medium"
  },
  {
    title: "Timezone dashboard",
    description:
      "Make me a time zone dashboard that shows me the time zone in the top 6 most popular time zones and gives me a dropdown to add others",
    recommendedModel: "llama-3.1-70b-versatile",
    complexity: "simple"
  },
  
  // Advanced prompts for premium features
  {
    title: "E-commerce Platform (Premium)",
    description:
      "Build a full-stack e-commerce platform with user authentication, product catalog, shopping cart, Stripe payment integration, admin dashboard, and order management. Include real database operations and email notifications.",
    recommendedModel: "claude-3-5-sonnet-20241022",
    complexity: "complex"
  },
  {
    title: "Real-time Chat App (Premium)",
    description:
      "Create a real-time chat application with WebSocket connections, user presence, message history, file uploads, and push notifications. Include authentication and room management.",
    recommendedModel: "deepseek-ai/DeepSeek-V3",
    complexity: "complex"
  },
  {
    title: "API with Database (Fast)",
    description:
      "Generate a REST API with CRUD operations, database integration, authentication middleware, error handling, and API documentation. Include real endpoints that work.",
    recommendedModel: "llama-3.1-70b-versatile",
    complexity: "medium"
  }
];
