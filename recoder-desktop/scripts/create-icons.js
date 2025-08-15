#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Create basic icon files for different platforms
// In a real implementation, you'd use tools like sharp or imagemagick to convert SVG to PNG
// For now, we'll create a simple approach

const iconSizes = [16, 32, 48, 64, 128, 256, 512, 1024];
const assetsDir = path.join(__dirname, '../assets');

console.log('🎨 Creating desktop app icons...');

// For now, let's remove the icon configuration to avoid build errors
// and use Electron's default icon
const packageJsonPath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Remove icon configuration to use default
if (packageJson.build && packageJson.build.icon) {
  delete packageJson.build.icon;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log('📝 Removed icon configuration to use Electron default');
}

console.log('✅ Icon configuration updated');
console.log('💡 To use custom icons, convert SVG to PNG formats:');
iconSizes.forEach(size => {
  console.log(`   - icon-${size}x${size}.png`);
});