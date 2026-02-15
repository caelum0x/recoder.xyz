/**
 * Test Data Store
 * Manages test data templates, generated test cases, and generation history.
 * Uses nanostores for state management.
 */

import { atom, map, computed } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('TestDataStore');

// Types
export interface VariableExample {
  key: string;
  value: string;
}

export interface TestCase {
  id: string;
  variables: Record<string, string>;
  createdAt: Date;
  metadata?: {
    strategy?: string;
    templateId?: string;
    distributionAnalysis?: DistributionAnalysis;
  };
}

export interface DistributionAnalysis {
  variableName: string;
  characteristics: {
    avgLength: number;
    minLength: number;
    maxLength: number;
    format?: string;
    tone?: string;
    semanticCategory?: string;
  };
  patterns: string[];
}

export interface TestDataTemplate {
  id: string;
  name: string;
  promptTemplate: string;
  variables: string[];
  examples: VariableExample[][];
  description?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface GenerationHistoryEntry {
  id: string;
  templateId: string;
  templateName: string;
  testCases: TestCase[];
  generatedAt: Date;
  metadata: {
    model: string;
    tokensUsed: number;
    generationTime: number;
    strategy: string;
  };
}

export interface TestDataState {
  templates: Record<string, TestDataTemplate>;
  testCases: Record<string, TestCase>;
  history: GenerationHistoryEntry[];
  selectedTemplateId: string | null;
  selectedTestCaseIds: string[];
  isGenerating: boolean;
  error: string | null;
}

// Storage key for persistence
const STORAGE_KEY = 'recoder_test_data';

// Load initial state from localStorage
function loadState(): Partial<TestDataState> {
  if (typeof window === 'undefined') return {};

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Convert date strings back to Date objects
      if (parsed.templates) {
        for (const template of Object.values(parsed.templates) as TestDataTemplate[]) {
          template.createdAt = new Date(template.createdAt);
          if (template.updatedAt) template.updatedAt = new Date(template.updatedAt);
        }
      }
      if (parsed.testCases) {
        for (const testCase of Object.values(parsed.testCases) as TestCase[]) {
          testCase.createdAt = new Date(testCase.createdAt);
        }
      }
      if (parsed.history) {
        for (const entry of parsed.history as GenerationHistoryEntry[]) {
          entry.generatedAt = new Date(entry.generatedAt);
          for (const tc of entry.testCases) {
            tc.createdAt = new Date(tc.createdAt);
          }
        }
      }
      return parsed;
    }
  } catch (e) {
    logger.error('[TestDataStore] Failed to load state:', e);
  }

  return {};
}

// Save state to localStorage
function saveState(state: TestDataState): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      templates: state.templates,
      testCases: state.testCases,
      history: state.history,
    }));
  } catch (e) {
    logger.error('[TestDataStore] Failed to save state:', e);
  }
}

// Initial state
const initialState = loadState();

// Stores
export const templatesStore = map<Record<string, TestDataTemplate>>(
  initialState.templates || {}
);

export const testCasesStore = map<Record<string, TestCase>>(
  initialState.testCases || {}
);

export const historyStore = atom<GenerationHistoryEntry[]>(
  initialState.history || []
);

export const selectedTemplateIdStore = atom<string | null>(null);

export const selectedTestCaseIdsStore = atom<string[]>([]);

export const isGeneratingStore = atom<boolean>(false);

export const errorStore = atom<string | null>(null);

// Computed stores
export const selectedTemplate = computed(
  [templatesStore, selectedTemplateIdStore],
  (templates, selectedId) => {
    if (!selectedId) return null;
    return templates[selectedId] || null;
  }
);

export const selectedTestCases = computed(
  [testCasesStore, selectedTestCaseIdsStore],
  (testCases, selectedIds) => {
    return selectedIds.map(id => testCases[id]).filter(Boolean);
  }
);

export const templatesList = computed(templatesStore, (templates) => {
  return Object.values(templates).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
});

export const testCasesList = computed(testCasesStore, (testCases) => {
  return Object.values(testCases).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
});

export const testCasesByTemplate = computed(
  [testCasesStore, selectedTemplateIdStore],
  (testCases, templateId) => {
    if (!templateId) return [];
    return Object.values(testCases)
      .filter(tc => tc.metadata?.templateId === templateId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
);

// Subscribe to changes and persist
function subscribeAndPersist() {
  const persistState = () => {
    saveState({
      templates: templatesStore.get(),
      testCases: testCasesStore.get(),
      history: historyStore.get(),
      selectedTemplateId: selectedTemplateIdStore.get(),
      selectedTestCaseIds: selectedTestCaseIdsStore.get(),
      isGenerating: isGeneratingStore.get(),
      error: errorStore.get(),
    });
  };

  templatesStore.subscribe(persistState);
  testCasesStore.subscribe(persistState);
  historyStore.subscribe(persistState);
}

// Initialize persistence in browser
if (typeof window !== 'undefined') {
  subscribeAndPersist();
}

// Template actions
export function addTemplate(template: Omit<TestDataTemplate, 'id' | 'createdAt'>): TestDataTemplate {
  const newTemplate: TestDataTemplate = {
    ...template,
    id: `template_${Date.now()}`,
    createdAt: new Date(),
  };

  templatesStore.setKey(newTemplate.id, newTemplate);
  return newTemplate;
}

export function updateTemplate(
  id: string,
  updates: Partial<Omit<TestDataTemplate, 'id' | 'createdAt'>>
): void {
  const current = templatesStore.get()[id];
  if (!current) return;

  templatesStore.setKey(id, {
    ...current,
    ...updates,
    updatedAt: new Date(),
  });
}

export function deleteTemplate(id: string): void {
  const templates = templatesStore.get();
  const { [id]: _, ...rest } = templates;
  templatesStore.set(rest);

  // Also delete associated test cases
  const testCases = testCasesStore.get();
  const filteredCases: Record<string, TestCase> = {};
  for (const [tcId, tc] of Object.entries(testCases)) {
    if (tc.metadata?.templateId !== id) {
      filteredCases[tcId] = tc;
    }
  }
  testCasesStore.set(filteredCases);

  // Clear selection if deleted template was selected
  if (selectedTemplateIdStore.get() === id) {
    selectedTemplateIdStore.set(null);
  }
}

export function selectTemplate(id: string | null): void {
  selectedTemplateIdStore.set(id);
  selectedTestCaseIdsStore.set([]);
}

// Test case actions
export function addTestCase(testCase: Omit<TestCase, 'id' | 'createdAt'>): TestCase {
  const newTestCase: TestCase = {
    ...testCase,
    id: `tc_${Date.now()}`,
    createdAt: new Date(),
  };

  testCasesStore.setKey(newTestCase.id, newTestCase);
  return newTestCase;
}

export function addTestCases(testCases: TestCase[]): void {
  const current = testCasesStore.get();
  const updated = { ...current };

  for (const tc of testCases) {
    updated[tc.id] = tc;
  }

  testCasesStore.set(updated);
}

export function updateTestCase(
  id: string,
  updates: Partial<Omit<TestCase, 'id' | 'createdAt'>>
): void {
  const current = testCasesStore.get()[id];
  if (!current) return;

  testCasesStore.setKey(id, {
    ...current,
    ...updates,
  });
}

export function deleteTestCase(id: string): void {
  const testCases = testCasesStore.get();
  const { [id]: _, ...rest } = testCases;
  testCasesStore.set(rest);

  // Remove from selection
  const selected = selectedTestCaseIdsStore.get();
  selectedTestCaseIdsStore.set(selected.filter(tcId => tcId !== id));
}

export function selectTestCase(id: string): void {
  const selected = selectedTestCaseIdsStore.get();
  if (!selected.includes(id)) {
    selectedTestCaseIdsStore.set([...selected, id]);
  }
}

export function deselectTestCase(id: string): void {
  const selected = selectedTestCaseIdsStore.get();
  selectedTestCaseIdsStore.set(selected.filter(tcId => tcId !== id));
}

export function toggleTestCaseSelection(id: string): void {
  const selected = selectedTestCaseIdsStore.get();
  if (selected.includes(id)) {
    deselectTestCase(id);
  } else {
    selectTestCase(id);
  }
}

export function clearTestCaseSelection(): void {
  selectedTestCaseIdsStore.set([]);
}

// History actions
export function addHistoryEntry(entry: Omit<GenerationHistoryEntry, 'id' | 'generatedAt'>): void {
  const newEntry: GenerationHistoryEntry = {
    ...entry,
    id: `history_${Date.now()}`,
    generatedAt: new Date(),
  };

  const current = historyStore.get();
  // Keep last 50 entries
  const updated = [newEntry, ...current].slice(0, 50);
  historyStore.set(updated);
}

export function clearHistory(): void {
  historyStore.set([]);
}

// Generation state actions
export function setGenerating(isGenerating: boolean): void {
  isGeneratingStore.set(isGenerating);
}

export function setError(error: string | null): void {
  errorStore.set(error);
}

export function clearError(): void {
  errorStore.set(null);
}

// Utility functions
export function exportTemplates(): string {
  return JSON.stringify(templatesStore.get(), null, 2);
}

export function exportTestCases(): string {
  return JSON.stringify(testCasesStore.get(), null, 2);
}

export function importTemplates(json: string): void {
  try {
    const templates = JSON.parse(json);
    for (const template of Object.values(templates) as TestDataTemplate[]) {
      template.createdAt = new Date(template.createdAt);
      if (template.updatedAt) template.updatedAt = new Date(template.updatedAt);
    }
    templatesStore.set(templates);
  } catch (e) {
    logger.error('[TestDataStore] Failed to import templates:', e);
    throw new Error('Invalid template JSON');
  }
}

export function importTestCases(json: string): void {
  try {
    const testCases = JSON.parse(json);
    for (const tc of Object.values(testCases) as TestCase[]) {
      tc.createdAt = new Date(tc.createdAt);
    }
    testCasesStore.set(testCases);
  } catch (e) {
    logger.error('[TestDataStore] Failed to import test cases:', e);
    throw new Error('Invalid test cases JSON');
  }
}

// Built-in example templates
export const EXAMPLE_TEMPLATES: Omit<TestDataTemplate, 'id' | 'createdAt'>[] = [
  {
    name: 'Code Review Prompt',
    promptTemplate: `Please review the following {{language}} code:

\`\`\`{{language}}
{{code}}
\`\`\`

Focus on:
- Code quality and readability
- Potential bugs or issues
- Performance considerations
- Best practices for {{language}}`,
    variables: ['language', 'code'],
    examples: [
      [
        { key: 'language', value: 'TypeScript' },
        { key: 'code', value: 'function add(a: number, b: number): number {\n  return a + b;\n}' },
      ],
      [
        { key: 'language', value: 'Python' },
        { key: 'code', value: 'def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n-1)' },
      ],
    ],
    description: 'A template for generating code review requests',
  },
  {
    name: 'API Documentation',
    promptTemplate: `Generate documentation for the following API endpoint:

Endpoint: {{method}} {{path}}
Description: {{description}}

Parameters:
{{parameters}}

Response format:
{{responseFormat}}`,
    variables: ['method', 'path', 'description', 'parameters', 'responseFormat'],
    examples: [
      [
        { key: 'method', value: 'GET' },
        { key: 'path', value: '/api/users/:id' },
        { key: 'description', value: 'Retrieve a user by their unique identifier' },
        { key: 'parameters', value: 'id (path): The unique user ID (required)' },
        { key: 'responseFormat', value: '{ "id": "string", "name": "string", "email": "string" }' },
      ],
    ],
    description: 'A template for generating API documentation',
  },
  {
    name: 'Bug Report Template',
    promptTemplate: `Bug Report

**Summary:** {{summary}}

**Steps to Reproduce:**
{{steps}}

**Expected Behavior:**
{{expected}}

**Actual Behavior:**
{{actual}}

**Environment:**
{{environment}}`,
    variables: ['summary', 'steps', 'expected', 'actual', 'environment'],
    examples: [
      [
        { key: 'summary', value: 'Login button unresponsive on mobile' },
        { key: 'steps', value: '1. Open app on mobile device\n2. Enter credentials\n3. Tap login button' },
        { key: 'expected', value: 'User should be logged in and redirected to dashboard' },
        { key: 'actual', value: 'Nothing happens when tapping the login button' },
        { key: 'environment', value: 'iOS 17.2, Safari, iPhone 15 Pro' },
      ],
    ],
    description: 'A template for structured bug reports',
  },
];

// Initialize example templates on first load
export function initializeExampleTemplates(): void {
  const templates = templatesStore.get();
  if (Object.keys(templates).length === 0) {
    for (const template of EXAMPLE_TEMPLATES) {
      addTemplate(template);
    }
  }
}
