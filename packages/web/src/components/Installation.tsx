'use client'

import { useState } from 'react'
import { Copy, Check, Download, Terminal, Settings, Play, ChevronRight } from 'lucide-react'

type Platform = 'windows' | 'macos' | 'linux'
type InstallMethod = 'quick' | 'docker' | 'manual'

export function Installation() {
  const [platform, setPlatform] = useState<Platform>('windows')
  const [method, setMethod] = useState<InstallMethod>('quick')
  const [copiedSteps, setCopiedSteps] = useState<number[]>([])

  const copyToClipboard = (text: string, stepIndex: number) => {
    navigator.clipboard.writeText(text)
    setCopiedSteps([...copiedSteps, stepIndex])
    setTimeout(() => {
      setCopiedSteps(copiedSteps.filter(i => i !== stepIndex))
    }, 2000)
  }

  const installationMethods = {
    quick: {
      title: 'Quick Setup (Recommended)',
      description: 'Automated installation with all features',
      icon: <Download className="w-5 h-5" />,
      steps: [
        {
          title: 'Clone Repository',
          command: 'git clone https://github.com/recoder-team/recoder.git\ncd recoder',
          description: 'Download the Recoder.xyz source code'
        },
        {
          title: 'Run Setup',
          command: 'npm run setup',
          description: 'Automated installation of all dependencies and services'
        },
        {
          title: 'Configure AI Keys',
          command: 'recoder models config --setup',
          description: 'Interactive setup for AI providers (Claude, Groq, Gemini)'
        },
        {
          title: 'Start Services',
          command: 'npm run dev:all',
          description: 'Launch backend, production engine, and CLI'
        },
        {
          title: 'Test Installation',
          command: 'recoder "create a hello world React app"',
          description: 'Generate your first project to verify everything works'
        }
      ]
    },
    docker: {
      title: 'Docker Installation',
      description: 'Containerized deployment for consistency',
      icon: <Settings className="w-5 h-5" />,
      steps: [
        {
          title: 'Clone Repository',
          command: 'git clone https://github.com/recoder-team/recoder.git\ncd recoder',
          description: 'Download the source code'
        },
        {
          title: 'Configure Environment',
          command: 'cp .env.example .env\n# Edit .env with your API keys',
          description: 'Set up your AI provider API keys'
        },
        {
          title: 'Build with Docker',
          command: 'docker-compose up -d',
          description: 'Build and start all services in containers'
        },
        {
          title: 'Access CLI',
          command: 'docker-compose exec cli recoder --help',
          description: 'Use the CLI through Docker'
        }
      ]
    },
    manual: {
      title: 'Manual Installation',
      description: 'Step-by-step manual setup for full control',
      icon: <Terminal className="w-5 h-5" />,
      steps: [
        {
          title: 'Prerequisites',
          command: platform === 'windows' 
            ? 'winget install OpenJS.NodeJS\nwinget install Git.Git' 
            : platform === 'macos'
            ? 'brew install node\nbrew install git'
            : 'sudo apt update\nsudo apt install nodejs npm git',
          description: `Install Node.js 18+ and Git for ${platform}`
        },
        {
          title: 'Clone & Install Dependencies',
          command: 'git clone https://github.com/recoder-team/recoder.git\ncd recoder\nnpm install',
          description: 'Download code and install root dependencies'
        },
        {
          title: 'Build Packages',
          command: 'npm run build:shared\nnpm run build:cli',
          description: 'Build shared libraries and CLI package'
        },
        {
          title: 'Install Services',
          command: 'cd backend && npm install\ncd ../production-engine && npm install',
          description: 'Install backend and production engine dependencies'
        },
        {
          title: 'Configure Environment',
          command: 'cp .env.example .env\n# Add your API keys to .env',
          description: 'Set up environment variables'
        },
        {
          title: 'Start Services',
          command: 'npm run dev:all',
          description: 'Launch all services'
        }
      ]
    }
  }

  const platformSpecificNotes = {
    windows: {
      notes: [
        'Windows PowerShell or Command Prompt supported',
        'Visual Studio Build Tools may be required for native modules',
        'Use Windows Subsystem for Linux (WSL) for best experience'
      ],
      additionalCommands: [
        'Set-ExecutionPolicy RemoteSigned -Scope CurrentUser',
        'git config --global core.longpaths true'
      ]
    },
    macos: {
      notes: [
        'Homebrew package manager recommended',
        'Xcode Command Line Tools required',
        'Apple Silicon (M1/M2) fully supported'
      ],
      additionalCommands: [
        'xcode-select --install',
        'brew install ollama  # For local AI models'
      ]
    },
    linux: {
      notes: [
        'Ubuntu 20.04+ or equivalent supported',
        'Build essentials required for native modules',
        'Docker available for containerized deployment'
      ],
      additionalCommands: [
        'sudo apt install build-essential python3-dev',
        'curl -fsSL https://ollama.com/install.sh | sh'
      ]
    }
  }

  const currentMethod = installationMethods[method]
  const currentPlatform = platformSpecificNotes[platform]

  return (
    <div className="container-width">
      <div className="text-center mb-12">
        <h2 className="text-3xl lg:text-4xl font-bold mb-4">
          <span className="gradient-text">Easy Installation</span>
        </h2>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Get started with Recoder.xyz in minutes. Choose your preferred installation method and platform.
        </p>
      </div>

      {/* Platform Selection */}
      <div className="mb-8">
        <div className="flex items-center justify-center mb-4">
          <span className="text-sm font-medium text-gray-600 mr-4">Select your platform:</span>
        </div>
        <div className="flex justify-center space-x-4">
          {(['windows', 'macos', 'linux'] as Platform[]).map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                platform === p
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
              }`}
            >
              {p === 'windows' ? 'Windows' : p === 'macos' ? 'macOS' : 'Linux'}
            </button>
          ))}
        </div>
      </div>

      {/* Installation Method Selection */}
      <div className="mb-8">
        <div className="grid md:grid-cols-3 gap-4">
          {(Object.keys(installationMethods) as InstallMethod[]).map((methodKey) => {
            const methodInfo = installationMethods[methodKey]
            return (
              <button
                key={methodKey}
                onClick={() => setMethod(methodKey)}
                className={`feature-card text-left transition-all duration-200 ${
                  method === methodKey 
                    ? 'ring-2 ring-blue-500 bg-blue-50' 
                    : 'hover:shadow-lg'
                }`}
              >
                <div className="flex items-center space-x-3 mb-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    method === methodKey ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {methodInfo.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold">{methodInfo.title}</h3>
                  </div>
                </div>
                <p className="text-gray-600 text-sm">{methodInfo.description}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Installation Steps */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Steps */}
        <div className="space-y-6">
          <h3 className="text-2xl font-bold mb-6 flex items-center space-x-2">
            {currentMethod.icon}
            <span>{currentMethod.title}</span>
          </h3>
          
          {currentMethod.steps.map((step, index) => (
            <div key={index} className="feature-card">
              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 mt-1">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold mb-2">{step.title}</h4>
                  <p className="text-gray-600 text-sm mb-3">{step.description}</p>
                  <div className="bg-gray-900 rounded-lg p-4 relative group">
                    <pre className="text-green-400 text-sm font-mono overflow-x-auto">
                      {step.command}
                    </pre>
                    <button
                      onClick={() => copyToClipboard(step.command, index)}
                      className="absolute top-3 right-3 p-1.5 bg-gray-800 hover:bg-gray-700 rounded transition-colors opacity-0 group-hover:opacity-100"
                    >
                      {copiedSteps.includes(index) ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Platform-Specific Notes & Additional Setup */}
        <div className="space-y-6">
          <div className="feature-card">
            <h4 className="font-semibold mb-4 flex items-center space-x-2">
              <Play className="w-5 h-5 text-blue-600" />
              <span>{platform.charAt(0).toUpperCase() + platform.slice(1)} Notes</span>
            </h4>
            <ul className="space-y-2">
              {currentPlatform.notes.map((note, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <ChevronRight className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600 text-sm">{note}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="feature-card">
            <h4 className="font-semibold mb-4">Additional Commands</h4>
            <div className="space-y-3">
              {currentPlatform.additionalCommands.map((command, index) => (
                <div key={index} className="bg-gray-900 rounded-lg p-3 relative group">
                  <code className="text-green-400 text-sm font-mono">{command}</code>
                  <button
                    onClick={() => copyToClipboard(command, 100 + index)}
                    className="absolute top-2 right-2 p-1 bg-gray-800 hover:bg-gray-700 rounded transition-colors opacity-0 group-hover:opacity-100"
                  >
                    {copiedSteps.includes(100 + index) ? (
                      <Check className="w-3 h-3 text-green-400" />
                    ) : (
                      <Copy className="w-3 h-3 text-gray-400" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="feature-card bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
            <h4 className="font-semibold mb-3 text-blue-800">🚀 Quick Start</h4>
            <p className="text-blue-700 text-sm mb-4">
              After installation, try generating your first project:
            </p>
            <div className="bg-gray-900 rounded-lg p-3">
              <code className="text-green-400 text-sm font-mono">
                recoder "build a todo app with React and Node.js"
              </code>
            </div>
          </div>

          <div className="feature-card">
            <h4 className="font-semibold mb-3">Need Help?</h4>
            <div className="space-y-2">
              <a 
                href="https://github.com/recoder-team/recoder/issues" 
                target="_blank"
                rel="noopener noreferrer"
                className="block text-blue-600 hover:text-blue-800 text-sm"
              >
                📝 Report an Issue
              </a>
              <a 
                href="https://discord.gg/recoder" 
                target="_blank"
                rel="noopener noreferrer"
                className="block text-blue-600 hover:text-blue-800 text-sm"
              >
                💬 Join Discord Community
              </a>
              <a 
                href="/docs" 
                className="block text-blue-600 hover:text-blue-800 text-sm"
              >
                📖 View Full Documentation
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}