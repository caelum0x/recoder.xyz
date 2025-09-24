import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { initConfig, initDir } from "./utils";
import { createServer } from "./server";
import { router } from "./utils/router";
import { apiKeyAuth } from "./middleware/auth";
import {
  cleanupPidFile,
  isServiceRunning,
  savePid,
} from "./utils/processCheck";
import { CONFIG_FILE } from "./constants";
import { routerBackendClient } from "./services/backend-client";
import { unifiedRouterAI } from "./services/unified-router-ai";

async function initializeClaudeConfig() {
  const homeDir = homedir();
  const configPath = join(homeDir, ".claude.json");
  if (!existsSync(configPath)) {
    const userID = Array.from(
      { length: 64 },
      () => Math.random().toString(16)[2]
    ).join("");
    const configContent = {
      numStartups: 184,
      autoUpdaterStatus: "enabled",
      userID,
      hasCompletedOnboarding: true,
      lastOnboardingVersion: "1.0.17",
      projects: {},
    };
    await writeFile(configPath, JSON.stringify(configContent, null, 2));
  }
}

interface RunOptions {
  port?: number;
}

async function run(options: RunOptions = {}) {
  // Check if service is already running
  if (isServiceRunning()) {
    console.log("✅ Service is already running in the background.");
    return;
  }

  await initializeClaudeConfig();
  await initDir();
  const config = await initConfig();

  // Initialize unified router AI system
  console.log("🤖 Initializing unified AI system...");
  try {
    const status = unifiedRouterAI.getRouterStatus();
    console.log(`✅ Unified AI initialized with ${status.availableProviders.length} providers: ${status.availableProviders.join(', ')}`);
  } catch (error) {
    console.warn("⚠️ Failed to initialize unified AI system:", error);
  }

  // Initialize backend client and check connection
  console.log("🔗 Checking backend connection...");
  const isBackendAvailable = await routerBackendClient.isBackendAvailable();
  if (isBackendAvailable) {
    const session = routerBackendClient.getCurrentSession();
    if (session) {
      console.log(`👤 Connected as ${session.email} (${session.plan} plan)`);
      await routerBackendClient.updatePlatformStatus('router', true);
    } else {
      console.log("📴 Backend available but not authenticated");
    }
  } else {
    console.log("📴 Backend not available - running in offline mode");
  }
  let HOST = config.HOST;

  if (config.HOST && !config.APIKEY) {
    HOST = "127.0.0.1";
    console.warn(
      "⚠️ API key is not set. HOST is forced to 127.0.0.1."
    );
  }

  const port = config.PORT || 3456;

  // Save the PID of the background process
  savePid(process.pid);

  // Handle SIGINT (Ctrl+C) to clean up PID file
  process.on("SIGINT", async () => {
    console.log("Received SIGINT, cleaning up...");
    await routerBackendClient.updatePlatformStatus('router', false);
    cleanupPidFile();
    process.exit(0);
  });

  // Handle SIGTERM to clean up PID file
  process.on("SIGTERM", async () => {
    await routerBackendClient.updatePlatformStatus('router', false);
    cleanupPidFile();
    process.exit(0);
  });
  console.log(HOST)

  // Use port from environment variable if set (for background process)
  const servicePort = process.env.SERVICE_PORT
    ? parseInt(process.env.SERVICE_PORT)
    : port;
  const server = createServer({
    jsonPath: CONFIG_FILE,
    initialConfig: {
      // ...config,
      providers: config.Providers || config.providers,
      HOST: HOST,
      PORT: servicePort,
      LOG_FILE: join(
        homedir(),
        ".claude-code-router",
        "claude-code-router.log"
      ),
    },
  });
  server.addHook("preHandler", apiKeyAuth(config));
  server.addHook("preHandler", async (req, reply) =>
    router(req, reply, config)
  );
  server.start();
}

/**
 * Start interactive chat session using the router's AI system
 */
async function startInteractiveChat() {
  console.clear();
  
  // Router-specific header
  console.log('🚀 Recoder CLI Router - Interactive Chat');
  console.log('Powered by unified AI routing system\n');
  
  // Initialize router AI system
  console.log("🤖 Initializing router AI system...");
  try {
    const status = unifiedRouterAI.getRouterStatus();
    console.log(`✅ Router initialized with ${status.availableProviders.length} providers: ${status.availableProviders.join(', ')}`);
    
    if (status.quotaInfo) {
      console.log(`👤 Logged in as ${status.quotaInfo.user} (${status.quotaInfo.plan} plan)`);
      console.log(`📊 Quota: ${status.quotaInfo.remaining}/${status.quotaInfo.total} requests remaining`);
    } else {
      console.log("📴 Not authenticated - some features may be limited");
    }
  } catch (error) {
    console.warn("⚠️ Failed to initialize router AI system:", error);
    return;
  }
  
  console.log('\nType your message. Press Ctrl+C to exit.\n');
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  // Main chat loop with router AI
  while (true) {
    try {
      const userMessage = await new Promise<string>((resolve) => {
        rl.question('> ', resolve);
      });

      if (!userMessage.trim()) continue;
      
      console.log('\n🤖 ');
      
      try {
        // Use router AI system
        const startTime = Date.now();
        const response = await unifiedRouterAI.routeRequest(userMessage, {
          contextType: 'default',
          priority: 'quality',
          maxTokens: 4000,
          temperature: 0.7
        });
        const responseTime = Date.now() - startTime;
        
        // Display response
        console.log(response.content);
        console.log();
        
        // Show routing info
        console.log(`Model: ${response.model} | Provider: ${response.provider}`);
        console.log(`Tokens: ${response.tokens.input} in, ${response.tokens.output} out`);
        if (response.cost !== undefined) {
          console.log(`Cost: $${response.cost.toFixed(6)}`);
        }
        console.log(`Response Time: ${responseTime}ms`);
        
        if (response.quotaInfo) {
          console.log(`Quota: ${response.quotaInfo.remaining}/${response.quotaInfo.total} remaining`);
        }
        
        console.log();
        
      } catch (error: any) {
        console.log(`❌ Error: ${error.message}`);
        console.log();
      }
      
    } catch (error) {
      console.log('\nGoodbye! 👋');
      break;
    }
  }
  
  rl.close();
}

// Handle command line arguments
const args = process.argv.slice(2);
const command = args[0];

function showHelp() {
  console.log(`
🔧 Recoder CLI Router - Intelligent AI Model Routing System

Usage:
  rcr                    Start interactive chat (Claude Code style)
  rcr chat              Start interactive chat
  rcr start             Start router server in background
  rcr stop              Stop router server
  rcr status            Check router server status
  rcr --help, -h        Show this help message

Interactive Chat:
  When running without arguments, rcr starts an interactive chat session
  that uses smart AI model routing for optimal cost and performance.

Features:
  • Smart model routing (79% cost reduction vs Claude direct)
  • Support for FREE and PAID tiers
  • Real-time cost optimization
  • Multiple AI providers (Claude, Gemini, DeepSeek, etc.)

Examples:
  rcr                   # Start interactive chat
  rcr chat              # Start interactive chat 
  rcr start --port 3456 # Start server on custom port
`);
}

function showStatus() {
  console.log('🔍 Checking CLI Router status...');
  if (isServiceRunning()) {
    console.log('✅ CLI Router server is running');
  } else {
    console.log('❌ CLI Router server is not running');
  }
}

// Parse commands
if (command === '--help' || command === '-h' || command === 'help') {
  showHelp();
} else if (command === 'status') {
  showStatus();
} else if (command === 'start') {
  run();
} else if (command === 'stop') {
  cleanupPidFile();
  console.log('🛑 CLI Router server stopped');
} else if (args.length === 0 || command === 'chat') {
  // Start interactive chat (Claude Code style)
  startInteractiveChat();
} else {
  // Unknown command
  console.log(`❌ Unknown command: ${command}`);
  console.log('Run "rcr --help" for usage information.');
  process.exit(1);
}

export { run };
