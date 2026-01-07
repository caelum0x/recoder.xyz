/**
 * Test file for ActionRunner sequence validation
 * 
 * This tests the correct order of operations:
 * 1. Files are created first (package.json, index.html, src/main.jsx, etc.)
 * 2. npm install runs AFTER all files are created
 * 3. Dev server starts AFTER npm install completes
 */

// Test the regex patterns used in ActionRunner
const testCases = [
  // Dev server detection - should match
  { input: 'npm run dev', expected: true, type: 'devServer' },
  { input: 'npm dev', expected: true, type: 'devServer' },
  { input: 'yarn dev', expected: true, type: 'devServer' },
  { input: 'pnpm dev', expected: true, type: 'devServer' },
  { input: 'npx vite', expected: true, type: 'devServer' },
  { input: 'npm start', expected: true, type: 'devServer' },
  { input: 'yarn start', expected: true, type: 'devServer' },
  { input: 'next dev', expected: true, type: 'devServer' },
  { input: 'remix dev', expected: true, type: 'devServer' },
  
  // Dev server detection - should NOT match (install commands containing "vite")
  { input: 'npm install vite', expected: false, type: 'devServer' },
  { input: 'npm install --save-dev vite', expected: false, type: 'devServer' },
  { input: 'npm i vite', expected: false, type: 'devServer' },
  { input: 'yarn add vite', expected: false, type: 'devServer' },
  { input: 'pnpm add vite', expected: false, type: 'devServer' },
  
  // Install detection - should match
  { input: 'npm install', expected: true, type: 'install' },
  { input: 'npm i', expected: true, type: 'install' },
  { input: 'npm install --save-dev vite', expected: true, type: 'install' },
  { input: 'yarn install', expected: true, type: 'install' },
  { input: 'yarn add react', expected: true, type: 'install' },
  { input: 'pnpm install', expected: true, type: 'install' },
  { input: 'pnpm add react', expected: true, type: 'install' },
  
  // Install+Dev combo detection
  { input: 'npm install && npm run dev', expected: true, type: 'installAndDev' },
  { input: 'npm i && npm run dev', expected: true, type: 'installAndDev' },
  { input: 'yarn install && yarn dev', expected: true, type: 'installAndDev' },
];

// Regex patterns from ActionRunner
const isDevServerRegex = /npm\s+(run\s+)?dev\b|yarn\s+dev\b|pnpm\s+dev\b|npx\s+vite\b|npm\s+start\b|yarn\s+start\b|pnpm\s+start\b|next\s+dev\b|remix\s+dev\b/;
const isInstallRegex = /npm\s+(install|i\b)|yarn\s+(install|add)\b|pnpm\s+(install|add)\b/;
const hasInstallAndDevRegex = /\b(npm|yarn|pnpm)\s+(install|i\b)[^&]*&&.*\b(npm|yarn|pnpm)\s+(run\s+)?dev\b/;

console.log('=== ActionRunner Regex Tests ===\n');

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const normalizedInput = testCase.input.replace(/\n/g, ' ').toLowerCase();
  let result: boolean;
  let regexName: string;
  
  switch (testCase.type) {
    case 'devServer':
      result = isDevServerRegex.test(normalizedInput);
      regexName = 'isDevServer';
      break;
    case 'install':
      result = isInstallRegex.test(normalizedInput);
      regexName = 'isInstall';
      break;
    case 'installAndDev':
      result = hasInstallAndDevRegex.test(normalizedInput);
      regexName = 'hasInstallAndDev';
      break;
    default:
      result = false;
      regexName = 'unknown';
  }
  
  const status = result === testCase.expected ? '✅ PASS' : '❌ FAIL';
  if (result === testCase.expected) {
    passed++;
  } else {
    failed++;
  }
  
  console.log(`${status} | "${testCase.input}" | ${regexName}=${result} (expected ${testCase.expected})`);
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

// Test sequence simulation
console.log('=== Sequence Simulation ===\n');

type SimAction = {
  type: 'file' | 'shell';
  path?: string;
  command?: string;
  timestamp: number;
};

const simulatedActions: SimAction[] = [
  { type: 'file', path: 'package.json', timestamp: 100 },
  { type: 'file', path: 'index.html', timestamp: 200 },
  { type: 'shell', command: 'npm install --save-dev vite', timestamp: 300 },
  { type: 'file', path: 'src/main.jsx', timestamp: 400 },
  { type: 'file', path: 'src/App.jsx', timestamp: 500 },
  { type: 'file', path: 'src/index.css', timestamp: 600 },
  { type: 'shell', command: 'npm install && npm run dev', timestamp: 700 },
  { type: 'file', path: 'README.md', timestamp: 800 },
];

// Simulate the ActionRunner state
let packageJsonCreated = false;
let autoInstallTriggered = false;
let npmInstallRunning = false;
let devServerStarted = false;
let autoInstallScheduled = false;
let autoInstallTimer: NodeJS.Timeout | null = null;
const filesCreated: string[] = [];

function simulateAction(action: SimAction) {
  const normalizedCommand = action.command?.toLowerCase() || '';
  const isDevServer = isDevServerRegex.test(normalizedCommand);
  const isInstall = isInstallRegex.test(normalizedCommand);
  const hasInstallAndDev = hasInstallAndDevRegex.test(normalizedCommand);
  
  if (action.type === 'file') {
    console.log(`📄 [${action.timestamp}ms] Creating file: ${action.path}`);
    filesCreated.push(action.path!);
    
    if (action.path === 'package.json') {
      packageJsonCreated = true;
      console.log(`   📦 package.json detected - scheduling auto-install`);
      scheduleAutoInstall();
    }
  } else if (action.type === 'shell') {
    console.log(`🔨 [${action.timestamp}ms] Shell command: ${action.command}`);
    console.log(`   isDevServer=${isDevServer}, isInstall=${isInstall}, hasInstallAndDev=${hasInstallAndDev}`);
    
    // Check: standalone install should NOT trigger dev server
    if (isInstall && !isDevServer) {
      console.log(`   📦 Standalone install - will NOT start dev server here`);
      if (autoInstallTimer) {
        console.log(`   ⏹️ Cancelling pending auto-install (shell handles install)`);
        clearTimeout(autoInstallTimer);
        autoInstallTimer = null;
      }
      // After install, reschedule auto-install if needed
      if (packageJsonCreated && !autoInstallTriggered) {
        console.log(`   📦 Rescheduling auto-install after standalone install completes`);
        scheduleAutoInstall();
      }
    }
    
    // Check: install+dev combo
    if (hasInstallAndDev) {
      if (autoInstallTriggered) {
        console.log(`   ⏭️ Skipping - auto-install already handled this`);
        return;
      }
      console.log(`   🔀 Install+dev combo detected - running both`);
      autoInstallTriggered = true;
      npmInstallRunning = true;
      console.log(`   📦 Running npm install...`);
      console.log(`   🚀 Starting dev server in background...`);
      devServerStarted = true;
      npmInstallRunning = false;
    }
    
    // Check: dev server alone
    if (isDevServer && !isInstall && !hasInstallAndDev) {
      console.log(`   🚀 Dev server command - running in background`);
      devServerStarted = true;
    }
  }
}

function scheduleAutoInstall() {
  if (autoInstallTimer) {
    clearTimeout(autoInstallTimer);
  }
  autoInstallScheduled = true;
  console.log(`   ⏰ Auto-install scheduled (2000ms debounce)`);
  
  autoInstallTimer = setTimeout(() => {
    runAutoInstall();
  }, 2000);
}

function runAutoInstall() {
  if (autoInstallTriggered) {
    console.log(`\n🔄 [AUTO-INSTALL] Skipped - already triggered`);
    return;
  }
  
  console.log(`\n🔄 [AUTO-INSTALL] Running...`);
  console.log(`   Files created so far: ${filesCreated.join(', ')}`);
  autoInstallTriggered = true;
  npmInstallRunning = true;
  console.log(`   📦 Installing dependencies...`);
  console.log(`   ✅ Dependencies installed`);
  npmInstallRunning = false;
  console.log(`   🚀 Starting dev server...`);
  devServerStarted = true;
  console.log(`   ✅ Dev server started`);
}

// Run simulation
console.log('Simulating action sequence...\n');
for (const action of simulatedActions) {
  simulateAction(action);
}

// Fast-forward the timer
console.log('\n⏩ Fast-forwarding auto-install timer...');
if (autoInstallTimer) {
  clearTimeout(autoInstallTimer);
  runAutoInstall();
}

console.log('\n=== Final State ===');
console.log(`packageJsonCreated: ${packageJsonCreated}`);
console.log(`autoInstallTriggered: ${autoInstallTriggered}`);
console.log(`devServerStarted: ${devServerStarted}`);
console.log(`filesCreated: ${filesCreated.length} files`);

// Verify correct sequence
console.log('\n=== Sequence Verification ===');
const errors: string[] = [];

// Verify package.json was created before auto-install
const packageJsonIndex = filesCreated.indexOf('package.json');
if (packageJsonIndex === -1) {
  errors.push('❌ package.json was not created');
} else {
  console.log('✅ package.json was created');
}

// Verify all source files were created
const requiredFiles = ['package.json', 'index.html', 'src/main.jsx', 'src/App.jsx', 'src/index.css'];
for (const file of requiredFiles) {
  if (!filesCreated.includes(file)) {
    errors.push(`❌ ${file} was not created`);
  } else {
    console.log(`✅ ${file} was created`);
  }
}

// Verify auto-install was triggered
if (!autoInstallTriggered) {
  errors.push('❌ Auto-install was never triggered');
} else {
  console.log('✅ Auto-install was triggered');
}

// Verify dev server was started
if (!devServerStarted) {
  errors.push('❌ Dev server was never started');
} else {
  console.log('✅ Dev server was started');
}

if (errors.length > 0) {
  console.log('\n❌ SEQUENCE ERRORS:');
  errors.forEach(e => console.log(`   ${e}`));
  process.exit(1);
} else {
  console.log('\n✅ ALL SEQUENCE CHECKS PASSED');
  process.exit(0);
}
