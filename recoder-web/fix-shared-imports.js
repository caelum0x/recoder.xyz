const fs = require('fs');
const path = require('path');

const providersDir = '/Users/arhansubasi/recoder.xyz/recoder-web/lib/api/providers';

// Get all TypeScript files in the providers directory
const files = fs.readdirSync(providersDir)
  .filter(file => file.endsWith('.ts'))
  .map(file => path.join(providersDir, file));

let totalReplaced = 0;

for (const filePath of files) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Replace @recoder/shared imports with relative path to browser-safe shared
    content = content.replace(/from "@recoder\/shared"/g, 'from "../../shared"');
    content = content.replace(/import "@recoder\/shared"/g, 'import "../../shared"');
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content);
      console.log(`Fixed imports in: ${path.basename(filePath)}`);
      totalReplaced++;
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
  }
}

console.log(`\nTotal files updated: ${totalReplaced}`);