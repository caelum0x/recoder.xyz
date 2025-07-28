#!/usr/bin/env node
import { run } from "./index";
import { showStatus } from "./utils/status";
import { executeCodeCommand } from "./utils/codeCommand";
import { cleanupPidFile, isServiceRunning } from "./utils/processCheck";
import { version } from "../package.json";
import { spawn } from "child_process";
import { PID_FILE, REFERENCE_COUNT_FILE } from "./constants";
import fs, { existsSync, readFileSync } from "fs";
import {join} from "path";
import { routerBackendClient } from "./services/backend-client";

const command = process.argv[2];

const HELP_TEXT = `
Usage: ccr [command]

Commands:
  start         Start server 
  stop          Stop server
  restart       Restart server
  status        Show server status
  code          Execute claude command
  auth          Manage authentication
  -v, version   Show version information
  -h, help      Show help information

Auth Commands:
  ccr auth login     Login to recoder.xyz
  ccr auth register  Register new account
  ccr auth status    Show auth status
  ccr auth logout    Logout

Example:
  ccr start
  ccr code "Write a Hello World"
  ccr auth login
`;

async function waitForService(
  timeout = 10000,
  initialDelay = 1000
): Promise<boolean> {
  // Wait for an initial period to let the service initialize
  await new Promise((resolve) => setTimeout(resolve, initialDelay));

  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (isServiceRunning()) {
      // Wait for an additional short period to ensure service is fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function handleAuthCommand() {
  const authCommand = process.argv[3];
  
  switch (authCommand) {
    case 'login':
      try {
        const email = process.argv[4];
        const password = process.argv[5];
        
        if (!email || !password) {
          console.log('Usage: ccr auth login <email> <password>');
          return;
        }
        
        const session = await routerBackendClient.authenticate({ email, password });
        console.log(`✅ Successfully logged in as ${session.email}`);
        console.log(`📊 Plan: ${session.plan}`);
        console.log(`📈 Quota: ${session.quotas.usedRequests}/${session.quotas.totalRequests}`);
      } catch (error: any) {
        console.error(`❌ Login failed: ${error.message}`);
      }
      break;
      
    case 'register':
      try {
        const email = process.argv[4];
        const password = process.argv[5];
        const name = process.argv[6];
        
        if (!email || !password || !name) {
          console.log('Usage: ccr auth register <email> <password> <name>');
          return;
        }
        
        const session = await routerBackendClient.register({ email, password, name });
        console.log(`✅ Successfully registered and logged in as ${session.email}`);
        console.log(`📊 Plan: ${session.plan}`);
      } catch (error: any) {
        console.error(`❌ Registration failed: ${error.message}`);
      }
      break;
      
    case 'status':
      const session = routerBackendClient.getCurrentSession();
      if (session) {
        console.log('🔐 Authentication Status: Logged in');
        console.log(routerBackendClient.getSessionInfo());
      } else {
        console.log('📴 Authentication Status: Not logged in');
      }
      break;
      
    case 'logout':
      try {
        await routerBackendClient.logout();
        console.log('👋 Successfully logged out');
      } catch (error: any) {
        console.error(`❌ Logout failed: ${error.message}`);
      }
      break;
      
    default:
      console.log('Unknown auth command. Use: login, register, status, or logout');
  }
}

async function main() {
  switch (command) {
    case "start":
      run();
      break;
    case "stop":
      try {
        const pid = parseInt(readFileSync(PID_FILE, "utf-8"));
        process.kill(pid);
        cleanupPidFile();
        if (existsSync(REFERENCE_COUNT_FILE)) {
          try {
            fs.unlinkSync(REFERENCE_COUNT_FILE);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
        console.log(
          "claude code router service has been successfully stopped."
        );
      } catch (e) {
        console.log(
          "Failed to stop the service. It may have already been stopped."
        );
        cleanupPidFile();
      }
      break;
    case "auth":
      await handleAuthCommand();
      break;
    case "status":
      await showStatus();
      break;
    case "code":
      if (!isServiceRunning()) {
        console.log("Service not running, starting service...");
        const cliPath = join(__dirname, "cli.js");
        const startProcess = spawn("node", [cliPath, "start"], {
          detached: true,
          stdio: "ignore",
        });

        startProcess.on("error", (error) => {
          console.error("Failed to start service:", error);
          process.exit(1);
        });

        startProcess.unref();

        if (await waitForService()) {
          executeCodeCommand(process.argv.slice(3));
        } else {
          console.error(
            "Service startup timeout, please manually run `ccr start` to start the service"
          );
          process.exit(1);
        }
      } else {
        executeCodeCommand(process.argv.slice(3));
      }
      break;
    case "-v":
    case "version":
      console.log(`claude-code-router version: ${version}`);
      break;
    case "-h":
    case "help":
      console.log(HELP_TEXT);
      break;
    default:
      console.log(HELP_TEXT);
      process.exit(1);
  }
}

main().catch(console.error);
