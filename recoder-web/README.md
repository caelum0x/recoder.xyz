<a href="https://web.recoder.xyz">
  <img alt="Recoder Web Platform" src="./public/recoder-og.png">
  <h1 align="center">Recoder Web Platform</h1>
</a>

<p align="center">
  AI-powered code generation platform that creates <strong>real, production-ready applications</strong> with multi-AI intelligence and offline capabilities.
</p>

<p align="center">
  <a href="https://web.recoder.xyz">🌐 Live Platform</a> •
  <a href="https://docs.recoder.xyz">📚 Documentation</a> •
  <a href="https://github.com/recoderxyz/recoder.xyz">💻 CLI Tool</a> •
  <a href="https://marketplace.visualstudio.com/items?itemName=recoderxyz.recoder-vscode">🔧 VS Code Extension</a>
</p>

---

## ✨ What Makes Recoder Different

Unlike other AI coding tools that generate mock implementations, **Recoder creates real, working applications** that you can deploy immediately:

- 🚀 **Real Functionality**: Actual working code, not placeholder implementations
- 🧠 **Multi-AI Intelligence**: Leverages Claude, Groq, Gemini & Ollama for optimal results  
- 🌐 **Offline-First**: Full functionality without internet using local AI models
- ⚡ **Production-Ready**: Enterprise-grade security, performance, and reliability
- 🎯 **Intelligent Context**: Deep project understanding with smart recommendations

## 🏗️ Tech Stack

- **AI Models**: Claude 4 Sonnet/Opus, Groq LLaMA, Gemini 2.5 Pro, Ollama (local)
- **Frontend**: Next.js 15 with App Router, React 19, Tailwind CSS
- **Code Execution**: Advanced Sandpack integration with real runtime environments
- **Database**: PostgreSQL with Prisma ORM, Neon serverless database
- **Deployment**: Vercel with automatic scaling and edge optimization
- **Analytics**: Privacy-focused analytics with Plausible
- **Integration**: Connected to Recoder CLI and VS Code extension ecosystem

## 🚀 Quick Start

### 1. Clone and Setup
```bash
git clone https://github.com/recoderxyz/recoder.xyz.git
cd recoder.xyz/recoder-web
npm install
```

### 2. Environment Configuration
```bash
# Copy environment template
cp .env.example .env

# Required environment variables:
ANTHROPIC_API_KEY=your_claude_api_key        # For Claude AI
GROQ_API_KEY=your_groq_api_key              # For Groq LLaMA  
GOOGLE_API_KEY=your_gemini_api_key          # For Gemini
DATABASE_URL=your_postgresql_connection     # Database
NEXT_PUBLIC_APP_URL=http://localhost:3000   # App URL
```

### 3. Database Setup
```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# (Optional) Seed database
npx prisma db seed
```

### 4. Development Server
```bash
npm run dev
# Open http://localhost:3000
```

## 🌟 Key Features

### Multi-AI Code Generation
- **Claude**: Complex logic, architecture design, code review
- **Groq**: Fast prototyping, API endpoints, data processing  
- **Gemini**: Large codebases, multimodal tasks, documentation
- **Ollama**: Offline generation, private code, custom models

### Real Application Examples
```typescript
// Generate a complete e-commerce platform
"Create a full-stack e-commerce app with user authentication, 
product catalog, shopping cart, payment processing via Stripe, 
admin dashboard, and order management"

// Result: Fully working application with:
// ✅ Real Stripe payment integration
// ✅ Authentication with NextAuth.js  
// ✅ Database with Prisma + PostgreSQL
// ✅ Admin dashboard with real CRUD operations
// ✅ Responsive UI with Tailwind CSS
// ✅ Email notifications with real SMTP
```

### Intelligent Context Understanding
- **Project Analysis**: Understands existing codebase and conventions
- **Smart Suggestions**: Recommends optimal AI models for each task
- **Code Review**: Real security and performance analysis
- **Documentation**: Auto-generates comprehensive project docs

### Offline-First Architecture
- **Local AI Models**: Full functionality with Ollama integration
- **Smart Caching**: Intelligent response caching for speed
- **Progressive Enhancement**: Graceful degradation without internet
- **Sync Queue**: Background synchronization when connection returns

## 🔧 Development

### Project Structure
```
recoder-web/
├── app/                    # Next.js App Router
│   ├── (main)/            # Main application pages
│   ├── api/               # API routes and endpoints
│   └── globals.css        # Global styles with Recoder branding
├── components/            # Reusable UI components
│   ├── ui/               # Shadcn/ui components
│   └── code-runner.tsx   # Enhanced code execution
├── lib/                  # Utilities and configurations
│   ├── ai-integration.ts # Multi-AI provider management
│   ├── recoder-config.ts # Recoder-specific configuration
│   └── prisma.ts        # Database client
├── prisma/              # Database schema and migrations
└── public/              # Static assets with Recoder branding
```

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production  
npm run start        # Start production server
npm run lint         # Run ESLint and TypeScript checks
npm run db:migrate   # Run database migrations
npm run db:studio    # Open Prisma Studio
npm run analyze      # Bundle analyzer
```

### Adding New AI Providers
```typescript
// lib/ai-providers/custom-provider.ts
export class CustomAIProvider implements AIProvider {
  async generateCode(prompt: string, options: GenerationOptions) {
    // Implementation for custom AI provider
    return {
      code: generatedCode,
      explanation: explanation,
      confidence: confidenceScore
    };
  }
}
```

## 🌐 Integration with Recoder Ecosystem

### CLI Integration
```bash
# Generate code and sync with web platform
recoder generate "React dashboard" --sync-web
recoder deploy --platform web --auto-configure
```

### VS Code Extension Integration
- **Project Sync**: Share generated code between web platform and editor
- **Context Sharing**: Unified project analysis across platforms
- **Model Preferences**: Consistent AI provider settings
- **Offline Mode**: Seamless transition between online and local AI

### API Integration
```typescript
// Use Recoder API in your applications
import { RecoderAPI } from '@recoder/api-client';

const recoder = new RecoderAPI({ apiKey: 'your-api-key' });

const result = await recoder.generateCode({
  prompt: 'Create a React component for user authentication',
  provider: 'auto', // Let Recoder choose optimal AI
  realCode: true,   // Generate production-ready code
  context: projectContext
});
```

## 🔒 Security & Privacy

- **API Key Security**: All AI provider keys encrypted and stored securely
- **Code Privacy**: Generated code never stored without explicit permission
- **Local Processing**: Sensitive code can be processed entirely locally with Ollama
- **Audit Trails**: Complete logging of all AI interactions for compliance
- **Data Sovereignty**: Choose where your code and data are processed

## 📈 Performance & Scalability

- **Edge Computing**: Global deployment with Vercel Edge Functions
- **Intelligent Caching**: Multi-layer caching for sub-second responses  
- **Load Balancing**: Automatic scaling based on demand
- **Performance Monitoring**: Real-time metrics and optimization
- **Resource Optimization**: Efficient AI provider routing to minimize costs

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Setup
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run the test suite: `npm test`
5. Submit a pull request

### Reporting Issues
- **Bug Reports**: Use our [issue template](https://github.com/recoderxyz/recoder.xyz/issues/new?template=bug_report.md)
- **Feature Requests**: Use our [feature template](https://github.com/recoderxyz/recoder.xyz/issues/new?template=feature_request.md)
- **Security Issues**: Email security@recoder.xyz

## 📜 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🙏 Acknowledgments

- Built on the foundation of modern web technologies
- Inspired by the need for real, production-ready AI code generation
- Thanks to the open-source community for amazing tools and libraries

---

<p align="center">
  <strong>Ready to generate real, production-ready code?</strong><br>
  <a href="https://web.recoder.xyz">🚀 Try Recoder Web Platform</a>
</p>

<p align="center">
  <sub>Built with ❤️ by the Recoder.xyz team</sub>
</p>