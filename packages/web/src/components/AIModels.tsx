import { Brain, Cloud, Home, Shield, Zap, Cpu } from 'lucide-react'

export function AIModels() {
  const cloudModels = [
    {
      provider: 'Claude (Anthropic)',
      models: ['Claude-3.5 Sonnet', 'Claude-3 Opus', 'Claude-3 Haiku'],
      specialization: 'Complex reasoning, blockchain, security analysis',
      icon: '🧠',
      color: 'border-blue-500'
    },
    {
      provider: 'Groq',
      models: ['Llama-3.1 70B', 'Llama-3.1 8B', 'Mixtral 8x7B'],
      specialization: 'Fast React/Next.js, rapid prototyping',
      icon: '⚡',
      color: 'border-green-500'
    },
    {
      provider: 'Gemini (Google)',
      models: ['Gemini-1.5 Pro', 'Gemini-1.5 Flash'],
      specialization: 'Large codebases, multimodal, documentation',
      icon: '💎',
      color: 'border-purple-500'
    },
    {
      provider: 'OpenAI',
      models: ['GPT-4o', 'GPT-4 Turbo', 'GPT-3.5 Turbo'],
      specialization: 'Backup only (limited coding capability)',
      icon: '🔄',
      color: 'border-gray-500'
    }
  ]

  const localModels = [
    {
      name: 'Qwen2.5-Coder',
      sizes: ['1.5B', '7B', '32B'],
      specialty: 'Best overall coding performance',
      hardware: 'RAM: 4-32GB, VRAM: 2-16GB'
    },
    {
      name: 'DeepSeek Coder V2',
      sizes: ['1.3B', '6.7B', '33B'],
      specialty: 'Excellent for debugging and code analysis',
      hardware: 'RAM: 4-32GB, VRAM: 2-16GB'
    },
    {
      name: 'Code Llama',
      sizes: ['7B', '13B', '34B'],
      specialty: 'Meta\'s specialized code model',
      hardware: 'RAM: 8-32GB, VRAM: 4-16GB'
    },
    {
      name: 'StarCoder2',
      sizes: ['3B', '7B', '15B'],
      specialty: 'Multi-language code generation',
      hardware: 'RAM: 4-16GB, VRAM: 2-8GB'
    }
  ]

  const privacyLevels = [
    {
      level: '🌐 Public',
      description: 'Any model allowed, data may go to cloud providers',
      useCase: 'Open source projects, learning, tutorials'
    },
    {
      level: '🏢 Internal',
      description: 'Prefers local models, cloud allowed with encryption',
      useCase: 'Company projects, internal tools'
    },
    {
      level: '🔒 Confidential',
      description: 'Local models only, no cloud processing',
      useCase: 'Sensitive business logic, proprietary code'
    },
    {
      level: '🚫 Restricted',
      description: 'Only specific approved models',
      useCase: 'Government, healthcare, financial services'
    }
  ]

  return (
    <div className="container-width">
      <div className="text-center mb-12">
        <h2 className="text-3xl lg:text-4xl font-bold mb-4">
          <span className="gradient-text">Multi-AI Intelligence</span>
        </h2>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Smart model routing automatically selects the best AI for each task. 
          Privacy-first architecture with local models for sensitive data.
        </p>
      </div>

      {/* Smart Routing Visualization */}
      <div className="mb-16">
        <div className="feature-card bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200">
          <h3 className="text-xl font-bold text-center mb-6">Intelligent Model Routing</h3>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-white rounded-lg shadow-sm">
              <Brain className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <div className="font-semibold">Task Analysis</div>
              <div className="text-sm text-gray-600">Analyzes complexity & requirements</div>
            </div>
            <div className="text-center p-4 bg-white rounded-lg shadow-sm">
              <Shield className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <div className="font-semibold">Privacy Check</div>
              <div className="text-sm text-gray-600">Determines data sensitivity</div>
            </div>
            <div className="text-center p-4 bg-white rounded-lg shadow-sm">
              <Zap className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
              <div className="font-semibold">Model Selection</div>
              <div className="text-sm text-gray-600">Routes to optimal AI model</div>
            </div>
            <div className="text-center p-4 bg-white rounded-lg shadow-sm">
              <Cpu className="w-8 h-8 text-purple-600 mx-auto mb-2" />
              <div className="font-semibold">Code Generation</div>
              <div className="text-sm text-gray-600">Produces production-ready code</div>
            </div>
          </div>
        </div>
      </div>

      {/* Cloud Models */}
      <div className="mb-16">
        <div className="flex items-center space-x-3 mb-8">
          <Cloud className="w-8 h-8 text-blue-600" />
          <h3 className="text-2xl font-bold">Cloud AI Models</h3>
          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">Premium</span>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {cloudModels.map((provider, index) => (
            <div key={index} className={`feature-card border-l-4 ${provider.color}`}>
              <div className="flex items-start space-x-3">
                <div className="text-2xl">{provider.icon}</div>
                <div className="flex-1">
                  <h4 className="font-semibold text-lg mb-2">{provider.provider}</h4>
                  <div className="text-sm text-gray-600 mb-3">
                    <strong>Models:</strong> {provider.models.join(', ')}
                  </div>
                  <div className="text-sm text-blue-600 font-medium">
                    <strong>Specialization:</strong> {provider.specialization}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Local Models */}
      <div className="mb-16">
        <div className="flex items-center space-x-3 mb-8">
          <Home className="w-8 h-8 text-green-600" />
          <h3 className="text-2xl font-bold">Local AI Models</h3>
          <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">Free & Private</span>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {localModels.map((model, index) => (
            <div key={index} className="feature-card">
              <h4 className="font-semibold text-lg mb-2">{model.name}</h4>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Sizes:</span>
                  <span className="ml-2 text-gray-600">{model.sizes.join(', ')}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Specialty:</span>
                  <span className="ml-2 text-blue-600">{model.specialty}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Hardware:</span>
                  <span className="ml-2 text-gray-600">{model.hardware}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 feature-card bg-gradient-to-r from-green-50 to-blue-50 border border-green-200">
          <h4 className="font-semibold mb-4">🚀 One-Click Local Model Installation</h4>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-gray-900 rounded p-3">
              <code className="text-green-400 text-sm">recoder models install qwen2.5-coder:7b</code>
            </div>
            <div className="bg-gray-900 rounded p-3">
              <code className="text-green-400 text-sm">recoder models install deepseek-coder:6.7b</code>
            </div>
            <div className="bg-gray-900 rounded p-3">
              <code className="text-green-400 text-sm">recoder models install codellama:7b</code>
            </div>
          </div>
        </div>
      </div>

      {/* Privacy Levels */}
      <div>
        <div className="flex items-center space-x-3 mb-8">
          <Shield className="w-8 h-8 text-purple-600" />
          <h3 className="text-2xl font-bold">Privacy-First Architecture</h3>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {privacyLevels.map((privacy, index) => (
            <div key={index} className="feature-card text-center">
              <div className="text-2xl mb-3">{privacy.level.split(' ')[0]}</div>
              <h4 className="font-semibold mb-2">{privacy.level.split(' ').slice(1).join(' ')}</h4>
              <p className="text-sm text-gray-600 mb-3">{privacy.description}</p>
              <p className="text-xs text-blue-600 font-medium">{privacy.useCase}</p>
            </div>
          ))}
        </div>
        
        <div className="mt-8 feature-card">
          <h4 className="font-semibold mb-4">Configure Privacy Level</h4>
          <div className="bg-gray-900 rounded-lg p-4">
            <code className="text-green-400 text-sm">
              recoder models config --privacy-default confidential<br/>
              recoder models config --audit-enable<br/>
              recoder "build my app" --privacy confidential
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}