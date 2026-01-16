/**
 * Few-shot examples for agentic AI behavior
 * These examples teach the AI to explore before acting
 */

export interface FewShotMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Example: Fixing a missing dependency error
 */
export const fixMissingDependencyExample: FewShotMessage[] = [
  {
    role: 'user',
    content: `Fix this error: Failed to resolve import "date-fns" from "src/utils/date.ts"`
  },
  {
    role: 'assistant',
    content: `I'll investigate this error by first checking what's installed.

<recoderArtifact id="investigate-error" title="Investigate missing dependency">
<recoderAction type="readFile" filePath="package.json">Check if date-fns is in dependencies</recoderAction>
</recoderArtifact>`
  },
  {
    role: 'user',
    content: `[readFile result]
{
  "name": "my-app",
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}`
  },
  {
    role: 'assistant',
    content: `I see date-fns is not in the dependencies. I'll add it and install.

<recoderArtifact id="fix-dependency" title="Add date-fns dependency">
<recoderAction type="file" filePath="package.json">
{
  "name": "my-app",
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "date-fns": "^3.0.0"
  }
}
</recoderAction>
<recoderAction type="shell">npm install</recoderAction>
</recoderArtifact>

The error should be fixed now. I added date-fns to package.json and ran npm install.`
  }
];

/**
 * Example: Fixing a "React is not defined" error
 */
export const fixReactNotDefinedExample: FewShotMessage[] = [
  {
    role: 'user',
    content: `Fix this error: React is not defined at src/components/Button.tsx:5`
  },
  {
    role: 'assistant',
    content: `I'll read the file to see what's missing.

<recoderArtifact id="investigate-error" title="Read error file">
<recoderAction type="readFile" filePath="src/components/Button.tsx">Check the imports</recoderAction>
</recoderArtifact>`
  },
  {
    role: 'user',
    content: `[readFile result]
export function Button({ children, onClick }) {
  return (
    <button onClick={onClick} className="btn">
      {children}
    </button>
  );
}`
  },
  {
    role: 'assistant',
    content: `The file is missing the React import. I'll add it at the top.

<recoderArtifact id="fix-import" title="Add React import">
<recoderAction type="file" filePath="src/components/Button.tsx">
import React from 'react';

export function Button({ children, onClick }) {
  return (
    <button onClick={onClick} className="btn">
      {children}
    </button>
  );
}
</recoderAction>
</recoderArtifact>

Fixed! Added the missing \`import React from 'react'\` at the top of the file.`
  }
];

/**
 * Example: Adding a new feature by exploring first
 */
export const addFeatureExample: FewShotMessage[] = [
  {
    role: 'user',
    content: `Add a dark mode toggle to the app`
  },
  {
    role: 'assistant',
    content: `I'll first explore the codebase to understand the current structure.

<recoderArtifact id="explore-codebase" title="Explore project structure">
<recoderAction type="listFiles" path="src" recursive="true">See project structure</recoderAction>
<recoderAction type="readFile" filePath="src/App.tsx">Read main component</recoderAction>
<recoderAction type="searchFiles" query="theme" filePattern="*.tsx">Find existing theme code</recoderAction>
</recoderArtifact>`
  }
];

/**
 * Get few-shot examples based on the user's message
 */
export function getFewShotExamples(userMessage: string): FewShotMessage[] {
  const lowerMessage = userMessage.toLowerCase();
  
  // Error fixing scenarios
  if (lowerMessage.includes('fix') || lowerMessage.includes('error')) {
    if (lowerMessage.includes('cannot find module') || 
        lowerMessage.includes('failed to resolve import') ||
        lowerMessage.includes('module not found')) {
      return fixMissingDependencyExample;
    }
    if (lowerMessage.includes('is not defined') || 
        lowerMessage.includes('react is not defined')) {
      return fixReactNotDefinedExample;
    }
    // Generic error - use dependency example as it shows the explore pattern
    return fixMissingDependencyExample;
  }
  
  // Feature addition - show exploration pattern
  if (lowerMessage.includes('add') || lowerMessage.includes('create') || lowerMessage.includes('implement')) {
    return addFeatureExample;
  }
  
  // Default: no few-shot (let system prompt guide)
  return [];
}

/**
 * Convert few-shot examples to message format for API
 */
export function injectFewShotExamples(
  messages: Array<{ role: string; content: string }>,
  userMessage: string
): Array<{ role: string; content: string }> {
  const examples = getFewShotExamples(userMessage);
  
  if (examples.length === 0) {
    return messages;
  }
  
  // Insert examples at the beginning (after system message if present)
  const systemMessages = messages.filter(m => m.role === 'system');
  const otherMessages = messages.filter(m => m.role !== 'system');
  
  return [
    ...systemMessages,
    // Add a context message explaining the examples
    {
      role: 'system',
      content: `Here's an example of how to handle similar requests correctly (explore first, then fix):`
    },
    ...examples,
    {
      role: 'system', 
      content: `Now handle the user's actual request using the same pattern - explore first, then make minimal targeted changes.`
    },
    ...otherMessages
  ];
}
