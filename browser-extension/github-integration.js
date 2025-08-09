/**
 * Recoder.xyz AI Code Assistant - GitHub Integration
 * Provides AI-powered code assistance directly within GitHub
 */

(function() {
  'use strict';

  let githubAPI = null;
  let currentUser = null;
  let recoderStatus = { localAI: false, cloudAI: false };

  /**
   * Initialize GitHub Integration
   */
  async function initializeGitHubIntegration() {
    console.log('🐙 Initializing Recoder GitHub Integration...');
    
    // Inject GitHub bridge
    injectGitHubBridge();
    
    // Detect current user
    await detectCurrentUser();
    
    // Add Recoder UI elements
    addRecoderInterface();
    
    // Setup event listeners
    setupEventListeners();
    
    // Check Recoder status
    await checkRecoderStatus();
    
    console.log('✅ Recoder GitHub Integration ready');
  }

  /**
   * Inject GitHub bridge script
   */
  function injectGitHubBridge() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('github-bridge.js');
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  /**
   * Detect current GitHub user
   */
  async function detectCurrentUser() {
    // Try to get user from GitHub's meta tags or API
    const userMeta = document.querySelector('meta[name="user-login"]');
    if (userMeta) {
      currentUser = userMeta.getAttribute('content');
      console.log(`🐙 Detected GitHub user: ${currentUser}`);
    }
  }

  /**
   * Add Recoder interface elements to GitHub
   */
  function addRecoderInterface() {
    // Add to repository header
    addRepositoryActions();
    
    // Add to code files
    addCodeFileActions();
    
    // Add to pull requests
    addPullRequestActions();
    
    // Add to issues
    addIssueActions();
  }

  /**
   * Add Recoder actions to repository header
   */
  function addRepositoryActions() {
    const repoActions = document.querySelector('.repository-content .file-navigation .js-navigation-enable');
    if (!repoActions) return;

    const recoderActions = document.createElement('div');
    recoderActions.className = 'recoder-repo-actions';
    recoderActions.innerHTML = `
      <div class="recoder-github-toolbar" style="
        display: flex; 
        align-items: center; 
        gap: 8px; 
        padding: 8px 16px; 
        background: #f6f8fa; 
        border: 1px solid #d0d7de; 
        border-radius: 6px; 
        margin: 8px 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
      ">
        <span style="font-size: 14px; font-weight: 600; color: #24292f;">🚀 Recoder AI</span>
        <button id="recoder-analyze-repo" class="recoder-btn recoder-btn-sm" style="
          background: #2da44e; 
          color: white; 
          border: none; 
          padding: 4px 8px; 
          border-radius: 4px; 
          font-size: 12px; 
          cursor: pointer;
        ">
          📊 Analyze Repository
        </button>
        <button id="recoder-generate-docs" class="recoder-btn recoder-btn-sm" style="
          background: #0969da; 
          color: white; 
          border: none; 
          padding: 4px 8px; 
          border-radius: 4px; 
          font-size: 12px; 
          cursor: pointer;
        ">
          📝 Generate Docs
        </button>
        <button id="recoder-optimize-code" class="recoder-btn recoder-btn-sm" style="
          background: #8250df; 
          color: white; 
          border: none; 
          padding: 4px 8px; 
          border-radius: 4px; 
          font-size: 12px; 
          cursor: pointer;
        ">
          ⚡ Optimize Code
        </button>
        <div id="recoder-status" style="
          font-size: 11px; 
          color: #656d76; 
          margin-left: auto;
        ">
          🔄 Checking AI status...
        </div>
      </div>
    `;

    repoActions.parentNode.insertBefore(recoderActions, repoActions.nextSibling);
  }

  /**
   * Add Recoder actions to code files
   */
  function addCodeFileActions() {
    const codeFiles = document.querySelectorAll('.js-file-line-container');
    if (codeFiles.length === 0) return;

    // Add floating action button for code assistance
    const floatingButton = document.createElement('div');
    floatingButton.id = 'recoder-floating-assistant';
    floatingButton.innerHTML = `
      <button id="recoder-code-assistant" style="
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 9999;
        transition: transform 0.2s;
      " title="Recoder AI Assistant">
        🤖
      </button>
    `;

    document.body.appendChild(floatingButton);

    // Add hover effect
    const assistantBtn = document.getElementById('recoder-code-assistant');
    assistantBtn.addEventListener('mouseenter', () => {
      assistantBtn.style.transform = 'scale(1.1)';
    });
    assistantBtn.addEventListener('mouseleave', () => {
      assistantBtn.style.transform = 'scale(1)';
    });
  }

  /**
   * Add Recoder actions to pull requests
   */
  function addPullRequestActions() {
    const prToolbar = document.querySelector('.pr-toolbar');
    if (!prToolbar) return;

    const recoderPRActions = document.createElement('div');
    recoderPRActions.innerHTML = `
      <div class="recoder-pr-actions" style="
        display: flex; 
        gap: 8px; 
        padding: 8px; 
        background: #fff; 
        border: 1px solid #d0d7de; 
        border-radius: 6px; 
        margin: 8px 0;
      ">
        <button id="recoder-review-pr" class="recoder-btn" style="
          background: #2da44e; 
          color: white; 
          border: none; 
          padding: 6px 12px; 
          border-radius: 4px; 
          font-size: 13px; 
          cursor: pointer;
        ">
          🔍 AI Code Review
        </button>
        <button id="recoder-suggest-improvements" class="recoder-btn" style="
          background: #0969da; 
          color: white; 
          border: none; 
          padding: 6px 12px; 
          border-radius: 4px; 
          font-size: 13px; 
          cursor: pointer;
        ">
          💡 Suggest Improvements
        </button>
        <button id="recoder-security-scan" class="recoder-btn" style="
          background: #d1242f; 
          color: white; 
          border: none; 
          padding: 6px 12px; 
          border-radius: 4px; 
          font-size: 13px; 
          cursor: pointer;
        ">
          🛡️ Security Scan
        </button>
      </div>
    `;

    prToolbar.appendChild(recoderPRActions);
  }

  /**
   * Add Recoder actions to issues
   */
  function addIssueActions() {
    const issueActions = document.querySelector('.timeline-comment-actions');
    if (!issueActions) return;

    const recoderIssueBtn = document.createElement('button');
    recoderIssueBtn.id = 'recoder-analyze-issue';
    recoderIssueBtn.innerHTML = '🤖 AI Analysis';
    recoderIssueBtn.style.cssText = `
      background: #8250df; 
      color: white; 
      border: none; 
      padding: 4px 8px; 
      border-radius: 4px; 
      font-size: 12px; 
      cursor: pointer; 
      margin-left: 8px;
    `;

    issueActions.appendChild(recoderIssueBtn);
  }

  /**
   * Setup event listeners for all Recoder actions
   */
  function setupEventListeners() {
    // Repository actions
    document.addEventListener('click', async (e) => {
      switch (e.target.id) {
        case 'recoder-analyze-repo':
          await handleRepositoryAnalysis();
          break;
        case 'recoder-generate-docs':
          await handleDocumentationGeneration();
          break;
        case 'recoder-optimize-code':
          await handleCodeOptimization();
          break;
        case 'recoder-code-assistant':
          await handleCodeAssistant();
          break;
        case 'recoder-review-pr':
          await handlePullRequestReview();
          break;
        case 'recoder-suggest-improvements':
          await handleImprovementSuggestions();
          break;
        case 'recoder-security-scan':
          await handleSecurityScan();
          break;
        case 'recoder-analyze-issue':
          await handleIssueAnalysis();
          break;
      }
    });

    // Context menu for selected code
    document.addEventListener('contextmenu', (e) => {
      const selectedText = window.getSelection().toString().trim();
      if (selectedText && selectedText.length > 10) {
        // Store selected code for context menu action
        window.recoderSelectedCode = selectedText;
      }
    });
  }

  /**
   * Handle repository analysis
   */
  async function handleRepositoryAnalysis() {
    showRecoderModal('Repository Analysis', 'Analyzing repository structure and code quality...', true);
    
    try {
      const repoInfo = extractRepositoryInfo();
      const analysis = await performRepositoryAnalysis(repoInfo);
      
      showRecoderModal('Repository Analysis Results', `
        <div style="text-align: left; line-height: 1.6;">
          <h3>📊 Analysis Summary</h3>
          <p><strong>Files:</strong> ${analysis.fileCount}</p>
          <p><strong>Languages:</strong> ${analysis.languages.join(', ')}</p>
          <p><strong>Quality Score:</strong> ${analysis.qualityScore}/100</p>
          
          <h3>🎯 Recommendations</h3>
          <ul>
            ${analysis.recommendations.map(rec => `<li>${rec}</li>`).join('')}
          </ul>
          
          <h3>🔧 Suggested Improvements</h3>
          <ul>
            ${analysis.improvements.map(imp => `<li>${imp}</li>`).join('')}
          </ul>
        </div>
      `);
    } catch (error) {
      showRecoderModal('Error', `Failed to analyze repository: ${error.message}`);
    }
  }

  /**
   * Handle documentation generation
   */
  async function handleDocumentationGeneration() {
    showRecoderModal('Documentation Generation', 'Analyzing code and generating documentation...', true);
    
    try {
      const repoInfo = extractRepositoryInfo();
      const documentation = await generateDocumentation(repoInfo);
      
      showRecoderModal('Generated Documentation', `
        <div style="text-align: left;">
          <div style="margin-bottom: 16px;">
            <button onclick="copyToClipboard(this.nextElementSibling.textContent)" style="
              background: #2da44e; 
              color: white; 
              border: none; 
              padding: 4px 8px; 
              border-radius: 4px; 
              cursor: pointer;
            ">📋 Copy README</button>
          </div>
          <pre style="
            background: #f6f8fa; 
            padding: 16px; 
            border-radius: 6px; 
            overflow-x: auto; 
            font-size: 12px; 
            line-height: 1.4;
          ">${documentation}</pre>
        </div>
      `);
    } catch (error) {
      showRecoderModal('Error', `Failed to generate documentation: ${error.message}`);
    }
  }

  /**
   * Handle code optimization
   */
  async function handleCodeOptimization() {
    showRecoderModal('Code Optimization', 'Analyzing code for optimization opportunities...', true);
    
    try {
      const codeFiles = extractCodeFiles();
      const optimizations = await performCodeOptimization(codeFiles);
      
      showRecoderModal('Optimization Suggestions', `
        <div style="text-align: left; line-height: 1.6;">
          <h3>⚡ Optimization Opportunities</h3>
          ${optimizations.map(opt => `
            <div style="margin-bottom: 16px; padding: 12px; background: #f6f8fa; border-radius: 6px;">
              <h4>${opt.file}</h4>
              <p><strong>Issue:</strong> ${opt.issue}</p>
              <p><strong>Solution:</strong> ${opt.solution}</p>
              <p><strong>Impact:</strong> ${opt.impact}</p>
            </div>
          `).join('')}
        </div>
      `);
    } catch (error) {
      showRecoderModal('Error', `Failed to optimize code: ${error.message}`);
    }
  }

  /**
   * Handle code assistant activation
   */
  async function handleCodeAssistant() {
    const modal = showRecoderModal('AI Code Assistant', `
      <div style="text-align: left;">
        <textarea id="recoder-assistant-input" placeholder="Ask me anything about this code..." style="
          width: 100%; 
          height: 100px; 
          padding: 12px; 
          border: 1px solid #d0d7de; 
          border-radius: 6px; 
          font-family: inherit; 
          resize: vertical;
        "></textarea>
        <div style="margin-top: 12px; display: flex; gap: 8px;">
          <button onclick="processAssistantRequest()" style="
            background: #2da44e; 
            color: white; 
            border: none; 
            padding: 8px 16px; 
            border-radius: 4px; 
            cursor: pointer;
          ">💬 Ask AI</button>
          <button onclick="analyzeSelectedCode()" style="
            background: #0969da; 
            color: white; 
            border: none; 
            padding: 8px 16px; 
            border-radius: 4px; 
            cursor: pointer;
          ">🔍 Analyze Selection</button>
        </div>
        <div id="assistant-response" style="margin-top: 16px; display: none;"></div>
      </div>
    `);
  }

  /**
   * Show Recoder modal
   */
  function showRecoderModal(title, content, loading = false) {
    // Remove existing modal
    const existingModal = document.getElementById('recoder-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'recoder-modal';
    modal.innerHTML = `
      <div style="
        position: fixed; 
        top: 0; 
        left: 0; 
        width: 100%; 
        height: 100%; 
        background: rgba(0,0,0,0.7); 
        z-index: 10000; 
        display: flex; 
        align-items: center; 
        justify-content: center;
      ">
        <div style="
          background: white; 
          border-radius: 12px; 
          padding: 24px; 
          max-width: 600px; 
          max-height: 80vh; 
          overflow-y: auto; 
          box-shadow: 0 20px 40px rgba(0,0,0,0.3);
          position: relative;
        ">
          <div style="
            display: flex; 
            align-items: center; 
            justify-content: space-between; 
            margin-bottom: 16px; 
            padding-bottom: 12px; 
            border-bottom: 1px solid #d0d7de;
          ">
            <h2 style="margin: 0; color: #24292f; font-size: 18px;">🚀 ${title}</h2>
            <button onclick="closeRecoderModal()" style="
              background: none; 
              border: none; 
              font-size: 20px; 
              cursor: pointer; 
              color: #656d76;
            ">×</button>
          </div>
          <div id="modal-content">
            ${loading ? `
              <div style="text-align: center; padding: 40px;">
                <div style="
                  width: 40px; 
                  height: 40px; 
                  border: 4px solid #f3f4f6; 
                  border-top: 4px solid #0969da; 
                  border-radius: 50%; 
                  animation: spin 1s linear infinite; 
                  margin: 0 auto 16px;
                "></div>
                <p style="color: #656d76; margin: 0;">${content}</p>
              </div>
            ` : content}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    return modal;
  }

  /**
   * Close Recoder modal
   */
  window.closeRecoderModal = function() {
    const modal = document.getElementById('recoder-modal');
    if (modal) {
      modal.remove();
    }
  };

  /**
   * Copy text to clipboard
   */
  window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
      // Show success message
      const button = event.target;
      const originalText = button.textContent;
      button.textContent = '✅ Copied!';
      button.style.background = '#2da44e';
      setTimeout(() => {
        button.textContent = originalText;
        button.style.background = '#2da44e';
      }, 2000);
    });
  };

  /**
   * Extract repository information
   */
  function extractRepositoryInfo() {
    const repoHeader = document.querySelector('.pagehead h1');
    const repoName = repoHeader ? repoHeader.textContent.trim() : 'Unknown';
    const files = Array.from(document.querySelectorAll('.js-navigation-item')).map(item => {
      const link = item.querySelector('.js-navigation-open');
      return link ? link.getAttribute('title') : null;
    }).filter(Boolean);

    return {
      name: repoName,
      url: window.location.href,
      files: files.slice(0, 10), // Limit for analysis
      language: detectPrimaryLanguage()
    };
  }

  /**
   * Detect primary programming language
   */
  function detectPrimaryLanguage() {
    const langBar = document.querySelector('.BorderGrid-cell .text-small');
    if (langBar) {
      const match = langBar.textContent.match(/(\w+)\s+[\d.]+%/);
      return match ? match[1] : 'Unknown';
    }
    return 'Unknown';
  }

  /**
   * Extract code files for analysis
   */
  function extractCodeFiles() {
    const codeElements = document.querySelectorAll('.highlight');
    return Array.from(codeElements).slice(0, 5).map(el => ({
      content: el.textContent,
      language: detectCodeLanguage(el)
    }));
  }

  /**
   * Detect code language from highlight element
   */
  function detectCodeLanguage(element) {
    const classNames = element.className;
    const langMatch = classNames.match(/language-(\w+)/);
    return langMatch ? langMatch[1] : 'text';
  }

  /**
   * Check Recoder status
   */
  async function checkRecoderStatus() {
    try {
      // Send message to background script to check status
      const response = await chrome.runtime.sendMessage({
        type: 'GET_RECODER_STATUS'
      });
      
      recoderStatus = response || { localAI: false, cloudAI: false };
      updateStatusDisplay();
    } catch (error) {
      console.warn('Failed to check Recoder status:', error);
      updateStatusDisplay();
    }
  }

  /**
   * Update status display
   */
  function updateStatusDisplay() {
    const statusEl = document.getElementById('recoder-status');
    if (!statusEl) return;

    let statusText = '';
    let statusColor = '#656d76';

    if (recoderStatus.localAI) {
      statusText = '🤖 Local AI Ready';
      statusColor = '#2da44e';
    } else if (recoderStatus.cloudAI) {
      statusText = '☁️ Cloud AI Ready';
      statusColor = '#0969da';
    } else {
      statusText = '❌ No AI Available';
      statusColor = '#d1242f';
    }

    statusEl.textContent = statusText;
    statusEl.style.color = statusColor;
  }

  /**
   * Perform repository analysis (stub - would integrate with AI)
   */
  async function performRepositoryAnalysis(repoInfo) {
    // This would integrate with the background script to call AI
    return {
      fileCount: repoInfo.files.length,
      languages: [repoInfo.language],
      qualityScore: 85,
      recommendations: [
        'Add comprehensive unit tests',
        'Improve documentation coverage',
        'Set up CI/CD pipeline'
      ],
      improvements: [
        'Consider adding TypeScript for better type safety',
        'Implement error handling in async functions',
        'Add dependency security scanning'
      ]
    };
  }

  /**
   * Generate documentation (stub)
   */
  async function generateDocumentation(repoInfo) {
    return `# ${repoInfo.name}

## Description
AI-generated documentation for ${repoInfo.name}

## Installation
\`\`\`bash
npm install
\`\`\`

## Usage
\`\`\`${repoInfo.language.toLowerCase()}
// Usage example
\`\`\`

## Contributing
Please read CONTRIBUTING.md for details on our code of conduct.

## License
This project is licensed under the MIT License.`;
  }

  /**
   * Perform code optimization (stub)
   */
  async function performCodeOptimization(codeFiles) {
    return [
      {
        file: 'example.js',
        issue: 'Inefficient loop iteration',
        solution: 'Use map() instead of forEach() for transformations',
        impact: 'Improved performance and readability'
      }
    ];
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGitHubIntegration);
  } else {
    initializeGitHubIntegration();
  }

})();