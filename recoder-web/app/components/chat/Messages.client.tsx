import type { Message } from 'ai';
import React, { useEffect, useRef } from 'react';
import { classNames } from '~/utils/classNames';
import { AssistantMessage } from './AssistantMessage';
import { UserMessage } from './UserMessage';
import { StreamingIndicator, InlineStreamingStatus } from './StreamingIndicator';
import { MessageActions } from './MessageActions';
import { useAuth } from '~/lib/contexts/AuthContext';

interface MessagesProps {
  id?: string;
  className?: string;
  isStreaming?: boolean;
  messages?: Message[];
  onRegenerate?: (messageIndex: number) => void;
}

/**
 * User Avatar component - Shows profile picture or fallback initials
 */
function UserAvatar({ name, image }: { name?: string | null; image?: string | null }) {
  // Generate initials from name (e.g., "John Doe" -> "JD")
  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  if (image) {
    return (
      <img
        src={image}
        alt={name || 'User'}
        className="w-[34px] h-[34px] rounded-full object-cover"
        onError={(e) => {
          // Fallback to initials if image fails to load
          e.currentTarget.style.display = 'none';
          e.currentTarget.nextElementSibling?.classList.remove('hidden');
        }}
      />
    );
  }

  return (
    <div className="flex items-center justify-center w-[34px] h-[34px] bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm font-medium rounded-full">
      {initials}
    </div>
  );
}

export const Messages = React.forwardRef<HTMLDivElement, MessagesProps>((props: MessagesProps, ref) => {
  const { id, isStreaming = false, messages = [], onRegenerate } = props;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  return (
    <div id={id} ref={ref} className={props.className} style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
      {messages.length > 0
        ? messages.map((message, index) => {
            const { role, content } = message;
            const isUserMessage = role === 'user';
            const isFirst = index === 0;
            const isLast = index === messages.length - 1;
            const isLastAssistantMessage = !isUserMessage && (
              index === messages.length - 1 ||
              !messages.slice(index + 1).some(m => m.role === 'assistant')
            );

            return (
              <div
                key={index}
                className={classNames('group flex gap-4 p-6 w-full rounded-[calc(0.75rem-1px)]', {
                  'bg-bolt-elements-messages-background': isUserMessage || !isStreaming || (isStreaming && !isLast),
                  'bg-gradient-to-b from-bolt-elements-messages-background from-30% to-transparent pointer-events-none':
                    isStreaming && isLast,
                  'mt-4': !isFirst,
                })}
              >
                {isUserMessage && (
                  <div className="shrink-0 self-start">
                    <UserAvatar name={user?.name} image={user?.image} />
                  </div>
                )}
                <div className="grid grid-col-1 w-full">
                  {isUserMessage ? <UserMessage content={content} /> : <AssistantMessage content={content} />}
                  {/* Message actions - show on hover */}
                  <MessageActions
                    content={content}
                    role={isUserMessage ? 'user' : 'assistant'}
                    onRegenerate={isLastAssistantMessage && onRegenerate ? () => onRegenerate(index) : undefined}
                    isStreaming={isStreaming && isLast}
                  />
                </div>
              </div>
            );
          })
        : null}
      {isStreaming && (
        <div className="mt-4 flex justify-center">
          <StreamingIndicator showDetails={true} />
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
});

Messages.displayName = 'Messages';
