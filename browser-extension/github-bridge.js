/**
 * Recoder.xyz GitHub Bridge
 * Provides GitHub API integration for the browser extension
 */

(function() {
  'use strict';

  /**
   * GitHub API Bridge for Recoder Extension
   */
  window.RecoderGitHub = {
    /**
     * Check if GitHub API token is available
     */
    async hasToken() {
      return await window.postMessage({ type: 'RECODER_GITHUB_HAS_TOKEN' }, '*');
    },

    /**
     * Set GitHub API token
     */
    async setToken(token) {
      return await window.postMessage({ 
        type: 'RECODER_GITHUB_SET_TOKEN', 
        payload: { token } 
      }, '*');
    },

    /**
     * Get current user info
     */
    async getCurrentUser() {
      return await window.postMessage({ type: 'RECODER_GITHUB_GET_USER' }, '*');
    },

    /**
     * Get repository information
     */
    async getRepository(owner, repo) {
      return await window.postMessage({ 
        type: 'RECODER_GITHUB_GET_REPO', 
        payload: { owner, repo } 
      }, '*');
    },

    /**
     * Create new repository
     */
    async createRepository(repoData) {
      return await window.postMessage({ 
        type: 'RECODER_GITHUB_CREATE_REPO', 
        payload: repoData 
      }, '*');
    },

    /**
     * Fork repository
     */
    async forkRepository(owner, repo) {
      return await window.postMessage({ 
        type: 'RECODER_GITHUB_FORK_REPO', 
        payload: { owner, repo } 
      }, '*');
    },

    /**
     * Get file content
     */
    async getFileContent(owner, repo, path, ref = 'main') {
      return await window.postMessage({ 
        type: 'RECODER_GITHUB_GET_FILE', 
        payload: { owner, repo, path, ref } 
      }, '*');
    },

    /**
     * Create or update file
     */
    async updateFile(owner, repo, path, content, message, sha = null) {
      return await window.postMessage({ 
        type: 'RECODER_GITHUB_UPDATE_FILE', 
        payload: { owner, repo, path, content, message, sha } 
      }, '*');
    },

    /**
     * Create pull request
     */
    async createPullRequest(owner, repo, prData) {
      return await window.postMessage({ 
        type: 'RECODER_GITHUB_CREATE_PR', 
        payload: { owner, repo, ...prData } 
      }, '*');
    },

    /**
     * Get pull request files
     */
    async getPullRequestFiles(owner, repo, prNumber) {
      return await window.postMessage({ 
        type: 'RECODER_GITHUB_GET_PR_FILES', 
        payload: { owner, repo, prNumber } 
      }, '*');
    },

    /**
     * Create issue
     */
    async createIssue(owner, repo, issueData) {
      return await window.postMessage({ 
        type: 'RECODER_GITHUB_CREATE_ISSUE', 
        payload: { owner, repo, ...issueData } 
      }, '*');
    },

    /**
     * Add issue comment
     */
    async addIssueComment(owner, repo, issueNumber, comment) {
      return await window.postMessage({ 
        type: 'RECODER_GITHUB_ADD_COMMENT', 
        payload: { owner, repo, issueNumber, comment } 
      }, '*');
    },

    /**
     * Create gist
     */
    async createGist(gistData) {
      return await window.postMessage({ 
        type: 'RECODER_GITHUB_CREATE_GIST', 
        payload: gistData 
      }, '*');
    },

    /**
     * Search repositories
     */
    async searchRepositories(query, options = {}) {
      return await window.postMessage({ 
        type: 'RECODER_GITHUB_SEARCH_REPOS', 
        payload: { query, ...options } 
      }, '*');
    },

    /**
     * Search code
     */
    async searchCode(query, options = {}) {
      return await window.postMessage({ 
        type: 'RECODER_GITHUB_SEARCH_CODE', 
        payload: { query, ...options } 
      }, '*');
    },

    /**
     * Get repository languages
     */
    async getRepositoryLanguages(owner, repo) {
      return await window.postMessage({ 
        type: 'RECODER_GITHUB_GET_LANGUAGES', 
        payload: { owner, repo } 
      }, '*');
    },

    /**
     * Get repository tree
     */
    async getRepositoryTree(owner, repo, sha = 'HEAD', recursive = false) {
      return await window.postMessage({ 
        type: 'RECODER_GITHUB_GET_TREE', 
        payload: { owner, repo, sha, recursive } 
      }, '*');
    },

    /**
     * Get commit diff
     */
    async getCommitDiff(owner, repo, sha) {
      return await window.postMessage({ 
        type: 'RECODER_GITHUB_GET_COMMIT_DIFF', 
        payload: { owner, repo, sha } 
      }, '*');
    },

    /**
     * Analyze repository with AI
     */
    async analyzeRepository(owner, repo, options = {}) {
      return await window.postMessage({ 
        type: 'RECODER_AI_ANALYZE_REPO', 
        payload: { owner, repo, ...options } 
      }, '*');
    },

    /**
     * Generate code with AI
     */
    async generateCode(prompt, context = {}) {
      return await window.postMessage({ 
        type: 'RECODER_AI_GENERATE_CODE', 
        payload: { prompt, context } 
      }, '*');
    },

    /**
     * Review code with AI
     */
    async reviewCode(code, language = 'javascript', options = {}) {
      return await window.postMessage({ 
        type: 'RECODER_AI_REVIEW_CODE', 
        payload: { code, language, ...options } 
      }, '*');
    },

    /**
     * Optimize code with AI
     */
    async optimizeCode(code, language = 'javascript', options = {}) {
      return await window.postMessage({ 
        type: 'RECODER_AI_OPTIMIZE_CODE', 
        payload: { code, language, ...options } 
      }, '*');
    },

    /**
     * Generate documentation with AI
     */
    async generateDocumentation(code, language = 'javascript', options = {}) {
      return await window.postMessage({ 
        type: 'RECODER_AI_GENERATE_DOCS', 
        payload: { code, language, ...options } 
      }, '*');
    },

    /**
     * Fix bugs with AI
     */
    async fixBugs(code, error, language = 'javascript', options = {}) {
      return await window.postMessage({ 
        type: 'RECODER_AI_FIX_BUGS', 
        payload: { code, error, language, ...options } 
      }, '*');
    },

    /**
     * Explain code with AI
     */
    async explainCode(code, language = 'javascript', options = {}) {
      return await window.postMessage({ 
        type: 'RECODER_AI_EXPLAIN_CODE', 
        payload: { code, language, ...options } 
      }, '*');
    },

    /**
     * Generate tests with AI
     */
    async generateTests(code, language = 'javascript', framework = 'jest', options = {}) {
      return await window.postMessage({ 
        type: 'RECODER_AI_GENERATE_TESTS', 
        payload: { code, language, framework, ...options } 
      }, '*');
    },

    /**
     * Security scan with AI
     */
    async scanSecurity(code, language = 'javascript', options = {}) {
      return await window.postMessage({ 
        type: 'RECODER_AI_SECURITY_SCAN', 
        payload: { code, language, ...options } 
      }, '*');
    }
  };

  console.log('🐙 Recoder GitHub Bridge loaded');
})();