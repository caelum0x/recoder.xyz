import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { UserMenu } from './UserMenu.client';

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
        
        <a href="/" className="text-2xl font-semibold text-accent flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
          <img src="/logo.png" alt="Recoder" className="w-8 h-8 rounded" />
          <span className="font-bold">Recoder</span>
        </a>
        
        {/* Projects Link */}
        <a 
          href="/projects" 
          className="ml-4 px-3 py-2 text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors rounded-md hover:bg-bolt-elements-background-depth-2 flex items-center gap-1"
        >
          <div className="i-ph:folder text-sm" />
          Projects
        </a>
      </div>
      <span className="flex-1 px-4 truncate text-center text-bolt-elements-textPrimary">
        <ClientOnly>{() => <ChatDescription />}</ClientOnly>
      </span>
      <div className="flex items-center gap-2">
        {chat.started && (
          <ClientOnly>
            {() => (
              <div className="mr-1">
                <HeaderActionButtons />
              </div>
            )}
          </ClientOnly>
        )}
        <ClientOnly>
          {() => <UserMenu />}
        </ClientOnly>
      </div>
    </header>
  );
}
