/**
 * EnhancedCodeBlock - Advanced code blocks with copy, run, and apply buttons
 *
 * Features:
 * - Syntax highlighting with shiki
 * - Copy to clipboard
 * - Run code in terminal
 * - Apply code to file
 * - Diff preview
 * - Language detection
 * - Line numbers
 * - Collapsible for long code
 */

import { memo, useCallback, useEffect, useState, useMemo } from 'react';
import { bundledLanguages, codeToHtml, isSpecialLang, type BundledLanguage, type SpecialLanguage } from 'shiki';
import { atom } from 'nanostores';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { workbenchStore } from '~/lib/stores/workbench';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('EnhancedCodeBlock');

// Settings store
export const codeBlockSettingsStore = atom({
  showLineNumbers: true,
  wrapLines: false,
  collapseThreshold: 20,
  defaultExpanded: false,
});

// Language display names
const LANGUAGE_LABELS: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  csharp: 'C#',
  go: 'Go',
  rust: 'Rust',
  ruby: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',
  scala: 'Scala',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sass: 'Sass',
  less: 'Less',
  json: 'JSON',
  yaml: 'YAML',
  xml: 'XML',
  markdown: 'Markdown',
  md: 'Markdown',
  sql: 'SQL',
  bash: 'Bash',
  shell: 'Shell',
  sh: 'Shell',
  zsh: 'Zsh',
  powershell: 'PowerShell',
  dockerfile: 'Dockerfile',
  docker: 'Docker',
  plaintext: 'Plain Text',
  text: 'Plain Text',
  jsx: 'JSX',
  tsx: 'TSX',
  vue: 'Vue',
  svelte: 'Svelte',
  graphql: 'GraphQL',
  prisma: 'Prisma',
  toml: 'TOML',
  ini: 'INI',
  nginx: 'Nginx',
  apache: 'Apache',
};

// Language to file extension mapping
const LANGUAGE_EXTENSIONS: Record<string, string> = {
  javascript: '.js',
  typescript: '.ts',
  python: '.py',
  java: '.java',
  cpp: '.cpp',
  c: '.c',
  csharp: '.cs',
  go: '.go',
  rust: '.rs',
  ruby: '.rb',
  php: '.php',
  swift: '.swift',
  kotlin: '.kt',
  scala: '.scala',
  html: '.html',
  css: '.css',
  scss: '.scss',
  sass: '.sass',
  less: '.less',
  json: '.json',
  yaml: '.yaml',
  xml: '.xml',
  markdown: '.md',
  sql: '.sql',
  bash: '.sh',
  shell: '.sh',
  dockerfile: 'Dockerfile',
  jsx: '.jsx',
  tsx: '.tsx',
  vue: '.vue',
  svelte: '.svelte',
  graphql: '.graphql',
  prisma: '.prisma',
  toml: '.toml',
};

interface EnhancedCodeBlockProps {
  code: string;
  language?: BundledLanguage | SpecialLanguage | string;
  filename?: string;
  className?: string;
  showHeader?: boolean;
  showActions?: boolean;
  showLineNumbers?: boolean;
  allowCopy?: boolean;
  allowRun?: boolean;
  allowApply?: boolean;
  onRun?: (code: string, language: string) => void;
  onApply?: (code: string, filename?: string) => void;
}

export const EnhancedCodeBlock = memo(function EnhancedCodeBlock({
  code,
  language = 'plaintext',
  filename,
  className,
  showHeader = true,
  showActions = true,
  showLineNumbers: propShowLineNumbers,
  allowCopy = true,
  allowRun = true,
  allowApply = true,
  onRun,
  onApply,
}: EnhancedCodeBlockProps) {
  const settings = useStore(codeBlockSettingsStore);
  const showLineNumbers = propShowLineNumbers ?? settings.showLineNumbers;

  const [html, setHTML] = useState<string | undefined>(undefined);
  const [isExpanded, setIsExpanded] = useState(settings.defaultExpanded);
  const [isCopied, setIsCopied] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // Calculate line count and collapsibility
  const { lineCount, isCollapsible, lines } = useMemo(() => {
    const lineArray = code.split('\n');
    return {
      lineCount: lineArray.length,
      isCollapsible: lineArray.length > settings.collapseThreshold,
      lines: lineArray,
    };
  }, [code, settings.collapseThreshold]);

  // Get display label for language
  const languageLabel = useMemo(() => {
    const lang = String(language).toLowerCase();
    return LANGUAGE_LABELS[lang] || lang.charAt(0).toUpperCase() + lang.slice(1);
  }, [language]);

  // Syntax highlighting
  useEffect(() => {
    const langStr = String(language).toLowerCase();
    if (langStr && !isSpecialLang(langStr as any) && !(langStr in bundledLanguages)) {
      logger.warn(`Unsupported language '${langStr}'`);
    }

    const processCode = async () => {
      try {
        const highlighted = await codeToHtml(code, {
          lang: langStr as BundledLanguage,
          theme: 'github-dark',
          transformers: showLineNumbers
            ? [
                {
                  line(node, line) {
                    node.properties['data-line'] = line;
                  },
                },
              ]
            : undefined,
        });
        setHTML(highlighted);
      } catch (e) {
        logger.error('Failed to highlight code:', e);
        setHTML(`<pre><code>${code}</code></pre>`);
      }
    };

    processCode();
  }, [code, language, showLineNumbers]);

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (e) {
      logger.error('Failed to copy:', e);
    }
  }, [code]);

  // Run code
  const handleRun = useCallback(async () => {
    if (!allowRun) return;

    setIsRunning(true);
    try {
      if (onRun) {
        onRun(code, String(language));
      } else {
        // Default run behavior - execute in terminal
        const langStr = String(language).toLowerCase();
        let command = '';

        if (['bash', 'shell', 'sh', 'zsh'].includes(langStr)) {
          command = code;
        } else if (langStr === 'javascript' || langStr === 'js') {
          command = `node -e "${code.replace(/"/g, '\\"')}"`;
        } else if (langStr === 'python' || langStr === 'py') {
          command = `python3 -c "${code.replace(/"/g, '\\"')}"`;
        } else {
          // For other languages, try to run via the workbench
          window.dispatchEvent(
            new CustomEvent('recoder:run-code', {
              detail: { code, language: langStr },
            })
          );
          return;
        }

        // Dispatch shell command
        window.dispatchEvent(
          new CustomEvent('recoder:shell', {
            detail: { command },
          })
        );
      }
    } finally {
      setTimeout(() => setIsRunning(false), 500);
    }
  }, [code, language, allowRun, onRun]);

  // Apply code to file
  const handleApply = useCallback(async () => {
    if (!allowApply) return;

    setIsApplying(true);
    try {
      if (onApply) {
        onApply(code, filename);
      } else {
        // Default apply behavior
        const targetFile = filename || `untitled${LANGUAGE_EXTENSIONS[String(language).toLowerCase()] || '.txt'}`;

        // Create file action
        const messageId = `apply_${Date.now()}`;
        const artifactId = `artifact_${messageId}`;
        const actionId = `${artifactId}_action_0`;

        workbenchStore.showWorkbench.set(true);
        workbenchStore.addArtifact({
          messageId,
          id: artifactId,
          title: `Applied: ${targetFile}`,
        });

        workbenchStore.addAction({
          artifactId,
          messageId,
          actionId,
          action: {
            type: 'file',
            filePath: targetFile,
            content: code,
          },
        });

        await workbenchStore.runAction({
          artifactId,
          messageId,
          actionId,
          action: {
            type: 'file',
            filePath: targetFile,
            content: code,
          },
        });
      }
    } finally {
      setTimeout(() => setIsApplying(false), 500);
    }
  }, [code, filename, language, allowApply, onApply]);

  // Determine if run button should be shown
  const canRun = useMemo(() => {
    const langStr = String(language).toLowerCase();
    return ['bash', 'shell', 'sh', 'zsh', 'javascript', 'js', 'python', 'py', 'typescript', 'ts'].includes(langStr);
  }, [language]);

  return (
    <div
      className={classNames(
        'relative group rounded-lg overflow-hidden',
        'bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
        className
      )}
    >
      {/* Header bar */}
      {showHeader && (
        <div className="flex items-center justify-between px-3 py-2 bg-bolt-elements-background-depth-4 border-b border-bolt-elements-borderColor">
          {/* Language label and filename */}
          <div className="flex items-center gap-2">
            {filename ? (
              <>
                <div className="i-ph:file-code text-bolt-elements-textSecondary" />
                <span className="text-xs font-medium text-bolt-elements-textPrimary">{filename}</span>
                <span className="text-xs text-bolt-elements-textTertiary">({languageLabel})</span>
              </>
            ) : (
              <span className="text-xs font-medium text-bolt-elements-textSecondary">{languageLabel}</span>
            )}
            {isCollapsible && (
              <span className="text-xs text-bolt-elements-textTertiary">({lineCount} lines)</span>
            )}
          </div>

          {/* Action buttons */}
          {showActions && (
            <div className="flex items-center gap-1">
              {/* Expand/Collapse */}
              {isCollapsible && (
                <button
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
                  onClick={() => setIsExpanded(!isExpanded)}
                  title={isExpanded ? 'Collapse' : 'Expand'}
                >
                  <div
                    className={classNames(
                      'transition-transform duration-200',
                      isExpanded ? 'i-ph:caret-up' : 'i-ph:caret-down'
                    )}
                  />
                </button>
              )}

              {/* Copy */}
              {allowCopy && (
                <button
                  className={classNames(
                    'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
                    isCopied
                      ? 'bg-green-500/20 text-green-400'
                      : 'hover:bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
                  )}
                  onClick={handleCopy}
                  title="Copy code"
                >
                  <div className={isCopied ? 'i-ph:check' : 'i-ph:copy'} />
                  <span>{isCopied ? 'Copied' : 'Copy'}</span>
                </button>
              )}

              {/* Run */}
              {allowRun && canRun && (
                <button
                  className={classNames(
                    'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
                    isRunning
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'hover:bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
                  )}
                  onClick={handleRun}
                  disabled={isRunning}
                  title="Run code"
                >
                  <div className={isRunning ? 'i-svg-spinners:pulse-3' : 'i-ph:play'} />
                  <span>{isRunning ? 'Running...' : 'Run'}</span>
                </button>
              )}

              {/* Apply */}
              {allowApply && (
                <button
                  className={classNames(
                    'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
                    isApplying
                      ? 'bg-orange-500/20 text-orange-400'
                      : 'hover:bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
                  )}
                  onClick={handleApply}
                  disabled={isApplying}
                  title="Apply to file"
                >
                  <div className={isApplying ? 'i-svg-spinners:pulse-3' : 'i-ph:file-arrow-down'} />
                  <span>{isApplying ? 'Applying...' : 'Apply'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Code content */}
      <div
        className={classNames(
          'overflow-auto transition-all duration-300',
          showLineNumbers && 'code-with-line-numbers',
          isCollapsible && !isExpanded && 'max-h-[300px]'
        )}
      >
        {html ? (
          <div
            className={classNames(
              'text-sm',
              '[&_pre]:m-0 [&_pre]:p-4 [&_pre]:bg-transparent',
              '[&_code]:font-mono [&_code]:text-sm',
              showLineNumbers && '[&_.line]:pl-4 [&_.line]:relative [&_.line]:before:content-[attr(data-line)] [&_.line]:before:absolute [&_.line]:before:left-[-2rem] [&_.line]:before:w-6 [&_.line]:before:text-right [&_.line]:before:text-bolt-elements-textTertiary [&_.line]:before:pr-2'
            )}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="m-0 p-4 text-sm font-mono text-bolt-elements-textPrimary overflow-x-auto">
            <code>{code}</code>
          </pre>
        )}
      </div>

      {/* Fade overlay for collapsed state */}
      {isCollapsible && !isExpanded && (
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-bolt-elements-background-depth-3 to-transparent pointer-events-none" />
      )}
    </div>
  );
});

// Inline code component
interface InlineCodeProps {
  children: React.ReactNode;
  className?: string;
}

export const InlineCode = memo(function InlineCode({ children, className }: InlineCodeProps) {
  return (
    <code
      className={classNames(
        'px-1.5 py-0.5 rounded text-sm font-mono',
        'bg-bolt-elements-background-depth-3 text-orange-400',
        'border border-bolt-elements-borderColor',
        className
      )}
    >
      {children}
    </code>
  );
});

// Code block with diff support
interface DiffCodeBlockProps extends EnhancedCodeBlockProps {
  originalCode?: string;
  showDiff?: boolean;
}

export const DiffCodeBlock = memo(function DiffCodeBlock({
  code,
  originalCode,
  showDiff = true,
  ...props
}: DiffCodeBlockProps) {
  const [diffHtml, setDiffHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!showDiff || !originalCode) return;

    // Simple line-by-line diff
    const oldLines = originalCode.split('\n');
    const newLines = code.split('\n');
    const diffLines: string[] = [];

    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine === undefined) {
        diffLines.push(`<span class="text-green-400">+ ${newLine}</span>`);
      } else if (newLine === undefined) {
        diffLines.push(`<span class="text-red-400">- ${oldLine}</span>`);
      } else if (oldLine !== newLine) {
        diffLines.push(`<span class="text-red-400">- ${oldLine}</span>`);
        diffLines.push(`<span class="text-green-400">+ ${newLine}</span>`);
      } else {
        diffLines.push(`  ${newLine}`);
      }
    }

    setDiffHtml(`<pre class="p-4 text-sm font-mono">${diffLines.join('\n')}</pre>`);
  }, [code, originalCode, showDiff]);

  if (showDiff && originalCode && diffHtml) {
    return (
      <div
        className={classNames(
          'rounded-lg overflow-hidden',
          'bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor'
        )}
      >
        <div className="flex items-center gap-2 px-3 py-2 bg-bolt-elements-background-depth-4 border-b border-bolt-elements-borderColor">
          <div className="i-ph:git-diff text-bolt-elements-textSecondary" />
          <span className="text-xs font-medium text-bolt-elements-textSecondary">Diff View</span>
        </div>
        <div
          className="overflow-auto text-bolt-elements-textPrimary"
          dangerouslySetInnerHTML={{ __html: diffHtml }}
        />
      </div>
    );
  }

  return <EnhancedCodeBlock code={code} {...props} />;
});

export default EnhancedCodeBlock;
