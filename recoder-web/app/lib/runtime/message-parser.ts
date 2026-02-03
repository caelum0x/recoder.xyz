import type { ActionType, RecoderAction, RecoderActionData, FileAction, ShellAction, ImportStarterAction, CloneGitHubAction, CloneUrlAction, SpawnTaskAction, SwitchModeAction, MultiApplyDiffAction, DiffOperation } from '~/types/actions';
import type { RecoderArtifactData } from '~/types/artifact';
import { unreachable } from '~/utils/unreachable';

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
      /(<recoderAction[^>]*\s)(filePath|type|templateId|repoUrl|reason|url|query|filePattern|path|recursive|oldString|newString|targetMode|mode|taskDescription|context|commitMessage|agentType)=([^"'\s>][^\s>]*)/g,
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
    if (state.parseAttempts > 10000) {
      console.error('Parser safety limit reached');
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
    const actionType = this.#extractAttribute(actionTag, 'type') as ActionType;

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
      if (!filePath) {
        const pathMatch = actionTag.match(REGEX_CACHE.aggressivePath);
        if (pathMatch) filePath = pathMatch[1];
      }
      if (!filePath) filePath = 'unknown-file.txt';
      (actionAttributes as any).filePath = filePath;
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
      (actionAttributes as any).filePath = filePath || '';
      (actionAttributes as any).oldString = oldString || '';
      (actionAttributes as any).newString = newString || '';
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
