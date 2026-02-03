/**
 * Code Snippets for CodeMirror
 * Provides common code patterns for React, TypeScript, and JavaScript
 */

import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { snippetCompletion } from '@codemirror/autocomplete';

// ============================================
// Snippet Definitions
// ============================================

interface SnippetDef {
  label: string;
  detail: string;
  info?: string;
  template: string;
  type?: string;
}

// Helper to create placeholder: #{n:text} format for CodeMirror snippets
// CodeMirror uses #{} for final cursor, #{n} for numbered tab stops, #{n:placeholder} for placeholders

// React Component Snippets
const reactSnippets: SnippetDef[] = [
  {
    label: 'rfc',
    detail: 'React Functional Component',
    info: 'Creates a React functional component with TypeScript props interface',
    template: 'interface #{1:Component}Props {\n  #{2:// props}\n}\n\nexport function #{1:Component}({ #{3} }: #{1:Component}Props) {\n  return (\n    <div>\n      #{}\n    </div>\n  );\n}',
    type: 'snippet',
  },
  {
    label: 'rfce',
    detail: 'React Functional Component with Export',
    info: 'Creates a React functional component with default export',
    template: 'interface #{1:Component}Props {\n  #{2:// props}\n}\n\nfunction #{1:Component}({ #{3} }: #{1:Component}Props) {\n  return (\n    <div>\n      #{}\n    </div>\n  );\n}\n\nexport default #{1:Component};',
    type: 'snippet',
  },
  {
    label: 'rafce',
    detail: 'React Arrow Function Component',
    info: 'Creates a React arrow function component with default export',
    template: 'interface #{1:Component}Props {\n  #{2:// props}\n}\n\nconst #{1:Component} = ({ #{3} }: #{1:Component}Props) => {\n  return (\n    <div>\n      #{}\n    </div>\n  );\n};\n\nexport default #{1:Component};',
    type: 'snippet',
  },
  {
    label: 'rmc',
    detail: 'React Memo Component',
    info: 'Creates a memoized React component',
    template: "import { memo } from 'react';\n\ninterface #{1:Component}Props {\n  #{2:// props}\n}\n\nexport const #{1:Component} = memo(function #{1:Component}({ #{3} }: #{1:Component}Props) {\n  return (\n    <div>\n      #{}\n    </div>\n  );\n});",
    type: 'snippet',
  },
];

// React Hooks Snippets
const hooksSnippets: SnippetDef[] = [
  {
    label: 'useS',
    detail: 'useState Hook',
    info: 'Creates a useState hook with TypeScript type',
    template: 'const [#{1:state}, set#{2:State}] = useState<#{3:Type}>(#{4:initialValue});',
    type: 'snippet',
  },
  {
    label: 'useE',
    detail: 'useEffect Hook',
    info: 'Creates a useEffect hook with cleanup',
    template: 'useEffect(() => {\n  #{1:// effect}\n\n  return () => {\n    #{2:// cleanup}\n  };\n}, [#{3:dependencies}]);',
    type: 'snippet',
  },
  {
    label: 'useEf',
    detail: 'useEffect Hook (simple)',
    info: 'Creates a simple useEffect hook',
    template: 'useEffect(() => {\n  #{}\n}, [#{1:dependencies}]);',
    type: 'snippet',
  },
  {
    label: 'useR',
    detail: 'useRef Hook',
    info: 'Creates a useRef hook with TypeScript type',
    template: 'const #{1:ref} = useRef<#{2:Type}>(#{3:null});',
    type: 'snippet',
  },
  {
    label: 'useC',
    detail: 'useCallback Hook',
    info: 'Creates a useCallback hook',
    template: 'const #{1:callback} = useCallback((#{2:args}) => {\n  #{}\n}, [#{3:dependencies}]);',
    type: 'snippet',
  },
  {
    label: 'useM',
    detail: 'useMemo Hook',
    info: 'Creates a useMemo hook',
    template: 'const #{1:memoized} = useMemo(() => {\n  return #{};\n}, [#{2:dependencies}]);',
    type: 'snippet',
  },
  {
    label: 'useCx',
    detail: 'useContext Hook',
    info: 'Creates a useContext hook',
    template: 'const #{1:context} = useContext(#{2:Context});',
    type: 'snippet',
  },
  {
    label: 'useRd',
    detail: 'useReducer Hook',
    info: 'Creates a useReducer hook',
    template: 'const [#{1:state}, dispatch] = useReducer(#{2:reducer}, #{3:initialState});',
    type: 'snippet',
  },
];

// TypeScript Snippets
const typescriptSnippets: SnippetDef[] = [
  {
    label: 'interface',
    detail: 'TypeScript Interface',
    info: 'Creates a TypeScript interface',
    template: 'interface #{1:Name} {\n  #{}\n}',
    type: 'interface',
  },
  {
    label: 'type',
    detail: 'TypeScript Type Alias',
    info: 'Creates a TypeScript type alias',
    template: 'type #{1:Name} = #{};',
    type: 'type',
  },
  {
    label: 'enum',
    detail: 'TypeScript Enum',
    info: 'Creates a TypeScript enum',
    template: 'enum #{1:Name} {\n  #{}\n}',
    type: 'enum',
  },
  {
    label: 'tsfn',
    detail: 'TypeScript Function',
    info: 'Creates a typed function',
    template: 'function #{1:name}(#{2:params}): #{3:ReturnType} {\n  #{}\n}',
    type: 'function',
  },
  {
    label: 'tsafn',
    detail: 'TypeScript Arrow Function',
    info: 'Creates a typed arrow function',
    template: 'const #{1:name} = (#{2:params}): #{3:ReturnType} => {\n  #{}\n};',
    type: 'function',
  },
  {
    label: 'tscls',
    detail: 'TypeScript Class',
    info: 'Creates a TypeScript class',
    template: 'class #{1:Name} {\n  constructor(#{2:params}) {\n    #{}\n  }\n}',
    type: 'class',
  },
];

// JavaScript General Snippets
const jsSnippets: SnippetDef[] = [
  {
    label: 'clg',
    detail: 'console.log',
    info: 'Log to console',
    template: 'console.log(#{});',
    type: 'function',
  },
  {
    label: 'cle',
    detail: 'console.error',
    info: 'Log error to console',
    template: 'console.error(#{});',
    type: 'function',
  },
  {
    label: 'clw',
    detail: 'console.warn',
    info: 'Log warning to console',
    template: 'console.warn(#{});',
    type: 'function',
  },
  {
    label: 'imp',
    detail: 'import statement',
    info: 'Import module',
    template: "import { #{1} } from '#{2}';",
    type: 'keyword',
  },
  {
    label: 'impd',
    detail: 'import default',
    info: 'Import default export',
    template: "import #{1} from '#{2}';",
    type: 'keyword',
  },
  {
    label: 'impa',
    detail: 'import all',
    info: 'Import all as namespace',
    template: "import * as #{1} from '#{2}';",
    type: 'keyword',
  },
  {
    label: 'exp',
    detail: 'export',
    info: 'Export named',
    template: 'export { #{} };',
    type: 'keyword',
  },
  {
    label: 'expd',
    detail: 'export default',
    info: 'Export default',
    template: 'export default #{};',
    type: 'keyword',
  },
  {
    label: 'expf',
    detail: 'export function',
    info: 'Export named function',
    template: 'export function #{1:name}(#{2:params}) {\n  #{}\n}',
    type: 'function',
  },
  {
    label: 'expc',
    detail: 'export const',
    info: 'Export named constant',
    template: 'export const #{1:name} = #{};',
    type: 'constant',
  },
  {
    label: 'afn',
    detail: 'arrow function',
    info: 'Arrow function expression',
    template: '(#{1:params}) => {\n  #{}\n}',
    type: 'function',
  },
  {
    label: 'afns',
    detail: 'arrow function (short)',
    info: 'Short arrow function expression',
    template: '(#{1:params}) => #{}',
    type: 'function',
  },
  {
    label: 'fn',
    detail: 'function',
    info: 'Function declaration',
    template: 'function #{1:name}(#{2:params}) {\n  #{}\n}',
    type: 'function',
  },
  {
    label: 'trycatch',
    detail: 'try-catch block',
    info: 'Try-catch error handling',
    template: 'try {\n  #{1}\n} catch (#{2:error}) {\n  #{}\n}',
    type: 'keyword',
  },
  {
    label: 'tryfinally',
    detail: 'try-catch-finally',
    info: 'Try-catch-finally error handling',
    template: 'try {\n  #{1}\n} catch (#{2:error}) {\n  #{3}\n} finally {\n  #{}\n}',
    type: 'keyword',
  },
  {
    label: 'forof',
    detail: 'for...of loop',
    info: 'Iterate over iterable',
    template: 'for (const #{1:item} of #{2:items}) {\n  #{}\n}',
    type: 'keyword',
  },
  {
    label: 'forin',
    detail: 'for...in loop',
    info: 'Iterate over object keys',
    template: 'for (const #{1:key} in #{2:object}) {\n  #{}\n}',
    type: 'keyword',
  },
  {
    label: 'fori',
    detail: 'for loop',
    info: 'Classic for loop',
    template: 'for (let #{1:i} = 0; #{1:i} < #{2:length}; #{1:i}++) {\n  #{}\n}',
    type: 'keyword',
  },
];

// Async/Promise Snippets
const asyncSnippets: SnippetDef[] = [
  {
    label: 'asyncfn',
    detail: 'async function',
    info: 'Async function declaration',
    template: 'async function #{1:name}(#{2:params}): Promise<#{3:void}> {\n  #{}\n}',
    type: 'function',
  },
  {
    label: 'asyncafn',
    detail: 'async arrow function',
    info: 'Async arrow function expression',
    template: 'const #{1:name} = async (#{2:params}): Promise<#{3:void}> => {\n  #{}\n};',
    type: 'function',
  },
  {
    label: 'prom',
    detail: 'new Promise',
    info: 'Create a new Promise',
    template: 'new Promise((resolve, reject) => {\n  #{}\n})',
    type: 'function',
  },
  {
    label: 'thenc',
    detail: '.then().catch()',
    info: 'Promise then/catch chain',
    template: '.then((#{1:result}) => {\n  #{2}\n}).catch((#{3:error}) => {\n  #{}\n})',
    type: 'function',
  },
  {
    label: 'await',
    detail: 'await expression',
    info: 'Await promise',
    template: 'const #{1:result} = await #{};',
    type: 'keyword',
  },
];

// Test Snippets (Jest/Vitest)
const testSnippets: SnippetDef[] = [
  {
    label: 'desc',
    detail: 'describe block',
    info: 'Test describe block',
    template: "describe('#{1:description}', () => {\n  #{}\n});",
    type: 'function',
  },
  {
    label: 'it',
    detail: 'it block',
    info: 'Test it block',
    template: "it('#{1:should}', () => {\n  #{}\n});",
    type: 'function',
  },
  {
    label: 'ita',
    detail: 'async it block',
    info: 'Async test it block',
    template: "it('#{1:should}', async () => {\n  #{}\n});",
    type: 'function',
  },
  {
    label: 'test',
    detail: 'test block',
    info: 'Test block',
    template: "test('#{1:description}', () => {\n  #{}\n});",
    type: 'function',
  },
  {
    label: 'testa',
    detail: 'async test block',
    info: 'Async test block',
    template: "test('#{1:description}', async () => {\n  #{}\n});",
    type: 'function',
  },
  {
    label: 'expct',
    detail: 'expect assertion',
    info: 'Expect assertion',
    template: 'expect(#{1:actual}).#{2:toBe}(#{3:expected});',
    type: 'function',
  },
  {
    label: 'beforeE',
    detail: 'beforeEach',
    info: 'Before each test hook',
    template: 'beforeEach(() => {\n  #{}\n});',
    type: 'function',
  },
  {
    label: 'afterE',
    detail: 'afterEach',
    info: 'After each test hook',
    template: 'afterEach(() => {\n  #{}\n});',
    type: 'function',
  },
];

// ============================================
// Snippet Conversion
// ============================================

/**
 * Create CodeMirror Completion from snippet definition
 * Templates are already in CodeMirror #{} format
 */
function createSnippetCompletion(def: SnippetDef): Completion {
  return snippetCompletion(def.template, {
    label: def.label,
    detail: def.detail,
    info: def.info,
    type: def.type || 'text',
    boost: 10, // Boost snippets above other completions
  });
}

// ============================================
// Snippet Collections by Language
// ============================================

const allSnippets = [
  ...reactSnippets,
  ...hooksSnippets,
  ...typescriptSnippets,
  ...jsSnippets,
  ...asyncSnippets,
  ...testSnippets,
];

const jsOnlySnippets = [
  ...jsSnippets,
  ...asyncSnippets,
];

const tsOnlySnippets = [
  ...typescriptSnippets,
  ...jsSnippets,
  ...asyncSnippets,
];

const reactTsSnippets = [
  ...reactSnippets,
  ...hooksSnippets,
  ...typescriptSnippets,
  ...jsSnippets,
  ...asyncSnippets,
];

const testOnlySnippets = [
  ...testSnippets,
  ...jsSnippets,
];

// Pre-built completion arrays
const allCompletions = allSnippets.map(createSnippetCompletion);
const jsCompletions = jsOnlySnippets.map(createSnippetCompletion);
const tsCompletions = tsOnlySnippets.map(createSnippetCompletion);
const reactTsCompletions = reactTsSnippets.map(createSnippetCompletion);
const testCompletions = testOnlySnippets.map(createSnippetCompletion);

// ============================================
// Snippet Source Factory
// ============================================

/**
 * Get appropriate snippets based on file extension
 */
function getSnippetsForFile(filePath: string): Completion[] {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  const fileName = filePath.substring(filePath.lastIndexOf('/') + 1).toLowerCase();

  // Test files
  if (fileName.includes('.test.') || fileName.includes('.spec.')) {
    return testCompletions;
  }

  // React TypeScript files
  if (ext === '.tsx') {
    return reactTsCompletions;
  }

  // React JavaScript files
  if (ext === '.jsx') {
    return [...reactSnippets, ...hooksSnippets, ...jsSnippets, ...asyncSnippets].map(createSnippetCompletion);
  }

  // TypeScript files
  if (ext === '.ts' || ext === '.mts' || ext === '.cts') {
    return tsCompletions;
  }

  // JavaScript files
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    return jsCompletions;
  }

  return [];
}

/**
 * Create a snippet completion source for CodeMirror
 * Returns a function that can be used with autocompletion({ override: [...] })
 */
export function snippetCompletionSource(filePath: string) {
  const snippets = getSnippetsForFile(filePath);

  return function snippetSource(context: CompletionContext): CompletionResult | null {
    // Only show snippets when typing a word
    const word = context.matchBefore(/\w+/);
    if (!word && !context.explicit) {
      return null;
    }

    // Filter snippets that match the typed word
    const from = word ? word.from : context.pos;
    const typed = word ? word.text.toLowerCase() : '';

    const matches = typed
      ? snippets.filter(s => s.label.toLowerCase().startsWith(typed))
      : snippets;

    if (matches.length === 0) {
      return null;
    }

    return {
      from,
      options: matches,
      validFor: /^\w*$/,
    };
  };
}

/**
 * Get all available snippet completions for a file
 * Useful for integrating with existing autocompletion
 */
export function getFileSnippets(filePath: string): Completion[] {
  return getSnippetsForFile(filePath);
}

/**
 * Get all available snippets (for documentation or UI)
 */
export function getAllSnippetDefinitions(): SnippetDef[] {
  return allSnippets;
}

export default snippetCompletionSource;
