#!/usr/bin/env node

/**
 * Folder Hierarchy Manager
 * Tracks and manages folder structure throughout the conversation
 */

const fs = require('fs');
const path = require('path');
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

class FolderHierarchy {
  constructor(rootDirectory) {
    this.rootDirectory = rootDirectory || process.cwd();
    this.folders = new Map(); // Track all folders
    this.createdInSession = new Set(); // Folders created during session
    this.hierarchy = null; // Nested hierarchy structure
  }

  /**
   * Initialize folder hierarchy from file tree
   */
  initialize(fileTree) {
    this.folders.clear();
    this.hierarchy = this.buildHierarchy(fileTree);
    return this.hierarchy;
  }

  /**
   * Build nested hierarchy from file tree
   */
  buildHierarchy(node, parentPath = '') {
    if (!node) return null;

    const folderNode = {
      name: node.name,
      path: node.path,
      absolutePath: node.absolutePath,
      children: [],
      files: [],
      subdirectories: [],
      stats: {
        totalFiles: 0,
        totalSubdirs: 0,
        depth: parentPath.split('/').length
      }
    };

    // Track in map
    this.folders.set(node.path, folderNode);

    if (node.children) {
      for (const child of node.children) {
        if (child.type === 'directory') {
          const subdir = this.buildHierarchy(child, node.path);
          folderNode.subdirectories.push(subdir);
          folderNode.children.push(subdir);
          folderNode.stats.totalSubdirs++;
          folderNode.stats.totalFiles += subdir.stats.totalFiles;
        } else if (child.type === 'file') {
          folderNode.files.push({
            name: child.name,
            path: child.path,
            extension: child.extension,
            size: child.size
          });
          folderNode.children.push(child);
          folderNode.stats.totalFiles++;
        }
      }
    }

    return folderNode;
  }

  /**
   * Track folder creation
   */
  trackCreation(folderPath) {
    const relativePath = path.relative(this.rootDirectory, folderPath);
    this.createdInSession.add(relativePath);

    // Add to folders map if not exists
    if (!this.folders.has(relativePath)) {
      const absolutePath = path.isAbsolute(folderPath) ? folderPath : path.join(this.rootDirectory, folderPath);
      
      this.folders.set(relativePath, {
        name: path.basename(folderPath),
        path: relativePath,
        absolutePath: absolutePath,
        children: [],
        files: [],
        subdirectories: [],
        stats: {
          totalFiles: 0,
          totalSubdirs: 0,
          depth: relativePath.split('/').length
        },
        created: Date.now()
      });
    }

    console.log(chalk.green(`📁 Tracked folder creation: ${relativePath}`));
  }

  /**
   * Get folder info
   */
  getFolder(folderPath) {
    const relativePath = path.relative(this.rootDirectory, folderPath);
    return this.folders.get(relativePath);
  }

  /**
   * Get all folders
   */
  getAllFolders() {
    return Array.from(this.folders.values());
  }

  /**
   * Get folders created in current session
   */
  getSessionFolders() {
    return Array.from(this.createdInSession).map(path => this.folders.get(path));
  }

  /**
   * Get folder tree as formatted string
   */
  formatHierarchy(options = {}) {
    const { maxDepth = 4, showFiles = false, highlightCreated = true } = options;

    if (!this.hierarchy) {
      return 'No folder hierarchy available. Initialize first.';
    }

    const lines = [];

    const formatNode = (node, prefix = '', depth = 0, isLast = false) => {
      if (depth > maxDepth) return;

      const connector = isLast ? '└── ' : '├── ';
      const isCreated = this.createdInSession.has(node.path);
      const icon = '📁';
      const name = isCreated && highlightCreated ? chalk.green(node.name + ' (new)') : node.name;

      lines.push(`${prefix}${connector}${icon} ${name}`);

      if (node.subdirectories && node.subdirectories.length > 0) {
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        node.subdirectories.forEach((child, index) => {
          const childIsLast = index === node.subdirectories.length - 1 && !showFiles;
          formatNode(child, newPrefix, depth + 1, childIsLast);
        });
      }

      if (showFiles && node.files && node.files.length > 0) {
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        node.files.forEach((file, index) => {
          const fileIsLast = index === node.files.length - 1;
          const fileConnector = fileIsLast ? '└── ' : '├── ';
          lines.push(`${newPrefix}${fileConnector}📄 ${file.name}`);
        });
      }
    };

    lines.push(`📁 ${this.hierarchy.name}`);
    if (this.hierarchy.subdirectories) {
      this.hierarchy.subdirectories.forEach((child, index) => {
        const isLast = index === this.hierarchy.subdirectories.length - 1;
        formatNode(child, '', 0, isLast);
      });
    }

    return lines.join('\n');
  }

  /**
   * Get folder path relative to parent
   */
  getRelativePath(folderPath, parentPath = null) {
    if (!parentPath) {
      return path.relative(this.rootDirectory, folderPath);
    }
    return path.relative(parentPath, folderPath);
  }

  /**
   * Check if folder exists
   */
  exists(folderPath) {
    const relativePath = path.relative(this.rootDirectory, folderPath);
    return this.folders.has(relativePath);
  }

  /**
   * Get folder depth
   */
  getDepth(folderPath) {
    const folder = this.getFolder(folderPath);
    return folder ? folder.stats.depth : 0;
  }

  /**
   * Get parent folder
   */
  getParent(folderPath) {
    const parentPath = path.dirname(folderPath);
    if (parentPath === folderPath || parentPath === '.') {
      return null;
    }
    return this.getFolder(parentPath);
  }

  /**
   * Get children folders
   */
  getChildren(folderPath) {
    const folder = this.getFolder(folderPath);
    return folder ? folder.subdirectories : [];
  }

  /**
   * Get all files in folder (non-recursive)
   */
  getFiles(folderPath) {
    const folder = this.getFolder(folderPath);
    return folder ? folder.files : [];
  }

  /**
   * Get folder stats
   */
  getStats() {
    return {
      totalFolders: this.folders.size,
      createdInSession: this.createdInSession.size,
      maxDepth: Math.max(...Array.from(this.folders.values()).map(f => f.stats.depth)),
      folders: Array.from(this.createdInSession)
    };
  }

  /**
   * Build context string for AI
   */
  buildContextString() {
    const stats = this.getStats();
    const lines = [];

    lines.push('### Folder Hierarchy');
    lines.push('');

    if (this.createdInSession.size > 0) {
      lines.push('**Folders Created in This Session:**');
      for (const folderPath of this.createdInSession) {
        const folder = this.folders.get(folderPath);
        if (folder) {
          lines.push(`- \`${folderPath}\` (${folder.stats.totalFiles} files)`);
        }
      }
      lines.push('');
    }

    lines.push('**Project Structure:**');
    lines.push('```');
    lines.push(this.formatHierarchy({ maxDepth: 3, showFiles: false, highlightCreated: false }));
    lines.push('```');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Export hierarchy
   */
  export() {
    return {
      hierarchy: this.hierarchy,
      folders: Array.from(this.folders.entries()),
      createdInSession: Array.from(this.createdInSession),
      stats: this.getStats()
    };
  }

  /**
   * Clear session tracking
   */
  clearSession() {
    this.createdInSession.clear();
  }

  /**
   * Get important folders (commonly referenced patterns)
   */
  getImportantFolders() {
    const important = [];
    const importantPatterns = [
      'src', 'lib', 'api', 'cli', 'components', 'pages', 'routes',
      'models', 'controllers', 'services', 'utils', 'helpers',
      'config', 'tests', 'test', '__tests__', 'spec', 'docs',
      'public', 'static', 'assets', 'styles', 'css'
    ];

    for (const [folderPath, folder] of this.folders) {
      const folderName = path.basename(folderPath);
      
      // Check if folder matches important pattern
      if (importantPatterns.includes(folderName.toLowerCase())) {
        important.push({
          path: folderPath,
          name: folderName,
          fileCount: folder.stats.totalFiles,
          depth: folder.stats.depth
        });
      }
      
      // Also include folders with many files
      if (folder.stats.totalFiles > 10) {
        if (!important.find(f => f.path === folderPath)) {
          important.push({
            path: folderPath,
            name: folderName,
            fileCount: folder.stats.totalFiles,
            depth: folder.stats.depth,
            reason: 'high_file_count'
          });
        }
      }
    }

    // Sort by depth (shallower first) and file count
    return important.sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return b.fileCount - a.fileCount;
    });
  }

  /**
   * Get detailed folder information
   */
  getFolderInfo(folderPath) {
    const relativePath = path.relative(this.rootDirectory, folderPath);
    const folder = this.folders.get(relativePath);
    
    if (!folder) {
      return null;
    }

    return {
      path: relativePath,
      absolutePath: folderPath,
      name: path.basename(folderPath),
      fileCount: folder.stats.totalFiles,
      directoryCount: folder.subdirectories.length,
      depth: folder.stats.depth,
      totalSize: folder.stats.totalSize,
      files: folder.files,
      subdirectories: folder.subdirectories,
      created: this.createdInSession.has(relativePath)
    };
  }
}

module.exports = FolderHierarchy;
