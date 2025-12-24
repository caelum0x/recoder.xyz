import type { ActionType, RecoderAction, RecoderActionData, FileAction, ShellAction, ImportStarterAction, CloneGitHubAction } from '~/types/actions';
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
            currentAction.content += input.slice(i, closeIndex);
            let content = currentAction.content.trim();

            if ('type' in currentAction && currentAction.type === 'file') {
              content += '\n';
            }

            currentAction.content = content;

            if ('type' in currentAction && currentAction.type === 'shell') {
              const validation = validateShellCommand(content);
              if (!validation.valid) {
                currentAction.type = 'file';
                (currentAction as FileAction).filePath = 'README-BLOCKED-COMMAND.md';
                currentAction.content = `# ⚠️ Blocked Command\n\n${validation.reason}\n`;
              }
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

              state.insideArtifact = true;
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
