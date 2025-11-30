const fs = require('fs');
const path = require('path');

class DragDropHandler {
  static async processInput(input) {
    const filePaths = this.extractFilePaths(input);
    if (filePaths.length === 0) return input;

    const fileContents = [];
    for (const filePath of filePaths) {
      const content = await this.readFileOrFolder(filePath);
      if (content) fileContents.push(content);
    }

    return fileContents.length > 0 
      ? `${input}\n\n${fileContents.join('\n\n')}`
      : input;
  }

  static extractFilePaths(input) {
    const paths = [];
    const pathRegex = /(?:^|\s)([\/~][\w\-\.\/]+|[A-Z]:\\[\w\-\.\\]+|\.[\/\\][\w\-\.\/\\]+)/g;
    let match;
    
    while ((match = pathRegex.exec(input)) !== null) {
      const potentialPath = match[1].trim();
      if (fs.existsSync(potentialPath)) {
        paths.push(potentialPath);
      }
    }
    
    return paths;
  }

  static async readFileOrFolder(filePath) {
    const stats = fs.statSync(filePath);
    
    if (stats.isFile()) {
      return this.readFile(filePath);
    } else if (stats.isDirectory()) {
      return this.readFolder(filePath);
    }
    return null;
  }

  static readFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const size = fs.statSync(filePath).size;
      
      if (size > 1024 * 1024) { // 1MB limit
        return `\n--- ${filePath} (too large: ${(size / 1024 / 1024).toFixed(2)}MB) ---`;
      }
      
      return `\n--- ${filePath} ---\n${content}`;
    } catch (err) {
      return `\n--- ${filePath} (error: ${err.message}) ---`;
    }
  }

  static readFolder(folderPath, maxDepth = 2, currentDepth = 0) {
    if (currentDepth >= maxDepth) return '';
    
    try {
      const files = fs.readdirSync(folderPath);
      const contents = [`\n--- Folder: ${folderPath} ---`];
      
      for (const file of files.slice(0, 10)) { // Max 10 files
        const fullPath = path.join(folderPath, file);
        const stats = fs.statSync(fullPath);
        
        if (stats.isFile() && stats.size < 100 * 1024) { // 100KB limit per file
          contents.push(this.readFile(fullPath));
        }
      }
      
      return contents.join('\n');
    } catch (err) {
      return `\n--- ${folderPath} (error: ${err.message}) ---`;
    }
  }
}

module.exports = DragDropHandler;
