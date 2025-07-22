import { 
  Code, 
  Zap, 
  Shield, 
  Cpu, 
  Database, 
  Coins, 
  Bot, 
  Rocket,
  CheckCircle,
  X
} from 'lucide-react'

export function Features() {
  const comparisonFeatures = [
    {
      feature: 'Database Operations',
      recoder: 'Real CRUD with actual databases',
      others: 'Mock/example code',
      recoderHas: true
    },
    {
      feature: 'Blockchain Contracts',
      recoder: 'Deploy & execute real contracts',
      others: 'Tutorial examples',
      recoderHas: true
    },
    {
      feature: 'Payment Processing',
      recoder: 'Real Stripe/PayPal transactions',
      others: 'Placeholder functions',
      recoderHas: true
    },
    {
      feature: 'AI Integrations',
      recoder: 'Working API calls & responses',
      others: 'Static examples',
      recoderHas: true
    },
    {
      feature: 'Deployment Pipelines',
      recoder: 'Docker/Kubernetes configs',
      others: 'Basic scripts',
      recoderHas: true
    }
  ]

  const keyFeatures = [
    {
      icon: <Code className="w-8 h-8" />,
      title: 'Real Functionality First',
      description: 'Generate working applications with real database operations, payment processing, and API integrations - not mock implementations.',
      color: 'bg-blue-100 text-blue-600'
    },
    {
      icon: <Cpu className="w-8 h-8" />,
      title: 'Multi-AI Intelligence',
      description: 'Smart routing to Claude, Groq, Gemini, and Ollama based on task complexity, privacy needs, and performance requirements.',
      color: 'bg-purple-100 text-purple-600'
    },
    {
      icon: <Bot className="w-8 h-8" />,
      title: 'Specialized AI Agents',
      description: 'Domain experts for blockchain, web development, mobile, AI/ML, backend services, security, and DevOps that collaborate intelligently.',
      color: 'bg-green-100 text-green-600'
    },
    {
      icon: <Zap className="w-8 h-8" />,
      title: '10x Faster Development',
      description: 'Generate production-ready applications in minutes instead of months. Focus on business logic while we handle the boilerplate.',
      color: 'bg-yellow-100 text-yellow-600'
    },
    {
      icon: <Shield className="w-8 h-8" />,
      title: 'Production Security',
      description: 'Enterprise-grade security with prompt injection protection, vulnerability scanning, and compliance standards (GDPR, SOC 2, HIPAA).',
      color: 'bg-red-100 text-red-600'
    },
    {
      icon: <Database className="w-8 h-8" />,
      title: 'Real Integrations',
      description: 'Actual connections to Stripe, AWS, Solana, OpenAI, PostgreSQL, and 50+ services - not placeholder code that needs implementation.',
      color: 'bg-indigo-100 text-indigo-600'
    },
    {
      icon: <Coins className="w-8 h-8" />,
      title: 'Revenue-Ready Apps',
      description: 'Generate applications with working payment systems, user authentication, and business logic ready to generate real revenue.',
      color: 'bg-emerald-100 text-emerald-600'
    },
    {
      icon: <Rocket className="w-8 h-8" />,
      title: 'Instant Deployment',
      description: 'Docker configurations, CI/CD pipelines, and cloud deployment scripts included. Deploy to production immediately after generation.',
      color: 'bg-orange-100 text-orange-600'
    }
  ]

  const agentCapabilities = [
    {
      agent: '🔗 Blockchain Agent',
      specializes: 'Solana, Ethereum, DeFi protocols',
      example: 'Creates working DEX with real token swapping'
    },
    {
      agent: '🌐 Web Agent',
      specializes: 'React, Next.js, Vue applications',
      example: 'Builds responsive e-commerce platforms'
    },
    {
      agent: '📱 Mobile Agent',
      specializes: 'React Native, Flutter apps',
      example: 'Develops cross-platform mobile wallets'
    },
    {
      agent: '🤖 AI Agent',
      specializes: 'OpenAI integration, RAG, ML pipelines',
      example: 'Implements AI writing assistants'
    },
    {
      agent: '⚙️ Backend Agent',
      specializes: 'APIs, databases, microservices',
      example: 'Creates scalable REST APIs with auth'
    },
    {
      agent: '🔒 Security Agent',
      specializes: 'Vulnerability scanning, audits',
      example: 'Implements zero-trust security'
    }
  ]

  return (
    <div className="container-width">
      {/* Main Heading */}
      <div className="text-center mb-16">
        <h2 className="text-3xl lg:text-4xl font-bold mb-4">
          Why Choose <span className="gradient-text">Recoder.xyz</span>?
        </h2>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Unlike other AI coding tools, we generate REAL, production-ready code that works immediately - 
          no additional implementation required.
        </p>
      </div>

      {/* Comparison Table */}
      <div className="mb-16">
        <h3 className="text-2xl font-bold text-center mb-8">
          Real Functionality vs Mock Examples
        </h3>
        <div className="feature-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-4 px-6 font-semibold">Feature</th>
                  <th className="text-center py-4 px-6 font-semibold text-blue-600">Recoder.xyz</th>
                  <th className="text-center py-4 px-6 font-semibold text-gray-500">Others</th>
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((item, index) => (
                  <tr key={index} className="border-t border-gray-200">
                    <td className="py-4 px-6 font-medium">{item.feature}</td>
                    <td className="py-4 px-6 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="text-sm text-green-700">{item.recoder}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <X className="w-5 h-5 text-red-500" />
                        <span className="text-sm text-red-600">{item.others}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Key Features Grid */}
      <div className="mb-16">
        <h3 className="text-2xl font-bold text-center mb-8">Core Features</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {keyFeatures.map((feature, index) => (
            <div key={index} className="feature-card text-center group">
              <div className={`w-16 h-16 ${feature.color} rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200`}>
                {feature.icon}
              </div>
              <h4 className="font-semibold mb-3">{feature.title}</h4>
              <p className="text-gray-600 text-sm">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* AI Agents Section */}
      <div className="mb-16">
        <h3 className="text-2xl font-bold text-center mb-8">Specialized AI Agents</h3>
        <p className="text-center text-gray-600 mb-8 max-w-2xl mx-auto">
          Our AI agents collaborate to understand your requirements and generate working code 
          across different domains and technologies.
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agentCapabilities.map((agent, index) => (
            <div key={index} className="feature-card">
              <div className="flex items-start space-x-3">
                <div className="text-2xl">{agent.agent.split(' ')[0]}</div>
                <div className="flex-1">
                  <h4 className="font-semibold mb-2">{agent.agent.split(' ').slice(1).join(' ')}</h4>
                  <p className="text-sm text-gray-600 mb-2">{agent.specializes}</p>
                  <p className="text-sm text-blue-600 font-medium">{agent.example}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agent Collaboration Demo */}
      <div className="feature-card bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200">
        <h3 className="text-xl font-bold mb-4 text-center">How Agents Collaborate</h3>
        <div className="space-y-4">
          <div className="text-center font-mono text-sm text-gray-700">
            <code>recoder "build a social media app"</code>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <div className="font-semibold text-blue-600 mb-2">🌐 Web Agent</div>
              <div className="text-sm text-gray-600">Generates React frontend with responsive UI</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <div className="font-semibold text-purple-600 mb-2">⚙️ Backend Agent</div>
              <div className="text-sm text-gray-600">Creates Node.js API with authentication</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <div className="font-semibold text-green-600 mb-2">📱 Mobile Agent</div>
              <div className="text-sm text-gray-600">Builds React Native companion app</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <div className="font-semibold text-red-600 mb-2">🔒 Security Agent</div>
              <div className="text-sm text-gray-600">Implements secure authentication system</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <div className="font-semibold text-orange-600 mb-2">🚀 DevOps Agent</div>
              <div className="text-sm text-gray-600">Configures Docker deployment pipeline</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <div className="font-semibold text-yellow-600 mb-2">✨ Result</div>
              <div className="text-sm font-semibold text-green-700">Production-ready social media platform</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}