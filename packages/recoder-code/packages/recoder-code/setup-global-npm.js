#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🔧 Setting up recoder-code for global usage...\n');

try {
  // Check if running on macOS with Homebrew
  if (process.platform === 'darwin') {
    try {
      execSync('which brew', { stdio: 'ignore' });
      console.log('✅ Homebrew detected on macOS');
      
      // Set npm prefix to homebrew
      const homebrewPrefix = execSync('brew --prefix', { encoding: 'utf8' }).trim();
      console.log(`📍 Setting npm prefix to: ${homebrewPrefix}`);
      
      execSync(`npm config set prefix ${homebrewPrefix}`);
      console.log('✅ npm prefix configured');
      
      // Verify the bin directory is in PATH
      const globalBinPath = path.join(homebrewPrefix, 'bin');
      const currentPath = process.env.PATH || '';
      
      if (currentPath.includes(globalBinPath)) {
        console.log('✅ Homebrew bin directory already in PATH');
      } else {
        console.log('⚠️  Adding Homebrew bin to PATH...');
        
        // Determine shell config file
        const shell = process.env.SHELL || '';
        let configFile = '.bashrc';
        
        if (shell.includes('zsh')) {
          configFile = '.zshrc';
        } else if (shell.includes('fish')) {
          configFile = '.config/fish/config.fish';
        }
        
        const configPath = path.join(os.homedir(), configFile);
        const exportLine = `export PATH="${globalBinPath}:$PATH"`;
        
        // Check if line already exists
        if (fs.existsSync(configPath)) {
          const content = fs.readFileSync(configPath, 'utf8');
          if (!content.includes(exportLine) && !content.includes(globalBinPath)) {
            fs.appendFileSync(configPath, `\n# Added by recoder-code setup\n${exportLine}\n`);
            console.log(`✅ Added PATH export to ${configFile}`);
          }
        } else {
          fs.writeFileSync(configPath, `# Added by recoder-code setup\n${exportLine}\n`);
          console.log(`✅ Created ${configFile} with PATH export`);
        }
      }
      
    } catch (error) {
      console.log('⚠️  Homebrew not found, using default npm configuration');
      setupDefault();
    }
  } else {
    setupDefault();
  }
  
  console.log('\n🚀 Installing recoder-code globally...');
  execSync('npm install -g recoder-code@latest', { stdio: 'inherit' });
  
  console.log('\n✅ Setup complete!');
  console.log('\n🎉 Test it now:');
  console.log('   recoder-code --help');
  console.log('   recoder-code "Hello world"');
  console.log('\n💡 If command not found, restart your terminal or run:');
  console.log('   source ~/.zshrc  # or your shell config file');
  
} catch (error) {
  console.error('❌ Setup failed:', error.message);
  console.log('\n💡 Manual setup:');
  console.log('1. npm config set prefix $(brew --prefix)  # macOS with Homebrew');
  console.log('2. npm install -g recoder-code');
  console.log('3. Restart terminal');
  process.exit(1);
}

function setupDefault() {
  console.log('📍 Using default npm configuration');
  const npmPrefix = execSync('npm config get prefix', { encoding: 'utf8' }).trim();
  const globalBinPath = path.join(npmPrefix, 'bin');
  
  console.log(`📍 Global bin directory: ${globalBinPath}`);
  
  // Check if in PATH
  const currentPath = process.env.PATH || '';
  if (!currentPath.includes(globalBinPath)) {
    console.log('⚠️  Global bin directory not in PATH');
    console.log(`💡 Add this to your shell config: export PATH="${globalBinPath}:$PATH"`);
  }
}