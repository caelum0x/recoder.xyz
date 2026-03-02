import { memo, useEffect, useState, useMemo } from 'react';
import { bundledLanguages, codeToHtml, isSpecialLang, type BundledLanguage, type SpecialLanguage } from 'shiki';
import { classNames } from '~/utils/classNames';
import { createScopedLogger } from '~/utils/logger';
import { CopyButton } from '~/components/ui/CopyButton';

import styles from './CodeBlock.module.scss';

const logger = createScopedLogger('CodeBlock');

// Language display names for nicer labels
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

// Threshold for collapsing code blocks (number of lines)
const COLLAPSE_THRESHOLD = 15;

interface CodeBlockProps {
  className?: string;
  code: string;
  language?: BundledLanguage | SpecialLanguage;
  theme?: 'light-plus' | 'dark-plus';
  disableCopy?: boolean;
}

export const CodeBlock = memo(
  ({ className, code, language = 'plaintext', theme = 'dark-plus', disableCopy = false }: CodeBlockProps) => {
    const [html, setHTML] = useState<string | undefined>(undefined);
    const [isExpanded, setIsExpanded] = useState(false);

    // Count lines and determine if collapsible
    const { lineCount, isCollapsible } = useMemo(() => {
      const lines = code.split('\n').length;
      return {
        lineCount: lines,
        isCollapsible: lines > COLLAPSE_THRESHOLD,
      };
    }, [code]);

    // Get display label for language
    const languageLabel = useMemo(() => {
      const lang = String(language).toLowerCase();
      return LANGUAGE_LABELS[lang] || lang.charAt(0).toUpperCase() + lang.slice(1);
    }, [language]);

    useEffect(() => {
      if (language && !isSpecialLang(language) && !(language in bundledLanguages)) {
        logger.warn(`Unsupported language '${language}'`);
      }

      logger.trace(`Language = ${language}`);

      const processCode = async () => {
        setHTML(await codeToHtml(code, { lang: language, theme }));
      };

      processCode();
    }, [code]);

    return (
      <div className={classNames('relative group text-left', className)}>
        {/* Header bar with language label and actions */}
        <div className={classNames(
          styles.CodeBlockHeader,
          'flex items-center justify-between px-3 py-2 bg-recoder-elements-background-depth-3 rounded-t-md border-b border-recoder-elements-borderColor'
        )}>
          {/* Language label */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-recoder-elements-textSecondary">
              {languageLabel}
            </span>
            {isCollapsible && (
              <span className="text-xs text-recoder-elements-textTertiary">
                ({lineCount} lines)
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            {/* Expand/Collapse button for long code */}
            {isCollapsible && (
              <button
                className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-recoder-elements-background-depth-2 text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? 'Collapse code' : 'Expand code'}
              >
                <div className={classNames(
                  'transition-transform duration-200',
                  isExpanded ? 'i-ph:caret-up' : 'i-ph:caret-down'
                )} />
                <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
              </button>
            )}

            {/* Copy button */}
            {!disableCopy && (
              <CopyButton
                text={code}
                size="sm"
                variant="ghost"
                showLabel
                label="Copy"
                copiedLabel="Copied!"
                tooltip="Copy code"
              />
            )}
          </div>
        </div>

        {/* Code content */}
        <div
          className={classNames(
            styles.CodeBlockContent,
            'transition-all duration-300 overflow-hidden',
            {
              [styles.Collapsed]: isCollapsible && !isExpanded,
            }
          )}
          style={{
            maxHeight: isCollapsible && !isExpanded ? '300px' : 'none',
          }}
        >
          <div dangerouslySetInnerHTML={{ __html: html ?? '' }} />
        </div>

        {/* Fade overlay for collapsed state */}
        {isCollapsible && !isExpanded && (
          <div
            className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-recoder-elements-background-depth-2 to-transparent pointer-events-none rounded-b-md"
          />
        )}
      </div>
    );
  },
);
