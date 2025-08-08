"use client";

import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Download, ExternalLink, Terminal, Zap, Shield, Smartphone } from 'lucide-react';
import { getProviderStatus, getSetupInstructions } from '@/lib/ai/providers';

interface LocalAISetupProps {
  onLocalAIDetected?: () => void;
}

export function LocalAISetup({ onLocalAIDetected }: LocalAISetupProps) {
  const [status, setStatus] = useState<any>(null);
  const [instructions, setInstructions] = useState<string>('');
  const [activeStep, setActiveStep] = useState(0);
  const [isChecking, setIsChecking] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    checkLocalAI();
    const interval = setInterval(checkLocalAI, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const checkLocalAI = async () => {
    const currentStatus = getProviderStatus();
    const setupInstructions = getSetupInstructions();
    
    setStatus(currentStatus);
    setInstructions(setupInstructions);

    // If local AI is detected, notify parent
    if ((currentStatus.local.ollama || currentStatus.local.lmstudio) && onLocalAIDetected) {
      onLocalAIDetected();
    }
  };

  const testLocalConnection = async (url: string): Promise<boolean> => {
    try {
      setIsChecking(true);
      const response = await fetch(`${url}/api/tags`, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch (error) {
      console.log('Connection test failed:', error);
      return false;
    } finally {
      setIsChecking(false);
    }
  };

  const handleTestConnection = async () => {
    const ollamaWorking = await testLocalConnection('http://localhost:11434');
    const lmStudioWorking = await testLocalConnection('http://localhost:1234');
    
    if (ollamaWorking || lmStudioWorking) {
      await checkLocalAI();
    }
  };

  if (!status) return null;

  const hasLocalAI = status.local.ollama || status.local.lmstudio;
  const needsSetup = !hasLocalAI;

  const setupSteps = [
    {
      id: 'install',
      title: 'Install Local AI',
      description: 'Choose your preferred local AI platform',
      completed: hasLocalAI
    },
    {
      id: 'download',
      title: 'Download Models',
      description: 'Get coding-optimized AI models',
      completed: hasLocalAI
    },
    {
      id: 'proxy',
      title: 'Setup HTTPS Proxy',
      description: 'Enable secure browser access',
      completed: false // We'll implement detection later
    },
    {
      id: 'test',
      title: 'Test Connection',
      description: 'Verify everything works',
      completed: hasLocalAI
    }
  ];

  if (hasLocalAI) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
        <div className="flex items-start gap-4">
          <CheckCircle className="w-6 h-6 text-green-600 mt-1" />
          <div className="flex-1">
            <h3 className="font-semibold text-green-900 mb-2">
              🎉 Local AI Active - Unlimited Free Usage!
            </h3>
            <p className="text-green-800 mb-4">
              You're using {status.priority[0]} for completely free AI inference. 
              Your code and conversations stay private on your machine.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-white rounded-lg p-3 border border-green-200">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-green-600" />
                  <span className="font-medium text-green-900">Unlimited</span>
                </div>
                <p className="text-sm text-green-700">No API costs or rate limits</p>
              </div>
              
              <div className="bg-white rounded-lg p-3 border border-green-200">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-4 h-4 text-green-600" />
                  <span className="font-medium text-green-900">Private</span>
                </div>
                <p className="text-sm text-green-700">Code never leaves your device</p>
              </div>
              
              <div className="bg-white rounded-lg p-3 border border-green-200">
                <div className="flex items-center gap-2 mb-1">
                  <Terminal className="w-4 h-4 text-green-600" />
                  <span className="font-medium text-green-900">Offline</span>
                </div>
                <p className="text-sm text-green-700">Works without internet</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-green-700">
              <span className="font-medium">Active Provider:</span>
              <span>{status.priority[0]}</span>
              <button 
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="ml-auto text-green-600 hover:text-green-800"
              >
                {showAdvanced ? 'Hide' : 'Show'} Details
              </button>
            </div>

            {showAdvanced && (
              <div className="mt-4 p-4 bg-white rounded-lg border border-green-200">
                <h4 className="font-medium text-green-900 mb-2">Provider Priority List:</h4>
                <div className="space-y-1">
                  {status.priority.map((provider: string, index: number) => (
                    <div key={provider} className="flex items-center gap-2 text-sm">
                      <span className="text-green-600 w-4">{index + 1}.</span>
                      <span className={index === 0 ? 'font-medium text-green-900' : 'text-green-700'}>
                        {provider}
                      </span>
                      {index === 0 && (
                        <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded">ACTIVE</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
      <div className="flex items-start gap-4">
        <AlertTriangle className="w-6 h-6 text-blue-600 mt-1" />
        <div className="flex-1">
          <h3 className="font-semibold text-blue-900 mb-2">
            🆓 Get Started with Free Local AI
          </h3>
          <p className="text-blue-800 mb-6">
            Install local AI models for unlimited, private, and free code generation. 
            No API keys required!
          </p>

          {/* Setup Steps */}
          <div className="space-y-4 mb-6">
            {setupSteps.map((step, index) => (
              <div key={step.id} className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  {step.completed ? (
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  ) : (
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-sm font-medium ${
                      index === activeStep ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 text-gray-500'
                    }`}>
                      {index + 1}
                    </div>
                  )}
                </div>
                
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{step.title}</h4>
                  <p className="text-gray-600 text-sm">{step.description}</p>
                  
                  {index === 0 && !step.completed && (
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Ollama Option */}
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h5 className="font-medium text-gray-900 mb-2">Option 1: Ollama (Recommended)</h5>
                        <p className="text-sm text-gray-600 mb-3">
                          Easy to install, great model selection
                        </p>
                        <div className="space-y-2 text-sm">
                          <div className="bg-gray-50 rounded p-2">
                            <code className="text-xs">curl -fsSL https://ollama.ai/install.sh | sh</code>
                          </div>
                          <div className="bg-gray-50 rounded p-2">
                            <code className="text-xs">ollama pull qwen2.5-coder:7b</code>
                          </div>
                          <div className="bg-gray-50 rounded p-2">
                            <code className="text-xs">ollama serve</code>
                          </div>
                        </div>
                        <a 
                          href="https://ollama.ai" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm mt-2"
                        >
                          Visit Ollama.ai <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      {/* LM Studio Option */}
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h5 className="font-medium text-gray-900 mb-2">Option 2: LM Studio</h5>
                        <p className="text-sm text-gray-600 mb-3">
                          GUI application, easy model management
                        </p>
                        <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside">
                          <li>Download and install LM Studio</li>
                          <li>Search for "qwen2.5-coder" model</li>
                          <li>Download and start local server</li>
                          <li>Default port: 1234</li>
                        </ol>
                        <a 
                          href="https://lmstudio.ai" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm mt-2"
                        >
                          Visit LMStudio.ai <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )}

                  {index === 2 && !step.completed && (
                    <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <h5 className="font-medium text-yellow-800 mb-2">HTTPS Proxy Setup (Required for Browser)</h5>
                      <p className="text-sm text-yellow-700 mb-2">
                        Browsers block HTTP requests from HTTPS sites. You need a proxy:
                      </p>
                      <div className="bg-yellow-100 rounded p-2 mb-2">
                        <code className="text-xs text-yellow-800">npm install -g local-ssl-proxy</code>
                      </div>
                      <div className="bg-yellow-100 rounded p-2">
                        <code className="text-xs text-yellow-800">local-ssl-proxy --source 11435 --target 11434</code>
                      </div>
                      <p className="text-xs text-yellow-600 mt-2">
                        This creates an HTTPS endpoint at https://localhost:11435
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleTestConnection}
              disabled={isChecking}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isChecking ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Test Local AI Connection
                </>
              )}
            </button>

            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              {showAdvanced ? 'Hide' : 'Show'} Advanced Setup
            </button>
          </div>

          {showAdvanced && (
            <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200">
              <h4 className="font-medium text-gray-900 mb-3">Alternative Solutions:</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-gray-200 rounded-lg p-3">
                  <h5 className="font-medium text-gray-900 mb-2">🔌 Browser Extension</h5>
                  <p className="text-sm text-gray-600 mb-2">
                    Install our browser extension for seamless local AI access
                  </p>
                  <button className="text-blue-600 hover:text-blue-800 text-sm" disabled>
                    Coming Soon
                  </button>
                </div>
                
                <div className="border border-gray-200 rounded-lg p-3">
                  <h5 className="font-medium text-gray-900 mb-2">💻 Desktop App</h5>
                  <p className="text-sm text-gray-600 mb-2">
                    Download our desktop app with built-in local AI support
                  </p>
                  <button className="text-blue-600 hover:text-blue-800 text-sm" disabled>
                    Coming Soon
                  </button>
                </div>
              </div>

              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <h5 className="font-medium text-gray-900 mb-2">📋 Current Setup Instructions:</h5>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap">{instructions}</pre>
              </div>
            </div>
          )}

          {/* Mobile App Note */}
          <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-start gap-2">
              <Smartphone className="w-5 h-5 text-purple-600 mt-0.5" />
              <div>
                <h5 className="font-medium text-purple-900">📱 Mobile App Available</h5>
                <p className="text-sm text-purple-700">
                  Our mobile app supports direct local AI connection without proxy setup.
                  <br />
                  <a href="/download" className="text-purple-600 hover:text-purple-800 font-medium">
                    Download Recoder Mobile →
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}