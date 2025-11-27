import type { ActionType, BoltAction, BoltActionData, FileAction, ShellAction, ImportStarterAction, CloneGitHubAction } from '~/types/actions';
import type { BoltArtifactData } from '~/types/artifact';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';

const ARTIFACT_TAG_OPEN = '<boltArtifact';
const ARTIFACT_TAG_CLOSE = '</boltArtifact>';
const ARTIFACT_ACTION_TAG_OPEN = '<boltAction';
const ARTIFACT_ACTION_TAG_CLOSE = '</boltAction>';

const logger = createScopedLogger('MessageParser');

// Pre-compiled regex patterns for performance
const REGEX_CACHE = {
  doubleQuotes: (attr: string) => new RegExp(`${attr}="([^"]*)"`, 'i'),
  singleQuotes: (attr: string) => new RegExp(`${attr}='([^']*)'`, 'i'),
  noQuotes: (attr: string) => new RegExp(`${attr}=([^\\s>]+)`, 'i'),
  aggressivePath: /(?:filePath|filepath|path)\s*=\s*["']?([^"'\s>]+)["']?/i,
};

/**
 * Validate shell command content for truly dangerous patterns
 * NOTE: Dev server commands (npm run dev, etc.) are ALLOWED - action-runner handles them properly in background
 */
function validateShellCommand(content: string): { valid: boolean; reason?: string } {
  // Normalize for detection (remove newlines, convert to lowercase)
  const normalized = content.replace(/\n/g, ' ').toLowerCase();

  // Only block truly dangerous/destructive commands
  const forbiddenPatterns = [
    { pattern: /rm\s+-rf\s+\/\s*$/, name: 'rm -rf /' },
    { pattern: /rm\s+-rf\s+~\s*$/, name: 'rm -rf ~' },
    { pattern: /:\(\)\{\s*:\|:\&\s*\};:/, name: 'fork bomb' },
    { pattern: /mkfs\./, name: 'disk formatting' },
    { pattern: /dd\s+if=/, name: 'direct disk write' },
  ];

  for (const { pattern, name } of forbiddenPatterns) {
    if (pattern.test(normalized)) {
      return {
        valid: false,
        reason: `Dangerous command blocked: "${name}". This command could harm the system.`,
      };
    }
  }

  // ✅ Dev server commands are now ALLOWED - action-runner.ts handles them properly with background execution
  return { valid: true };
}

export interface ArtifactCallbackData extends BoltArtifactData {
  messageId: string;
}

export interface ActionCallbackData {
  artifactId: string;
  messageId: string;
  actionId: string;
  action: BoltAction;
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
  currentArtifact?: BoltArtifactData;
  currentAction: BoltActionData;
  actionId: number;
  parseAttempts: number; // Safety counter
}

export class StreamingMessageParser {
  #messages = new Map<string, MessageState>();

  constructor(private _options: StreamingMessageParserOptions = {}) {}

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
      };

      this.#messages.set(messageId, state);
    }

    // Safety check: prevent infinite loops
    state.parseAttempts++;
    if (state.parseAttempts > 10000) {
      logger.error('⛔ Parser safety limit reached - potential infinite loop detected');
      return output + input.substring(state.position);
    }

    // Log chunk for debugging file path issues
    if (input.includes('<boltAction')) {
      const snippet = input.substring(Math.max(0, input.indexOf('<boltAction') - 20), input.indexOf('<boltAction') + 150);
      logger.debug('📨 Chunk contains <boltAction>:', snippet);
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
            currentAction.content += input.slice(i, closeIndex);

            let content = currentAction.content.trim();

            if ('type' in currentAction && currentAction.type === 'file') {
              content += '\n';
            }

            currentAction.content = content;

            // CRITICAL: Validate shell commands before execution
            // This catches forbidden commands that AI generated despite warnings
            if ('type' in currentAction && currentAction.type === 'shell') {
              const validation = validateShellCommand(content);
              if (!validation.valid) {
                logger.error('🚨 BLOCKED FORBIDDEN SHELL COMMAND:', validation.reason);
                logger.error('   Command content:', content.substring(0, 200));

                // Replace the shell action with an error file that explains the issue
                currentAction.type = 'file';
                (currentAction as FileAction).filePath = 'README-BLOCKED-COMMAND.md';
                currentAction.content = `# ⚠️ Blocked Command\n\n${validation.reason}\n\n## What Happened\n\nThe AI attempted to generate a development server command, which would run indefinitely and freeze the application.\n\n## What To Do\n\nYour project is ready to use! All dependencies have been installed.\n\nTo start the development server manually:\n1. Open the terminal\n2. Run the appropriate command for your project (e.g., \`npm run dev\`)\n\n## Blocked Command\n\n\`\`\`bash\n${content.substring(0, 500)}\n\`\`\`\n`;

                logger.info('   ✅ Replaced shell action with informational file');
              }
            }

            this._options.callbacks?.onActionClose?.({
              artifactId: currentArtifact.id,
              messageId,

              /**
               * We decrement the id because it's been incremented already
               * when `onActionOpen` was emitted to make sure the ids are
               * the same.
               */
              actionId: String(state.actionId - 1),

              action: currentAction as BoltAction,
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

              state.currentAction = this.#parseActionTag(input, actionOpenIndex, actionEndIndex);

              this._options.callbacks?.onActionOpen?.({
                artifactId: currentArtifact.id,
                messageId,
                actionId: String(state.actionId++),
                action: state.currentAction as BoltAction,
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

            if (nextChar && nextChar !== '>' && nextChar !== ' ') {
              output += input.slice(i, j + 1);
              i = j + 1;
              break;
            }

            const openTagEnd = input.indexOf('>', j);

            if (openTagEnd !== -1) {
              const artifactTag = input.slice(i, openTagEnd + 1);

              const artifactTitle = this.#extractAttribute(artifactTag, 'title') as string;
              const artifactId = this.#extractAttribute(artifactTag, 'id') as string;

              if (!artifactTitle) {
                logger.warn('Artifact title missing');
              }

              if (!artifactId) {
                logger.warn('Artifact id missing');
              }

              state.insideArtifact = true;

              const currentArtifact = {
                id: artifactId,
                title: artifactTitle,
              } satisfies BoltArtifactData;

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

  reset() {
    this.#messages.clear();
  }

  #parseActionTag(input: string, actionOpenIndex: number, actionEndIndex: number) {
    const actionTag = input.slice(actionOpenIndex, actionEndIndex + 1);

    logger.debug('🔍 Parsing action tag:', actionTag);

    const actionType = this.#extractAttribute(actionTag, 'type') as ActionType;

    const actionAttributes = {
      type: actionType,
      content: '',
    };

    if (actionType === 'file') {
      // Try multiple attribute names that Claude might use
      let filePath = this.#extractAttribute(actionTag, 'filePath') as string;
      logger.debug('  - Attempt 1 (filePath):', filePath || 'not found');

      if (!filePath) {
        // Try alternate spellings
        filePath = this.#extractAttribute(actionTag, 'filepath') as string;
        logger.debug('  - Attempt 2 (filepath):', filePath || 'not found');
      }

      if (!filePath) {
        // Try 'path' as a fallback
        filePath = this.#extractAttribute(actionTag, 'path') as string;
        logger.debug('  - Attempt 3 (path):', filePath || 'not found');
      }

      if (!filePath) {
        // Last resort: try to extract from anywhere in the tag using aggressive regex
        const pathMatch = actionTag.match(REGEX_CACHE.aggressivePath);
        if (pathMatch) {
          filePath = pathMatch[1];
          logger.debug('  - Attempt 4 (regex):', filePath);
        }
      }

      if (!filePath) {
        logger.error('❌ File path not specified in action tag:', actionTag);
        // Set a placeholder to avoid undefined errors downstream
        filePath = 'unknown-file.txt';
      } else {
        logger.info(`✅ Extracted file path: ${filePath}`);
      }

      (actionAttributes as FileAction).filePath = filePath;
    } else if (actionType === 'importStarter') {
      // Extract templateId and reason for starter template import
      const templateId = this.#extractAttribute(actionTag, 'templateId') as string;
      const reason = this.#extractAttribute(actionTag, 'reason') as string;

      if (!templateId) {
        logger.error('❌ Template ID not specified in importStarter action:', actionTag);
      } else {
        logger.info(`✅ Import starter: ${templateId} (${reason || 'no reason provided'})`);
      }

      (actionAttributes as ImportStarterAction).templateId = templateId || 'unknown';
      (actionAttributes as ImportStarterAction).reason = reason || '';
    } else if (actionType === 'cloneGitHub') {
      // Extract repoUrl and reason for GitHub cloning
      const repoUrl = this.#extractAttribute(actionTag, 'repoUrl') as string;
      const reason = this.#extractAttribute(actionTag, 'reason') as string;

      if (!repoUrl) {
        logger.error('❌ Repository URL not specified in cloneGitHub action:', actionTag);
      } else {
        logger.info(`✅ Clone GitHub repo: ${repoUrl} (${reason || 'no reason provided'})`);
      }

      (actionAttributes as CloneGitHubAction).repoUrl = repoUrl || '';
      (actionAttributes as CloneGitHubAction).reason = reason || '';
    } else if (actionType !== 'shell') {
      logger.warn(`Unknown action type '${actionType}'`);
    }

    return actionAttributes as BoltAction;
  }

  #extractAttribute(tag: string, attributeName: string): string | undefined {
    // Try double quotes first (most common)
    let match = tag.match(REGEX_CACHE.doubleQuotes(attributeName));
    if (match) return match[1];

    // Try single quotes
    match = tag.match(REGEX_CACHE.singleQuotes(attributeName));
    if (match) return match[1];

    // Try without quotes (value ends at space or >)
    match = tag.match(REGEX_CACHE.noQuotes(attributeName));
    if (match) return match[1];

    return undefined;
  }
}

const createArtifactElement: ElementFactory = (props) => {
  const elementProps = [
    'class="__boltArtifact__"',
    ...Object.entries(props).map(([key, value]) => {
      return `data-${camelToDashCase(key)}=${JSON.stringify(value)}`;
    }),
  ];

  return `<div ${elementProps.join(' ')}></div>`;
};

function camelToDashCase(input: string) {
  return input.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
