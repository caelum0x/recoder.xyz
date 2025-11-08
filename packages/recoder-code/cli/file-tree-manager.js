#!/usr/bin/env node

/**
 * File Tree Manager - Complete project structure tracking like OpenCode
 * Scans, caches, and maintains project file tree
 */

const fs = require('fs');
const path = require('path');
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const ignore = require('ignore');

class FileTreeManager {
  constructor(rootDirectory) {
    this.rootDirectory = rootDirectory || process.cwd();
    this.fileTree = null;
    this.fileIndex = new Map(); // Fast file lookup
    this.directoryIndex = new Map(); // Fast directory lookup
    this.lastScan = null;
    this.ignoreRules = null;
    
    // Performance settings
    this.maxDepth = 10;
    this.maxFiles = 10000;
    this.scanTimeout = 30000; // 30 seconds
    
    // Load gitignore rules
    this.loadIgnoreRules();
  }

  /**
   * Load .gitignore rules
   */
  loadIgnoreRules() {
    const gitignorePath = path.join(this.rootDirectory, '.gitignore');
    this.ignoreRules = ignore();
    
    // Default ignores
    this.ignoreRules.add([
      'node_modules/**',
      '.git/**',
      'dist/**',
      'build/**',
      '.next/**',
      'out/**',
      'coverage/**',
      '.cache/**',
      '.vscode/**',
      '.idea/**',
      '*.log',
      '.DS_Store',
      'npm-debug.log*',
      'yarn-debug.log*',
      'yarn-error.log*'
    ]);
    
    // Load project-specific .gitignore
    if (fs.existsSync(gitignorePath)) {
      try {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        this.ignoreRules.add(gitignoreContent);
      } catch (error) {
        console.error(chalk.yellow(`⚠️  Could not load .gitignore: ${error.message}`));
      }
    }
  }

  /**
   * Check if path should be ignored
   */
  shouldIgnore(relativePath) {
    // Always ignore certain patterns
    if (relativePath.includes('node_modules') || 
        relativePath.includes('.git/') ||
        relativePath.startsWith('.')) {
      return true;
    }
    
    return this.ignoreRules.ignores(relativePath);
  }

  /**
   * Scan entire project and build file tree
   */
  async scan() {
    console.log(chalk.blue('🔍 Scanning project structure...'));
    const startTime = Date.now();
    
    this.fileIndex.clear();
    this.directoryIndex.clear();
    
    try {
      const tree = await this.scanDirectory(this.rootDirectory, 0);
      
      this.fileTree = {
        name: path.basename(this.rootDirectory),
        path: '.',
        absolutePath: this.rootDirectory,
        type: 'directory',
        children: tree.children,
        stats: tree.stats
      };
      
      this.lastScan = Date.now();
      
      const duration = Date.now() - startTime;
      console.log(chalk.green(`✅ Scanned ${this.fileIndex.size} files and ${this.directoryIndex.size} directories in ${duration}ms`));
      
      return this.fileTree;
    } catch (error) {
      console.error(chalk.red(`❌ File tree scan failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Recursively scan directory
   */
  async scanDirectory(dirPath, depth) {
    if (depth > this.maxDepth) {
      return { children: [], stats: { files: 0, directories: 0, totalSize: 0 } };
    }

    const children = [];
    const stats = { files: 0, directories: 0, totalSize: 0 };

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const absolutePath = path.join(dirPath, entry.name);
        const relativePath = path.relative(this.rootDirectory, absolutePath);

        // Check ignore rules
        if (this.shouldIgnore(relativePath)) {
          continue;
        }

        // Check file count limit
        if (this.fileIndex.size + this.directoryIndex.size >= this.maxFiles) {
          console.log(chalk.yellow(`⚠️  Reached max file limit (${this.maxFiles}), stopping scan`));
          break;
        }

        try {
          const stat = fs.statSync(absolutePath);

          if (entry.isDirectory()) {
            // Scan subdirectory
            const subTree = await this.scanDirectory(absolutePath, depth + 1);
            
            const dirNode = {
              name: entry.name,
              path: relativePath,
              absolutePath: absolutePath,
              type: 'directory',
              children: subTree.children,
              stats: subTree.stats,
              ignored: false
            };

            children.push(dirNode);
            this.directoryIndex.set(relativePath, dirNode);
            
            stats.directories++;
            stats.files += subTree.stats.files;
            stats.directories += subTree.stats.directories;
            stats.totalSize += subTree.stats.totalSize;

          } else if (entry.isFile()) {
            // Add file node
            const fileNode = {
              name: entry.name,
              path: relativePath,
              absolutePath: absolutePath,
              type: 'file',
              extension: path.extname(entry.name),
              size: stat.size,
              modified: stat.mtime,
              ignored: false
            };

            children.push(fileNode);
            this.fileIndex.set(relativePath, fileNode);
            
            stats.files++;
            stats.totalSize += stat.size;
          }
        } catch (error) {
          // Skip files we can't access
          continue;
        }
      }
    } catch (error) {
      console.error(chalk.yellow(`⚠️  Could not read directory ${dirPath}: ${error.message}`));
    }

    return { children, stats };
  }

  /**
   * Get file tree
   */
  getTree() {
    return this.fileTree;
  }

  /**
   * Get all files (flat list)
   */
  getAllFiles() {
    return Array.from(this.fileIndex.values());
  }

  /**
   * Get all directories (flat list)
   */
  getAllDirectories() {
    return Array.from(this.directoryIndex.values());
  }

  /**
   * Find file by path
   */
  findFile(filePath) {
    const relativePath = path.relative(this.rootDirectory, filePath);
    return this.fileIndex.get(relativePath);
  }

  /**
   * Find directory by path
   */
  findDirectory(dirPath) {
    const relativePath = path.relative(this.rootDirectory, dirPath);
    return this.directoryIndex.get(relativePath);
  }

  /**
   * Search files by name (fuzzy)
   */
  searchFiles(query, limit = 20) {
    const normalizedQuery = query.toLowerCase();
    const results = [];

    for (const [path, node] of this.fileIndex) {
      if (node.name.toLowerCase().includes(normalizedQuery)) {
        results.push({
          ...node,
          score: this.calculateRelevanceScore(node.name, normalizedQuery)
        });
      }

      if (results.length >= limit * 2) break; // Get more for sorting
    }

    // Sort by relevance and limit
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Calculate relevance score for search
   */
  calculateRelevanceScore(filename, query) {
    let score = 0;
    const lowerFilename = filename.toLowerCase();
    const lowerQuery = query.toLowerCase();

    // Exact match
    if (lowerFilename === lowerQuery) score += 100;
    
    // Starts with query
    if (lowerFilename.startsWith(lowerQuery)) score += 50;
    
    // Contains query
    if (lowerFilename.includes(lowerQuery)) score += 25;
    
    // Shorter filenames rank higher (likely more specific)
    score -= filename.length * 0.1;

    return score;
  }

  /**
   * Get files by extension
   */
  getFilesByExtension(extension) {
    const ext = extension.startsWith('.') ? extension : '.' + extension;
    return Array.from(this.fileIndex.values()).filter(node => node.extension === ext);
  }

  /**
   * Get directory contents
   */
  getDirectoryContents(dirPath) {
    const relativePath = path.relative(this.rootDirectory, dirPath);
    const dirNode = this.directoryIndex.get(relativePath);
    
    if (!dirNode) {
      return null;
    }

    return dirNode.children;
  }

  /**
   * Get file tree as formatted string
   */
  formatTree(options = {}) {
    const { maxDepth = 3, showFiles = true, showSize = false } = options;
    
    if (!this.fileTree) {
      return 'No file tree available. Run scan() first.';
    }

    const lines = [];
    
    const formatNode = (node, prefix = '', depth = 0) => {
      if (depth > maxDepth) return;

      const isLast = false; // Simplified - could track this properly
      const connector = '├── ';
      const icon = node.type === 'directory' ? '📁' : this.getFileIcon(node.extension);
      
      let line = `${prefix}${connector}${icon} ${node.name}`;
      
      if (showSize && node.size) {
        line += ` (${this.formatSize(node.size)})`;
      }
      
      lines.push(line);

      if (node.type === 'directory' && node.children && depth < maxDepth) {
        const newPrefix = prefix + '│   ';
        for (const child of node.children) {
          if (child.type === 'directory' || showFiles) {
            formatNode(child, newPrefix, depth + 1);
          }
        }
      }
    };

    lines.push(`📁 ${this.fileTree.name}`);
    if (this.fileTree.children) {
      for (const child of this.fileTree.children) {
        formatNode(child, '', 0);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get icon for file type
   */
  getFileIcon(extension) {
    const icons = {
      '.js': '📜',
      '.ts': '📘',
      '.jsx': '⚛️',
      '.tsx': '⚛️',
      '.json': '📋',
      '.md': '📝',
      '.py': '🐍',
      '.java': '☕',
      '.go': '🔷',
      '.rs': '🦀',
      '.html': '🌐',
      '.css': '🎨',
      '.yml': '⚙️',
      '.yaml': '⚙️',
      '.xml': '📰',
      '.sql': '🗄️',
      '.sh': '🔧',
      '.txt': '📄'
    };

    return icons[extension] || '📄';
  }

  /**
   * Format file size
   */
  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  /**
   * Get project statistics
   */
  getStats() {
    if (!this.fileTree) {
      return null;
    }

    const extensions = {};
    for (const node of this.fileIndex.values()) {
      const ext = node.extension || 'no-extension';
      extensions[ext] = (extensions[ext] || 0) + 1;
    }

    return {
      totalFiles: this.fileIndex.size,
      totalDirectories: this.directoryIndex.size,
      totalSize: this.fileTree.stats.totalSize,
      extensions: extensions,
      lastScan: this.lastScan,
      rootDirectory: this.rootDirectory
    };
  }

  /**
   * Refresh file tree (incremental update)
   */
  async refresh() {
    console.log(chalk.blue('🔄 Refreshing file tree...'));
    return await this.scan();
  }

  /**
   * Export file tree as JSON
   */
  export() {
    return {
      tree: this.fileTree,
      files: Array.from(this.fileIndex.entries()),
      directories: Array.from(this.directoryIndex.entries()),
      stats: this.getStats()
    };
  }

  /**
   * Find files by glob pattern (simplified)
   * Pattern support like: *.js, **\/*.test.js, etc.
   */
  findFiles(pattern) {
    const results = [];
    
    // Convert glob pattern to regex
    let regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(regexPattern, 'i');
    
    for (const [filepath, node] of this.fileIndex) {
      if (regex.test(filepath) || regex.test(node.name)) {
        results.push(node);
      }
    }
    
    return results;
  }

  /**
   * Get file information by path
   */
  getFileInfo(filePath) {
    const relativePath = path.relative(this.rootDirectory, filePath);
    const node = this.fileIndex.get(relativePath);
    
    if (!node) {
      return null;
    }
    
    return {
      ...node,
      relativePath: relativePath,
      exists: fs.existsSync(filePath)
    };
  }
}

module.exports = FileTreeManager;
