import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { FileMap } from '~/lib/stores/files';
import { classNames } from '~/utils/classNames';
import { WORK_DIR } from '~/utils/constants';
import { cubicEasingFn } from '~/utils/easings';
import { renderLogger } from '~/utils/logger';
import FileTree from './FileTree';

const WORK_DIR_REGEX = new RegExp(`^${WORK_DIR.split('/').slice(0, -1).join('/').replaceAll('/', '\\/')}/`);

// File extension to icon class mapping using Phosphor icons
const FILE_ICON_MAP: Record<string, string> = {
  // TypeScript/JavaScript
  ts: 'i-ph:file-ts-duotone text-blue-400',
  tsx: 'i-ph:file-tsx-duotone text-blue-500',
  js: 'i-ph:file-js-duotone text-yellow-400',
  jsx: 'i-ph:file-jsx-duotone text-yellow-500',
  mjs: 'i-ph:file-js-duotone text-yellow-400',
  cjs: 'i-ph:file-js-duotone text-yellow-400',
  // Web
  html: 'i-ph:file-html-duotone text-orange-400',
  css: 'i-ph:file-css-duotone text-blue-300',
  scss: 'i-ph:file-css-duotone text-pink-400',
  sass: 'i-ph:file-css-duotone text-pink-400',
  less: 'i-ph:file-css-duotone text-indigo-400',
  // Data/Config
  json: 'i-ph:file-duotone text-yellow-300',
  yaml: 'i-ph:file-duotone text-red-400',
  yml: 'i-ph:file-duotone text-red-400',
  toml: 'i-ph:file-duotone text-bolt-elements-textSecondary',
  xml: 'i-ph:file-duotone text-orange-300',
  // Documentation
  md: 'i-ph:file-md-duotone text-bolt-elements-textSecondary',
  mdx: 'i-ph:file-md-duotone text-yellow-400',
  txt: 'i-ph:file-text-duotone text-bolt-elements-textSecondary',
  // Images
  png: 'i-ph:file-image-duotone text-purple-400',
  jpg: 'i-ph:file-image-duotone text-purple-400',
  jpeg: 'i-ph:file-image-duotone text-purple-400',
  gif: 'i-ph:file-image-duotone text-purple-400',
  svg: 'i-ph:file-svg-duotone text-orange-400',
  webp: 'i-ph:file-image-duotone text-purple-400',
  ico: 'i-ph:file-image-duotone text-purple-400',
  // Other languages
  py: 'i-ph:file-py-duotone text-yellow-400',
  rs: 'i-ph:file-rs-duotone text-orange-500',
  go: 'i-ph:file-duotone text-cyan-400',
  java: 'i-ph:file-duotone text-red-400',
  c: 'i-ph:file-c-duotone text-blue-400',
  cpp: 'i-ph:file-cpp-duotone text-blue-500',
  h: 'i-ph:file-c-duotone text-blue-300',
  hpp: 'i-ph:file-cpp-duotone text-blue-400',
  // Database
  sql: 'i-ph:file-sql-duotone text-blue-300',
  prisma: 'i-ph:database-duotone text-teal-400',
  // Config files
  env: 'i-ph:gear-duotone text-yellow-500',
  gitignore: 'i-ph:git-branch-duotone text-orange-400',
  dockerignore: 'i-ph:cube-duotone text-blue-400',
  eslintrc: 'i-ph:gear-duotone text-purple-400',
  prettierrc: 'i-ph:gear-duotone text-pink-400',
  // Lock files
  lock: 'i-ph:lock-duotone text-bolt-elements-textTertiary',
  // Shell
  sh: 'i-ph:terminal-duotone text-green-400',
  bash: 'i-ph:terminal-duotone text-green-400',
  zsh: 'i-ph:terminal-duotone text-green-400',
  // Vue
  vue: 'i-ph:file-vue-duotone text-green-500',
};

// Special file name mappings (exact match)
const SPECIAL_FILE_ICONS: Record<string, string> = {
  'package.json': 'i-ph:package-duotone text-green-400',
  'package-lock.json': 'i-ph:lock-duotone text-bolt-elements-textTertiary',
  'yarn.lock': 'i-ph:lock-duotone text-blue-400',
  'pnpm-lock.yaml': 'i-ph:lock-duotone text-orange-400',
  'tsconfig.json': 'i-ph:gear-duotone text-blue-400',
  'tailwind.config.js': 'i-ph:gear-duotone text-cyan-400',
  'tailwind.config.ts': 'i-ph:gear-duotone text-cyan-400',
  'vite.config.js': 'i-ph:lightning-duotone text-purple-400',
  'vite.config.ts': 'i-ph:lightning-duotone text-purple-400',
  'next.config.js': 'i-ph:gear-duotone text-bolt-elements-textSecondary',
  'next.config.mjs': 'i-ph:gear-duotone text-bolt-elements-textSecondary',
  '.gitignore': 'i-ph:git-branch-duotone text-orange-400',
  '.env': 'i-ph:gear-duotone text-yellow-500',
  '.env.local': 'i-ph:gear-duotone text-yellow-500',
  '.env.development': 'i-ph:gear-duotone text-yellow-500',
  '.env.production': 'i-ph:gear-duotone text-yellow-500',
  'Dockerfile': 'i-ph:cube-duotone text-blue-400',
  'docker-compose.yml': 'i-ph:cube-duotone text-blue-400',
  'docker-compose.yaml': 'i-ph:cube-duotone text-blue-400',
  'README.md': 'i-ph:book-open-duotone text-blue-300',
  'LICENSE': 'i-ph:certificate-duotone text-yellow-400',
};

function getFileIcon(fileName: string): string {
  // Check special file names first
  if (SPECIAL_FILE_ICONS[fileName]) {
    return SPECIAL_FILE_ICONS[fileName];
  }

  // Check for dotfiles without extension
  if (fileName.startsWith('.')) {
    const dotfileName = fileName.slice(1);
    if (FILE_ICON_MAP[dotfileName]) {
      return FILE_ICON_MAP[dotfileName];
    }
  }

  // Get extension
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext && FILE_ICON_MAP[ext]) {
    return FILE_ICON_MAP[ext];
  }

  // Default file icon
  return 'i-ph:file-duotone';
}

interface BreadcrumbsProps {
  files?: FileMap;
  pathSegments?: string[];
  onFileSelect?: (filePath: string) => void;
  unsavedChanges?: boolean;
}

const contextMenuVariants = {
  open: {
    y: 0,
    opacity: 1,
    transition: {
      duration: 0.15,
      ease: cubicEasingFn,
    },
  },
  close: {
    y: 6,
    opacity: 0,
    transition: {
      duration: 0.15,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

export const Breadcrumbs = memo<BreadcrumbsProps>(({ files, pathSegments = [], onFileSelect, unsavedChanges = false }) => {
  renderLogger.trace('Breadcrumbs');

  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const segmentRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // Get the file name for icon detection
  const fileName = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : '';
  const fileIconClass = getFileIcon(fileName);

  // PERFORMANCE: Memoize segment click handler
  const handleSegmentClick = useCallback((index: number) => {
    setActiveIndex((prevIndex) => (prevIndex === index ? null : index));
  }, []);

  // PERFORMANCE: Memoize file select handler to prevent FileTree re-renders
  const handleFileSelect = useCallback((filePath: string) => {
    setActiveIndex(null);
    onFileSelect?.(filePath);
  }, [onFileSelect]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        activeIndex !== null &&
        !contextMenuRef.current?.contains(event.target as Node) &&
        !segmentRefs.current.some((ref) => ref?.contains(event.target as Node))
      ) {
        setActiveIndex(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [activeIndex]);

  if (files === undefined || pathSegments.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      {pathSegments.map((segment, index) => {
        const isLast = index === pathSegments.length - 1;

        const path = pathSegments.slice(0, index).join('/');

        if (!WORK_DIR_REGEX.test(path)) {
          return null;
        }

        const isActive = activeIndex === index;

        return (
          <div key={index} className="relative flex items-center">
            <DropdownMenu.Root open={isActive} modal={false}>
              <DropdownMenu.Trigger asChild>
                <span
                  ref={(ref) => { segmentRefs.current[index] = ref; }}
                  className={classNames('flex items-center gap-1 cursor-pointer shrink-0 text-sm', {
                    'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary': !isActive,
                    'text-bolt-elements-textPrimary underline': isActive,
                    'pr-1': isLast,
                  })}
                  onClick={() => handleSegmentClick(index)}
                >
                  {isLast && <div className={classNames(fileIconClass, 'text-base')} />}
                  {segment}
                  {isLast && unsavedChanges && (
                    <span
                      className="i-ph:circle-fill scale-50 text-orange-500 ml-0.5"
                      title="Unsaved changes"
                    />
                  )}
                </span>
              </DropdownMenu.Trigger>
              {index > 0 && !isLast && <span className="i-ph:caret-right inline-block mx-0.5 text-bolt-elements-textTertiary" />}
              <AnimatePresence>
                {isActive && (
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="z-file-tree-breadcrumb"
                      asChild
                      align="start"
                      side="bottom"
                      avoidCollisions={false}
                    >
                      <motion.div
                        ref={contextMenuRef}
                        initial="close"
                        animate="open"
                        exit="close"
                        variants={contextMenuVariants}
                      >
                        <div className="rounded-lg overflow-hidden">
                          <div className="max-h-[50vh] min-w-[300px] overflow-scroll bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor shadow-sm rounded-lg">
                            <FileTree
                              files={files}
                              hideRoot
                              rootFolder={path}
                              collapsed
                              allowFolderSelection
                              selectedFile={`${path}/${segment}`}
                              onFileSelect={handleFileSelect}
                            />
                          </div>
                        </div>
                        <DropdownMenu.Arrow className="fill-bolt-elements-borderColor" />
                      </motion.div>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                )}
              </AnimatePresence>
            </DropdownMenu.Root>
          </div>
        );
      })}
    </div>
  );
});
