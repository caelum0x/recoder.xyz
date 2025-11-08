#!/usr/bin/env node

/**
 * Advanced Search - Fast code search using ripgrep (if available) or native Node
 * Provides powerful search capabilities for finding code patterns
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

class AdvancedSearch {
  constructor(rootDirectory) {
    this.rootDirectory = rootDirectory || process.cwd();
    
    // Check if ripgrep is available
    this.hasRipgrep = this.checkRipgrep();
    
    // Default ignore patterns
    this.ignorePatterns = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.next',
      'out',
      'coverage',
      '.cache',
      '*.log',
      'package-lock.json',
      'yarn.lock'
    ];

    // Search history
    this.searchHistory = [];
  }

  /**
   * Check if ripgrep is available
   */
  checkRipgrep() {
    try {
      execSync('rg --version', { stdio: 'pipe' });
      console.log(chalk.gray('✓ Ripgrep found - using fast search'));
      return true;
    } catch (error) {
      console.log(chalk.gray('✓ Using native search (install ripgrep for faster results)'));
      return false;
    }
  }

  /**
   * Search for pattern using ripgrep (fast) or fallback to native
   */
  async search(pattern, options = {}) {
    const {
      filePattern = '*',
      caseSensitive = false,
      wholeWord = false,
      regex = false,
      maxResults = 100,
      context = 2,
      includeHidden = false
    } = options;

    const startTime = Date.now();

    let results;
    if (this.hasRipgrep) {
      results = await this.ripgrepSearch(pattern, options);
    } else {
      results = await this.nativeSearch(pattern, options);
    }

    const duration = Date.now() - startTime;

    const searchRecord = {
      pattern,
      options,
      results: results.length,
      duration,
      timestamp: Date.now()
    };

    this.searchHistory.push(searchRecord);

    return {
      pattern,
      results: results.slice(0, maxResults),
      totalResults: results.length,
      duration,
      truncated: results.length > maxResults
    };
  }

  /**
   * Search using ripgrep (fastest)
   */
  async ripgrepSearch(pattern, options = {}) {
    return new Promise((resolve, reject) => {
      const args = [
        '--json',
        '--line-number',
        '--column',
        '--no-heading',
        '--with-filename'
      ];

      // Add options
      if (!options.caseSensitive) {
        args.push('--ignore-case');
      }

      if (options.wholeWord) {
        args.push('--word-regexp');
      }

      if (!options.regex) {
        args.push('--fixed-strings');
      }

      if (options.context) {
        args.push('--context', options.context.toString());
      }

      if (options.filePattern && options.filePattern !== '*') {
        args.push('--glob', options.filePattern);
      }

      // Add ignore patterns
      for (const ignorePattern of this.ignorePatterns) {
        args.push('--glob', `!${ignorePattern}`);
      }

      args.push(pattern);
      args.push(this.rootDirectory);

      const results = [];
      const rg = spawn('rg', args);

      let buffer = '';
      rg.stdout.on('data', (data) => {
        buffer += data.toString();
        
        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const json = JSON.parse(line);
            
            if (json.type === 'match') {
              const result = {
                file: path.relative(this.rootDirectory, json.data.path.text),
                line: json.data.line_number,
                column: json.data.submatches[0]?.start || 0,
                content: json.data.lines.text.trim(),
                match: json.data.submatches[0]?.match?.text || pattern
              };
              results.push(result);
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      });

      rg.stderr.on('data', (data) => {
        // Ignore stderr for now
      });

      rg.on('close', (code) => {
        resolve(results);
      });

      rg.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Native Node.js search (slower but works everywhere)
   */
  async nativeSearch(pattern, options = {}) {
    const results = [];
    const searchPattern = options.regex 
      ? new RegExp(pattern, options.caseSensitive ? '' : 'i')
      : null;

    const searchText = options.caseSensitive ? pattern : pattern.toLowerCase();

    const searchInFile = (filePath) => {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          let found = false;
          let match = pattern;

          if (searchPattern) {
            const regexMatch = line.match(searchPattern);
            if (regexMatch) {
              found = true;
              match = regexMatch[0];
            }
          } else {
            const searchLine = options.caseSensitive ? line : line.toLowerCase();
            
            if (options.wholeWord) {
              const wordPattern = new RegExp(`\\b${searchText}\\b`, 'i');
              if (wordPattern.test(searchLine)) {
                found = true;
              }
            } else {
              if (searchLine.includes(searchText)) {
                found = true;
              }
            }
          }

          if (found) {
            const column = line.toLowerCase().indexOf(searchText.toLowerCase());
            results.push({
              file: path.relative(this.rootDirectory, filePath),
              line: index + 1,
              column: column >= 0 ? column : 0,
              content: line.trim(),
              match
            });
          }
        });
      } catch (error) {
        // Skip files that can't be read
      }
    };

    const scanDirectory = (dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(this.rootDirectory, fullPath);

          // Check ignore patterns
          const shouldIgnore = this.ignorePatterns.some(pattern => {
            return relativePath.includes(pattern);
          });

          if (shouldIgnore) continue;

          if (entry.isDirectory()) {
            scanDirectory(fullPath);
          } else if (entry.isFile()) {
            // Check file pattern
            if (options.filePattern && options.filePattern !== '*') {
              const glob = new RegExp(options.filePattern.replace(/\*/g, '.*'));
              if (!glob.test(entry.name)) continue;
            }

            searchInFile(fullPath);
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    };

    scanDirectory(this.rootDirectory);
    return results;
  }

  /**
   * Find files by name
   */
  async findFile(filename, options = {}) {
    const { fuzzy = true, maxResults = 50 } = options;
    
    if (this.hasRipgrep) {
      return this.ripgrepFindFile(filename, options);
    } else {
      return this.nativeFindFile(filename, options);
    }
  }

  /**
   * Find file using ripgrep
   */
  async ripgrepFindFile(filename, options = {}) {
    return new Promise((resolve, reject) => {
      const args = [
        '--files',
        '--glob', `*${filename}*`,
        this.rootDirectory
      ];

      // Add ignore patterns
      for (const ignorePattern of this.ignorePatterns) {
        args.push('--glob', `!${ignorePattern}`);
      }

      let output = '';
      const rg = spawn('rg', args);

      rg.stdout.on('data', (data) => {
        output += data.toString();
      });

      rg.on('close', () => {
        const files = output
          .split('\n')
          .filter(f => f.trim())
          .map(f => path.relative(this.rootDirectory, f))
          .slice(0, options.maxResults || 50);

        resolve(files);
      });

      rg.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Find file using native Node
   */
  async nativeFindFile(filename, options = {}) {
    const results = [];
    const searchName = filename.toLowerCase();

    const scanDirectory = (dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(this.rootDirectory, fullPath);

          // Check ignore patterns
          const shouldIgnore = this.ignorePatterns.some(pattern => {
            return relativePath.includes(pattern);
          });

          if (shouldIgnore) continue;

          if (entry.isDirectory()) {
            scanDirectory(fullPath);
          } else if (entry.isFile()) {
            const entryName = entry.name.toLowerCase();
            
            if (options.fuzzy) {
              if (entryName.includes(searchName)) {
                results.push(relativePath);
              }
            } else {
              if (entryName === searchName) {
                results.push(relativePath);
              }
            }
          }

          if (results.length >= (options.maxResults || 50)) {
            return;
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    };

    scanDirectory(this.rootDirectory);
    return results;
  }

  /**
   * Get search history
   */
  getHistory(limit = 10) {
    return this.searchHistory.slice(-limit);
  }

  /**
   * Get search statistics
   */
  getStats() {
    const totalSearches = this.searchHistory.length;
    const avgDuration = totalSearches > 0
      ? this.searchHistory.reduce((sum, s) => sum + s.duration, 0) / totalSearches
      : 0;
    
    const totalResults = this.searchHistory.reduce((sum, s) => sum + s.results, 0);

    return {
      totalSearches,
      avgDuration: Math.round(avgDuration),
      totalResults,
      usingRipgrep: this.hasRipgrep
    };
  }

  /**
   * Clear search history
   */
  clearHistory() {
    this.searchHistory = [];
  }

  /**
   * Semantic search - find conceptually similar code
   * Uses fuzzy matching and keyword expansion
   */
  async semanticSearch(query, options = {}) {
    const { limit = 10 } = options;
    
    // Expand query with related terms
    const keywords = this.expandSemanticQuery(query);
    
    // Search for all expanded terms
    const allResults = [];
    for (const keyword of keywords) {
      try {
        const results = await this.search(keyword, {
          ...options,
          maxResults: limit * 2
        });
        allResults.push(...results);
      } catch (error) {
        // Continue with other keywords
      }
    }
    
    // Deduplicate and rank by relevance
    const uniqueResults = new Map();
    for (const result of allResults) {
      const key = result.file + ':' + result.line;
      if (!uniqueResults.has(key)) {
        // Calculate relevance score
        const score = this.calculateSemanticScore(result.match, query, keywords);
        uniqueResults.set(key, { ...result, score });
      }
    }
    
    // Sort by score and limit
    return Array.from(uniqueResults.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Expand query with semantic keywords
   */
  expandSemanticQuery(query) {
    const keywords = new Set([query.toLowerCase()]);
    const expansions = {
      'auth': ['authentication', 'login', 'password', 'session', 'token'],
      'database': ['db', 'sql', 'query', 'schema', 'model'],
      'api': ['endpoint', 'route', 'request', 'response', 'rest'],
      'test': ['spec', 'testing', 'jest', 'mocha', 'assert'],
      'config': ['configuration', 'settings', 'env', 'options'],
      'error': ['exception', 'throw', 'catch', 'fail', 'bug'],
      'user': ['account', 'profile', 'member', 'person'],
      'file': ['document', 'attachment', 'upload', 'storage']
    };
    
    // Add expansions
    const queryLower = query.toLowerCase();
    for (const [key, values] of Object.entries(expansions)) {
      if (queryLower.includes(key)) {
        values.forEach(v => keywords.add(v));
      }
    }
    
    return Array.from(keywords);
  }

  /**
   * Calculate semantic relevance score
   */
  calculateSemanticScore(text, originalQuery, keywords) {
    let score = 0;
    const lowerText = text.toLowerCase();
    const lowerQuery = originalQuery.toLowerCase();
    
    // Exact match bonus
    if (lowerText.includes(lowerQuery)) {
      score += 10;
    }
    
    // Keyword matches
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        score += 1;
      }
    }
    
    // Position bonus (earlier matches rank higher)
    const position = lowerText.indexOf(lowerQuery);
    if (position !== -1) {
      score += Math.max(0, 5 - position / 10);
    }
    
    return score;
  }

  /**
   * Search for content within a specific file
   */
  async searchFileContent(filePath, query) {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const fullPath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(this.rootDirectory, filePath);
      
      if (!fs.existsSync(fullPath)) {
        return false;
      }
      
      const content = fs.readFileSync(fullPath, 'utf8');
      const queryLower = query.toLowerCase();
      const contentLower = content.toLowerCase();
      
      return contentLower.includes(queryLower);
    } catch (error) {
      return false;
    }
  }
}

module.exports = AdvancedSearch;
