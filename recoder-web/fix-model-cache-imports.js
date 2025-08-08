const fs = require('fs');

const files = [
  '/Users/arhansubasi/recoder.xyz/recoder-web/lib/api/providers/kilocode-openrouter.ts',
  '/Users/arhansubasi/recoder.xyz/recoder-web/lib/api/providers/requesty.ts',
  '/Users/arhansubasi/recoder.xyz/recoder-web/lib/api/providers/openrouter.ts',
  '/Users/arhansubasi/recoder.xyz/recoder-web/lib/api/providers/router-provider.ts'
];

let totalReplaced = 0;

for (const filePath of files) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Replace modelCache imports with browser-safe version
    content = content.replace(/from "\.\/fetchers\/modelCache"/g, 'from "./fetchers/modelCache-browser"');
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content);
      console.log(`Fixed modelCache import in: ${filePath.split('/').pop()}`);
      totalReplaced++;
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
  }
}

console.log(`\nTotal files updated: ${totalReplaced}`);