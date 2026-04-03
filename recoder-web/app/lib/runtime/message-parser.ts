import type { ActionType, RecoderAction, RecoderActionData, FileAction, ShellAction, ImportStarterAction, CloneGitHubAction, CloneUrlAction, SpawnTaskAction, SwitchModeAction, MultiApplyDiffAction, DiffOperation, WebSearchAction, WebFetchAction, WebCrawlAction, GitHubDocumentsAction, CopyProjectAction, DelegateSubagentAction } from '~/types/actions';
import type { RecoderArtifactData } from '~/types/artifact';
import { unreachable } from '~/utils/unreachable';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('MessageParserRuntime');

const ARTIFACT_TAG_OPEN = '<recoderArtifact';
const ARTIFACT_TAG_CLOSE = '</recoderArtifact>';
const ARTIFACT_ACTION_TAG_OPEN = '<recoderAction';
const ARTIFACT_ACTION_TAG_CLOSE = '</recoderAction>';

const REGEX_CACHE = {
  doubleQuotes: (attr: string) => new RegExp(`${attr}="([^"]*)"`, 'i'),
  singleQuotes: (attr: string) => new RegExp(`${attr}='([^']*)'`, 'i'),
  noQuotes: (attr: string) => new RegExp(`${attr}=([^\\s>]+)`, 'i'),
  aggressivePath: /(?:filePath|filepath|path)\s*=\s*["']?([^"'\s>]+)["']?/i,
};

const ACTION_TYPE_ALIASES: Record<string, ActionType> = {
  createFile: 'file',
  createFiles: 'file',
  runShellCommand: 'shell',
  importStarterTemplate: 'importStarter',
  cloneGitHubRepo: 'cloneGitHub',
  readManyFiles: 'read_many_files',
  strReplace: 'str_replace',
  editFile: 'edit_file',
  delegateSubagent: 'delegate_subagent',
  webSearch: 'web_search',
  webFetch: 'web_fetch',
  webCrawl: 'web_crawl',
  memory: 'memory_operation',
  ripGrep: 'ripgrep_search',
  glob: 'glob_search',
  copyProject: 'copy_project',
};

function validateShellCommand(content: string): { valid: boolean; reason?: string } {
  const normalized = content.replace(/\n/g, ' ').toLowerCase();
  const forbiddenPatterns = [
    { pattern: /rm\s+-rf\s+\/\s*$/, name: 'rm -rf /' },
    { pattern: /rm\s+-rf\s+~\s*$/, name: 'rm -rf ~' },
    { pattern: /:\(\)\{\s*:\|:\&\s*\};:/, name: 'fork bomb' },
    { pattern: /mkfs\./, name: 'disk formatting' },
    { pattern: /dd\s+if=/, name: 'direct disk write' },
  ];

  for (const { pattern, name } of forbiddenPatterns) {
    if (pattern.test(normalized)) {
      return { valid: false, reason: `Dangerous command blocked: "${name}"` };
    }
  }
  return { valid: true };
}

export interface ArtifactCallbackData extends RecoderArtifactData {
  messageId: string;
}

export interface ActionCallbackData {
  artifactId: string;
  messageId: string;
  actionId: string;
  action: RecoderAction;
}

export type ArtifactCallback = (data: ArtifactCallbackData) => void;
export type ActionCallback = (data: ActionCallbackData) => void;

export interface ParserCallbacks {
  onArtifactOpen?: ArtifactCallback;
  onArtifactClose?: ArtifactCallback;
  onActionOpen?: ActionCallback;
  onActionClose?: ActionCallback;
}

interface ElementFactoryProps {
  messageId: string;
}

type ElementFactory = (props: ElementFactoryProps) => string;

export interface StreamingMessageParserOptions {
  callbacks?: ParserCallbacks;
  artifactElement?: ElementFactory;
}

interface MessageState {
  position: number;
  insideArtifact: boolean;
  insideAction: boolean;
  currentArtifact?: RecoderArtifactData;
  currentAction: RecoderActionData;
  actionId: number;
  parseAttempts: number;
  artifactsFound: number;
  actionsFound: number;
}

export class StreamingMessageParser {
  #messages = new Map<string, MessageState>();

  constructor(private _options: StreamingMessageParserOptions = {}) {}

  /**
   * Sanitize LLM output to fix common XML issues:
   * - Unquoted attributes: filePath=src/App.tsx → filePath="src/App.tsx"
   * - Double-opening artifacts (AI outputs two <recoderArtifact> tags without closing)
   * - Double-opening actions (AI outputs two <recoderAction> tags without closing)
   */
  #sanitizeInput(input: string): string {
    let sanitized = input;

    // Strip markdown code fences that some models wrap around XML tags
    // e.g., ```xml\n<recoderArtifact...>\n``` → <recoderArtifact...>
    sanitized = sanitized.replace(
      /```(?:xml|html|jsx|tsx)?\s*\n?(<recoderArtifact[\s\S]*?<\/recoderArtifact>)\s*\n?```/g,
      '$1'
    );
    sanitized = sanitized.replace(
      /```(?:xml|html|jsx|tsx)?\s*\n?(<recoderAction[\s\S]*?<\/recoderAction>)\s*\n?```/g,
      '$1'
    );

    // Fix unquoted attributes in recoderAction tags
    // Match: attribute=value where value has no quotes and is not already quoted
    sanitized = sanitized.replace(
      /(<recoderAction[^>]*\s)(filePath|type|templateId|repoUrl|reason|url|query|filePattern|path|recursive|oldString|newString|targetMode|mode|taskDescription|context|commitMessage|agentType|strict|maxResults|maxUses|providerHint|allowedDomains|blockedDomains|sourceProjectId|newProjectName|includeGit|includeGitRemotes|includeTriggers|includeEnvFiles|includeSecrets|includeDeployConfig|includeDomains|owner|repo|accessToken|sourceType|maxDocuments)=([^"'\s>][^\s>]*)/g,
      '$1$2="$3"'
    );

    // Fix unquoted attributes in recoderArtifact tags
    sanitized = sanitized.replace(
      /(<recoderArtifact[^>]*\s)(id|title)=([^"'\s>][^\s>]*)/g,
      '$1$2="$3"'
    );

    // Fix double-opening artifacts: two <recoderArtifact without a close between them
    // Remove the duplicate opening tag (keep the first one)
    sanitized = sanitized.replace(
      /(<recoderArtifact\s[^>]*>)\s*<recoderArtifact\s[^>]*>/g,
      '$1',
    );

    // Fix double-opening actions: two <recoderAction without a close between them
    sanitized = sanitized.replace(
      /(<recoderAction\s[^>]*>)\s*<recoderAction\s[^>]*>/g,
      '$1',
    );

    return sanitized;
  }

  parse(messageId: string, input: string) {
    let state = this.#messages.get(messageId);

    if (!state) {
      state = {
        position: 0,
        insideAction: false,
        insideArtifact: false,
        currentAction: { content: '' },
        actionId: 0,
        parseAttempts: 0,
        artifactsFound: 0,
        actionsFound: 0,
      };
      this.#messages.set(messageId, state);
    }

    // Sanitize only the unparsed portion to avoid shifting already-parsed positions
    if (state.position < input.length) {
      const parsed = input.slice(0, state.position);
      const unparsed = input.slice(state.position);
      const sanitized = this.#sanitizeInput(unparsed);
      if (sanitized !== unparsed) {
        input = parsed + sanitized;
      }
    }

    state.parseAttempts++;
    if (state.parseAttempts > 100000) {
      logger.error('Parser safety limit reached after 100k parse calls');
      return input.substring(state.position);
    }

    let output = '';
    let i = state.position;
    let earlyBreak = false;

    while (i < input.length) {
      if (state.insideArtifact) {
        const currentArtifact = state.currentArtifact;
        if (currentArtifact === undefined) {
          unreachable('Artifact not initialized');
        }

        if (state.insideAction) {
          const closeIndex = input.indexOf(ARTIFACT_ACTION_TAG_CLOSE, i);
          const currentAction = state.currentAction;

          if (closeIndex !== -1) {
            currentAction.content = (currentAction.content || '') + input.slice(i, closeIndex);
            let content = (currentAction.content || '').trim();

            if ('type' in currentAction && currentAction.type === 'file') {
              content += '\n';
            }

            currentAction.content = content;

            if ('type' in currentAction && currentAction.type === 'shell') {
              const validation = validateShellCommand(content);
              if (!validation.valid) {
                // Convert blocked shell command to a file action
                (currentAction as unknown as FileAction).type = 'file';
                (currentAction as unknown as FileAction).filePath = 'README-BLOCKED-COMMAND.md';
                currentAction.content = `# ⚠️ Blocked Command\n\n${validation.reason}\n`;
              }
            }

            // Parse multi_apply_diff content into diff operations
            if ('type' in currentAction && currentAction.type === 'multi_apply_diff') {
              const diffs = this.#parseMultiDiffContent(content);
              (currentAction as MultiApplyDiffAction).diffs = diffs;
            }

            this._options.callbacks?.onActionClose?.({
              artifactId: currentArtifact.id,
              messageId,
              actionId: String(state.actionId - 1),
              action: currentAction as RecoderAction,
            });

            state.insideAction = false;
            state.currentAction = { content: '' };
            i = closeIndex + ARTIFACT_ACTION_TAG_CLOSE.length;
          } else {
            break;
          }
        } else {
          const actionOpenIndex = input.indexOf(ARTIFACT_ACTION_TAG_OPEN, i);
          const artifactCloseIndex = input.indexOf(ARTIFACT_TAG_CLOSE, i);

          if (actionOpenIndex !== -1 && (artifactCloseIndex === -1 || actionOpenIndex < artifactCloseIndex)) {
            const actionEndIndex = input.indexOf('>', actionOpenIndex);

            if (actionEndIndex !== -1) {
              state.insideAction = true;
              state.actionsFound++;
              state.currentAction = this.#parseActionTag(input, actionOpenIndex, actionEndIndex);

              this._options.callbacks?.onActionOpen?.({
                artifactId: currentArtifact.id,
                messageId,
                actionId: String(state.actionId++),
                action: state.currentAction as RecoderAction,
              });

              i = actionEndIndex + 1;
            } else {
              break;
            }
          } else if (artifactCloseIndex !== -1) {
            this._options.callbacks?.onArtifactClose?.({ messageId, ...currentArtifact });
            state.insideArtifact = false;
            state.currentArtifact = undefined;
            i = artifactCloseIndex + ARTIFACT_TAG_CLOSE.length;
          } else {
            break;
          }
        }
      } else if (input[i] === '<' && input[i + 1] !== '/') {
        let j = i;
        let potentialTag = '';

        while (j < input.length && potentialTag.length < ARTIFACT_TAG_OPEN.length) {
          potentialTag += input[j];

          if (potentialTag === ARTIFACT_TAG_OPEN) {
            const nextChar = input[j + 1];

            // Accept any whitespace (space, tab, newline) or '>' after tag name
            // LLMs sometimes output multiline tags like <recoderArtifact\n  id="...">
            if (nextChar && nextChar !== '>' && nextChar !== ' ' && nextChar !== '\n' && nextChar !== '\r' && nextChar !== '\t') {
              output += input.slice(i, j + 1);
              i = j + 1;
              break;
            }

            const openTagEnd = input.indexOf('>', j);

            if (openTagEnd !== -1) {
              const artifactTag = input.slice(i, openTagEnd + 1);
              const artifactTitle = this.#extractAttribute(artifactTag, 'title') as string;
              const artifactId = this.#extractAttribute(artifactTag, 'id') as string;

              state.insideArtifact = true;
              state.artifactsFound++;
              const currentArtifact = { id: artifactId, title: artifactTitle } satisfies RecoderArtifactData;
              state.currentArtifact = currentArtifact;

              this._options.callbacks?.onArtifactOpen?.({ messageId, ...currentArtifact });

              const artifactFactory = this._options.artifactElement ?? createArtifactElement;
              output += artifactFactory({ messageId });
              i = openTagEnd + 1;
            } else {
              earlyBreak = true;
            }
            break;
          } else if (!ARTIFACT_TAG_OPEN.startsWith(potentialTag)) {
            output += input.slice(i, j + 1);
            i = j + 1;
            break;
          }
          j++;
        }

        if (j === input.length && ARTIFACT_TAG_OPEN.startsWith(potentialTag)) {
          break;
        }
      } else {
        output += input[i];
        i++;
      }

      if (earlyBreak) {
        break;
      }
    }

    state.position = i;
    return output;
  }

  getStats(messageId: string): { artifactsFound: number; actionsFound: number; position: number; inputLength: number } | null {
    const state = this.#messages.get(messageId);
    if (!state) return null;
    return {
      artifactsFound: state.artifactsFound,
      actionsFound: state.actionsFound,
      position: state.position,
      inputLength: 0, // caller can compare with message length
    };
  }

  reset() {
    this.#messages.clear();
  }

  #parseActionTag(input: string, actionOpenIndex: number, actionEndIndex: number) {
    const actionTag = input.slice(actionOpenIndex, actionEndIndex + 1);
    const rawActionType = this.#extractAttribute(actionTag, 'type');
    const actionType = this.#normalizeActionType(rawActionType);

    const actionAttributes = { type: actionType, content: '' };

    if (actionType === 'file') {
      let filePath = this.#extractAttribute(actionTag, 'filePath') as string;
      if (!filePath) filePath = this.#extractAttribute(actionTag, 'filepath') as string;
      if (!filePath) filePath = this.#extractAttribute(actionTag, 'path') as string;
      if (!filePath) {
        const pathMatch = actionTag.match(REGEX_CACHE.aggressivePath);
        if (pathMatch) filePath = pathMatch[1];
      }
      if (!filePath) filePath = 'unknown-file.txt';
      (actionAttributes as FileAction).filePath = filePath;
    } else if (actionType === 'importStarter') {
      const templateId = this.#extractAttribute(actionTag, 'templateId') as string;
      const reason = this.#extractAttribute(actionTag, 'reason') as string;
      (actionAttributes as ImportStarterAction).templateId = templateId || 'unknown';
      (actionAttributes as ImportStarterAction).reason = reason || '';
    } else if (actionType === 'cloneGitHub') {
      const repoUrl = this.#extractAttribute(actionTag, 'repoUrl') as string;
      const reason = this.#extractAttribute(actionTag, 'reason') as string;
      (actionAttributes as CloneGitHubAction).repoUrl = repoUrl || '';
      (actionAttributes as CloneGitHubAction).reason = reason || '';
    } else if (actionType === 'cloneUrl') {
      const url = this.#extractAttribute(actionTag, 'url') as string;
      const reason = this.#extractAttribute(actionTag, 'reason') as string;
      (actionAttributes as CloneUrlAction).url = url || '';
      (actionAttributes as CloneUrlAction).reason = reason || '';
    } else if (actionType === 'spawn_task') {
      const taskDescription = this.#extractAttribute(actionTag, 'taskDescription') as string;
      const mode = this.#extractAttribute(actionTag, 'mode') as string;
      const context = this.#extractAttribute(actionTag, 'context') as string;
      (actionAttributes as SpawnTaskAction).taskDescription = taskDescription || '';
      if (mode) (actionAttributes as SpawnTaskAction).mode = mode as any;
      if (context) (actionAttributes as SpawnTaskAction).context = context;
    } else if (actionType === 'switch_mode') {
      const targetMode = this.#extractAttribute(actionTag, 'targetMode') as string;
      const reason = this.#extractAttribute(actionTag, 'reason') as string;
      (actionAttributes as SwitchModeAction).targetMode = (targetMode || 'code') as any;
      if (reason) (actionAttributes as SwitchModeAction).reason = reason;
    } else if (actionType === 'readFile') {
      let filePath = this.#extractAttribute(actionTag, 'filePath') as string;
      if (!filePath) filePath = this.#extractAttribute(actionTag, 'filepath') as string;
      if (!filePath) filePath = this.#extractAttribute(actionTag, 'path') as string;
      const includeLineHashes =
        (this.#extractAttribute(actionTag, 'includeLineHashes') as string) ||
        (this.#extractAttribute(actionTag, 'lineHashes') as string) ||
        (this.#extractAttribute(actionTag, 'hashLines') as string);
      if (!filePath) {
        const pathMatch = actionTag.match(REGEX_CACHE.aggressivePath);
        if (pathMatch) filePath = pathMatch[1];
      }
      if (!filePath) filePath = 'unknown-file.txt';
      (actionAttributes as any).filePath = filePath;
      if (includeLineHashes === 'true') {
        (actionAttributes as any).includeLineHashes = true;
      }
    } else if (actionType === 'searchFiles') {
      // Parse searchFiles action attributes
      const query = this.#extractAttribute(actionTag, 'query') as string;
      const filePattern = this.#extractAttribute(actionTag, 'filePattern') as string;
      (actionAttributes as any).query = query || '';
      if (filePattern) (actionAttributes as any).filePattern = filePattern;
    } else if (actionType === 'listFiles') {
      // Parse listFiles action attributes
      let path = this.#extractAttribute(actionTag, 'path') as string;
      if (!path) path = this.#extractAttribute(actionTag, 'dir') as string;
      if (!path) path = this.#extractAttribute(actionTag, 'directory') as string;
      const recursive = this.#extractAttribute(actionTag, 'recursive') as string;
      const query = this.#extractAttribute(actionTag, 'query') as string;
      (actionAttributes as any).path = path || '.';
      if (recursive === 'true') (actionAttributes as any).recursive = true;
      if (query) (actionAttributes as any).query = query;
    } else if (actionType === 'str_replace' || (actionType as string) === 'strReplace') {
      // Parse str_replace action attributes (also accept camelCase alias)
      // Normalize to snake_case for action-runner
      (actionAttributes as any).type = 'str_replace';
      let filePath = this.#extractAttribute(actionTag, 'filePath') as string;
      if (!filePath) filePath = this.#extractAttribute(actionTag, 'filepath') as string;
      if (!filePath) filePath = this.#extractAttribute(actionTag, 'path') as string;
      const oldString = this.#extractAttribute(actionTag, 'oldString') as string;
      const newString = this.#extractAttribute(actionTag, 'newString') as string;
      const startLineRef =
        (this.#extractAttribute(actionTag, 'startLineRef') as string) ||
        (this.#extractAttribute(actionTag, 'anchorStartRef') as string);
      const endLineRef =
        (this.#extractAttribute(actionTag, 'endLineRef') as string) ||
        (this.#extractAttribute(actionTag, 'anchorEndRef') as string);
      (actionAttributes as any).filePath = filePath || '';
      (actionAttributes as any).oldString = oldString || '';
      (actionAttributes as any).newString = newString || '';
      if (startLineRef) {
        (actionAttributes as any).startLineRef = startLineRef;
      }
      if (endLineRef) {
        (actionAttributes as any).endLineRef = endLineRef;
      }
    } else if (actionType === 'memory_operation') {
      const operation = this.#extractAttribute(actionTag, 'operation') as string;
      const key = this.#extractAttribute(actionTag, 'key') as string;
      const value = this.#extractAttribute(actionTag, 'value') as string;
      if (operation === 'store' || operation === 'retrieve' || operation === 'list') {
        (actionAttributes as any).operation = operation;
      }
      if (key) {
        (actionAttributes as any).key = key;
      }
      if (value) {
        (actionAttributes as any).value = value;
      }
    } else if (actionType === 'glob_search') {
      const pattern = this.#extractAttribute(actionTag, 'pattern') as string;
      const exclude = this.#parseCsvAttribute(this.#extractAttribute(actionTag, 'exclude') as string | undefined);
      const maxDepth = this.#extractAttribute(actionTag, 'maxDepth') as string;
      (actionAttributes as any).pattern = pattern || '';
      if (exclude && exclude.length > 0) {
        (actionAttributes as any).exclude = exclude;
      }
      if (maxDepth) {
        const parsed = Number.parseInt(maxDepth, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          (actionAttributes as any).maxDepth = parsed;
        }
      }
    } else if (actionType === 'ripgrep_search') {
      const query = this.#extractAttribute(actionTag, 'query') as string;
      const filePattern = this.#extractAttribute(actionTag, 'filePattern') as string;
      const caseSensitive = this.#extractAttribute(actionTag, 'caseSensitive') as string;
      const maxResults = this.#extractAttribute(actionTag, 'maxResults') as string;
      (actionAttributes as any).query = query || '';
      if (filePattern) {
        (actionAttributes as any).filePattern = filePattern;
      }
      if (caseSensitive === 'true') {
        (actionAttributes as any).caseSensitive = true;
      } else if (caseSensitive === 'false') {
        (actionAttributes as any).caseSensitive = false;
      }
      if (maxResults) {
        const parsed = Number.parseInt(maxResults, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          (actionAttributes as any).maxResults = parsed;
        }
      }
    } else if (actionType === 'edit_file') {
      let filePath = this.#extractAttribute(actionTag, 'filePath') as string;
      if (!filePath) filePath = this.#extractAttribute(actionTag, 'filepath') as string;
      if (!filePath) filePath = this.#extractAttribute(actionTag, 'path') as string;
      const operation = this.#extractAttribute(actionTag, 'operation') as string;
      const lineNumber = this.#extractAttribute(actionTag, 'lineNumber') as string;
      const endLineNumber = this.#extractAttribute(actionTag, 'endLineNumber') as string;
      const lineRef =
        (this.#extractAttribute(actionTag, 'lineRef') as string) ||
        (this.#extractAttribute(actionTag, 'startLineRef') as string);
      const endLineRef = this.#extractAttribute(actionTag, 'endLineRef') as string;
      (actionAttributes as any).filePath = filePath || '';
      if (operation === 'insert' || operation === 'delete' || operation === 'replace') {
        (actionAttributes as any).operation = operation;
      }
      if (lineNumber) {
        const parsed = Number.parseInt(lineNumber, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          (actionAttributes as any).lineNumber = parsed;
        }
      }
      if (endLineNumber) {
        const parsed = Number.parseInt(endLineNumber, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          (actionAttributes as any).endLineNumber = parsed;
        }
      }
      if (lineRef) {
        (actionAttributes as any).lineRef = lineRef;
      }
      if (endLineRef) {
        (actionAttributes as any).endLineRef = endLineRef;
      }
    } else if (actionType === 'read_many_files') {
      const filePathsAttr = this.#extractAttribute(actionTag, 'filePaths') as string;
      const maxFileSize = this.#extractAttribute(actionTag, 'maxFileSize') as string;
      const filePaths = this.#parseCsvAttribute(filePathsAttr);
      if (filePaths && filePaths.length > 0) {
        (actionAttributes as any).filePaths = filePaths;
      }
      if (maxFileSize) {
        const parsed = Number.parseInt(maxFileSize, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          (actionAttributes as any).maxFileSize = parsed;
        }
      }
    } else if (actionType === 'delegate_subagent') {
      const taskDescription = this.#extractAttribute(actionTag, 'taskDescription') as string;
      const agentType = this.#extractAttribute(actionTag, 'agentType') as string;
      const context = this.#extractAttribute(actionTag, 'context') as string;
      const strict = this.#extractAttribute(actionTag, 'strict') as string;
      (actionAttributes as DelegateSubagentAction).taskDescription = taskDescription || '';
      const normalizedAgentType = (agentType || '').toLowerCase();
      if (normalizedAgentType === 'coder' || normalizedAgentType === 'debugger' || normalizedAgentType === 'architect' || normalizedAgentType === 'tester') {
        (actionAttributes as DelegateSubagentAction).agentType = normalizedAgentType as DelegateSubagentAction['agentType'];
      } else {
        (actionAttributes as DelegateSubagentAction).agentType = 'coder';
      }
      if (context) {
        (actionAttributes as DelegateSubagentAction).context = context;
      }
      if (strict === 'true') {
        (actionAttributes as DelegateSubagentAction).strict = true;
      } else if (strict === 'false') {
        (actionAttributes as DelegateSubagentAction).strict = false;
      }
    } else if (actionType === 'web_search') {
      const query = this.#extractAttribute(actionTag, 'query') as string;
      const maxResults = this.#extractAttribute(actionTag, 'maxResults') as string;
      const maxUses = this.#extractAttribute(actionTag, 'maxUses') as string;
      const providerHint = this.#extractAttribute(actionTag, 'providerHint') as string;
      const allowedDomains = this.#parseCsvAttribute(this.#extractAttribute(actionTag, 'allowedDomains') as string | undefined);
      const blockedDomains = this.#parseCsvAttribute(this.#extractAttribute(actionTag, 'blockedDomains') as string | undefined);
      (actionAttributes as WebSearchAction).query = query || '';
      if (maxResults) {
        const parsed = Number.parseInt(maxResults, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          (actionAttributes as WebSearchAction).maxResults = parsed;
        }
      }
      if (maxUses) {
        const parsed = Number.parseInt(maxUses, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          (actionAttributes as WebSearchAction).maxUses = parsed;
        }
      }
      if (providerHint) {
        (actionAttributes as WebSearchAction).providerHint = providerHint;
      }
      if (allowedDomains && allowedDomains.length > 0) {
        (actionAttributes as WebSearchAction).allowedDomains = allowedDomains;
      }
      if (blockedDomains && blockedDomains.length > 0) {
        (actionAttributes as WebSearchAction).blockedDomains = blockedDomains;
      }
    } else if (actionType === 'web_fetch') {
      const url = this.#extractAttribute(actionTag, 'url') as string;
      const selector = this.#extractAttribute(actionTag, 'selector') as string;
      (actionAttributes as WebFetchAction).url = url || '';
      if (selector) {
        (actionAttributes as WebFetchAction).selector = selector;
      }
    } else if (actionType === 'web_crawl') {
      const url = this.#extractAttribute(actionTag, 'url') as string;
      const maxUses = this.#extractAttribute(actionTag, 'maxUses') as string;
      const providerHint = this.#extractAttribute(actionTag, 'providerHint') as string;
      const allowedDomains = this.#parseCsvAttribute(this.#extractAttribute(actionTag, 'allowedDomains') as string | undefined);
      const blockedDomains = this.#parseCsvAttribute(this.#extractAttribute(actionTag, 'blockedDomains') as string | undefined);
      (actionAttributes as WebCrawlAction).url = url || '';
      if (maxUses) {
        const parsed = Number.parseInt(maxUses, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          (actionAttributes as WebCrawlAction).maxUses = parsed;
        }
      }
      if (providerHint) {
        (actionAttributes as WebCrawlAction).providerHint = providerHint;
      }
      if (allowedDomains && allowedDomains.length > 0) {
        (actionAttributes as WebCrawlAction).allowedDomains = allowedDomains;
      }
      if (blockedDomains && blockedDomains.length > 0) {
        (actionAttributes as WebCrawlAction).blockedDomains = blockedDomains;
      }
    } else if (actionType === 'github_documents') {
      const owner = this.#extractAttribute(actionTag, 'owner') as string;
      const repo = this.#extractAttribute(actionTag, 'repo') as string;
      const accessToken = this.#extractAttribute(actionTag, 'accessToken') as string;
      const sourceType = this.#extractAttribute(actionTag, 'sourceType') as string;
      const maxDocuments = this.#extractAttribute(actionTag, 'maxDocuments') as string;
      const maxUses = this.#extractAttribute(actionTag, 'maxUses') as string;

      (actionAttributes as GitHubDocumentsAction).owner = owner || '';
      (actionAttributes as GitHubDocumentsAction).repo = repo || '';

      if (accessToken) {
        (actionAttributes as GitHubDocumentsAction).accessToken = accessToken;
      }
      if (sourceType === 'issues' || sourceType === 'pull_requests') {
        (actionAttributes as GitHubDocumentsAction).sourceType = sourceType;
      }
      if (maxDocuments) {
        const parsed = Number.parseInt(maxDocuments, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          (actionAttributes as GitHubDocumentsAction).maxDocuments = parsed;
        }
      }
      if (maxUses) {
        const parsed = Number.parseInt(maxUses, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          (actionAttributes as GitHubDocumentsAction).maxUses = parsed;
        }
      }
    } else if (actionType === 'copy_project') {
      const sourceProjectId = this.#extractAttribute(actionTag, 'sourceProjectId') as string;
      const newProjectName = this.#extractAttribute(actionTag, 'newProjectName') as string;
      const includeGit = this.#extractAttribute(actionTag, 'includeGit') as string;
      const includeGitRemotes = this.#extractAttribute(actionTag, 'includeGitRemotes') as string;
      const includeTriggers = this.#extractAttribute(actionTag, 'includeTriggers') as string;
      const includeEnvFiles = this.#extractAttribute(actionTag, 'includeEnvFiles') as string;
      const includeSecrets = this.#extractAttribute(actionTag, 'includeSecrets') as string;
      const includeDeployConfig = this.#extractAttribute(actionTag, 'includeDeployConfig') as string;
      const includeDomains = this.#extractAttribute(actionTag, 'includeDomains') as string;
      if (sourceProjectId) {
        (actionAttributes as CopyProjectAction).sourceProjectId = sourceProjectId;
      }
      if (newProjectName) {
        (actionAttributes as CopyProjectAction).newProjectName = newProjectName;
      }
      if (includeGit === 'true') {
        (actionAttributes as CopyProjectAction).includeGit = true;
      } else if (includeGit === 'false') {
        (actionAttributes as CopyProjectAction).includeGit = false;
      }
      if (includeGitRemotes === 'true') {
        (actionAttributes as CopyProjectAction).includeGitRemotes = true;
      } else if (includeGitRemotes === 'false') {
        (actionAttributes as CopyProjectAction).includeGitRemotes = false;
      }
      if (includeTriggers === 'true') {
        (actionAttributes as CopyProjectAction).includeTriggers = true;
      } else if (includeTriggers === 'false') {
        (actionAttributes as CopyProjectAction).includeTriggers = false;
      }
      if (includeEnvFiles === 'true') {
        (actionAttributes as CopyProjectAction).includeEnvFiles = true;
      } else if (includeEnvFiles === 'false') {
        (actionAttributes as CopyProjectAction).includeEnvFiles = false;
      }
      if (includeSecrets === 'true') {
        (actionAttributes as CopyProjectAction).includeSecrets = true;
      } else if (includeSecrets === 'false') {
        (actionAttributes as CopyProjectAction).includeSecrets = false;
      }
      if (includeDeployConfig === 'true') {
        (actionAttributes as CopyProjectAction).includeDeployConfig = true;
      } else if (includeDeployConfig === 'false') {
        (actionAttributes as CopyProjectAction).includeDeployConfig = false;
      }
      if (includeDomains === 'true') {
        (actionAttributes as CopyProjectAction).includeDomains = true;
      } else if (includeDomains === 'false') {
        (actionAttributes as CopyProjectAction).includeDomains = false;
      }
    } else if (actionType === 'multi_apply_diff') {
      const commitMessage = this.#extractAttribute(actionTag, 'commitMessage') as string;
      (actionAttributes as MultiApplyDiffAction).diffs = [];
      if (commitMessage) {
        (actionAttributes as MultiApplyDiffAction).commitMessage = commitMessage;
      }
    }

    return actionAttributes as RecoderAction;
  }

  #extractAttribute(tag: string, attributeName: string): string | undefined {
    let match = tag.match(REGEX_CACHE.doubleQuotes(attributeName));
    if (match) return match[1];
    match = tag.match(REGEX_CACHE.singleQuotes(attributeName));
    if (match) return match[1];
    match = tag.match(REGEX_CACHE.noQuotes(attributeName));
    if (match) return match[1];
    return undefined;
  }

  #normalizeActionType(actionType?: string): ActionType | undefined {
    if (!actionType) {
      return undefined;
    }

    return (ACTION_TYPE_ALIASES[actionType] || actionType) as ActionType;
  }

  #parseCsvAttribute(value?: string): string[] | undefined {
    if (!value) return undefined;
    const values = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return values.length > 0 ? values : undefined;
  }

  /**
   * Parse multi_apply_diff content into diff operations
   * Supports both XML format and JSON format
   *
   * XML format:
   * <diff>
   *   <file path="src/App.tsx">
   *     <old_string>const x = 1;</old_string>
   *     <new_string>const x = 2;</new_string>
   *     <start_line>10</start_line>
   *   </file>
   * </diff>
   *
   * JSON format:
   * [{"filePath": "src/App.tsx", "oldString": "...", "newString": "..."}]
   */
  #parseMultiDiffContent(content: string): DiffOperation[] {
    const diffs: DiffOperation[] = [];
    const trimmed = content.trim();

    // Try JSON format first
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (item.filePath && (item.oldString !== undefined || item.old_string !== undefined)) {
            diffs.push({
              filePath: item.filePath || item.file_path,
              oldString: item.oldString || item.old_string || '',
              newString: item.newString || item.new_string || '',
              startLine: item.startLine || item.start_line,
            });
          }
        }
        return diffs;
      } catch {
        // Not valid JSON, try XML
      }
    }

    // Parse XML format
    const fileRegex = /<file\s+path=["']([^"']+)["']>([\s\S]*?)<\/file>/gi;
    let fileMatch;

    while ((fileMatch = fileRegex.exec(trimmed)) !== null) {
      const filePath = fileMatch[1];
      const fileContent = fileMatch[2];

      // Extract old_string
      const oldStringMatch = fileContent.match(/<old_string>([\s\S]*?)<\/old_string>/i);
      // Extract new_string
      const newStringMatch = fileContent.match(/<new_string>([\s\S]*?)<\/new_string>/i);
      // Extract optional start_line
      const startLineMatch = fileContent.match(/<start_line>(\d+)<\/start_line>/i);

      if (oldStringMatch || newStringMatch) {
        diffs.push({
          filePath,
          oldString: oldStringMatch ? this.#unescapeXml(oldStringMatch[1]) : '',
          newString: newStringMatch ? this.#unescapeXml(newStringMatch[1]) : '',
          startLine: startLineMatch ? parseInt(startLineMatch[1], 10) : undefined,
        });
      }
    }

    // Also support SEARCH/REPLACE block format (like Kilo Code)
    const searchReplaceRegex = /<<<<<<< SEARCH\s*\n?([\s\S]*?)\n?=======\s*\n?([\s\S]*?)\n?>>>>>>> REPLACE/gi;
    let srMatch;
    let currentFilePath = '';

    // Try to extract file path from content
    const filePathMatch = trimmed.match(/(?:file|path):\s*["']?([^\s"'\n]+)["']?/i);
    if (filePathMatch) {
      currentFilePath = filePathMatch[1];
    }

    while ((srMatch = searchReplaceRegex.exec(trimmed)) !== null) {
      const oldString = srMatch[1].trim();
      const newString = srMatch[2].trim();

      if (currentFilePath && (oldString || newString)) {
        diffs.push({
          filePath: currentFilePath,
          oldString,
          newString,
        });
      }
    }

    return diffs;
  }

  /**
   * Unescape XML entities
   */
  #unescapeXml(str: string): string {
    return str
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }
}

const createArtifactElement: ElementFactory = (props) => {
  const elementProps = [
    'class="__recoderArtifact__"',
    ...Object.entries(props).map(([key, value]) => {
      return `data-${camelToDashCase(key)}=${JSON.stringify(value)}`;
    }),
  ];
  return `<div ${elementProps.join(' ')}></div>`;
};

function camelToDashCase(input: string) {
  return input.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
