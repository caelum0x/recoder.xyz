/**
 * Constants and configuration values
 */
export declare const VERSION = "1.0.0";
export declare const CLI_NAME = "recoder";
export declare const DISPLAY_NAME = "Recoder";
export declare const DESCRIPTION = "AI-powered development platform with production-ready code generation";
export declare const API_CONFIG: {
    readonly BASE_URL: "https://api.recoder.xyz";
    readonly VERSION: "v1";
    readonly TIMEOUT: 30000;
    readonly RETRIES: 3;
    readonly RATE_LIMIT: {
        readonly REQUESTS_PER_MINUTE: 100;
        readonly REQUESTS_PER_HOUR: 1000;
        readonly REQUESTS_PER_DAY: 10000;
    };
};
export declare const PATHS: {
    readonly CONFIG_DIR: ".recoder";
    readonly CONFIG_FILE: "config.json";
    readonly CACHE_DIR: "cache";
    readonly TEMPLATES_DIR: "templates";
    readonly LOGS_DIR: "logs";
    readonly TEMP_DIR: "temp";
    readonly PROJECTS_DIR: "projects";
    readonly BACKUPS_DIR: "backups";
};
export declare const EXTENSIONS: {
    readonly JAVASCRIPT: readonly [".js", ".mjs", ".cjs"];
    readonly TYPESCRIPT: readonly [".ts", ".tsx"];
    readonly PYTHON: readonly [".py", ".pyw"];
    readonly JAVA: readonly [".java"];
    readonly CSHARP: readonly [".cs"];
    readonly CPP: readonly [".cpp", ".cc", ".cxx", ".c++"];
    readonly C: readonly [".c"];
    readonly GO: readonly [".go"];
    readonly RUST: readonly [".rs"];
    readonly PHP: readonly [".php"];
    readonly RUBY: readonly [".rb"];
    readonly SWIFT: readonly [".swift"];
    readonly KOTLIN: readonly [".kt"];
    readonly DART: readonly [".dart"];
    readonly HTML: readonly [".html", ".htm"];
    readonly CSS: readonly [".css"];
    readonly SCSS: readonly [".scss"];
    readonly SASS: readonly [".sass"];
    readonly LESS: readonly [".less"];
    readonly JSON: readonly [".json"];
    readonly YAML: readonly [".yaml", ".yml"];
    readonly XML: readonly [".xml"];
    readonly MARKDOWN: readonly [".md", ".markdown"];
    readonly SHELL: readonly [".sh", ".bash", ".zsh"];
    readonly SQL: readonly [".sql"];
    readonly CONFIG: readonly [".config", ".conf", ".ini", ".env"];
    readonly LOCK: readonly [".lock"];
    readonly IGNORE: readonly [".gitignore", ".dockerignore", ".npmignore"];
};
export declare const TEMPLATE_CATEGORIES: {
    readonly WEB: "web";
    readonly MOBILE: "mobile";
    readonly API: "api";
    readonly LIBRARY: "library";
    readonly FULLSTACK: "fullstack";
    readonly BLOCKCHAIN: "blockchain";
    readonly AI: "ai";
    readonly DESKTOP: "desktop";
    readonly GAME: "game";
    readonly IOT: "iot";
    readonly MICROSERVICE: "microservice";
    readonly PLUGIN: "plugin";
};
export declare const FRAMEWORK_TYPES: {
    readonly FRONTEND: "frontend";
    readonly BACKEND: "backend";
    readonly FULLSTACK: "fullstack";
    readonly MOBILE: "mobile";
    readonly DESKTOP: "desktop";
    readonly LIBRARY: "library";
    readonly DATABASE: "database";
    readonly TESTING: "testing";
    readonly BUILD: "build";
    readonly DEPLOYMENT: "deployment";
};
export declare const FRAMEWORKS: {
    readonly FRONTEND: readonly ["React", "Vue.js", "Angular", "Svelte", "Next.js", "Nuxt.js", "Gatsby", "Remix", "SvelteKit", "Astro", "Solid.js", "Lit", "Stencil", "Alpine.js", "Preact"];
    readonly BACKEND: readonly ["Express.js", "FastAPI", "Django", "Flask", "NestJS", "Fastify", "Koa", "Hapi", "Spring Boot", "Laravel", "Ruby on Rails", "ASP.NET Core", "Phoenix", "Gin", "Actix"];
    readonly MOBILE: readonly ["React Native", "Flutter", "Ionic", "Cordova", "Xamarin", "NativeScript", "Capacitor", "Expo", "Quasar", "Framework7"];
    readonly DATABASE: readonly ["PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite", "Cassandra", "DynamoDB", "Firestore", "Supabase", "PlanetScale", "Prisma", "TypeORM", "Sequelize", "Mongoose"];
};
export declare const PACKAGE_MANAGERS: {
    readonly NODE: readonly ["npm", "yarn", "pnpm", "bun"];
    readonly PYTHON: readonly ["pip", "pipenv", "poetry", "conda"];
    readonly JAVA: readonly ["maven", "gradle"];
    readonly RUST: readonly ["cargo"];
    readonly GO: readonly ["go"];
    readonly PHP: readonly ["composer"];
    readonly RUBY: readonly ["bundler", "gem"];
    readonly CSHARP: readonly ["nuget"];
    readonly SWIFT: readonly ["swift"];
    readonly DART: readonly ["pub"];
};
export declare const BUILD_TOOLS: {
    readonly BUNDLERS: readonly ["webpack", "vite", "rollup", "parcel", "esbuild", "turbo"];
    readonly COMPILERS: readonly ["tsc", "babel", "swc", "sucrase"];
    readonly TASK_RUNNERS: readonly ["gulp", "grunt", "npm-scripts"];
    readonly PREPROCESSORS: readonly ["sass", "less", "stylus", "postcss"];
    readonly LINTERS: readonly ["eslint", "prettier", "stylelint", "htmlhint"];
    readonly TESTERS: readonly ["jest", "vitest", "cypress", "playwright", "mocha", "jasmine"];
};
export declare const CLOUD_PROVIDERS: {
    readonly HOSTING: readonly ["Vercel", "Netlify", "AWS", "Azure", "Google Cloud", "Heroku", "Railway", "Render"];
    readonly DATABASES: readonly ["AWS RDS", "Azure SQL", "Google Cloud SQL", "PlanetScale", "Supabase", "MongoDB Atlas"];
    readonly STORAGE: readonly ["AWS S3", "Azure Blob", "Google Cloud Storage", "Cloudinary", "UploadCare"];
    readonly CDN: readonly ["CloudFlare", "AWS CloudFront", "Azure CDN", "Google Cloud CDN", "KeyCDN"];
};
export declare const INTEGRATION_CATEGORIES: {
    readonly AUTHENTICATION: "authentication";
    readonly PAYMENT: "payment";
    readonly DATABASE: "database";
    readonly STORAGE: "storage";
    readonly EMAIL: "email";
    readonly SMS: "sms";
    readonly PUSH_NOTIFICATIONS: "push-notifications";
    readonly ANALYTICS: "analytics";
    readonly MONITORING: "monitoring";
    readonly SEARCH: "search";
    readonly AI: "ai";
    readonly BLOCKCHAIN: "blockchain";
    readonly SOCIAL: "social";
    readonly MAPS: "maps";
    readonly WEATHER: "weather";
    readonly FINANCE: "finance";
    readonly E_COMMERCE: "e-commerce";
    readonly CRM: "crm";
    readonly CMS: "cms";
    readonly DEPLOYMENT: "deployment";
};
export declare const INTEGRATIONS: {
    readonly AUTHENTICATION: readonly ["Auth0", "Firebase Auth", "Supabase Auth", "Clerk", "NextAuth.js", "Passport.js", "OAuth", "SAML", "LDAP", "JWT"];
    readonly PAYMENT: readonly ["Stripe", "PayPal", "Square", "Braintree", "Razorpay", "Paddle", "Lemon Squeezy", "Chargebee", "Recurly", "Adyen"];
    readonly EMAIL: readonly ["SendGrid", "Mailgun", "AWS SES", "Resend", "Postmark", "Mailchimp", "ConvertKit", "EmailJS", "Nodemailer"];
    readonly ANALYTICS: readonly ["Google Analytics", "Mixpanel", "Amplitude", "Segment", "Posthog", "Plausible", "Fathom", "Hotjar", "Heap"];
    readonly MONITORING: readonly ["Sentry", "DataDog", "New Relic", "Bugsnag", "LogRocket", "Rollbar", "Honeybadger", "Raygun"];
    readonly AI: readonly ["OpenAI", "Anthropic", "Cohere", "Hugging Face", "Google AI", "AWS Bedrock", "Azure OpenAI", "Replicate", "Stability AI"];
};
export declare const PROJECT_TYPES: {
    readonly WEB: "web";
    readonly MOBILE: "mobile";
    readonly DESKTOP: "desktop";
    readonly API: "api";
    readonly LIBRARY: "library";
    readonly MONOREPO: "monorepo";
    readonly PLUGIN: "plugin";
    readonly THEME: "theme";
    readonly BOILERPLATE: "boilerplate";
    readonly STARTER: "starter";
    readonly UNKNOWN: "unknown";
};
export declare const COMPLEXITY_LEVELS: {
    readonly SIMPLE: "simple";
    readonly MODERATE: "moderate";
    readonly COMPLEX: "complex";
    readonly ENTERPRISE: "enterprise";
};
export declare const QUALITY_GATES: {
    readonly CODE_COVERAGE: 80;
    readonly MAINTAINABILITY_INDEX: 70;
    readonly COMPLEXITY_THRESHOLD: 10;
    readonly DUPLICATION_THRESHOLD: 5;
    readonly SECURITY_SCORE: 80;
    readonly PERFORMANCE_SCORE: 80;
    readonly ACCESSIBILITY_SCORE: 90;
    readonly SEO_SCORE: 90;
    readonly BEST_PRACTICES_SCORE: 90;
};
export declare const VALIDATION_RULES: {
    readonly PROJECT_NAME: {
        readonly MIN_LENGTH: 2;
        readonly MAX_LENGTH: 100;
        readonly PATTERN: RegExp;
    };
    readonly EMAIL: {
        readonly PATTERN: RegExp;
    };
    readonly URL: {
        readonly PATTERN: RegExp;
    };
    readonly SEMVER: {
        readonly PATTERN: RegExp;
    };
    readonly UUID: {
        readonly PATTERN: RegExp;
    };
    readonly SLUG: {
        readonly PATTERN: RegExp;
    };
    readonly COLOR: {
        readonly HEX: RegExp;
        readonly RGB: RegExp;
        readonly RGBA: RegExp;
    };
};
export declare const LIMITS: {
    readonly MAX_FILE_SIZE: number;
    readonly MAX_FILES_PER_PROJECT: 10000;
    readonly MAX_TEMPLATE_SIZE: number;
    readonly MAX_CONCURRENT_GENERATIONS: 5;
    readonly MAX_HISTORY_ENTRIES: 100;
    readonly MAX_CACHE_SIZE: number;
    readonly MAX_LOG_FILE_SIZE: number;
    readonly MAX_LOG_FILES: 10;
    readonly REQUEST_TIMEOUT: 30000;
    readonly LONG_REQUEST_TIMEOUT: 300000;
    readonly WEBSOCKET_TIMEOUT: 60000;
    readonly CACHE_TTL: 3600000;
    readonly SESSION_TIMEOUT: 86400000;
};
export declare const FEATURE_FLAGS: {
    readonly ENABLE_TELEMETRY: true;
    readonly ENABLE_CRASH_REPORTING: true;
    readonly ENABLE_ANALYTICS: true;
    readonly ENABLE_AUTO_UPDATE: true;
    readonly ENABLE_BETA_FEATURES: false;
    readonly ENABLE_EXPERIMENTAL_FEATURES: false;
    readonly ENABLE_DEBUG_MODE: false;
    readonly ENABLE_VERBOSE_LOGGING: false;
    readonly ENABLE_OFFLINE_MODE: false;
    readonly ENABLE_MULTI_LANGUAGE: false;
};
export declare const ENV_VARS: {
    readonly NODE_ENV: "NODE_ENV";
    readonly PORT: "PORT";
    readonly HOST: "HOST";
    readonly API_URL: "RECODER_API_URL";
    readonly API_KEY: "RECODER_API_KEY";
    readonly CONFIG_PATH: "RECODER_CONFIG_PATH";
    readonly CACHE_PATH: "RECODER_CACHE_PATH";
    readonly LOG_LEVEL: "RECODER_LOG_LEVEL";
    readonly ENABLE_TELEMETRY: "RECODER_ENABLE_TELEMETRY";
    readonly ENABLE_ANALYTICS: "RECODER_ENABLE_ANALYTICS";
    readonly DEBUG: "RECODER_DEBUG";
    readonly VERBOSE: "RECODER_VERBOSE";
    readonly OFFLINE: "RECODER_OFFLINE";
    readonly NO_COLOR: "NO_COLOR";
    readonly FORCE_COLOR: "FORCE_COLOR";
    readonly CI: "CI";
    readonly GITHUB_ACTIONS: "GITHUB_ACTIONS";
    readonly GITLAB_CI: "GITLAB_CI";
    readonly JENKINS_URL: "JENKINS_URL";
    readonly BUILDKITE: "BUILDKITE";
    readonly CIRCLECI: "CIRCLECI";
};
export declare const ERROR_MESSAGES: {
    readonly NETWORK_ERROR: "Network error occurred. Please check your internet connection.";
    readonly AUTHENTICATION_REQUIRED: "Authentication required. Please log in.";
    readonly PERMISSION_DENIED: "Permission denied. You do not have access to this resource.";
    readonly RESOURCE_NOT_FOUND: "The requested resource was not found.";
    readonly VALIDATION_FAILED: "Validation failed. Please check your input.";
    readonly INTERNAL_ERROR: "An internal error occurred. Please try again later.";
    readonly RATE_LIMIT_EXCEEDED: "Rate limit exceeded. Please wait before trying again.";
    readonly TIMEOUT: "Request timed out. Please try again.";
    readonly CANCELLED: "Operation was cancelled.";
    readonly UNKNOWN_ERROR: "An unknown error occurred.";
};
export declare const SUCCESS_MESSAGES: {
    readonly OPERATION_COMPLETED: "Operation completed successfully.";
    readonly FILE_CREATED: "File created successfully.";
    readonly FILE_UPDATED: "File updated successfully.";
    readonly FILE_DELETED: "File deleted successfully.";
    readonly PROJECT_CREATED: "Project created successfully.";
    readonly PROJECT_UPDATED: "Project updated successfully.";
    readonly PROJECT_DELETED: "Project deleted successfully.";
    readonly AUTHENTICATION_SUCCESS: "Authentication successful.";
    readonly CONFIGURATION_SAVED: "Configuration saved successfully.";
    readonly TEMPLATE_DOWNLOADED: "Template downloaded successfully.";
    readonly GENERATION_COMPLETE: "Code generation completed successfully.";
};
export declare const COLORS: {
    readonly PRIMARY: "#3B82F6";
    readonly SUCCESS: "#10B981";
    readonly WARNING: "#F59E0B";
    readonly ERROR: "#EF4444";
    readonly INFO: "#6B7280";
    readonly MUTED: "#9CA3AF";
    readonly ACCENT: "#8B5CF6";
    readonly BACKGROUND: "#F9FAFB";
    readonly FOREGROUND: "#111827";
};
export declare const DEFAULT_TEMPLATES: {
    readonly WEB: {
        readonly 'nextjs-app': "Next.js App Router";
        readonly 'react-vite': "React with Vite";
        readonly 'vue-vite': "Vue 3 with Vite";
        readonly 'angular-app': "Angular Application";
        readonly 'svelte-kit': "SvelteKit Application";
    };
    readonly MOBILE: {
        readonly 'react-native': "React Native App";
        readonly 'flutter-app': "Flutter Application";
        readonly 'ionic-react': "Ionic React App";
        readonly 'expo-app': "Expo Application";
    };
    readonly API: {
        readonly 'express-api': "Express.js API";
        readonly 'fastapi-app': "FastAPI Application";
        readonly 'nestjs-api': "NestJS API";
        readonly 'django-api': "Django REST API";
    };
    readonly LIBRARY: {
        readonly 'npm-package': "NPM Package";
        readonly 'typescript-lib': "TypeScript Library";
        readonly 'python-package': "Python Package";
        readonly 'rust-crate': "Rust Crate";
    };
};
export declare const DEFAULT_INTEGRATIONS: {
    readonly AUTHENTICATION: readonly ["auth0", "firebase-auth", "supabase-auth"];
    readonly DATABASE: readonly ["postgresql", "mongodb", "sqlite"];
    readonly PAYMENT: readonly ["stripe", "paypal"];
    readonly EMAIL: readonly ["sendgrid", "resend"];
    readonly ANALYTICS: readonly ["google-analytics", "mixpanel"];
    readonly MONITORING: readonly ["sentry", "datadog"];
    readonly DEPLOYMENT: readonly ["vercel", "netlify", "aws"];
};
export declare const KEYBOARD_SHORTCUTS: {
    readonly QUIT: "Ctrl+C";
    readonly HELP: "h";
    readonly BACK: "Esc";
    readonly CONFIRM: "Enter";
    readonly CANCEL: "Esc";
    readonly UP: "ArrowUp";
    readonly DOWN: "ArrowDown";
    readonly LEFT: "ArrowLeft";
    readonly RIGHT: "ArrowRight";
    readonly SELECT: "Space";
    readonly TOGGLE: "Tab";
    readonly SEARCH: "/";
    readonly FILTER: "f";
    readonly SORT: "s";
    readonly REFRESH: "r";
    readonly EDIT: "e";
    readonly DELETE: "d";
    readonly COPY: "c";
    readonly PASTE: "v";
    readonly CUT: "x";
    readonly UNDO: "z";
    readonly REDO: "y";
    readonly SAVE: "Ctrl+S";
    readonly OPEN: "Ctrl+O";
    readonly NEW: "Ctrl+N";
    readonly FIND: "Ctrl+F";
    readonly REPLACE: "Ctrl+H";
    readonly ZOOM_IN: "Ctrl+=";
    readonly ZOOM_OUT: "Ctrl+-";
    readonly RESET_ZOOM: "Ctrl+0";
    readonly FULLSCREEN: "F11";
    readonly DEVELOPER_TOOLS: "F12";
};
export declare const CONSTANTS: {
    readonly VERSION: "1.0.0";
    readonly CLI_NAME: "recoder";
    readonly DISPLAY_NAME: "Recoder";
    readonly DESCRIPTION: "AI-powered development platform with production-ready code generation";
    readonly API_CONFIG: {
        readonly BASE_URL: "https://api.recoder.xyz";
        readonly VERSION: "v1";
        readonly TIMEOUT: 30000;
        readonly RETRIES: 3;
        readonly RATE_LIMIT: {
            readonly REQUESTS_PER_MINUTE: 100;
            readonly REQUESTS_PER_HOUR: 1000;
            readonly REQUESTS_PER_DAY: 10000;
        };
    };
    readonly PATHS: {
        readonly CONFIG_DIR: ".recoder";
        readonly CONFIG_FILE: "config.json";
        readonly CACHE_DIR: "cache";
        readonly TEMPLATES_DIR: "templates";
        readonly LOGS_DIR: "logs";
        readonly TEMP_DIR: "temp";
        readonly PROJECTS_DIR: "projects";
        readonly BACKUPS_DIR: "backups";
    };
    readonly EXTENSIONS: {
        readonly JAVASCRIPT: readonly [".js", ".mjs", ".cjs"];
        readonly TYPESCRIPT: readonly [".ts", ".tsx"];
        readonly PYTHON: readonly [".py", ".pyw"];
        readonly JAVA: readonly [".java"];
        readonly CSHARP: readonly [".cs"];
        readonly CPP: readonly [".cpp", ".cc", ".cxx", ".c++"];
        readonly C: readonly [".c"];
        readonly GO: readonly [".go"];
        readonly RUST: readonly [".rs"];
        readonly PHP: readonly [".php"];
        readonly RUBY: readonly [".rb"];
        readonly SWIFT: readonly [".swift"];
        readonly KOTLIN: readonly [".kt"];
        readonly DART: readonly [".dart"];
        readonly HTML: readonly [".html", ".htm"];
        readonly CSS: readonly [".css"];
        readonly SCSS: readonly [".scss"];
        readonly SASS: readonly [".sass"];
        readonly LESS: readonly [".less"];
        readonly JSON: readonly [".json"];
        readonly YAML: readonly [".yaml", ".yml"];
        readonly XML: readonly [".xml"];
        readonly MARKDOWN: readonly [".md", ".markdown"];
        readonly SHELL: readonly [".sh", ".bash", ".zsh"];
        readonly SQL: readonly [".sql"];
        readonly CONFIG: readonly [".config", ".conf", ".ini", ".env"];
        readonly LOCK: readonly [".lock"];
        readonly IGNORE: readonly [".gitignore", ".dockerignore", ".npmignore"];
    };
    readonly TEMPLATE_CATEGORIES: {
        readonly WEB: "web";
        readonly MOBILE: "mobile";
        readonly API: "api";
        readonly LIBRARY: "library";
        readonly FULLSTACK: "fullstack";
        readonly BLOCKCHAIN: "blockchain";
        readonly AI: "ai";
        readonly DESKTOP: "desktop";
        readonly GAME: "game";
        readonly IOT: "iot";
        readonly MICROSERVICE: "microservice";
        readonly PLUGIN: "plugin";
    };
    readonly FRAMEWORK_TYPES: {
        readonly FRONTEND: "frontend";
        readonly BACKEND: "backend";
        readonly FULLSTACK: "fullstack";
        readonly MOBILE: "mobile";
        readonly DESKTOP: "desktop";
        readonly LIBRARY: "library";
        readonly DATABASE: "database";
        readonly TESTING: "testing";
        readonly BUILD: "build";
        readonly DEPLOYMENT: "deployment";
    };
    readonly FRAMEWORKS: {
        readonly FRONTEND: readonly ["React", "Vue.js", "Angular", "Svelte", "Next.js", "Nuxt.js", "Gatsby", "Remix", "SvelteKit", "Astro", "Solid.js", "Lit", "Stencil", "Alpine.js", "Preact"];
        readonly BACKEND: readonly ["Express.js", "FastAPI", "Django", "Flask", "NestJS", "Fastify", "Koa", "Hapi", "Spring Boot", "Laravel", "Ruby on Rails", "ASP.NET Core", "Phoenix", "Gin", "Actix"];
        readonly MOBILE: readonly ["React Native", "Flutter", "Ionic", "Cordova", "Xamarin", "NativeScript", "Capacitor", "Expo", "Quasar", "Framework7"];
        readonly DATABASE: readonly ["PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite", "Cassandra", "DynamoDB", "Firestore", "Supabase", "PlanetScale", "Prisma", "TypeORM", "Sequelize", "Mongoose"];
    };
    readonly PACKAGE_MANAGERS: {
        readonly NODE: readonly ["npm", "yarn", "pnpm", "bun"];
        readonly PYTHON: readonly ["pip", "pipenv", "poetry", "conda"];
        readonly JAVA: readonly ["maven", "gradle"];
        readonly RUST: readonly ["cargo"];
        readonly GO: readonly ["go"];
        readonly PHP: readonly ["composer"];
        readonly RUBY: readonly ["bundler", "gem"];
        readonly CSHARP: readonly ["nuget"];
        readonly SWIFT: readonly ["swift"];
        readonly DART: readonly ["pub"];
    };
    readonly BUILD_TOOLS: {
        readonly BUNDLERS: readonly ["webpack", "vite", "rollup", "parcel", "esbuild", "turbo"];
        readonly COMPILERS: readonly ["tsc", "babel", "swc", "sucrase"];
        readonly TASK_RUNNERS: readonly ["gulp", "grunt", "npm-scripts"];
        readonly PREPROCESSORS: readonly ["sass", "less", "stylus", "postcss"];
        readonly LINTERS: readonly ["eslint", "prettier", "stylelint", "htmlhint"];
        readonly TESTERS: readonly ["jest", "vitest", "cypress", "playwright", "mocha", "jasmine"];
    };
    readonly CLOUD_PROVIDERS: {
        readonly HOSTING: readonly ["Vercel", "Netlify", "AWS", "Azure", "Google Cloud", "Heroku", "Railway", "Render"];
        readonly DATABASES: readonly ["AWS RDS", "Azure SQL", "Google Cloud SQL", "PlanetScale", "Supabase", "MongoDB Atlas"];
        readonly STORAGE: readonly ["AWS S3", "Azure Blob", "Google Cloud Storage", "Cloudinary", "UploadCare"];
        readonly CDN: readonly ["CloudFlare", "AWS CloudFront", "Azure CDN", "Google Cloud CDN", "KeyCDN"];
    };
    readonly INTEGRATION_CATEGORIES: {
        readonly AUTHENTICATION: "authentication";
        readonly PAYMENT: "payment";
        readonly DATABASE: "database";
        readonly STORAGE: "storage";
        readonly EMAIL: "email";
        readonly SMS: "sms";
        readonly PUSH_NOTIFICATIONS: "push-notifications";
        readonly ANALYTICS: "analytics";
        readonly MONITORING: "monitoring";
        readonly SEARCH: "search";
        readonly AI: "ai";
        readonly BLOCKCHAIN: "blockchain";
        readonly SOCIAL: "social";
        readonly MAPS: "maps";
        readonly WEATHER: "weather";
        readonly FINANCE: "finance";
        readonly E_COMMERCE: "e-commerce";
        readonly CRM: "crm";
        readonly CMS: "cms";
        readonly DEPLOYMENT: "deployment";
    };
    readonly INTEGRATIONS: {
        readonly AUTHENTICATION: readonly ["Auth0", "Firebase Auth", "Supabase Auth", "Clerk", "NextAuth.js", "Passport.js", "OAuth", "SAML", "LDAP", "JWT"];
        readonly PAYMENT: readonly ["Stripe", "PayPal", "Square", "Braintree", "Razorpay", "Paddle", "Lemon Squeezy", "Chargebee", "Recurly", "Adyen"];
        readonly EMAIL: readonly ["SendGrid", "Mailgun", "AWS SES", "Resend", "Postmark", "Mailchimp", "ConvertKit", "EmailJS", "Nodemailer"];
        readonly ANALYTICS: readonly ["Google Analytics", "Mixpanel", "Amplitude", "Segment", "Posthog", "Plausible", "Fathom", "Hotjar", "Heap"];
        readonly MONITORING: readonly ["Sentry", "DataDog", "New Relic", "Bugsnag", "LogRocket", "Rollbar", "Honeybadger", "Raygun"];
        readonly AI: readonly ["OpenAI", "Anthropic", "Cohere", "Hugging Face", "Google AI", "AWS Bedrock", "Azure OpenAI", "Replicate", "Stability AI"];
    };
    readonly PROJECT_TYPES: {
        readonly WEB: "web";
        readonly MOBILE: "mobile";
        readonly DESKTOP: "desktop";
        readonly API: "api";
        readonly LIBRARY: "library";
        readonly MONOREPO: "monorepo";
        readonly PLUGIN: "plugin";
        readonly THEME: "theme";
        readonly BOILERPLATE: "boilerplate";
        readonly STARTER: "starter";
        readonly UNKNOWN: "unknown";
    };
    readonly COMPLEXITY_LEVELS: {
        readonly SIMPLE: "simple";
        readonly MODERATE: "moderate";
        readonly COMPLEX: "complex";
        readonly ENTERPRISE: "enterprise";
    };
    readonly QUALITY_GATES: {
        readonly CODE_COVERAGE: 80;
        readonly MAINTAINABILITY_INDEX: 70;
        readonly COMPLEXITY_THRESHOLD: 10;
        readonly DUPLICATION_THRESHOLD: 5;
        readonly SECURITY_SCORE: 80;
        readonly PERFORMANCE_SCORE: 80;
        readonly ACCESSIBILITY_SCORE: 90;
        readonly SEO_SCORE: 90;
        readonly BEST_PRACTICES_SCORE: 90;
    };
    readonly VALIDATION_RULES: {
        readonly PROJECT_NAME: {
            readonly MIN_LENGTH: 2;
            readonly MAX_LENGTH: 100;
            readonly PATTERN: RegExp;
        };
        readonly EMAIL: {
            readonly PATTERN: RegExp;
        };
        readonly URL: {
            readonly PATTERN: RegExp;
        };
        readonly SEMVER: {
            readonly PATTERN: RegExp;
        };
        readonly UUID: {
            readonly PATTERN: RegExp;
        };
        readonly SLUG: {
            readonly PATTERN: RegExp;
        };
        readonly COLOR: {
            readonly HEX: RegExp;
            readonly RGB: RegExp;
            readonly RGBA: RegExp;
        };
    };
    readonly LIMITS: {
        readonly MAX_FILE_SIZE: number;
        readonly MAX_FILES_PER_PROJECT: 10000;
        readonly MAX_TEMPLATE_SIZE: number;
        readonly MAX_CONCURRENT_GENERATIONS: 5;
        readonly MAX_HISTORY_ENTRIES: 100;
        readonly MAX_CACHE_SIZE: number;
        readonly MAX_LOG_FILE_SIZE: number;
        readonly MAX_LOG_FILES: 10;
        readonly REQUEST_TIMEOUT: 30000;
        readonly LONG_REQUEST_TIMEOUT: 300000;
        readonly WEBSOCKET_TIMEOUT: 60000;
        readonly CACHE_TTL: 3600000;
        readonly SESSION_TIMEOUT: 86400000;
    };
    readonly FEATURE_FLAGS: {
        readonly ENABLE_TELEMETRY: true;
        readonly ENABLE_CRASH_REPORTING: true;
        readonly ENABLE_ANALYTICS: true;
        readonly ENABLE_AUTO_UPDATE: true;
        readonly ENABLE_BETA_FEATURES: false;
        readonly ENABLE_EXPERIMENTAL_FEATURES: false;
        readonly ENABLE_DEBUG_MODE: false;
        readonly ENABLE_VERBOSE_LOGGING: false;
        readonly ENABLE_OFFLINE_MODE: false;
        readonly ENABLE_MULTI_LANGUAGE: false;
    };
    readonly ENV_VARS: {
        readonly NODE_ENV: "NODE_ENV";
        readonly PORT: "PORT";
        readonly HOST: "HOST";
        readonly API_URL: "RECODER_API_URL";
        readonly API_KEY: "RECODER_API_KEY";
        readonly CONFIG_PATH: "RECODER_CONFIG_PATH";
        readonly CACHE_PATH: "RECODER_CACHE_PATH";
        readonly LOG_LEVEL: "RECODER_LOG_LEVEL";
        readonly ENABLE_TELEMETRY: "RECODER_ENABLE_TELEMETRY";
        readonly ENABLE_ANALYTICS: "RECODER_ENABLE_ANALYTICS";
        readonly DEBUG: "RECODER_DEBUG";
        readonly VERBOSE: "RECODER_VERBOSE";
        readonly OFFLINE: "RECODER_OFFLINE";
        readonly NO_COLOR: "NO_COLOR";
        readonly FORCE_COLOR: "FORCE_COLOR";
        readonly CI: "CI";
        readonly GITHUB_ACTIONS: "GITHUB_ACTIONS";
        readonly GITLAB_CI: "GITLAB_CI";
        readonly JENKINS_URL: "JENKINS_URL";
        readonly BUILDKITE: "BUILDKITE";
        readonly CIRCLECI: "CIRCLECI";
    };
    readonly ERROR_MESSAGES: {
        readonly NETWORK_ERROR: "Network error occurred. Please check your internet connection.";
        readonly AUTHENTICATION_REQUIRED: "Authentication required. Please log in.";
        readonly PERMISSION_DENIED: "Permission denied. You do not have access to this resource.";
        readonly RESOURCE_NOT_FOUND: "The requested resource was not found.";
        readonly VALIDATION_FAILED: "Validation failed. Please check your input.";
        readonly INTERNAL_ERROR: "An internal error occurred. Please try again later.";
        readonly RATE_LIMIT_EXCEEDED: "Rate limit exceeded. Please wait before trying again.";
        readonly TIMEOUT: "Request timed out. Please try again.";
        readonly CANCELLED: "Operation was cancelled.";
        readonly UNKNOWN_ERROR: "An unknown error occurred.";
    };
    readonly SUCCESS_MESSAGES: {
        readonly OPERATION_COMPLETED: "Operation completed successfully.";
        readonly FILE_CREATED: "File created successfully.";
        readonly FILE_UPDATED: "File updated successfully.";
        readonly FILE_DELETED: "File deleted successfully.";
        readonly PROJECT_CREATED: "Project created successfully.";
        readonly PROJECT_UPDATED: "Project updated successfully.";
        readonly PROJECT_DELETED: "Project deleted successfully.";
        readonly AUTHENTICATION_SUCCESS: "Authentication successful.";
        readonly CONFIGURATION_SAVED: "Configuration saved successfully.";
        readonly TEMPLATE_DOWNLOADED: "Template downloaded successfully.";
        readonly GENERATION_COMPLETE: "Code generation completed successfully.";
    };
    readonly COLORS: {
        readonly PRIMARY: "#3B82F6";
        readonly SUCCESS: "#10B981";
        readonly WARNING: "#F59E0B";
        readonly ERROR: "#EF4444";
        readonly INFO: "#6B7280";
        readonly MUTED: "#9CA3AF";
        readonly ACCENT: "#8B5CF6";
        readonly BACKGROUND: "#F9FAFB";
        readonly FOREGROUND: "#111827";
    };
    readonly DEFAULT_TEMPLATES: {
        readonly WEB: {
            readonly 'nextjs-app': "Next.js App Router";
            readonly 'react-vite': "React with Vite";
            readonly 'vue-vite': "Vue 3 with Vite";
            readonly 'angular-app': "Angular Application";
            readonly 'svelte-kit': "SvelteKit Application";
        };
        readonly MOBILE: {
            readonly 'react-native': "React Native App";
            readonly 'flutter-app': "Flutter Application";
            readonly 'ionic-react': "Ionic React App";
            readonly 'expo-app': "Expo Application";
        };
        readonly API: {
            readonly 'express-api': "Express.js API";
            readonly 'fastapi-app': "FastAPI Application";
            readonly 'nestjs-api': "NestJS API";
            readonly 'django-api': "Django REST API";
        };
        readonly LIBRARY: {
            readonly 'npm-package': "NPM Package";
            readonly 'typescript-lib': "TypeScript Library";
            readonly 'python-package': "Python Package";
            readonly 'rust-crate': "Rust Crate";
        };
    };
    readonly DEFAULT_INTEGRATIONS: {
        readonly AUTHENTICATION: readonly ["auth0", "firebase-auth", "supabase-auth"];
        readonly DATABASE: readonly ["postgresql", "mongodb", "sqlite"];
        readonly PAYMENT: readonly ["stripe", "paypal"];
        readonly EMAIL: readonly ["sendgrid", "resend"];
        readonly ANALYTICS: readonly ["google-analytics", "mixpanel"];
        readonly MONITORING: readonly ["sentry", "datadog"];
        readonly DEPLOYMENT: readonly ["vercel", "netlify", "aws"];
    };
    readonly KEYBOARD_SHORTCUTS: {
        readonly QUIT: "Ctrl+C";
        readonly HELP: "h";
        readonly BACK: "Esc";
        readonly CONFIRM: "Enter";
        readonly CANCEL: "Esc";
        readonly UP: "ArrowUp";
        readonly DOWN: "ArrowDown";
        readonly LEFT: "ArrowLeft";
        readonly RIGHT: "ArrowRight";
        readonly SELECT: "Space";
        readonly TOGGLE: "Tab";
        readonly SEARCH: "/";
        readonly FILTER: "f";
        readonly SORT: "s";
        readonly REFRESH: "r";
        readonly EDIT: "e";
        readonly DELETE: "d";
        readonly COPY: "c";
        readonly PASTE: "v";
        readonly CUT: "x";
        readonly UNDO: "z";
        readonly REDO: "y";
        readonly SAVE: "Ctrl+S";
        readonly OPEN: "Ctrl+O";
        readonly NEW: "Ctrl+N";
        readonly FIND: "Ctrl+F";
        readonly REPLACE: "Ctrl+H";
        readonly ZOOM_IN: "Ctrl+=";
        readonly ZOOM_OUT: "Ctrl+-";
        readonly RESET_ZOOM: "Ctrl+0";
        readonly FULLSCREEN: "F11";
        readonly DEVELOPER_TOOLS: "F12";
    };
};
export type TemplateCategory = typeof TEMPLATE_CATEGORIES[keyof typeof TEMPLATE_CATEGORIES];
export type FrameworkType = typeof FRAMEWORK_TYPES[keyof typeof FRAMEWORK_TYPES];
export type ProjectType = typeof PROJECT_TYPES[keyof typeof PROJECT_TYPES];
export type ComplexityLevel = typeof COMPLEXITY_LEVELS[keyof typeof COMPLEXITY_LEVELS];
export type IntegrationCategory = typeof INTEGRATION_CATEGORIES[keyof typeof INTEGRATION_CATEGORIES];
//# sourceMappingURL=constants.d.ts.map