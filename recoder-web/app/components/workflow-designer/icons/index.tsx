'use client';

import type { FC, SVGProps } from 'react';
import type { WorkflowNode, NodeContentType } from '../types';

// Sparkles Icon - for AI/generation nodes
export const SparklesIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>AI</title>
    <path
      d="M8 0L9.5 5.5L15 7L9.5 8.5L8 14L6.5 8.5L1 7L6.5 5.5L8 0Z"
      fill="currentColor"
    />
    <path
      d="M3 11L3.5 13L5.5 13.5L3.5 14L3 16L2.5 14L0.5 13.5L2.5 13L3 11Z"
      fill="currentColor"
    />
    <path
      d="M13 0L13.5 2L15.5 2.5L13.5 3L13 5L12.5 3L10.5 2.5L12.5 2L13 0Z"
      fill="currentColor"
    />
  </svg>
);

// Text Icon - for text nodes
export const TextIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Text</title>
    <path
      d="M2 3C2 2.44772 2.44772 2 3 2H13C13.5523 2 14 2.44772 14 3V4C14 4.55228 13.5523 5 13 5H3C2.44772 5 2 4.55228 2 4V3Z"
      fill="currentColor"
    />
    <path
      d="M7 5H9V13H7V5Z"
      fill="currentColor"
    />
    <path
      d="M5 12H11V14H5V12Z"
      fill="currentColor"
    />
  </svg>
);

// File Icon - for file nodes
export const FileIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>File</title>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3 1C2.44772 1 2 1.44772 2 2V14C2 14.5523 2.44772 15 3 15H13C13.5523 15 14 14.5523 14 14V5L10 1H3ZM10 1V5H14L10 1ZM4 7H12V8H4V7ZM4 10H12V11H4V10Z"
      fill="currentColor"
    />
  </svg>
);

// Code Icon - for code execution nodes
export const CodeIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Code</title>
    <path
      d="M5.5 3L1 8L5.5 13L6.91421 11.5858L3.82843 8L6.91421 4.41421L5.5 3Z"
      fill="currentColor"
    />
    <path
      d="M10.5 3L9.08579 4.41421L12.1716 8L9.08579 11.5858L10.5 13L15 8L10.5 3Z"
      fill="currentColor"
    />
  </svg>
);

// API Icon - for API call nodes
export const ApiIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>API</title>
    <path
      d="M8 1C4.13401 1 1 4.13401 1 8C1 11.866 4.13401 15 8 15C11.866 15 15 11.866 15 8C15 4.13401 11.866 1 8 1ZM7 5H9V7H7V5ZM7 8H9V11H7V8Z"
      fill="currentColor"
    />
  </svg>
);

// Conditional Icon - for conditional/branch nodes
export const ConditionalIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Condition</title>
    <path
      d="M8 1L14 8L8 15L2 8L8 1Z"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
    />
    <path
      d="M5 8H11M8 5V11"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  </svg>
);

// Loop Icon - for loop nodes
export const LoopIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Loop</title>
    <path
      d="M2 8C2 4.68629 4.68629 2 8 2C10.2091 2 12.1166 3.22975 13.0618 5H11V7H16V2H14V4.16781C12.7158 2.24903 10.5046 1 8 1C4.13401 1 1 4.13401 1 8H2Z"
      fill="currentColor"
    />
    <path
      d="M14 8C14 11.3137 11.3137 14 8 14C5.79086 14 3.88339 12.7703 2.93821 11H5V9H0V14H2V11.8322C3.28424 13.751 5.49537 15 8 15C11.866 15 15 11.866 15 8H14Z"
      fill="currentColor"
    />
  </svg>
);

// Variable Icon - for variable nodes
export const VariableIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Variable</title>
    <path
      d="M4 3H6L8 8L10 3H12L9 13H7L4 3Z"
      fill="currentColor"
    />
  </svg>
);

// Output Icon - for output nodes
export const OutputIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Output</title>
    <path
      d="M2 2H14V14H2V2ZM4 4V12H12V4H4Z"
      fill="currentColor"
    />
    <path
      d="M6 7H10V9H6V7Z"
      fill="currentColor"
    />
  </svg>
);

// Trigger Icon - for trigger nodes
export const TriggerIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Trigger</title>
    <path
      d="M9 1L4 9H7.5L6 15L12 7H8L9 1Z"
      fill="currentColor"
    />
  </svg>
);

// Action Icon - for action nodes
export const ActionIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Action</title>
    <path
      d="M6 2L10 8L6 14L7 8L6 2Z"
      fill="currentColor"
    />
    <path
      d="M2 8C2 4.68629 4.68629 2 8 2V0C3.58172 0 0 3.58172 0 8C0 12.4183 3.58172 16 8 16V14C4.68629 14 2 11.3137 2 8Z"
      fill="currentColor"
    />
    <path
      d="M14 8C14 11.3137 11.3137 14 8 14V16C12.4183 16 16 12.4183 16 8C16 3.58172 12.4183 0 8 0V2C11.3137 2 14 4.68629 14 8Z"
      fill="currentColor"
    />
  </svg>
);

// Query Icon - for database query nodes
export const QueryIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Query</title>
    <path
      d="M8 1C4.68629 1 2 2.11929 2 3.5V12.5C2 13.8807 4.68629 15 8 15C11.3137 15 14 13.8807 14 12.5V3.5C14 2.11929 11.3137 1 8 1ZM8 3C10.7614 3 12 3.67157 12 4V4.5C12 4.82843 10.7614 5.5 8 5.5C5.23858 5.5 4 4.82843 4 4.5V4C4 3.67157 5.23858 3 8 3ZM8 7C10.7614 7 12 7.67157 12 8V8.5C12 8.82843 10.7614 9.5 8 9.5C5.23858 9.5 4 8.82843 4 8.5V8C4 7.67157 5.23858 7 8 7Z"
      fill="currentColor"
    />
  </svg>
);

// Image Icon - for image generation nodes
export const ImageIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Image</title>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M1 3C1 2.44772 1.44772 2 2 2H14C14.5523 2 15 2.44772 15 3V13C15 13.5523 14.5523 14 14 14H2C1.44772 14 1 13.5523 1 13V3ZM3 4V10L6 7L8 9L11 6L13 8V4H3ZM5 7C5.55228 7 6 6.55228 6 6C6 5.44772 5.55228 5 5 5C4.44772 5 4 5.44772 4 6C4 6.55228 4.44772 7 5 7Z"
      fill="currentColor"
    />
  </svg>
);

// Prompt Icon - for prompt nodes
export const PromptIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Prompt</title>
    <path
      d="M2 3H14V4H2V3Z"
      fill="currentColor"
    />
    <path
      d="M2 6H10V7H2V6Z"
      fill="currentColor"
    />
    <path
      d="M2 9H12V10H2V9Z"
      fill="currentColor"
    />
    <path
      d="M2 12H8V13H2V12Z"
      fill="currentColor"
    />
  </svg>
);

// Chevron Right Icon - for accordion
export const ChevronRightIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Expand</title>
    <path
      d="M6 4L10 8L6 12"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Chevron Down Icon
export const ChevronDownIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Collapse</title>
    <path
      d="M4 6L8 10L12 6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Search Icon
export const SearchIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Search</title>
    <path
      d="M11.5 11.5L15 15M7 13C3.68629 13 1 10.3137 1 7C1 3.68629 3.68629 1 7 1C10.3137 1 13 3.68629 13 7C13 10.3137 10.3137 13 7 13Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Close Icon
export const CloseIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Close</title>
    <path
      d="M4 4L12 12M4 12L12 4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Loading Spinner
export const SpinnerIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="animate-spin"
    {...props}
  >
    <title>Loading</title>
    <circle
      cx="8"
      cy="8"
      r="6"
      stroke="currentColor"
      strokeWidth="2"
      strokeOpacity="0.25"
    />
    <path
      d="M8 2C4.68629 2 2 4.68629 2 8"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

// Get icon for a specific node content type
export function getNodeIcon(contentType: NodeContentType): FC<SVGProps<SVGSVGElement>> {
  switch (contentType) {
    case 'text':
      return TextIcon;
    case 'file':
      return FileIcon;
    case 'prompt':
      return PromptIcon;
    case 'textGeneration':
      return SparklesIcon;
    case 'imageGeneration':
      return ImageIcon;
    case 'codeExecution':
      return CodeIcon;
    case 'apiCall':
      return ApiIcon;
    case 'conditional':
      return ConditionalIcon;
    case 'loop':
      return LoopIcon;
    case 'variable':
      return VariableIcon;
    case 'output':
      return OutputIcon;
    case 'trigger':
      return TriggerIcon;
    case 'action':
      return ActionIcon;
    case 'query':
      return QueryIcon;
    default:
      return SparklesIcon;
  }
}

// NodeIcon component that renders the appropriate icon based on node content
export function NodeIcon({
  node,
  className,
  ...props
}: { node: WorkflowNode } & SVGProps<SVGSVGElement>) {
  const IconComponent = getNodeIcon(node.content.type);
  return <IconComponent className={className} {...props} />;
}
