export const MODELS = [
  // Together AI Models (Multi-Model Platform) 🤝
  {
    label: "DeepSeek V3 (Together) 🧠",
    value: "deepseek-ai/DeepSeek-V3",
    provider: "together",
    category: "reasoning",
    description: "🤖 Advanced reasoning & complex logic • Competitive with GPT-4 • $0.27/1M",
    quality: "premium",
    speed: "6s",
    costPer1M: "$0.27",
    strengths: ["Advanced reasoning", "Cost-effective", "Complex logic"],
    reasoning: true,
    featured: true
  },
  {
    label: "Llama 3.3 70B Turbo 🦙",
    value: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    provider: "together",
    category: "balanced",
    description: "🦙 Meta's latest Llama • Best overall performance • Balanced quality & speed",
    quality: "premium",
    speed: "4s",
    costPer1M: "$0.88",
    strengths: ["Meta optimized", "Well-balanced", "Reliable"],
    balanced: true
  },
  {
    label: "Llama 3.1 70B Turbo ⚡",
    value: "meta-llama/Llama-3.1-70B-Instruct-Turbo",
    provider: "together",
    category: "fast",
    description: "⚡ Fast Llama 3.1 • Quick responses • Efficient processing",
    quality: "balanced",
    speed: "3s",
    costPer1M: "$0.88",
    strengths: ["Fast", "Efficient", "Good quality"],
    fast: true
  },
  {
    label: "Llama 3.1 8B Turbo 🚀",
    value: "meta-llama/Llama-3.1-8B-Instruct-Turbo",
    provider: "together",
    category: "ultra-fast",
    description: "🚀 Ultra-fast 8B model • Instant responses • Perfect for prototyping",
    quality: "fast",
    speed: "1s",
    costPer1M: "$0.20",
    strengths: ["Ultra-fast", "Cost-effective", "Instant"],
    instant: true
  },
  {
    label: "Qwen 2.5 Coder 32B 💻",
    value: "Qwen/Qwen2.5-Coder-32B-Instruct",
    provider: "together",
    category: "code",
    description: "👨‍💻 Specialized coding AI • Best for development • Code generation expert",
    quality: "premium",
    speed: "5s",
    costPer1M: "$0.75",
    strengths: ["Code generation", "Development", "Programming"],
    code: true,
    featured: true
  },
  {
    label: "Qwen 2.5 72B Turbo 🎯",
    value: "qwen/qwen-2.5-72b-instruct-turbo",
    provider: "together",
    category: "premium",
    description: "🎯 Qwen 2.5 72B • Premium quality • Large context window",
    quality: "premium",
    speed: "6s",
    costPer1M: "$1.20",
    strengths: ["Large context", "Premium quality", "Versatile"],
    premium: true
  },
  {
    label: "Mistral Large 2407 🌟",
    value: "mistralai/mistral-large-2407",
    provider: "together",
    category: "premium",
    description: "🌟 Mistral's flagship • European AI excellence • 32K context",
    quality: "premium",
    speed: "7s",
    costPer1M: "$8.00",
    strengths: ["European AI", "Large context", "Premium"],
    premium: true
  },
  {
    label: "DeepSeek LLM 67B Chat 💬",
    value: "deepseek-ai/deepseek-llm-67b-chat",
    provider: "together",
    category: "chat",
    description: "💬 DeepSeek 67B Chat • Optimized for conversations • Natural dialogue",
    quality: "balanced",
    speed: "5s",
    costPer1M: "$0.90",
    strengths: ["Chat optimized", "Natural", "Conversational"],
    chat: true
  },
  {
    label: "Shisa v2 Llama 3.3 70B 🌸",
    value: "shisa-ai/shisa-v2-llama-3.3-70b",
    provider: "together",
    category: "specialized",
    description: "🌸 Shisa v2 • Japanese-English bilingual • Cultural understanding",
    quality: "premium",
    speed: "6s",
    costPer1M: "$0.88",
    strengths: ["Bilingual", "Cultural", "Specialized"],
    multilingual: true
  },
  {
    label: "Deep Hermes 3 Mistral 24B 🔮",
    value: "deephermes-3-mistral-24b",
    provider: "together",
    category: "creative",
    description: "🔮 Deep Hermes 3 • Creative AI • Enhanced reasoning",
    quality: "balanced",
    speed: "4s",
    costPer1M: "$0.60",
    strengths: ["Creative", "Enhanced reasoning", "Unique"],
    creative: true
  },
  
  // Claude Models (Premium)
  {
    label: "Claude Sonnet 4 👑",
    value: "claude-sonnet-4-20250514",
    provider: "claude",
    category: "ultra-premium",
    description: "🔥 Latest flagship model • Ultimate reasoning & architecture • Best for enterprise apps",
    quality: "ultra-premium", 
    speed: "10s",
    costPer1M: "$15.00",
    strengths: ["Cutting-edge reasoning", "Advanced architecture", "Enterprise-grade security"],
    premium: true,
    featured: true
  },
  {
    label: "Claude 3.7 Sonnet 🧠",
    value: "claude-3-7-sonnet-20250219",
    provider: "claude",
    category: "reasoning-premium",
    description: "🤔 Advanced reasoning model • Multi-step thinking • Complex problem solving",
    quality: "reasoning-premium",
    speed: "12s", 
    costPer1M: "$8.00",
    strengths: ["Multi-step reasoning", "Complex analysis", "Chain-of-thought"],
    premium: true,
    reasoning: true
  },
  {
    label: "Claude 3.5 Sonnet 👑",
    value: "claude-3-5-sonnet-20241022",
    provider: "claude",
    category: "premium",
    description: "🧠 Advanced reasoning & architecture • Best for complex apps • $3/1M tokens",
    quality: "premium",
    speed: "8s",
    costPer1M: "$3.00",
    strengths: ["Complex reasoning", "Code architecture", "Security analysis"],
    premium: true
  },
  {
    label: "Claude 3.5 Haiku ⚡",
    value: "claude-3-5-haiku-20241022",
    provider: "claude",
    category: "fast-premium",
    description: "🚀 Fast premium quality • Quick prototypes & iterations • $0.25/1M tokens",
    quality: "fast-premium",
    speed: "3s",
    costPer1M: "$0.25",
    strengths: ["Fast generation", "Quick prototypes", "Code reviews"],
    premium: true
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
  
  // OpenRouter Models (Access to Everything) 🌐
  {
    label: "Claude Sonnet 4 (OpenRouter) 🔥",
    value: "anthropic/claude-4-sonnet:beta",
    provider: "openrouter",
    category: "ultra-premium",
    description: "🚀 Latest Claude 4 Sonnet via OpenRouter • 518B tokens • Ultimate reasoning",
    quality: "ultra-premium",
    speed: "12s",
    costPer1M: "$15.00",
    strengths: ["Cutting-edge AI", "Advanced reasoning", "Complex architecture"],
    premium: true,
    featured: true
  },
  {
    label: "Gemini 2.5 Flash (OpenRouter) ⚡",
    value: "google/gemini-2.5-flash",
    provider: "openrouter",
    category: "ultra-fast",
    description: "🌟 Latest Gemini 2.5 Flash • 253B tokens • Ultra-fast multimodal",
    quality: "premium",
    speed: "2s",
    costPer1M: "$0.075",
    strengths: ["Ultra-fast", "Multimodal", "Latest tech"],
    multimodal: true
  },
  {
    label: "Gemini 2.0 Flash (OpenRouter) 🎯",
    value: "google/gemini-2.0-flash",
    provider: "openrouter",
    category: "balanced",
    description: "⚡ Gemini 2.0 Flash • 221B tokens • Balanced performance",
    quality: "balanced",
    speed: "3s",
    costPer1M: "$0.075",
    strengths: ["Fast", "Multimodal", "Cost-effective"],
    multimodal: true
  },
  {
    label: "DeepSeek V3 (OpenRouter) 🧠",
    value: "deepseek/deepseek-v3-324",
    provider: "openrouter",
    category: "reasoning",
    description: "🤖 DeepSeek V3 • 99.5B tokens • Advanced reasoning • $0.27/1M",
    quality: "premium",
    speed: "5s",
    costPer1M: "$0.27",
    strengths: ["Advanced reasoning", "Cost-effective", "Latest AI"],
    reasoning: true
  },
  {
    label: "DeepSeek V3 Free 🆓",
    value: "deepseek/deepseek-v3-324:free",
    provider: "openrouter",
    category: "free",
    description: "🆓 FREE DeepSeek V3 • Full capability at no cost • Perfect for development",
    quality: "premium",
    speed: "6s",
    costPer1M: "$0.00",
    strengths: ["FREE!", "Full capability", "No limits"],
    free: true,
    featured: true
  },
  {
    label: "DeepSeek R1 Free 🆓",
    value: "deepseek/r1-0528:free",
    provider: "openrouter",
    category: "reasoning-free",
    description: "🆓 FREE DeepSeek R1 • Advanced reasoning at no cost",
    quality: "reasoning",
    speed: "8s",
    costPer1M: "$0.00",
    strengths: ["FREE reasoning", "Chain-of-thought", "No cost"],
    free: true,
    reasoning: true
  },
  {
    label: "Gemini Pro 2.5 (OpenRouter) 🎯",
    value: "google/gemini-2.5-pro",
    provider: "openrouter",
    category: "premium",
    description: "🏆 Gemini 2.5 Pro • 144B tokens • Premium multimodal • $2.50/1M",
    quality: "premium",
    speed: "8s",
    costPer1M: "$2.50",
    strengths: ["Premium quality", "Large context", "Multimodal"],
    premium: true,
    multimodal: true
  },
  {
    label: "Qwen 3 Coder (OpenRouter) 💻",
    value: "qwen/qwen-3-coder",
    provider: "openrouter",
    category: "code",
    description: "👨‍💻 Qwen 3 Coder • Specialized coding model • Best for development",
    quality: "premium",
    speed: "4s",
    costPer1M: "$0.30",
    strengths: ["Code generation", "Development", "Programming"],
    code: true
  },
  {
    label: "Claude 3.7 Sonnet (OpenRouter) 🧠",
    value: "anthropic/claude-3.7-sonnet",
    provider: "openrouter",
    category: "reasoning-premium",
    description: "🤔 Claude 3.7 Sonnet • Advanced reasoning • Multi-step thinking",
    quality: "reasoning-premium",
    speed: "10s",
    costPer1M: "$8.00",
    strengths: ["Advanced reasoning", "Multi-step logic", "Complex analysis"],
    premium: true,
    reasoning: true
  },
  {
    label: "DeepSeek V3.1 (OpenRouter) ⭐",
    value: "deepseek/deepseek-v3.1",
    provider: "openrouter",
    category: "latest",
    description: "⭐ DeepSeek V3.1 • Latest iteration • Enhanced capabilities",
    quality: "premium",
    speed: "5s",
    costPer1M: "$0.27",
    strengths: ["Latest version", "Enhanced", "Cost-effective"],
    latest: true
  },
  {
    label: "GPT-4 Turbo (OpenRouter) 🔵",
    value: "openai/gpt-4-turbo",
    provider: "openrouter",
    category: "versatile",
    description: "🔵 OpenAI GPT-4 Turbo • Versatile flagship model",
    quality: "premium",
    speed: "7s",
    costPer1M: "$10.00",
    strengths: ["Versatile", "Reliable", "Well-tested"],
    premium: true
  },
  {
    label: "GPT-4o (OpenRouter) 🎯",
    value: "openai/gpt-4o",
    provider: "openrouter",
    category: "balanced",
    description: "🎯 OpenAI GPT-4o • Optimized for speed and quality",
    quality: "balanced",
    speed: "4s",
    costPer1M: "$5.00",
    strengths: ["Optimized", "Fast", "Balanced"],
    balanced: true
  }
];

// AI Provider capabilities for smart routing
// Safe environment variable checking for client-side compatibility
const isServer = typeof window === 'undefined';

export const AI_PROVIDERS = {
  together: {
    name: "Together AI",
    description: "Multi-model platform with latest models",
    strengths: ["Latest models", "Reasoning", "Code generation", "Cost-effective"],
    available: true // Default to available, server-side will validate
  },
  claude: {
    name: "Anthropic Claude",
    description: "Premium AI for complex reasoning",
    strengths: ["Complex logic", "Security", "Architecture design", "Code review"],
    available: true // Default to available, server-side will validate
  },
  groq: {
    name: "Groq",
    description: "Ultra-fast inference",
    strengths: ["Speed", "API generation", "Prototyping", "Real-time"],
    available: true // Default to available, server-side will validate
  },
  gemini: {
    name: "Google Gemini",
    description: "Multimodal AI with vision capabilities",
    strengths: ["Multimodal", "Vision", "Large context", "Code understanding"],
    available: true // Default to available, server-side will validate
  },
  openrouter: {
    name: "OpenRouter", 
    description: "Access to all major models",
    strengths: ["Model variety", "Cost optimization", "Backup access", "Latest releases"],
    available: true // Default to available, server-side will validate
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
