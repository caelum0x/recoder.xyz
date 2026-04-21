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
        'flex items-center bg-recoder-elements-background-depth-1 p-5 border-b h-[var(--header-height)]',
        {
          'border-transparent': !chat.started,
          'border-recoder-elements-borderColor': chat.started,
        },
      )}
    >
      <div className="flex items-center gap-2 z-logo text-recoder-elements-textPrimary">
        <a href="/" className="text-2xl font-semibold text-accent flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
          <img src="/logo.png" alt="Recoder" className="w-8 h-8 rounded" />
          <span className="text-base font-semibold text-recoder-elements-textPrimary hidden sm:inline">Recoder</span>
        </a>

        {/* History Toggle Button */}
        <div className="w-px h-4 bg-recoder-elements-borderColor/30 mx-1" />
        <button
          onClick={handleHistoryToggle}
          className="p-1.5 bg-transparent hover:bg-recoder-elements-background-depth-3 rounded-md transition-all text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary"
          title="Toggle Chat History"
          aria-label="Toggle chat history sidebar"
        >
          <div className="i-ph:clock-counter-clockwise text-lg" />
        </button>
        
        {/* Navigation Links */}
        <nav className="ml-4 hidden md:flex items-center gap-1">
          <a
            href="/projects"
            className="p-2 lg:px-3 lg:py-2 text-sm text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary transition-colors rounded-md hover:bg-recoder-elements-background-depth-2 flex items-center gap-1"
          >
            <div className="i-ph:folder text-sm" />
            <span className="hidden lg:inline">Projects</span>
          </a>
        </nav>
      </div>
      <span className="flex-1 px-4 truncate text-center text-recoder-elements-textPrimary hidden sm:block">
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
