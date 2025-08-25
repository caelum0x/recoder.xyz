# 🏗️ Recoder.xyz Complete Platform Architecture

## 🌐 Platform Overview

Recoder.xyz is a comprehensive AI development ecosystem consisting of 5 integrated platforms with unified authentication, billing, and AI model routing.

### Platform Components
- **🌐 recoder.xyz** - Main website (auth, billing, dashboard, docs)
- **💬 chat.recoder.xyz** - Multi-AI chat platform (ChatGPT competitor)  
- **🛠️ web.recoder.xyz** - AI app builder (bolt.new competitor)
- **📦 @recoder/cli** - Developer CLI tool
- **⚙️ recoder-cli-router** - AI model router for cost optimization

---

## 🏛️ Infrastructure Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        🌐 Domain Structure                      │
├─────────────────────────────────────────────────────────────────┤
│ recoder.xyz           → Main website + API                     │
│ chat.recoder.xyz      → AI Chat Platform                       │
│ web.recoder.xyz       → AI App Builder                         │
│ api.recoder.xyz       → Unified API Gateway                    │
│ engine.recoder.xyz    → Production Engine API                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    🔄 Data Flow Architecture                    │
└─────────────────────────────────────────────────────────────────┘

    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
    │   🌐 recoder.xyz │    │💬 chat.recoder  │    │🛠️ web.recoder   │
    │                 │    │                 │    │                 │
    │ • Authentication│    │ • Multi-AI Chat │    │ • App Builder   │
    │ • Billing       │    │ • Conversations │    │ • Live Preview  │
    │ • Dashboard     │    │ • File Upload   │    │ • Deployment    │
    │ • Docs          │    │ • History       │    │ • Collaboration │
    └─────────────────┘    └─────────────────┘    └─────────────────┘
            │                       │                       │
            │                       │                       │
            └───────────────────────┼───────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                 🔌 api.recoder.xyz (Unified API)                │
    │                                                                 │
    │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
    │  │   🔐 Auth       │  │   💳 Billing    │  │   📊 Analytics  │  │
    │  │   Service       │  │   Service       │  │   Service       │  │
    │  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
    │                                                                 │
    │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
    │  │   🤖 AI Router  │  │   📝 Projects   │  │   👥 Users      │  │
    │  │   Service       │  │   Service       │  │   Service       │  │
    │  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │              🏭 engine.recoder.xyz (Production Engine)          │
    │                                                                 │
    │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
    │  │   🔧 Code Gen   │  │   ✅ Validation │  │   🚀 Deploy     │  │
    │  │   Engine        │  │   Engine        │  │   Engine        │  │
    │  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                      🗄️ Data Layer                              │
    │                                                                 │
    │  ┌─────────────────────────────┐  ┌─────────────────────────────┐ │
    │  │      📊 PostgreSQL          │  │         ⚡ Redis             │ │
    │  │                             │  │                             │ │
    │  │ • users                     │  │ • sessions                  │ │
    │  │ • api_keys                  │  │ • rate_limits               │ │
    │  │ • subscriptions             │  │ • cache                     │ │
    │  │ • usage_logs                │  │ • pub/sub                   │ │
    │  │ • chat_sessions              │  │ • real-time events          │ │
    │  │ • projects                  │  │                             │ │
    │  │ • cli_sessions              │  │                             │ │
    │  └─────────────────────────────┘  └─────────────────────────────┘ │
    └─────────────────────────────────────────────────────────────────┘

┌─────────────────┐              ┌─────────────────┐
│   📦 @recoder   │              │ ⚙️ recoder-cli  │
│   /cli          │              │   -router       │
│                 │              │                 │
│ • Code Gen      │              │ • Model Routing │
│ • Auth Flow     │              │ • Cost Opt      │
│ • Project Mgmt  │              │ • Load Balance  │
│ • Real-time     │              │ • Enterprise    │
└─────────────────┘              └─────────────────┘
        │                                │
        │                                │
        └────────────────┬───────────────┘
                         │
                         ▼
            ┌─────────────────────────────────┐
            │    🔌 API Gateway Integration   │
            │                                 │
            │ • JWT Authentication            │
            │ • API Key Validation            │
            │ • Usage Tracking                │
            │ • Rate Limiting                 │
            │ • Model Routing                 │
            │ • Cost Optimization             │
            └─────────────────────────────────┘
```

---

## 🔐 Authentication Flow Architecture

### 1. Web Authentication Flow
```
User → recoder.xyz/login → OAuth (Google/GitHub) → JWT Token → Dashboard
                        ↓
                   Set HttpOnly Cookie + Session
                        ↓
            ┌─────────────────────────────────────┐
            │     Cross-Domain Authentication     │
            │                                     │
            │ chat.recoder.xyz ← JWT Cookie       │
            │ web.recoder.xyz  ← JWT Cookie       │
            │ api.recoder.xyz  ← JWT Header       │
            └─────────────────────────────────────┘
```

### 2. CLI Authentication Flow
```
@recoder/cli auth → Generate Device Code → Display to User
                                      ↓
User visits: recoder.xyz/cli-auth?code=ABC123
                                      ↓
                         User Authenticates on Web
                                      ↓
                           CLI Polls for Token
                                      ↓
                         Receive JWT + API Key
                                      ↓
                        Store in ~/.recoder/config.json
```

### 3. CLI Router Authentication Flow
```
recoder-cli-router setup → Enterprise License Key
                                      ↓
                         Validate License on Backend
                                      ↓
                            Generate API Pool Keys
                                      ↓
                       Store in Enterprise Config
                                      ↓
                         Team Dashboard Access
```

---

## 🤖 AI Model Routing Architecture

### Multi-AI Provider Integration
```
┌─────────────────────────────────────────────────────────────────┐
│                    🧠 AI Model Router                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┐  │
│  │ 🎯 DeepSeek │  │ 🚀 Claude   │  │ ⚡ Groq     │  │🌟 Gemini│  │
│  │ R1 (Cheap)  │  │ (Reasoning) │  │ (Fast)     │  │(Context)│  │
│  │             │  │             │  │             │  │         │  │
│  │ $0.55/$2.19 │  │ $3.00/$15   │  │ $0.05/$0.08│  │$1.25/$5 │  │
│  │ per 1M      │  │ per 1M      │  │ per 1M     │  │per 1M   │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              🎛️ Smart Routing Logic                        │ │
│  │                                                             │ │
│  │  if (complexity === 'low') → DeepSeek (70% traffic)        │ │
│  │  if (reasoning_required) → Claude (8% traffic)             │ │
│  │  if (speed_critical) → Groq (20% traffic)                  │ │
│  │  if (multimodal) → Gemini (2% traffic)                     │ │
│  │  if (user === 'free') → Ollama (local models)              │ │
│  │                                                             │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Cost Optimization Strategy
```
Target: 79% Profit Margin on $20/month Plans

Revenue:        $20.00/month/user
AI Costs:       $0.61/month (optimized routing)
Infrastructure: $2.00/month  
Operations:     $1.00/month
Payment Fees:   $0.60/month (3%)
Support:        $1.00/month
─────────────────────────────────
Total Costs:    $5.21/month
Profit:         $14.79/month (73.95% margin)
```

---

## 📊 Database Schema Architecture

### Core Tables Schema
```sql
-- Users table (unified across all platforms)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    avatar_url TEXT,
    auth_provider VARCHAR(50), -- 'google', 'github', 'email'
    auth_provider_id VARCHAR(255),
    tier VARCHAR(20) DEFAULT 'free', -- 'free', 'premium', 'pro', 'enterprise'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- API Keys for CLI and CLI Router
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, -- 'cli-personal', 'router-enterprise'
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    key_prefix VARCHAR(20) NOT NULL, -- 'rcd_', 'rcr_'
    platform VARCHAR(50) NOT NULL, -- 'cli', 'router', 'web', 'chat'
    permissions JSONB DEFAULT '{}', -- {'models': ['*'], 'rate_limit': 1000}
    usage_limit INTEGER, -- monthly token limit
    is_active BOOLEAN DEFAULT true,
    last_used TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Subscription Management
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    plan VARCHAR(50) NOT NULL, -- 'free', 'premium', 'pro', 'enterprise'
    status VARCHAR(50) NOT NULL, -- 'active', 'canceled', 'past_due'
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    cancel_at_period_end BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Usage Tracking across all platforms
CREATE TABLE usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL, -- 'cli', 'router', 'chat', 'web'
    model_used VARCHAR(100) NOT NULL, -- 'deepseek-r1', 'claude-sonnet-4'
    request_type VARCHAR(50), -- 'chat', 'completion', 'generation'
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
    cost_usd DECIMAL(10,6) NOT NULL,
    response_time_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    request_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Chat Sessions (chat.recoder.xyz)
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    model_preference VARCHAR(100),
    system_prompt TEXT,
    is_shared BOOLEAN DEFAULT false,
    share_id VARCHAR(255) UNIQUE,
    message_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL, -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    model_used VARCHAR(100),
    tokens_used INTEGER,
    cost_usd DECIMAL(10,6),
    reasoning_chain JSONB, -- For DeepSeek R1 transparency
    created_at TIMESTAMP DEFAULT NOW()
);

-- Projects (web.recoder.xyz)
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template VARCHAR(100), -- 'react', 'nextjs', 'vue', 'svelte'
    tech_stack JSONB, -- {'frontend': 'react', 'backend': 'node', 'db': 'postgres'}
    file_structure JSONB, -- Complete project file tree
    deployment_url TEXT,
    is_public BOOLEAN DEFAULT false,
    share_id VARCHAR(255) UNIQUE,
    fork_count INTEGER DEFAULT 0,
    star_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- CLI Sessions for device tracking
CREATE TABLE cli_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_name VARCHAR(255),
    device_id VARCHAR(255) UNIQUE,
    ip_address INET,
    user_agent TEXT,
    last_active TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Enterprise Router Teams
CREATE TABLE router_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    license_key VARCHAR(255) UNIQUE NOT NULL,
    admin_user_id UUID REFERENCES users(id),
    model_preferences JSONB,
    cost_limits JSONB, -- {'daily': 100, 'monthly': 2000}
    member_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE router_team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES router_teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member', -- 'admin', 'member'
    joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);
```

---

## 🔌 API Endpoint Architecture

### Main API Gateway (api.recoder.xyz)
```
Authentication:
POST   /auth/login              # Web login
POST   /auth/register           # Web registration  
POST   /auth/cli/device         # CLI device flow start
POST   /auth/cli/poll           # CLI device flow poll
POST   /auth/refresh            # JWT token refresh
DELETE /auth/logout             # Logout

User Management:
GET    /users/profile           # Get user profile
PUT    /users/profile           # Update user profile
GET    /users/usage             # Get usage statistics
GET    /users/api-keys          # List API keys
POST   /users/api-keys          # Create API key
DELETE /users/api-keys/:id      # Revoke API key

Billing:
GET    /billing/subscription    # Get subscription info
POST   /billing/checkout        # Create Stripe checkout
POST   /billing/portal          # Stripe customer portal
POST   /billing/webhooks        # Stripe webhooks
GET    /billing/invoices        # Get invoices

AI Services:
POST   /ai/chat                 # Chat completion
POST   /ai/completion           # Code completion
POST   /ai/models               # List available models
POST   /ai/route                # Get optimal model routing

Projects (for web.recoder.xyz):
GET    /projects                # List user projects
POST   /projects                # Create project
GET    /projects/:id            # Get project
PUT    /projects/:id            # Update project
DELETE /projects/:id            # Delete project
POST   /projects/:id/deploy     # Deploy project

Chat (for chat.recoder.xyz):
GET    /chat/sessions           # List chat sessions
POST   /chat/sessions           # Create chat session
GET    /chat/sessions/:id       # Get chat session
PUT    /chat/sessions/:id       # Update chat session
POST   /chat/sessions/:id/messages # Send message

CLI Services:
POST   /cli/auth                # CLI authentication
GET    /cli/config              # Get CLI config
POST   /cli/generate            # Generate code
POST   /cli/validate            # Validate code
GET    /cli/templates           # List templates

Router Services:
POST   /router/auth             # Router authentication  
GET    /router/teams            # List teams
POST   /router/teams            # Create team
GET    /router/teams/:id/usage  # Team usage stats
PUT    /router/teams/:id/config # Update team config
```

### Production Engine API (engine.recoder.xyz)
```
Code Generation:
POST   /generate/app            # Generate full application
POST   /generate/component      # Generate component
POST   /generate/function       # Generate function
POST   /generate/test           # Generate tests

Code Validation:
POST   /validate/code           # Validate code quality
POST   /validate/security       # Security scan
POST   /validate/performance    # Performance analysis
POST   /validate/functionality  # Test actual functionality

Deployment:
POST   /deploy/vercel           # Deploy to Vercel
POST   /deploy/netlify          # Deploy to Netlify
POST   /deploy/aws              # Deploy to AWS
GET    /deploy/:id/status       # Deployment status

Analysis:
POST   /analyze/repository      # Analyze entire repository
POST   /analyze/dependencies    # Analyze dependencies
POST   /analyze/performance     # Performance analysis
POST   /analyze/security        # Security analysis
```

---

## 🔄 Real-Time Architecture

### WebSocket Integration
```
┌─────────────────────────────────────────────────────────────────┐
│                    🔄 Real-Time Engine                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  chat.recoder.xyz WebSocket:                                    │
│  • /ws/chat/:session_id → Real-time chat messages              │
│  • Message streaming from AI models                            │
│  • Typing indicators                                           │
│  • User presence                                               │
│                                                                 │
│  web.recoder.xyz WebSocket:                                     │
│  • /ws/project/:project_id → Live collaboration                │
│  • Real-time file editing                                      │
│  • Live preview updates                                        │
│  • Multi-user cursors                                          │
│                                                                 │
│  CLI Real-time:                                                 │
│  • Server-Sent Events for progress updates                     │
│  • Real-time build status                                      │
│  • Live deployment monitoring                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Deployment Architecture

### Infrastructure Layout
```
┌─────────────────────────────────────────────────────────────────┐
│                      🌍 Production Setup                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🔄 Load Balancer (Cloudflare)                                 │
│  • SSL Termination                                             │
│  • DDoS Protection                                             │
│  • Global CDN                                                  │
│  • Domain Routing                                              │
│                                                                 │
│  📦 Kubernetes Cluster (Google GKE)                            │
│  • Auto-scaling pods                                           │
│  • Zero-downtime deployments                                   │
│  • Health checks                                               │
│  • Service mesh                                                │
│                                                                 │
│  🗄️ Database Cluster                                           │
│  • PostgreSQL Primary + Read Replicas                          │
│  • Redis Cluster for caching/sessions                          │
│  • Automated backups                                           │
│  • Point-in-time recovery                                      │
│                                                                 │
│  📊 Monitoring & Logging                                       │
│  • Prometheus + Grafana                                        │
│  • Elasticsearch + Kibana                                      │
│  • Error tracking (Sentry)                                     │
│  • Performance monitoring (DataDog)                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Security Architecture

### Security Layers
```
┌─────────────────────────────────────────────────────────────────┐
│                     🛡️ Security Framework                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🔐 Authentication Security:                                    │
│  • JWT with RS256 signing                                      │
│  • Refresh token rotation                                      │
│  • API key rotation                                            │
│  • Rate limiting per user/key                                  │
│                                                                 │
│  🔒 Data Protection:                                            │
│  • Encryption at rest (AES-256)                                │
│  • TLS 1.3 in transit                                          │
│  • API key hashing (bcrypt)                                    │
│  • PII data anonymization                                      │
│                                                                 │
│  🚨 Threat Protection:                                          │
│  • OWASP security headers                                      │
│  • Input validation & sanitization                             │
│  • SQL injection prevention                                    │
│  • XSS protection                                              │
│  • CSRF tokens                                                 │
│                                                                 │
│  📋 Compliance:                                                 │
│  • GDPR compliance                                             │
│  • SOC 2 Type II                                               │
│  • Security audit logging                                      │
│  • Data retention policies                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Integration Summary

This architecture provides:

1. **🔄 Unified Authentication** - Single sign-on across all platforms
2. **🤖 Smart AI Routing** - Cost-optimized model selection  
3. **⚡ Real-time Features** - Live collaboration and chat
4. **🚀 Production Ready** - Enterprise-grade security and scaling
5. **💰 Profitable** - 79% margin through cost optimization
6. **🌐 Global Scale** - CDN and multi-region deployment
7. **🔐 Enterprise Security** - SOC 2 and GDPR compliant
8. **📊 Full Observability** - Monitoring, logging, and analytics

**Key Success Factors:**
- All platforms share authentication and billing
- AI costs optimized through smart routing
- Real production functionality (no mock code)
- Enterprise features for large customers
- Developer-focused CLI tools
- Competitive with Cursor, Windsurf, and ChatGPT