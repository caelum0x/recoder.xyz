import { useStore } from '@nanostores/react';
import { useEffect } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { UserMenu } from './UserMenu.client';
import { openSettingsPanel, closeSettingsPanel, settingsPanelOpen } from '~/lib/stores/settings';
import { SettingsPanel } from '~/components/settings/SettingsPanel';
import { openShortcutsPanel, closeShortcutsPanel, shortcutsPanelOpen } from '~/lib/stores/keyboard-shortcuts';
import { KeyboardShortcutsPanel } from '~/components/ui/KeyboardShortcutsPanel';
import { AppSwitcher } from './AppSwitcher';

export function Header() {
  const chat = useStore(chatStore);
  const isSettingsOpen = useStore(settingsPanelOpen);
  const isShortcutsOpen = useStore(shortcutsPanelOpen);

  // Keyboard shortcuts for settings (Cmd+,) and shortcuts panel (Cmd+/ or Cmd+?)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+, or Ctrl+, to open settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        openSettingsPanel();
      }
      // Cmd+/ or Ctrl+/ to open keyboard shortcuts panel
      // Also handle Cmd+? (which is Shift+/) for "?" key
      if ((e.metaKey || e.ctrlKey) && (e.key === '/' || e.key === '?')) {
        e.preventDefault();
        openShortcutsPanel();
      }
      // Escape to close modals
      if (e.key === 'Escape') {
        if (isShortcutsOpen) {
          e.preventDefault();
          closeShortcutsPanel();
        } else if (isSettingsOpen) {
          e.preventDefault();
          closeSettingsPanel();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsOpen, isShortcutsOpen]);

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
        <a href="/" className="text-2xl font-semibold text-accent flex items-center cursor-pointer hover:opacity-80 transition-opacity">
          <img src="/logo.png" alt="Recoder" className="w-8 h-8 rounded" />
        </a>

        {/* History Toggle Button */}
        <button
          onClick={handleHistoryToggle}
          className="p-1.5 bg-transparent hover:bg-recoder-elements-background-depth-3 rounded-md transition-all text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary"
          title="Toggle Chat History"
          aria-label="Toggle chat history sidebar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" fill="currentColor"><path d="M136,80v43.47l36.12,21.67a8,8,0,0,1-8.24,13.72l-40-24A8,8,0,0,1,120,128V80a8,8,0,0,1,16,0Zm-8-48A95.44,95.44,0,0,0,60.08,60.15C52.81,67.51,46.35,74.59,40,82V64a8,8,0,0,0-16,0v40a8,8,0,0,0,8,8H72a8,8,0,0,0,0-16H49c7.15-8.42,14.27-16.35,22.39-24.57a80,80,0,1,1,1.66,114.75,8,8,0,1,0-11,11.64A96,96,0,1,0,128,32Z"/></svg>
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
        <AppSwitcher />
        {/* Settings Button */}
        <button
          onClick={openSettingsPanel}
          className="p-2 bg-transparent text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-3 rounded-md transition-colors"
          title="Settings (Cmd+,)"
          aria-label="Open settings"
        >
          <div className="i-ph:gear text-xl" />
        </button>
        <ClientOnly>
          {() => <UserMenu />}
        </ClientOnly>
      </div>
      {/* Settings Panel */}
      <ClientOnly>
        {() => <SettingsPanel />}
      </ClientOnly>
      {/* Keyboard Shortcuts Panel */}
      <ClientOnly>
        {() => <KeyboardShortcutsPanel />}
      </ClientOnly>
    </header>
  );
}
