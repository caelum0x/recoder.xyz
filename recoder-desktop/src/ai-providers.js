/**
 * Desktop AI Providers Configuration
 * Includes local-first priority with latest OpenRouter models integration
 */

const axios = require('axios');

/**
 * AI Provider Priority Configuration
 * 1. Local AI (FREE) - Ollama, LM Studio
 * 2. OpenRouter (Latest Models) - Claude Sonnet 4 (#1), Gemini 2.5 Flash (#3), DeepSeek V3, Qwen3 Coder
 * 3. Direct Providers - Anthropic, Groq, OpenAI
 * 4. xAI - Backup compatibility
 */

const AI_PROVIDER_CONFIG = {
  // Local AI (Priority #1)
  local: {
    ollama: {
      baseURL: 'http://localhost:11434',
      models: {
        chat: 'qwen2.5-coder:7b',
        reasoning: 'mistral:7b-instruct',
        title: 'llama3.2:3b',
        artifact: 'codellama:13b-instruct'
      }
    },
    lmStudio: {
      baseURL: 'http://localhost:1234',
      models: {
        chat: 'local-model',
        reasoning: 'local-model',
        title: 'local-model',
        artifact: 'local-model'
      }
    }
  },

  // OpenRouter (Priority #2) - Latest top-performing models
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    models: {
      chat: 'anthropic/claude-sonnet-4', // #1 Most popular - 57% usage
      reasoning: 'deepseek/deepseek-v3-0324', // #6 Best reasoning model  
      title: 'google/gemini-2.5-flash', // #3 Fastest - 331% growth
      artifact: 'qwen/qwen3-coder' // #16 Specialist coding model
    },
    headers: {
      'HTTP-Referer': 'https://recoder.xyz',
      'X-Title': 'Recoder.xyz Desktop - AI Development Platform'
    }
  },

  // Direct cloud providers (Priority #3+)
  cloud: {
    anthropic: {
      baseURL: 'https://api.anthropic.com',
      models: {
        chat: 'claude-3-5-sonnet-20241022',
        reasoning: 'claude-3-5-sonnet-20241022',
        title: 'claude-3-5-haiku-20241022',
        artifact: 'claude-3-5-sonnet-20241022'
      }
    },
    groq: {
      baseURL: 'https://api.groq.com/openai/v1',
      models: {
        chat: 'llama-3.1-70b-versatile',
        reasoning: 'llama-3.1-8b-instant',
        title: 'llama-3.1-8b-instant',
        artifact: 'llama-3.1-70b-versatile'
      }
    },
    openai: {
      baseURL: 'https://api.openai.com/v1',
      models: {
        chat: 'gpt-4o',
        reasoning: 'gpt-4o',
        title: 'gpt-4o-mini',
        artifact: 'gpt-4o'
      }
    },
    xai: {
      baseURL: 'https://api.x.ai/v1',
      models: {
        chat: 'grok-2-vision-1212',
        reasoning: 'grok-3-mini-beta',
        title: 'grok-2-1212',
        artifact: 'grok-2-1212'
      }
    }
  }
};

/**
 * Check if provider is available based on environment variables
 */
function getProviderAvailability() {
  return {
    openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    groq: Boolean(process.env.GROQ_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    xai: Boolean(process.env.XAI_API_KEY)
  };
}

/**
 * Get the best available provider for desktop app
 */
async function getBestDesktopProvider(taskType = 'chat', localAIStatus = null) {
  // Test local AI if status not provided
  if (!localAIStatus) {
    localAIStatus = await testLocalAI();
  }

  // 1st Priority: Local AI (FREE)
  if (localAIStatus.ollama) {
    return {
      type: 'local',
      provider: 'ollama',
      model: AI_PROVIDER_CONFIG.local.ollama.models[taskType] || AI_PROVIDER_CONFIG.local.ollama.models.chat,
      baseURL: AI_PROVIDER_CONFIG.local.ollama.baseURL,
      cost: 'free',
      reason: 'Free local AI - unlimited usage, maximum privacy'
    };
  }

  if (localAIStatus.lmStudio) {
    return {
      type: 'local',
      provider: 'lm-studio',
      model: AI_PROVIDER_CONFIG.local.lmStudio.models[taskType] || AI_PROVIDER_CONFIG.local.lmStudio.models.chat,
      baseURL: AI_PROVIDER_CONFIG.local.lmStudio.baseURL,
      cost: 'free',
      reason: 'Free local AI with custom models'
    };
  }

  // 2nd Priority: OpenRouter with latest models
  const availability = getProviderAvailability();
  if (availability.openrouter) {
    return {
      type: 'cloud',
      provider: 'openrouter',
      model: AI_PROVIDER_CONFIG.openrouter.models[taskType] || AI_PROVIDER_CONFIG.openrouter.models.chat,
      baseURL: AI_PROVIDER_CONFIG.openrouter.baseURL,
      cost: 'premium',
      reason: '#1 most popular AI models (Claude Sonnet 4 57% usage) + 400+ model access'
    };
  }

  // 3rd Priority: Direct providers
  if (availability.anthropic) {
    return {
      type: 'cloud',
      provider: 'anthropic',
      model: AI_PROVIDER_CONFIG.cloud.anthropic.models[taskType] || AI_PROVIDER_CONFIG.cloud.anthropic.models.chat,
      baseURL: AI_PROVIDER_CONFIG.cloud.anthropic.baseURL,
      cost: 'premium',
      reason: 'Direct Claude access - high quality generation'
    };
  }

  if (availability.groq) {
    return {
      type: 'cloud',
      provider: 'groq',
      model: AI_PROVIDER_CONFIG.cloud.groq.models[taskType] || AI_PROVIDER_CONFIG.cloud.groq.models.chat,
      baseURL: AI_PROVIDER_CONFIG.cloud.groq.baseURL,
      cost: 'cheap',
      reason: 'Lightning fast inference'
    };
  }

  if (availability.openai) {
    return {
      type: 'cloud',
      provider: 'openai',
      model: AI_PROVIDER_CONFIG.cloud.openai.models[taskType] || AI_PROVIDER_CONFIG.cloud.openai.models.chat,
      baseURL: AI_PROVIDER_CONFIG.cloud.openai.baseURL,
      cost: 'premium',
      reason: 'GPT-4o general purpose model'
    };
  }

  if (availability.xai) {
    return {
      type: 'cloud',
      provider: 'xai',
      model: AI_PROVIDER_CONFIG.cloud.xai.models[taskType] || AI_PROVIDER_CONFIG.cloud.xai.models.chat,
      baseURL: AI_PROVIDER_CONFIG.cloud.xai.baseURL,
      cost: 'premium',
      reason: 'Grok-2 backup option'
    };
  }

  return null;
}

/**
 * Generate response using the best available provider
 */
async function generateWithBestProvider(messages, options = {}) {
  const localStatus = await testLocalAI();
  const provider = await getBestDesktopProvider(options.taskType || 'chat', localStatus);
  
  if (!provider) {
    throw new Error('No AI providers available. Please install Ollama/LM Studio or add cloud API keys.');
  }

  if (provider.type === 'local') {
    if (provider.provider === 'ollama') {
      return await generateWithOllama(messages, provider.model, options);
    } else if (provider.provider === 'lm-studio') {
      return await generateWithLMStudio(messages, options);
    }
  } else if (provider.type === 'cloud') {
    return await generateWithCloudProvider(messages, provider, options);
  }

  throw new Error(`Unsupported provider: ${provider.provider}`);
}

/**
 * Generate with Ollama
 */
async function generateWithOllama(messages, model, options) {
  const prompt = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
  
  const response = await axios.post('http://localhost:11434/api/generate', {
    model: model,
    prompt: prompt,
    stream: false,
    options: {
      temperature: options.temperature || 0.7,
      top_p: options.top_p || 0.9,
      num_predict: options.max_tokens || 2000
    }
  });

  const data = response.data;
  return {
    response: data.response,
    provider: 'Ollama',
    model: model,
    stats: {
      total_duration: data.total_duration,
      prompt_eval_count: data.prompt_eval_count,
      eval_count: data.eval_count
    }
  };
}

/**
 * Generate with LM Studio
 */
async function generateWithLMStudio(messages, options) {
  const response = await axios.post('http://localhost:1234/v1/chat/completions', {
    messages: messages,
    temperature: options.temperature || 0.7,
    max_tokens: options.max_tokens || 2000,
    stream: false
  });

  const data = response.data;
  return {
    response: data.choices[0].message.content,
    provider: 'LM Studio',
    model: 'local-model',
    stats: {
      prompt_tokens: data.usage?.prompt_tokens,
      completion_tokens: data.usage?.completion_tokens,
      total_tokens: data.usage?.total_tokens
    }
  };
}

/**
 * Generate with cloud providers (OpenRouter, Anthropic, etc.)
 */
async function generateWithCloudProvider(messages, provider, options) {
  let apiKey;
  let headers = { 'Content-Type': 'application/json' };

  // Set API key and headers based on provider
  switch (provider.provider) {
    case 'openrouter':
      apiKey = process.env.OPENROUTER_API_KEY;
      headers = {
        ...headers,
        'Authorization': `Bearer ${apiKey}`,
        ...AI_PROVIDER_CONFIG.openrouter.headers
      };
      break;
    case 'anthropic':
      apiKey = process.env.ANTHROPIC_API_KEY;
      headers = {
        ...headers,
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      };
      break;
    case 'groq':
      apiKey = process.env.GROQ_API_KEY;
      headers = {
        ...headers,
        'Authorization': `Bearer ${apiKey}`
      };
      break;
    case 'openai':
      apiKey = process.env.OPENAI_API_KEY;
      headers = {
        ...headers,
        'Authorization': `Bearer ${apiKey}`
      };
      break;
    case 'xai':
      apiKey = process.env.XAI_API_KEY;
      headers = {
        ...headers,
        'Authorization': `Bearer ${apiKey}`
      };
      break;
    default:
      throw new Error(`Unknown cloud provider: ${provider.provider}`);
  }

  if (!apiKey) {
    throw new Error(`Missing API key for ${provider.provider}`);
  }

  // Prepare request body based on provider format
  let body;
  if (provider.provider === 'anthropic') {
    // Anthropic format
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');
    
    body = JSON.stringify({
      model: provider.model,
      system: systemMessage?.content || '',
      messages: userMessages,
      max_tokens: options.max_tokens || 2000,
      temperature: options.temperature || 0.7
    });
  } else {
    // OpenAI format (OpenRouter, Groq, OpenAI, xAI)
    body = JSON.stringify({
      model: provider.model,
      messages: messages,
      max_tokens: options.max_tokens || 2000,
      temperature: options.temperature || 0.7,
      stream: false
    });
  }

  const response = await axios.post(`${provider.baseURL}/chat/completions`, {
    model: provider.model,
    messages: messages,
    max_tokens: options.max_tokens || 2000,
    temperature: options.temperature || 0.7,
    stream: false
  }, {
    headers: headers
  });

  const data = response.data;

  // Parse response based on provider format
  let content;
  if (provider.provider === 'anthropic') {
    content = data.content[0]?.text || '';
  } else {
    content = data.choices[0]?.message?.content || '';
  }

  return {
    response: content,
    provider: provider.provider,
    model: provider.model,
    stats: {
      prompt_tokens: data.usage?.prompt_tokens || data.usage?.input_tokens,
      completion_tokens: data.usage?.completion_tokens || data.usage?.output_tokens,
      total_tokens: data.usage?.total_tokens || (data.usage?.input_tokens + data.usage?.output_tokens),
      cost: data.usage?.cost
    }
  };
}

/**
 * Get desktop provider status with latest model info
 */
async function getDesktopProviderStatus(localStatus = null) {
  if (!localStatus) {
    localStatus = await testLocalAI();
  }

  const availability = getProviderAvailability();
  
  const status = {
    local: {
      ollama: localStatus.ollama,
      lmStudio: localStatus.lmStudio
    },
    cloud: availability,
    priority: []
  };

  // Build priority list with latest model rankings
  if (status.local.ollama) status.priority.push('Ollama (FREE - qwen2.5-coder:7b)');
  if (status.local.lmStudio) status.priority.push('LM Studio (FREE - Custom Models)');
  if (status.cloud.openrouter) status.priority.push('OpenRouter (Claude Sonnet 4 + Latest Models)');
  if (status.cloud.anthropic) status.priority.push('Claude Direct (Sonnet 3.5)');
  if (status.cloud.groq) status.priority.push('Groq (Llama 3.1-70B)');
  if (status.cloud.openai) status.priority.push('OpenAI (GPT-4o)');
  if (status.cloud.xai) status.priority.push('xAI (Grok-2)');

  if (status.priority.length === 0) {
    status.priority.push('❌ No providers available');
  }

  return status;
}

/**
 * Test local AI connections (duplicate from main.js for modularity)
 */
async function testLocalAI() {
  const status = { ollama: false, lmStudio: false };

  try {
    // Test Ollama
    try {
      const ollamaResponse = await axios.get('http://localhost:11434/api/tags', {
        timeout: 5000
      });
      status.ollama = ollamaResponse.status === 200;
    } catch (error) {
      status.ollama = false;
    }

    // Test LM Studio
    try {
      const lmStudioResponse = await axios.get('http://localhost:1234/v1/models', {
        timeout: 5000
      });
      status.lmStudio = lmStudioResponse.status === 200;
    } catch (error) {
      status.lmStudio = false;
    }
  } catch (error) {
    console.error('Error testing local AI:', error);
  }

  return status;
}

module.exports = {
  AI_PROVIDER_CONFIG,
  getBestDesktopProvider,
  generateWithBestProvider,
  getDesktopProviderStatus,
  testLocalAI,
  getProviderAvailability
};