/**
 * Code Template Service for Production Engine
 * Manages code templates and boilerplates for different project types
 */

import { logger } from '../utils/logger';
// import { GeneratedFile } from '../generators/real-code-generator';

interface GeneratedFile {
  path: string;
  content: string;
  type: 'code' | 'config' | 'test' | 'documentation' | 'source';
  language?: string;
  dependencies?: string[];
}

export interface CodeTemplate {
  id: string;
  name: string;
  description: string;
  type: 'web' | 'blockchain' | 'backend' | 'mobile' | 'ai' | 'payments';
  framework: string;
  language: string;
  files: TemplateFile[];
  dependencies: string[];
  scripts: Record<string, string>;
  environment: Record<string, string>;
}

export interface TemplateFile {
  path: string;
  content: string;
  language: string;
  type: 'source' | 'config' | 'test' | 'documentation';
  replacements?: Record<string, string>;
}

export class CodeTemplateService {
  private templates: Map<string, CodeTemplate> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  private initializeTemplates() {
    // Web Application Templates
    this.registerTemplate(this.createReactNextTemplate());
    this.registerTemplate(this.createVueTemplate());
    this.registerTemplate(this.createSvelteTemplate());

    // Blockchain Templates
    this.registerTemplate(this.createSolanaTemplate());
    this.registerTemplate(this.createEthereumTemplate());
    this.registerTemplate(this.createSolanaAnchorTemplate());

    // Backend Templates
    this.registerTemplate(this.createNodeExpressTemplate());
    this.registerTemplate(this.createPythonFastAPITemplate());
    this.registerTemplate(this.createRustActixTemplate());

    // Mobile Templates
    this.registerTemplate(this.createReactNativeTemplate());
    this.registerTemplate(this.createFlutterTemplate());

    // AI Templates
    this.registerTemplate(this.createAITemplate());
    this.registerTemplate(this.createMLTemplate());

    // Payment Templates
    this.registerTemplate(this.createStripeTemplate());
    this.registerTemplate(this.createPayPalTemplate());

    logger.info(`Initialized ${this.templates.size} code templates`);
  }

  private registerTemplate(template: CodeTemplate) {
    this.templates.set(template.id, template);
  }

  getTemplate(id: string): CodeTemplate | undefined {
    return this.templates.get(id);
  }

  getTemplatesByType(type: string): CodeTemplate[] {
    return Array.from(this.templates.values()).filter(t => t.type === type);
  }

  getAllTemplates(): CodeTemplate[] {
    return Array.from(this.templates.values());
  }

  generateFromTemplate(templateId: string, replacements: Record<string, string> = {}): GeneratedFile[] {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const files: GeneratedFile[] = [];

    for (const templateFile of template.files) {
      let content = templateFile.content;
      
      // Apply replacements
      const allReplacements = { ...templateFile.replacements, ...replacements };
      for (const [key, value] of Object.entries(allReplacements)) {
        content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }

      files.push({
        path: templateFile.path,
        content,
        language: templateFile.language,
        type: templateFile.type,
        dependencies: template.dependencies
      });
    }

    // Add package.json if not present
    if (!files.some(f => f.path === 'package.json')) {
      files.push(this.generatePackageJson(template, replacements));
    }

    // Add environment file
    if (Object.keys(template.environment).length > 0) {
      files.push(this.generateEnvFile(template));
    }

    return files;
  }

  private generatePackageJson(template: CodeTemplate, replacements: Record<string, string>): GeneratedFile {
    const projectName = replacements.projectName || template.name.toLowerCase().replace(/\s+/g, '-');
    
    const packageJson = {
      name: projectName,
      version: "1.0.0",
      description: replacements.description || template.description,
      main: "index.js",
      scripts: template.scripts,
      dependencies: {},
      devDependencies: {}
    };

    // Add dependencies based on template
    for (const dep of template.dependencies) {
      packageJson.dependencies[dep] = "latest";
    }

    return {
      path: 'package.json',
      content: JSON.stringify(packageJson, null, 2),
      language: 'json',
      type: 'config'
    };
  }

  private generateEnvFile(template: CodeTemplate): GeneratedFile {
    const envContent = Object.entries(template.environment)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    return {
      path: '.env.example',
      content: envContent,
      language: 'text',
      type: 'config'
    };
  }

  // Template creators
  private createReactNextTemplate(): CodeTemplate {
    return {
      id: 'react-nextjs',
      name: 'React Next.js Application',
      description: 'Full-stack React application with Next.js',
      type: 'web',
      framework: 'Next.js',
      language: 'TypeScript',
      files: [
        {
          path: 'pages/index.tsx',
          content: `import Head from 'next/head'
import { useState } from 'react'

export default function Home() {
  const [count, setCount] = useState(0)

  return (
    <div>
      <Head>
        <title>{{projectName}}</title>
        <meta name="description" content="{{description}}" />
      </Head>

      <main>
        <h1>Welcome to {{projectName}}</h1>
        <p>Count: {count}</p>
        <button onClick={() => setCount(count + 1)}>
          Increment
        </button>
      </main>
    </div>
  )
}`,
          language: 'typescript',
          type: 'source',
          replacements: {
            projectName: 'My App',
            description: 'A Next.js application'
          }
        },
        {
          path: 'pages/api/hello.ts',
          content: `import type { NextApiRequest, NextApiResponse } from 'next'

type Data = {
  name: string
  message: string
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  res.status(200).json({ 
    name: '{{projectName}} API',
    message: 'Hello from the API!'
  })
}`,
          language: 'typescript',
          type: 'source'
        }
      ],
      dependencies: ['next', 'react', 'react-dom', 'typescript', '@types/node', '@types/react'],
      scripts: {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
        lint: 'next lint'
      },
      environment: {
        NEXT_PUBLIC_API_URL: 'http://localhost:3000/api'
      }
    };
  }

  private createVueTemplate(): CodeTemplate {
    return {
      id: 'vue3',
      name: 'Vue 3 Application',
      description: 'Modern Vue 3 application with Composition API',
      type: 'web',
      framework: 'Vue.js',
      language: 'TypeScript',
      files: [
        {
          path: 'src/App.vue',
          content: `<template>
  <div id="app">
    <header>
      <h1>{{projectName}}</h1>
    </header>
    <main>
      <Counter />
    </main>
  </div>
</template>

<script setup lang="ts">
import Counter from './components/Counter.vue'
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>`,
          language: 'typescript',
          type: 'source'
        }
      ],
      dependencies: ['vue', '@vitejs/plugin-vue', 'vite', 'typescript'],
      scripts: {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview'
      },
      environment: {}
    };
  }

  private createSvelteTemplate(): CodeTemplate {
    return {
      id: 'svelte',
      name: 'Svelte Application',
      description: 'Modern Svelte application',
      type: 'web',
      framework: 'Svelte',
      language: 'TypeScript',
      files: [],
      dependencies: ['svelte', '@sveltejs/kit', 'vite'],
      scripts: {
        dev: 'svelte-kit dev',
        build: 'svelte-kit build',
        preview: 'svelte-kit preview'
      },
      environment: {}
    };
  }

  private createSolanaTemplate(): CodeTemplate {
    return {
      id: 'solana-web3',
      name: 'Solana Web3 Application',
      description: 'Solana blockchain application with web3.js',
      type: 'blockchain',
      framework: 'Solana',
      language: 'TypeScript',
      files: [
        {
          path: 'src/solana.ts',
          content: `import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js'

export class SolanaService {
  private connection: Connection

  constructor(rpcUrl: string = 'https://api.devnet.solana.com') {
    this.connection = new Connection(rpcUrl, 'confirmed')
  }

  async getBalance(publicKey: PublicKey): Promise<number> {
    const balance = await this.connection.getBalance(publicKey)
    return balance / LAMPORTS_PER_SOL
  }

  async sendTransaction(
    fromKeypair: Keypair,
    toPublicKey: PublicKey,
    amount: number
  ): Promise<string> {
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: toPublicKey,
        lamports: amount * LAMPORTS_PER_SOL,
      })
    )

    const signature = await this.connection.sendTransaction(
      transaction,
      [fromKeypair]
    )

    return signature
  }

  async airdrop(publicKey: PublicKey, amount: number): Promise<string> {
    const signature = await this.connection.requestAirdrop(
      publicKey,
      amount * LAMPORTS_PER_SOL
    )

    await this.connection.confirmTransaction(signature)
    return signature
  }
}`,
          language: 'typescript',
          type: 'source'
        }
      ],
      dependencies: ['@solana/web3.js', '@solana/wallet-adapter-base', '@solana/wallet-adapter-react'],
      scripts: {
        dev: 'ts-node src/index.ts',
        build: 'tsc',
        test: 'jest'
      },
      environment: {
        SOLANA_RPC_URL: 'https://api.devnet.solana.com',
        SOLANA_WALLET_PRIVATE_KEY: 'your_private_key_here'
      }
    };
  }

  private createSolanaAnchorTemplate(): CodeTemplate {
    return {
      id: 'solana-anchor',
      name: 'Solana Anchor Program',
      description: 'Solana smart contract with Anchor framework',
      type: 'blockchain',
      framework: 'Anchor',
      language: 'Rust',
      files: [
        {
          path: 'programs/{{projectName}}/src/lib.rs',
          content: `use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod {{projectName}} {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let base_account = &mut ctx.accounts.base_account;
        base_account.count = 0;
        Ok(())
    }

    pub fn increment(ctx: Context<Update>) -> Result<()> {
        let base_account = &mut ctx.accounts.base_account;
        base_account.count += 1;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, space = 16 + 16)]
    pub base_account: Account<'info, BaseAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Update<'info> {
    #[account(mut)]
    pub base_account: Account<'info, BaseAccount>,
}

#[account]
pub struct BaseAccount {
    pub count: u64,
}`,
          language: 'rust',
          type: 'source'
        }
      ],
      dependencies: [],
      scripts: {
        build: 'anchor build',
        test: 'anchor test',
        deploy: 'anchor deploy'
      },
      environment: {
        ANCHOR_PROVIDER_URL: 'https://api.devnet.solana.com',
        ANCHOR_WALLET: '~/.config/solana/id.json'
      }
    };
  }

  private createEthereumTemplate(): CodeTemplate {
    return {
      id: 'ethereum-hardhat',
      name: 'Ethereum Smart Contract',
      description: 'Ethereum smart contract with Hardhat',
      type: 'blockchain',
      framework: 'Hardhat',
      language: 'Solidity',
      files: [
        {
          path: 'contracts/{{contractName}}.sol',
          content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract {{contractName}} {
    uint256 private _counter;
    address public owner;

    event CounterIncremented(uint256 newValue);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        _counter = 0;
    }

    function increment() public {
        _counter += 1;
        emit CounterIncremented(_counter);
    }

    function getCounter() public view returns (uint256) {
        return _counter;
    }

    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "New owner is the zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}`,
          language: 'solidity',
          type: 'source',
          replacements: {
            contractName: 'MyContract'
          }
        }
      ],
      dependencies: ['hardhat', 'ethers', '@nomiclabs/hardhat-ethers'],
      scripts: {
        compile: 'hardhat compile',
        test: 'hardhat test',
        deploy: 'hardhat run scripts/deploy.js'
      },
      environment: {
        ETH_RPC_URL: 'https://mainnet.infura.io/v3/your_infura_id',
        PRIVATE_KEY: 'your_private_key_here'
      }
    };
  }

  private createNodeExpressTemplate(): CodeTemplate {
    return {
      id: 'node-express',
      name: 'Node.js Express API',
      description: 'RESTful API with Node.js and Express',
      type: 'backend',
      framework: 'Express.js',
      language: 'TypeScript',
      files: [
        {
          path: 'src/app.ts',
          content: `import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { config } from './config'
import { logger } from './utils/logger'

const app = express()

// Middleware
app.use(helmet())
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Routes
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: '{{projectName}}'
  })
})

app.get('/api/hello', (req, res) => {
  res.json({ 
    message: 'Hello from {{projectName}} API!',
    timestamp: new Date().toISOString()
  })
})

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err)
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  })
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl
  })
})

const PORT = config.port || 3000

app.listen(PORT, () => {
  logger.info(\`{{projectName}} API server running on port \${PORT}\`)
})

export default app`,
          language: 'typescript',
          type: 'source'
        }
      ],
      dependencies: ['express', 'cors', 'helmet', 'dotenv', 'winston', 'typescript', '@types/express', '@types/cors'],
      scripts: {
        dev: 'ts-node-dev src/app.ts',
        build: 'tsc',
        start: 'node dist/app.js',
        test: 'jest'
      },
      environment: {
        NODE_ENV: 'development',
        PORT: '3000',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/dbname'
      }
    };
  }

  // Additional template creators...
  private createPythonFastAPITemplate(): CodeTemplate {
    return {
      id: 'python-fastapi',
      name: 'Python FastAPI',
      description: 'Fast API with Python',
      type: 'backend',
      framework: 'FastAPI',
      language: 'Python',
      files: [],
      dependencies: [],
      scripts: {},
      environment: {}
    };
  }

  private createRustActixTemplate(): CodeTemplate {
    return {
      id: 'rust-actix',
      name: 'Rust Actix Web',
      description: 'Web server with Rust and Actix',
      type: 'backend',
      framework: 'Actix',
      language: 'Rust',
      files: [],
      dependencies: [],
      scripts: {},
      environment: {}
    };
  }

  private createReactNativeTemplate(): CodeTemplate {
    return {
      id: 'react-native',
      name: 'React Native App',
      description: 'Cross-platform mobile app',
      type: 'mobile',
      framework: 'React Native',
      language: 'TypeScript',
      files: [],
      dependencies: [],
      scripts: {},
      environment: {}
    };
  }

  private createFlutterTemplate(): CodeTemplate {
    return {
      id: 'flutter',
      name: 'Flutter App',
      description: 'Cross-platform app with Flutter',
      type: 'mobile',
      framework: 'Flutter',
      language: 'Dart',
      files: [],
      dependencies: [],
      scripts: {},
      environment: {}
    };
  }

  private createAITemplate(): CodeTemplate {
    return {
      id: 'ai-application',
      name: 'AI Application',
      description: 'AI-powered application',
      type: 'ai',
      framework: 'TensorFlow',
      language: 'Python',
      files: [],
      dependencies: [],
      scripts: {},
      environment: {}
    };
  }

  private createMLTemplate(): CodeTemplate {
    return {
      id: 'ml-pipeline',
      name: 'ML Pipeline',
      description: 'Machine learning pipeline',
      type: 'ai',
      framework: 'Scikit-learn',
      language: 'Python',
      files: [],
      dependencies: [],
      scripts: {},
      environment: {}
    };
  }

  private createStripeTemplate(): CodeTemplate {
    return {
      id: 'stripe-integration',
      name: 'Stripe Payment Integration',
      description: 'Payment processing with Stripe',
      type: 'payments',
      framework: 'Stripe',
      language: 'TypeScript',
      files: [],
      dependencies: [],
      scripts: {},
      environment: {}
    };
  }

  private createPayPalTemplate(): CodeTemplate {
    return {
      id: 'paypal-integration',
      name: 'PayPal Payment Integration',
      description: 'Payment processing with PayPal',
      type: 'payments',
      framework: 'PayPal',
      language: 'TypeScript',
      files: [],
      dependencies: [],
      scripts: {},
      environment: {}
    };
  }
}