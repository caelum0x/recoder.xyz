import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';

export function Header() {
  const chat = useStore(chatStore);

  const handleHistoryToggle = () => {
    // Dispatch custom event to toggle history sidebar
    const event = new CustomEvent('toggle-history');
    window.dispatchEvent(event);
  };

  return (
    <header
      className={classNames(
        'flex items-center bg-bolt-elements-background-depth-1 p-5 border-b h-[var(--header-height)]',
        {
          'border-transparent': !chat.started,
          'border-bolt-elements-borderColor': chat.started,
        },
      )}
    >
      <div className="flex items-center gap-2 z-logo text-bolt-elements-textPrimary">
        {/* History Toggle Button - Black Square with White Icon */}
        <button
          onClick={handleHistoryToggle}
          className="p-2.5 bg-black hover:bg-gray-900 rounded-md transition-all"
          title="Toggle Chat History"
          aria-label="Toggle chat history sidebar"
        >
          <div className="i-ph:clock-clockwise text-xl text-white" />
        </button>
        
        <a href="/" className="text-2xl font-semibold text-accent flex items-center cursor-pointer hover:opacity-80 transition-opacity">
          <span className="font-bold">Recoder</span>
        </a>
      </div>
      <span className="flex-1 px-4 truncate text-center text-bolt-elements-textPrimary">
        <ClientOnly>{() => <ChatDescription />}</ClientOnly>
      </span>
      {chat.started && (
        <ClientOnly>
          {() => (
            <div className="mr-1">
              <HeaderActionButtons />
            </div>
          )}
        </ClientOnly>
      )}
    </header>
  );
}
