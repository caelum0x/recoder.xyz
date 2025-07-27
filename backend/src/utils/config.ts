/**
 * Backend Configuration Management
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface Config {
  environment: string;
  port: number;
  database: {
    url: string;
    ssl: boolean;
  };
  redis: {
    url: string;
    password?: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
    refreshExpiresIn: string;
  };
  cors: {
    origins: string[];
  };
  rateLimit: {
    requests: number;
    windowMs: number;
  };
  ai: {
    anthropic: {
      apiKey?: string;
      maxTokens: number;
    };
    openai: {
      apiKey?: string;
      maxTokens: number;
    };
    groq: {
      apiKey?: string;
      maxTokens: number;
    };
    gemini: {
      apiKey?: string;
      maxTokens: number;
    };
  };
  storage: {
    type: 'local' | 's3';
    bucket?: string;
    region?: string;
  };
  logging: {
    level: string;
    format: 'json' | 'text';
  };
  metrics: {
    enabled: boolean;
    port: number;
  };
}

const config: Config = {
  environment: process.env['NODE_ENV'] || 'development',
  port: parseInt(process.env['PORT'] || '3001', 10),
  
  database: {
    url: process.env['DATABASE_URL'] || 'postgresql://user:password@localhost:5432/recoder',
    ssl: process.env['NODE_ENV'] === 'production',
  },
  
  redis: {
    url: process.env['REDIS_URL'] || 'redis://localhost:6379',
    password: process.env['REDIS_PASSWORD'],
  },
  
  jwt: {
    secret: process.env['JWT_SECRET'] || 'dev-secret-key',
    expiresIn: process.env['JWT_EXPIRES_IN'] || '24h',
    refreshExpiresIn: process.env['JWT_REFRESH_EXPIRES_IN'] || '7d',
  },
  
  cors: {
    origins: process.env['CORS_ORIGINS']?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
  },
  
  rateLimit: {
    requests: parseInt(process.env['RATE_LIMIT_REQUESTS'] || '100', 10),
    windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000', 10), // 15 minutes
  },
  
  ai: {
    anthropic: {
      apiKey: process.env['ANTHROPIC_API_KEY'],
      maxTokens: parseInt(process.env['ANTHROPIC_MAX_TOKENS'] || '4000', 10),
    },
    openai: {
      apiKey: process.env['OPENAI_API_KEY'],
      maxTokens: parseInt(process.env['OPENAI_MAX_TOKENS'] || '4000', 10),
    },
    groq: {
      apiKey: process.env['GROQ_API_KEY'],
      maxTokens: parseInt(process.env['GROQ_MAX_TOKENS'] || '4000', 10),
    },
    gemini: {
      apiKey: process.env['GOOGLE_API_KEY'],
      maxTokens: parseInt(process.env['GEMINI_MAX_TOKENS'] || '4000', 10),
    },
  },
  
  storage: {
    type: (process.env['STORAGE_TYPE'] as 'local' | 's3') || 'local',
    bucket: process.env['S3_BUCKET'],
    region: process.env['AWS_REGION'] || 'us-east-1',
  },
  
  logging: {
    level: process.env['LOG_LEVEL'] || 'info',
    format: (process.env['LOG_FORMAT'] as 'json' | 'text') || 'json',
  },
  
  metrics: {
    enabled: process.env['METRICS_ENABLED'] === 'true',
    port: parseInt(process.env['METRICS_PORT'] || '9090', 10),
  },
};

// Validate required configuration
const requiredVars = [
  'JWT_SECRET',
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0 && config.environment === 'production') {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

export { config };