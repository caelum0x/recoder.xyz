/**
 * Integration Test: ActionRunner Timing Issue
 * 
 * This simulates the exact scenario from the bug:
 * - AI creates package.json
 * - AI runs "npm install --save-dev vite" (standalone install)
 * - Dev server tries to start but files aren't ready yet
 * - AI creates more files (index.html, src/main.jsx, etc.)
 * - Result: Blank preview because dev server started before files existed
 * 
 * Expected behavior after fix:
 * - All files created first
 * - npm install waits for files
 * - Dev server starts only after all files are ready
 */

console.log('=== Integration Test: Timing Issue Fix ===\n');

// Simulate the exact action sequence from the bug
const bugScenarioActions = [
  { type: 'file', path: 'package.json', delay: 0 },
  { type: 'file', path: 'package-lock.json', delay: 50 },
  { type: 'shell', command: 'npm install --save-dev vite', delay: 100 },
  // These files come AFTER the install command in the AI response
  { type: 'file', path: 'index.html', delay: 300 },
  { type: 'file', path: 'src/main.jsx', delay: 400 },
  { type: 'file', path: 'src/App.jsx', delay: 500 },
  { type: 'file', path: 'src/index.css', delay: 600 },
  { type: 'shell', command: 'npm install && npm run dev', delay: 700 },
  { type: 'file', path: 'README.md', delay: 800 },
];

// Regex patterns from ActionRunner (updated)
const isDevServerRegex = /npm\s+(run\s+)?dev\b|yarn\s+dev\b|pnpm\s+dev\b|npx\s+vite\b|npm\s+start\b|yarn\s+start\b|pnpm\s+start\b|next\s+dev\b|remix\s+dev\b/;
const isInstallRegex = /npm\s+(install|i\b)|yarn\s+(install|add)\b|pnpm\s+(install|add)\b/;
const hasInstallAndDevRegex = /\b(npm|yarn|pnpm)\s+(install|i\b)[^&]*&&.*\b(npm|yarn|pnpm)\s+(run\s+)?dev\b/;

// State tracking
let packageJsonCreated = false;
let autoInstallTriggered = false;
let npmInstallComplete = false;
let devServerStarted = false;
let devServerStartTime = 0;
let autoInstallTimer: ReturnType<typeof setTimeout> | null = null;
const filesCreated: Array<{ path: string; time: number }> = [];
const eventLog: string[] = [];

function log(msg: string, time: number) {
  const entry = `[${time.toString().padStart(4)}ms] ${msg}`;
  eventLog.push(entry);
  console.log(entry);
}

function scheduleAutoInstall(time: number) {
  if (autoInstallTimer) {
    clearTimeout(autoInstallTimer);
    log('⏹️ Cancelled previous auto-install timer', time);
  }
  
  log('⏰ Scheduling auto-install (2000ms debounce)', time);
  
  // In real code, this would be setTimeout
  // For testing, we'll track when it WOULD fire
  autoInstallTimer = setTimeout(() => {
    runAutoInstall(time + 2000);
  }, 2000);
}

function runAutoInstall(time: number) {
  if (autoInstallTriggered) {
    log('⏭️ Auto-install skipped - already triggered', time);
    return;
  }
  
  autoInstallTriggered = true;
  log('📦 AUTO-INSTALL: Running npm install', time);
  npmInstallComplete = true;
  log('✅ AUTO-INSTALL: Dependencies installed', time);
  log('🚀 AUTO-INSTALL: Starting dev server', time);
  devServerStarted = true;
  devServerStartTime = time;
}

async function simulateAction(action: any) {
  const time = action.delay;
  const normalizedCommand = action.command?.toLowerCase() || '';
  const isDevServer = isDevServerRegex.test(normalizedCommand);
  const isInstall = isInstallRegex.test(normalizedCommand);
  const hasInstallAndDev = hasInstallAndDevRegex.test(normalizedCommand);
  
  if (action.type === 'file') {
    log(`📄 Creating file: ${action.path}`, time);
    filesCreated.push({ path: action.path, time });
    
    if (action.path === 'package.json') {
      packageJsonCreated = true;
      log('   → package.json detected', time);
      scheduleAutoInstall(time);
    }
  } else if (action.type === 'shell') {
    log(`🔨 Shell: ${action.command}`, time);
    
    if (isInstall && !isDevServer && !hasInstallAndDev) {
      log('   → Standalone install detected (NOT starting dev server)', time);
      
      // Cancel auto-install if pending
      if (autoInstallTimer) {
        clearTimeout(autoInstallTimer);
        autoInstallTimer = null;
        log('   → Cancelled pending auto-install', time);
      }
      
      log('   → Running install...', time);
      // Simulate install completing
      log('   → Install complete', time);
      
      // Re-schedule auto-install after this install
      if (packageJsonCreated && !autoInstallTriggered) {
        scheduleAutoInstall(time);
      }
    } else if (hasInstallAndDev) {
      log('   → Install+dev combo detected', time);
      
      if (autoInstallTriggered) {
        log('   → ⏭️ Skipping - auto-install already handled', time);
        return;
      }
      
      // Cancel any pending auto-install
      if (autoInstallTimer) {
        clearTimeout(autoInstallTimer);
        autoInstallTimer = null;
      }
      
      autoInstallTriggered = true;
      log('   → Running install part...', time);
      npmInstallComplete = true;
      log('   → Starting dev server in background...', time);
      devServerStarted = true;
      devServerStartTime = time;
    } else if (isDevServer) {
      log('   → Dev server command (background)', time);
      devServerStarted = true;
      devServerStartTime = time;
    }
  }
}

// Run simulation
console.log('Running bug scenario simulation...\n');

async function runSimulation() {
  for (const action of bugScenarioActions) {
    await simulateAction(action);
  }
  
  // Give time for auto-install timer
  console.log('\n⏳ Waiting for any pending timers...\n');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // If timer is still pending, cancel it (simulation complete)
  if (autoInstallTimer) {
    clearTimeout(autoInstallTimer);
  }
  
  console.log('\n=== VALIDATION ===\n');
  
  // Check 1: Dev server should NOT start before source files are created
  const sourceFiles = filesCreated.filter(f => 
    f.path === 'index.html' || 
    f.path.startsWith('src/')
  );
  const latestSourceFileTime = Math.max(...sourceFiles.map(f => f.time));
  
  console.log(`Latest source file created at: ${latestSourceFileTime}ms`);
  console.log(`Dev server started at: ${devServerStartTime}ms`);
  
  if (devServerStartTime < latestSourceFileTime) {
    console.log('\n❌ FAIL: Dev server started BEFORE source files were created!');
    console.log('   This would result in a blank preview.');
    console.log(`   Dev server: ${devServerStartTime}ms vs Latest file: ${latestSourceFileTime}ms`);
    
    console.log('\n📋 Event Log:');
    eventLog.forEach(e => console.log(`   ${e}`));
    return false;
  } else {
    console.log('\n✅ PASS: Dev server started AFTER source files were created');
  }
  
  // Check 2: All required files should exist
  const requiredFiles = ['package.json', 'index.html', 'src/main.jsx', 'src/App.jsx'];
  const missingFiles = requiredFiles.filter(f => !filesCreated.find(fc => fc.path === f));
  
  if (missingFiles.length > 0) {
    console.log(`\n❌ FAIL: Missing required files: ${missingFiles.join(', ')}`);
    return false;
  }
  console.log('✅ PASS: All required files were created');
  
  // Check 3: npm install should complete before dev server
  if (!npmInstallComplete && devServerStarted) {
    console.log('\n❌ FAIL: Dev server started without npm install completing');
    return false;
  }
  console.log('✅ PASS: npm install completed before dev server');
  
  console.log('\n=== ALL CHECKS PASSED ===\n');
  return true;
}

runSimulation().then(success => {
  process.exit(success ? 0 : 1);
});
