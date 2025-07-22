'use client'

import { useState, useEffect } from 'react'
import { ChevronRight, Code, Zap, Shield, Cpu } from 'lucide-react'

export function Hero() {
  const [currentExample, setCurrentExample] = useState(0)
  
  const examples = [
    'build a Solana DEX with real token swapping',
    'create an NFT marketplace with Stripe payments',
    'build an AI writing assistant with OpenAI integration',
    'deploy this project to production with monitoring'
  ]

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentExample((prev) => (prev + 1) % examples.length)
    }, 3000)
    return () => clearInterval(timer)
  }, [examples.length])

  const scrollToInstallation = () => {
    document.getElementById('installation')?.scrollIntoView({ behavior: 'smooth' })
  }

  const copyInstallCommand = () => {
    navigator.clipboard.writeText('git clone https://github.com/recoder-team/recoder.git && cd recoder && npm run setup')
  }

  return (
    <div className="section-padding pt-24">
      <div className="container-width">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Column - Content */}
          <div className="space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center space-x-2 glass-effect px-4 py-2 rounded-full">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <span className="text-sm font-medium text-gray-600">
                🚀 Production-Ready Code Generation
              </span>
            </div>

            {/* Main Heading */}
            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
                Generate{' '}
                <span className="gradient-text">REAL Code</span>
                <br />
                Not Mock Examples
              </h1>
              <p className="text-xl text-gray-600 max-w-2xl">
                Superior AI-powered development platform with{' '}
                <strong>multi-AI intelligence</strong> and specialized agents. 
                Unlike other tools, we create working applications that generate real revenue.
              </p>
            </div>

            {/* Value Props */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Code className="w-4 h-4 text-blue-600" />
                </div>
                <span className="font-semibold">Real Functionality</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Cpu className="w-4 h-4 text-purple-600" />
                </div>
                <span className="font-semibold">Multi-AI Intelligence</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <Zap className="w-4 h-4 text-green-600" />
                </div>
                <span className="font-semibold">10x Faster Development</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                  <Shield className="w-4 h-4 text-red-600" />
                </div>
                <span className="font-semibold">Production Security</span>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={scrollToInstallation}
                className="btn-primary text-lg px-8 py-4 group"
              >
                Get Started Free
                <ChevronRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </button>
              <a 
                href="https://github.com/recoder-team/recoder"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-lg px-8 py-4"
              >
                View on GitHub
              </a>
            </div>

            {/* Quick Install */}
            <div className="glass-effect p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">Quick Install:</span>
                <button 
                  onClick={copyInstallCommand}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Copy
                </button>
              </div>
              <div className="bg-gray-900 rounded px-4 py-2 font-mono text-sm text-green-400">
                $ git clone https://github.com/recoder-team/recoder.git
              </div>
            </div>
          </div>

          {/* Right Column - Demo */}
          <div className="space-y-6">
            {/* Terminal Demo */}
            <div className="terminal-window">
              <div className="terminal-header">
                <div className="terminal-dot bg-red-500"></div>
                <div className="terminal-dot bg-yellow-500"></div>
                <div className="terminal-dot bg-green-500"></div>
                <span className="text-sm text-gray-400 ml-4">recoder.xyz</span>
              </div>
              <div className="terminal-content space-y-4">
                <div className="flex items-center space-x-2">
                  <span className="text-blue-400">❯</span>
                  <span className="text-gray-400">recoder</span>
                  <span className="text-green-400 typing-animation">
                    "{examples[currentExample]}"
                  </span>
                </div>
                <div className="space-y-2 text-gray-300">
                  <div className="flex items-center space-x-2">
                    <span className="text-blue-400">🧠</span>
                    <span>Analyzing with Claude-3-Sonnet...</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-purple-400">⚡</span>
                    <span>Code generation with Groq...</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-green-400">🔧</span>
                    <span>Real functionality validation...</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-yellow-400">✨</span>
                    <span className="text-green-400">Production-ready code generated!</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center glass-effect p-4 rounded-lg">
                <div className="text-2xl font-bold gradient-text">500+</div>
                <div className="text-sm text-gray-600">Projects Generated</div>
              </div>
              <div className="text-center glass-effect p-4 rounded-lg">
                <div className="text-2xl font-bold gradient-text">$2M+</div>
                <div className="text-sm text-gray-600">Revenue Generated</div>
              </div>
              <div className="text-center glass-effect p-4 rounded-lg">
                <div className="text-2xl font-bold gradient-text">95%</div>
                <div className="text-sm text-gray-600">Success Rate</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}