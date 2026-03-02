/**
 * @module collaboration.service
 *
 * Singleton wrapper around the shared CollaborationService from
 * `@recoder/shared/a2a/control-plane`. Provides the Agent Messaging Bus (AMB)
 * with channel, thread, and message lifecycle operations.
 *
 * Features:
 * - Singleton access via `getCollaborationSvc()` / `resetCollaborationSvc()`
 * - @mention parsing: extracts `@agent_id` patterns from message text
 * - Mention event emission via a pluggable `MentionNotifier` callback
 * - Scope-filtered channel listing
 * - Pagination helpers for message listing
 *
 * The service delegates to `InMemoryCollaborationService` by default.
 * In production the caller can inject a `PersistentCollaborationService`
 * via `initCollaborationSvc()`.
 */

import { v4 as uuid } from 'uuid';
import {
  InMemoryCollaborationService,
  type CollaborationService,
  type CollaborationChannel,
  type CollaborationThread,
  type CollaborationMessage,
  type CollaborationScope,
} from '@recoder/shared/a2a';
import { createLogger } from '../logger';

const logger = createLogger('a2a-collaboration');

// ---------------------------------------------------------------------------
// @mention parsing
// ---------------------------------------------------------------------------

/** Regex that matches `@agent_id` tokens. Agent IDs may contain word chars, hyphens, and dots. */
const MENTION_REGEX = /@([\w.\-]+)/g;

/**
 * Extract all unique `@agent_id` mentions from a text string.
 * Returns an array of agent IDs (without the leading `@`).
 */
export function parseMentions(text: string): string[] {
  const matches = text.matchAll(MENTION_REGEX);
  const ids = new Set<string>();
  for (const match of matches) {
    ids.add(match[1]);
  }
  return [...ids];
}

// ---------------------------------------------------------------------------
// Mention notification
// ---------------------------------------------------------------------------

/** Metadata attached to a mention notification. */
export interface MentionEvent {
  /** The message that contains the mention. */
  message: CollaborationMessage;
  /** The channel the thread belongs to. */
  channelId: string;
  /** The mentioned agent IDs (without `@`). */
  mentionedAgentIds: string[];
}

/** Callback invoked when a message contains @mentions. */
export type MentionNotifier = (event: MentionEvent) => void;

// ---------------------------------------------------------------------------
// Extended message type with mention metadata
// ---------------------------------------------------------------------------

export interface CollaborationMessageWithMentions extends CollaborationMessage {
  /** Agent IDs mentioned in the message text (empty array if none). */
  mentions: string[];
  /** ISO timestamp when the message was last edited (undefined if never edited). */
  editedAt?: string;
  /** ISO timestamp when the message was soft-deleted (undefined if not deleted). */
  deletedAt?: string;
}

/** Input for updating a message. */
export interface UpdateMessageInput {
  messageId: string;
  text: string;
}

/** Result of a message search. */
export interface MessageSearchResult {
  messages: CollaborationMessageWithMentions[];
  totalMatches: number;
  query: string;
}

// ---------------------------------------------------------------------------
// Service wrapper
// ---------------------------------------------------------------------------

export class AMBCollaborationService {
  private readonly mentionStore = new Map<string, string[]>(); // messageId -> mentions
  private readonly editStore = new Map<string, { text: string; editedAt: string }>(); // messageId -> edit
  private readonly deletedStore = new Set<string>(); // messageId set (soft-deleted)
  private readonly deletedAtStore = new Map<string, string>(); // messageId -> deletedAt
  private readonly memberOverlayStore = new Map<string, Set<string>>(); // channelId -> member set
  private readonly overlayMessages: CollaborationMessage[] = []; // messages from overlay-only members
  private notifier: MentionNotifier | undefined;

  constructor(private readonly inner: CollaborationService) {}

  /** Register a callback for @mention notifications. */
  onMention(notifier: MentionNotifier): void {
    this.notifier = notifier;
  }

  // -- Channels -------------------------------------------------------------

  createChannel(input: {
    name: string;
    scope: CollaborationScope;
    memberAgentIds: string[];
  }): CollaborationChannel {
    const id = uuid();
    logger.info({ id, name: input.name, scope: input.scope }, 'creating channel');
    return this.inner.createChannel({
      id,
      scope: input.scope,
      name: input.name,
      memberAgentIds: input.memberAgentIds,
    });
  }

  getChannel(channelId: string): CollaborationChannel | undefined {
    const raw = this.inner.listChannels().find((ch) => ch.id === channelId);
    if (!raw) return undefined;
    return this.applyMemberOverlay(raw);
  }

  listChannels(scope?: CollaborationScope): CollaborationChannel[] {
    let all = this.inner.listChannels();
    if (scope) {
      all = all.filter((ch) => ch.scope === scope);
    }
    return all.map((ch) => this.applyMemberOverlay(ch));
  }

  // -- Membership -----------------------------------------------------------

  /**
   * Get or initialise the member overlay set for a channel.
   * On first access the overlay is seeded from the channel's original memberAgentIds.
   */
  private getOrInitMemberOverlay(channelId: string): Set<string> {
    let overlay = this.memberOverlayStore.get(channelId);
    if (!overlay) {
      const raw = this.inner.listChannels().find((ch) => ch.id === channelId);
      if (!raw) throw new Error(`Channel not found: ${channelId}`);
      overlay = new Set(raw.memberAgentIds);
      this.memberOverlayStore.set(channelId, overlay);
    }
    return overlay;
  }

  /**
   * Apply the member overlay to a channel, returning a new object whose
   * memberAgentIds reflects runtime additions/removals.
   */
  private applyMemberOverlay(channel: CollaborationChannel): CollaborationChannel {
    const overlay = this.memberOverlayStore.get(channel.id);
    if (!overlay) return channel;
    return { ...channel, memberAgentIds: [...overlay] };
  }

  /**
   * Add an agent to a channel's member list.
   *
   * @throws Error if the channel does not exist.
   * @throws Error if the agent is already a member.
   */
  addMember(channelId: string, agentId: string): CollaborationChannel {
    const raw = this.inner.listChannels().find((ch) => ch.id === channelId);
    if (!raw) throw new Error(`Channel not found: ${channelId}`);

    const overlay = this.getOrInitMemberOverlay(channelId);
    if (overlay.has(agentId)) {
      throw new Error(`Agent ${agentId} is already a member of channel ${channelId}`);
    }

    overlay.add(agentId);
    logger.info({ channelId, agentId }, 'member added to channel');

    return this.applyMemberOverlay(raw);
  }

  /**
   * Remove an agent from a channel's member list.
   *
   * @throws Error if the channel does not exist.
   * @throws Error if the agent is not a member.
   */
  removeMember(channelId: string, agentId: string): CollaborationChannel {
    const raw = this.inner.listChannels().find((ch) => ch.id === channelId);
    if (!raw) throw new Error(`Channel not found: ${channelId}`);

    const overlay = this.getOrInitMemberOverlay(channelId);
    if (!overlay.has(agentId)) {
      throw new Error(`Agent ${agentId} is not a member of channel ${channelId}`);
    }

    overlay.delete(agentId);
    logger.info({ channelId, agentId }, 'member removed from channel');

    return this.applyMemberOverlay(raw);
  }

  /**
   * Return the current member list for a channel.
   *
   * @throws Error if the channel does not exist.
   */
  getMembers(channelId: string): string[] {
    const raw = this.inner.listChannels().find((ch) => ch.id === channelId);
    if (!raw) throw new Error(`Channel not found: ${channelId}`);

    const overlay = this.memberOverlayStore.get(channelId);
    if (!overlay) return [...raw.memberAgentIds];
    return [...overlay];
  }

  // -- Threads --------------------------------------------------------------

  createThread(channelId: string, title: string): CollaborationThread {
    const id = uuid();
    logger.info({ id, channelId, title }, 'creating thread');
    return this.inner.createThread({ id, channelId, title });
  }

  listThreads(channelId: string): CollaborationThread[] {
    return this.inner.listThreads(channelId);
  }

  // -- Messages -------------------------------------------------------------

  sendMessage(input: {
    threadId: string;
    senderAgentId: string;
    text: string;
  }): CollaborationMessageWithMentions {
    const id = uuid();
    const mentions = parseMentions(input.text);

    logger.info(
      { id, threadId: input.threadId, senderAgentId: input.senderAgentId, mentionCount: mentions.length },
      'sending message',
    );

    // Pre-validate membership against the overlay if one exists,
    // so that runtime add/removeMember changes are respected.
    this.validateMembership(input.threadId, input.senderAgentId);

    let message: CollaborationMessage;
    try {
      message = this.inner.sendMessage({
        id,
        threadId: input.threadId,
        senderAgentId: input.senderAgentId,
        text: input.text,
      });
    } catch (err: any) {
      // If the inner rejects due to membership but our overlay says the
      // sender IS a valid member (added at runtime), swallow the inner error
      // and construct the message ourselves.
      if (err?.message?.includes('is not a member of channel') && this.isMemberViaOverlay(input.threadId, input.senderAgentId)) {
        message = {
          id,
          threadId: input.threadId,
          senderAgentId: input.senderAgentId,
          text: input.text,
          createdAt: new Date().toISOString(),
        };
        // Store in inner message list by re-calling listMessages is not
        // feasible, so we fall back to the overlay message store.
        this.overlayMessages.push(message);
      } else {
        throw err;
      }
    }

    // Store mention metadata
    this.mentionStore.set(id, mentions);

    // Emit mention notification if there are any mentions
    if (mentions.length > 0 && this.notifier) {
      // Find the channel for this thread
      const channels = this.inner.listChannels();
      const threads = channels.flatMap((ch) =>
        this.inner.listThreads(ch.id).map((t) => ({ ...t, channelId: ch.id })),
      );
      const thread = threads.find((t) => t.id === input.threadId);
      const channelId = thread?.channelId ?? '';

      try {
        this.notifier({
          message,
          channelId,
          mentionedAgentIds: mentions,
        });
      } catch (err) {
        logger.error({ err, messageId: id }, 'mention notifier threw');
      }
    }

    return { ...message, mentions };
  }

  listMessages(
    threadId: string,
    options?: { limit?: number; offset?: number; includeDeleted?: boolean },
  ): CollaborationMessageWithMentions[] {
    // Combine inner messages with overlay messages for this thread
    let all: CollaborationMessage[] = [
      ...this.inner.listMessages(threadId),
      ...this.overlayMessages.filter((msg) => msg.threadId === threadId),
    ];

    // Filter out soft-deleted messages unless explicitly requested
    if (!options?.includeDeleted) {
      all = all.filter((msg) => !this.deletedStore.has(msg.id));
    }

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? all.length;

    all = all.slice(offset, offset + limit);

    return all.map((msg) => this.enrichMessage(msg));
  }

  // -- Message editing ------------------------------------------------------

  /**
   * Get a single message by ID. Searches all threads.
   * Returns undefined if the message is not found or has been deleted.
   */
  getMessage(messageId: string): CollaborationMessageWithMentions | undefined {
    // Search all channels/threads for the message
    const channels = this.inner.listChannels();
    for (const channel of channels) {
      const threads = this.inner.listThreads(channel.id);
      for (const thread of threads) {
        const messages = this.inner.listMessages(thread.id);
        const found = messages.find((msg) => msg.id === messageId);
        if (found) {
          if (this.deletedStore.has(messageId)) return undefined;
          return this.enrichMessage(found);
        }
      }
    }
    return undefined;
  }

  /**
   * Update the text of a message. Preserves the original message in the
   * inner store; the edit overlay is applied when reading.
   *
   * @throws Error if the message is not found or has been deleted.
   */
  updateMessage(input: UpdateMessageInput): CollaborationMessageWithMentions {
    const original = this.findRawMessage(input.messageId);
    if (!original) throw new Error(`Message not found: ${input.messageId}`);
    if (this.deletedStore.has(input.messageId)) {
      throw new Error(`Message has been deleted: ${input.messageId}`);
    }

    const editedAt = new Date().toISOString();
    this.editStore.set(input.messageId, { text: input.text, editedAt });

    // Update mention store with new text
    const mentions = parseMentions(input.text);
    this.mentionStore.set(input.messageId, mentions);

    logger.info({ messageId: input.messageId, editedAt }, 'message updated');

    return this.enrichMessage(original);
  }

  /**
   * Soft-delete a message. The message is excluded from normal listings
   * but remains in the inner store for auditing.
   *
   * @throws Error if the message is not found.
   */
  deleteMessage(messageId: string): { messageId: string; deletedAt: string } {
    const original = this.findRawMessage(messageId);
    if (!original) throw new Error(`Message not found: ${messageId}`);
    if (this.deletedStore.has(messageId)) {
      throw new Error(`Message already deleted: ${messageId}`);
    }

    const deletedAt = new Date().toISOString();
    this.deletedStore.add(messageId);
    this.deletedAtStore.set(messageId, deletedAt);

    logger.info({ messageId, deletedAt }, 'message soft-deleted');

    return { messageId, deletedAt };
  }

  // -- Search ---------------------------------------------------------------

  /**
   * Search messages across all channels/threads by text query.
   * Case-insensitive substring match.
   */
  searchMessages(
    query: string,
    options?: { limit?: number; channelId?: string; threadId?: string },
  ): MessageSearchResult {
    const limit = options?.limit ?? 50;
    const lowerQuery = query.toLowerCase();
    const results: CollaborationMessageWithMentions[] = [];

    const channels = this.inner.listChannels();

    for (const channel of channels) {
      if (options?.channelId && channel.id !== options.channelId) continue;

      const threads = this.inner.listThreads(channel.id);
      for (const thread of threads) {
        if (options?.threadId && thread.id !== options.threadId) continue;

        const messages = this.inner.listMessages(thread.id);
        for (const msg of messages) {
          if (this.deletedStore.has(msg.id)) continue;

          // Apply edit overlay for search
          const effectiveText = this.editStore.get(msg.id)?.text ?? msg.text;
          if (effectiveText.toLowerCase().includes(lowerQuery)) {
            results.push(this.enrichMessage(msg));
            if (results.length >= limit) {
              return { messages: results, totalMatches: results.length, query };
            }
          }
        }
      }
    }

    return { messages: results, totalMatches: results.length, query };
  }

  // -- Internal helpers -----------------------------------------------------

  /** Find a raw message (without enrichment) by ID across all threads. */
  private findRawMessage(messageId: string): CollaborationMessage | undefined {
    const channels = this.inner.listChannels();
    for (const channel of channels) {
      const threads = this.inner.listThreads(channel.id);
      for (const thread of threads) {
        const messages = this.inner.listMessages(thread.id);
        const found = messages.find((msg) => msg.id === messageId);
        if (found) return found;
      }
    }
    // Also check overlay messages (sent by members added at runtime)
    return this.overlayMessages.find((msg) => msg.id === messageId);
  }

  /** Enrich a raw message with mentions, edit overlay, and deletion state. */
  private enrichMessage(msg: CollaborationMessage): CollaborationMessageWithMentions {
    const edit = this.editStore.get(msg.id);
    const effectiveText = edit?.text ?? msg.text;

    return {
      ...msg,
      text: effectiveText,
      mentions: this.mentionStore.get(msg.id) ?? parseMentions(effectiveText),
      editedAt: edit?.editedAt,
      deletedAt: this.deletedAtStore.get(msg.id),
    };
  }

  /**
   * Validate that the sender is a member of the channel that owns the thread.
   * Uses the overlay if available, otherwise falls back to the inner channel data.
   *
   * @throws Error if the sender is not a current member (after overlay adjustments).
   */
  private validateMembership(threadId: string, senderAgentId: string): void {
    // Find the channel for this thread
    const channels = this.inner.listChannels();
    for (const channel of channels) {
      const threads = this.inner.listThreads(channel.id);
      const thread = threads.find((t) => t.id === threadId);
      if (thread) {
        const overlay = this.memberOverlayStore.get(channel.id);
        if (overlay) {
          // Overlay exists: authoritative membership source
          if (!overlay.has(senderAgentId)) {
            throw new Error(`Sender ${senderAgentId} is not a member of channel ${channel.id}`);
          }
        }
        // If no overlay, let the inner handle validation
        return;
      }
    }
    // Thread not found — let the inner handle this error
  }

  /**
   * Check whether an agent is a member of the channel owning the given thread,
   * according to the overlay. Returns false if no overlay exists for the channel.
   */
  private isMemberViaOverlay(threadId: string, senderAgentId: string): boolean {
    const channels = this.inner.listChannels();
    for (const channel of channels) {
      const threads = this.inner.listThreads(channel.id);
      const thread = threads.find((t) => t.id === threadId);
      if (thread) {
        const overlay = this.memberOverlayStore.get(channel.id);
        return overlay ? overlay.has(senderAgentId) : false;
      }
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: AMBCollaborationService | undefined;

/**
 * Return the singleton AMBCollaborationService, creating it lazily with an
 * in-memory backing store.
 */
export function getCollaborationSvc(): AMBCollaborationService {
  if (!instance) {
    instance = new AMBCollaborationService(new InMemoryCollaborationService());
    logger.info('collaboration service initialised (in-memory)');
  }
  return instance;
}

/**
 * Initialise the singleton with a custom CollaborationService implementation
 * (e.g. PersistentCollaborationService). Must be called before any routes
 * access the service.
 */
export function initCollaborationSvc(service: CollaborationService): AMBCollaborationService {
  instance = new AMBCollaborationService(service);
  logger.info('collaboration service initialised (custom)');
  return instance;
}

/**
 * Reset the singleton. Primarily used in tests.
 */
export function resetCollaborationSvc(): void {
  instance = undefined;
}
